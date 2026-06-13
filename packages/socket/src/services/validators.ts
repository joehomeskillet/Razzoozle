// Socket-local input validators. These guard hostile/malformed client payloads
// and on-disk result files at the trust boundary. They intentionally live in the
// socket package (not @razzia/common) because they describe server-side ingress
// rules, not shared wire shapes.
import { BOT } from "@razzia/common/constants"
import { z } from "zod"

// SELECTED_ANSWER payload: answerKey must be a finite integer; the optional
// per-tap clientMessageId (LL-mode dedup) is a string when present. A missing id
// means "dedup by player+question only".
export const selectedAnswerValidator = z.object({
  answerKey: z.number().int("errors:game.invalidAnswer"),
  clientMessageId: z.string().optional(),
})

// ADD_BOTS payload guard: how many bots to add this request. Bounded [1,
// BOT.MAX_PER_REQUEST]; the per-game cumulative ceiling (BOT.MAX_TOTAL) is
// enforced separately in Game.addBots so repeated clicks can't exceed it.
export const addBotsValidator = z.object({
  count: z.number().int().min(1).max(BOT.MAX_PER_REQUEST),
})

// Persisted GameResult shape. Mirrors the GameResult interface in
// @razzia/common/types/game; used to validate result files on read instead of a
// bare `as GameResult` cast, consistent with the quizz/theme readers.
const gameResultPlayerValidator = z.object({
  username: z.string(),
  points: z.number(),
  rank: z.number(),
})

export const gameResultValidator = z.object({
  id: z.string(),
  subject: z.string(),
  date: z.string(),
  players: z.array(gameResultPlayerValidator),
  questions: z.array(z.unknown()),
})
