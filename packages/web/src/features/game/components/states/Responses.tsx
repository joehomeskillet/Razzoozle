import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Markdown from "@razzoozle/web/components/Markdown"
import AnswerButton from "@razzoozle/web/features/game/components/AnswerButton"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import {
  answerColor,
  answerLabel,
} from "@razzoozle/web/features/game/utils/answers"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import { calculatePercentages } from "@razzoozle/web/features/game/utils/score"
import { matchAnswer } from "@razzoozle/web/features/game/utils/text-match"
import clsx from "clsx"
import { Check } from "lucide-react"
import { motion } from "motion/react"
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
    correctChunks,
  },
}: Props) => {
  const isSlider = type === "slider"
  const isTypeAnswer = type === "type-answer"
  const isSentenceBuilder = type === "sentence-builder"
  const answerList = answers ?? []
  const solutionList = solutions ?? []
  const [percentages, setPercentages] = useState<Record<string, string>>({})
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)
  const muted = useSoundStore((s) => s.muted)
  const { t } = useTranslation()
  const reveal = useReveal()

  const resultsUrl = useSoundUrl("results")
  const musicUrl = useSoundUrl("answersMusic")
  const [sfxResults] = useSound(resultsUrl, {
    volume: 0.2,
    soundEnabled: !muted,
  })

  const [playMusic, { stop: stopMusic }] = useSound(musicUrl, {
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
        <h2 className="text-center text-2xl font-bold text-[color:var(--game-fg)] drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,5.5vh,6rem)]">
          <Markdown>{question}</Markdown>
        </h2>

        {isTypeAnswer || isSentenceBuilder ? (
          <div className="mx-auto w-full max-w-4xl px-4">
            {/* Accepted answers legend */}
            {isTypeAnswer && (
              <div className="mb-4 flex flex-wrap gap-2">
                {(acceptedAnswers ?? []).map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-[var(--state-correct-soft)] px-3 py-1 text-sm font-semibold text-green-800"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
            {/* Submitted text answers, ranked by frequency */}
            <motion.div
              className="flex flex-col gap-2"
              variants={reveal.container()}
              initial="hidden"
              animate="visible"
            >
              {Object.entries(textResponses ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([text, count]) => {
                  const isMatch = matchAnswer(
                    text,
                    acceptedAnswers ?? [],
                    matchMode ?? "normalized",
                  )

                  return (
                    <motion.div
                      key={text}
                      variants={reveal.item()}
                      transition={reveal.spring}
                      className={clsx(
                        "flex items-center justify-between rounded-xl px-4 py-2",
                        isMatch
                          ? "bg-[var(--state-correct-soft)] text-green-800"
                          : "border border-[var(--border-hairline)] bg-white text-[color:var(--color-field-ink)]/70",
                      )}
                    >
                      <span className="font-semibold">{text}</span>
                      <span className="ml-4 flex shrink-0 items-center gap-2 font-bold">
                        {count}
                        {isMatch && <Check className="size-4 text-green-400" />}
                      </span>
                    </motion.div>
                  )
                })}
            </motion.div>
            {isSentenceBuilder && correctChunks && (
              <motion.div
                className="mt-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]"
                variants={reveal.item()}
                transition={reveal.spring}
              >
                <p className="mb-2 text-sm font-semibold text-[color:var(--game-fg)]">
                  {t("game:sentenceBuilder.correctSentence", {
                    defaultValue: "Correct answer",
                  })}
                </p>
                <p className="text-lg font-bold text-[color:var(--game-fg)]">
                  {correctChunks.join(" ")}
                </p>
              </motion.div>
            )}
          </div>
        ) : isSlider ? (
          <motion.div
            className="flex flex-col items-center gap-3"
            variants={reveal.container()}
            initial="hidden"
            animate="visible"
          >
            <motion.div
              variants={reveal.item()}
              transition={reveal.spring}
              className="text-lg font-semibold text-[color:var(--game-fg)]/70 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
            >
              {t("game:slider.correctAnswer")}
            </motion.div>
            <motion.div
              variants={reveal.item()}
              transition={reveal.spring}
              className="text-6xl font-bold text-[color:var(--game-fg)] drop-shadow-lg lg:text-[clamp(4rem,10vh,10rem)]"
            >
              {correct}
              {unit ? ` ${unit}` : ""}
            </motion.div>
            {averageGuess != null && (
              <motion.div
                variants={reveal.item()}
                transition={reveal.spring}
                className="text-xl font-semibold text-[color:var(--game-fg)]/80 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
              >
                {t("game:slider.averageGuess", { value: averageGuess })}
                {unit ? ` ${unit}` : ""}
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            className={`mt-8 grid h-40 w-full max-w-3xl items-end gap-4 px-2 lg:h-[40vh]`}
            style={{ gridTemplateColumns: `repeat(${answerList.length}, 1fr)` }}
            variants={reveal.container()}
            initial="hidden"
            animate="visible"
          >
            {answerList.map((_, key) => (
              <motion.div
                key={key}
                variants={reveal.item()}
                transition={reveal.spring}
                className="flex h-full flex-col justify-end gap-2"
              >
                {/* Answer letter makes each bar identifiable without relying on
                    color alone (color-blind safe). */}
                <span className="text-center text-xl font-bold text-[color:var(--game-fg)] drop-shadow-md lg:text-[clamp(1.25rem,3vh,2.5rem)]">
                  {answerLabel(key)}
                </span>
                <div
                  className={clsx(
                    "flex flex-col justify-end overflow-hidden rounded-md",
                    answerColor(key),
                  )}
                  style={{
                    height: percentages[key],
                    transition: reveal.reduced
                      ? undefined
                      : "height 320ms cubic-bezier(0.16,1,0.3,1)",
                  }}
                >
                  <span className="w-full bg-[color:var(--color-field-ink)]/20 text-center text-lg font-bold text-[var(--color-field-ink)] tabular-nums drop-shadow-md lg:text-[clamp(1.25rem,3vh,2.5rem)]">
                    {responses[key] || 0}
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {!isSlider && !isTypeAnswer && !isSentenceBuilder && (
        <div>
          <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-1 rounded-full px-2 text-lg font-bold text-white md:text-xl lg:max-w-[85vw] lg:text-[clamp(1.25rem,3vh,2.5rem)]">
            {answerList.map((answer, key) => (
              <AnswerButton
                key={key}
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
