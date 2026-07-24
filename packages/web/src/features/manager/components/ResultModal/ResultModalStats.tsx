import { useResultModal } from "@razzoozle/web/features/manager/contexts/result-modal-context"
import { summarizeResponseTimes } from "@razzoozle/web/features/manager/utils/responseTimeStats"
import { Timer, Users } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

const ResultModalStats = () => {
  const { correctPct, answeredCount, totalPlayers, questionResult } =
    useResultModal()
  const { t } = useTranslation()

  const timeSummary = useMemo(
    () => summarizeResponseTimes(questionResult ? [questionResult] : []),
    [questionResult],
  )

  const formatMs = (ms: number | null) =>
    ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`

  return (
    <div className="flex shrink-0 divide-x divide-[var(--line)] border-b border-[var(--line)] bg-[var(--surface-2)]">
      <div className="flex flex-1 items-center justify-between px-5 py-3">
        <p className="text-xs text-[var(--ink-subtle)]">
          {t("manager:result.stats.correctAnswers")}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative size-6">
            <svg className="size-6 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="var(--line)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${94 - correctPct * 0.94 - 2} 94`}
                strokeDashoffset={`${-(correctPct * 0.94 + 1)}`}
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="var(--state-correct)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${correctPct * 0.94} 94`}
              />
            </svg>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {correctPct}%
          </span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-between px-5 py-3">
        <p className="text-xs text-[var(--ink-subtle)]">
          {t("manager:result.stats.playersAnswered")}
        </p>
        <div className="flex items-center gap-2">
          <Users className="size-4 text-[var(--ink-medium)]" />
          <span className="text-sm font-semibold tabular-nums">
            {answeredCount}/{totalPlayers}
          </span>
        </div>
      </div>

      <div
        className="flex flex-1 items-center justify-between px-5 py-3"
        data-testid="result-response-time-stats"
        title={
          timeSummary.count
            ? `min ${formatMs(timeSummary.minMs)} · max ${formatMs(timeSummary.maxMs)} · n=${timeSummary.count}`
            : undefined
        }
      >
        <p className="text-xs text-[var(--ink-subtle)]">
          {t("manager:result.stats.avgResponseTime", {
            defaultValue: "Avg. response",
          })}
        </p>
        <div className="flex items-center gap-2">
          <Timer className="size-4 text-[var(--ink-medium)]" />
          <span className="text-sm font-semibold tabular-nums">
            {formatMs(timeSummary.avgMs)}
            {timeSummary.medianMs != null && (
              <span className="ml-1 text-xs font-normal text-[var(--ink-subtle)]">
                (mdn {formatMs(timeSummary.medianMs)})
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

export default ResultModalStats
