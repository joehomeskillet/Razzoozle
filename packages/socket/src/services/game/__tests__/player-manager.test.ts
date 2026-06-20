// Characterization / regression tests for PlayerManager (the join/kick/identity
// surface of a game room). These assert the ACTUAL current behaviour of
// player-manager.ts as-is — they are not aspirational.
//
// PlayerManager touches three collaborators:
//   - the joining `socket` (socket.emit, socket.join, socket.id,
//     socket.handshake.auth.clientId),
//   - the `io` Server (io.to(target).emit(...) and io.in(id).socketsLeave(...)),
//   - a `getManagerId()` thunk that gates kick() to the manager's socket id.
//
// We build minimal fakes that record every emit so a test can read out exactly
// which event landed on which target. We follow the helpers.ts makeSocket /
// fake-io recorder pattern (socket.emit → emitted[], io.to(room).emit →
// captured with the target room), extended with the extra slices PlayerManager
// needs that RoundManager did not (socket.join, io.in().socketsLeave()).
//
// No real timers are involved in PlayerManager, but we restore timers in
// afterEach defensively to match the suite's harness style.

import { EVENTS } from "@razzoozle/common/constants"
import type { Player } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import { PlayerManager } from "@razzoozle/socket/services/game/player-manager"
import { afterEach, describe, expect, it, vi } from "vitest"
import { makePlayer } from "./helpers"

const GAME_ID = "test-game"
const MANAGER_ID = "manager-socket"

// A recorded io.to(target).emit(...) / io.in(target).socketsLeave(room) call.
interface IoEmit {
  target: string
  event: string
  payload: unknown
}

interface FakeIo {
  io: Server
  // Emits captured from io.to(target).emit(event, payload)
  emits: IoEmit[]
  // Ids passed to io.in(id), so we can prove the player's room membership is
  // torn down on kick.
  socketsLeft: Array<{ target: string; room: string }>
}

const makeIo = (): FakeIo => {
  const emits: IoEmit[] = []
  const socketsLeft: Array<{ target: string; room: string }> = []

  const io = {
    to: (target: string) => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ target, event, payload })

        return true
      },
    }),
    in: (target: string) => ({
      socketsLeave: (room: string) => {
        socketsLeft.push({ target, room })
      },
    }),
  } as unknown as Server

  return { io, emits, socketsLeft }
}

// A fake joining socket. Mirrors helpers.makeSocket (durable identity is
// clientId via handshake.auth.clientId; socket.id may differ) but adds the
// socket.join() that PlayerManager.join() calls.
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

const eventsOf = (
  bag: Array<{ event: string; payload: unknown }>,
  event: string,
): Array<{ event: string; payload: unknown }> =>
  bag.filter((e) => e.event === event)

afterEach(() => {
  vi.useRealTimers()
})

