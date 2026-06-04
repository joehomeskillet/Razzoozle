import clsx from "clsx"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

const ConfigTabButton = ({
  children,
  active,
  ...otherProps
}: ButtonHTMLAttributes<HTMLButtonElement> &
  PropsWithChildren & { active?: boolean }) => (
  <button
    type="button"
    role="tab"
    aria-selected={Boolean(active)}
    tabIndex={active ? 0 : -1}
    className={clsx(
      "flex-1 rounded-lg px-4 py-2 font-semibold text-gray-600 hover:bg-gray-200",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      active &&
        "bg-primary hover:bg-primary/90 text-white shadow-inner ring-2 ring-primary ring-inset",
    )}
    {...otherProps}
  >
    <div>{children}</div>
  </button>
)

export default ConfigTabButton
