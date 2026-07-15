import clsx from "clsx"
import type { LucideIcon } from "lucide-react"
import type { ButtonHTMLAttributes } from "react"

export interface NavItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** Lucide icon component (rendered filled-ish when active via stroke weight). */
  icon: LucideIcon
  /** Visible label (already translated by the caller). */
  label: string
  /** Optional count badge (e.g. moderation-queue size). Hidden when 0/undefined. */
  count?: number
  /** Active = the currently shown tab/section. */
  active?: boolean
  /**
   * Horizontal layout = top tab-bar (mobile). Vertical (default) = left rail.
   * Controls where the active accent marker sits (left-border vs underline).
   */
  orientation?: "vertical" | "horizontal"
}

/**
 * A single console-nav entry. Used by `ConsoleShell` inside a roving
 * `role="tablist"` — so it is a `role="tab"` and the parent owns arrow-key focus
 * management (this component only reflects state + fires onClick).
 *
 * Active treatment (spec §2/§3): accent left-border (rail) or underline (tabs) +
 * `--accent-tint` background + accent-colored, heavier-stroked icon.
 * Presentational only; all strings are passed in.
 */
const NavItem = ({
  icon: Icon,
  label,
  count,
  active = false,
  orientation = "vertical",
  className,
  ...buttonProps
}: NavItemProps) => {
  const hasBadge = typeof count === "number" && count > 0
  const isVertical = orientation === "vertical"

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      // Roving tabindex: only the active item is in the tab order; the parent
      // tablist moves focus with arrow keys.
      tabIndex={active ? 0 : -1}
      className={clsx(
        "group relative flex min-h-11 items-center gap-3 rounded-xl text-sm font-semibold transition-colors",
        "focus-visible:outline-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2",
        isVertical
          ? "w-full px-3 py-2.5 text-left"
          : "shrink-0 flex-col justify-center px-3 py-2 sm:flex-row",
        active
          ? "bg-[var(--accent-tint)] text-[var(--accent-contrast)]"
          : "text-[var(--ink-medium)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]",
        className,
      )}
      {...buttonProps}
    >
      {/* Active accent marker — left-border on the rail, underline on the tab-bar.
          Decorative (state is conveyed by aria-selected + color + weight). */}
      {active && (
        <span
          aria-hidden
          className={clsx(
            "absolute rounded-full bg-[var(--accent-contrast)]",
            isVertical
              ? "top-1.5 bottom-1.5 left-0 w-1"
              : "inset-x-2 bottom-0 h-0.5",
          )}
        />
      )}

      <Icon
        aria-hidden
        className={clsx(
          "size-5 shrink-0 transition-colors",
          active
            ? "text-[var(--accent-contrast)]"
            : "text-[var(--ink-faint)] group-hover:text-[var(--ink-medium)]",
        )}
        strokeWidth={active ? 2.6 : 2}
      />

      <span className={clsx("min-w-0 flex-1 truncate", !isVertical && "sm:flex-none")}>
        {label}
      </span>

      {/* aria-live so screen readers announce queue-count changes (spec §6).
          The region stays mounted permanently — when the count drops to 0 we
          hide the badge visually but keep the (now empty) live region so the
          transition to 0 is still announced; mounting/unmounting would not be. */}
      <span
        aria-live="polite"
        className={clsx(
          "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums",
          active
            ? "bg-[var(--accent-contrast)] text-white"
            : "bg-[var(--surface-4)] text-[var(--ink-muted)] group-hover:bg-gray-300",
          !isVertical && "absolute -top-0.5 -right-0.5 sm:static",
          !hasBadge && "sr-only",
        )}
      >
        {hasBadge ? count : ""}
      </span>
    </button>
  )
}

export default NavItem
