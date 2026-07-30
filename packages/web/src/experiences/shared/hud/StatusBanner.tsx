import { useTranslation } from "react-i18next"

export type StatusBannerType = "info" | "success" | "warning" | "error"

export interface StatusBannerProps {
  /** Ready-made status message to announce. Empty string renders nothing. */
  message: string
  type: StatusBannerType
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
 * Left accent border per type — the §3 toast/overlay card recipe
 * (bg-white + hairline + border-l-4 + ink text). Stage tokens only (§8·D).
 */
const ACCENT_BY_TYPE: Record<StatusBannerType, string> = {
  info: "border-l-primary",
  success: "border-l-state-correct",
  warning: "border-l-accent",
  error: "border-l-state-wrong",
}

/** Static key literals (kept explicit so static i18n scanners resolve them). */
const TYPE_LABEL_KEY: Record<StatusBannerType, string> = {
  info: "statusBanner.type.info",
  success: "statusBanner.type.success",
  warning: "statusBanner.type.warning",
  error: "statusBanner.type.error",
}

/**
 * StatusBanner — accessible HUD status/notification banner (WP #908).
 *
 * role="status" + aria-live="polite": screen readers announce the message
 * without moving focus. Pure presentation — display/hide is conditional
 * rendering by the parent; this component never grabs focus, never manages
 * state, and unmounts cleanly (no timers, no effects).
 */
export const StatusBanner = ({ message, type }: StatusBannerProps) => {
  const { t } = useTranslation("experience_hud")

  if (message.length === 0) {
    return null
  }

  return (
    <div
      data-testid="hud-status-banner"
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-[var(--radius-theme)] border border-l-4 border-[var(--border-hairline)] ${ACCENT_BY_TYPE[type]} text-answer-text bg-white px-5 py-3 shadow-xl`}
    >
      <span className="text-sm font-semibold">{t(TYPE_LABEL_KEY[type])}</span>
      <span className="text-sm">{message}</span>
    </div>
  )
}
