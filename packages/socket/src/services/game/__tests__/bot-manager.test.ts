// Sim-mode (feature #7) socket tests. Covers the seven cases the contract calls
// out: bot answer selection, bots flowing through the real scoring path, early-
// advance including bots, cancelPending on early-advance (no late bot), snapshot
// excluding bots from BOTH the player list AND the round leaderboard /
// questionsHistory, the three add-bot gates, and the ADD_BOTS handler payload.
//
// Tests that exercise the full path build a REAL Game (like snapshot.test.ts) so
// the real BotManager + RoundManager + PlayerManager are wired together. The
// Registry singleton arms a cleanup interval at construction, so we call
// registry.cleanup() in before/after to avoid a timer bleeding across tests.

import type { Player, Question, Quizz } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import { BotManager } from "@razzoozle/socket/services/game/bot-manager"
import Game from "@razzoozle/socket/services/game"
import Registry from "@razzoozle/socket/services/registry"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { makePlayer } from "./helpers"

// ── Shared fakes ────────────────────────────────────────────────────────────

// A no-op io whose .to(room).emit(...) is captured but never asserted: Game and
// its collaborators only ever fan out through io.to(...).emit(...).
const makeIo = (): Server =>
  ({
    to: (_room: string) => ({
      emit: () => true,
    }),
  }) as unknown as Server

// Minimal manager socket: Game reads handshake.auth.clientId + calls join/emit.
const makeManagerSocket = (clientId: string, socketId = "mgr-sock"): Socket =>
  ({
    id: socketId,
    handshake: { auth: { clientId } },
    join: () => undefined,
    emit: () => true,
  }) as unknown as Socket

const choiceQuestion: Question = {
  question: "Q",
  type: "choice",
  answers: ["A", "B", "C", "D"],
  solutions: [1],
  cooldown: 5,
  time: 20,
}

const sliderQuestion: Question = {
  question: "S",
  type: "slider",
  min: 0,
  max: 100,
  correct: 50,
  step: 1,
  cooldown: 5,
  time: 20,
}

const pollQuestion: Question = {
  question: "P",
  type: "poll",
  answers: ["X", "Y", "Z"],
  cooldown: 5,
  time: 20,
}

const makeQuizz = (questions: Question[]): Quizz => ({
  subject: "Sim",
  questions,
})

// Reflect into the Game's private round to read scoring state + seed flags.
const getRound = (game: Game) =>
  (game as unknown as { round: unknown }).round as {
    started: boolean
    currentQuestion: number
    startTime: number
    leaderboard: Player[]
    playersAnswers: Array<{ clientId: string; answerId: number }>
    answerWindowOpen: boolean
    isAnswerWindowOpen: () => boolean
    selectAnswer: (_s: Socket, _a: number) => void
    showResults: (_q: Question) => void
  }

// Open the answer window the way newQuestion() does at the broadcast point:
// set started + currentQuestion + the window flag, then fire the bot scheduler.
const openWindow = (game: Game, question: Question, index = 0): void => {
  const round = getRound(game)
  round.started = true
  round.currentQuestion = index
  // Mirror newQuestion()'s answer-window open: stamp startTime (drives
  // timeToPoint scoring) and set the window flag, then schedule bot answers.
  round.startTime = Date.now()
  round.answerWindowOpen = true
  const botManager = (game as unknown as { botManager: BotManager }).botManager
  botManager.onQuestionOpen(question)
}

beforeEach(() => {
  Registry.getInstance().cleanup()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  Registry.getInstance().cleanup()
})

// ── 1. Answer selection ──────────────────────────────────────────────────────

