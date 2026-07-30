import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { TYPE_META_BY_ID, type QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"
import clsx from "clsx"

export interface ResponsesDisplayProps {
  type: QuestionTypeKey
  responseCount?: number
  className?: string
  testIdPrefix?: string
}

/**
 * DefaultQuestionTypeDisplay — Shows question type icon, label, and description.
 * Displays type information from TYPE_META_BY_ID with optional response counter.
 * Scaffolded via `pnpm g:display DefaultQuestionTypeDisplay`.
 *
 * Design System: Flat cream/ink theme, tokens from design.md §3.
 */
export function DefaultQuestionTypeDisplay({
  type,
  responseCount,
  className,
  testIdPrefix = "",
}: ResponsesDisplayProps): ReactNode {
  const { t } = useTranslation()
  const meta = TYPE_META_BY_ID[type]

  if (!meta) {
    return null
  }

  const Icon = meta.icon

  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}question-type-display-${type}`}
    >
      <div
        className="inline-flex items-center justify-center text-[var(--color-primary)]"
        data-testid={`${testIdPrefix}question-type-icon`}
      >
        <Icon className="h-16 w-16" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-2">
        <h2
          className="text-[4vh] font-bold tracking-tight text-[var(--game-fg)]"
          data-testid={`${testIdPrefix}question-type-label`}
        >
          {t(meta.labelKey)}
        </h2>

        <p
          className="text-[2vh] font-medium text-[var(--game-fg)] opacity-75"
          data-testid={`${testIdPrefix}question-type-description`}
        >
          {t(meta.descKey)}
        </p>
      </div>

      {responseCount !== undefined && (
        <div
          className="mt-4 inline-block rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] px-6 py-3"
          data-testid={`${testIdPrefix}response-counter`}
        >
          <p className="text-[2.5vh] font-semibold text-[var(--game-fg)] opacity-60">
            {t("game:responses.count", {
              defaultValue: "{{count}} Antworten",
              count: responseCount,
            })}
          </p>
        </div>
      )}
    </div>
  )
}

export default DefaultQuestionTypeDisplay
