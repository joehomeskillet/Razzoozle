import { useTranslation } from "react-i18next"

export type AnswerCounterVariant = "default" | "success" | "warning"

export interface AnswerCounterProps {
  /** Number of answers already given (clamped to >= 0). */
  answered: number
  /** Total number of expected answers (clamped to >= 0). */
  total: number
  variant?: AnswerCounterVariant
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

/** Decorative status dot (aria-hidden) — the text always carries the info. */
const DOT_BY_VARIANT: Record<AnswerCounterVariant, string> = {
  default: "bg-primary",
  success: "bg-state-correct",
  warning: "bg-accent",
}

/**
 * AnswerCounter — HUD "3/5 answered" chip (Experience Kit, WP #908).
 *
 * Presentation-only: counts arrive ready-made. Always visible as text
 * ("answered/total" + localized suffix) — no visual-only representation.
 * Stage tokens only (design.md §3 surface-card recipe / §8·D).
 */
export const AnswerCounter = ({
  answered,
  total,
  variant = "default",
}: AnswerCounterProps) => {
  const { t } = useTranslation("experience_hud")
  const safeAnswered = Number.isFinite(answered)
    ? Math.max(0, Math.floor(answered))
    : 0
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0

  return (
    <div
      data-testid="hud-answer-counter"
      className="inline-flex items-center gap-2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-2 text-[var(--game-fg)] shadow-[var(--shadow-flat)]"
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${DOT_BY_VARIANT[variant]}`}
      />
      <span className="text-lg font-bold [font-variant-numeric:tabular-nums_slashed-zero]">
        {`${safeAnswered}/${safeTotal}`}
      </span>
      <span className="text-sm">{t("answerCounter.suffix")}</span>
    </div>
  )
}
