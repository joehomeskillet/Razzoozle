import { MEDIA_TYPES, QUESTION_TYPES } from "@razzoozle/common/constants"
import { z } from "zod"

export const questionMediaValidator = z.object({
  type: z
    .enum([MEDIA_TYPES.IMAGE, MEDIA_TYPES.VIDEO, MEDIA_TYPES.AUDIO])
    .optional(),
  // Accept an absolute external URL OR a site-relative app asset path
  // (/media, /theme). AI-generated and uploaded media are stored relative
  // (e.g. "/media/gen-<id>.webp"), which z.url() wrongly rejected.
  url: z
    .string()
    .min(1, "errors:quizz.invalidMediaUrl")
    .refine(
      (value) =>
        /^https?:\/\/\S+$/.test(value) ||
        (/^\/(media|theme)\/[^\s]+$/.test(value) && !value.includes("..")),
      "errors:quizz.invalidMediaUrl",
    ),
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
    // Lenient at the base (an empty array is allowed here) so the per-type
    // superRefine below owns the friendly, localized messages — e.g. a choice
    // question with no correct answer marked gets "noSolution", not Zod's raw
    // "Too small: expected array to have >=1 items".
    solutions: z
      .union([z.number().int().min(0), z.array(z.number().int().min(0))])
      .transform((v) => (Array.isArray(v) ? v : [v]))
      .optional(),
    // Slider
    min: z.number().optional(),
    max: z.number().optional(),
    correct: z.number().optional(),
    step: z.number().positive().optional(),
    unit: z.string().optional(),
    // Sentence-builder: word chunks in correct order.
    chunks: z
      .array(z.string().min(1, "errors:quizz.chunkEmpty").max(40, "errors:quizz.chunkTooLong"))
      .min(2)
      .max(16)
      .optional(),
    cooldown: z.number().int().min(3).max(15),
    time: z.number().int().min(5).max(120),
    practice: z.boolean().optional(),
    bonus: z.boolean().optional(),
    submittedBy: z.string().optional(),
    // Type-answer: free-text accepted answers + how they're compared.
    // Lenient at the base; the type-answer branch of the superRefine enforces
    // the >=1 requirement with the friendly "acceptedAnswersMin" message.
    acceptedAnswers: z
      .array(z.string().min(1).max(200))
      .max(20)
      .optional(),
    matchMode: z.enum(["exact", "normalized", "fuzzy"]).optional(),
    // Mathematik: numeric answer with tolerance
    tolerance: z.number().optional(),
    decimals: z.number().int().optional(),
    // Wortarten: parts of speech tagging
    sentence: z.string().optional(),
    tokens: z.array(z.string()).optional(),
    posSet: z.array(z.string()).optional(),
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
    } else if (q.type === "multiple-select") {
      // Needs >=2 answers and >=2 correct solutions.
      if (!q.answers || q.answers.length < 2) {
        ctx.addIssue({ code: "custom", message: "errors:quizz.tooFewAnswers" })
      }

      if (!q.solutions || q.solutions.length < 2) {
        ctx.addIssue({
          code: "custom",
          message: "errors:quizz.solutionsMin2",
          path: ["solutions"],
        })
      }
    } else if (q.type === "type-answer") {
      // Free-text: needs >=1 accepted answer; answers/solutions not required.
      if (!q.acceptedAnswers || q.acceptedAnswers.length < 1) {
        ctx.addIssue({
          code: "custom",
          message: "errors:quizz.acceptedAnswersMin",
          path: ["acceptedAnswers"],
        })
      }
    } else if (q.type === "sentence-builder") {
      // Sentence-builder: needs chunks with length >= 2.
      if (!q.chunks || q.chunks.length < 2) {
        ctx.addIssue({
          code: "custom",
          message: "errors:quizz.tooFewChunks",
          path: ["chunks"],
        })
      }
    } else if (q.type === "mathematik") {
      // Mathematik: numeric answer with tolerance (permissive stub for now)
    } else if (q.type === "wortarten") {
      // Wortarten: parts of speech tagging (permissive stub for now)
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
  // Archived quizzes stay on disk + remain editable, but are hidden from the
  // "play" list. Optional so every pre-existing quizz.json validates unchanged.
  archived: z.boolean().optional(),
  // References a theme-template id; absent/"" = global theme. Optional so every
  // pre-existing quizz.json validates unchanged (back-compat).
  themeId: z.string().max(80).optional(),
})
