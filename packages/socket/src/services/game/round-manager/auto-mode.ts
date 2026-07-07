// Auto-advance (setAutoMode/scheduleAuto/clearAuto/emitResultCountdown) —
// extracted verbatim from RoundManager (round-manager.ts, Modul 4 of the SRP
// split).
//
// `autoTimer` (the live setTimeout handle) STAYS a class field per the split
// plan — the timer callbacks fire seconds later, long after any ctx object
// built at call time would be stale, so every piece of state scheduleAuto's
// callbacks read (started/autoMode/paused/currentQuestion/roundRecapShown)
// is threaded through as a GETTER function (`ctx.isStarted()` etc.), not a
// captured value, and `autoTimer` itself goes through a setter. Everything
// else (newQuestion/showLeaderboard/waitWhilePaused) is a callback into the
// still-in-class methods. Logic is otherwise byte-identical to the original.
import type {
  Status,
  StatusDataMap,
} from "@razzoozle/common/types/game/status"
import { STATUS } from "@razzoozle/common/types/game/status"

type SendFn = <T extends Status>(
  _target: string,
  _status: T,
  _data: StatusDataMap[T],
) => void

// Hoisted so setAutoMode (the mid-screen immediacy path) and showResults/
// showLeaderboard (the countdown emit, in round-manager.ts) read the SAME
// values scheduleAuto arms its timers with.
export const AUTO_RESULT_MS = 6000
export const AUTO_LEADERBOARD_MS = 5000

export function clearAuto(ctx: {
  autoTimer: ReturnType<typeof setTimeout> | null
  setAutoTimer: (_t: ReturnType<typeof setTimeout> | null) => void
}): void {
  if (ctx.autoTimer) {
    clearTimeout(ctx.autoTimer)
    ctx.setAutoTimer(null)
  }
}

// FIX 9 (mid-screen re-send): re-deliver the cached SHOW_RESULT payload to each
// player with autoAdvanceMs added, so a client already sitting on the result
// screen gets the countdown when auto-mode is toggled on. Re-sends the FULL
// cached payload (not a partial), so it is safe regardless of how the client
// applies the screen state. No-op when the cache is empty (not on the result
// screen / already advanced).
export function emitResultCountdown(
  ctx: {
    lastResultPayloads: ReadonlyMap<string, StatusDataMap["SHOW_RESULT"]>
    send: SendFn
  },
  autoAdvanceMs: number,
): void {
  if (ctx.lastResultPayloads.size === 0) {
    return
  }

  for (const [socketId, payload] of ctx.lastResultPayloads) {
    ctx.send(socketId, STATUS.SHOW_RESULT, { ...payload, autoAdvanceMs })
  }
}

export interface ScheduleAutoCtx {
  setAutoTimer: (_t: ReturnType<typeof setTimeout> | null) => void
  clearAuto: () => void
  isStarted: () => boolean
  isAutoMode: () => boolean
  isPaused: () => boolean
  waitWhilePaused: () => Promise<void>
  hasNextQuestion: () => boolean
  incrementCurrentQuestion: () => void
  newQuestion: () => void
  showLeaderboard: () => void
  isRoundRecapShown: () => boolean
}

// Auto mode: after results, advance to leaderboard then the next question
// automatically (with pauses), so the host doesn't click through every round.
export function scheduleAuto(ctx: ScheduleAutoCtx): void {
  ctx.clearAuto()

  // After the leaderboard dwell, advance to the next question (honouring pause).
  const advanceToNext = () => {
    ctx.setAutoTimer(
      setTimeout(() => {
        if (ctx.isPaused()) {
          void ctx.waitWhilePaused().then(() => {
            if (!ctx.isStarted() || !ctx.isAutoMode()) {
              return
            }

            if (ctx.hasNextQuestion()) {
              ctx.incrementCurrentQuestion()
              ctx.newQuestion()
            }
          })

          return
        }

        if (!ctx.isStarted() || !ctx.isAutoMode()) {
          return
        }

        if (ctx.hasNextQuestion()) {
          ctx.incrementCurrentQuestion()
          ctx.newQuestion()
        }
      }, AUTO_LEADERBOARD_MS),
    )
  }

  ctx.setAutoTimer(
    setTimeout(() => {
      if (!ctx.isStarted() || !ctx.isAutoMode()) {
        return
      }

      // First hop off the result screen: showLeaderboard() may divert to the
      // per-round recap screen (manager-only). Detect via roundRecapShown.
      ctx.showLeaderboard()

      if (!ctx.isStarted()) {
        return
      }

      if (ctx.isRoundRecapShown()) {
        // We are on the recap screen — hold it for AUTO_RESULT_MS, then the
        // SECOND showLeaderboard() passes the guard and shows the real board.
        ctx.setAutoTimer(
          setTimeout(() => {
            if (!ctx.isStarted() || !ctx.isAutoMode()) {
              return
            }

            ctx.showLeaderboard()

            if (!ctx.isStarted()) {
              return
            }

            advanceToNext()
          }, AUTO_RESULT_MS),
        )
      } else {
        advanceToNext()
      }
    }, AUTO_RESULT_MS),
  )
}

export function applyAutoMode(ctx: {
  on: boolean
  started: boolean
  resultScreenActive: boolean
  autoTimer: ReturnType<typeof setTimeout> | null
  scheduleAuto: () => void
  emitResultCountdown: (_autoAdvanceMs: number) => void
  clearAuto: () => void
}): void {
  if (!ctx.on) {
    ctx.clearAuto()

    return
  }

  // FIX 8 (immediacy): toggled ON while a result screen is already showing —
  // arm the advance for THAT screen now instead of waiting for the next phase
  // boundary. Guard against a duplicate timer (do nothing if one is pending).
  // scheduleAuto() re-sends the result payload with autoAdvanceMs (FIX 9) so
  // the client gets the countdown for the screen it is already on.
  if (ctx.started && ctx.resultScreenActive && ctx.autoTimer === null) {
    ctx.scheduleAuto()
    // FIX 9: the SHOW_RESULT screen was already broadcast WITHOUT a countdown
    // (auto-mode was off then) — re-send it with autoAdvanceMs so the client
    // can render the local countdown for the screen it is already on.
    ctx.emitResultCountdown(AUTO_RESULT_MS)
  }
}
