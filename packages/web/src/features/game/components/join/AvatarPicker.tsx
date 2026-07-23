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
import { Bot, Smile, ThumbsUp, UserRound } from "lucide-react"
import type { ReactNode } from "react"
import { useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  onDone?: () => void
}

// Compact style-bar icons (visual emphasis; labels stay in i18n for a11y).
const STYLE_ICONS: Record<AvatarStyle, ReactNode> = {
  bottts: <Bot className="size-5" aria-hidden="true" />,
  thumbs: <ThumbsUp className="size-5" aria-hidden="true" />,
  fun: <Smile className="size-5" aria-hidden="true" />,
  people: <UserRound className="size-5" aria-hidden="true" />,
}

// Preview must read clearly above the compact style bar (design: ≥128px).
const PREVIEW_SIZE = 144

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
// The big preview reads the avatar DIRECTLY from the player store (`selected =
// player?.avatar`) rather than keeping a private copy. The store is the single
// client-side source of truth: choose() writes it synchronously, and Wait.tsx's
// UPDATE_LEADERBOARD reconciler re-syncs it to the server's authoritative roster
// value when they drift. Deriving the preview from the store (instead of a local
// useState seeded once at mount) means the preview self-heals with that
// reconciliation, so preview === store === lobby roster at all times.
const AvatarPicker = ({ onDone }: Props) => {
  const { socket } = useSocket()
  const { player, setAvatar } = usePlayerStore()
  const username = player?.username ?? ""
  // Single source of truth — the stored avatar (auto-assigned on join, updated
  // by choose() / the lobby reconciler). No private copy to drift from it.
  const selected = player?.avatar
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  // Apply an avatar: persist it (the store is the single source of truth — the
  // preview reads straight from it) and broadcast to the server so the lobby
  // updates live. This deliberately does NOT close the picker — the player keeps
  // tweaking (style / re-roll / upload) until they explicitly tap "Fertig"
  // (onDone).
  const choose = (value: string) => {
    setAvatar(value)
    // Typed socket maps SET_AVATAR payload to `unknown`; server validates.
    socket.emit(EVENTS.PLAYER.SET_AVATAR, { avatar: value })
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
    <div className="flex w-full flex-col items-center gap-5">
      <p className="text-lg font-bold text-[var(--ink)]">
        {t("game:avatar.title")}
      </p>

      {/* Generator card: large preview → compact style segment → central re-roll */}
      <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5 shadow-[var(--shadow-flat)]">
        <button
          type="button"
          aria-label={t("game:avatar.previewSelected")}
          aria-pressed={true}
          disabled={generating || !selected}
          onClick={() => selected && choose(selected)}
          className={clsx(
            "rounded-full outline-3 outline-offset-2 outline-[var(--color-primary)] transition",
            "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-primary)]",
          )}
        >
          <Avatar src={selected} name={username} size={PREVIEW_SIZE} />
        </button>

        <div
          role="group"
          aria-label={t("game:avatar.styleLabel")}
          className="grid w-full grid-cols-4 gap-1.5"
        >
          {AVATAR_STYLES.map((value) => {
            const active = style === value

            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                disabled={generating}
                onClick={() => handleStyleChange(value)}
                className={clsx(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-[0.65rem] font-semibold leading-tight transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--border-hairline)] bg-[var(--surface-2)] text-[var(--ink-muted)] hover:bg-[var(--surface-3)]",
                )}
              >
                {STYLE_ICONS[value]}
                <span className="max-w-full truncate px-0.5">
                  {t(`game:avatar.style.${value}`)}
                </span>
              </button>
            )
          })}
        </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={generating}
          onClick={reroll}
          className="w-full max-w-xs"
        >
          {t("game:avatar.reroll")}
        </Button>
      </div>

      {/* Native file input: hidden, browser-owned, no color flash; trigger is tertiary */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={handleFile}
      />

      <button
        type="button"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        className={clsx(
          "min-h-11 text-sm font-semibold text-[var(--ink-medium)] underline-offset-2 transition-colors",
          "hover:text-[var(--ink)] hover:underline",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {uploading ? t("game:avatar.uploading") : t("game:avatar.upload")}
      </button>

      {/* AT announcement for upload outcomes (the toasts are visual-only). The
          role drives politeness, so no explicit aria-live is needed. */}
      <p
        role={status?.tone === "error" ? "alert" : "status"}
        className={clsx(
          "min-h-5 text-sm font-semibold",
          status?.tone === "error"
            ? "text-[var(--state-wrong)]"
            : "text-[var(--ink-medium)]",
        )}
      >
        {status?.message ?? ""}
      </p>

      {onDone && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => onDone()}
          className="w-full max-w-xs"
        >
          {t("game:avatar.done", { defaultValue: "Fertig" })}
        </Button>
      )}
    </div>
  )
}

export default AvatarPicker
