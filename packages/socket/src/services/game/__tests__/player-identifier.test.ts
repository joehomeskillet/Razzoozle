// Test suite for I2 — Privacy-first player identifier hashing.
// Tests identifier hash computation, privacy guarantees, and opt-in behavior.

import { createHash } from "node:crypto"
import { EVENTS } from "@razzoozle/common/constants"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import { PlayerManager } from "@razzoozle/socket/services/game/player-manager"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as configModule from "@razzoozle/socket/services/config"

const GAME_ID = "test-game"
const MANAGER_ID = "manager-socket"
const IDENTIFIER_SALT = "razzoozle-default-salt"

// Helper: compute expected hash (same logic as PlayerManager).
const computeExpectedHash = (identifier: string): string =>
  createHash("sha256")
    .update(`${IDENTIFIER_SALT}:${identifier.trim().toLowerCase()}`)
    .digest("hex")

// Fake io (borrowed from player-manager.test.ts).
interface IoEmit {
  target: string
  event: string
  payload: unknown
}

const makeIo = () => {
  const emits: IoEmit[] = []
  const io = {
    to: (target: string) => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ target, event, payload })
        return true
      },
    }),
    in: (_target: string) => ({
      socketsLeave: (_room: string) => {
        // no-op for tests
      },
    }),
  } as unknown as Server
  return { io, emits }
}

// Fake socket (borrowed from player-manager.test.ts).
interface FakeSocket {
  socket: Socket
  emitted: Array<{ event: string; payload: unknown }>
  joinedRooms: string[]
}

const makeSocket = (clientId: string, socketId = clientId): FakeSocket => {
  const emitted: Array<{ event: string; payload: unknown }> = []
  const joinedRooms: string[] = []
  const socket = {
    id: socketId,
    handshake: { auth: { clientId } },
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload })
      return true
    },
    join: (room: string) => {
      joinedRooms.push(room)
    },
  } as unknown as Socket
  return { socket, emitted, joinedRooms }
}

