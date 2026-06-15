import { EVENTS, MEDIA_TYPES } from "@razzoozle/common/constants"
import type { QuestionMediaType } from "@razzoozle/common/types/game"
import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import Markdown from "@razzoozle/web/components/Markdown"
import QuestionMedia from "@razzoozle/web/components/QuestionMedia"
import AnswerButton from "@razzoozle/web/features/game/components/AnswerButton"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useAnswerStore } from "@razzoozle/web/features/game/stores/answer"
import { useLowLatencyStore } from "@razzoozle/web/features/game/stores/lowLatency"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzoozle/web/features/game/utils/answers"
import { SFX } from "@razzoozle/web/features/game/utils/constants"
import { monoNow } from "@razzoozle/web/features/game/utils/monoNow"
import clsx from "clsx"
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
    // Low-latency server-timing anchors (all OPTIONAL — undefined in normal
    // mode). Used ONLY to render the countdown, never for scoring.
    serverNowMs,
    answerDeadlineAtServerMs,
  },
}: Props) => {
  const { socket } = useSocket()
  const { player, gameId } = usePlayerStore()
  const llActive = useLowLatencyStore((s) => s.active)
  const clockOffsetMs = useLowLatencyStore((s) => s.offsetMs)
  // Resume signal: did the server tell us we already answered this question?
  const resumeAnswered = useAnswerStore(
    (s) => s.alreadyAnswered && s.gameId === gameId,
  )

  // Low-latency mode is active for THIS question when the master flag is on and
  // the payload actually carried a server deadline to count down from.
  const hasServerDeadline = typeof answerDeadlineAtServerMs === "number"
  const lowLatency = llActive && hasServerDeadline

  const isSlider = type === "slider" && min != null && max != null
  const isMultiSelect = type === "multiple-select"
  const isTypeAnswer = type === "type-answer"
  const [cooldown, setCooldown] = useState(time)
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
  // True once we've sent an answer but not yet seen its ack (LL mode only).
  const [ackPending, setAckPending] = useState(false)
  // The clientMessageId of the in-flight answer, so we can match its ack.
  const pendingMessageIdRef = useRef<string | null>(null)
  // Monotonic send timestamp of the in-flight answer, to measure ack latency
  // (send → ack) for the host health widget. Null when no answer is pending.
  const pendingSentAtRef = useRef<number | null>(null)
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { t } = useTranslation()

  const [sfxPop] = useSound(SFX.ANSWERS.SOUND, {
    volume: 0.1,
  })

  const [playMusic, { stop: stopMusic }] = useSound(SFX.ANSWERS.MUSIC, {
    volume: 0.2,
    interrupt: true,
    loop: true,
  })

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

    const clientMessageId = lowLatency ? uuid() : undefined

    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey,
        // OPTIONAL — omitted in normal mode so the server dedups by
        // player+question only (today's behaviour).
        ...(clientMessageId ? { clientMessageId } : {}),
      },
    })

    if (lowLatency) {
      setSubmitted(true)
      pendingMessageIdRef.current = clientMessageId ?? null
      // Stamp the send time so the ack handler can report send→ack latency.
      pendingSentAtRef.current = monoNow()
      setAckPending(false)

      if (ackTimerRef.current) {
        clearTimeout(ackTimerRef.current)
      }

      // Show "wird gesendet…" if no ack lands within the window. No resend.
      ackTimerRef.current = setTimeout(() => {
        setAckPending(true)
      }, ACK_PENDING_HINT_MS)
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
      },
    })
    setSubmitted(true)
    sfxPop()

    if (lowLatency) {
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
  }

  // Multiple-select: tap toggles a key in the local set. No emit until Submit.
  const handleMultiAnswer = (key: number) => () => {
    if (submitted) {
      return
    }

    setMultiSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
    sfxPop()
  }

  // Multiple-select: explicit submit of the toggled set. Sends the sentinel
  // answerKey: -1 plus the selected keys; the server scores the set all-or-nothing.
  const submitMultiSelect = () => {
    if (!player || !gameId || submitted || multiSelectedKeys.length === 0) {
      return
    }

    setSubmitted(true)
    sfxPop()
    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey: -1,
        answerKeys: multiSelectedKeys,
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
    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey: -1,
        answerText: trimmed,
        ...(clientMessageId ? { clientMessageId } : {}),
      },
    })
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
  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    if (lowLatency) {
      return
    }

    setCooldown(sec)
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

  return (
    <div className="flex min-h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex min-h-0 w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5 lg:max-w-[85vw]">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,4.5vh,5rem)]">
          <Markdown>{question}</Markdown>
        </h2>

        <QuestionMedia media={media} alt={question} />

        {submittedBy && (
          <p className="text-sm text-white/60 text-center">
            {t("game:submittedBy", { name: submittedBy })}
          </p>
        )}
      </div>

      <div>
        {/* Low-latency "wird gesendet…" hint — only shown while an answer ack is
            outstanding. No blind resend happens. */}
        {ackPending && (
          <div className="mx-auto mb-2 w-full max-w-7xl px-2 text-center text-sm font-semibold text-white/80 lg:max-w-[85vw]">
            {t("game:sending")}
          </div>
        )}

        <div className="mx-auto mb-4 flex w-full max-w-7xl justify-between gap-1 px-2 text-lg font-bold text-white md:text-xl lg:max-w-[85vw] lg:text-[clamp(1rem,2.5vh,2rem)]">
          <div className="flex flex-col items-center rounded-lg bg-black/40 px-4 text-lg font-bold">
            <span className="translate-y-1 text-sm">{t("game:hud.time")}</span>
            <span className="tabular-nums">{cooldown}</span>
          </div>
          <div className="flex flex-col items-center rounded-lg bg-black/40 px-4 text-lg font-bold">
            <span className="translate-y-1 text-sm">
              {t("game:hud.answers")}
            </span>
            <span className="tabular-nums">
              {totalAnswer}/{totalPlayer}
            </span>
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
                if (e.key === "Enter") {
                  submitTextAnswer()
                }
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
              {(answers ?? []).map((answer, key) => (
                <AnswerButton
                  key={key}
                  className={clsx(
                    ANSWERS_COLORS[key],
                    submitted && "opacity-50",
                    multiSelectedKeys.includes(key) && "ring-4 ring-white/80",
                  )}
                  label={ANSWERS_LABELS[key]}
                  disabled={submitted}
                  onClick={handleMultiAnswer(key)}
                >
                  <Markdown>{answer}</Markdown>
                </AnswerButton>
              ))}
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
              {unit ? ` ${unit}` : ""}
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step ?? 1}
              value={sliderValue}
              disabled={submitted}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="quiz-range accent-primary h-3 w-full cursor-pointer appearance-none rounded-full bg-white/40 disabled:cursor-not-allowed lg:h-[clamp(0.75rem,1.5vh,1.5rem)]"
            />
            <div className="flex w-full justify-between text-sm font-semibold text-white/70 lg:text-[clamp(1rem,2.5vh,2rem)]">
              <span>
                {min}
                {unit ? ` ${unit}` : ""}
              </span>
              <span>
                {max}
                {unit ? ` ${unit}` : ""}
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
            {(answers ?? []).map((answer, key) => (
              <AnswerButton
                key={key}
                className={clsx(
                  ANSWERS_COLORS[key],
                  // Instant local feedback: dim the un-chosen buttons once a
                  // choice is locked in (low-latency / resumed). Normal mode
                  // never sets selectedKey/choiceLocked, so this is inert there.
                  choiceLocked &&
                    selectedKey !== null &&
                    selectedKey !== key &&
                    "opacity-40",
                  choiceLocked && selectedKey === key && "ring-4 ring-white/80",
                )}
                label={ANSWERS_LABELS[key]}
                disabled={choiceLocked}
                onClick={handleAnswer(key)}
              >
                <Markdown>{answer}</Markdown>
              </AnswerButton>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Answers
