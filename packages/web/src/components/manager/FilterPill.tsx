import type { ReactNode } from "react"

interface FilterPillProps {
  active: boolean
  onClick: () => void
  children: ReactNode
}

const FilterPill = ({ active, onClick, children }: FilterPillProps) => (
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

export default FilterPill
