// Sim-mode BotManager — owns bot identity + the per-question answer scheduler.
//
// Bots are virtual players (isBot:true, no real socket). They submit answers by
// calling the EXISTING game.selectAnswer via a synthetic Socket stub, so they
// reuse the real dedup / timeToPoint / deadline / early-advance path — no logic
// is duplicated and no solution ever leaks to a client. Bots have SERVER-side
// access to solutions/correct here (they live in the server bundle), so they
// answer correctly at a configurable rate on purpose, for UX/leaderboard/
// histogram/beamer testing.
//
// Prod-safety: the ABILITY is gated by RAHOOT_SIM_MODE in Game.addBots; this
// code is always in the bundle but inert unless a bot is actually added.
import {
  BOT,
  SLIDER_TOLERANCE_FRACTION,
} from "@razzia/common/constants"
import type { Player, Question } from "@razzia/common/types/game"
import type { Socket } from "@razzia/common/types/game/socket"
import { nanoid } from "nanoid"

import { BOT_NAMES } from "./bot-names"

// Submit callback: hand a synthetic socket + an answerId to the real answer
// path (Game wires this to game.selectAnswer).
type SubmitFn = (_stub: Socket, _answerId: number) => void

// Read access to the live roster (humans + bots) so usernames dedup correctly
// and the scheduler can iterate the current bots.
type RosterFn = () => Player[]

export interface BotManagerOptions {
  submit: SubmitFn
  roster: RosterFn
}

export class BotManager {
  private readonly submit: SubmitFn
  private readonly roster: RosterFn
  // Pending answer timers keyed by the bot's clientId. cancelPending clears
  // them at every answer-window close so a late bot can't contaminate the next
  // question (or fire after the game is disposed).
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>()
  // Per-bot stable "speed" trait in [0,1): varies a bot's delay so the bots
  // don't all answer at the same instant. Keyed by clientId.
  private readonly speed = new Map<string, number>()

  constructor(opts: BotManagerOptions) {
    this.submit = opts.submit
    this.roster = opts.roster
  }

  // Build `count` bot Player records with namespaced ids and unique usernames.
  // Does NOT insert them into the roster — Game.addBots calls playerManager
  // .addBot(bot) for each, then broadcastCount() once.
  addBots(count: number): Player[] {
    const taken = new Set(this.roster().map((p) => p.username))
    const bots: Player[] = []

    for (let i = 0; i < count; i += 1) {
      const username = this.nextUsername(taken)
      taken.add(username)

      const clientId = `bot:${nanoid()}`
      const bot: Player = {
        id: `bot:${nanoid()}`,
        clientId,
        connected: true,
        isBot: true,
        username,
        points: 0,
        streak: 0,
      }

      this.speed.set(clientId, Math.random())
      bots.push(bot)
    }

    return bots
  }

  // Pick the next free name from the pool; if exhausted, suffix a number until
  // a free one is found (deduped against humans + already-chosen bot names).
  private nextUsername(taken: Set<string>): string {
    for (const name of BOT_NAMES) {
      if (!taken.has(name)) {
        return name
      }
    }

    // Pool exhausted — append an incrementing suffix to a base name.
    let suffix = 2

    for (;;) {
      const base = BOT_NAMES[(suffix - 2) % BOT_NAMES.length] ?? "Bot"
      const candidate = `${base} ${suffix}`

      if (!taken.has(candidate)) {
        return candidate
      }

      suffix += 1
    }
  }

  // Schedule one answer per bot for this question. Each bot fires once after a
  // per-bot delay; the timer is tracked so cancelPending can clear it at the
  // answer-window close.
  onQuestionOpen(question: Question): void {
    // Cancel any leftover timers from a prior question (defensive — Game also
    // wires onAnswerWindowClose to cancelPending).
    this.cancelPending()

    for (const bot of this.roster()) {
      if (!bot.isBot) {
        continue
      }

      const delay = this.computeDelay(question, bot.clientId)
      const stub = this.makeStub(bot)
      const answerId = this.pickAnswer(question)

      const timer = setTimeout(() => {
        this.pending.delete(bot.clientId)
        this.submit(stub, answerId)
      }, delay)

      this.pending.set(bot.clientId, timer)
    }
  }

  // Delay floor BOT.MIN_DELAY_MS, cap min(BOT.MAX_DELAY_MS, time*1000*0.85),
  // varied per-bot by its speed trait. Math.max guards range inversion on a
  // short question (where the cap could fall below the floor).
  private computeDelay(question: Question, clientId: string): number {
    const cap = Math.min(BOT.MAX_DELAY_MS, question.time * 1000 * 0.85)
    const upper = Math.max(BOT.MIN_DELAY_MS, cap)
    const trait = this.speed.get(clientId) ?? Math.random()

    return Math.round(BOT.MIN_DELAY_MS + trait * (upper - BOT.MIN_DELAY_MS))
  }