describe("PlayerManager.join", () => {
  it("adds a valid player and emits NEW_PLAYER, TOTAL_PLAYERS and SUCCESS_JOIN", () => {
    const { io, emits } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const { socket, emitted, joinedRooms } = makeSocket("alice", "alice-sock")
    pm.join(socket, "alice")

    // Player is stored with id = socket.id (NOT clientId), connected, 0/0.
    expect(pm.count()).toBe(1)
    const stored = pm.getAll()[0]
    expect(stored).toEqual({
      id: "alice-sock",
      clientId: "alice",
      connected: true,
      username: "alice",
      points: 0,
      streak: 0,
    })

    // The joining socket is added to the game room.
    expect(joinedRooms).toEqual([GAME_ID])

    // NEW_PLAYER goes to the manager id with the full player object.
    const newPlayer = emits.filter((e) => e.event === EVENTS.MANAGER.NEW_PLAYER)
    expect(newPlayer).toHaveLength(1)
    expect(newPlayer[0].target).toBe(MANAGER_ID)
    expect(newPlayer[0].payload).toEqual(stored)

    // TOTAL_PLAYERS goes to the game room with the new count (1).
    const total = emits.filter((e) => e.event === EVENTS.GAME.TOTAL_PLAYERS)
    expect(total).toHaveLength(1)
    expect(total[0].target).toBe(GAME_ID)
    expect(total[0].payload).toBe(1)

    // SUCCESS_JOIN is emitted directly to the joiner, carrying the gameId.
    const success = eventsOf(emitted, EVENTS.GAME.SUCCESS_JOIN)
    expect(success).toHaveLength(1)
    expect(success[0].payload).toBe(GAME_ID)

    // No error was emitted to the joiner.
    expect(eventsOf(emitted, EVENTS.GAME.ERROR_MESSAGE)).toHaveLength(0)
  })

  it("emits TOTAL_PLAYERS reflecting the running count as more players join", () => {
    const { io, emits } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("alice").socket, "alice")
    pm.join(makeSocket("bob").socket, "bobby")

    expect(pm.count()).toBe(2)

    const totals = emits
      .filter((e) => e.event === EVENTS.GAME.TOTAL_PLAYERS)
      .map((e) => e.payload)
    // First join published 1, second published 2.
    expect(totals).toEqual([1, 2])
  })

  it("dedups a duplicate clientId join: emits playerAlreadyConnected and adds no second player", () => {
    const { io, emits } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    // First join succeeds.
    pm.join(makeSocket("alice", "sock-1").socket, "alice")
    expect(pm.count()).toBe(1)
    const emitsAfterFirst = emits.length

    // Second join uses the SAME clientId (different socket id / username).
    const second = makeSocket("alice", "sock-2")
    pm.join(second.socket, "alice-again")

    // No new player; count unchanged.
    expect(pm.count()).toBe(1)
    // The stored player is still the first one.
    expect(pm.getAll()[0].id).toBe("sock-1")
    expect(pm.getAll()[0].username).toBe("alice")

    // The duplicate joiner is told it is already connected.
    const err = eventsOf(second.emitted, EVENTS.GAME.ERROR_MESSAGE)
    expect(err).toHaveLength(1)
    expect(err[0].payload).toBe("errors:game.playerAlreadyConnected")

    // The duplicate joiner gets NO success and the socket did not join a room.
    expect(eventsOf(second.emitted, EVENTS.GAME.SUCCESS_JOIN)).toHaveLength(0)
    expect(second.joinedRooms).toEqual([])

    // No NEW_PLAYER / TOTAL_PLAYERS broadcast for the rejected duplicate.
    expect(emits.length).toBe(emitsAfterFirst)
  })

  it("rejects an invalid username (too short) with the validator's GAME.ERROR_MESSAGE and adds nothing", () => {
    const { io, emits } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const { socket, emitted, joinedRooms } = makeSocket("shorty")
    // UsernameValidator requires min length 4 → "abc" fails.
    pm.join(socket, "abc")

    expect(pm.count()).toBe(0)
    expect(joinedRooms).toEqual([])

    const err = eventsOf(emitted, EVENTS.GAME.ERROR_MESSAGE)
    expect(err).toHaveLength(1)
    // The error message is the zod issue message from usernameValidator.
    expect(err[0].payload).toBe("errors:auth.usernameTooShort")

    // No success, no broadcast.
    expect(eventsOf(emitted, EVENTS.GAME.SUCCESS_JOIN)).toHaveLength(0)
    expect(emits).toHaveLength(0)
  })

  it("rejects an invalid username (too long) with usernameTooLong", () => {
    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const { socket, emitted } = makeSocket("longy")
    // 21 chars → exceeds max of 20.
    pm.join(socket, "x".repeat(21))

    expect(pm.count()).toBe(0)
    const err = eventsOf(emitted, EVENTS.GAME.ERROR_MESSAGE)
    expect(err[0].payload).toBe("errors:auth.usernameTooLong")
  })

  it("accepts a username at the minimum length boundary (4 chars)", () => {
    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("edge").socket, "abcd")
    expect(pm.count()).toBe(1)
    expect(pm.getAll()[0].username).toBe("abcd")
  })

  it("emits the distinct gameEnded error (NOT playerAlreadyConnected) when the game has ended", () => {
    const { io, emits } = makeIo()
    // isGameEnded predicate returns true → the join target game is over.
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID, () => true)

    const { socket, emitted, joinedRooms } = makeSocket("late", "late-sock")
    pm.join(socket, "latecomer")

    // No player seated, no room joined, no roster broadcast.
    expect(pm.count()).toBe(0)
    expect(joinedRooms).toEqual([])
    expect(emits).toHaveLength(0)

    // The joiner is told the GAME ENDED — the new distinct key.
    const err = eventsOf(emitted, EVENTS.GAME.ERROR_MESSAGE)
    expect(err).toHaveLength(1)
    expect(err[0].payload).toBe("errors:game.gameEnded")
    // And specifically NOT the duplicate-connection key.
    expect(err[0].payload).not.toBe("errors:game.playerAlreadyConnected")

    expect(eventsOf(emitted, EVENTS.GAME.SUCCESS_JOIN)).toHaveLength(0)
  })

  it("the ended check takes precedence over a duplicate clientId match", () => {
    const { io } = makeIo()
    let ended = false
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID, () => ended)

    // Seat a player while the game is live.
    pm.join(makeSocket("dup", "dup-sock").socket, "duper")
    expect(pm.count()).toBe(1)

    // Game ends; the SAME clientId (a refresh) tries to rejoin. The roster still
    // holds them, so without the ended-first ordering this would wrongly report
    // playerAlreadyConnected.
    ended = true
    const again = makeSocket("dup", "dup-sock-2")
    pm.join(again.socket, "duper")

    const err = eventsOf(again.emitted, EVENTS.GAME.ERROR_MESSAGE)
    expect(err).toHaveLength(1)
    expect(err[0].payload).toBe("errors:game.gameEnded")
  })

  it("rejects a new player when joinLocked is true; emits locked error and adds no player", () => {
    const { io, emits } = makeIo()
    // joinLocked predicate returns true → new players cannot join
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID, () => false, () => true)

    const { socket, emitted, joinedRooms } = makeSocket("newbie", "newbie-sock")
    pm.join(socket, "newbie")

    // Player is not added; roster and room unchanged.
    expect(pm.count()).toBe(0)
    expect(joinedRooms).toEqual([])

    // The joiner is told the lobby is locked.
    const err = eventsOf(emitted, EVENTS.GAME.ERROR_MESSAGE)
    expect(err).toHaveLength(1)
    expect(err[0].payload).toBe("errors:game.locked")

    // No success emitted.
    expect(eventsOf(emitted, EVENTS.GAME.SUCCESS_JOIN)).toHaveLength(0)
    // No NEW_PLAYER / TOTAL_PLAYERS broadcast.
    expect(emits).toHaveLength(0)
  })

  it("allows an existing player to reconnect even when joinLocked is true", () => {
    const { io, emits } = makeIo()
    // Initially unlocked so we can seat the first player.
    let locked = false
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID, () => false, () => locked)

    // First join succeeds while unlocked.
    pm.join(makeSocket("alice", "alice-sock").socket, "alice")
    expect(pm.count()).toBe(1)

    // Now lock the lobby.
    locked = true

    // The same clientId (reconnect) is allowed through.
    const reconnect = makeSocket("alice", "alice-sock-2")
    pm.join(reconnect.socket, "alice")

    // Still one player (no duplicate added).
    expect(pm.count()).toBe(1)

    // The reconnect gets playerAlreadyConnected (not locked).
    const err = eventsOf(reconnect.emitted, EVENTS.GAME.ERROR_MESSAGE)
    expect(err).toHaveLength(1)
    expect(err[0].payload).toBe("errors:game.playerAlreadyConnected")
  })

  it("allows new players to join when joinLocked is false", () => {
    const { io, emits } = makeIo()
    // joinLocked predicate returns false → normal operation
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID, () => false, () => false)

    const { socket, emitted } = makeSocket("newbie", "newbie-sock")
    pm.join(socket, "newbie")

    // Player is added normally.
    expect(pm.count()).toBe(1)
    expect(pm.getAll()[0].username).toBe("newbie")

    // Success is emitted.
    const success = eventsOf(emitted, EVENTS.GAME.SUCCESS_JOIN)
    expect(success).toHaveLength(1)

    // No error emitted.
    expect(eventsOf(emitted, EVENTS.GAME.ERROR_MESSAGE)).toHaveLength(0)
  })
})

