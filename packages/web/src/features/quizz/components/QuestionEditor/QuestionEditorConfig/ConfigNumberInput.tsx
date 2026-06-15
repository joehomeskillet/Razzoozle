import Input from "@razzoozle/web/components/Input"
import clsx from "clsx"
import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  value: number
  min?: number
  max?: number
  onChange: (_value: number) => void
}

const ConfigNumberInput = ({ value, min, max, onChange }: Props) => {
  const { t } = useTranslation()
  const hintId = useId()
  const [input, setInput] = useState(String(value))

  useEffect(() => {
    setInput(String(value))
  }, [value])

  const num = Number(input)
  const hasValue = input !== "" && !isNaN(num)
  const belowMin = hasValue && min !== undefined && num < min
  const aboveMax = hasValue && max !== undefined && num > max
  const isInvalid = belowMin || aboveMax

  const hint = belowMin
    ? t("quizz:question.config.rangeMin", {
        defaultValue: "Mindestens {{min}} Sekunden.",
        min,
      })
    : aboveMax
      ? t("quizz:question.config.rangeMax", {
          defaultValue: "Höchstens {{max}} Sekunden.",
          max,
        })
      : null

  // While typing we KEEP the raw value (even out of range) so the range hint
  // stays visible instead of flashing for a single frame. Only in-range edits
  // propagate live; the clamp happens on blur (handleBlur), which also re-syncs
  // the input to the committed value.
  const handleChange = (raw: string) => {
    setInput(raw)

    const parsed = Number(raw)

    if (raw === "" || isNaN(parsed)) {
      return
    }

    const outOfRange =
      (min !== undefined && parsed < min) ||
      (max !== undefined && parsed > max)

    if (outOfRange) {
      return
    }

    onChange(parsed)
  }

  // Commit on blur: clamp the typed value into range, push it up, and re-sync
  // the input. The effect above mirrors `value` back, so an in-range entry that
  // already matched stays put.
  const handleBlur = () => {
    const parsed = Number(input)

    if (input === "" || isNaN(parsed)) {
      setInput(String(value))

      return
    }

    const clamped = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed))

    if (clamped !== value) {
      onChange(clamped)
    }

    setInput(String(clamped))
  }

  return (
    <div className="flex flex-col gap-1">
      <Input
        variant="sm"
        type="number"
        min={min}
        max={max}
        value={input}
        aria-invalid={isInvalid}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className={clsx("w-full", isInvalid && "border-red-400")}
      />
      {hint && (
        <p id={hintId} role="alert" className="text-xs font-medium text-red-500">
          {hint}
        </p>
      )}
    </div>
  )
}

export default ConfigNumberInput
