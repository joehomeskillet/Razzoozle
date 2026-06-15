import {
  answerColor,
  answerLabel,
} from "@razzoozle/web/features/game/utils/answers"
import { useResultModal } from "@razzoozle/web/features/manager/contexts/result-modal-context"
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
      <div className="flex items-center justify-end border-b border-gray-100 px-5 py-2">
        <button
          type="button"
          role="switch"
          aria-checked={showNames}
          onClick={toggleShowNames}
          className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
        >
          {showNames ? (
            <Eye className="size-4 text-gray-500" aria-hidden />
          ) : (
            <EyeOff className="size-4 text-gray-400" aria-hidden />
          )}
          <span>
            {t("manager:result.showNames", { defaultValue: "Namen anzeigen" })}
          </span>
          <span
            aria-hidden
            className={clsx(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              showNames ? "bg-[var(--color-primary)]" : "bg-gray-300",
            )}
          >
            <span
              className={clsx(
                "inline-block size-4 rounded-full bg-white shadow-sm transition-transform",
                showNames ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
      </div>

      <table className="w-full text-sm">
      <thead className="sticky top-0 shadow-sm">
        <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
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
      <tbody className="divide-y divide-gray-100">
        {questionResult.playerAnswers.map((pa, i) => {
          const isSlider = questionResult.type === "slider"
          const isPoll = questionResult.type === "poll"
          const isCorrect = isAnswerCorrect(pa)
          const label =
            !isSlider && pa.answerId !== null ? answerLabel(pa.answerId) : null

          return (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-5 py-2.5 font-medium">
                {displayName(pa.playerName)}
              </td>
              <td className="px-4 py-2.5">
                {pa.answerText != null ? (
                  // Type-answer: render the submitted free-text
                  <span className="inline-block max-w-32 truncate rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
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
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white",
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
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                ) : pa.answerId === null ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : isSlider ? (
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 tabular-nums">
                    {pa.answerId}
                    {questionResult.unit ? ` ${questionResult.unit}` : ""}
                  </span>
                ) : label ? (
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white",
                      answerColor(pa.answerId),
                    )}
                  >
                    <span className="font-bold">{label}</span>
                    <span className="max-w-30 truncate">
                      {questionResult.answers?.[pa.answerId] ?? pa.answerId}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {isPoll ? (
                  <span className="text-gray-400">—</span>
                ) : isCorrect ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <Check className="size-3.5" />{" "}
                    {t("manager:result.table.correct")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-500">
                    <X className="size-3.5" />{" "}
                    {t("manager:result.table.incorrect")}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold text-gray-700 tabular-nums">
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
