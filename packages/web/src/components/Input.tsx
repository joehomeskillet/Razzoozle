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
      // Focus uses the design-system D7 outline (outline-2/offset-2/primary),
      // unified with every other control. ponytail: prior code used a border-only
      // focus because a full-width input's outline can be clipped by an
      // overflow-hidden ancestor on mobile edges — verify on narrow viewports; if
      // it clips, move this + the input primitives to a non-bleeding ring together.
      "rounded-lg border-2 border-[var(--border-hairline)] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
      variant === "md" && "p-2 text-lg",
      variant === "sm" && "px-3 py-2 text-sm",
      className,
    )}
    {...otherProps}
  />
)

export default Input
