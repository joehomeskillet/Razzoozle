import clsx from "clsx"
import type { ReactNode } from "react"

/**
 * SubmitButton — Unified submit button for all answer types.
 *
 * Press feedback is CSS-only (no framer-motion) to keep the hot path cheap
 * in 200-player MP rooms. Motion-reduce aware: disables transform on
 * prefers-reduced-motion users.
 */
interface Props {
  onClick: () => void
  disabled: boolean
  children: ReactNode
  testId?: string
}

const PRESS_FEEDBACK =
  "transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

export default function SubmitButton({
  onClick,
  disabled,
  children,
  testId,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={clsx(
        "bg-[var(--color-primary)] rounded-xl px-8 py-3 text-xl font-bold text-white disabled:opacity-50 lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
        PRESS_FEEDBACK,
      )}
    >
      {children}
    </button>
  )
}
