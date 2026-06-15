/**
 * SoloAnswers — a self-contained answer UI for the offline solo play mode.
 *
 * Mirrors the layout of Answers.tsx but uses REST instead of socket.emit:
 * - POSTs /api/quizz/:id/check-answer
 * - No low-latency / ack / socket logic
 * - Calls store.submitAnswer() on submit and store.nextQuestion() on continue
 *
 * Reuses AnswerButton, ANSWERS_COLORS, ANSWERS_LABELS from the shared game layer.
 */
import type { SoloQuestion } from "@razzoozle/common/types/game"
import Markdown from "@razzoozle/web/components/Markdown"
import QuestionMedia from "@razzoozle/web/components/QuestionMedia"
import AnswerButton from "@razzoozle/web/features/game/components/AnswerButton"
import CircularTimer from "@razzoozle/web/features/game/components/CircularTimer"
import RewardStack from "@razzoozle/web/features/game/components/RewardStack"
import { useSoloStore } from "@razzoozle/web/features/game/stores/solo"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzoozle/web/features/game/utils/answers"
import { SFX } from "@razzoozle/web/features/game/utils/constants"
import { fireCenterSalvo } from "@razzoozle/web/features/game/utils/confetti"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import clsx from "clsx"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  quizzId: string
  question: SoloQuestion
}

