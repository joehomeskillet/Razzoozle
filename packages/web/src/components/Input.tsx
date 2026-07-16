import clsx from "clsx"
import React from "react"

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: "sm" | "md"
  ref?: React.Ref<HTMLInputElement>
}

const Input = ({
  className,
  type = "text",
  variant = "md",
  ref,
  ...otherProps
}: Props) => (
  <input
    ref={ref}
    type={type}
    className={clsx(
      // Use a real border (in-flow) not an outline: a full-width input's outline
      // bleeds past its box and gets clipped by an overflow-auto/hidden ancestor
      // (cut off at the left/right edge on mobile). border-box keeps the size.
      "rounded-lg border-2 border-[var(--border-hairline)] font-semibold focus-visible:border-[var(--color-primary)] focus-visible:outline-none",
      variant === "md" && "p-2 text-lg",
      variant === "sm" && "px-3 py-2 text-sm",
      className,
    )}
    {...otherProps}
  />
)

export default Input
