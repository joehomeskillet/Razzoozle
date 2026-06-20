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
import { useSoloStore } from "@razzoozle/web/features/game/stores/solo"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzoozle/web/features/game/utils/answers"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import { fireCenterSalvo } from "@razzoozle/web/features/game/utils/confetti"
import {
  hapticError,
  hapticSuccess,
  hapticTap,
} from "@razzoozle/web/features/game/utils/haptics"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { motion } from "motion/react"
import clsx from "clsx"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  quizzId: string
  question: SoloQuestion
}

const SoloAnswers = ({ quizzId, question }: Props) => {
  const { submitAnswer, lastResult, phase } = useSoloStore()
  const muted = useSoundStore((s) => s.muted)
  const { t } = useTranslation()
  const reveal = useReveal()
  const reduced = reveal.reduced

  const [selectedKey, setSelectedKey] = useState<number | null>(null)
  const [multiSelectedKeys, setMultiSelectedKeys] = useState<number[]>([])
  const [textAnswer, setTextAnswer] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [countdown, setCountdown] = useState(question.time)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const popUrl = useSoundUrl("answersSound")
  const resultsUrl = useSoundUrl("results")
  const boumpUrl = useSoundUrl("boump")
  const musicUrl = useSoundUrl("answersMusic")
  const [sfxPop] = useSound(popUrl, {
    volume: 0.1,
    soundEnabled: !muted,
  })
  const [sfxCorrect] = useSound(resultsUrl, {
    volume: 0.2,
    soundEnabled: !muted,
  })
  const [sfxWrong] = useSound(boumpUrl, {
    volume: 0.3,
    soundEnabled: !muted,
  })
  const [playMusic, { stop: stopMusic }] = useSound(musicUrl, {
    volume: 0.2,
    interrupt: true,
    loop: true,
    soundEnabled: !muted,
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
      hapticSuccess()
      fireCenterSalvo(reduced)
    } else {
      sfxWrong()
      hapticError()
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
    hapticTap()
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
    hapticTap()
  }

  const submitMultiSelect = () => {
    if (submitted) return
    setSubmitted(true)
    sfxPop()
    hapticTap()
    if (timerRef.current) clearInterval(timerRef.current)
    void submitAnswer(quizzId, { answerIds: multiSelectedKeys })
  }

  const submitTextAnswer = () => {
    if (submitted) return
    const trimmed = textAnswer.trim()
    if (!trimmed) return
    setSubmitted(true)
    sfxPop()
    hapticTap()
    if (timerRef.current) clearInterval(timerRef.current)
    void submitAnswer(quizzId, { answerText: trimmed })
  }

  const submitSlider = () => {
    if (submitted) return
    setSubmitted(true)
    sfxPop()
    hapticTap()
    if (timerRef.current) clearInterval(timerRef.current)
    void submitAnswer(quizzId, { answerId: sliderValue })
  }

  // Show result feedback inline when server responded (phase === "result")
  const resultReady = phase === "result" && lastResult !== null

  // Render order: for solo, always use canonical order (no displayOrder from server).
  // SAFETY: all tile references use the canonical index key, not the visual position.
  const renderOrder = question.answers?.map((_, i) => i) ?? []

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex min-h-0 w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5 overflow-hidden lg:max-w-[85vw]">
        <h2 className="text-center text-2xl font-bold text-[color:var(--game-fg)] drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,4.5vh,5rem)]">
          <Markdown>{question.question}</Markdown>
        </h2>

        <QuestionMedia media={question.media} alt={question.question} />
      </div>

      <div>
        <div className="mx-auto mb-4 flex w-full max-w-7xl items-center justify-between gap-1 px-2 text-lg font-bold text-[color:var(--game-fg)] md:text-xl lg:max-w-[85vw] lg:text-[clamp(1rem,2.5vh,2rem)]">
          {/* Kahoot-style circular countdown — same as the live game. `countdown`
              is the remaining seconds; `question.time` is the total. */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm">{t("game:hud.time")}</span>
            <CircularTimer seconds={countdown} total={question.time} size={72} />
          </div>
        </div>

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
              aria-label={t("game:typeAnswerPlaceholder")}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              className="w-full rounded-xl border-2 border-[var(--border-hairline)] bg-white px-5 py-4 text-xl font-semibold text-[color:var(--color-field-ink)] placeholder-[color:var(--color-field-ink)]/60 outline-none focus:border-[color:var(--color-accent)] disabled:opacity-50 lg:py-6 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
            />
            <button
              type="button"
              onClick={submitTextAnswer}
              disabled={submitted || textAnswer.trim().length === 0}
              className="bg-primary rounded-xl px-8 py-3 text-xl font-bold text-white disabled:opacity-50 lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              {t("game:submitAnswer")}
            </button>
          </div>
        ) : isMultiSelect ? (
          <div className="mx-auto mb-4 flex w-full max-w-7xl flex-col gap-4 px-2 lg:max-w-[85vw]">
            <p className="text-center text-sm font-medium text-[color:var(--game-fg)]/80">
              {t("quizz:multipleSelect.selectHint")}
            </p>
            <div className="grid w-full grid-cols-2 gap-1 text-lg font-bold text-white md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]">
              {renderOrder.map((key: number) => {
                const answer = question.answers?.[key]
                const isPicked = multiSelectedKeys.includes(key)
                return (
                  <motion.div
                    key={key}
                    variants={{
                      ...reveal.item(50),
                      // Already-visible tile: emphasis pulse from the CURRENT
                      // scale (1 -> 1.06 -> 1), NOT the entrance pop's 0.6 start
                      // which would shrink the tile toward centre on reveal.
                      popped: reveal.reduced ? { opacity: 1 } : { scale: [1, 1.06, 1] },
                    }}
                    initial="hidden"
                    animate={resultReady && isPicked ? "popped" : "visible"}
                    transition={
                      resultReady && isPicked ? reveal.snap : reveal.spring
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
                            ? "!bg-[var(--state-correct)] ring-2 ring-[var(--state-correct)]"
                            : "!bg-[var(--state-wrong)]"),
                      )}
                      label={ANSWERS_LABELS[key]}
                      disabled={submitted}
                      onClick={handleMultiAnswer(key)}
                    >
                      <Markdown>{answer || ""}</Markdown>
                    </AnswerButton>
                  </motion.div>
                )
              })}
            </div>
            <button
              type="button"
              onClick={submitMultiSelect}
              disabled={submitted || multiSelectedKeys.length === 0}
              className="bg-primary mx-auto rounded-xl px-8 py-3 text-xl font-bold text-white disabled:opacity-50 lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              {t("quizz:multipleSelect.submitButton")}
            </button>
          </div>
        ) : isSlider ? (
          <div className="mx-auto mb-4 flex w-full max-w-2xl flex-col items-center gap-4 px-4">
            <div className="text-5xl font-bold text-[color:var(--game-fg)] drop-shadow-lg lg:text-[clamp(3rem,8vh,8rem)]">
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
              aria-label={t("game:sliderAnswerLabel", { defaultValue: "Answer value" })}
              aria-valuetext={`${sliderValue}${question.unit ? ` ${question.unit}` : ""}`}
              className="quiz-range accent-primary h-3 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--color-field-ink)]/5 disabled:cursor-not-allowed lg:h-[clamp(0.75rem,1.5vh,1.5rem)]"
            />
            <div className="flex w-full justify-between text-sm font-semibold text-[color:var(--game-fg)]/70 lg:text-[clamp(1rem,2.5vh,2rem)]">
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
              className="bg-primary rounded-xl px-8 py-3 text-xl font-bold text-white disabled:opacity-50 lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              {submitted ? t("game:slider.submitted") : t("game:slider.submit")}
            </button>
          </div>
        ) : (
          <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-1 px-2 text-lg font-bold text-white md:text-xl lg:max-w-[85vw] lg:text-[clamp(1.25rem,3vh,2.5rem)]">
            {renderOrder.map((key: number) => {
              const answer = question.answers?.[key]
              const isPicked = selectedKey === key
              return (
                <motion.div
                  key={key}
                  variants={{
                    ...reveal.item(50),
                    // Already-visible tile: emphasis pulse from the CURRENT
                    // scale (1 -> 1.06 -> 1), NOT the entrance pop's 0.6 start
                    // which would shrink the tile toward centre on reveal.
                    popped: reveal.reduced ? { opacity: 1 } : { scale: [1, 1.06, 1] },
                  }}
                  initial="hidden"
                  animate={resultReady && isPicked ? "popped" : "visible"}
                  transition={
                    resultReady && isPicked ? reveal.snap : reveal.spring
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
                          ? "!bg-[var(--state-correct)] ring-2 ring-[var(--state-correct)]"
                          : "!bg-[var(--state-wrong)]"),
                    )}
                    label={ANSWERS_LABELS[key]}
                    disabled={submitted}
                    onClick={handleAnswer(key)}
                  >
                    <Markdown>{answer || ""}</Markdown>
                  </AnswerButton>
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