describe("PlayerManager — I2 identifier hashing", () => {
  beforeEach(() => {
    // Default: requireIdentifier = false (guest mode)
    vi.spyOn(configModule, "getGameConfig").mockReturnValue({
      managerPassword: "default",
      teamMode: false,
      lowLatencyMode: { enabled: false },
      requireIdentifier: false,
    } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("Test 1: Hash determinism — same identifier+salt → same hash always", () => {
    vi.spyOn(configModule, "getGameConfig").mockReturnValue({
      managerPassword: "default",
      teamMode: false,
      lowLatencyMode: { enabled: false },
      requireIdentifier: true,
    } as never)

    const { io, emits: _emits } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const identifier = "alice"
    const expectedHash = computeExpectedHash(identifier)

    // First player with identifier
    const { socket: socket1 } = makeSocket("alice-1")
    pm.join(socket1, "Alice One", undefined, identifier)

    let players = pm.getAll()
    expect(players[0].identifierHash).toBe(expectedHash)

    // Second player with same identifier
    const { socket: socket2 } = makeSocket("alice-2")
    pm.join(socket2, "Alice Two", undefined, identifier)

    players = pm.getAll()
    expect(players[1].identifierHash).toBe(expectedHash)
    expect(players[0].identifierHash).toBe(players[1].identifierHash)
  })

  it("Test 2: requireIdentifier=false → Player has NO identifierHash (guest mode)", () => {
    vi.spyOn(configModule, "getGameConfig").mockReturnValue({
      managerPassword: "default",
      teamMode: false,
      lowLatencyMode: { enabled: false },
      requireIdentifier: false, // GUEST MODE
    } as never)

    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const { socket } = makeSocket("alice")
    pm.join(socket, "alice", undefined, "some-identifier")

    const player = pm.getAll()[0]
    expect(player.identifierHash).toBeUndefined()
  })

  it("Test 3: requireIdentifier=true + identifier non-empty → identifierHash set + equals expected sha256", () => {
    vi.spyOn(configModule, "getGameConfig").mockReturnValue({
      managerPassword: "default",
      teamMode: false,
      lowLatencyMode: { enabled: false },
      requireIdentifier: true,
    } as never)

    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const identifier = "test-player@example.com"
    const expectedHash = computeExpectedHash(identifier)

    const { socket } = makeSocket("alice")
    pm.join(socket, "alice", undefined, identifier)

    const player = pm.getAll()[0]
    expect(player.identifierHash).toBe(expectedHash)
  })

  it("Test 4: Lowercased — 'Alice' and 'alice' should hash to same value", () => {
    const hash1 = computeExpectedHash("Alice")
    const hash2 = computeExpectedHash("alice")
    const hash3 = computeExpectedHash("ALICE")

    expect(hash1).toBe(hash2)
    expect(hash1).toBe(hash3)
  })

  it("Test 5: Trimmed — 'alice ' should hash same as 'alice'", () => {
    const expectedWithoutSpace = computeExpectedHash("alice")
    const expectedWithSpace = computeExpectedHash("alice ")

    // Both should be equal due to trim() in the implementation
    expect(expectedWithoutSpace).toBe(expectedWithSpace)
  })

  it("Test 6: No identifier string → NO identifierHash even if requireIdentifier=true", () => {
    vi.spyOn(configModule, "getGameConfig").mockReturnValue({
      managerPassword: "default",
      teamMode: false,
      lowLatencyMode: { enabled: false },
      requireIdentifier: true,
    } as never)

    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const { socket } = makeSocket("alice")
    pm.join(socket, "alice", undefined, undefined) // NO identifier

    const player = pm.getAll()[0]
    expect(player.identifierHash).toBeUndefined()
  })

  it("Test 7: Empty identifier string → NO identifierHash", () => {
    vi.spyOn(configModule, "getGameConfig").mockReturnValue({
      managerPassword: "default",
      teamMode: false,
      lowLatencyMode: { enabled: false },
      requireIdentifier: true,
    } as never)

    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const { socket } = makeSocket("alice")
    pm.join(socket, "alice", undefined, "") // EMPTY string

    const player = pm.getAll()[0]
    expect(player.identifierHash).toBeUndefined()
  })

  it("Test 8: Whitespace-only identifier → NO identifierHash", () => {
    vi.spyOn(configModule, "getGameConfig").mockReturnValue({
      managerPassword: "default",
      teamMode: false,
      lowLatencyMode: { enabled: false },
      requireIdentifier: true,
    } as never)

    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const { socket } = makeSocket("alice")
    pm.join(socket, "alice", undefined, "   ") // ONLY whitespace

    const player = pm.getAll()[0]
    expect(player.identifierHash).toBeUndefined()
  })

  it("Test 9: identifierHash is NOT emitted in NEW_PLAYER broadcast", () => {
    vi.spyOn(configModule, "getGameConfig").mockReturnValue({
      managerPassword: "default",
      teamMode: false,
      lowLatencyMode: { enabled: false },
      requireIdentifier: true,
    } as never)

    const { io, emits } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const { socket } = makeSocket("alice")
    pm.join(socket, "alice", undefined, "secret-id")

    // Check that NEW_PLAYER emit exists
    const newPlayerEmits = emits.filter(
      (e) => e.event === EVENTS.MANAGER.NEW_PLAYER
    )
    expect(newPlayerEmits).toHaveLength(1)

    // The broadcasted player should NOT have identifierHash
    const broadcastedPlayer = newPlayerEmits[0].payload
    expect((broadcastedPlayer as Record<string, unknown>).identifierHash).toBeUndefined()

    // But the internal player should have it
    const internalPlayer = pm.getAll()[0]
    expect(internalPlayer.identifierHash).toBeDefined()
  })

  it("Test 10: identifierHash is NOT emitted in UPDATE_LEADERBOARD broadcast", () => {
    vi.spyOn(configModule, "getGameConfig").mockReturnValue({
      managerPassword: "default",
      teamMode: false,
      lowLatencyMode: { enabled: false },
      requireIdentifier: true,
    } as never)

    const { io, emits } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const { socket } = makeSocket("alice")
    pm.join(socket, "alice", undefined, "secret-id")

    // Clear previous emits and call broadcastPlayerUpdate
    emits.length = 0
    const player = pm.getAll()[0]
    pm.broadcastPlayerUpdate(player)

    // Check UPDATE_LEADERBOARD emit
    const leaderboardEmits = emits.filter(
      (e) => e.event === EVENTS.PLAYER.UPDATE_LEADERBOARD
    )
    expect(leaderboardEmits).toHaveLength(1)

    const leaderboardPayload = leaderboardEmits[0].payload as {
      leaderboard: unknown[]
    }
    const broadcastedPlayers = leaderboardPayload.leaderboard

    // All broadcasted players should NOT have identifierHash
    broadcastedPlayers.forEach((p) => {
      expect((p as Record<string, unknown>).identifierHash).toBeUndefined()
    })

    // But internal player should still have it
    expect(pm.getAll()[0].identifierHash).toBeDefined()
  })
})
