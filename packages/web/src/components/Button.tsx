import clsx from "clsx"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"
import { twMerge } from "tailwind-merge"

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost"
export type ButtonSize = "sm" | "md" | "lg" | "icon"

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  PropsWithChildren & {
    variant?: ButtonVariant
    size?: ButtonSize
    classNameContent?: string
  }

/**
 * Shared base applied to every variant: consistent radius/shadow surface,
 * a single transition channel (colors), disabled affordances and a
 * visible focus-visible ring (2px, offset-2). Ring colour is overridden
 * per-variant so it always meets contrast against the button surface.
 */
const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60"

const variantClasses: Record<ButtonVariant, string> = {
  // Main CTA — keeps today's look. White text on the runtime-darkened accent
  // (--accent-contrast is computed to clear AA against white). White ring.
  primary:
    "bg-[var(--color-primary)] text-white shadow-[var(--shadow-flat)] hover:brightness-110 active:brightness-95 focus-visible:outline-[var(--color-primary)]",
  // Neutral actions — paper-white surface, gray border, gray-700 text (AA).
  // Ring uses the runtime accent so it reads against the light surface.
  secondary:
    "bg-white text-gray-700 border border-[var(--border-hairline)] shadow-sm " +
    "hover:bg-gray-50 active:bg-gray-100 " +
    "focus-visible:outline-[var(--color-primary)]",
  // Destructive — reject/delete. White text on red-600 (AA). White ring.
  danger:
    "bg-red-600 text-white shadow-sm " +
    "hover:bg-red-700 active:bg-red-800 " +
    "focus-visible:outline-white",
  // Subtle / tertiary — transparent until interaction. gray-600 text (AA on
  // light backgrounds). Ring uses the runtime accent.
  ghost:
    "bg-transparent text-gray-600 " +
    "hover:bg-gray-100 active:bg-gray-200 " +
    "focus-visible:outline-[var(--color-primary)]",
}

const sizeClasses: Record<ButtonSize, string> = {
  // Compact rows (~36px) — below 44px on purpose, for dense toolbars only.
  sm: "h-9 px-3 text-sm",
  // Default — 44px min touch target.
  md: "min-h-11 px-4 text-base",
  // Prominent — 48px min touch target.
  lg: "min-h-12 px-6 text-lg",
  // Icon-only — 44px square. Pair with an aria-label on the call site.
  icon: "size-11 p-0",
}

const Button = ({
  children,
  className,
  classNameContent,
  variant = "primary",
  size = "md",
  ...otherProps
}: Props) => (
  <button
    className={twMerge(
      clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className,
      ),
    )}
    {...otherProps}
  >
    <div
      className={twMerge(
        clsx("flex items-center justify-center gap-2", classNameContent),
      )}
    >
      {children}
    </div>
  </button>
)

export default Button
