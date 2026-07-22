import clsx from "clsx"
import type { ReactNode } from "react"

interface FilterPillProps {
  active: boolean
  onClick: () => void
  children: ReactNode
  count?: number
  /** When set and active, replaces only the active color classes (bg/text). Outline/base/focus always stay. */
  activeClassName?: string
}

const filterPillBase =
  "inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]" // token-ok: toolbar-density-36

const FilterPill = ({ active, onClick, children, count, activeClassName }: FilterPillProps) => {
  const activeColors =
    activeClassName ?? "bg-[var(--accent-tint)] text-[var(--accent-contrast)]"

  const stateClasses = active
    ? clsx(activeColors, "outline-2 -outline-offset-2 outline-[var(--color-primary)]")
    : "bg-[var(--surface-3)] text-[var(--ink-medium)] hover:bg-[var(--surface-4)]"

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(filterPillBase, stateClasses)}
    >
      {children}
      {count !== undefined && (
        <span
          className={clsx(
            "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums",
            active ? "bg-[color:var(--color-field-ink)]/10 text-[color:var(--color-field-ink)]" : "bg-[var(--surface-4)] text-[var(--ink-medium)]",
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export default FilterPill
