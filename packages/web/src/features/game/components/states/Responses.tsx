import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import {
  answerColor,
  answerLabel,
} from "@razzia/web/features/game/utils/answers"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { calculatePercentages } from "@razzia/web/features/game/utils/score"
import clsx from "clsx"
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
  },
}: Props) => {
  const isSlider = type === "slider"
  const answerList = answers ?? []
  const solutionList = solutions ?? []
  const [percentages, setPercentages] = useState<Record<string, string>>({})
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)
  const { t } = useTranslation()

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
  })

  const [playMusic, { stop: stopMusic }] = useSound(SFX.ANSWERS.MUSIC, {
    volume: 0.2,
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
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {question}
        </h2>

        {isSlider ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-lg font-semibold text-white/70">
              {t("game:slider.correctAnswer")}
            </div>
            <div className="text-6xl font-bold text-white drop-shadow-lg">
              {correct}
              {unit ? ` ${unit}` : ""}
            </div>
            {averageGuess != null && (
              <div className="text-xl font-semibold text-white/80">
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
                <span className="text-center text-xl font-bold text-white drop-shadow-md">
                  {answerLabel(key)}
                </span>
                <div
                  className={clsx(
                    "flex flex-col justify-end overflow-hidden rounded-md",
                    answerColor(key),
                  )}
                  style={{ height: percentages[key] }}
                >
                  <span className="w-full bg-black/10 text-center text-lg font-bold text-white tabular-nums drop-shadow-md">
                    {responses[key] || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isSlider && (
        <div>
          <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-1 rounded-full px-2 text-lg font-bold text-white md:text-xl">
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
                {answer}
              </AnswerButton>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Responses
