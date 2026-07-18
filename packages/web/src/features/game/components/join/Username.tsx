import { EVENTS } from "@razzoozle/common/constants"
import { STATUS } from "@razzoozle/common/types/game/status"
import type { RosterEntry } from "@razzoozle/common/types/game/socket"
import Button from "@razzoozle/web/components/Button"
import Card from "@razzoozle/web/components/Card"
import Input from "@razzoozle/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { AVATAR_STYLES } from "@razzoozle/web/features/game/utils/dicebear"
import EmojiPinInput from "./EmojiPinInput"
import PlayerNameSelect from "./PlayerNameSelect"

import { useNavigate } from "@tanstack/react-router"
import { type KeyboardEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

const USERNAME_MAX_LENGTH = 20

const Username = () => {
  const { socket } = useSocket()
  const { gameId, login, setStatus, setAvatar } = usePlayerStore()
  const navigate = useNavigate()

  // Free-text flow state
  const [username, setUsername] = useState("")
  const [error, setError] = useState(false)
  const [identifier, setIdentifier] = useState("")
  const [requireIdentifier, setRequireIdentifier] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Class-mode flow state
  const [klassen, setKlassen] = useState(false)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [emojiPin, setEmojiPin] = useState<string[]>(["", "", "", ""])
  const [klassError, setKlassError] = useState("")

  const { t } = useTranslation()

  const handleLoginFreeText = () => {
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

  const handleLoginClassMode = () => {
    if (!gameId || selectedStudentId === null || emojiPin.some((e) => !e)) {
      return
    }

    // Find selected student to get display name
    const selectedStudent = roster.find((s) => s.studentId === selectedStudentId)
    if (!selectedStudent) {
      return
    }

    const style =
      AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)]!
    const seed =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${selectedStudent.displayName}-${Date.now()}`
    const avatar = `dicebear:${style}:${seed}`

    setAvatar(avatar)
    socket.emit(EVENTS.PLAYER.LOGIN, {
      gameId,
      data: {
        username: selectedStudent.displayName,
        studentId: selectedStudentId,
        emojiPin,
        avatar,
      },
    })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      if (klassen) {
        handleLoginClassMode()
      } else {
        handleLoginFreeText()
      }
    }
  }

  useEvent(EVENTS.GAME.SUCCESS_ROOM, (roomPayload) => {
    // Extract klassen and roster
    const isKlassen =
      typeof roomPayload === "object" &&
      roomPayload !== null &&
      "klassen" in roomPayload
        ? roomPayload.klassen ?? false
        : false

    const rosterData =
      typeof roomPayload === "object" &&
      roomPayload !== null &&
      "roster" in roomPayload &&
      Array.isArray(roomPayload.roster)
        ? roomPayload.roster
        : []

    setKlassen(isKlassen)
    if (isKlassen) {
      setRoster(rosterData)
      // Clear any previous errors when reconnecting
      setKlassError("")
    }

    // For free-text flow, extract requireIdentifier (backward compat)
    if (!isKlassen) {
      const require =
        typeof roomPayload === "object" &&
        roomPayload !== null &&
        "requireIdentifier" in roomPayload
          ? roomPayload.requireIdentifier ?? false
          : false
      setRequireIdentifier(require)
    }
  })

  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message: string) => {
    if (klassen) {
      // For class mode, show the non-specific error message
      // A7: Keep name and PIN prefilled on retry
      setKlassError(
        t("game:classJoin.error", {
          defaultValue: "Name oder PIN stimmen nicht — versuch es nochmal",
        })
      )
    } else {
      // For free-text mode, show generic error
      setError(true)
    }
  })

  useEvent(EVENTS.GAME.SUCCESS_JOIN, (payload) => {
    if (payload.playerToken) {
      localStorage.setItem(`player_token:${payload.gameId}`, payload.playerToken)
    }
    setStatus(STATUS.WAIT, { text: "game:waitingForPlayers" })
    login(klassen ? roster.find((s) => s.studentId === selectedStudentId)?.displayName || "" : username)

    navigate({ to: "/party/$gameId", params: { gameId: payload.gameId } })
  })

  // Class-mode flow
  if (klassen && roster.length > 0) {
    return (
      <Card>
        <div className="space-y-4">
          {/* Heading */}
          <div>
            <h2 className="text-lg font-bold text-[color:var(--color-field-ink)]">
              {t("game:classJoin.heading", {
                defaultValue: "Select your name to join",
              })}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {t("game:classJoin.subheading", {
                defaultValue: "Find yourself in the class list",
              })}
            </p>
          </div>

          {/* Player name select */}
          <div>
            <label htmlFor="student-search" className="sr-only">
              {t("game:classJoin.selectName", { defaultValue: "Select your name" })}
            </label>
            <PlayerNameSelect
              roster={roster}
              value={selectedStudentId}
              onChange={setSelectedStudentId}
              disabled={false}
            />
          </div>

          {/* Emoji PIN input */}
          {selectedStudentId !== null && (
            <div>
              <EmojiPinInput
                value={emojiPin}
                onChange={setEmojiPin}
                error={klassError ? klassError : undefined}
                disabled={false}
              />
            </div>
          )}

          {/* Error message - aria live for screen readers */}
          {klassError && (
            <div
              role="alert"
              aria-live="polite"
              className="mt-2 rounded-lg bg-red-50 p-3 text-sm font-medium text-[var(--state-wrong)]"
            >
              {klassError}
            </div>
          )}

          {/* Submit button */}
          <Button
            data-testid="class-join-submit"
            className="mt-6 w-full"
            onClick={handleLoginClassMode}
            disabled={selectedStudentId === null || emojiPin.some((e) => !e)}
            variant="primary"
          >
            {selectedStudentId !== null
              ? t("game:classJoin.submitAs", {
                  defaultValue: "Join as {{name}}",
                  name: roster.find((s) => s.studentId === selectedStudentId)
                    ?.displayName || "",
                })
              : t("game:classJoin.submit", { defaultValue: "Join" })}
          </Button>
        </div>
      </Card>
    )
  }

  // Free-text flow (original)
  return (
    <Card>
      <label htmlFor="username" className="sr-only">
        {t("game:usernameLabel")}
      </label>
      <Input
        data-testid="username-input"
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
      <Button data-testid="join-submit" className="mt-4" onClick={handleLoginFreeText}>
        {t("common:submit")}
      </Button>
    </Card>
  )
}

export default Username
