/**
 * SoloAnswers — a self-contained answer UI for the offline solo play mode.
 *
 * Mirrors the layout of Answers.tsx but uses REST instead of socket.emit:
 * - POSTs /api/quizz/:id/check-answer
 * - No low-latency / ack / socket logic
 * - Calls store.submitAnswer() on submit and store.nextQuestion() on continue
 *
 * Wires the shared answers/ leaf components (ChoiceGrid, MultiSelectGrid, ...)
 * with `testIdPrefix="solo-"`, keeping transport/timer/feedback logic here.
 */
import type { SoloQuestion } from "@razzoozle/common/types/game"
import Markdown from "@razzoozle/web/components/Markdown"
import QuestionMedia from "@razzoozle/web/components/QuestionMedia"
import { QuestionStage } from "@razzoozle/web/features/game/components/stage/QuestionStage"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { buildWortartenAnswer } from "@razzoozle/web/features/game/components/answers/buildWortartenAnswer"
import ChoiceGrid from "@razzoozle/web/features/game/components/answers/ChoiceGrid"
import MathematikInput from "@razzoozle/web/features/game/components/answers/MathematikInput"
import MultiSelectGrid from "@razzoozle/web/features/game/components/answers/MultiSelectGrid"
import SentenceBuilderBoard from "@razzoozle/web/features/game/components/answers/SentenceBuilderBoard"
import SliderInput from "@razzoozle/web/features/game/components/answers/SliderInput"
import TypeAnswerInput from "@razzoozle/web/features/game/components/answers/TypeAnswerInput"
import WortartenPicker from "@razzoozle/web/features/game/components/answers/WortartenPicker"
import CircularTimer from "@razzoozle/web/features/game/components/CircularTimer"
import { useSoloStore } from "@razzoozle/web/features/game/stores/solo"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import { fireCenterSalvo } from "@razzoozle/web/features/game/utils/confetti"
import {
  hapticError,
  hapticSuccess,
  hapticTap,
} from "@razzoozle/web/features/game/utils/haptics"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Chip {
  text: string
  originalIndex: number
  id: string
}

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
  const [mathematikAnswer, setMathematikAnswer] = useState("")
  // Wortarten: the POS label string picked for each token (null = unset),
  // index-aligned with question.tokens. Which token's picker is open (one at
  // a time).
  const [wortartenChoices, setWortartenChoices] = useState<
    Array<string | null>
  >(() =>
    question.type === "wortarten"
      ? new Array(question.tokens?.length ?? 0).fill(null)
      : [],
  )
  const [openTokenIndex, setOpenTokenIndex] = useState<number | null>(null)
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
const isSentenceBuilder = question.type === "sentence-builder" && question.shuffledChunks?.length
  const isMathematik = question.type === "mathematik"
  const isWortarten = question.type === "wortarten"

  const isTokenDisabled = (i: number): boolean => {
    const disabledTokens = question.disabledTokens ?? []
    return disabledTokens.includes(i)
  }

  const [sliderValue, setSliderValue] = useState(
    isSlider ? Math.round(((question.min ?? 0) + (question.max ?? 100)) / 2) : 0,
  )

  // Sentence-builder: bank (shuffled chips) and placed (in tap order)
  const [bankChips, setBankChips] = useState<Chip[]>(() => {
    if (isSentenceBuilder && question.shuffledChunks) {
      return question.shuffledChunks.map((text, idx) => ({
        text,
        originalIndex: idx,
        id: `${idx}-${Math.random()}`,
      }))
    }
    return []
  })
  const [placedChips, setPlacedChips] = useState<Chip[]>([])

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
    } else if (!lastResult.poll) {
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
    } else if (isSentenceBuilder) {
      void submitAnswer(quizzId, { answerText: placedChips.map(c => c.text).join(" ") })
    } else if (isMathematik) {
      void submitAnswer(quizzId, { answerText: mathematikAnswer.trim() || "" })
    } else if (isWortarten) {
      const answerArray = buildWortartenAnswer(wortartenChoices, question.disabledTokens)
      void submitAnswer(quizzId, {
        answerText: JSON.stringify(answerArray),
      })
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

  const submitSentenceBuilder = () => {
    if (submitted || placedChips.length === 0) return
    setSubmitted(true)
    sfxPop()
    hapticTap()
    if (timerRef.current) clearInterval(timerRef.current)
    void submitAnswer(quizzId, { answerText: placedChips.map(c => c.text).join(" ") })
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


  const submitMathematikAnswer = () => {
    if (submitted || !mathematikAnswer.trim()) return
    setSubmitted(true)
    sfxPop()
    hapticTap()
    if (timerRef.current) clearInterval(timerRef.current)
    void submitAnswer(quizzId, { answerText: mathematikAnswer.trim() })
  }

  // Wortarten: submit once every active token has a chosen POS label. answerText is
  // a JSON array of POS label strings, one per token (same contract as the
  // multiplayer path — rust/engine/src/eval.rs Wortarten arm). Disabled tokens
  // submit as "" (W2-10 shared builder).
  const submitWortarten = () => {
    if (submitted || wortartenChoices.length === 0) return

    const hasIncompleteActiveTokens = wortartenChoices.some(
      (choice, idx) => !isTokenDisabled(idx) && choice === null,
    )

    if (hasIncompleteActiveTokens) return

    setSubmitted(true)
    sfxPop()
    hapticTap()
    if (timerRef.current) clearInterval(timerRef.current)

    const answerArray = buildWortartenAnswer(wortartenChoices, question.disabledTokens)

    void submitAnswer(quizzId, {
      answerText: JSON.stringify(answerArray),
    })
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

  // Format decimals hint for mathematik input
  const decimalsHint = question.decimals
    ? t("game:mathematik.decimalHint", { count: question.decimals, defaultValue: `${question.decimals} decimal places` })
    : undefined

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <QuestionStage
        question={question.question}
        media={question.media}
        hud={
          <div className="mx-auto mb-4 flex w-full max-w-7xl items-center justify-between gap-1 px-2 text-lg font-bold text-[color:var(--game-fg)] md:text-xl lg:max-w-[85vw] lg:text-[clamp(1rem,2.5vh,2rem)]">
            {/* Kahoot-style circular countdown — same as the live game. `countdown`
                is the remaining seconds; `question.time` is the total. */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm">{t("game:hud.time")}</span>
              <CircularTimer seconds={countdown} total={question.time} size={72} />
            </div>
          </div>
        }
      />

      <div>
        {isTypeAnswer ? (
          <TypeAnswerInput
            value={textAnswer}
            onChange={setTextAnswer}
            onSubmit={submitTextAnswer}
            disabled={submitted}
            feedback={resultReady ? { correct: lastResult.correct } : undefined}
            testIdPrefix="solo-"
          />
        ) : isMathematik ? (
          <MathematikInput
            value={mathematikAnswer}
            onChange={setMathematikAnswer}
            onSubmit={submitMathematikAnswer}
            disabled={submitted}
            decimalsHint={decimalsHint}
            testIdPrefix="solo-"
          />
        ) : isWortarten ? (
          <WortartenPicker
            value={{ choices: wortartenChoices, openTokenIndex }}
            onChange={(next) => {
              // Same "picked vs. just opened/closed a picker" reference-equality
              // trick as the MP wiring (see Answers.tsx) — the leaf passes the
              // SAME `choices` array back on open/close, a NEW one on a pick.
              const picked = next.choices !== wortartenChoices
              setWortartenChoices(next.choices)
              setOpenTokenIndex(next.openTokenIndex)
              if (picked) {
                sfxPop()
                hapticTap()
              }
            }}
            onSubmit={submitWortarten}
            disabled={submitted}
            feedback={resultReady ? { correct: lastResult.correct } : undefined}
            testIdPrefix="solo-"
            sentence={question.sentence}
            tokens={question.tokens}
            posSet={question.posSet}
            disabledTokens={question.disabledTokens}
          />
        ) : isSentenceBuilder ? (
          <SentenceBuilderBoard
            value={{ bank: bankChips, placed: placedChips }}
            onChange={(next) => {
              setBankChips(next.bank)
              setPlacedChips(next.placed)
              sfxPop()
              hapticTap()
            }}
            onSubmit={submitSentenceBuilder}
            disabled={submitted}
            feedback={resultReady ? { correct: lastResult.correct } : undefined}
            testIdPrefix="solo-"
          />
        ) : isMultiSelect ? (
          <MultiSelectGrid
            value={multiSelectedKeys}
            onChange={(next) => {
              setMultiSelectedKeys(next)
              sfxPop()
              hapticTap()
            }}
            onSubmit={submitMultiSelect}
            disabled={submitted}
            feedback={resultReady ? { correct: lastResult.correct } : undefined}
            testIdPrefix="solo-"
            answers={question.answers ?? []}
          />
        ) : isSlider ? (
          <SliderInput
            value={sliderValue}
            onChange={setSliderValue}
            onSubmit={submitSlider}
            disabled={submitted}
            min={question.min ?? 0}
            max={question.max ?? 100}
            step={question.step ?? 1}
            unit={question.unit}
            feedback={resultReady ? { correct: lastResult.correct } : undefined}
            testIdPrefix="solo-"
          />
        ) : (
          <ChoiceGrid
            value={selectedKey}
            onChange={(key) => {
              if (key !== null) handleAnswer(key)()
            }}
            onSubmit={() => {}}
            disabled={submitted}
            feedback={resultReady ? { correct: lastResult.correct } : undefined}
            testIdPrefix="solo-"
            answers={question.answers}
          />
        )}
      </div>
    </div>
  )
}

export default SoloAnswers
