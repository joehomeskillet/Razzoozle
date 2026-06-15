import Input from "@razzia/web/components/Input"
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

  const handleChange = (raw: string) => {
    setInput(raw)

    const parsed = Number(raw)

    if (raw === "" || isNaN(parsed)) {
      return
    }

    const clamped = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed))
    onChange(clamped)
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
        onBlur={() => setInput(String(value))}
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