describe("BotManager.pickAnswer (answer selection)", () => {
  const pick = (bm: BotManager, q: Question): number =>
    (
      bm as unknown as { pickAnswer: (_q: Question) => number }
    ).pickAnswer(q)

  it("CORRECT_RATE=1 → choice answer is always a solution", () => {
    const bm = new BotManager({ submit: () => {}, roster: () => [] })
    const spy = vi.spyOn(Math, "random").mockReturnValue(0) // < CORRECT_RATE
    try {
      for (let i = 0; i < 20; i += 1) {
        expect(choiceQuestion.solutions).toContain(pick(bm, choiceQuestion))
      }
    } finally {
      spy.mockRestore()
    }
  })

  it("CORRECT_RATE=0 (Math.random≈1) → choice answer is NOT a solution", () => {
    const bm = new BotManager({ submit: () => {}, roster: () => [] })
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.999) // ≥ CORRECT_RATE
    try {
      for (let i = 0; i < 20; i += 1) {
        const a = pick(bm, choiceQuestion)
        expect(choiceQuestion.solutions).not.toContain(a)
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThan(choiceQuestion.answers?.length ?? 0)
      }
    } finally {
      spy.mockRestore()
    }
  })

  it("CORRECT_RATE=1 → slider value is within tolerance of correct", () => {
    const bm = new BotManager({ submit: () => {}, roster: () => [] })
    // First Math.random() < CORRECT_RATE (want correct); rest drive the jitter.
    const spy = vi.spyOn(Math, "random").mockReturnValue(0)
    try {
      const v = pick(bm, sliderQuestion)
      // tolerance = max(step=1, range*0.05=5) = 5; value should be within ±5.
      expect(Math.abs(v - (sliderQuestion.correct ?? 0))).toBeLessThanOrEqual(5)
    } finally {
      spy.mockRestore()
    }
  })

  it("CORRECT_RATE=0 → slider value is OUTSIDE tolerance of correct", () => {
    const bm = new BotManager({ submit: () => {}, roster: () => [] })
    // Math.random≈0.999 → want wrong; uniform sample lands near max ⇒ far away.
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.999)
    try {
      const v = pick(bm, sliderQuestion)
      expect(Math.abs(v - (sliderQuestion.correct ?? 0))).toBeGreaterThan(5)
    } finally {
      spy.mockRestore()
    }
  })

  it("poll → a valid answer index", () => {
    const bm = new BotManager({ submit: () => {}, roster: () => [] })
    for (let i = 0; i < 20; i += 1) {
      const a = pick(bm, pollQuestion)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(pollQuestion.answers?.length ?? 0)
    }
  })
})

// ── 2. Bots flow through scoring ─────────────────────────────────────────────

describe("bots flow through the real scoring path", () => {
  it("a bot answer lands in playersAnswers, earns timeToPoint, scores", () => {
    vi.setSystemTime(1_000_000_000_000)
    const game = new Game(
      makeIo(),
      makeManagerSocket("mgr"),
      makeQuizz([choiceQuestion]),
    )
    const round = getRound(game)

    // A correct human + bots that all answer correctly (mock random low).
    ;(
      game as unknown as { playerManager: { addBot: (p: Player) => void } }
    ).playerManager
    // Seed one real human player via replace, then add bots through the path.
    ;(
      game as unknown as { playerManager: { replace: (p: Player[]) => void } }
    ).playerManager.replace([makePlayer("human")])

    const spy = vi.spyOn(Math, "random").mockReturnValue(0) // bots answer correct
    try {
      // Use the real Game.addBots (needs the env gate + manager ownership).
      process.env.RAHOOT_SIM_MODE = "1"
      const mgr = makeManagerSocket("mgr")
      game.addBots(mgr, 3)

      openWindow(game, choiceQuestion)

      // Human answers correctly too.
      round.selectAnswer(makeBotlessSocket("human"), 1)

      // Advance past every scheduled bot delay (cap ≤ time*0.85*1000).
      vi.advanceTimersByTime(choiceQuestion.time * 1000)

      // 1 human + 3 bots all answered.
      expect(round.playersAnswers.length).toBe(4)

      // Run the full results pipeline; a correct bot gains points + streak.
      round.showResults(choiceQuestion)
      const board = round.leaderboard
      const bot = board.find((p) => p.isBot)
      expect(bot).toBeDefined()
      expect(bot?.points ?? 0).toBeGreaterThan(0)
      expect(bot?.streak ?? 0).toBe(1)
    } finally {
      spy.mockRestore()
      delete process.env.RAHOOT_SIM_MODE
    }
  })
})

// ── 3. Early-advance includes bots ───────────────────────────────────────────

