import {
  answerColor,
  answerLabel,
} from "@razzoozle/web/features/game/utils/answers"
import clsx from "clsx"
import { Check, X } from "lucide-react"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

type Props = PropsWithChildren &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /**
     * Answer index. When provided, the swatch label (A/B/C/D) and the answer
     * color class are derived from it via answerColor/answerLabel (modulo-safe),
     * keeping every answer surface consistent. `label`/`className` still take
     * precedence so existing call sites that pass them stay unchanged.
     */
    colorIndex?: number
    label?: string
    correct?: boolean
  }

const AnswerButton = ({
  className,
  label,
  colorIndex,
  children,
  correct,
  ...otherProps
}: Props) => {
  const CorrectIcon = correct ? Check : X
  const resolvedLabel =
    label ?? (colorIndex !== undefined ? answerLabel(colorIndex) : undefined)

  return (
    <button
      className={clsx(
        "glass-interactive relative flex items-center gap-3 rounded-2xl px-3 py-3 text-left sm:py-5 lg:gap-6 lg:rounded-3xl lg:px-8 lg:py-10",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        colorIndex !== undefined && answerColor(colorIndex),
        className,
      )}
      {...otherProps}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-black/20 text-sm font-bold sm:size-7 sm:rounded-md md:size-8 md:text-base lg:size-14 lg:text-3xl">
        {resolvedLabel}
      </span>
      <p className="w-full flex-1 text-sm break-words drop-shadow-md md:text-lg lg:text-[clamp(1.25rem,2.8vh,2.5rem)]">
        {children}
      </p>
      {correct !== undefined && (
        <CorrectIcon className="size-4 stroke-6 md:size-6 lg:size-10" />
      )}
    </button>
  )
}

export default AnswerButton
