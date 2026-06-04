// Characterization tests for the satellite/display PAIRING flow
// (handlers/display.ts: handleRegister via displaySocketHandlers + handlePair).
//
// The display ("Raspberry Pi" kiosk) registers and the server mints a 6-char
// pairing code; an authenticated manager then PAIRs that code, which joins the
// DISPLAY socket (not the caller) to the game room and emits PAIR_SUCCESS to
// both sides. These tests assert the ACTUAL current behaviour against the code
// as-is.
//
// We drive handlePair / displaySocketHandlers with lightweight socket.io fakes
// in the spirit of helpers.ts#makeSocket — recording emit()/join() calls — and
// a fake `io` exposing `sockets.sockets` as a Map keyed by socket id (the exact
// slice handlePair touches: `io.sockets.sockets.get(pairing.socketId)`).
//
// The registry is a process-wide singleton (Registry.getInstance()), so we
// fully reset it between tests via registry.cleanup() (clears pairings/games and
// stops the cleanup interval). vi.useFakeTimers() is used ONLY for the TTL
// expiry test; restored in afterEach.
//
// ENV NOTE: getGameConfig() resolves config/game.json relative to cwd
// (packages/socket → ../../config). In this test runner that file does not
// exist, so the non-manager auth branch's getGameConfig() THROWS and handlePair
// catches it, emitting PAIR_ERROR("errors:manager.failedToReadConfig"). The
// non-manager test therefore asserts the rejection is one of the auth-error
// codes (failedToReadConfig OR invalidPassword) and — load-bearingly — that the
// display did NOT join, which holds regardless of whether a config file exists.

import { EVENTS } from "@razzia/common/constants"
import type Game from "@razzia/socket/services/game"
import { displaySocketHandlers, handlePair } from "@razzia/socket/handlers/display"
import type { SocketContext } from "@razzia/socket/handlers/types"
import Registry from "@razzia/socket/services/registry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ── Fakes (helpers.ts#makeSocket style, extended with join/rooms tracking) ───

interface FakeDisplaySocket {
  id: string
  emitted: { event: string; payload: unknown }[]
  joined: string[]
  // The real socket.io API surface handlePair / displaySocketHandlers touch.
  emit: (event: string, payload?: unknown) => boolean
  join: (room: string) => void
  on: (event: string, handler: (...args: unknown[]) => void) => void
  // handler registry so we can drive socket.on(...) callbacks in register tests.
  handlers: Map<string, (...args: unknown[]) => void>
}

const makeFakeSocket = (id: string): FakeDisplaySocket => {
  const emitted: { event: string; payload: unknown }[] = []
  const joined: string[] = []
  const handlers = new Map<string, (...args: unknown[]) => void>()

  return {
    id,
    emitted,
    joined,
    handlers,
    emit: (event: string, payload?: unknown) => {
      emitted.push({ event, payload })

      return true
    },
    join: (room: string) => {
      joined.push(room)
    },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler)
    },
  }
}

// A fake `io` whose `sockets.sockets` Map lets handlePair resolve a registered
// display socket by id (io.sockets.sockets.get(pairing.socketId)).
const makeFakeIo = (sockets: FakeDisplaySocket[]) => {
  const map = new Map<string, FakeDisplaySocket>()
  sockets.forEach((s) => map.set(s.id, s))

  return {
    sockets: { sockets: map },
  }
}

const ctxOf = (socket: FakeDisplaySocket, io: ReturnType<typeof makeFakeIo>) =>
  ({ socket, io } as unknown as SocketContext)

// Minimal stand-in for a Game: handlePair only reads gameId, inviteCode and
// manager.id. Injected into the registry via addGame (cast) so getGameById /
// the manager-identity auth path see a real-looking game.
const fakeGame = (opts: {
  gameId: string
  inviteCode: string
  managerSocketId: string
}): Game =>
  ({
    gameId: opts.gameId,
    inviteCode: opts.inviteCode,
    manager: { id: opts.managerSocketId, clientId: "mgr-client", connected: true },
  } as unknown as Game)

// Pull the registered code out of a DISPLAY.REGISTERED emit.
const registeredCode = (socket: FakeDisplaySocket): string => {
  const ev = socket.emitted.find((e) => e.event === EVENTS.DISPLAY.REGISTERED)
  expect(ev, "expected a DISPLAY.REGISTERED emit").toBeTruthy()

  return (ev!.payload as { code: string }).code
}

const lastPairError = (socket: FakeDisplaySocket): unknown => {
  const errs = socket.emitted.filter((e) => e.event === EVENTS.DISPLAY.PAIR_ERROR)

  return errs.length ? errs[errs.length - 1].payload : undefined
}

const registry = Registry.getInstance()

beforeEach(() => {
  // Fresh registry state (no games, no pairings) before each test.
  registry.cleanup()
})

afterEach(() => {
  vi.useRealTimers()
  registry.cleanup()
})

// ── REGISTER: server mints a pairing code ────────────────────────────────────

