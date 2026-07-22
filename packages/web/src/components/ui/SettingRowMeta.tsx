import clsx from "clsx"
import { type ReactNode } from "react"
import Badge from "@razzoozle/web/components/manager/Badge"

/**
 * Maps tone to status message classname.
 * Centralizes tone → color mapping for consistency.
 */
export function toneToStatusClassName(
  tone: "success" | "error" | "pending"
): string {
  return clsx(
    "text-xs",
    tone === "error" && "text-[var(--state-wrong)]",
    tone === "success" && "text-[var(--state-correct)]",
    tone === "pending" && "text-[var(--ink-subtle)]"
  )
}

/**
 * SettingRowRestartBadge: Renders the restart-required badge.
 * Handles i18n fallback: restartBadgeLabel ?? t("restartRequired")
 */
export interface SettingRowRestartBadgeProps {
  /** Optional i18n-ized label text for restart badge. Falls back to i18n key if not provided. */
  restartBadgeLabel?: string
  /** i18n translation function (passed from parent's useTranslation hook). */
  t: (key: string) => string
}

export function SettingRowRestartBadge({
  restartBadgeLabel,
  t,
}: SettingRowRestartBadgeProps): ReactNode {
  const badgeLabel = restartBadgeLabel ?? t("restartRequired")
  return (
    <Badge className="shrink-0 whitespace-nowrap bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">
      {badgeLabel}
    </Badge>
  )
}

/**
 * SettingRowStatusMessage: Renders status message (error/success/pending).
 * Applies tone-based classname via centralized toneToStatusClassName.
 */
export interface SettingRowStatusMessageProps {
  statusMessage: {
    text: string
    tone: "success" | "error" | "pending"
  }
  statusId?: string
}

export function SettingRowStatusMessage({
  statusMessage,
  statusId,
}: SettingRowStatusMessageProps): ReactNode {
  return (
    <p
      id={statusId}
      className={toneToStatusClassName(statusMessage.tone)}
      role="status"
      aria-live="polite"
    >
      {statusMessage.text}
    </p>
  )
}

/**
 * SettingRowDescription: Renders optional description text below the control.
 * Centralized to enforce consistent styling across SettingRow variants.
 */
export interface SettingRowDescriptionProps {
  description: string
  descId?: string
  /** CSS class for left padding. Default: "sm:pl-60" */
  paddingClass?: string
}

export function SettingRowDescription({
  description,
  descId,
  paddingClass = "sm:pl-60",
}: SettingRowDescriptionProps): ReactNode {
  return (
    <p
      id={descId}
      className={clsx("text-xs text-[var(--ink-subtle)]", paddingClass)}
    >
      {description}
    </p>
  )
}
