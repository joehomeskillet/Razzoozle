// Pause/resume + the pausable-status gate — extracted verbatim from
// RoundManager (round-manager.ts, Modul 3 of the SRP split).
//
// `paused`/`pauseState`/`pausedState`/`pauseWaiters` are hot class state that
// STAYS in RoundManager (per the split plan) — only the LOGIC moved here. The
// primitive fields (paused/pausedState) can't be mutated by reference, so
// pauseRound/resumeRound take explicit setter callbacks for them; pauseWaiters
// is an array and mutates fine in place (waitWhilePaused pushes onto it,
// resumeRound drains it via splice(0) — same net effect as the original
// save-reassign-forEach, no reassignment needed since it's the SAME array the
// class field still points at).
import type {
  Status,
  StatusDataMap,
} from "@razzoozle/common/types/game/status"
import { STATUS } from "@razzoozle/common/types/game/status"

type BroadcastFn = <T extends Status>(
  _status: T,
  _data: StatusDataMap[T],
) => void

type PauseState = { status: Status; data: StatusDataMap[Status] } | null

// Screens the manager is allowed to pause the game on (mid-question / a live
// countdown is never pausable — the manager may only pause on a "static"
// screen).
export function isPausableStatus(status: Status): boolean {
  return (
    status === STATUS.SHOW_LEADERBOARD ||
    status === STATUS.SHOW_START ||
    status === STATUS.SHOW_PREPARED ||
    status === STATUS.WAIT ||
    status === STATUS.SHOW_ROOM
  )
}

// Resolves immediately when not paused; otherwise queues the resolver into
// pauseWaiters (drained by resumeRound) so the caller's await suspends across
// the pause.
export function waitWhilePaused(ctx: {
  paused: boolean
  pauseWaiters: Array<() => void>
}): Promise<void> {
  if (!ctx.paused) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    ctx.pauseWaiters.push(resolve)
  })
}

export function pauseRound(ctx: {
  paused: boolean
  pauseState: PauseState
  setPaused: (_v: boolean) => void
  setPausedState: (_v: PauseState) => void
  // NOTE: the RAW opts.broadcast (not the class's rememberPauseState-wrapping
  // `broadcast()`) — matches the original, which bypasses pauseState tracking
  // for the PAUSED status itself so resume() replays the screen from BEFORE
  // the pause, not the PAUSED overlay.
  broadcastRaw: BroadcastFn
}): void {
  if (ctx.paused) {
    return
  }

  if (!ctx.pauseState || !isPausableStatus(ctx.pauseState.status)) {
    console.log("Pause rejected: current status is not pausable")

    return
  }

  ctx.setPaused(true)
  ctx.setPausedState(ctx.pauseState)
  ctx.broadcastRaw(STATUS.PAUSED, { reason: "paused" })
}

export function resumeRound(ctx: {
  paused: boolean
  pausedState: PauseState
  pauseWaiters: Array<() => void>
  setPaused: (_v: boolean) => void
  setPausedState: (_v: null) => void
  broadcast: BroadcastFn
}): void {
  if (!ctx.paused) {
    return
  }

  const state = ctx.pausedState

  ctx.setPaused(false)
  ctx.setPausedState(null)

  if (state) {
    ctx.broadcast(state.status, state.data)
  }

  const waiters = ctx.pauseWaiters.splice(0)

  waiters.forEach((resolve) => resolve())
}

export function isPaused(paused: boolean): boolean {
  return paused
}
