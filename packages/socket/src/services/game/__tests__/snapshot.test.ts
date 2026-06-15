// Crash-recovery snapshot round-trip for a Game. Proves that game.toSnapshot()
// captures the STABLE state and Game.fromSnapshot() rebuilds a DETACHED game
// that preserves identity (gameId/inviteCode/managerClientId), players (durable
// fields), the leaderboard and the current-question index — while forcing the
// restored game into a clean, safe state: players connected:false, autoMode
// off, and a resume view primed at the leaderboard.
//
// We build a real Game (not just a RoundManager) with lightweight fakes for io
// and the manager socket, then seed the round's private leaderboard /
// currentQuestion / started the same private-reflection way the project's other
// tests do. No real socket.io is involved.

import type { Player, Quizz } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import { STATUS } from "@razzoozle/common/types/game/status"
import Game from "@razzoozle/socket/services/game"
import Registry from "@razzoozle/socket/services/registry"
import { afterEach, describe, expect, it } from "vitest"

import { makePlayer } from "./helpers"

// A no-op io whose .to(room).emit(...) is captured but never asserted: Game and
// its collaborators only ever fan out through io.to(...).emit(...).
const makeIo = (): Server =>
  ({
    to: (_room: string) => ({
      emit: () => true,
    }),
  }) as unknown as Server

// Minimal manager socket: Game reads handshake.auth.clientId and calls
// join()/emit() once at construction.
const makeManagerSocket = (clientId: string, socketId = "mgr-sock"): Socket =>
  ({
    id: socketId,
    handshake: { auth: { clientId } },
    join: () => undefined,
    emit: () => true,
  }) as unknown as Socket

const makeQuizz = (): Quizz => ({
  subject: "Recovery",
  questions: [
    {
      question: "Q1",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [1],
      cooldown: 5,
      time: 20,
    },
    {
      question: "Q2",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
  ],
})

// Reflect into the round's private fields to seed a realistic mid-game state.
const seedRound = (
  game: Game,
  opts: {
    started: boolean
    currentQuestion: number
    leaderboard: Player[]
    autoMode: boolean
  },
): void => {
  const round = (game as unknown as { round: unknown }).round as {
    started: boolean
    currentQuestion: number
    leaderboard: Player[]
    autoMode: boolean
  }

  round.started = opts.started
  round.currentQuestion = opts.currentQuestion
  round.leaderboard = opts.leaderboard
  round.autoMode = opts.autoMode
}

// Read the (private) lastBroadcastStatus the resume view is primed into.
const getLastBroadcast = (game: Game): { name: string; data: unknown } | null =>
  (
    game as unknown as {
      lastBroadcastStatus: { name: string; data: unknown } | null
    }
  ).lastBroadcastStatus

afterEach(() => {
  // The Game module imports the Registry singleton, which arms a cleanup
  // interval at construction. Clear it so no timer bleeds across tests.
  Registry.getInstance().cleanup()
})

describe("Game crash-recovery snapshot round-trip", () => {
  it("preserves identity, players, leaderboard and current question; restored game is detached + safe", () => {
    const io = makeIo()
    const quizz = makeQuizz()
    const game = new Game(io, makeManagerSocket("manager-1"), quizz)

    // Seed players with points + streak (replace() is the public setter).
    const alice: Player = {
      ...makePlayer("alice"),
      points: 1200,
      streak: 3,
    }
    const bob: Player = {
      ...makePlayer("bob"),
      points: 800,
      streak: 0,
    }
    ;(
      game as unknown as { playerManager: { replace: (p: Player[]) => void } }
    ).playerManager.replace([alice, bob])

    // Seed a realistic mid-game round: started, on question index 2, with a
    // leaderboard and autoMode ON (to prove restore forces it OFF).
    const leaderboard: Player[] = [alice, bob]
    seedRound(game, {
      started: true,
      currentQuestion: 2,
      leaderboard,
      autoMode: true,
    })

    // ── Snapshot ──────────────────────────────────────────────────────────
    const snap = game.toSnapshot()

    expect(snap.gameId).toBe(game.gameId)
    expect(snap.inviteCode).toBe(game.inviteCode)
    expect(snap.started).toBe(true)
    expect(snap.managerClientId).toBe("manager-1")
    expect(snap.round.currentQuestion).toBe(2)
    expect(snap.players).toEqual([
      { clientId: "alice", username: "alice", points: 1200, streak: 3 },
      { clientId: "bob", username: "bob", points: 800, streak: 0 },
    ])
    expect(snap.round.leaderboard).toHaveLength(2)

    // ── Restore ─────────────────────────────────────────────────────────────
    const restored = Game.fromSnapshot(io, snap)

    // Identity is the SAVED identity (not a fresh uuid / invite code).
    expect(restored.gameId).toBe(game.gameId)
    expect(restored.inviteCode).toBe(game.inviteCode)
    expect(restored.started).toBe(true)
    expect(restored.manager.clientId).toBe("manager-1")

    // Manager stays detached until a real socket reconnects.
    expect(restored.manager.connected).toBe(false)
    expect(restored.manager.id).toBe("")

    // Players preserved (durable fields) but DETACHED.
    expect(restored.players).toHaveLength(2)
    const restoredAlice = restored.players.find((p) => p.clientId === "alice")
    expect(restoredAlice).toBeDefined()
    expect(restoredAlice?.username).toBe("alice")
    expect(restoredAlice?.points).toBe(1200)
    expect(restoredAlice?.streak).toBe(3)
    restored.players.forEach((p) => {
      expect(p.connected).toBe(false)
      expect(p.id).toBe("")
    })

    // Current question index preserved.
    const restoredRound = (restored as unknown as { round: unknown }).round as {
      currentQuestion: number
      autoMode: boolean
    }
    expect(restoredRound.currentQuestion).toBe(2)
    expect(restored.toSnapshot().round.currentQuestion).toBe(2)

    // Leaderboard preserved.
    expect(restored.toSnapshot().round.leaderboard).toHaveLength(2)

    // Auto-mode is forced OFF on restore regardless of the saved value.
    expect(restoredRound.autoMode).toBe(false)
    expect(restored.toSnapshot().autoMode).toBe(false)

    // Resume view primed at the leaderboard so reconnecting clients land on the
    // standings.
    const last = getLastBroadcast(restored)
    expect(last?.name).toBe(STATUS.SHOW_LEADERBOARD)
    const data = last?.data as {
      leaderboard: Player[]
      oldLeaderboard: Player[]
    }
    expect(data.leaderboard).toHaveLength(2)
    expect(data.leaderboard[0].clientId).toBe("alice")
  })

  it("a restored leaderboard is deep-copied (snapshot mutation does not leak)", () => {
    const io = makeIo()
    const game = new Game(io, makeManagerSocket("m2"), makeQuizz())

    const p: Player = { ...makePlayer("carol"), points: 500, streak: 1 }
    seedRound(game, {
      started: true,
      currentQuestion: 0,
      leaderboard: [p],
      autoMode: false,
    })

    const snap = game.toSnapshot()
    const restored = Game.fromSnapshot(io, snap)

    // Mutating the snapshot leaderboard must not affect the restored game.
    snap.round.leaderboard[0].points = 999999

    expect(restored.toSnapshot().round.leaderboard[0].points).toBe(500)
  })
})
