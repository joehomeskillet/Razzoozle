import { AVATAR_MAX_BYTES, EVENTS } from "@razzoozle/common/constants"
import Avatar from "@razzoozle/web/components/Avatar"
import Button from "@razzoozle/web/components/Button"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import {
  AVATAR_STYLES,
  generateAvatar,
} from "@razzoozle/web/features/game/utils/dicebear"
import type { AvatarStyle } from "@razzoozle/web/features/game/utils/dicebear"
import clsx from "clsx"
import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  onDone?: () => void
}

// Fresh seed for a DiceBear re-roll. Prefers a UUID; falls back to a
// username/time/counter combo where crypto.randomUUID is unavailable.
const makeSeed = (username: string, counter: number): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${username}-${Date.now()}-${counter}`
}

// Lobby avatar picker: generate a DiceBear avatar (pick a style + re-roll a
// seed) or upload an image (converted to a size-capped data-URL). The selection
// is persisted to the player store and broadcast to the server via
// PLAYER.SET_AVATAR so the host roster / leaderboard / podium can render it.
const AvatarPicker = ({ onDone }: Props) => {
  const { socket } = useSocket()
  const { player, setAvatar } = usePlayerStore()
  const username = player?.username ?? ""
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<string | undefined>(player?.avatar)
  const [uploading, setUploading] = useState(false)
  const [style, setStyle] = useState<AvatarStyle>(AVATAR_STYLES[0]!)
  const [seed, setSeed] = useState<string>(() => makeSeed(username, 0))
  const rollCount = useRef(0)
  const { t } = useTranslation()

  // SVG data-URI for the current (style, seed) pair. generateAvatar is async
  // (the @dicebear libs are dynamically imported / code-split), so we recompute
  // it in an effect when style/seed change. While it is undefined the preview
  // falls back to the initials Avatar and the "use" actions are disabled.
  const [generated, setGenerated] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    generateAvatar(style, seed).then((uri) => {
      if (!cancelled) {
        setGenerated(uri)
      }
    })

    return () => {
      cancelled = true
    }
  }, [style, seed])

  const choose = (value: string) => {
    setSelected(value)
    setAvatar(value)
    // Typed socket maps SET_AVATAR payload to `unknown`; server validates.
    socket.emit(EVENTS.PLAYER.SET_AVATAR, { avatar: value })
    onDone?.()
  }

  const reroll = () => {
    rollCount.current += 1
    setSeed(makeSeed(username, rollCount.current))
  }

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset the input so picking the same file again re-fires onChange.
    event.target.value = ""

    if (!file) {
      return
    }

    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(t("game:avatar.upload"))

      return
    }

    try {
      setUploading(true)
      const reader = new FileReader()

      reader.onload = () => {
        const result = reader.result

        if (typeof result === "string") {
          choose(result)
          toast.success(t("game:avatar.uploaded"))
        }

        setUploading(false)
      }

      reader.onerror = () => {
        setUploading(false)
      }

      reader.readAsDataURL(file)
    } catch {
      setUploading(false)
    }
  }

  return (
    <div className="glass-2 flex w-full flex-col items-center gap-4">
      <p className="text-lg font-bold text-gray-800">{t("game:avatar.title")}</p>

      {/* Generate mode: live preview + style segmented control + re-roll. */}
      <div className="flex w-full flex-col items-center gap-3">
        <p className="text-sm font-semibold text-gray-600">
          {t("game:avatar.generate")}
        </p>

        <button
          type="button"
          aria-label={t("game:avatar.preview")}
          aria-pressed={selected === generated}
          disabled={!generated}
          onClick={() => generated && choose(generated)}
          className={clsx(
            "rounded-full transition",
            selected === generated
              ? "outline-3 outline-offset-2 outline-[var(--color-primary)]"
              : "outline-2 outline-offset-2 outline-transparent hover:outline-gray-300",
          )}
        >
          <Avatar src={generated} name={username} size={96} />
        </button>

        <div
          role="group"
          aria-label={t("game:avatar.styleLabel")}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {AVATAR_STYLES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={style === value}
              onClick={() => setStyle(value)}
              className={clsx(
                "min-h-11 rounded-lg border px-3 text-sm font-semibold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                style === value
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
              )}
            >
              {t(`game:avatar.style.${value}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={reroll}>
            {t("game:avatar.reroll")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!generated}
            onClick={() => generated && choose(generated)}
          >
            {t("game:avatar.useThis")}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex flex-col items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? t("game:avatar.uploading") : t("game:avatar.upload")}
        </Button>

        {onDone && (
          <Button variant="ghost" size="sm" onClick={() => onDone()}>
            {t("game:avatar.skip")}
          </Button>
        )}
      </div>
    </div>
  )
}

export default AvatarPicker