describe("early-advance includes bots", () => {
  it("all real+bot answered → cooldown.abort fires", () => {
    let aborts = 0
    const game = buildGameWithCooldownSpy(() => {
      aborts += 1
    })
    process.env.RAHOOT_SIM_MODE = "1"
    const spy = vi.spyOn(Math, "random").mockReturnValue(0)
    try {
      ;(
        game as unknown as { playerManager: { replace: (p: Player[]) => void } }
      ).playerManager.replace([makePlayer("human")])
      game.addBots(makeManagerSocket("mgr"), 2)

      const round = getRound(game)
      openWindow(game, choiceQuestion)

      // Human answers; bots fire on their timers.
      round.selectAnswer(makeBotlessSocket("human"), 1)
      vi.advanceTimersByTime(choiceQuestion.time * 1000)

      // 1 human + 2 bots = full house ⇒ early advance ⇒ cooldown.abort.
      expect(aborts).toBeGreaterThanOrEqual(1)
    } finally {
      spy.mockRestore()
      delete process.env.RAHOOT_SIM_MODE
    }
  })
})

// ── 4. cancelPending on early-advance (no late bot) ──────────────────────────

describe("cancelPending on early-advance", () => {
  it("humans complete the house → abort → NO bot timer fires afterward", () => {
    const game = buildGameWithCooldownSpy(() => {})
    process.env.RAHOOT_SIM_MODE = "1"
    const spy = vi.spyOn(Math, "random").mockReturnValue(0)
    try {
      // Two humans + one bot. Make the bot's delay large so it would fire LATE.
      ;(
        game as unknown as { playerManager: { replace: (p: Player[]) => void } }
      ).playerManager.replace([makePlayer("h1"), makePlayer("h2")])
      game.addBots(makeManagerSocket("mgr"), 1)

      const round = getRound(game)
      openWindow(game, choiceQuestion)

      const answersBefore = round.playersAnswers.length

      // Both humans answer → playersAnswers === count() (2 humans + 1 bot = 3?).
      // The bot is on a pending timer; the early-advance branch fires when the
      // stored answers reach the roster count. To force the close BEFORE the bot
      // timer, drive the close directly via the window-close path: both humans
      // answer, then we simulate the manager-less full-house close by calling
      // showResults — which fires onAnswerWindowClose → cancelPending.
      round.selectAnswer(makeBotlessSocket("h1"), 1)
      round.selectAnswer(makeBotlessSocket("h2"), 1)

      // Close the window (mirrors showResults' onAnswerWindowClose) BEFORE any
      // bot timer would fire.
      round.showResults(choiceQuestion)
      const answersAfterClose = round.playersAnswers.length

      // Now advance well past any bot delay: the cancelled timer must NOT fire,
      // so no new answer is stored (playersAnswers was reset by showResults).
      vi.advanceTimersByTime(choiceQuestion.time * 1000)
      expect(round.playersAnswers.length).toBe(answersAfterClose)
      expect(answersBefore).toBe(0)
    } finally {
      spy.mockRestore()
      delete process.env.RAHOOT_SIM_MODE
    }
  })
})

// ── 5. Snapshot excludes bots — BOTH lists ───────────────────────────────────

describe("snapshot excludes bots from player list AND round leaderboard", () => {
  it("toSnapshot yields zero bots in players, leaderboard, questionsHistory", () => {
    vi.setSystemTime(1_000_000_000_000)
    const game = new Game(
      makeIo(),
      makeManagerSocket("mgr"),
      makeQuizz([choiceQuestion]),
    )
    process.env.RAHOOT_SIM_MODE = "1"
    const spy = vi.spyOn(Math, "random").mockReturnValue(0)
    try {
      ;(
        game as unknown as { playerManager: { replace: (p: Player[]) => void } }
      ).playerManager.replace([makePlayer("human")])
      game.addBots(makeManagerSocket("mgr"), 2)

      const round = getRound(game)
      openWindow(game, choiceQuestion)
      round.selectAnswer(makeBotlessSocket("human"), 1)
      vi.advanceTimersByTime(choiceQuestion.time * 1000)
      round.showResults(choiceQuestion)

      const snap = game.toSnapshot()

      // Player list: no bot clientIds.
      expect(snap.players.some((p) => p.clientId.startsWith("bot:"))).toBe(false)
      expect(snap.players).toHaveLength(1)

      // Round leaderboard: no bots (the anti-regression the contract demands).
      expect(snap.round.leaderboard.some((p) => p.isBot)).toBe(false)
      expect(snap.round.leaderboard).toHaveLength(1)

      // questionsHistory playerAnswers: no bot usernames.
      const botNames = new Set(
        round.leaderboard.filter((p) => p.isBot).map((p) => p.username),
      )
      // (leaderboard is now filtered in the snapshot; derive bot names from the
      // live round leaderboard which still includes them pre-snapshot.)
      for (const q of snap.round.questionsHistory) {
        for (const a of q.playerAnswers) {
          expect(botNames.has(a.playerName)).toBe(false)
        }
      }

      // fromSnapshot yields no bot ghosts.
      const restored = Game.fromSnapshot(makeIo(), snap)
      expect(restored.players.some((p) => p.isBot)).toBe(false)
      expect(restored.players.some((p) => p.clientId.startsWith("bot:"))).toBe(
        false,
      )
    } finally {
      spy.mockRestore()
      delete process.env.RAHOOT_SIM_MODE
    }
  })
})

