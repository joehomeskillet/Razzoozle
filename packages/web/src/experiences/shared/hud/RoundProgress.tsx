import { useTranslation } from "react-i18next"

export type RoundProgressVariant = "default" | "success" | "warning"

export interface RoundProgressProps {
  /** Progress in percent (0–100). Out-of-range / non-finite values are clamped. */
  value: number
  /** Visible label; falls back to the localized default ("Fortschritt"/"Progress"). */
  label?: string
  variant?: RoundProgressVariant
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

/** Stage tokens only (design.md §3 / §8·D) — no console tokens, no hex. */
const FILL_BY_VARIANT: Record<RoundProgressVariant, string> = {
  default: "bg-primary",
  success: "bg-state-correct",
  warning: "bg-accent",
}

/**
 * RoundProgress — HUD progress bar (Experience Kit, WP #908).
 *
 * Presentation-only: `value` arrives ready-made, no progress computation or
 * state management. The numeric value is ALWAYS rendered as text next to the
 * bar (never a visual-only bar). Accessible via role="progressbar" with
 * aria-valuenow/-min/-max.
 */
export const RoundProgress = ({
  value,
  label,
  variant = "default",
}: RoundProgressProps) => {
  const { t } = useTranslation("experience_hud")
  const safeValue = Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : 0
  const labelText = label ?? t("roundProgress.label")

  return (
    <div data-testid="hud-round-progress" className="w-full">
      <div className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-[var(--game-fg)]">
        <span>{labelText}</span>
        <span className="[font-variant-numeric:tabular-nums_slashed-zero]">
          {`${safeValue} ${t("roundProgress.unit")}`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={safeValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={labelText}
        className="h-3 w-full overflow-hidden rounded-full border border-[var(--border-hairline)] bg-[var(--surface)]"
      >
        <div
          className={`h-full rounded-full ${FILL_BY_VARIANT[variant]}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  )
}
