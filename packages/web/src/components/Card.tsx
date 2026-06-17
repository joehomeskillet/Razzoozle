import clsx from "clsx"
import { type PropsWithChildren } from "react"
import { twMerge } from "tailwind-merge"

type Props = {
  className?: string
} & PropsWithChildren

const Card = ({ children, className }: Props) => (
  <div
    className={twMerge(
      clsx(
        "z-10 flex w-full max-w-80 flex-col rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5 shadow-[var(--shadow-flat)]",
        className,
      ),
    )}
  >
    {children}
  </div>
)

export default Card
