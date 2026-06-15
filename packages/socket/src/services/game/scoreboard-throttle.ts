// Low-latency mode: a tiny per-instance leading+trailing throttle for
// scoreboard-style "chatter" (the live answered-count / leaderboard refresh
// that fires once per tap). It MUST NEVER wrap the game-state transitions
// (SHOW_QUESTION / SELECT_ANSWER / SHOW_RESULT) — delaying those visibly
// desyncs the game. It only collapses the high-frequency count updates.
//
// Behaviour:
//   - leading edge fires immediately (first call passes through),
//   - subsequent calls within `delayMs` are coalesced into ONE trailing call
//     carrying the LATEST payload, fired at the end of the window.
// When delayMs <= 0 it degrades to "emit immediately" — identical to today.

export class ScoreboardThrottle<T> {
  private readonly delayMs: number
  private readonly emit: (_value: T) => void
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: { value: T } | null = null
  private lastEmitAt = 0

  constructor(delayMs: number, emit: (_value: T) => void) {
    this.delayMs = delayMs
    this.emit = emit
  }

  push(value: T): void {
    // Throttle disabled (or non-positive window): behave exactly like today and
    // emit synchronously.
    if (this.delayMs <= 0) {
      this.emit(value)

      return
    }

    const now = Date.now()
    const elapsed = now - this.lastEmitAt

    // Leading edge: enough time has passed, emit right away.
    if (this.timer === null && elapsed >= this.delayMs) {
      this.lastEmitAt = now
      this.emit(value)

      return
    }

    // Inside the window: remember the latest value for the trailing edge.
    this.pending = { value }

    if (this.timer === null) {
      const wait = Math.max(this.delayMs - elapsed, 0)
      this.timer = setTimeout(() => this.flushTrailing(), wait)
    }
  }

  private flushTrailing(): void {
    this.timer = null

    if (this.pending) {
      const { value } = this.pending
      this.pending = null
      this.lastEmitAt = Date.now()
      this.emit(value)
    }
  }

  // Cancel any pending trailing emit (e.g. on round transition / cleanup) so a
  // stale count can't land after the question has already ended.
  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.pending = null
  }
}
