import { EVENTS } from "@razzoozle/common/constants"
import { STATUS } from "@razzoozle/common/types/game/status"
import Button from "@razzoozle/web/components/Button"
import Card from "@razzoozle/web/components/Card"
import Input from "@razzoozle/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { AVATAR_STYLES } from "@razzoozle/web/features/game/utils/dicebear"

import { useNavigate } from "@tanstack/react-router"
import { type KeyboardEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

const USERNAME_MAX_LENGTH = 20

const Username = () => {
  const { socket } = useSocket()
  const { gameId, login, setStatus, setAvatar } = usePlayerStore()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [error, setError] = useState(false)
  const [identifier, setIdentifier] = useState("")
  const [requireIdentifier, setRequireIdentifier] = useState(false)
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
    const style =
      AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)]!
    const seed =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${username}-${Date.now()}`
    const avatar = `dicebear:${style}:${seed}`

    setAvatar(avatar)
    socket.emit(EVENTS.PLAYER.LOGIN, {
      gameId,
      data: {
        username,
        avatar,
        ...(requireIdentifier && identifier.trim() ? { identifier: identifier.trim() } : {}),
      },
    })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleLogin()
    }
  }

  useEvent(EVENTS.GAME.SUCCESS_ROOM, (roomPayload) => {
    // Extract requireIdentifier from room payload (object or legacy string)
    const require = typeof roomPayload === "object" && roomPayload !== null && "requireIdentifier" in roomPayload
      ? roomPayload.requireIdentifier ?? false
      : false
    setRequireIdentifier(require)
  })

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
      {requireIdentifier && (
        <>
          <label htmlFor="identifier" className="sr-only">
            {t("game:join.identifier", { defaultValue: "Kennung (optional)" })}
          </label>
          <Input
            id="identifier"
            className="mt-2 text-center"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t("game:join.identifier", { defaultValue: "Kennung (optional)" })}
            autoComplete="off"
            aria-describedby="identifier-hint"
          />
          <p id="identifier-hint" className="mt-1 text-xs text-gray-500">
            {t("game:join.identifierHint", { defaultValue: "Optional for assignment tracking" })}
          </p>
        </>
      )}
      <Button className="mt-4" onClick={handleLogin}>
        {t("common:submit")}
      </Button>
    </Card>
  )
}

export default Username
