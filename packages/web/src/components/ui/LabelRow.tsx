import clsx from "clsx"
import type { ReactNode } from "react"

export interface LabelRowProps {
  /** Visible label text. */
  label: string
  /** When provided, renders as `<label htmlFor>` for a11y. */
  htmlFor?: string
  /** Optional unit suffix rendered after the control (e.g. "Punkte", "ms"). */
  suffix?: string
  /** Optional help text shown in a muted line below the row. */
  description?: string
  /** The form control (input, select, …). */
  children: ReactNode
  className?: string
}

/**
 * A label + control row with a `min-h-11` (44px) hit area.
 *
 * Layout: label text left, control (children) right, `gap-4` (16px).
 * An optional `suffix` appears directly after the control.
 * An optional `description` appears in a muted line below the full row.
 * Stacks (label above control) below `sm`.
 */
const LabelRow = ({
  label,
  htmlFor,
  suffix,
  description,
  children,
  className,
}: LabelRowProps) => {
  const LabelTag = htmlFor ? "label" : "span"

  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <LabelTag
          {...(htmlFor ? { htmlFor } : {})}
          className={clsx(
            "min-h-11 shrink-0 text-sm font-medium text-gray-700 sm:w-40 sm:py-2.5",
            "flex items-center",
            htmlFor && "cursor-pointer",
          )}
        >
          {label}
        </LabelTag>

        <div className="flex min-h-11 flex-1 items-center gap-2">
          <div className="flex-1">{children}</div>
          {suffix && (
            <span className="shrink-0 text-sm text-gray-500">{suffix}</span>
          )}
        </div>
      </div>

      {description && (
        <p className="text-xs text-gray-500 sm:pl-44">{description}</p>
      )}
    </div>
  )
}

export default LabelRow
