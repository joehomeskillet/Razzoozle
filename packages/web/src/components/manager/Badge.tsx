import type { ReactNode } from "react"

interface BadgeProps {
  children: ReactNode
  className?: string
}

const Badge = ({ children, className }: BadgeProps) => {
  return (
    <span
      className={
        className ||
        "inline-flex items-center rounded-full bg-[var(--surface-4)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-muted)]"
      }
    >
      {children}
    </span>
  )
}

export default Badge
