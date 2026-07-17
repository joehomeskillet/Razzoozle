import {
  answerColor,
  answerLabel,
} from "@razzoozle/web/features/game/utils/answers"
import { useResultModal } from "@razzoozle/web/features/manager/contexts/result-modal-context"
import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { Check, Eye, EyeOff, X } from "lucide-react"
import { useTranslation } from "react-i18next"

const ResultModalTable = () => {
  const {
    questionResult,
    isAnswerCorrect,
    getPlayerPoints,
    displayName,
    showNames,
    toggleShowNames,
  } = useResultModal()
  const { t } = useTranslation()

  return (
    <>
      {/* Privacy toggle — masks player names as "Spieler N" across the table and
          answer breakdown. Default OFF; the manager opts in to reveal real
          names. role=switch so screen readers announce the on/off state. */}
      <div className="flex items-center justify-end border-b border-[var(--line)] px-5 py-2">
        <Button
          type="button"
          role="switch"
          aria-checked={showNames}
          onClick={toggleShowNames}
          variant="secondary"
          size="sm"
          className="px-2 py-1 min-h-11 text-[var(--ink-medium)] font-medium"
        >
          {showNames ? (
            <Eye className="size-4 text-[var(--ink-subtle)]" aria-hidden />
          ) : (
            <EyeOff className="size-4 text-[var(--ink-faint)]" aria-hidden />
          )}
          <span>
            {t("manager:result.showNames", { defaultValue: "Namen anzeigen" })}
          </span>
          <span
            aria-hidden
            className={clsx(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              showNames ? "bg-[var(--color-primary)]" : "bg-[var(--surface-5)]",
            )}
          >
            <span
              className={clsx(
                "inline-block size-4 rounded-full bg-[var(--surface)] shadow-[var(--shadow-flat)] transition-transform",
                showNames ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </span>
        </Button>
      </div>

      <table className="w-full text-sm">
      <thead className="sticky top-0 shadow-[var(--shadow-flat)]">
        <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-left text-xs font-semibold tracking-wide text-[var(--ink-subtle)] uppercase">
          <th className="px-5 py-2.5">{t("manager:result.table.player")}</th>
          <th className="px-4 py-2.5">{t("manager:result.table.answered")}</th>
          <th className="px-4 py-2.5">
            {t("manager:result.table.correctIncorrect")}
          </th>
          <th className="px-4 py-2.5 text-right">
            {t("manager:result.table.points")}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--line)]">
        {questionResult.playerAnswers.map((pa) => {
          const isSlider = questionResult.type === "slider"
          const isPoll = questionResult.type === "poll"
          const isCorrect = isAnswerCorrect(pa)
          const label =
            !isSlider && pa.answerId !== null ? answerLabel(pa.answerId) : null

          return (
            <tr key={pa.playerName} className="hover:bg-[var(--surface-2)]">
              <td className="px-5 py-2.5 font-medium">
                {displayName(pa.playerName)}
              </td>
              <td className="px-4 py-2.5">
                {pa.answerText != null ? (
                  // Type-answer: render the submitted free-text
                  <span className="inline-block max-w-32 truncate rounded-md bg-[var(--surface-3)] px-2 py-1 text-xs font-medium text-[var(--ink-muted)]">
                    {pa.answerText}
                  </span>
                ) : pa.answerIds != null ? (
                  // Multiple-select: one colored badge per selected option
                  <div className="flex flex-wrap gap-1">
                    {pa.answerIds.length > 0 ? (
                      pa.answerIds.map((id) => (
                        <span
                          key={id}
                          className={clsx(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--ink)]",
                            answerColor(id),
                          )}
                        >
                          <span className="font-bold">{answerLabel(id)}</span>
                          <span className="max-w-30 truncate">
                            {questionResult.answers?.[id] ?? id}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[var(--ink-faint)]">—</span>
                    )}
                  </div>
                ) : pa.answerId === null ? (
                  <span className="text-xs text-[var(--ink-faint)]">—</span>
                ) : isSlider ? (
                  <span className="inline-flex items-center rounded-md bg-[var(--surface-3)] px-2 py-1 text-xs font-semibold text-[var(--ink-muted)] tabular-nums">
                    {pa.answerId}
                    {questionResult.unit ? ` ${questionResult.unit}` : ""}
                  </span>
                ) : label ? (
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--ink)]",
                      answerColor(pa.answerId),
                    )}
                  >
                    <span className="font-bold">{label}</span>
                    <span className="max-w-30 truncate">
                      {questionResult.answers?.[pa.answerId] ?? pa.answerId}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-[var(--ink-faint)]">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {isPoll ? (
                  <span className="text-[var(--ink-faint)]">—</span>
                ) : isCorrect ? (
                  <span className="flex items-center gap-1 text-[var(--state-correct)]">
                    <Check className="size-3.5" />{" "}
                    {t("manager:result.table.correct")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[var(--state-wrong)]">
                    <X className="size-3.5" />{" "}
                    {t("manager:result.table.incorrect")}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold text-[var(--ink-muted)] tabular-nums">
                {getPlayerPoints(pa.playerName)}
              </td>
            </tr>
          )
        })}
      </tbody>
      </table>
    </>
  )
}

export default ResultModalTable
