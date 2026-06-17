import {
  EVENTS,
  SOUND_DEFAULTS,
  SOUND_SLOTS,
  type SoundSlot,
} from "@razzoozle/common/constants"
import type { Theme } from "@razzoozle/common/types/theme"
import Button from "@razzoozle/web/components/Button"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { SectionCard } from "@razzoozle/web/features/manager/components/console"
import { LoaderCircle, Music, Play, RotateCcw, Upload } from "lucide-react"
import { useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Match the server's audio hard cap (saveSoundFile caps audio at 4 MB) so we
// reject oversized files client-side before pushing megabytes over the socket.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

// Accept the three audio container types the player code plays back.
const ACCEPT_AUDIO = "audio/mpeg,audio/wav,audio/ogg"

export interface SoundControlsProps {
  /** The live theme draft; `draft.sounds[slot]` is the per-slot override. */
  draft: Theme
  /** Immutably set a single slot's override (assetRef or null to reset). */
  onSlotChange: (_slot: SoundSlot, _value: string | null) => void
}

/**
 * Per-slot sound upload/test/reset list for the Design tab. Each of the 13
 * SOUND_SLOTS renders a row with: a human label, a default/custom state badge,
 * an upload control (File → dataURL → MANAGER.UPLOAD_SOUND), a test-play button
 * (plays the resolved url) and a reset button (clears the override → default).
 *
 * Bound to `draft.sounds` via the parent's draft-update path, so saving rides
 * the unchanged MANAGER.SET_THEME flow — no new save event. The server's
 * MANAGER.SOUND_UPLOADED ack updates the draft with the served assetRef (mirror
 * of how the background upload result feeds back into the draft).
 */
const SoundControls = ({ draft, onSlotChange }: SoundControlsProps) => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  // The single slot whose upload is currently in flight (one at a time).
  const [pendingSlot, setPendingSlot] = useState<SoundSlot | null>(null)
  // Slot-scoped upload error, surfaced inline next to the slot's controls.
  const [slotErrors, setSlotErrors] = useState<
    Partial<Record<SoundSlot, string>>
  >({})
  // A single shared <audio> so a new test-play stops the previous one.
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const setSlotError = (slot: SoundSlot, message: string | null) =>
    setSlotErrors((prev) => {
      if (message) {
        return { ...prev, [slot]: message }
      }

      // Drop the slot's error without a dynamic `delete`.
      return Object.fromEntries(
        Object.entries(prev).filter(([key]) => key !== slot),
      ) as Partial<Record<SoundSlot, string>>
    })

  // Server ack: the served assetRef replaces the slot's override in the draft.
  useEvent(EVENTS.MANAGER.SOUND_UPLOADED, ({ slot, assetRef }) => {
    setPendingSlot((current) => (current === slot ? null : current))
    setSlotError(slot, null)
    onSlotChange(slot, assetRef)
    toast.success(t("manager:theme.sounds.toast.uploaded"))
  })

  // Failure ack: the server emits THEME_ERROR (not SOUND_UPLOADED) on a rejected
  // upload, which would otherwise leave the slot spinner stuck forever. When a
  // sound upload is in flight, clear pendingSlot and surface the translated error
  // inline on that slot (the component's own error surface, mirroring the
  // size-guard / reader.onerror paths). ConfigTheme already toasts the raw
  // THEME_ERROR message, so we do NOT add a second toast here — avoiding a
  // double-toast. Reads pendingSlot directly: useEvent re-binds the handler each
  // render, so the closure sees the current value (same pattern as ConfigTheme).
  useEvent(EVENTS.MANAGER.THEME_ERROR, (message) => {
    if (pendingSlot) {
      setSlotError(pendingSlot, t(message))
      setPendingSlot(null)
    }
  })

  // File → dataURL → MANAGER.UPLOAD_SOUND { slot, dataUrl } (mirror of the
  // background handleUpload). A defensive size guard precedes the read.
  const handleUpload =
    (slot: SoundSlot) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Allow re-selecting the same file after an error.
      e.target.value = ""

      if (!file) {
        return
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        setSlotError(slot, t("errors:theme.imageTooLarge"))

        return
      }

      setSlotError(slot, null)
      setPendingSlot(slot)

      const reader = new FileReader()
      reader.onload = () => {
        socket.emit(EVENTS.MANAGER.UPLOAD_SOUND, {
          slot,
          dataUrl: reader.result as string,
        })
      }
      reader.onerror = () => {
        setSlotError(slot, t("errors:theme.uploadFailed"))
        setPendingSlot((current) => (current === slot ? null : current))
      }
      reader.readAsDataURL(file)
    }

  // Test-play the resolved url (override or bundled default). Reuses one Audio
  // element so a second click stops the first.
  const handleTest = (slot: SoundSlot) => () => {
    const url = draft.sounds[slot] ?? SOUND_DEFAULTS[slot]

    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio(url)
    audioRef.current = audio
    void audio.play().catch(() => {
      setSlotError(slot, t("errors:theme.uploadFailed"))
    })
  }

  return (
    <SectionCard
      icon={<Music className="size-5" />}
      title={t("manager:theme.sounds.title")}
      description={t("manager:theme.sounds.description", { defaultValue: "" })}
    >
      <ul className="flex flex-col gap-2">
        {SOUND_SLOTS.map((slot) => {
          const override = draft.sounds[slot]
          const uploading = pendingSlot === slot
          const error = slotErrors[slot]

          return (
            <li
              key={slot}
              className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 outline-1 -outline-offset-1 outline-gray-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-700">
                  {t(`manager:theme.sounds.slots.${slot}`)}
                </p>
                <p className="text-xs font-medium text-gray-500">
                  {override
                    ? t("manager:theme.sounds.custom")
                    : t("manager:theme.sounds.default")}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={handleTest(slot)}
                  aria-label={t("manager:theme.sounds.test")}
                  title={t("manager:theme.sounds.test")}
                >
                  <Play className="size-4" aria-hidden />
                  {t("manager:theme.sounds.test")}
                </Button>

                {/*
                  Button-look <label> + hidden input — mirrors AssetPreview's
                  upload surface with an AA focus ring; the native control
                  keeps a11y. min-h-11 = 44px touch target.
                */}
                <label
                  aria-disabled={uploading}
                  className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--accent-contrast)] px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-[1.05] active:brightness-[0.95] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white ${
                    uploading ? "cursor-not-allowed opacity-60" : ""
                  }`}
                >
                  {uploading ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="size-4" aria-hidden />
                  )}
                  {t("manager:theme.sounds.upload")}
                  <input
                    type="file"
                    accept={ACCEPT_AUDIO}
                    className="sr-only"
                    disabled={uploading}
                    aria-label={`${t("manager:theme.sounds.upload")} — ${t(
                      `manager:theme.sounds.slots.${slot}`,
                    )}`}
                    onChange={handleUpload(slot)}
                  />
                </label>

                {override && (
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => onSlotChange(slot, null)}
                    aria-label={t("manager:theme.sounds.reset")}
                    title={t("manager:theme.sounds.reset")}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    {t("manager:theme.sounds.reset")}
                  </Button>
                )}
              </div>

              {error && (
                <p
                  className="w-full text-sm font-semibold text-red-600"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

export default SoundControls
