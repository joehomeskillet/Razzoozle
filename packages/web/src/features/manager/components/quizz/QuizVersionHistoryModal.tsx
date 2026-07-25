import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { History, RotateCcw, Clock, User } from "lucide-react"
import { useTranslation } from "react-i18next"

export interface QuizVersion {
  version: number
  updatedAt: string
  authorName: string
  description: string
  questionCount: number
  isCurrent?: boolean
}

export interface QuizVersionHistoryModalProps {
  quizTitle: string
  versions: QuizVersion[]
  onRestore?: (version: number) => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export function QuizVersionHistoryModal({
  quizTitle,
  versions,
  onRestore,
  disabled = false,
  testIdPrefix = "",
  className,
}: QuizVersionHistoryModalProps) {
  const { t } = useTranslation()

  return (
    <div
      className={clsx(
        "flex w-full flex-col gap-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}version-history-modal`}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-4">
        <History className="h-5 w-5 text-[var(--color-primary)]" />
        <div>
          <h3 className="text-xl font-bold text-[var(--ink)]">
            {t("manager:version.title", { defaultValue: "Versionsverlauf" })}
          </h3>
          <p className="text-xs font-semibold text-[var(--ink-muted)]">
            {quizTitle}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3" data-testid={`${testIdPrefix}version-list`}>
        {versions.map((ver) => (
          <div
            key={ver.version}
            className={clsx(
              "flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-2)] p-4 transition-all",
              ver.isCurrent && "ring-2 ring-[var(--color-primary)] bg-accent-tint/10",
            )}
            data-testid={`${testIdPrefix}version-item-v${ver.version}`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-[var(--ink)]">
                  v{ver.version}
                </span>
                {ver.isCurrent && (
                  <span className="rounded-md bg-[var(--color-primary)] px-2 py-0.5 text-xs font-bold text-white">
                    {t("manager:version.current", { defaultValue: "Aktuell" })}
                  </span>
                )}
                <span className="text-xs text-[var(--ink-muted)]">
                  • {ver.questionCount} Fragen
                </span>
              </div>

              <p className="text-sm text-[var(--ink-medium)]">{ver.description}</p>

              <div className="flex items-center gap-4 text-xs font-semibold text-[var(--ink-muted)]">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {ver.updatedAt}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {ver.authorName}
                </span>
              </div>
            </div>

            {!ver.isCurrent && onRestore && (
              <Button
                type="button"
                variant="secondary"
                disabled={disabled}
                onClick={() => onRestore(ver.version)}
                data-testid={`${testIdPrefix}version-restore-v${ver.version}`}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                {t("manager:version.restore", { defaultValue: "Wiederherstellen" })}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
