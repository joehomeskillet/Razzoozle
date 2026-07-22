import clsx from "clsx"
import { forwardRef, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  SettingRowRestartBadge,
  SettingRowStatusMessage,
  SettingRowDescription,
} from "./SettingRowMeta"

export interface LabelRowProps {
  /** Visible label text. */
  label: string
  /** When provided, renders as `<label htmlFor>` for a11y. */
  htmlFor?: string
  /** Optional help text shown in a muted line below the row. */
  description?: string
  /** The form control (input, select, …). */
  children: ReactNode
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
  /** Disable the control row. */
  disabled?: boolean
}

/**
 * A label + control row with a `min-h-11` (44px) hit area.
 *
 * Layout: label text left, control (children) right, `gap-4` (16px).
 * Optional `description`, `restartBadge`, and `statusMessage` below the control.
 * Stacks (label above control) below `sm`.
 *
 * Supports ARIA chaining via `id` prop for aria-labelledby/aria-describedby.
 * Supports forwardRef for focus restoration and scroll coordination.
 */
const LabelRow = forwardRef<HTMLDivElement, LabelRowProps>(
  (
    {
      label,
      htmlFor,
      description,
      children,
      restartBadge,
      restartBadgeLabel,
      statusMessage,
      disabledReason,
      id,
      className,
      disabled,
    },
    ref
  ) => {
    const { t } = useTranslation("common")
    const LabelTag = htmlFor ? "label" : "span"
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <LabelTag
            {...(htmlFor ? { htmlFor } : {})}
            id={titleId}
            className={clsx(
              "min-h-11 shrink-0 text-sm font-medium text-[var(--ink-muted)] sm:max-w-60 sm:py-2.5",
              "flex flex-wrap items-start gap-2",
              htmlFor && "cursor-pointer",
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
          </LabelTag>

          <div
            className={clsx(
              "flex min-h-11 flex-1 items-center gap-2",
              disabled && "opacity-50"
            )}
            aria-describedby={describedBy || undefined}
          >
            <div className="flex-1">{children}</div>
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

LabelRow.displayName = "LabelRow"
export default LabelRow
