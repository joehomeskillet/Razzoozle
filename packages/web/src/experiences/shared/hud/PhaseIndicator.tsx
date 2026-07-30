import { useTranslation } from "react-i18next"

export interface PhaseIndicatorProps {
  /** Current phase index (1-based display value, clamped to >= 0). */
  current: number
  /** Total number of phases (clamped to >= 0). */
  total: number
  /** Phase noun (e.g. "Runde"/"Round"); falls back to the localized default ("Frage"/"Question"). */
  label?: string
  /**
   * Structural content guard (WP-KIT-05): question/answer/player payloads
   * are `never` here, so TypeScript rejects them at compile time. Declared
   * inline per HUD primitive (no shared types file) to keep the module
   * count at exactly 7.
   */
  readonly question?: never
  readonly questions?: never
  readonly answer?: never
  readonly answers?: never
  readonly player?: never
  readonly players?: never
  readonly playerData?: never
}

/**
 * PhaseIndicator — HUD "Question 1 of 5" chip (Experience Kit, WP #908).
 *
 * Presentation-only: current/total arrive ready-made, no phase logic.
 * Text is always visible; the localized connector ("von"/"of") and the
 * default noun come from the experience_hud namespace.
 * Stage tokens only (design.md §3 surface-card recipe / §8·D).
 */
export const PhaseIndicator = ({
  current,
  total,
  label,
}: PhaseIndicatorProps) => {
  const { t } = useTranslation("experience_hud")
  const safeCurrent = Number.isFinite(current)
    ? Math.max(0, Math.floor(current))
    : 0
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  const nameText = label ?? t("phaseIndicator.defaultName")

  return (
    <div
      data-testid="hud-phase-indicator"
      className="inline-flex items-center gap-2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-2 text-[var(--game-fg)] shadow-[var(--shadow-flat)]"
    >
      <span className="text-sm font-medium">{nameText}</span>
      <span className="text-lg font-bold [font-variant-numeric:tabular-nums_slashed-zero]">
        {`${safeCurrent} ${t("phaseIndicator.of")} ${safeTotal}`}
      </span>
    </div>
  )
}
