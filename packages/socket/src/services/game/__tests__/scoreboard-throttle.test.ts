// Unit tests for ScoreboardThrottle<T> — the leading+trailing throttle that
// collapses the high-frequency answered-count / leaderboard "chatter" in
// low-latency mode. It must NEVER batch game-state transitions, only the count.
//
// Contract under test (current behaviour):
//   - leading edge: the FIRST push in a fresh window emits immediately,
//   - rapid pushes within delayMs coalesce into exactly ONE trailing emit that
//     carries the LATEST pushed value, fired at the end of the window,
//   - delayMs <= 0 degrades to "emit synchronously on every push",
//   - cancel() drops any pending trailing emit so a stale count can't land.
//
// Timing is server-clock driven (Date.now() + setTimeout), so we use
// vi.useFakeTimers()/setSystemTime and restore real timers in afterEach. The
// "emit" sink is a simple recorder, matching the fake-recorder style in
// helpers.ts (we capture every value the throttle pushes through).

import { ScoreboardThrottle } from "@razzia/socket/services/game/scoreboard-throttle"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const START = 1_000_000_000_000

// A tiny emit recorder: every value the throttle decides to emit lands here in
// order. Mirrors how helpers.ts records broadcast()/emit() calls.
const makeSink = <T>() => {
  const values: T[] = []

  return {
    values,
    emit: (v: T) => {
      values.push(v)
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ScoreboardThrottle leading edge", () => {
  it("emits the first push immediately (leading edge)", () => {
    const sink = makeSink<number>()
    const throttle = new ScoreboardThrottle<number>(100, sink.emit)

    throttle.push(1)

    // Synchronous pass-through — no timer advance needed.
    expect(sink.values).toEqual([1])
  })
})

describe("ScoreboardThrottle trailing coalescing", () => {
  it("coalesces rapid pushes within the window into ONE trailing emit with the LATEST value", () => {
    const sink = makeSink<number>()
    const throttle = new ScoreboardThrottle<number>(100, sink.emit)

    // Leading edge at t=0.
    throttle.push(1)
    expect(sink.values).toEqual([1])

    // Three more pushes inside the 100ms window — none emit synchronously, the
    // latest (4) is remembered for the trailing edge.
    vi.setSystemTime(START + 10)
    throttle.push(2)
    vi.setSystemTime(START + 20)
    throttle.push(3)
    vi.setSystemTime(START + 30)
    throttle.push(4)

    // Still just the leading value so far.
    expect(sink.values).toEqual([1])

    // The trailing timer was scheduled for (delayMs - elapsed) after the FIRST
    // in-window push (at t=10 ⇒ wait 90ms ⇒ fires at t=100). Advance past it.
    vi.advanceTimersByTime(100)

    // Exactly ONE trailing emit, carrying the LATEST value (4), not 2 or 3.
    expect(sink.values).toEqual([1, 4])
  })

  it("does not emit a trailing call when no further push followed the leading edge", () => {
    const sink = makeSink<number>()
    const throttle = new ScoreboardThrottle<number>(100, sink.emit)

    throttle.push(7)
    expect(sink.values).toEqual([7])

    // No timer is pending (only a leading edge happened); advancing time emits
    // nothing more.
    vi.advanceTimersByTime(1000)
    expect(sink.values).toEqual([7])
  })

  it("allows a new leading edge once the window has fully elapsed", () => {
    const sink = makeSink<number>()
    const throttle = new ScoreboardThrottle<number>(100, sink.emit)

    // Leading edge at t=0.
    throttle.push(1)
    expect(sink.values).toEqual([1])

    // Push well after the window: timer is null AND elapsed >= delayMs ⇒ this is
    // a fresh leading edge, not a trailing emit.
    vi.setSystemTime(START + 500)
    throttle.push(2)
    expect(sink.values).toEqual([1, 2])
  })
})

describe("ScoreboardThrottle disabled window (delayMs <= 0)", () => {
  it("emits synchronously on every push when delayMs === 0", () => {
    const sink = makeSink<number>()
    const throttle = new ScoreboardThrottle<number>(0, sink.emit)

    throttle.push(1)
    throttle.push(2)
    throttle.push(3)

    // No coalescing, no timers — pure pass-through, identical to today.
    expect(sink.values).toEqual([1, 2, 3])
  })

  it("emits synchronously on every push when delayMs is negative", () => {
    const sink = makeSink<number>()
    const throttle = new ScoreboardThrottle<number>(-50, sink.emit)

    throttle.push(10)
    throttle.push(20)

    expect(sink.values).toEqual([10, 20])

    // Nothing pending — advancing time changes nothing.
    vi.advanceTimersByTime(1000)
    expect(sink.values).toEqual([10, 20])
  })
})

describe("ScoreboardThrottle.cancel()", () => {
  it("suppresses a pending trailing emit", () => {
    const sink = makeSink<number>()
    const throttle = new ScoreboardThrottle<number>(100, sink.emit)

    // Leading edge, then an in-window push that schedules a trailing emit.
    throttle.push(1)
    vi.setSystemTime(START + 10)
    throttle.push(2)
    expect(sink.values).toEqual([1])

    // Cancel before the trailing timer fires.
    throttle.cancel()

    // The trailing emit never lands, even after the window would have elapsed.
    vi.advanceTimersByTime(1000)
    expect(sink.values).toEqual([1])
  })

  it("is a safe no-op when there is nothing pending", () => {
    const sink = makeSink<number>()
    const throttle = new ScoreboardThrottle<number>(100, sink.emit)

    throttle.push(1)
    expect(sink.values).toEqual([1])

    // No pending trailing timer; cancel must not throw and must not emit.
    expect(() => throttle.cancel()).not.toThrow()
    vi.advanceTimersByTime(1000)
    expect(sink.values).toEqual([1])
  })

  it("after cancel, a later push starts a fresh leading edge", () => {
    const sink = makeSink<number>()
    const throttle = new ScoreboardThrottle<number>(100, sink.emit)

    throttle.push(1)
    vi.setSystemTime(START + 10)
    throttle.push(2)
    throttle.cancel()
    expect(sink.values).toEqual([1])

    // Far enough past lastEmitAt (t=0) that elapsed >= delayMs ⇒ leading edge.
    vi.setSystemTime(START + 1000)
    throttle.push(9)
    expect(sink.values).toEqual([1, 9])
  })
})
