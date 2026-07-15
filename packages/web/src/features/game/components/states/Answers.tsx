import { EVENTS, MEDIA_TYPES } from "@razzoozle/common/constants"
import type { QuestionMediaType } from "@razzoozle/common/types/game"
import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import Markdown from "@razzoozle/web/components/Markdown"
import QuestionMedia from "@razzoozle/web/components/QuestionMedia"
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
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useAnswerStore } from "@razzoozle/web/features/game/stores/answer"
import { useQuestionStore } from "@razzoozle/web/features/game/stores/question"
import { useLowLatencyStore } from "@razzoozle/web/features/game/stores/lowLatency"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import { hapticTap } from "@razzoozle/web/features/game/utils/haptics"
import { monoNow } from "@razzoozle/web/features/game/utils/monoNow"
import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"
import { v7 as uuid } from "uuid"

interface Props {
  data: CommonStatusDataMap["SELECT_ANSWER"]
}

// How long to wait for a server answer:ack before showing the "wird gesendet…"
// hint. We do NOT resend — a missing ack just means the network is slow; the
// server is idempotent and will count the first arrival.
const ACK_PENDING_HINT_MS = 800

const Answers = ({
  data: {
    question,
    answers,
    media,
    submittedBy,
    time,
    totalPlayer,
    type,
    min,
    max,
    step,
    unit,
    shuffledChunks,
    // Wortarten: the source sentence, its whitespace tokens, and the fixed
    // POS label set the player picks from (server contract — see
    // rust/protocol/src/quizz.rs + packages/common/src/types/game/status.ts).
    sentence,
    tokens,
    posSet,
    // Wortarten: indices of tokens that are disabled (not scored/clickable).
    disabledTokens,
    // Low-latency server-timing anchors (all OPTIONAL — undefined in normal
    // mode). Used ONLY to render the countdown, never for scoring.
    serverNowMs,
    answerDeadlineAtServerMs,
  },
}: Props) => {
  const { socket } = useSocket()
  const { player, gameId } = usePlayerStore()
  const muted = useSoundStore((s) => s.muted)
  const llActive = useLowLatencyStore((s) => s.active)
  const clockOffsetMs = useLowLatencyStore((s) => s.offsetMs)
  const playerToken = localStorage.getItem(`player_token:${gameId}`) ?? undefined
  const displayOrder = useQuestionStore((s) => s.displayOrder)
  // Resume signal: did the server tell us we already answered this question?
  const resumeAnswered = useAnswerStore(
    (s) => s.alreadyAnswered && s.gameId === gameId,
  )
  const setSubmittedChunks = useAnswerStore((s) => s.setSubmittedChunks)

  // Low-latency mode is active for THIS question when the master flag is on and
  // the payload actually carried a server deadline to count down from.
  const hasServerDeadline = typeof answerDeadlineAtServerMs === "number"
  const lowLatency = llActive && hasServerDeadline

  const isSlider = type === "slider" && min != null && max != null
  const isMultiSelect = type === "multiple-select"
  const isTypeAnswer = type === "type-answer"
  const isSentenceBuilder = type === "sentence-builder"
  const isMathematik = type === "mathematik"
  const isWortarten = type === "wortarten"
  const [cooldown, setCooldown] = useState(() =>
    time > 100000
      ? Math.max(0, Math.ceil(((time * 1000) - Date.now()) / 1000))
      : time,
  )
  const [totalAnswer, setTotalAnswer] = useState(0)
  const [sliderValue, setSliderValue] = useState(
    type === "slider" && min != null && max != null
      ? Math.round((min + max) / 2)
      : 0,
  )
  // `submitted` covers slider (today's behaviour) AND, in low-latency mode,
  // multiple-choice (lock after first tap). In normal mode multiple-choice stays
  // unlocked exactly as before. Seeded from the resume signal so a reconnected
  // player who already answered sees the locked/answered state immediately.
  const [submitted, setSubmitted] = useState(resumeAnswered)
  // Which answer key the player tapped (for instant local highlight). -1 = none.
  const [selectedKey, setSelectedKey] = useState<number | null>(null)
  // Multiple-select: the set of option keys the player has toggled on. Reset to
  // [] per question via remount (same lifecycle as `selectedKey`/`submitted`).
  const [multiSelectedKeys, setMultiSelectedKeys] = useState<number[]>([])
  // Type-answer: the free-text the player is entering. Reset likewise per question.
  const [textAnswer, setTextAnswer] = useState("")
  // Mathematik: the numeric answer the player is entering. Reset per question.
  const [mathematikAnswer, setMathematikAnswer] = useState("")
  // Wortarten: the POS label string the player picked for each token (null =
  // not yet chosen), index-aligned with `tokens`. Reset per question below.
  const [wortartenChoices, setWortartenChoices] = useState<
    Array<string | null>
  >([])
  // Wortarten: which token's POS picker is currently open (one at a time).
  const [openTokenIndex, setOpenTokenIndex] = useState<number | null>(null)
  const [bankChips, setBankChips] = useState<
    Array<{ text: string; originalIndex: number; id: string }>
  >([])
  const [placedChunks, setPlacedChunks] = useState<
    Array<{ text: string; originalIndex: number; id: string }>
  >([])
  // True once we've sent an answer but not yet seen its ack (LL mode only).
  const [ackPending, setAckPending] = useState(false)
  // The clientMessageId of the in-flight answer, so we can match its ack.
  const pendingMessageIdRef = useRef<string | null>(null)
  // Monotonic send timestamp of the in-flight answer, to measure ack latency
  // (send → ack) for the host health widget. Null when no answer is pending.
  const pendingSentAtRef = useRef<number | null>(null)
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { t } = useTranslation()

  // Arm the ack-pending hint timer. Sets up refs for latency tracking and arms
  // a timeout to show "wird gesendet…" if no ack lands within the window.
  const armAckPending = (clientMessageId: string | undefined) => {
    if (!lowLatency) return

    pendingMessageIdRef.current = clientMessageId ?? null
    pendingSentAtRef.current = monoNow()
    setAckPending(false)

    if (ackTimerRef.current) {
      clearTimeout(ackTimerRef.current)
    }

    ackTimerRef.current = setTimeout(() => {
      setAckPending(true)
    }, ACK_PENDING_HINT_MS)
  }
  // Reduced-motion-aware animation bundle. Drives the one lifecycle moment on
  // this screen (the lock-in confirmation pop); the per-tap press feedback above
  // is CSS-only to keep the hot path cheap.
  const reveal = useReveal()

  const popUrl = useSoundUrl("answersSound")
  const musicUrl = useSoundUrl("answersMusic")
  const [sfxPop] = useSound(popUrl, {
    volume: 0.1,
    soundEnabled: !muted,
  })

  const [playMusic, { stop: stopMusic }] = useSound(musicUrl, {
    volume: 0.2,
    interrupt: true,
    loop: true,
    soundEnabled: !muted,
  })

  // Wortarten: check if a token index is disabled.
  const isTokenDisabled = (i: number): boolean => {
    return disabledTokens?.includes(i) ?? false
  }

  useEffect(() => {
    if (!isSentenceBuilder || !shuffledChunks) {
      return
    }

    const chips = shuffledChunks.map((text, idx) => ({
      text,
      originalIndex: idx,
      id: String(idx),
    }))

    setBankChips(chips)
    setPlacedChunks([])
    setSubmittedChunks(undefined)
  }, [isSentenceBuilder, shuffledChunks, setSubmittedChunks])

  // Wortarten: reset the per-token POS picks (and close any open picker) each
  // time a fresh Wortarten question mounts.
  useEffect(() => {
    if (!isWortarten || !tokens) {
      return
    }

    setWortartenChoices(new Array(tokens.length).fill(null))
    setOpenTokenIndex(null)
    setSubmittedChunks(undefined)
  }, [isWortarten, tokens, setSubmittedChunks])

  // Clear any pending ack timer on unmount so it can't fire after teardown.
  useEffect(
    () => () => {
      if (ackTimerRef.current) {
        clearTimeout(ackTimerRef.current)
      }
    },
    [],
  )

  // Send a multiple-choice answer. In low-latency mode this gives instant local
  // feedback (highlight + sfx synchronously), locks further taps, attaches a
  // per-tap clientMessageId for server idempotency, and arms the ack-pending
  // hint. In normal mode it behaves exactly as before (no lock, no ack tracking).
  const handleAnswer = (answerKey: number) => () => {
    if (!player || !gameId) {
      return
    }

    // Lock after the first tap only in low-latency mode; normal mode keeps
    // today's multi-tap behaviour to stay byte-identical.
    if (lowLatency && submitted) {
      return
    }

    // Instant local visual feedback — set BEFORE awaiting any network round-trip.
    setSelectedKey(answerKey)
    sfxPop()
    hapticTap()

    const clientMessageId = lowLatency ? uuid() : undefined

    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey,
        // OPTIONAL — omitted in normal mode so the server dedups by
        // player+question only (today's behaviour).
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(playerToken ? { playerToken } : {}),
      },
    })

    if (lowLatency) {
      setSubmitted(true)
      armAckPending(clientMessageId)
    }
  }

  const submitSlider = () => {
    if (!player || !gameId || submitted) {
      return
    }

    const clientMessageId = lowLatency ? uuid() : undefined

    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey: sliderValue,
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(playerToken ? { playerToken } : {}),
      },
    })
    setSubmitted(true)
    sfxPop()
    hapticTap()

    armAckPending(clientMessageId)
  }

  // Multiple-select: explicit submit of the toggled set. Sends the sentinel
  // answerKey: -1 plus the selected keys; the server scores the set all-or-nothing.
  const submitMultiSelect = () => {
    if (!player || !gameId || submitted || multiSelectedKeys.length === 0) {
      return
    }

    setSubmitted(true)
    sfxPop()
    hapticTap()
    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey: -1,
        answerKeys: multiSelectedKeys,
        ...(playerToken ? { playerToken } : {}),
      },
    })
  }

  // Type-answer: submit the trimmed free-text. Sends the sentinel answerKey: -1
  // plus answerText. Reuses the same clientMessageId pattern slider uses so the
  // server can dedup in low-latency mode (omitted in normal mode).
  const submitTextAnswer = () => {
    if (!player || !gameId || submitted) {
      return
    }

    const trimmed = textAnswer.trim()

    if (!trimmed) {
      return
    }

    const clientMessageId = lowLatency ? uuid() : undefined

    setSubmitted(true)
    sfxPop()
    hapticTap()
    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey: -1,
        answerText: trimmed,
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(playerToken ? { playerToken } : {}),
      },
    })

    if (lowLatency) {
      armAckPending(clientMessageId)
    }
  }


  const submitMathematikAnswer = () => {
    if (!player || !gameId || submitted || !mathematikAnswer.trim()) {
      return
    }

    const clientMessageId = lowLatency ? uuid() : undefined

    setSubmitted(true)
    sfxPop()
    hapticTap()
    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey: -1,
        answerText: mathematikAnswer.trim(),
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(playerToken ? { playerToken } : {}),
      },
    })

    armAckPending(clientMessageId)
  }

  // Wortarten: submit with full answer array (disabled tokens get "" placeholders).
  // Check completeness only for active (non-disabled) tokens.
  const submitWortarten = () => {
    if (
      !player ||
      !gameId ||
      submitted ||
      wortartenChoices.length === 0
    ) {
      return
    }

    // Check completeness: all ACTIVE (non-disabled) tokens must have a choice.
    const hasIncompletedActiveTokens = wortartenChoices.some((choice, idx) =>
      !isTokenDisabled(idx) && choice === null
    )

    if (hasIncompletedActiveTokens) {
      return
    }

    const clientMessageId = lowLatency ? uuid() : undefined

    // Build the full answer array: active tokens get their chosen label,
    // disabled tokens get "" as placeholder (W2-10 shared builder).
    const answerArray = buildWortartenAnswer(wortartenChoices, disabledTokens)

    setSubmitted(true)
    sfxPop()
    hapticTap()

    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey: -1,
        answerText: JSON.stringify(answerArray),
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(playerToken ? { playerToken } : {}),
      },
    })

    setSubmittedChunks(answerArray)

    armAckPending(clientMessageId)
  }

  const submitSentenceBuilder = () => {
    if (!player || !gameId || submitted || placedChunks.length === 0) {
      return
    }

    const clientMessageId = lowLatency ? uuid() : undefined

    setSubmitted(true)
    sfxPop()
    hapticTap()
    const answerText = placedChunks.map((chunk) => chunk.text).join(" ")

    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey: -1,
        answerText,
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(playerToken ? { playerToken } : {}),
      },
    })

    setSubmittedChunks(answerText.split(" "))

    armAckPending(clientMessageId)
  }

  useEffect(() => {
    const disabledMusicMedia = [
      MEDIA_TYPES.AUDIO,
      MEDIA_TYPES.VIDEO,
    ] as QuestionMediaType[]

    if (disabledMusicMedia.includes(media?.type)) {
      return
    }

    playMusic()

    return () => {
      stopMusic()
    }
    // oxlint-disable-next-line
  }, [playMusic])

  // Server-authoritative countdown (low-latency mode only). We derive "now" on
  // the server clock from performance.now() + the synced offset, then tick down
  // to the server deadline. This keeps every client's visible timer in sync with
  // the server even on laggy links — and is UI-only; scoring is unaffected.
  useEffect(() => {
    if (!lowLatency || typeof answerDeadlineAtServerMs !== "number") {
      return
    }

    const tick = () => {
      const serverNowEstimate = monoNow() + (clockOffsetMs || 0)
      const remainingMs = answerDeadlineAtServerMs - serverNowEstimate
      // Crash-guarded clamp: never negative, never NaN.
      const remainingSec = Number.isFinite(remainingMs)
        ? Math.max(0, Math.ceil(remainingMs / 1000))
        : cooldown
      setCooldown(remainingSec)
    }

    tick()
    const id = setInterval(tick, 250)

    return () => clearInterval(id)
    // ServerNowMs is included so a re-anchored question restarts the timer.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [lowLatency, answerDeadlineAtServerMs, serverNowMs, clockOffsetMs])

  // Normal-mode countdown: keep listening to the server COOLDOWN broadcast. In
  // low-latency mode the server still emits COOLDOWN, but the local server-clock
  // timer above is the source of truth, so we ignore it there to avoid jitter.
  // Defensive: if the value is suspiciously large (>100k seconds, ~27 hours),
  // it's likely an absolute deadline in seconds (Unix epoch) rather than remaining
  // seconds. Convert it back to remaining seconds.
  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    if (lowLatency) {
      return
    }

    if (sec > 100000) {
      const remainingMs = (sec * 1000) - Date.now()
      setCooldown(Math.max(0, Math.ceil(remainingMs / 1000)))
    } else {
      setCooldown(sec)
    }
  })

  useEvent(EVENTS.GAME.PLAYER_ANSWER, (count) => {
    setTotalAnswer(count)
    sfxPop()
  })

  // Low-latency answer ack. When the ack for our in-flight answer arrives we
  // clear the "wird gesendet…" hint. Crash-guard every field — a malformed ack
  // must never throw. We do not act on rejection reasons beyond clearing the
  // pending state (the server is authoritative; first valid answer is counted).
  useEvent(EVENTS.PLAYER.ANSWER_ACK, (ack) => {
    const ackId = ack?.clientMessageId

    // Match by id when present; otherwise accept any ack while one is pending.
    if (
      pendingMessageIdRef.current &&
      ackId &&
      ackId !== pendingMessageIdRef.current
    ) {
      return
    }

    if (ackTimerRef.current) {
      clearTimeout(ackTimerRef.current)
      ackTimerRef.current = null
    }

    // Observability: report send→ack latency for the host health widget. Only
    // when we actually have a pending send timestamp (guards a duplicate/late
    // ack with no in-flight answer). UI-derived metric, never a scoring input.
    const sentAt = pendingSentAtRef.current

    if (sentAt !== null) {
      const latency = monoNow() - sentAt

      if (Number.isFinite(latency) && latency >= 0) {
        socket.emit(EVENTS.METRICS.REPORT, {
          kind: "answerAck",
          value: latency,
        })
      }
    }

    pendingSentAtRef.current = null

    pendingMessageIdRef.current = null
    setAckPending(false)
  })

  // Resume: if the server reports we already answered, lock the UI immediately.
  useEffect(() => {
    if (resumeAnswered) {
      setSubmitted(true)
    }
  }, [resumeAnswered])

  // True when multiple-choice buttons should be disabled: low-latency mode after
  // a tap, or a resumed already-answered state. Normal mode never disables.
  const choiceLocked = (lowLatency && submitted) || resumeAnswered

  // A single lock-in confirmation pill — the one lifecycle moment on this screen.
  // Pops in (overshoot, or opacity-only when reduced) the instant an answer is
  // locked: multiple-choice in low-latency/resumed mode, or any submitted
  // slider / multi-select / type-answer. Fires once per question, so a spring
  // pop is fine here (not the per-tap hot path).
  const answerLockedIn = choiceLocked || submitted

  return (
    <div className="flex min-h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex min-h-0 w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5 lg:max-w-[85vw]">
        <h2 data-testid="question-text" className="text-center text-2xl font-bold text-[color:var(--game-fg)] md:text-4xl lg:text-[clamp(2rem,4.5vh,5rem)]">
          <Markdown>{question}</Markdown>
        </h2>

        <QuestionMedia media={media} alt={question} />

        {submittedBy && (
          <p className="text-sm text-[color:var(--game-fg)]/60 text-center">
            {t("game:submittedBy", { name: submittedBy })}
          </p>
        )}
      </div>

      <div>
        {/* Low-latency "wird gesendet…" hint — only shown while an answer ack is
            outstanding. No blind resend happens. */}
        {ackPending && (
          <div className="mx-auto mb-2 w-full max-w-7xl px-2 text-center text-sm font-semibold text-[color:var(--game-fg)]/80 lg:max-w-[85vw]">
            {t("game:sending")}
          </div>
        )}

        {/* Lock-in confirmation — appears once the player's answer is committed.
            One-shot lifecycle pop (opacity-only under reduced motion). aria-live
            announces the locked state to assistive tech. */}
        {answerLockedIn && (
          <motion.div
            variants={reveal.pop()}
            initial="hidden"
            animate="visible"
            transition={reveal.spring}
            role="status"
            data-testid="answer-submitted"
            aria-live="polite"
            className="mx-auto mb-2 flex w-full max-w-7xl items-center justify-center px-2 lg:max-w-[85vw]"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1 text-sm font-bold text-[color:var(--color-field-ink)] border border-[var(--border-hairline)] shadow-sm">
              {t("game:slider.submitted")}
            </span>
          </motion.div>
        )}

        <div className="mx-auto mb-4 flex w-full max-w-7xl items-center justify-between gap-1 px-2 text-lg font-bold text-[color:var(--game-fg)] md:text-xl lg:max-w-[85vw] lg:text-[clamp(1rem,2.5vh,2rem)]">
          {/* Kahoot-style circular countdown. `cooldown` is the remaining
              seconds (driven by the normal-mode broadcast OR the low-latency
              server-clock path above); `time` is the question's total time. */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm">{t("game:hud.time")}</span>
            <CircularTimer seconds={cooldown} total={time} size={72} />
          </div>
          <div className="flex flex-col items-center rounded-lg bg-white px-4 text-lg font-bold text-[color:var(--color-field-ink)] border border-[var(--border-hairline)] shadow-sm">
            <span className="translate-y-1 text-sm">
              {t("game:hud.answers")}
            </span>
            <span className="tabular-nums">
              {totalAnswer}/{totalPlayer}
            </span>
          </div>
        </div>

        {isTypeAnswer ? (
          <TypeAnswerInput
            value={textAnswer}
            onChange={setTextAnswer}
            onSubmit={submitTextAnswer}
            disabled={submitted}
            testIdPrefix=""
          />
        ) : isMathematik ? (
          <MathematikInput
            value={mathematikAnswer}
            onChange={setMathematikAnswer}
            onSubmit={submitMathematikAnswer}
            disabled={submitted}
            testIdPrefix=""
          />
        ) : isWortarten ? (
          <WortartenPicker
            value={{ choices: wortartenChoices, openTokenIndex }}
            onChange={(next) => {
              // The leaf passes the SAME `choices` reference back when only
              // toggling which token's picker is open, and a NEW array when a
              // POS was actually picked (see WortartenPicker's own
              // handleSelectPos vs. token-tap). That's how we tell "a pick
              // happened" apart from "just opened/closed a picker" without
              // duplicating the leaf's internal logic here.
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
            testIdPrefix=""
            sentence={sentence}
            tokens={tokens}
            posSet={posSet}
            disabledTokens={disabledTokens}
          />
        ) : isSentenceBuilder ? (
          <SentenceBuilderBoard
            value={{ bank: bankChips, placed: placedChunks }}
            onChange={(next) => {
              setBankChips(next.bank)
              setPlacedChunks(next.placed)
              sfxPop()
            }}
            onSubmit={submitSentenceBuilder}
            disabled={submitted}
            testIdPrefix=""
          />
        ) : isMultiSelect ? (
          <MultiSelectGrid
            value={multiSelectedKeys}
            onChange={(next) => {
              setMultiSelectedKeys(next)
              sfxPop()
            }}
            onSubmit={submitMultiSelect}
            disabled={submitted}
            testIdPrefix=""
            answers={answers ?? []}
            displayOrder={displayOrder}
          />
        ) : isSlider ? (
          <SliderInput
            value={sliderValue}
            onChange={setSliderValue}
            onSubmit={submitSlider}
            disabled={submitted}
            min={min ?? 0}
            max={max ?? 100}
            step={step ?? 1}
            unit={unit}
            testIdPrefix=""
          />
        ) : (
          <ChoiceGrid
            value={selectedKey}
            onChange={(key) => {
              if (key !== null) handleAnswer(key)()
            }}
            onSubmit={() => {}}
            disabled={choiceLocked}
            testIdPrefix=""
            answers={answers}
            displayOrder={displayOrder}
          />
        )}
      </div>
    </div>
  )
}

export default Answers