describe("PlayerManager.kick", () => {
  it("is gated to the manager socket id: a non-manager caller returns false and emits nothing", () => {
    const { io, emits, socketsLeft } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    // Seat a player.
    pm.join(makeSocket("alice", "alice-sock").socket, "alice")
    const emitsBefore = emits.length

    // A socket whose id is NOT the manager id tries to kick.
    const impostor = makeSocket("eve", "eve-sock")
    const ok = pm.kick(impostor.socket, "alice-sock")

    expect(ok).toBe(false)
    // Player is untouched.
    expect(pm.count()).toBe(1)
    // No PLAYER_KICKED / RESET / extra TOTAL_PLAYERS emitted, no room teardown.
    expect(emits.length).toBe(emitsBefore)
    expect(socketsLeft).toEqual([])
  })

  it("returns false (and emits nothing) when the manager kicks an unknown playerId", () => {
    const { io, emits, socketsLeft } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("alice", "alice-sock").socket, "alice")
    const emitsBefore = emits.length

    // Manager socket id but the target does not exist.
    const managerSock = makeSocket("mgr", MANAGER_ID)
    const ok = pm.kick(managerSock.socket, "nobody")

    expect(ok).toBe(false)
    expect(pm.count()).toBe(1)
    expect(emits.length).toBe(emitsBefore)
    expect(socketsLeft).toEqual([])
  })

  it("removes the player and emits RESET, PLAYER_KICKED and the updated TOTAL_PLAYERS when invoked by the manager", () => {
    const { io, emits, socketsLeft } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("alice", "alice-sock").socket, "alice")
    pm.join(makeSocket("bob", "bob-sock").socket, "bobby")
    expect(pm.count()).toBe(2)

    // Only count emits produced by kick itself.
    const emitsBefore = emits.length

    const managerSock = makeSocket("mgr", MANAGER_ID)
    const ok = pm.kick(managerSock.socket, "alice-sock")

    expect(ok).toBe(true)
    // Player removed.
    expect(pm.count()).toBe(1)
    expect(pm.findById("alice-sock")).toBeUndefined()
    expect(pm.getAll()[0].id).toBe("bob-sock")

    const kickEmits = emits.slice(emitsBefore)

    // RESET goes to the kicked player's socket id with the kicked reason.
    const reset = kickEmits.filter((e) => e.event === EVENTS.GAME.RESET)
    expect(reset).toHaveLength(1)
    expect(reset[0].target).toBe("alice-sock")
    expect(reset[0].payload).toBe("errors:game.kickedByManager")

    // PLAYER_KICKED notifies the manager with the kicked player's id.
    const kicked = kickEmits.filter(
      (e) => e.event === EVENTS.MANAGER.PLAYER_KICKED,
    )
    expect(kicked).toHaveLength(1)
    expect(kicked[0].target).toBe(MANAGER_ID)
    expect(kicked[0].payload).toBe("alice-sock")

    // The kicked socket is forced out of the game room.
    expect(socketsLeft).toEqual([{ target: "alice-sock", room: GAME_ID }])

    // TOTAL_PLAYERS rebroadcast to the room with the new count (1).
    const total = kickEmits.filter((e) => e.event === EVENTS.GAME.TOTAL_PLAYERS)
    expect(total).toHaveLength(1)
    expect(total[0].target).toBe(GAME_ID)
    expect(total[0].payload).toBe(1)
  })
})

