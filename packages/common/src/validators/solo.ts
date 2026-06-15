import { z } from "zod"

// Solo play check-answer request (POST /api/quizz/:id/check-answer)
export const soloCheckAnswerRequestValidator = z.object({
  questionIndex: z.number().int().min(0),
  answerId: z.number().int().optional(),
  answerIds: z.array(z.number().int()).optional(),
  answerText: z.string().optional(),
})

export type SoloCheckAnswerInput = z.infer<
  typeof soloCheckAnswerRequestValidator
>

// Solo score submission (POST /api/quizz/:id/solo-score)
export const soloScoreSubmitValidator = z.object({
  // Trim + enforce a max so long names don't bloat the persisted JSON.
  playerName: z.string().min(1).max(40).trim(),
  // z.number() in zod v4 already rejects Infinity / -Infinity / NaN; cap at a
  // realistic maximum (1 000 points × 1 000 questions) so a bogus client score
  // can't bloat the persisted leaderboard.
  score: z.number().min(0).max(1_000_000),
  answers: z
    .array(
      z.object({
        questionIndex: z.number().int().min(0),
        correct: z.boolean(),
      }),
    )
    .optional(),
})

export type SoloScoreSubmitInput = z.infer<typeof soloScoreSubmitValidator>
