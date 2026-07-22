import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import {
  rowActionBase,
  rowActionDestructiveHover,
  rowActionGroupClass,
  rowActionHover,
  rowBodyFocusState,
  rowDisabledState,
  rowHoverState,
  rowLeadingClass,
  rowMetaClass,
  rowRestState,
  rowSelectedState,
  rowShellBase,
  rowShellDensity,
  rowTitleClass,
  type ListRowDensity,
} from "./rowStyles"

export type { ListRowDensity }

export interface ListRowAction {
  /** Stable key for React. */
  key: string
  icon: LucideIcon
  /** Required — icon-only buttons must be labelled (spec §6). */
  label: string
  onClick: () => void
  disabled?: boolean
  /** Optional tooltip; defaults to `label`. Use for disabled-reason hints. */
  title?: string
  /** Tints the control red for destructive actions (delete, etc.). */
  destructive?: boolean
  className?: string
  "aria-expanded"?: boolean
}

export interface ListRowProps {
  /** Primary line. */
  title: ReactNode
  /** Optional secondary meta line. */
  meta?: ReactNode
  /**
   * Optional selection control (e.g. a checkbox), rendered as the very first
   * item of the card's inner row — left of `leading`. Unlike `leading` this
   * slot is interactive, so it is never wrapped in `aria-hidden` (spec D27).
   * Pixel-neutral when unset.
   */
  selection?: ReactNode
  /** Optional leading icon/marker slot. */
  leading?: ReactNode
  /** Trailing icon-button cluster (each gets aria-label + focus ring). */
  actions?: ListRowAction[]
  /** Optional trailing overflow-menu trigger, rendered as the last item of the action cluster inside the card (spec D27). */
  overflow?: ReactNode
  /** Makes the whole row activatable (e.g. open). When set, the row body is a button. */
  onClick?: () => void
  /** Used as the row body's accessible name when `onClick` is set. */
  bodyLabel?: string
  /** Optional full-width second line inside the card (labels/assign row, spec D22c). */
  footer?: ReactNode
  details?: ReactNode
  density?: ListRowDensity
  hoverable?: boolean
  selected?: boolean
  expanded?: boolean
  disabled?: boolean
  className?: string
}

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
  selection,
  leading,
  actions,
  onClick,
  bodyLabel,
  footer,
  details,
  overflow,
  density = "default",
  hoverable = true,
  selected,
  expanded,
  disabled,
  className,
}: ListRowProps) => {
  const body = (
    <>
      {leading && (
        <span className={rowLeadingClass} aria-hidden>
          {leading}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={rowTitleClass}>{title}</span>
        {meta &&
          (typeof meta === "string" ? (
            <span className={clsx("truncate", rowMetaClass)}>{meta}</span>
          ) : (
            <span className={rowMetaClass}>{meta}</span>
          ))}
      </span>
    </>
  )

  return (
    <div
      className={clsx(
        "flex flex-col",
        rowShellBase,
        rowShellDensity[density],
        disabled
          ? clsx(rowRestState, rowDisabledState)
          : selected
            ? rowSelectedState
            : rowRestState,
        hoverable && !disabled && rowHoverState,
        className,
      )}
      data-state={expanded === undefined ? undefined : expanded ? "expanded" : "collapsed"}
    >
      <div className="flex min-h-11 items-center gap-3">
        {selection}
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            aria-label={bodyLabel}
            disabled={disabled}
            className={clsx(
              "-m-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-colors",
              rowBodyFocusState,
            )}
          >
            {body}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
        )}

        {((actions && actions.length > 0) || overflow) && (
          <div className={rowActionGroupClass}>
            {actions?.map(
              ({
                key,
                icon: Icon,
                label,
                onClick: act,
                disabled: actionDisabled,
                title,
                destructive,
                className: actionClassName,
                "aria-expanded": ariaExpanded,
              }) => (
                <Button
                  key={key}
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={act}
                  disabled={actionDisabled}
                  aria-label={title ?? label}
                  aria-expanded={ariaExpanded}
                  title={title ?? label}
                  className={clsx(
                    rowActionBase,
                    destructive ? rowActionDestructiveHover : rowActionHover,
                    actionClassName,
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </Button>
              ),
            )}
            {overflow}
          </div>
        )}
      </div>

      {footer && <div className="mt-3 w-full">{footer}</div>}
      {details && <div className="mt-3 w-full">{details}</div>}
    </div>
  )
}

export default ListRow
