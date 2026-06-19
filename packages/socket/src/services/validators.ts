// Socket-local input validators. These guard hostile/malformed client payloads
// and on-disk result files at the trust boundary. They intentionally live in the
// socket package (not @razzoozle/common) because they describe server-side ingress
// rules, not shared wire shapes.
import { BOT } from "@razzoozle/common/constants"
import { z } from "zod"

// SELECTED_ANSWER payload: answerKey must be a finite integer; the optional
// per-tap clientMessageId (LL-mode dedup) is a string when present. A missing id
// means "dedup by player+question only". For multiple-select the real payload is
// in answerKeys (1..4 ints, mirroring the question validator's answers cap);
// for type-answer it is in answerText (capped at 200 chars to block payload
// bombs). answerKey stays REQUIRED for backward compatibility — multi-select /
// type-answer clients send a sentinel (e.g. -1). The per-question-type rules
// (which of these is meaningful) are enforced in RoundManager.selectAnswer,
// which has the live question.
export const selectedAnswerValidator = z.object({
  answerKey: z.number().int("errors:game.invalidAnswer"),
  answerKeys: z.array(z.number().int()).min(1).max(4).optional(),
  answerText: z.string().max(200).optional(),
  clientMessageId: z.string().optional(),
})

// ADD_BOTS payload guard: how many bots to add this request. Bounded [1,
// BOT.MAX_PER_REQUEST]; the per-game cumulative ceiling (BOT.MAX_TOTAL) is
// enforced separately in Game.addBots so repeated clicks can't exceed it.
export const addBotsValidator = z.object({
  count: z.number().int().min(1).max(BOT.MAX_PER_REQUEST),
})

// Persisted GameResult shape. Mirrors the GameResult interface in
// @razzoozle/common/types/game; used to validate result files on read instead of a
// bare `as GameResult` cast, consistent with the quizz/theme readers.
const gameResultPlayerValidator = z.object({
  username: z.string(),
  points: z.number(),
  rank: z.number(),
})

// Optional post-game recap, persisted alongside the result so the public share
// page can replay the superlative reveal. Loosely typed (superlatives array +
// optional hardest-question callout) — mirrors ManagerRecap in @razzoozle/common.
// Optional so older result files without it still validate.
const managerRecapValidator = z.object({
  superlatives: z.array(
    z.object({
      key: z.string(),
      winnerName: z.string(),
      winnerAvatar: z.string().optional(),
      value: z.number(),
    }),
  ),
  hardestQuestion: z
    .object({ questionIndex: z.number(), correctPct: z.number() })
    .optional(),
})

export const gameResultValidator = z.object({
  id: z.string(),
  subject: z.string(),
  date: z.string(),
  players: z.array(gameResultPlayerValidator),
  questions: z.array(z.unknown()),
  recap: managerRecapValidator.optional(),
})
