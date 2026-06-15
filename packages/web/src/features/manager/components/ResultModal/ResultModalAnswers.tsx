import { MEDIA_TYPES } from "@razzoozle/common/constants"
import type { QuestionMedia } from "@razzoozle/common/types/game"
import Markdown from "@razzoozle/web/components/Markdown"
import {
  answerColor,
  answerLabel,
} from "@razzoozle/web/features/game/utils/answers"
import {
  matchAnswer,
  normalizeText,
} from "@razzoozle/web/features/game/utils/text-match"
import { useResultModal } from "@razzoozle/web/features/manager/contexts/result-modal-context"
import clsx from "clsx"
import { Check, Clock, ImageOff, Music, Video, X } from "lucide-react"
import { useTranslation } from "react-i18next"

interface AnswerRow {
  label: string
  count: number
  isCorrect: boolean
  color: string | null
  answerLabel: string | null
}

const MediaPreview = ({ media }: { media?: QuestionMedia }) => {
  if (media?.type === MEDIA_TYPES.IMAGE) {
    return (
      <img
        src={media.url}
        alt=""
        className="h-16 w-auto rounded-md object-contain md:h-full"
      />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return (
      <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-gray-200 md:h-38 md:w-full">
        <Video className="size-6 text-gray-400 md:size-10" />
      </div>
    )
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return (
      <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-gray-200 md:h-38 md:w-full">
        <Music className="size-6 text-gray-400 md:size-10" />
      </div>
    )
  }

  return (
    <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-gray-200 md:h-38 md:w-full">
      <ImageOff className="size-6 text-gray-400 md:size-10" />
    </div>
  )
}

const ResultModalAnswers = () => {
  const { questionResult, totalPlayers, answeredCount } = useResultModal()
  const { t } = useTranslation()

  const noAnswerCount = totalPlayers - answeredCount
  const isPoll = questionResult.type === "poll"
  const isSlider = questionResult.type === "slider"
  const isTypeAnswer = questionResult.type === "type-answer"

  // Type-answer: bucket the submitted free-text by its normalized form so
  // case/diacritic variants collapse into one row, ranked by frequency. Match
  // status is computed once per bucket via the same util the server scores with.
  const textBuckets = isTypeAnswer
    ? (() => {
        const buckets: Record<
          string,
          { display: string; count: number; isMatch: boolean }
        > = {}

        for (const pa of questionResult.playerAnswers) {
          if (!pa.answerText) {
            continue
          }

          const key = normalizeText(pa.answerText)

          if (!buckets[key]) {
            buckets[key] = {
              display: pa.answerText,
              count: 0,
              isMatch: matchAnswer(
                pa.answerText,
                questionResult.acceptedAnswers ?? [],
                questionResult.matchMode ?? "normalized",
              ),
            }
          }

          buckets[key].count += 1
        }

        return Object.values(buckets).sort((a, b) => b.count - a.count)
      })()
    : []
  const sliderGuesses = questionResult.playerAnswers
    .map((pa) => pa.answerId)
    .filter((v): v is number => v !== null)
  const sliderAvg = sliderGuesses.length
    ? Math.round(
        sliderGuesses.reduce((s, v) => s + v, 0) / sliderGuesses.length,
      )
    : null
  const unit = questionResult.unit ? ` ${questionResult.unit}` : ""

  const rows: AnswerRow[] = [
    ...(questionResult.answers ?? []).map((label, ai) => ({
      label,
      count: questionResult.playerAnswers.filter(
        // Multiple-select stores the selected set in answerIds; choice/boolean/
        // poll keep the scalar answerId, so fall back to that when absent.
        (pa) => pa.answerIds?.includes(ai) ?? pa.answerId === ai,
      ).length,
      isCorrect: (questionResult.solutions ?? []).includes(ai),
      color: answerColor(ai),
      answerLabel: answerLabel(ai),
    })),
    {
      label: t("manager:result.noAnswer"),
      count: noAnswerCount,
      isCorrect: false,
      color: null,
      answerLabel: null,
    },
  ]

  return (
    <div className="flex flex-col border-b border-gray-100 md:flex-row">
      <div className="flex shrink-0 flex-row items-center gap-4 border-b border-gray-100 bg-gray-50 p-4 md:w-66 md:flex-col md:justify-center md:border-r md:border-b-0">
        <MediaPreview media={questionResult.media} />
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="size-3.5" />
          <span>
            {questionResult.time}
            {t("manager:result.timeLimitSuffix")}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden px-4 py-3 md:gap-2 md:px-5 md:py-4">
        <p className="text-md mb-1 font-semibold text-gray-800">
          <Markdown>{questionResult.question}</Markdown>
        </p>

        {isTypeAnswer ? (
          <div className="flex flex-col gap-2">
            {/* Accepted answers legend */}
            <div className="mb-2 flex flex-wrap gap-2">
              {(questionResult.acceptedAnswers ?? []).map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700"
                >
                  {a}
                </span>
              ))}
            </div>

            {/* Submitted answers, ranked by frequency */}
            {textBuckets.map(({ display, count, isMatch }) => (
              <div
                key={display}
                className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2"
              >
                {isMatch ? (
                  <Check className="size-4 shrink-0 text-green-500" />
                ) : (
                  <X className="size-4 shrink-0 text-red-400" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                  {display}
                </span>
                <span className="shrink-0 text-sm font-semibold text-gray-600">
                  {count}
                </span>
              </div>
            ))}

            {noAnswerCount > 0 && (
              <div className="flex items-center justify-between px-3 py-2 text-gray-400">
                <span className="text-sm">{t("manager:result.noAnswer")}</span>
                <span className="text-sm font-semibold">{noAnswerCount}</span>
              </div>
            )}
          </div>
        ) : isSlider ? (
          <div className="flex flex-col gap-1 text-sm">
            <div className="font-semibold text-gray-800">
              {t("manager:result.slider.correctAnswer")}{" "}
              {questionResult.correct}
              {unit}
            </div>
            {sliderAvg !== null && (
              <div className="text-gray-600">
                {t("manager:result.slider.average")} {sliderAvg}
                {unit}
              </div>
            )}
            <div className="text-gray-500">
              {t("manager:result.slider.guessSummary", {
                count: answeredCount,
                noAnswer: noAnswerCount,
              })}
            </div>
          </div>
        ) : (
          rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              {row.color && row.answerLabel ? (
                <div
                  className={clsx(
                    "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white",
                    row.color,
                  )}
                >
                  {row.answerLabel}
                </div>
              ) : (
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white">
                  <X className="size-3 text-gray-400" />
                </div>
              )}

              <span
                className={clsx("min-w-0 flex-1 truncate text-sm font-medium", {
                  "text-gray-400": !row.color,
                })}
              >
                <Markdown>{row.label}</Markdown>
              </span>

              {!isPoll && (
                <div className="shrink-0">
                  {row.isCorrect ? (
                    <Check className="size-5 text-green-500" />
                  ) : (
                    <X
                      className={clsx(
                        "size-5",
                        row.color ? "text-red-500" : "text-red-400",
                      )}
                    />
                  )}
                </div>
              )}

              <div className="flex shrink-0 items-center gap-2">
                <span className="text-center text-sm font-semibold text-gray-600">
                  {row.count}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ResultModalAnswers
