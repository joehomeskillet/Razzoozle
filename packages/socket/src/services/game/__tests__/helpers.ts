// Shared test scaffolding for RoundManager unit tests. Builds a RoundManager
// with lightweight fakes so we can exercise the scoring / dedup / deadline /
// ack logic deterministically with vitest fake timers — no real socket.io.
//
// The fakes implement exactly the slices of each collaborator that RoundManager
// touches; nothing more. RoundManager scores strictly off the SERVER clock
// (Date.now() inside timeToPoint), which we control with vi.setSystemTime, so
// these tests assert the real server-authoritative timing path.

import type { Player, Quizz } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import type { Status, StatusDataMap } from "@razzoozle/common/types/game/status"
import type { LowLatencyMode } from "@razzoozle/common/validators/game-config"
import type { CooldownTimer } from "@razzoozle/socket/services/game/cooldown-timer"
import type { PlayerManager } from "@razzoozle/socket/services/game/player-manager"
import { RoundManager } from "@razzoozle/socket/services/game/round-manager"
import { vi } from "vitest"

export const DISABLED_LL: LowLatencyMode = {
  enabled: false,
  clockSync: true,
  preloadNextQuestion: true,
  answerAck: true,
  scoreboardBroadcastThrottleMs: 100,
  maxLatencyCompensationMs: 150,
}

export const enabledLL = (
  overrides: Partial<LowLatencyMode> = {},
): LowLatencyMode => ({
  ...DISABLED_LL,
  enabled: true,
  ...overrides,
})

export const makePlayer = (clientId: string, username = clientId): Player => ({
  // In normal play id === socket.id; for our fakes we reuse clientId as the
  // socket id too, so `send(player.id, ...)` lands on a recognisable target.
  id: clientId,
  clientId,
  connected: true,
  username,
  points: 0,
  streak: 0,
})

// Minimal PlayerManager fake: only the methods RoundManager calls.
export const makePlayers = (initial: Player[]): PlayerManager => {
  let players = [...initial]

  const api = {
    findByClientId: (clientId: string) =>
      players.find((p) => p.clientId === clientId),
    getAll: () => players,
    count: () => players.length,
    replace: (next: Player[]) => {
      players = next
    },
  }

  return api as unknown as PlayerManager
}

// A fake socket whose durable identity is `clientId` (RoundManager reads
// socket.handshake.auth.clientId). Records emit()/to().emit() calls so a test
// can assert acks / answered-count chatter.
export interface FakeSocket {
  socket: Socket
  emitted: Array<{ event: string; payload: unknown }>
  roomEmitted: Array<{ event: string; payload: unknown }>
}

export const makeSocket = (
  clientId: string,
  socketId = clientId,
): FakeSocket => {
  const emitted: Array<{ event: string; payload: unknown }> = []
  const roomEmitted: Array<{ event: string; payload: unknown }> = []

  const socket = {
    id: socketId,
    handshake: { auth: { clientId } },
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload })

      return true
    },
    // Socket.to(room).emit(...) — used for the immediate (normal-mode) count.
    to: (_room: string) => ({
      emit: (event: string, payload: unknown) => {
        roomEmitted.push({ event, payload })

        return true
      },
    }),
  } as unknown as Socket

  return { socket, emitted, roomEmitted }
}

// Captures every broadcast()/send() the RoundManager makes so tests can read
// out SELECT_ANSWER anchors and per-player SHOW_RESULT points.
export interface CapturedRound {
  round: RoundManager
  broadcasts: Array<{ status: Status; data: StatusDataMap[Status] }>
  sends: Array<{ target: string; status: Status; data: StatusDataMap[Status] }>
  cooldownAborts: number
  io: Server
}

export const buildRound = (opts: {
  quizz: Quizz
  players: Player[]
  lowLatency: LowLatencyMode
  managerId?: string
}): CapturedRound => {
  const broadcasts: CapturedRound["broadcasts"] = []
  const sends: CapturedRound["sends"] = []
  let cooldownAborts = 0

  // Io is only used by RoundManager for the throttled answered-count emit
  // (io.to(gameId).emit). Capture it but it's not load-bearing for scoring.
  const ioRoomEmitted: Array<{ event: string; payload: unknown }> = []
  const io = {
    to: (_room: string) => ({
      emit: (event: string, payload: unknown) => {
        ioRoomEmitted.push({ event, payload })

        return true
      },
    }),
  } as unknown as Server

  const cooldown = {
    start: () => Promise.resolve(),
    abort: () => {
      cooldownAborts += 1
    },
  } as unknown as CooldownTimer

  const round = new RoundManager({
    quizz: opts.quizz,
    players: makePlayers(opts.players),
    cooldown,
    io,
    gameId: "test-game",
    getManagerId: () => opts.managerId ?? "manager-socket",
    broadcast: (status, data) => {
      broadcasts.push({ status, data })
    },
    send: (target, status, data) => {
      sends.push({ target, status, data })
    },
    onNewQuestion: () => {},
    onGameFinished: () => {},
    lowLatency: opts.lowLatency,
  })

  return {
    round,
    broadcasts,
    sends,
    get cooldownAborts() {
      return cooldownAborts
    },
    io,
  } as CapturedRound
}

// Read the (private) points the RoundManager pushed for a clientId. We score by
// reflecting into the private playersAnswers array the same way showResults
// would — this lets a scoring test assert the exact server-timed points without
// running the full results pipeline. Guarded so a missing answer reads as null.
export const answeredPoints = (
  round: RoundManager,
  clientId: string,
): number | null => {
  const answers = (
    round as unknown as {
      playersAnswers: Array<{
        clientId: string
        answerId: number
        points: number
      }>
    }
  ).playersAnswers
  const found = answers?.find((a) => a.clientId === clientId)

  return found ? found.points : null
}

// Number of stored answers (server-accepted). Used to prove a duplicate is a
// no-op (count stays 1).
export const answerCount = (round: RoundManager): number => {
  const answers = (
    round as unknown as {
      playersAnswers: Array<{ clientId: string }>
    }
  ).playersAnswers

  return answers?.length ?? 0
}

// Drive the RoundManager's private startTime + LL deadline directly so a test
// can place "now" relative to the question start without running the async
// newQuestion() flow (which awaits real-ish cooldowns). Mirrors exactly what
// newQuestion() sets at the answer-window open.
export const openQuestion = (
  round: RoundManager,
  opts: {
    questionIndex?: number
    startTime: number
    ll: LowLatencyMode
    questionTimeSec: number
  },
): void => {
  const r = round as unknown as {
    currentQuestion: number
    startTime: number
    serverSeq: number
    answerMeta: Map<string, unknown>
    seenMessageIds: Set<string>
    answerDeadlineAtServerMs: number
  }

  r.currentQuestion = opts.questionIndex ?? 0
  r.startTime = opts.startTime

  if (opts.ll.enabled) {
    r.answerMeta.clear()
    r.seenMessageIds.clear()
    r.serverSeq += 1
    r.answerDeadlineAtServerMs = opts.startTime + opts.questionTimeSec * 1000
  }
}

export { vi }