describe("display REGISTER", () => {
  it("mints a 6-char uppercase/digit code and stores a pairing for the socket", () => {
    const display = makeFakeSocket("disp-1")
    const io = makeFakeIo([display])

    displaySocketHandlers(ctxOf(display, io))
    // Drive the DISPLAY.REGISTER handler the server just wired.
    display.handlers.get(EVENTS.DISPLAY.REGISTER)!()

    const code = registeredCode(display)
    // generateCode(): 6 chars from "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    // (no ambiguous I/L/O/0/1).
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)

    // The code is now a known, valid pairing pointing at this display socket.
    expect(registry.getPairingCount()).toBe(1)
    expect(registry.isPairingValid(code)).toBe(true)
    expect(registry.getPairing(code)?.socketId).toBe("disp-1")
  })

  it("removes the pairing on DISPLAY.DISCONNECT for that code", () => {
    const display = makeFakeSocket("disp-1")
    const io = makeFakeIo([display])

    displaySocketHandlers(ctxOf(display, io))
    display.handlers.get(EVENTS.DISPLAY.REGISTER)!()
    const code = registeredCode(display)
    expect(registry.getPairingCount()).toBe(1)

    display.handlers.get(EVENTS.DISPLAY.DISCONNECT)!({ code })
    expect(registry.getPairingCount()).toBe(0)
    expect(registry.isPairingValid(code)).toBe(false)
  })
})

// ── PAIR: happy path (manager by socket identity) ────────────────────────────

describe("handlePair — valid code, authenticated manager", () => {
  it("joins the DISPLAY (not the caller) to the room and emits PAIR_SUCCESS to both", () => {
    const display = makeFakeSocket("disp-1")
    const manager = makeFakeSocket("mgr-sock")
    const io = makeFakeIo([display, manager])

    // Display registers → server mints a code for disp-1.
    displaySocketHandlers(ctxOf(display, io))
    display.handlers.get(EVENTS.DISPLAY.REGISTER)!()
    const code = registeredCode(display)

    // Authenticated manager owns the game by SOCKET IDENTITY (manager.id ===
    // caller socket.id), so no password is needed (current impl).
    registry.addGame(
      fakeGame({ gameId: "game-A", inviteCode: "INV123", managerSocketId: "mgr-sock" }),
    )

    const result = handlePair(ctxOf(manager, io), { code, gameId: "game-A" })

    expect(result).toBe(true)

    // The DISPLAY socket joined the game room — NOT the manager/caller.
    expect(display.joined).toEqual(["game-A"])
    expect(manager.joined).toEqual([])

    // PAIR_SUCCESS emitted to BOTH sides with { gameId }.
    const displaySuccess = display.emitted.find(
      (e) => e.event === EVENTS.DISPLAY.PAIR_SUCCESS,
    )
    const managerSuccess = manager.emitted.find(
      (e) => e.event === EVENTS.DISPLAY.PAIR_SUCCESS,
    )
    expect(displaySuccess?.payload).toEqual({ gameId: "game-A" })
    expect(managerSuccess?.payload).toEqual({ gameId: "game-A" })

    // No error on either side.
    expect(lastPairError(display)).toBeUndefined()
    expect(lastPairError(manager)).toBeUndefined()
  })

  it("is single-use: a second PAIR with the same code fails (invalidCode)", () => {
    const display = makeFakeSocket("disp-1")
    const manager = makeFakeSocket("mgr-sock")
    const io = makeFakeIo([display, manager])

    displaySocketHandlers(ctxOf(display, io))
    display.handlers.get(EVENTS.DISPLAY.REGISTER)!()
    const code = registeredCode(display)

    registry.addGame(
      fakeGame({ gameId: "game-A", inviteCode: "INV123", managerSocketId: "mgr-sock" }),
    )

    // First pairing consumes the code.
    expect(handlePair(ctxOf(manager, io), { code, gameId: "game-A" })).toBe(true)
    expect(registry.getPairing(code)).toBeUndefined()
    expect(registry.isPairingValid(code)).toBe(false)

    // Reset the display's join history so we can prove the 2nd attempt joins
    // nothing.
    display.joined.length = 0

    // Second attempt with the now-consumed code → rejected as invalidCode, no
    // additional join.
    const second = handlePair(ctxOf(manager, io), { code, gameId: "game-A" })
    expect(second).toBe(false)
    expect(lastPairError(manager)).toBe("errors:display.invalidCode")
    expect(display.joined).toEqual([])
  })
})

// ── PAIR: invalid / unknown / expired code ───────────────────────────────────

