import clsx from "clsx"
import type { ReactNode } from "react"

export interface SectionCardProps {
  /** Leading glyph, rendered inside an accent-tinted chip. */
  icon: ReactNode
  /** Section title (already translated). */
  title: string
  /** Optional one-line description under the title. */
  description?: string
  /** Optional right-aligned header slot (buttons, toggles, …). */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * A titled section card (spec §A1) — white panel, gray outline, header
 * (accent icon-chip + title + optional description + optional right-side
 * actions). Sunken `bg-[var(--surface-2)]` surfaces live inside via {@link SubGroup}.
 * Presentational; all strings/handlers are passed in.
 */
const SectionCard = ({
  icon,
  title,
  description,
  actions,
  children,
  className,
}: SectionCardProps) => (
  <section
    className={clsx(
      "space-y-4 rounded-2xl bg-white p-4 shadow-sm outline-2 -outline-offset-2 outline-[var(--line)]",
      className,
    )}
  >
    <div className="flex items-start gap-2.5">
      <span
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-tint)] text-[var(--accent-contrast)]"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-[var(--ink)]">{title}</h3>
        {description && <p className="text-sm text-[var(--ink-subtle)]">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
    {children}
  </section>
)

export default SectionCard