  // Choose an answerId for this question by type. NOTE: question.solutions is
  // ALREADY number[] | undefined at runtime (the quizz validator transforms a
  // scalar to an array at quizz.ts:23). Treat it as an array; never re-normalize
  // and never assume a scalar.
  private pickAnswer(question: Question): number {
    if (question.type === "slider") {
      return this.pickSlider(question)
    }

    if (question.type === "poll") {
      const total = question.answers?.length ?? 0

      return total > 0 ? Math.floor(Math.random() * total) : 0
    }

    return this.pickChoice(question)
  }

  // choice/boolean: with P=CORRECT_RATE pick a random element of solutions; else
  // a random index not in solutions (fallback any index if all are solutions).
  private pickChoice(question: Question): number {
    const answers = question.answers ?? []
    const total = answers.length
    const solutions = question.solutions ?? []

    if (total === 0) {
      return 0
    }

    const wantCorrect = Math.random() < BOT.CORRECT_RATE

    if (wantCorrect && solutions.length > 0) {
      const idx = Math.floor(Math.random() * solutions.length)

      return solutions[idx] ?? 0
    }

    // Want a wrong (non-solution) index.
    const wrong: number[] = []

    for (let i = 0; i < total; i += 1) {
      if (!solutions.includes(i)) {
        wrong.push(i)
      }
    }

    if (wrong.length === 0) {
      // Every index is a solution — fall back to any random index.
      return Math.floor(Math.random() * total)
    }

    const pick = wrong[Math.floor(Math.random() * wrong.length)]

    return pick ?? 0
  }

  // slider: with P=CORRECT_RATE land inside tolerance of `correct`; else a
  // uniform random value in [min,max] outside tolerance. min/max/correct/step
  // are server-side. tolerance = max(step ?? 0, (max-min)*SLIDER_TOLERANCE_FRACTION).
  private pickSlider(question: Question): number {
    const min = question.min ?? 0
    const max = question.max ?? 0
    const correct = question.correct ?? min
    const range = max - min || 1
    const tolerance = Math.max(
      question.step ?? 0,
      range * SLIDER_TOLERANCE_FRACTION,
    )
    const wantCorrect = Math.random() < BOT.CORRECT_RATE

    if (wantCorrect) {
      // Uniform jitter in [-tolerance, +tolerance], clamped to [min,max].
      const jitter = (Math.random() * 2 - 1) * tolerance
      const value = correct + jitter

      return Math.round(Math.min(max, Math.max(min, value)))
    }

    // Want an out-of-tolerance value. Try a few uniform samples; if the range is
    // too tight to land outside tolerance, fall back to a clamped extreme.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const value = Math.round(min + Math.random() * range)

      if (Math.abs(value - correct) > tolerance) {
        return value
      }
    }

    return correct - min > max - correct ? min : max
  }

  // Synthetic socket stub: mirrors helpers.makeSocket exactly. selectAnswer only
  // reads handshake.auth.clientId, socket.id (routed to a no-op room for a bot),
  // socket.emit (LL ack, no-op) and socket.to(gameId).emit (normal-mode count,
  // no-op). No rooms/data/disconnect/join is read.
  private makeStub(bot: Player): Socket {
    return {
      id: bot.id,
      handshake: { auth: { clientId: bot.clientId } },
      emit: () => true,
      to: () => ({ emit: () => true }),
    } as unknown as Socket
  }

  // Clear all outstanding timers (idempotent) or one bot's timer (on kick).
  cancelPending(clientId?: string): void {
    if (clientId !== undefined) {
      const timer = this.pending.get(clientId)

      if (timer) {
        clearTimeout(timer)
        this.pending.delete(clientId)
      }

      return
    }

    for (const timer of this.pending.values()) {
      clearTimeout(timer)
    }

    this.pending.clear()
  }

  // Count of bots currently on the roster.
  count(): number {
    return this.roster().filter((p) => p.isBot).length
  }

  // Is this clientId a known bot (by namespace + roster)?
  isBot(clientId: string): boolean {
    return this.roster().some((p) => p.clientId === clientId && p.isBot === true)
  }

  // Clear all per-bot trait + timer state (used on full teardown).
  removeAll(): void {
    this.cancelPending()
    this.speed.clear()
  }
}
