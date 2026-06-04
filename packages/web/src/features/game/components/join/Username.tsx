import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"

import { useNavigate } from "@tanstack/react-router"
import { type KeyboardEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

const USERNAME_MAX_LENGTH = 20

const Username = () => {
  const { socket } = useSocket()
  const { gameId, login, setStatus } = usePlayerStore()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()

  const handleLogin = () => {
    if (!gameId) {
      return
    }

    if (!username.trim()) {
      setError(true)
      inputRef.current?.focus()

      return
    }

    setError(false)
    socket.emit(EVENTS.PLAYER.LOGIN, { gameId, data: { username } })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleLogin()
    }
  }

  useEvent(EVENTS.GAME.SUCCESS_JOIN, (joinedGameId) => {
    setStatus(STATUS.WAIT, { text: "game:waitingForPlayers" })
    login(username)

    navigate({ to: "/party/$gameId", params: { gameId: joinedGameId } })
  })

  return (
    <Card>
      <label htmlFor="username" className="sr-only">
        {t("game:usernameLabel")}
      </label>
      <Input
        id="username"
        ref={inputRef}
        className="text-center"
        value={username}
        onChange={(e) => {
          setUsername(e.target.value)

          if (error) {
            setError(false)
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={t("game:usernamePlaceholder")}
        maxLength={USERNAME_MAX_LENGTH}
        autoComplete="nickname"
        autoCapitalize="words"
        aria-invalid={error}
        aria-describedby={error ? "username-error" : undefined}
      />
      {error && (
        <p
          id="username-error"
          className="mt-2 text-sm font-semibold text-red-600"
        >
          {t("game:usernameRequired")}
        </p>
      )}
      <Button className="mt-4" onClick={handleLogin}>
        {t("common:submit")}
      </Button>
    </Card>
  )
}

export default Username