const SoloAnswers = ({ quizzId, question }: Props) => {
  const { submitAnswer, lastResult, lastAchievements, phase } = useSoloStore()
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false

  const [selectedKey, setSelectedKey] = useState<number | null>(null)
  const [multiSelectedKeys, setMultiSelectedKeys] = useState<number[]>([])
  const [textAnswer, setTextAnswer] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [countdown, setCountdown] = useState(question.time)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [sfxPop] = useSound(SFX.ANSWERS.SOUND, { volume: 0.1 })
  const [sfxCorrect] = useSound(SFX.RESULTS_SOUND, { volume: 0.2 })
  const [sfxWrong] = useSound(SFX.BOUMP_SOUND, { volume: 0.3 })
  const [playMusic, { stop: stopMusic }] = useSound(SFX.ANSWERS.MUSIC, {
    volume: 0.2,
    interrupt: true,
    loop: true,
  })

  const isSlider = question.type === "slider" && question.min != null && question.max != null
  const isMultiSelect = question.type === "multiple-select"
  const isTypeAnswer = question.type === "type-answer"

  const [sliderValue, setSliderValue] = useState(
    isSlider ? Math.round(((question.min ?? 0) + (question.max ?? 100)) / 2) : 0,
  )

  // Start countdown on mount
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!)
          // Auto-submit if time runs out and not yet submitted
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Start background music
  useEffect(() => {
    playMusic()
    return () => {
      stopMusic()
    }
    // oxlint-disable-next-line
  }, [playMusic])

  // Stop answer music the moment the player locks in an answer.
  useEffect(() => {
    if (submitted) stopMusic()
  }, [submitted, stopMusic])

  // On the result transition: fire the chime + confetti once. Guarded by a ref
  // so a re-render (or the AnimatePresence float) cannot replay them.
  const resultFiredRef = useRef(false)
  useEffect(() => {
    if (phase !== "result" || lastResult === null || resultFiredRef.current) {
      return
    }
    resultFiredRef.current = true

    // Ensure the answer music is silenced before the chime plays.
    stopMusic()

    if (lastResult.correct) {
      sfxCorrect()
      fireCenterSalvo(reduced)
    } else {
      sfxWrong()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lastResult])

  // Auto-submit when time runs out (if not already submitted)
  const hasAutoSubmittedRef = useRef(false)
  useEffect(() => {
    if (countdown === 0 && !submitted && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true
      handleAutoSubmit()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

  const handleAutoSubmit = () => {
    if (submitted) return
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)
    if (isSlider) {
      void submitAnswer(quizzId, { answerId: sliderValue })
    } else if (isMultiSelect) {
      void submitAnswer(quizzId, { answerIds: multiSelectedKeys })
    } else if (isTypeAnswer) {
      void submitAnswer(quizzId, { answerText: textAnswer.trim() || "" })
    } else if (selectedKey !== null) {
      void submitAnswer(quizzId, { answerId: selectedKey })
    } else {
      // No answer selected — submit empty (wrong)
      void submitAnswer(quizzId, {})
    }
  }

  const handleAnswer = (key: number) => () => {
    if (submitted) return
    setSelectedKey(key)
    sfxPop()
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)
    void submitAnswer(quizzId, { answerId: key })
  }

  const handleMultiAnswer = (key: number) => () => {
    if (submitted) return
    setMultiSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
    sfxPop()
  }

  const submitMultiSelect = () => {
    if (submitted) return
    setSubmitted(true)
    sfxPop()
    if (timerRef.current) clearInterval(timerRef.current)
    void submitAnswer(quizzId, { answerIds: multiSelectedKeys })
  }

  const submitTextAnswer = () => {
    if (submitted) return
    const trimmed = textAnswer.trim()
    if (!trimmed) return
    setSubmitted(true)
    sfxPop()
    if (timerRef.current) clearInterval(timerRef.current)
    void submitAnswer(quizzId, { answerText: trimmed })
  }

  const submitSlider = () => {
    if (submitted) return
    setSubmitted(true)
    sfxPop()
    if (timerRef.current) clearInterval(timerRef.current)
    void submitAnswer(quizzId, { answerId: sliderValue })
  }

  // Show result feedback inline when server responded (phase === "result")
  const resultReady = phase === "result" && lastResult !== null

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex min-h-0 w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5 overflow-hidden lg:max-w-[85vw]">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,4.5vh,5rem)]">
          <Markdown>{question.question}</Markdown>
        </h2>

        <QuestionMedia media={question.media} alt={question.question} />
      </div>

      <div>
        <div className="mx-auto mb-4 flex w-full max-w-7xl items-center justify-between gap-1 px-2 text-lg font-bold text-white md:text-xl lg:max-w-[85vw] lg:text-[clamp(1rem,2.5vh,2rem)]">
          {/* Kahoot-style circular countdown — same as the live game. `countdown`
              is the remaining seconds; `question.time` is the total. */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm">{t("game:hud.time")}</span>
            <CircularTimer seconds={countdown} total={question.time} size={72} />
          </div>
        </div>

        {/* Inline result feedback */}
        {resultReady && (
          <div
            className={clsx(
              "mx-auto mb-4 w-full max-w-7xl rounded-xl px-6 py-4 text-center text-xl font-bold text-white lg:max-w-[85vw]",
              lastResult.correct ? "bg-green-600/80" : "bg-red-600/80",
            )}
          >
            {lastResult.correct ? (
              <span>
                {t("game:correct")} +{lastResult.points}
              </span>
            ) : (
              <span>{t("game:wrong")}</span>
            )}
          </div>
        )}

        {/* BOUNDED solo badges — reuse the SHARED RewardStack verbatim. It
            self-fetches meta + honors reduced-motion. ids = server sharpshooter
            ∪ client-derived streak badges (merged + deduped in the solo store). */}
        {resultReady && lastAchievements.length > 0 && (
          <RewardStack
            achievementIds={lastAchievements}
            visible={resultReady}
          />
        )}

        {isTypeAnswer ? (
          <div className="mx-auto mb-4 flex w-full max-w-xl flex-col gap-4 px-4">
            <input
              type="text"
              maxLength={200}
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitTextAnswer()
              }}
              disabled={submitted}
              placeholder={t("game:typeAnswerPlaceholder")}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              className="w-full rounded-xl border-2 border-white/40 bg-white/20 px-5 py-4 text-xl font-semibold text-white placeholder-white/50 outline-none focus:border-white disabled:opacity-50 lg:py-6 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
            />
            <button
              type="button"
              onClick={submitTextAnswer}
              disabled={submitted || textAnswer.trim().length === 0}
              className="bg-primary rounded-xl px-8 py-3 text-xl font-bold text-white disabled:opacity-50 lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
            >
              {t("game:submitAnswer")}
            </button>
          </div>
        ) : isMultiSelect ? (
          <div className="mx-auto mb-4 flex w-full max-w-7xl flex-col gap-4 px-2 lg:max-w-[85vw]">
            <p className="text-center text-sm font-medium text-white/80">
              {t("quizz:multipleSelect.selectHint")}
            </p>
            <div className="grid w-full grid-cols-2 gap-1 text-lg font-bold text-white md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]">
              {(question.answers ?? []).map((answer, key) => {
                const isPicked = multiSelectedKeys.includes(key)
                return (
                  <motion.div
                    key={key}
                    initial={
                      reduced ? { opacity: 0 } : { opacity: 0, y: 50 }
                    }
                    animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    transition={
                      reduced
                        ? { duration: 0.2 }
                        : {
                            delay: key * 0.1,
                            type: "spring",
                            stiffness: 300,
                            damping: 24,
                          }
                    }
                    className="flex"
                  >
                    <AnswerButton
                      colorIndex={key}
                      className={clsx(
                        "w-full",
                        ANSWERS_COLORS[key],
                        !reduced &&
                          !submitted &&
                          "transition-transform hover:scale-[1.02] hover:ring-4 hover:ring-white/40",
                        submitted && "opacity-50",
                        isPicked && "ring-4 ring-white/80",
                        resultReady &&
                          isPicked &&
                          (lastResult.correct
                            ? "!bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)]"
                            : "!bg-red-500"),
                      )}
                      label={ANSWERS_LABELS[key]}
                      disabled={submitted}
                      onClick={handleMultiAnswer(key)}
                    >
                      <Markdown>{answer}</Markdown>
                    </AnswerButton>
                  </motion.div>
                )
              })}
            </div>
            <button
              type="button"
              onClick={submitMultiSelect}
              disabled={submitted || multiSelectedKeys.length === 0}
              className="bg-primary mx-auto rounded-xl px-8 py-3 text-xl font-bold text-white disabled:opacity-50 lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
            >
              {t("quizz:multipleSelect.submitButton")}
            </button>
          </div>
        ) : isSlider ? (
          <div className="mx-auto mb-4 flex w-full max-w-2xl flex-col items-center gap-4 px-4">
            <div className="text-5xl font-bold text-white drop-shadow-lg lg:text-[clamp(3rem,8vh,8rem)]">
              {sliderValue}
              {question.unit ? ` ${question.unit}` : ""}
            </div>
            <input
              type="range"
              min={question.min}
              max={question.max}
              step={question.step ?? 1}
              value={sliderValue}
              disabled={submitted}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="quiz-range accent-primary h-3 w-full cursor-pointer appearance-none rounded-full bg-white/40 disabled:cursor-not-allowed lg:h-[clamp(0.75rem,1.5vh,1.5rem)]"
            />
            <div className="flex w-full justify-between text-sm font-semibold text-white/70 lg:text-[clamp(1rem,2.5vh,2rem)]">
              <span>
                {question.min}
                {question.unit ? ` ${question.unit}` : ""}
              </span>
              <span>
                {question.max}
                {question.unit ? ` ${question.unit}` : ""}
              </span>
            </div>
            <button
              onClick={submitSlider}
              disabled={submitted}
              className="bg-primary rounded-xl px-8 py-3 text-xl font-bold text-white disabled:opacity-50 lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
            >
              {submitted ? t("game:slider.submitted") : t("game:slider.submit")}
            </button>
          </div>
        ) : (
          <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-1 px-2 text-lg font-bold text-white md:text-xl lg:max-w-[85vw] lg:text-[clamp(1.25rem,3vh,2.5rem)]">
            {(question.answers ?? []).map((answer, key) => {
              const isPicked = selectedKey === key
              return (
                <motion.div
                  key={key}
                  initial={
                    reduced ? { opacity: 0 } : { opacity: 0, y: 50 }
                  }
                  animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={
                    reduced
                      ? { duration: 0.2 }
                      : {
                          delay: key * 0.1,
                          type: "spring",
                          stiffness: 300,
                          damping: 24,
                        }
                  }
                  className="relative flex"
                >
                  <AnswerButton
                    colorIndex={key}
                    className={clsx(
                      "w-full",
                      ANSWERS_COLORS[key],
                      !reduced &&
                        !submitted &&
                        "transition-transform hover:scale-[1.02] hover:ring-4 hover:ring-white/40",
                      submitted &&
                        selectedKey !== null &&
                        selectedKey !== key &&
                        "opacity-40",
                      submitted && isPicked && "ring-4 ring-white/80",
                      resultReady &&
                        isPicked &&
                        (lastResult.correct
                          ? "!bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)]"
                          : "!bg-red-500"),
                    )}
                    label={ANSWERS_LABELS[key]}
                    disabled={submitted}
                    onClick={handleAnswer(key)}
                  >
                    <Markdown>{answer}</Markdown>
                  </AnswerButton>

                  {/* Floating +points on a correct pick */}
                  <AnimatePresence>
                    {resultReady &&
                      isPicked &&
                      lastResult.correct &&
                      lastResult.points > 0 && (
                        <motion.span
                          key="floating-points"
                          initial={{ opacity: 0, y: 0 }}
                          animate={{ opacity: [0, 1, 0], y: -60 }}
                          transition={{ duration: 1.2 }}
                          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
                        >
                          +{lastResult.points}
                        </motion.span>
                      )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default SoloAnswers
