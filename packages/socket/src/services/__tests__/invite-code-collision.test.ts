// W1-C — PIN collision guard. createInviteCode() (utils/game.ts) generates a
// 6-digit PIN with NO collision check, so two concurrently created games could
// share a code and cause a wrong-game join. The Registry owns the uniqueness
// loop (generateUniqueInviteCode) because it already knows every active PIN; the
// Game constructor routes the pure generator through it. These tests pin that
// behaviour: a candidate that collides with an ACTIVE game is rejected and the
// next unique candidate is returned, while a non-colliding first candidate is
// accepted as-is, and a pathological all-collisions run terminates (no hang).
//
// Registry is a private-constructor singleton; we obtain it via getInstance() and
// reset it with cleanup() in before/afterEach so each test starts clean (same
// pattern as registry.test.ts). The Registry only references Game as a *type* and
// here only reads inviteCode/gameId, so a minimal cast-fake Game suffices.

import type Game from "@razzoozle/socket/services/game"
import Registry from "@razzoozle/socket/services/registry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Minimal fake Game — generateUniqueInviteCode only inspects inviteCode via
// getGameByInviteCode (which also reads gameId nowhere it matters here).
const makeGame = (gameId: string, inviteCode: string): Game =>
  ({ gameId, inviteCode }) as unknown as Game

let registry: Registry

beforeEach(() => {
  registry = Registry.getInstance()
  registry.cleanup()
})

afterEach(() => {
  registry.cleanup()
})

describe("Registry.generateUniqueInviteCode — PIN collision guard", () => {
  it("rejects a candidate that collides with an active game and returns the next unique one", () => {
    // An active game already holds "111111".
    registry.addGame(makeGame("g-active", "111111"))

    // The generator first yields the colliding code, then a fresh one.
    const generate = vi
      .fn<() => string>()
      .mockReturnValueOnce("111111")
      .mockReturnValueOnce("222222")

    const code = registry.generateUniqueInviteCode(generate)

    expect(code).toBe("222222")
    // Generated twice: once collided, once succeeded.
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it("accepts the first candidate when it does not collide with any active game", () => {
    registry.addGame(makeGame("g-active", "111111"))

    const generate = vi.fn<() => string>().mockReturnValue("999999")

    const code = registry.generateUniqueInviteCode(generate)

    expect(code).toBe("999999")
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it("two concurrently active games never share a PIN (the second creation avoids the first's code)", () => {
    // Simulate the first game being registered with "555555".
    registry.addGame(makeGame("g1", "555555"))

    // The generator for the SECOND game would (unluckily) produce the same code
    // first, then a different one — the guard must skip the duplicate.
    const generate = vi
      .fn<() => string>()
      .mockReturnValueOnce("555555")
      .mockReturnValueOnce("666666")

    const second = registry.generateUniqueInviteCode(generate)

    expect(second).toBe("666666")
    expect(registry.getGameByInviteCode("555555")?.gameId).toBe("g1")
    // The two active PINs are distinct.
    expect(second).not.toBe("555555")
  })

  it("terminates and accepts the last candidate if every attempt collides (no infinite loop)", () => {
    registry.addGame(makeGame("g-active", "000000"))

    // Pathological generator: always returns the colliding code. The loop is
    // bounded by maxAttempts (default 10) and must still return rather than hang.
    const generate = vi.fn<() => string>().mockReturnValue("000000")

    const code = registry.generateUniqueInviteCode(generate)

    expect(code).toBe("000000")
    // Exactly maxAttempts (10) generation attempts, then it gives up gracefully.
    expect(generate).toHaveBeenCalledTimes(10)
  })
})
