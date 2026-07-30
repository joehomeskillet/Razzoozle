import { useTranslation } from "react-i18next"

export type CountdownVariant = "default" | "warning" | "critical"

export interface CountdownDisplayProps {
  /** Seconds remaining. Non-finite / negative values clamp to 0 — 0 always renders as "0", never NaN/undefined. */
  seconds: number
  variant?: CountdownVariant
  /** Visible unit label; falls back to the localized default ("Sekunden"/"seconds"). */
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
 * Stage tokens only (design.md §3 / §8·D):
 * - warning -> --streak-color (dark amber, AA-legible on cream for large text)
 * - critical -> --timer-urgent (canonical timer urgency token, §3·B Timer)
 */
const TEXT_BY_VARIANT: Record<CountdownVariant, string> = {
  default: "text-[var(--game-fg)]",
  warning: "text-[var(--streak-color)]",
  critical: "text-[var(--timer-urgent)]",
}

/**
 * CountdownDisplay — HUD countdown timer (Experience Kit, WP #908).
 *
 * Presentation-only: `seconds` arrives ready-made — NO interval, NO tick
 * logic, NO state. The number is always rendered as text (plus label), never
 * color-only. role="timer" keeps assistive tech quiet on every tick while
 * still exposing the value on demand.
 */
export const CountdownDisplay = ({
  seconds,
  variant = "default",
  label,
}: CountdownDisplayProps) => {
  const { t } = useTranslation("experience_hud")
  const safeSeconds = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0
  const labelText = label ?? t("countdown.secondsLabel")

  return (
    <div
      data-testid="hud-countdown-display"
      role="timer"
      aria-label={t("countdown.ariaLabel", { count: safeSeconds })}
      className="inline-flex flex-col items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-2 shadow-[var(--shadow-flat)]"
    >
      <span
        className={`text-2xl leading-none font-bold [font-variant-numeric:tabular-nums_slashed-zero] ${TEXT_BY_VARIANT[variant]}`}
      >
        {safeSeconds}
      </span>
      <span className="text-xs font-medium text-[var(--game-fg)]">
        {labelText}
      </span>
    </div>
  )
}
