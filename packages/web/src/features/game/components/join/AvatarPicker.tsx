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
import { useRef, useState } from "react"
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
//
// The big preview always shows the player's CURRENT stored avatar (`selected`,
// seeded from player.avatar which is auto-assigned on join). No avatar is
// generated on mount — every user action (re-roll, style change, upload)
// generates and applies immediately via choose(), so preview === stored ===
// lobby at all times.
const AvatarPicker = ({ onDone }: Props) => {
  const { socket } = useSocket()
  const { player, setAvatar } = usePlayerStore()
  const username = player?.username ?? ""
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<string | undefined>(player?.avatar)
  const [uploading, setUploading] = useState(false)
  const [style, setStyle] = useState<AvatarStyle>(AVATAR_STYLES[0]!)
  const [seed, setSeed] = useState<string>(() => makeSeed(username, 0))
  // Disable the generate controls while an async generateAvatar() is in flight
  // so rapid taps don't race each other.
  const [generating, setGenerating] = useState(false)
  // Upload outcome surfaced to assistive tech via a live region (the toasts are
  // visual-only). Errors use role="alert" (assertive); successes role="status".
  const [status, setStatus] = useState<
    { tone: "error" | "success"; message: string } | undefined
  >(undefined)
  const rollCount = useRef(0)
  const { t } = useTranslation()

  const choose = (value: string) => {
    setSelected(value)
    setAvatar(value)
    // Typed socket maps SET_AVATAR payload to `unknown`; server validates.
    socket.emit(EVENTS.PLAYER.SET_AVATAR, { avatar: value })
    onDone?.()
  }

  // Generate a DiceBear avatar for (style, seed) and apply it immediately so the
  // lobby updates in real time. generateAvatar is async (the @dicebear libs are
  // dynamically imported / code-split), so we await before choosing.
  const applyGenerated = async (nextStyle: AvatarStyle, nextSeed: string) => {
    setGenerating(true)

    try {
      const uri = await generateAvatar(nextStyle, nextSeed)
      choose(uri)
    } finally {
      setGenerating(false)
    }
  }

  const reroll = () => {
    rollCount.current += 1
    const nextSeed = makeSeed(username, rollCount.current)
    setSeed(nextSeed)
    void applyGenerated(style, nextSeed)
  }

  const handleStyleChange = (nextStyle: AvatarStyle) => {
    setStyle(nextStyle)
    void applyGenerated(nextStyle, seed)
  }

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset the input so picking the same file again re-fires onChange.
    event.target.value = ""

    if (!file) {
      return
    }

    if (file.size > AVATAR_MAX_BYTES) {
      const message = t("game:avatar.tooLarge")
      setStatus({ tone: "error", message })
      toast.error(message)

      return
    }

    try {
      setUploading(true)
      const reader = new FileReader()

      reader.onload = () => {
        const result = reader.result

        if (typeof result === "string") {
          choose(result)
          const message = t("game:avatar.uploaded")
          setStatus({ tone: "success", message })
          toast.success(message)
        }

        setUploading(false)
      }

      reader.onerror = () => {
        const message = t("game:avatar.uploadFailed")
        setStatus({ tone: "error", message })
        toast.error(message)
        setUploading(false)
      }

      reader.readAsDataURL(file)
    } catch {
      const message = t("game:avatar.uploadFailed")
      setStatus({ tone: "error", message })
      toast.error(message)
      setUploading(false)
    }
  }

  return (
    <div className="glass-2 flex w-full flex-col items-center gap-4">
      <p className="text-lg font-bold text-gray-800">{t("game:avatar.title")}</p>

      {/* Generate mode: current-avatar preview + style segmented control +
          re-roll. The preview always reflects the applied (stored) avatar. */}
      <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white/40 p-4">
        <p className="text-sm font-semibold text-gray-600">
          {t("game:avatar.generate")}
        </p>

        <button
          type="button"
          aria-label={t("game:avatar.previewSelected")}
          aria-pressed={true}
          disabled={generating || !selected}
          onClick={() => selected && choose(selected)}
          className={clsx(
            "rounded-full outline-3 outline-offset-2 outline-[var(--color-primary)] transition",
          )}
        >
          <Avatar src={selected} name={username} size={96} />
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
              disabled={generating}
              onClick={() => handleStyleChange(value)}
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

        <Button
          variant="secondary"
          size="sm"
          disabled={generating}
          onClick={reroll}
        >
          {t("game:avatar.reroll")}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {/* Upload mode: own surface so the two ways to set an avatar read as
          distinct choices. */}
      <div className="flex w-full flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white/40 p-4">
        <p className="text-sm font-semibold text-gray-600">
          {t("game:avatar.uploadHeading")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? t("game:avatar.uploading") : t("game:avatar.upload")}
        </Button>
      </div>

      {/* AT announcement for upload outcomes (the toasts are visual-only). The
          role drives politeness, so no explicit aria-live is needed. */}
      <p
        role={status?.tone === "error" ? "alert" : "status"}
        className={clsx(
          "min-h-5 text-sm font-semibold",
          status?.tone === "error" ? "text-red-600" : "text-gray-600",
        )}
      >
        {status?.message ?? ""}
      </p>

      {onDone && (
        <Button variant="ghost" size="sm" onClick={() => onDone()}>
          {t("game:avatar.skip")}
        </Button>
      )}
    </div>
  )
}

export default AvatarPicker