describe("PlayerManager identity / reconnect helpers", () => {
  it("setDisconnected flips the player's connected flag without removing it", () => {
    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("alice", "alice-sock").socket, "alice")
    expect(pm.findById("alice-sock")?.connected).toBe(true)

    pm.setDisconnected("alice-sock")

    expect(pm.count()).toBe(1)
    expect(pm.findById("alice-sock")?.connected).toBe(false)
  })

  it("setDisconnected is a no-op for an unknown socket id", () => {
    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("alice", "alice-sock").socket, "alice")
    // Should not throw and should not touch the existing player.
    expect(() => pm.setDisconnected("ghost")).not.toThrow()
    expect(pm.findById("alice-sock")?.connected).toBe(true)
  })

  it("updateSocketId remaps a player's id, keeping its clientId stable for findByClientId", () => {
    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("alice", "old-sock").socket, "alice")

    pm.updateSocketId("old-sock", "new-sock")

    // Old id no longer resolves; new id does.
    expect(pm.findById("old-sock")).toBeUndefined()
    const byNew = pm.findById("new-sock")
    expect(byNew?.id).toBe("new-sock")

    // The durable clientId is unchanged, so a reconnect lookup still finds them.
    const byClient = pm.findByClientId("alice")
    expect(byClient).toBe(byNew)
    expect(byClient?.id).toBe("new-sock")
  })

  it("updateSocketId is a no-op for an unknown old id", () => {
    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("alice", "alice-sock").socket, "alice")
    pm.updateSocketId("missing", "irrelevant")

    expect(pm.findById("alice-sock")?.id).toBe("alice-sock")
    expect(pm.findById("irrelevant")).toBeUndefined()
  })

  it("findByClientId locates by durable clientId, findById by current socket id", () => {
    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("alice", "alice-sock").socket, "alice")

    expect(pm.findByClientId("alice")?.id).toBe("alice-sock")
    expect(pm.findById("alice-sock")?.clientId).toBe("alice")
    expect(pm.findByClientId("nope")).toBeUndefined()
    expect(pm.findById("nope")).toBeUndefined()
  })

  it("remove() pulls a player by socket id and returns it; a second remove returns undefined", () => {
    const { io } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    pm.join(makeSocket("alice", "alice-sock").socket, "alice")
    const removed = pm.remove("alice-sock")

    expect(removed?.id).toBe("alice-sock")
    expect(pm.count()).toBe(0)
    expect(pm.remove("alice-sock")).toBeUndefined()
  })

  it("replace() swaps the whole roster and broadcastCount() emits the current count to the room", () => {
    const { io, emits } = makeIo()
    const pm = new PlayerManager(io, GAME_ID, () => MANAGER_ID)

    const roster: Player[] = [makePlayer("a"), makePlayer("b"), makePlayer("c")]
    pm.replace(roster)
    expect(pm.count()).toBe(3)
    expect(pm.getAll()).toBe(roster)

    pm.broadcastCount()

    const total = emits.filter((e) => e.event === EVENTS.GAME.TOTAL_PLAYERS)
    expect(total).toHaveLength(1)
    expect(total[0].target).toBe(GAME_ID)
    expect(total[0].payload).toBe(3)
  })
})
