import clsx from "clsx"
import type { ReactNode } from "react"

interface FilterPillProps {
  active: boolean
  onClick: () => void
  children: ReactNode
  count?: number
}

const FilterPill = ({ active, onClick, children, count }: FilterPillProps) => {
  // Variant with count badge (ConfigSubmissions)
  if (count !== undefined) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={clsx(
          "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          active
            ? "bg-[var(--accent-tint)] text-[var(--accent-contrast)] outline-2 -outline-offset-2 outline-[var(--color-primary)]"
            : "bg-[var(--surface-3)] text-[var(--ink-medium)] hover:bg-[var(--surface-4)]",
        )}
      >
        {children}
        <span
          className={clsx(
            "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums",
            active ? "bg-[color:var(--color-field-ink)]/10 text-[color:var(--color-field-ink)]" : "bg-[var(--surface-4)] text-[var(--ink-medium)]",
          )}
        >
          {count}
        </span>
      </button>
    )
  }

  // Variant without count (ConfigCatalog scope pills)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex min-h-11 items-center rounded-full bg-[var(--accent-tint)] px-3 text-sm font-semibold text-[var(--accent-contrast)] outline-2 -outline-offset-2 outline-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          : "inline-flex min-h-11 items-center rounded-full bg-[var(--surface-3)] px-3 text-sm font-semibold text-[var(--ink-medium)] hover:bg-[var(--surface-4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
      }
    >
      {children}
    </button>
  )
}

export default FilterPill
