import { EVENTS } from "@razzoozle/common/constants"
import Button from "@razzoozle/web/components/Button"
import Card from "@razzoozle/web/components/Card"
import Loader from "@razzoozle/web/components/Loader"
import PinInput from "@razzoozle/web/components/PinInput"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
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
      <h2 className="mb-3 text-xl font-bold text-[color:var(--color-field-ink)]">
        {t("game:pinLabel")}
      </h2>
      <PinInput value={invitation} onChange={setInvitation} />
      <Button
        className="mt-4 w-full"
        onClick={handleJoin}
        disabled={!canJoin}
        aria-busy={isJoining}
      >
        {isJoining && <Loader className="h-5 w-5" />}
        {t("common:submit")}
      </Button>

      {/* Public entry point to the question-submission page (standalone flow,
          so a plain anchor / full navigation is fine and keeps Cmd-click). */}
      <a
        href="/submit"
        className="text-primary focus-visible:ring-primary/40 mt-4 block rounded text-center text-sm font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        {t("submit:form.title")}
      </a>
    </Card>
  )
}

export default Room
