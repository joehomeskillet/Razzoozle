import { create } from "zustand"

// Client-side, UI-only low-latency state.
//
// We DO NOT trust a server-pushed "is low-latency mode on" boolean for the
// answer/countdown path: the SELECT_ANSWER payload already carries optional
// server-timing anchors (answerDeadlineAtServerMs, serverNowMs, ...) only when
// the server has the mode enabled. Their PRESENCE is therefore the authoritative
// signal that low-latency mode is active. We mirror that signal here so the
// clock-sync hook knows when to start pinging, and so the answer component knows
// whether to lock-after-first-tap / expect an ack.
//
// `offsetMs` is (serverWallClock - clientMonoClock) and is used ONLY to render
// the countdown; it is never sent back to the server and never affects scoring.
interface LowLatencyState {
  // True once a SELECT_ANSWER (or other) payload carried server-timing anchors.
  // Sticky for the lifetime of the page/game session.
  active: boolean
  // Clock offset from the most recent successful sync, or 0 (no correction).
  offsetMs: number
  // Round-trip time of the most recent sync, for the health widget.
  rttMs: number
  // Whether a sync has completed at least once.
  synced: boolean

  setActive: (_active: boolean) => void
  setOffset: (_offsetMs: number, _rttMs: number) => void
  reset: () => void
}

const initialState = {
  active: false,
  offsetMs: 0,
  rttMs: 0,
  synced: false,
}

export const useLowLatencyStore = create<LowLatencyState>((set) => ({
  ...initialState,

  // Latch active=true; never flips back to false mid-session so a single
  // anchor-less status update can't disable an already-detected LL session.
  setActive: (active) =>
    set((state) => (active && !state.active ? { active: true } : state)),

  setOffset: (offsetMs, rttMs) =>
    set({
      // Crash-guard: only store finite numbers, else keep zero correction.
      offsetMs: Number.isFinite(offsetMs) ? offsetMs : 0,
      rttMs: Number.isFinite(rttMs) ? rttMs : 0,
      synced: true,
    }),

  reset: () => set(initialState),
}))
