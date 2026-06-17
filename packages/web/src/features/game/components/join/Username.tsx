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
import {
  AVATAR_STYLES,
  generateAvatar,
} from "@razzoozle/web/features/game/utils/dicebear"

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

    // Auto-assign a random DiceBear avatar the moment the player enters the
    // lobby, so the host roster shows a diverse avatar immediately — before they
    // ever open the picker. generateAvatar is async (the @dicebear libs are
    // code-split), so this is fire-and-forget and does NOT block navigation; the
    // avatar resolves a beat later. If the player later picks/uploads, that
    // overrides via the same SET_AVATAR path.
    const style =
      AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)]!
    const seed =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${username}-${Date.now()}`

    generateAvatar(style, seed).then((uri) => {
      setAvatar(uri)
      socket.emit(EVENTS.PLAYER.SET_AVATAR, { avatar: uri })
    })
  })

  return (
    <Card className="glass-2">
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
