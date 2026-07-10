import clsx from "clsx"
import {
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react"
import { useTranslation } from "react-i18next"

interface Props {
  value: string
  onChange: (_value: string) => void
  length?: number
  className?: string
  "data-testid"?: string
}

const PinInput = ({
  value,
  onChange,
  length = 6,
  className,
  "data-testid": dataTestId,
}: Props) => {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const { t } = useTranslation()

  const padded = value.padEnd(length, " ").slice(0, length)
  const digits = Array.from({ length }, (_, i) => padded[i].trim())

  const focus = (index: number) => {
    refs.current[Math.max(0, Math.min(length - 1, index))]?.focus()
  }

  const update = (index: number, char: string) => {
    const next = padded.split("")
    next[index] = char || " "
    onChange(next.join("").trimEnd())
  }

  const handleKeyDown =
    (index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        e.preventDefault()

        if (digits[index]) {
          update(index, "")
        } else {
          focus(index - 1)
        }

        return
      }

      if (e.key === "ArrowLeft") {
        focus(index - 1)

        return
      }

      if (e.key === "ArrowRight") {
        focus(index + 1)
      }
    }

  const handleChange =
    (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
      const char = e.target.value.replace(/\D/gu, "").slice(-1)

      if (!char) {
        return
      }

      update(index, char)
      focus(index + 1)
    }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/gu, "")
      .slice(0, length)
    onChange(pasted)
    focus(pasted.length < length ? pasted.length : length - 1)
  }

  return (
    <div className={clsx("flex gap-2", className)} data-testid={dataTestId}>
      {digits.map((digit, i) => (
        <input
          data-testid={dataTestId ? `${dataTestId}-digit-${i}` : undefined}
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={t("common:pinDigit", { number: i + 1 })}
          maxLength={1}
          value={digit}
          onChange={handleChange(i)}
          onKeyDown={handleKeyDown(i)}
          onPaste={handlePaste}
          className="focus:border-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40 min-h-11 w-10 min-w-0 flex-1 rounded-lg border-2 border-[var(--border-hairline)] p-2 text-center text-lg font-semibold outline-none focus-visible:outline-none"
        />
      ))}
    </div>
  )
}

export default PinInput
