import clsx from "clsx"
import { forwardRef } from "react"
import { useTranslation } from "react-i18next"
import {
  SettingRowRestartBadge,
  SettingRowStatusMessage,
  SettingRowDescription,
} from "./SettingRowMeta"

export interface ToggleFieldProps {
  /** Visible label text. */
  label: string
  /** Optional muted help text shown below the row. */
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Optional badge signal that the setting requires restart. */
  restartBadge?: boolean
  /** Optional i18n-ized label text for restart badge. If not provided, uses default i18n key. */
  restartBadgeLabel?: string
  /** Optional status message (validation error, success, pending save). */
  statusMessage?: {
    text: string
    tone: "success" | "error" | "pending"
  }
  /** Reason shown in tooltip/aria when disabled. */
  disabledReason?: string
  /** Row container ID for aria-describedby chaining. */
  id?: string
  /** Additional className for responsive width/padding. */
  className?: string
}

/**
 * A label + toggle-switch row.
 *
 * `role="switch"`, `aria-checked`, `≥44px` hit area, `focus-visible` ring.
 * Label sits left, toggle right. Optional description, restartBadge, statusMessage below.
 * Stacks below `sm`.
 *
 * Supports ARIA chaining via `id` prop for aria-labelledby/aria-describedby.
 * Supports forwardRef for focus restoration and scroll coordination.
 */
const ToggleField = forwardRef<HTMLDivElement, ToggleFieldProps>(
  (
    {
      label,
      description,
      checked,
      onChange,
      disabled,
      restartBadge,
      restartBadgeLabel,
      statusMessage,
      disabledReason,
      id,
      className,
    },
    ref
  ) => {
    const { t } = useTranslation("common")
    const titleId = id ? `${id}-title` : undefined
    const descId = id && description ? `${id}-desc` : undefined
    const statusId = id && statusMessage ? `${id}-status` : undefined
    const describedBy = clsx(descId, statusId)

    return (
      <div
        ref={ref}
        className={clsx("flex flex-col gap-1", className)}
        id={id}
        title={disabled && disabledReason ? disabledReason : undefined}
      >
        <div className="flex min-h-0 flex-col gap-2 sm:grid sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center sm:gap-4">
          <span
            id={titleId}
            className={clsx(
              "shrink-0 text-sm font-medium text-[var(--ink-muted)]",
              "flex flex-wrap items-start gap-2",
              disabled && "opacity-50"
            )}
          >
            {label}
            {restartBadge && (
              <SettingRowRestartBadge
                restartBadgeLabel={restartBadgeLabel}
                t={t}
              />
            )}
          </span>

          <div className={clsx("flex min-h-11 flex-1 items-center", disabled && "opacity-50")}>
            <button
              type="button"
              role="switch"
              aria-checked={checked}
              aria-labelledby={titleId}
              aria-describedby={describedBy || undefined}
              aria-invalid={statusMessage?.tone === "error"}
              disabled={disabled}
              onClick={() => onChange(!checked)}
              className={clsx(
                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full",
                "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                "disabled:cursor-wait",
                checked ? "bg-[var(--color-primary)]" : "bg-[var(--surface-5)]"
              )}
            >
              <span
                className={clsx(
                  "inline-block size-5 rounded-full bg-[var(--surface)] shadow transition-transform",
                  checked ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </div>

        {statusMessage && (
          <SettingRowStatusMessage
            statusMessage={statusMessage}
            statusId={statusId}
          />
        )}

        {description && (
          <SettingRowDescription
            description={description}
            descId={descId}
          />
        )}
      </div>
    )
  }
)

ToggleField.displayName = "ToggleField"
export default ToggleField