// ── 5b. Saved GameResult on finish excludes bots ─────────────────────────────
// Regression for the P0 a whole-diff review caught: the persisted result
// (onGameFinished → saveResult) is built from the LIVE unfiltered leaderboard /
// questionsHistory, independently of toSnapshot. Without filtering, a finished
// sim game writes bot names + inflated ranks into config/results/<id>.json.

describe("saved GameResult on finish excludes bots", () => {
  it("onGameFinished payload has no bot usernames in players or questions", () => {
    vi.setSystemTime(1_000_000_000_000)
    const game = new Game(
      makeIo(),
      makeManagerSocket("mgr"),
      makeQuizz([choiceQuestion]),
    )
    process.env.RAHOOT_SIM_MODE = "1"
    const spy = vi.spyOn(Math, "random").mockReturnValue(0)
    try {
      ;(
        game as unknown as { playerManager: { replace: (p: Player[]) => void } }
      ).playerManager.replace([makePlayer("human")])
      game.addBots(makeManagerSocket("mgr"), 2)

      const round = getRound(game)
      openWindow(game, choiceQuestion)
      round.selectAnswer(makeBotlessSocket("human"), 1)
      vi.advanceTimersByTime(choiceQuestion.time * 1000)
      round.showResults(choiceQuestion)

      // Bots ARE in the live leaderboard pre-finish (they look like real players).
      const botNames = new Set(
        round.leaderboard.filter((p) => p.isBot).map((p) => p.username),
      )
      expect(botNames.size).toBe(2)

      // Capture the persisted result that showLeaderboard() hands to saveResult.
      type SavedResult = {
        players: Array<{ username: string; rank: number }>
        questions: Array<{ playerAnswers: Array<{ playerName: string }> }>
      }
      let saved: SavedResult | undefined
      ;(
        round as unknown as {
          opts: { onGameFinished: (_r: SavedResult) => void }
        }
      ).opts.onGameFinished = (r) => {
        saved = r
      }

      // Single-question quiz ⇒ last round ⇒ fires onGameFinished.
      ;(round as unknown as { showLeaderboard: () => void }).showLeaderboard()

      expect(saved).toBeDefined()
      // Persisted players: humans only (rank recomputed 1..N over humans).
      expect(saved?.players).toHaveLength(1)
      for (const p of saved?.players ?? []) {
        expect(botNames.has(p.username)).toBe(false)
      }
      // Persisted questions: no bot answers.
      for (const q of saved?.questions ?? []) {
        for (const a of q.playerAnswers) {
          expect(botNames.has(a.playerName)).toBe(false)
        }
      }
    } finally {
      spy.mockRestore()
      delete process.env.RAHOOT_SIM_MODE
    }
  })
})

// ── 6. Gates ─────────────────────────────────────────────────────────────────

