// Unit tests for CooldownTimer — the per-game inter-question countdown.
//
// CooldownTimer.start(seconds) emits GAME.COOLDOWN once per second onto
// io.to(gameId), counting DOWN, and the returned promise resolves at the end of
// the window. It is server-clock driven via setInterval(…, 1000), so we control
// time with vi.useFakeTimers(). We assert ACTUAL current behaviour:
//   - start() emits a descending count on io.to(gameId) and resolves at the end,
//   - a second start() while the first is still active is a no-op (reentrancy
//     guard returns an already-resolved promise, no extra interval/emits),
//   - abort() (which now simply sets this.active = false) stops further emits and
//     lets the in-flight promise resolve early on the next tick.
//
// We reuse the helpers.ts fake-io pattern: a recorder that captures every
// io.to(room).emit(event, payload) call without a real socket.io server.

import { EVENTS } from "@razzia/common/constants"
import type { Server } from "@razzia/common/types/game/socket"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const GAME_ID = "test-game"

// Fake io recorder mirroring buildRound()'s `io` fake in helpers.ts: only the
// `to(room).emit(event, payload)` slice CooldownTimer touches. We also record
// the room each emit targeted so a test can prove emits land on io.to(gameId).
interface FakeIo {
  io: Server
  roomEmitted: Array<{ room: string; event: string; payload: unknown }>
}

const makeIo = (): FakeIo => {
  const roomEmitted: FakeIo["roomEmitted"] = []
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        roomEmitted.push({ room, event, payload })

        return true
      },
    }),
  } as unknown as Server

  return { io, roomEmitted }
}

// COOLDOWN-event payloads in emit order.
const cooldownCounts = (rec: FakeIo): number[] =>
  rec.roomEmitted
    .filter((e) => e.event === EVENTS.GAME.COOLDOWN)
    .map((e) => e.payload as number)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("CooldownTimer.start()", () => {
  it("emits a descending COOLDOWN count on io.to(gameId), one per second", () => {
    const rec = makeIo()
    const timer = new CooldownTimer(rec.io, GAME_ID)

    timer.start(3)

    // Count starts at seconds-1 = 2.
    // t=1000: count 2 > 0 → emit 2, count→1
    vi.advanceTimersByTime(1000)
    expect(cooldownCounts(rec)).toEqual([2])

    // T=2000: count 1 > 0 → emit 1, count→0
    vi.advanceTimersByTime(1000)
    expect(cooldownCounts(rec)).toEqual([2, 1])

    // Every emit targeted io.to(gameId) with the COOLDOWN event.
    for (const e of rec.roomEmitted) {
      expect(e.room).toBe(GAME_ID)
      expect(e.event).toBe(EVENTS.GAME.COOLDOWN)
    }
  })

  it("resolves the promise at the end of the countdown (count reaches 0)", async () => {
    const rec = makeIo()
    const timer = new CooldownTimer(rec.io, GAME_ID)

    let resolved = false
    const done = timer.start(3).then(() => {
      resolved = true
    })

    // Two ticks emit [2, 1]; the third tick sees count <= 0 and resolves
    // WITHOUT emitting a 0.
    await vi.advanceTimersByTimeAsync(2000)
    expect(resolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1000)
    await done
    expect(resolved).toBe(true)

    // The terminating tick emits nothing extra — still just [2, 1].
    expect(cooldownCounts(rec)).toEqual([2, 1])
  })

  it("for start(1) emits no counts and resolves on the first tick (count starts at 0)", async () => {
    const rec = makeIo()
    const timer = new CooldownTimer(rec.io, GAME_ID)

    let resolved = false
    const done = timer.start(1).then(() => {
      resolved = true
    })

    // Count = 1 - 1 = 0 ⇒ first tick hits the `count <= 0` branch immediately.
    await vi.advanceTimersByTimeAsync(1000)
    await done
    expect(resolved).toBe(true)
    expect(cooldownCounts(rec)).toEqual([])
  })
})

describe("CooldownTimer reentrancy guard", () => {
  it("a second start() while active is a no-op (no extra emits, no extra interval)", async () => {
    const rec = makeIo()
    const timer = new CooldownTimer(rec.io, GAME_ID)

    const first = timer.start(4)

    // Advance into the first countdown so it is mid-flight (active === true).
    vi.advanceTimersByTime(1000) // Emit 3
    expect(cooldownCounts(rec)).toEqual([3])

    // Second start() while the first is still active: the guard returns an
    // already-resolved promise and schedules NOTHING new.
    let secondResolved = false
    const second = timer.start(4).then(() => {
      secondResolved = true
    })
    // It resolves on the microtask queue without advancing any timer.
    await second
    expect(secondResolved).toBe(true)

    // No extra interval was created: the count stream is still the SAME single
    // descending series from the first start(), not doubled-up.
    vi.advanceTimersByTime(1000) // Emit 2
    vi.advanceTimersByTime(1000) // Emit 1
    expect(cooldownCounts(rec)).toEqual([3, 2, 1])

    // Drain the first countdown to completion.
    await vi.advanceTimersByTimeAsync(1000)
    await first
    expect(cooldownCounts(rec)).toEqual([3, 2, 1])
  })
})

describe("CooldownTimer.abort()", () => {
  it("stops further emits and resolves the in-flight promise early", async () => {
    const rec = makeIo()
    const timer = new CooldownTimer(rec.io, GAME_ID)

    let resolved = false
    const done = timer.start(10).then(() => {
      resolved = true
    })

    // Let two ticks fire (count 9, then 8).
    vi.advanceTimersByTime(2000)
    expect(cooldownCounts(rec)).toEqual([9, 8])
    expect(resolved).toBe(false)

    // Abort() flips active=false; the very next tick sees !active and resolves
    // WITHOUT emitting anything more.
    timer.abort()
    await vi.advanceTimersByTimeAsync(1000)
    await done

    expect(resolved).toBe(true)
    // No further COOLDOWN emits after the abort.
    expect(cooldownCounts(rec)).toEqual([9, 8])

    // And the timer is fully stopped: advancing further produces nothing.
    vi.advanceTimersByTime(5000)
    expect(cooldownCounts(rec)).toEqual([9, 8])
  })

  it("re-arms cleanly: a fresh start() after an aborted run works again", async () => {
    const rec = makeIo()
    const timer = new CooldownTimer(rec.io, GAME_ID)

    const first = timer.start(10)
    vi.advanceTimersByTime(1000) // Emit 9
    timer.abort()
    await vi.advanceTimersByTimeAsync(1000) // First run resolves early
    await first

    // Active is back to false ⇒ a new start() is allowed and counts down again.
    const beforeSecond = cooldownCounts(rec).length
    const second = timer.start(3)
    await vi.advanceTimersByTimeAsync(1000) // Emit 2
    await vi.advanceTimersByTimeAsync(1000) // Emit 1
    await vi.advanceTimersByTimeAsync(1000) // Resolve
    await second

    const after = cooldownCounts(rec).slice(beforeSecond)
    expect(after).toEqual([2, 1])
  })
})
