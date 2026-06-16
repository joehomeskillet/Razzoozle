import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Markdown from "@razzoozle/web/components/Markdown"
import AnswerButton from "@razzoozle/web/features/game/components/AnswerButton"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import {
  answerColor,
  answerLabel,
} from "@razzoozle/web/features/game/utils/answers"
import { SFX } from "@razzoozle/web/features/game/utils/constants"
import { calculatePercentages } from "@razzoozle/web/features/game/utils/score"
import { matchAnswer } from "@razzoozle/web/features/game/utils/text-match"
import clsx from "clsx"
import { Check } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
}

const Responses = ({
  data: {
    question,
    answers,
    responses,
    solutions,
    type,
    correct,
    unit,
    averageGuess,
    textResponses,
    acceptedAnswers,
    matchMode,
  },
}: Props) => {
  const isSlider = type === "slider"
  const isTypeAnswer = type === "type-answer"
  const answerList = answers ?? []
  const solutionList = solutions ?? []
  const [percentages, setPercentages] = useState<Record<string, string>>({})
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)
  const muted = useSoundStore((s) => s.muted)
  const { t } = useTranslation()

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
    soundEnabled: !muted,
  })

  const [playMusic, { stop: stopMusic }] = useSound(SFX.ANSWERS.MUSIC, {
    volume: 0.2,
    soundEnabled: !muted,
    onplay: () => {
      setIsMusicPlaying(true)
    },
    onend: () => {
      setIsMusicPlaying(false)
    },
  })

  useEffect(() => {
    stopMusic()
    sfxResults()

    setPercentages(calculatePercentages(responses))
  }, [responses, playMusic, stopMusic, sfxResults])

  useEffect(() => {
    if (!isMusicPlaying) {
      playMusic()
    }
  }, [isMusicPlaying, playMusic])

  useEffect(() => {
    stopMusic()
  }, [playMusic, stopMusic])

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5 lg:max-w-[85vw]">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,5.5vh,6rem)]">
          <Markdown>{question}</Markdown>
        </h2>

        {isTypeAnswer ? (
          <div className="mx-auto w-full max-w-4xl px-4">
            {/* Accepted answers legend */}
            <div className="mb-4 flex flex-wrap gap-2">
              {(acceptedAnswers ?? []).map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-green-500/20 px-3 py-1 text-sm font-semibold text-green-300"
                >
                  {a}
                </span>
              ))}
            </div>
            {/* Submitted text answers, ranked by frequency */}
            <div className="flex flex-col gap-2">
              {Object.entries(textResponses ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([text, count]) => {
                  const isMatch = matchAnswer(
                    text,
                    acceptedAnswers ?? [],
                    matchMode ?? "normalized",
                  )

                  return (
                    <div
                      key={text}
                      className={clsx(
                        "flex items-center justify-between rounded-xl px-4 py-2",
                        isMatch
                          ? "bg-green-500/30 text-green-100"
                          : "bg-white/10 text-white/70",
                      )}
                    >
                      <span className="font-semibold">{text}</span>
                      <span className="ml-4 flex shrink-0 items-center gap-2 font-bold">
                        {count}
                        {isMatch && <Check className="size-4 text-green-400" />}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        ) : isSlider ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-lg font-semibold text-white/70 lg:text-[clamp(1.25rem,3vh,2.5rem)]">
              {t("game:slider.correctAnswer")}
            </div>
            <div className="text-6xl font-bold text-white drop-shadow-lg lg:text-[clamp(4rem,10vh,10rem)]">
              {correct}
              {unit ? ` ${unit}` : ""}
            </div>
            {averageGuess != null && (
              <div className="text-xl font-semibold text-white/80 lg:text-[clamp(1.25rem,3vh,2.5rem)]">
                {t("game:slider.averageGuess", { value: averageGuess })}
                {unit ? ` ${unit}` : ""}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`mt-8 grid h-40 w-full max-w-3xl items-end gap-4 px-2 lg:h-[40vh]`}
            style={{ gridTemplateColumns: `repeat(${answerList.length}, 1fr)` }}
          >
            {answerList.map((_, key) => (
              <div key={key} className="flex h-full flex-col justify-end gap-2">
                {/* Answer letter makes each bar identifiable without relying on
                    color alone (color-blind safe). */}
                <span className="text-center text-xl font-bold text-white drop-shadow-md lg:text-[clamp(1.25rem,3vh,2.5rem)]">
                  {answerLabel(key)}
                </span>
                <div
                  className={clsx(
                    "flex flex-col justify-end overflow-hidden rounded-md",
                    answerColor(key),
                  )}
                  style={{ height: percentages[key] }}
                >
                  <span className="w-full bg-black/10 text-center text-lg font-bold text-white tabular-nums drop-shadow-md lg:text-[clamp(1.25rem,3vh,2.5rem)]">
                    {responses[key] || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isSlider && !isTypeAnswer && (
        <div>
          <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-1 rounded-full px-2 text-lg font-bold text-white md:text-xl lg:max-w-[85vw] lg:text-[clamp(1.25rem,3vh,2.5rem)]">
            {answerList.map((answer, key) => (
              <AnswerButton
                key={key}
                className={clsx(answerColor(key), {
                  // oxlint-disable-next-line typescript/no-unnecessary-condition
                  "opacity-65": responses && !solutionList.includes(key),
                })}
                label={answerLabel(key)}
                correct={solutionList.includes(key)}
              >
                <Markdown>{answer}</Markdown>
              </AnswerButton>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Responses
