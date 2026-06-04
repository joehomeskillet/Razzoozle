// Characterization tests for the singleton game Registry's janitorial paths:
//   - an empty game past EMPTY_GAME_TIMEOUT_MINUTES is removed by
//     cleanupEmptyGames(), and its disposeMetrics() is called exactly once,
//   - reactivateGame() pulls a game out of the empty list so it is NOT removed,
//   - expired display pairings are purged by cleanupPairings() (TTL boundary),
//     while fresh ones survive,
//   - isPairingValid() honours the TTL window (strictly-less-than the timeout).
//
// Timing: the Registry derives all ages from dayjs(), which reads the (faked)
// system clock. We drive it with vi.useFakeTimers()/setSystemTime so the suite
// is deterministic and asserts the ACTUAL constants baked into registry.ts:
//   EMPTY_GAME_TIMEOUT_MINUTES = 5, PAIRING_TIMEOUT = DISPLAY_PAIRING_TTL_MINUTES
//   (= 5), CLEANUP_INTERVAL_MS = 60_000.
//
// The janitor methods (cleanupEmptyGames / cleanupPairings) are private; we call
// them via the same private-access reflection the project's other tests use, and
// also assert that the public setInterval wiring (startCleanupTask, fired every
// CLEANUP_INTERVAL_MS) drives them. Registry is a private-constructor singleton:
// we obtain it via getInstance() and reset it with cleanup() in before/afterEach
// so each test starts clean (cleanup() also stops any armed interval).

import { DISPLAY_PAIRING_TTL_MINUTES } from "@razzia/common/constants"
import type Game from "@razzia/socket/services/game"
import Registry from "@razzia/socket/services/registry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A fixed epoch so dayjs().unix() math is stable. Aligned to a whole minute.
const T0 = 1_700_000_000_000

const MINUTE_MS = 60_000
const CLEANUP_INTERVAL_MS = 60_000
const EMPTY_GAME_TIMEOUT_MINUTES = 5
// Mirrors registry.ts: PAIRING_TIMEOUT_MINUTES === DISPLAY_PAIRING_TTL_MINUTES.
const PAIRING_TIMEOUT_MINUTES = DISPLAY_PAIRING_TTL_MINUTES

// Minimal fake Game — the Registry only references Game as a *type* and, for the
// paths under test, only reads `gameId`/`inviteCode` and calls `disposeMetrics`.
const makeGame = (
  gameId: string,
): { game: Game; disposeMetrics: ReturnType<typeof vi.fn> } => {
  const disposeMetrics = vi.fn()
  const game = {
    gameId,
    inviteCode: `INV-${gameId}`,
    disposeMetrics,
  } as unknown as Game

  return { game, disposeMetrics }
}

// Private-method shims (the janitor is private; the project's other tests reflect
// into private state the same way — see helpers.ts).
const runCleanupEmptyGames = (r: Registry): void => {
  ;(r as unknown as { cleanupEmptyGames: () => void }).cleanupEmptyGames()
}
const runCleanupPairings = (r: Registry): void => {
  ;(r as unknown as { cleanupPairings: () => void }).cleanupPairings()
}

let registry: Registry

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  registry = Registry.getInstance()
  // Reset any state (and stop the armed interval) so each test starts clean.
  registry.cleanup()
})

afterEach(() => {
  // Stop any armed interval and wipe state so nothing bleeds into the next test.
  registry.cleanup()
  vi.useRealTimers()
})

