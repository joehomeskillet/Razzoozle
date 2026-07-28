import { isUnscoredQuestionType } from "@razzoozle/common/constants"
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
    correctAnswer,
    unit,
    averageGuess,
    textResponses,
    acceptedAnswers,
    matchMode,
    correctChunks,
    correctOrder,
    items,
    media,
    correctOptions,
    correctMatches,
    correctHotspotIndex,
  },
}: Props) => {
  const isSlider = type === "slider"
  const isTypeAnswer = type === "type-answer"
  const isSentenceBuilder = type === "sentence-builder"
  const isMathematik = type === "mathematik"
  const isWortarten = type === "wortarten"
  const isSequencing = type === "sequencing"
  // Wire strings are kebab-case (server `question_type_wire`, serde-renamed to
  // the `type` field on SHOW_RESPONSES).
  const isFillBlank = type === "fill-blank"
  const isMatching = type === "matching"
  const isDropPin = type === "drop-pin"
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
    <div
      data-testid="responses-view"
      className="flex h-full flex-1 flex-col justify-between"
    >
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5 lg:max-w-[85vw]">
        <h2 className="text-center text-2xl font-bold text-[color:var(--game-fg)] drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,5.5vh,6rem)]">
          <Markdown>{question}</Markdown>
        </h2>

        {isTypeAnswer || isSentenceBuilder ? (
          <div className="mx-auto w-full max-w-7xl px-4 lg:max-w-[85vw]">
            {/* Accepted answers legend (outside scroll area) */}
            {isTypeAnswer && (
              <div className="mb-4 flex flex-wrap gap-2">
                {(acceptedAnswers ?? []).map((a) => (
                  <span
                    key={a}
                    className="text-answer-text rounded-full bg-[var(--state-correct-soft)] px-4 py-2 text-base font-semibold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
            {/* Submitted text answers, ranked by frequency — internal scroll */}
            <motion.div
              className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto"
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
                        "flex items-center justify-between rounded-xl px-5 py-3 text-lg md:px-6 md:py-4 md:text-2xl lg:text-[clamp(1.25rem,3vh,2.5rem)]",
                        isMatch
                          ? "text-answer-text bg-[var(--state-correct-soft)]"
                          : "border border-[var(--border-hairline)] bg-white text-[color:var(--color-field-ink)]/70",
                      )}
                    >
                      <span className="font-semibold">{text}</span>
                      <span className="ml-4 flex shrink-0 items-center gap-2 font-bold">
                        {count}
                        {isMatch && (
                          <Check className="size-6 text-[var(--state-correct)] md:size-8 lg:size-10" />
                        )}
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
                  {t("game:sentenceBuilder.correctSentence")}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {correctChunks.map((chunk, i) => (
                    <span
                      key={`${chunk}-${i}`}
                      className="text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--state-correct)] px-3 py-2 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
                    >
                      {chunk}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
            {isSequencing && correctOrder && items && (
              <motion.div
                className="mt-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]"
                variants={reveal.item()}
                transition={reveal.spring}
              >
                <p className="mb-2 text-sm font-semibold text-[color:var(--game-fg)]">
                  {t("game:sequencing.correctOrder")}
                </p>
                <ol className="flex flex-col gap-2">
                  {correctOrder.map((itemId, index) => {
                    const item = items.find((i) => i.id === itemId)
                    return (
                      <li
                        key={`${itemId}-${index}`}
                        className="text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--state-correct)] px-3 py-2 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
                      >
                        <span className="mr-2 font-bold">{index + 1}.</span>
                        <span>{item?.label}</span>
                      </li>
                    )
                  })}
                </ol>
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
        ) : (isMathematik || isWortarten) && correctAnswer ? (
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
              {t("game:reveal.correctAnswer")}
            </motion.div>
            <motion.div
              variants={reveal.item()}
              transition={reveal.spring}
              className="text-6xl font-bold text-[color:var(--game-fg)] drop-shadow-lg lg:text-[clamp(4rem,10vh,10rem)]"
            >
              {correctAnswer}
            </motion.div>
          </motion.div>
        ) : isFillBlank || isMatching || isDropPin ? (
          <motion.div
            className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4"
            variants={reveal.container()}
            initial="hidden"
            animate="visible"
          >
            {/* Fill-blank: correct option per slot as green chips (mirrors the
                sentence-builder correctChunks reveal block). */}
            {isFillBlank && !!correctOptions?.length && (
              <motion.div
                className="w-full rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]"
                variants={reveal.item()}
                transition={reveal.spring}
              >
                <p className="mb-2 text-sm font-semibold text-[color:var(--game-fg)]">
                  {t("game:fillBlank.correctAnswers")}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {correctOptions.map((option, i) => (
                    <span
                      key={`${option}-${i}`}
                      className="text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--state-correct)] px-3 py-2 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
                    >
                      {option}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
            {/* Matching: correct option per left item as green chips. */}
            {isMatching && !!correctMatches?.length && (
              <motion.div
                className="w-full rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]"
                variants={reveal.item()}
                transition={reveal.spring}
              >
                <p className="mb-2 text-sm font-semibold text-[color:var(--game-fg)]">
                  {t("game:matching.correctMatches")}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {correctMatches.map((match, i) => (
                    <span
                      key={`${match}-${i}`}
                      className="text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--state-correct)] px-3 py-2 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
                    >
                      {match}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
            {/* Drop-pin: reveal the image plus the correct-location label. The
                hotspots array is NOT on the SHOW_RESPONSES payload, so no zone
                overlay — correctHotspotIndex only gates whether a zone exists. */}
            {isDropPin &&
              !!(
                media?.url ||
                correctAnswer ||
                correctHotspotIndex != null
              ) && (
                <motion.div
                  className="flex w-full flex-col items-center gap-3 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]"
                  variants={reveal.item()}
                  transition={reveal.spring}
                >
                  {media?.url && (
                    <img
                      src={media.url}
                      alt={t("game:dropPin.correctLocation")}
                      className="max-h-[40vh] max-w-full rounded-[var(--radius-theme)] border border-[var(--border-hairline)] object-contain"
                    />
                  )}
                  <p className="text-sm font-semibold text-[color:var(--game-fg)]">
                    {t("game:dropPin.correctLocation")}
                  </p>
                  {correctAnswer && (
                    <span className="text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--state-correct)] px-3 py-2 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]">
                      {correctAnswer}
                    </span>
                  )}
                </motion.div>
              )}
          </motion.div>
        ) : (
          <motion.div
            className={`mt-8 grid h-40 w-full max-w-3xl items-end gap-4 px-2 lg:h-[clamp(16rem,45vh,32rem)]`}
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
                  <span className="text-color-field-ink w-full bg-[color:var(--color-field-ink)]/20 text-center text-lg font-bold tabular-nums drop-shadow-md lg:text-[clamp(1.25rem,3vh,2.5rem)]">
                    {responses[key] || 0}
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {!isSlider &&
        !isTypeAnswer &&
        !isSentenceBuilder &&
        !isSequencing &&
        !isMathematik &&
        !isWortarten &&
        !isFillBlank &&
        !isMatching &&
        !isDropPin && (
          <div>
            <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-1 rounded-full px-2 text-lg font-bold md:text-xl lg:max-w-[85vw] lg:text-[clamp(1.25rem,3vh,2.5rem)]">
              {answerList.map((answer, key) => (
                <AnswerButton
                  key={key}
                  colorIndex={key}
                  label={answerLabel(key)}
                  correct={
                    isUnscoredQuestionType(type)
                      ? undefined
                      : solutionList.includes(key)
                  }
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
