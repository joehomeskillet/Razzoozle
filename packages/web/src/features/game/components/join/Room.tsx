import { EVENTS } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import Loader from "@razzia/web/components/Loader"
import PinInput from "@razzia/web/components/PinInput"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useSearch } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Must match the server-side invite-code validator (length 6) and the PinInput
// default length, so we only emit once a complete code is entered.
const PIN_LENGTH = 6
// How long to wait for SUCCESS_ROOM (or an error) before surfacing a timeout.
const JOIN_TIMEOUT_MS = 8000

const Room = () => {
  const { socket, isConnected } = useSocket()
  const { join } = usePlayerStore()
  const [invitation, setInvitation] = useState("")
  const [isJoining, setIsJoining] = useState(false)
  const { pin } = useSearch({ from: "/(auth)/" })
  const hasJoinedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { t } = useTranslation()

  const cleanPin = invitation.replace(/\s/gu, "")
  const canJoin = cleanPin.length === PIN_LENGTH && !isJoining

  const clearJoinTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const startJoin = useCallback(
    (code: string) => {
      setIsJoining(true)
      clearJoinTimeout()

      // Backstop: if neither SUCCESS_ROOM nor an error arrives, re-enable the
      // form and tell the player so they aren't stuck on a dead spinner.
      timeoutRef.current = setTimeout(() => {
        setIsJoining(false)
        timeoutRef.current = null
        toast.error(t("game:joinTimeout"))
      }, JOIN_TIMEOUT_MS)

      socket.emit(EVENTS.PLAYER.JOIN, code)
    },
    [clearJoinTimeout, socket, t],
  )

  const handleJoin = () => {
    if (cleanPin.length !== PIN_LENGTH || isJoining) {
      return
    }

    startJoin(cleanPin)
  }

  useEvent(EVENTS.GAME.SUCCESS_ROOM, (gameId) => {
    clearJoinTimeout()
    setIsJoining(false)
    join(gameId)
  })

  // The auth page surfaces game:errorMessage as a toast; here we just unwind the
  // in-flight state so the player can correct the code and retry.
  useEvent(EVENTS.GAME.ERROR_MESSAGE, () => {
    clearJoinTimeout()
    setIsJoining(false)
  })

  useEffect(() => {
    if (!isConnected || !pin || hasJoinedRef.current) {
      return
    }

    hasJoinedRef.current = true
    startJoin(pin.replace(/\s/gu, ""))
  }, [pin, isConnected, startJoin])

  useEffect(() => clearJoinTimeout, [clearJoinTimeout])

  return (
    <Card>
      <p className="mb-2 text-lg font-semibold">{t("game:pinLabel")}</p>
      <PinInput value={invitation} onChange={setInvitation} />
      <Button
        className="mt-4"
        onClick={handleJoin}
        disabled={!canJoin}
        aria-busy={isJoining}
      >
        {isJoining && <Loader className="h-5 w-5" />}
        {t("common:submit")}
      </Button>
    </Card>
  )
}

export default Room