describe("Registry — empty-game cleanup (EMPTY_GAME_TIMEOUT_MINUTES = 5)", () => {
  it("removes an empty game once it is older than the timeout and disposes its metrics", () => {
    const { game, disposeMetrics } = makeGame("g1")
    registry.addGame(game)
    registry.markGameAsEmpty(game)

    expect(registry.getGameCount()).toBe(1)
    expect(registry.getEmptyGameCount()).toBe(1)

    // The age diff is in whole minutes and the keep-filter is `< 5`, so age must
    // reach 5 minutes to be evicted. Advance just past the 5-minute boundary.
    vi.setSystemTime(T0 + EMPTY_GAME_TIMEOUT_MINUTES * MINUTE_MS + 1)
    runCleanupEmptyGames(registry)

    expect(registry.getGameCount()).toBe(0)
    expect(registry.getEmptyGameCount()).toBe(0)
    expect(disposeMetrics).toHaveBeenCalledTimes(1)
  })

  it("keeps an empty game that is still inside the timeout window", () => {
    const { game, disposeMetrics } = makeGame("g-young")
    registry.addGame(game)
    registry.markGameAsEmpty(game)

    // Only 4 minutes old: 4 < 5 ⇒ survives, metrics untouched.
    vi.setSystemTime(T0 + 4 * MINUTE_MS)
    runCleanupEmptyGames(registry)

    expect(registry.getGameCount()).toBe(1)
    expect(registry.getEmptyGameCount()).toBe(1)
    expect(disposeMetrics).not.toHaveBeenCalled()
  })

  it("reactivateGame() pulls a game out of the empty list so cleanup spares it", () => {
    const { game, disposeMetrics } = makeGame("g-reactivate")
    registry.addGame(game)
    registry.markGameAsEmpty(game)
    expect(registry.getEmptyGameCount()).toBe(1)

    // A player rejoined: reactivate cancels the pending removal.
    registry.reactivateGame("g-reactivate")
    expect(registry.getEmptyGameCount()).toBe(0)

    // Even well past the timeout, the janitor leaves it alone (no longer empty).
    vi.setSystemTime(T0 + 10 * MINUTE_MS)
    runCleanupEmptyGames(registry)

    expect(registry.getGameCount()).toBe(1)
    expect(disposeMetrics).not.toHaveBeenCalled()
  })

  it("markGameAsEmpty is idempotent for the same gameId", () => {
    const { game } = makeGame("g-dup")
    registry.addGame(game)
    registry.markGameAsEmpty(game)
    registry.markGameAsEmpty(game)

    expect(registry.getEmptyGameCount()).toBe(1)
  })

  it("the periodic cleanup interval (CLEANUP_INTERVAL_MS = 60_000) drives the janitor", () => {
    const { game, disposeMetrics } = makeGame("g-interval")
    registry.addGame(game)
    registry.markGameAsEmpty(game)

    // Arm the production interval at the current fake time, then advance BOTH
    // the timer scheduling clock and the system clock together past the timeout
    // so the interval's callback sees an aged-out game. (setSystemTime alone
    // moves Date.now() but not the timer scheduler; advanceTimersByTime moves
    // the scheduler but not Date.now() — drive both.)
    ;(registry as unknown as { startCleanupTask: () => void }).startCleanupTask()
    vi.setSystemTime(T0 + EMPTY_GAME_TIMEOUT_MINUTES * MINUTE_MS + 1)
    vi.advanceTimersByTime(CLEANUP_INTERVAL_MS)

    expect(registry.getGameCount()).toBe(0)
    expect(disposeMetrics).toHaveBeenCalledTimes(1)
  })
})

describe("Registry — display pairing TTL (DISPLAY_PAIRING_TTL_MINUTES = 5)", () => {
  it("isPairingValid honours the TTL boundary (valid while age < timeout)", () => {
    registry.registerPairing("CODE", "socket-1")
    expect(registry.isPairingValid("CODE")).toBe(true)

    // Age 4 minutes: 4 < 5 ⇒ still valid.
    vi.setSystemTime(T0 + 4 * MINUTE_MS)
    expect(registry.isPairingValid("CODE")).toBe(true)

    // Age exactly the timeout: 5 < 5 is false ⇒ no longer valid (the boundary
    // is exclusive on the upper end).
    vi.setSystemTime(T0 + PAIRING_TIMEOUT_MINUTES * MINUTE_MS)
    expect(registry.isPairingValid("CODE")).toBe(false)
  })

  it("isPairingValid is false for an unknown code", () => {
    expect(registry.isPairingValid("nope")).toBe(false)
  })

  it("cleanupPairings purges only pairings at/over the TTL, leaving fresh ones", () => {
    // Old pairing registered at T0.
    registry.registerPairing("OLD", "socket-old")
    // Fresh pairing registered 4 minutes later.
    vi.setSystemTime(T0 + 4 * MINUTE_MS)
    registry.registerPairing("FRESH", "socket-fresh")
    expect(registry.getPairingCount()).toBe(2)

    // Jump so OLD is >= 5 min (expired: diff >= timeout) but FRESH is only ~1
    // min old. The janitor purges OLD, keeps FRESH.
    vi.setSystemTime(T0 + (PAIRING_TIMEOUT_MINUTES + 1) * MINUTE_MS)
    runCleanupPairings(registry)

    expect(registry.getPairingCount()).toBe(1)
    expect(registry.getPairing("OLD")).toBeUndefined()
    expect(registry.getPairing("FRESH")).toBeDefined()
  })

  it("removePairing deletes a known code and reports whether anything was removed", () => {
    registry.registerPairing("X", "s")
    expect(registry.removePairing("X")).toBe(true)
    expect(registry.removePairing("X")).toBe(false)
    expect(registry.getPairingCount()).toBe(0)
  })
})
