import Button from "@razzia/web/components/Button"
import clsx from "clsx"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export interface ListRowAction {
  /** Stable key for React. */
  key: string
  icon: LucideIcon
  /** Required — icon-only buttons must be labelled (spec §6). */
  label: string
  onClick: () => void
  disabled?: boolean
  /** Tints the control red for destructive actions (delete, etc.). */
  destructive?: boolean
}

export interface ListRowProps {
  /** Primary line. */
  title: ReactNode
  /** Optional secondary meta line. */
  meta?: ReactNode
  /** Optional leading icon/marker slot. */
  leading?: ReactNode
  /** Trailing icon-button cluster (each gets aria-label + focus ring). */
  actions?: ListRowAction[]
  /** Makes the whole row activatable (e.g. open). When set, the row body is a button. */
  onClick?: () => void
  /** Used as the row body's accessible name when `onClick` is set. */
  bodyLabel?: string
  className?: string
}

// Row actions use the shared ghost icon button. The only per-state override is
// the colour channel: a muted gray-400 idle (calmer than ghost's gray-600) plus
// a red destructive hover for delete-style actions — spacing/state only, never
// a re-skin of the variant's surface/radius/focus.
const actionClasses = (destructive?: boolean) =>
  clsx(
    "shrink-0 text-gray-400",
    destructive
      ? "hover:bg-red-50 hover:text-red-600"
      : "hover:bg-gray-100 hover:text-gray-700",
  )

/**
 * A uniform content row (spec §4.4) for the Quizze / Ergebnisse lists — ONE
 * height/padding for every tab (kills the per-tab drift). Title + meta on the
 * left, an icon-action cluster on the right. Every icon button carries an
 * `aria-label` and a focus ring; touch targets are 44px (`size-11`).
 *
 * Presentational; all handlers + strings are passed in.
 */
const ListRow = ({
  title,
  meta,
  leading,
  actions,
  onClick,
  bodyLabel,
  className,
}: ListRowProps) => {
  const body = (
    <>
      {leading && (
        <span className="flex shrink-0 items-center text-gray-400" aria-hidden>
          {leading}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-gray-900">{title}</span>
        {meta &&
          (typeof meta === "string" ? (
            <span className="truncate text-sm text-gray-500">{meta}</span>
          ) : (
            <span className="text-sm text-gray-500">{meta}</span>
          ))}
      </span>
    </>
  )

  return (
    <div
      className={clsx(
        "flex min-h-11 items-center gap-3 rounded-xl bg-white p-4 outline-2 -outline-offset-2 outline-gray-200",
        className,
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={bodyLabel}
          className={clsx(
            "-m-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-gray-50",
            "focus-visible:outline-[var(--color-primary)] focus-visible:outline-2 focus-visible:-outline-offset-2",
          )}
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}

      {actions && actions.length > 0 && (
        <div className="flex shrink-0 items-center gap-1">
          {actions.map(
            ({ key, icon: Icon, label, onClick: act, disabled, destructive }) => (
              <Button
                key={key}
                variant="ghost"
                size="icon"
                type="button"
                onClick={act}
                disabled={disabled}
                aria-label={label}
                title={label}
                className={actionClasses(destructive)}
              >
                <Icon className="size-5" aria-hidden />
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export default ListRow
