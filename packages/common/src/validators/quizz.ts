import { MEDIA_TYPES, QUESTION_TYPES } from "@razzia/common/constants"
import { z } from "zod"

export const questionMediaValidator = z.object({
  type: z
    .enum([MEDIA_TYPES.IMAGE, MEDIA_TYPES.VIDEO, MEDIA_TYPES.AUDIO])
    .optional(),
  url: z.url("errors:quizz.invalidMediaUrl"),
})

export const questionValidator = z
  .object({
    question: z.string().min(1, "errors:quizz.questionEmpty"),
    type: z.enum(QUESTION_TYPES).optional(),
    media: questionMediaValidator.optional(),
    answers: z
      .array(z.string().min(1, "errors:quizz.answerEmpty"))
      .min(2, "errors:quizz.tooFewAnswers")
      .max(4, "errors:quizz.tooManyAnswers")
      .optional(),
    solutions: z
      .union([z.number().int().min(0), z.array(z.number().int().min(0)).min(1)])
      .transform((v) => (Array.isArray(v) ? v : [v]))
      .optional(),
    // slider
    min: z.number().optional(),
    max: z.number().optional(),
    correct: z.number().optional(),
    step: z.number().positive().optional(),
    unit: z.string().optional(),
    cooldown: z.number().int().min(3).max(15),
    time: z.number().int().min(5).max(120),
    practice: z.boolean().optional(),
    bonus: z.boolean().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === "slider") {
      if (q.min == null || q.max == null || q.correct == null) {
        ctx.addIssue({ code: "custom", message: "errors:quizz.sliderMissing" })

        return
      }
      if (q.min >= q.max) {
        ctx.addIssue({ code: "custom", message: "errors:quizz.sliderRange" })
      }
      if (q.correct < q.min || q.correct > q.max) {
        ctx.addIssue({ code: "custom", message: "errors:quizz.sliderCorrect" })
      }
    } else if (q.type === "poll") {
      // Opinion vote: needs answers, no correct solution.
      if (!q.answers || q.answers.length < 2) {
        ctx.addIssue({ code: "custom", message: "errors:quizz.tooFewAnswers" })
      }
    } else {
      if (!q.answers || q.answers.length < 2) {
        ctx.addIssue({ code: "custom", message: "errors:quizz.tooFewAnswers" })
      }
      if (!q.solutions || q.solutions.length < 1) {
        ctx.addIssue({ code: "custom", message: "errors:quizz.noSolution" })
      }
    }
  })

export const quizzValidator = z.object({
  subject: z.string().min(1, "errors:quizz.subjectEmpty"),
  questions: z.array(questionValidator).min(1, "errors:quizz.noQuestions"),
})
