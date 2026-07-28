import clsx from "clsx"
import { Music, Play, Square } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export interface MusicPreset {
  id: string
  title: string
  genre: string
  audioUrl?: string
}

export const DEFAULT_MUSIC_PRESETS: MusicPreset[] = [
  { id: "funk", title: "Funky Lobby", genre: "Funk / Groovy" },
  { id: "disco", title: "Retro Disco", genre: "70s Disco" },
  { id: "synthwave", title: "Neon Nights", genre: "Synthwave" },
  { id: "chill", title: "Lo-Fi Beats", genre: "Chillout" },
  { id: "halloween", title: "Spooky Groove", genre: "Event Special" },
]

export interface LobbyMusicSelectorProps {
  selectedPresetId?: string
  onChange: (presetId: string) => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export function LobbyMusicSelector({
  selectedPresetId = "funk",
  onChange,
  disabled = false,
  testIdPrefix = "",
  className,
}: LobbyMusicSelectorProps) {
  const { t } = useTranslation()
  const [playingId, setPlayingId] = useState<string | null>(null)

  const togglePreview = (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    setPlayingId((prev) => (prev === presetId ? null : presetId))
  }

  return (
    <div
      className={clsx(
        "flex w-full flex-col gap-4 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}lobby-music-selector`}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-4">
        <Music className="h-5 w-5 text-[var(--color-primary)]" />
        <h3 className="text-xl font-bold text-[var(--ink)]">
          {t("manager:music.title", { defaultValue: "Lobby-Musik auswählen" })}
        </h3>
      </div>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3"
        data-testid={`${testIdPrefix}music-presets-grid`}
      >
        {DEFAULT_MUSIC_PRESETS.map((preset) => {
          const isSelected = selectedPresetId === preset.id
          const isPlaying = playingId === preset.id

          return (
            <div
              key={preset.id}
              onClick={() => !disabled && onChange(preset.id)}
              className={clsx(
                "flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all",
                isSelected
                  ? "border-[var(--color-primary)] bg-accent-tint/10 ring-2 ring-[var(--color-primary)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)]",
                disabled && "cursor-not-allowed opacity-60",
              )}
              data-testid={`${testIdPrefix}music-preset-${preset.id}`}
              role="button"
              aria-selected={isSelected}
            >
              <div className="space-y-0.5">
                <h4 className="text-base font-bold text-[var(--ink)]">
                  {preset.title}
                </h4>
                <p className="text-xs font-semibold text-[var(--ink-muted)]">
                  {preset.genre}
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => togglePreview(preset.id, e)}
                disabled={disabled}
                className={clsx(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95",
                  isPlaying
                    ? "bg-[var(--color-primary)] text-white" // token-ok: white-on-primary, AA per design.md §8·B D6
                    : "bg-[var(--surface-3)] text-[var(--ink)] hover:bg-[var(--surface-4)]",
                )}
                data-testid={`${testIdPrefix}music-preview-${preset.id}`}
                aria-label={t("manager:music.previewAria", {
                  defaultValue: "Vorschau {{title}}",
                  title: preset.title,
                })}
              >
                {isPlaying ? (
                  <Square className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