describe("handlePair — invalid code paths", () => {
  it("emits PAIR_ERROR(invalidCode) for an unknown code and does not join", () => {
    const display = makeFakeSocket("disp-1")
    const manager = makeFakeSocket("mgr-sock")
    const io = makeFakeIo([display, manager])

    registry.addGame(
      fakeGame({ gameId: "game-A", inviteCode: "INV123", managerSocketId: "mgr-sock" }),
    )

    const result = handlePair(ctxOf(manager, io), {
      code: "ZZZZZZ",
      gameId: "game-A",
    })

    expect(result).toBe(false)
    expect(lastPairError(manager)).toBe("errors:display.invalidCode")
    expect(display.joined).toEqual([])
    expect(manager.joined).toEqual([])
  })

  it("treats an EXPIRED code (older than the TTL) as invalid (invalidCode)", () => {
    vi.useFakeTimers()
    // Anchor "now" so the TTL diff is deterministic. isPairingValid uses
    // dayjs().diff(createdAt, 'minute') < DISPLAY_PAIRING_TTL_MINUTES (=5).
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"))

    const display = makeFakeSocket("disp-1")
    const manager = makeFakeSocket("mgr-sock")
    const io = makeFakeIo([display, manager])

    displaySocketHandlers(ctxOf(display, io))
    display.handlers.get(EVENTS.DISPLAY.REGISTER)!()
    const code = registeredCode(display)
    expect(registry.isPairingValid(code)).toBe(true)

    registry.addGame(
      fakeGame({ gameId: "game-A", inviteCode: "INV123", managerSocketId: "mgr-sock" }),
    )

    // Jump 6 minutes (> 5-min TTL). The pairing entry still EXISTS in the map
    // (cleanup interval never fired under fake timers) but isPairingValid is now
    // false → handlePair rejects with invalidCode before touching the game.
    vi.setSystemTime(new Date("2026-06-04T12:06:00Z"))
    expect(registry.isPairingValid(code)).toBe(false)

    const result = handlePair(ctxOf(manager, io), { code, gameId: "game-A" })
    expect(result).toBe(false)
    expect(lastPairError(manager)).toBe("errors:display.invalidCode")
    expect(display.joined).toEqual([])
  })
})

// ── PAIR: game-not-found (valid code but bad gameId) ─────────────────────────

describe("handlePair — game lookup", () => {
  it("emits PAIR_ERROR(game.notFound) for a valid code but unknown gameId", () => {
    const display = makeFakeSocket("disp-1")
    const manager = makeFakeSocket("mgr-sock")
    const io = makeFakeIo([display, manager])

    displaySocketHandlers(ctxOf(display, io))
    display.handlers.get(EVENTS.DISPLAY.REGISTER)!()
    const code = registeredCode(display)
    // No game added at all.

    const result = handlePair(ctxOf(manager, io), { code, gameId: "nope" })
    expect(result).toBe(false)
    expect(lastPairError(manager)).toBe("errors:game.notFound")
    expect(display.joined).toEqual([])
    // The code is NOT consumed when the game lookup fails (only consumed on the
    // success path), so it is still valid.
    expect(registry.isPairingValid(code)).toBe(true)
  })
})

// ── PAIR: authorization (non-manager caller) ─────────────────────────────────

describe("handlePair — authorization", () => {
  it("succeeds when the caller IS the game manager by socket identity (no password)", () => {
    const display = makeFakeSocket("disp-1")
    const manager = makeFakeSocket("mgr-sock")
    const io = makeFakeIo([display, manager])

    displaySocketHandlers(ctxOf(display, io))
    display.handlers.get(EVENTS.DISPLAY.REGISTER)!()
    const code = registeredCode(display)

    registry.addGame(
      fakeGame({ gameId: "game-A", inviteCode: "INV123", managerSocketId: "mgr-sock" }),
    )

    // No managerPassword in the payload — identity match alone authorizes.
    const result = handlePair(ctxOf(manager, io), { code, gameId: "game-A" })
    expect(result).toBe(true)
    expect(display.joined).toEqual(["game-A"])
  })

  it("rejects a non-manager caller with a wrong password and does NOT join", () => {
    const display = makeFakeSocket("disp-1")
    // Caller socket id differs from the game's manager.id → identity check
    // fails, so the password fallback gate is enforced.
    const other = makeFakeSocket("other-sock")
    const io = makeFakeIo([display, other])

    displaySocketHandlers(ctxOf(display, io))
    display.handlers.get(EVENTS.DISPLAY.REGISTER)!()
    const code = registeredCode(display)

    registry.addGame(
      fakeGame({ gameId: "game-A", inviteCode: "INV123", managerSocketId: "mgr-sock" }),
    )

    const result = handlePair(ctxOf(other, io), {
      code,
      gameId: "game-A",
      managerPassword: "definitely-wrong",
    })

    expect(result).toBe(false)
    // Either invalidPassword (config present, password mismatch / equals the
    // "PASSWORD" sentinel) or failedToReadConfig (no config file in this runner).
    // Both are auth rejections on the non-manager fallback path.
    expect([
      "errors:manager.invalidPassword",
      "errors:manager.failedToReadConfig",
    ]).toContain(lastPairError(other))

    // Load-bearing: the display never joined the room and the code is untouched.
    expect(display.joined).toEqual([])
    expect(registry.isPairingValid(code)).toBe(true)
  })
})
