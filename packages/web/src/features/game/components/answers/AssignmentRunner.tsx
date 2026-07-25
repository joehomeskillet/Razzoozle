import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { Clock, CheckCircle2, ChevronRight, Save } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export interface AssignmentItem {
  id: string
  questionText: string
  answered?: boolean
}

export interface AssignmentRunnerProps {
  title: string
  deadline: string
  items: AssignmentItem[]
  onComplete?: () => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export function AssignmentRunner({
  title,
  deadline,
  items,
  onComplete,
  disabled = false,
  testIdPrefix = "",
  className,
}: AssignmentRunnerProps) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)

  const currentItem = items[currentIndex]
  const isLast = currentIndex === items.length - 1
  const completedCount = items.filter((i) => i.answered).length

  const handleNext = () => {
    if (isLast) {
      onComplete?.()
    } else {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  return (
    <div
      className={clsx(
        "mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}assignment-container`}
    >
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--ink)]">{title}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-[var(--ink-muted)]">
            <Clock className="h-4 w-4 text-[var(--color-primary)]" />
            <span>
              {t("game:assignment.deadline", {
                defaultValue: "Fällig bis: {{date}}",
                date: deadline,
              })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-bold text-[var(--ink-medium)]">
          <Save className="h-3.5 w-3.5 text-status-online-text" />
          <span>
            {t("game:assignment.progress", {
              defaultValue: "{{completed}} von {{total}} gelöst",
              completed: completedCount,
              total: items.length,
            })}
          </span>
        </div>
      </div>

      {/* Item View */}
      {currentItem && (
        <div
          className="flex flex-col gap-4 py-4"
          data-testid={`${testIdPrefix}assignment-item-${currentItem.id}`}
        >
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
            {t("game:assignment.questionCounter", {
              defaultValue: "Frage {{current}} von {{total}}",
              current: currentIndex + 1,
              total: items.length,
            })}
          </span>

          <h3 className="text-lg font-bold text-[var(--ink)]">
            {currentItem.questionText}
          </h3>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
        <span className="text-xs text-[var(--ink-muted)]">
          {t("game:assignment.autoSave", { defaultValue: "Fortschritt wird automatisch gespeichert" })}
        </span>

        <Button
          type="button"
          variant="primary"
          disabled={disabled}
          onClick={handleNext}
          data-testid={`${testIdPrefix}assignment-next`}
        >
          {isLast ? (
            <>
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {t("game:assignment.submit", { defaultValue: "Aufgabe abgeben" })}
            </>
          ) : (
            <>
              {t("game:assignment.next", { defaultValue: "Nächste Frage" })}
              <ChevronRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