describe("addBots gates", () => {
  it("RAHOOT_SIM_MODE unset → simModeDisabled, adds nothing", () => {
    delete process.env.RAHOOT_SIM_MODE
    const game = new Game(makeIo(), makeManagerSocket("mgr"), makeQuizz([choiceQuestion]))
    const emitted: Array<{ event: string; msg: unknown }> = []
    const mgr = {
      id: "mgr-sock",
      handshake: { auth: { clientId: "mgr" } },
      emit: (event: string, msg: unknown) => {
        emitted.push({ event, msg })

        return true
      },
    } as unknown as Socket

    game.addBots(mgr, 3)
    expect(game.players).toHaveLength(0)
    expect(
      emitted.some((e) => e.msg === "errors:manager.simModeDisabled"),
    ).toBe(true)
  })

  it("non-manager socket → no-op", () => {
    process.env.RAHOOT_SIM_MODE = "1"
    try {
      const game = new Game(
        makeIo(),
        makeManagerSocket("mgr"),
        makeQuizz([choiceQuestion]),
      )
      const stranger = {
        id: "not-the-manager",
        handshake: { auth: { clientId: "x" } },
        emit: () => true,
      } as unknown as Socket
      game.addBots(stranger, 3)
      expect(game.players).toHaveLength(0)
    } finally {
      delete process.env.RAHOOT_SIM_MODE
    }
  })

  it("during an open window → simWindowOpen, adds nothing", () => {
    process.env.RAHOOT_SIM_MODE = "1"
    try {
      const game = new Game(
        makeIo(),
        makeManagerSocket("mgr"),
        makeQuizz([choiceQuestion]),
      )
      const round = getRound(game)
      round.answerWindowOpen = true

      const emitted: Array<{ event: string; msg: unknown }> = []
      const mgr = {
        id: "mgr-sock",
        handshake: { auth: { clientId: "mgr" } },
        emit: (event: string, msg: unknown) => {
          emitted.push({ event, msg })

          return true
        },
      } as unknown as Socket

      game.addBots(mgr, 3)
      expect(game.players).toHaveLength(0)
      expect(
        emitted.some((e) => e.msg === "errors:manager.simWindowOpen"),
      ).toBe(true)
    } finally {
      delete process.env.RAHOOT_SIM_MODE
    }
  })
})

// ── 7. Handler payload ───────────────────────────────────────────────────────

describe("ADD_BOTS handler payload (flat { gameId, count })", () => {
  it("the validator accepts a valid count and rejects a malformed one", async () => {
    const { addBotsValidator } = await import(
      "@razzoozle/socket/services/validators"
    )
    expect(addBotsValidator.safeParse({ count: 5 }).success).toBe(true)
    expect(addBotsValidator.safeParse({ count: 0 }).success).toBe(false)
    expect(addBotsValidator.safeParse({ count: -3 }).success).toBe(false)
    expect(addBotsValidator.safeParse({ count: 1.5 }).success).toBe(false)
    expect(
      addBotsValidator.safeParse({ count: "x" as unknown as number }).success,
    ).toBe(false)
  })

  it("a real flat {gameId, count} adds bots via Game.addBots", () => {
    process.env.RAHOOT_SIM_MODE = "1"
    try {
      const game = new Game(
        makeIo(),
        makeManagerSocket("mgr"),
        makeQuizz([choiceQuestion]),
      )
      // Mirror the handler: destructure flat { gameId, count }, validate, addBots.
      const payload: { gameId?: string; count: number } = {
        gameId: game.gameId,
        count: 4,
      }
      game.addBots(makeManagerSocket("mgr"), payload.count)
      expect(game.players.filter((p) => p.isBot)).toHaveLength(4)
    } finally {
      delete process.env.RAHOOT_SIM_MODE
    }
  })
})

// ── Local helpers ────────────────────────────────────────────────────────────

// A synthetic socket whose durable identity is `clientId` (no bot namespace).
function makeBotlessSocket(clientId: string): Socket {
  return {
    id: clientId,
    handshake: { auth: { clientId } },
    emit: () => true,
    to: () => ({ emit: () => true }),
  } as unknown as Socket
}

// Build a Game whose cooldown.abort is observable. We can't easily inject a
// cooldown into Game, so we spy on the private round's cooldown.abort.
function buildGameWithCooldownSpy(onAbort: () => void): Game {
  vi.setSystemTime(1_000_000_000_000)
  const game = new Game(
    makeIo(),
    makeManagerSocket("mgr"),
    makeQuizz([choiceQuestion]),
  )
  const round = game as unknown as {
    round: { opts: { cooldown: { abort: () => void } } }
  }
  const original = round.round.opts.cooldown.abort.bind(
    round.round.opts.cooldown,
  )
  round.round.opts.cooldown.abort = () => {
    onAbort()
    original()
  }

  return game
}
