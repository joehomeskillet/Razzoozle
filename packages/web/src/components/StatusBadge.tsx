import clsx from "clsx"
import type { PropsWithChildren } from "react"
import { twMerge } from "tailwind-merge"

export type StatusType = "online" | "offline" | "pending"

type Props = PropsWithChildren & {
  status: StatusType
  icon?: React.ReactNode
  className?: string
}

/**
 * Shared base applied to every status: consistent radius/padding, text styling,
 * and inline-flex layout for icon + text alignment.
 */
const baseClasses =
  "inline-flex items-center gap-2 rounded-lg px-3 py-1 text-sm font-semibold"

/**
 * Status-variant classes mapped from --status-* CSS tokens.
 * Each pair (bg + text) is WCAG AA verified (≥4.5:1 contrast).
 * Tokens are defined in features/manager/components/console/tokens.css.
 */
const statusClasses: Record<StatusType, string> = {
  online: "bg-[var(--status-online-bg)] text-[var(--status-online-text)]",
  offline: "bg-[var(--status-offline-bg)] text-[var(--status-offline-text)]",
  pending: "bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]",
}

export default function StatusBadge({
  status,
  icon,
  children,
  className,
}: Props) {
  return (
    <span
      className={twMerge(
        clsx(baseClasses, statusClasses[status], className),
      )}
    >
      {icon}
      {children}
    </span>
  )
}
