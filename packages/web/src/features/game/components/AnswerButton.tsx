import {
  answerColor,
  answerLabel,
} from "@razzia/web/features/game/utils/answers"
import clsx from "clsx"
import { Check, X } from "lucide-react"
import {
  Children,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
} from "react"

/**
 * Kahoot-style filled shape, mapped by answer color index (modulo-safe):
 * 0 = triangle, 1 = diamond (square rotated 45deg), 2 = circle, 3 = square.
 * Rendered as an inline SVG filled with `currentColor`, so it inherits the
 * tile's `var(--answer-text)` and stays legible on every answer color in both
 * the flat (Suedhang) and glass (Razzoozle) themes.
 */
const ShapeIcon = ({ colorIndex }: { colorIndex: number }) => {
  const shape = colorIndex % 4
  // viewBox 0 0 24 24, filled, slight inset so the shape reads as a solid badge.
  const path = (() => {
    switch (shape) {
      case 0: // triangle (point up)
        return <polygon points="12,3 22,21 2,21" />
      case 1: // diamond (square rotated 45deg)
        return <polygon points="12,2 22,12 12,22 2,12" />
      case 2: // circle
        return <circle cx="12" cy="12" r="10" />
      default: // 3: square
        return <rect x="3" y="3" width="18" height="18" rx="1.5" />
    }
  })()

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="size-4 drop-shadow-sm sm:size-5 md:size-6 lg:size-9"
    >
      {path}
    </svg>
  )
}

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

  // Build an accessible label that always includes the answer letter (when
  // known) plus the answer text, so the shape icon never carries meaning alone.
  const childText = Children.toArray(children)
    .filter((child) => typeof child === "string" || typeof child === "number")
    .join(" ")
    .trim()
  const ariaLabel =
    [resolvedLabel, childText].filter(Boolean).join(": ") || undefined

  return (
    <button
      aria-label={ariaLabel}
      className={clsx(
        "relative flex items-center gap-3 rounded-2xl px-3 py-3 text-left sm:py-5 lg:gap-6 lg:rounded-3xl lg:px-8 lg:py-10",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        colorIndex !== undefined && answerColor(colorIndex),
        className,
      )}
      {...otherProps}
    >
      {colorIndex !== undefined && (
        <span className="flex size-5 shrink-0 items-center justify-center sm:size-7 md:size-8 lg:size-14">
          <ShapeIcon colorIndex={colorIndex} />
        </span>
      )}
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
