// Package-internal shared helpers for the MCP tool modules.
// Not a public surface — imported only by ./tools/*.
import { QUESTION_TYPES } from "@razzoozle/common/constants"
import { z } from "zod"
import type { BuildQuestionInput } from "../question-builder.js"

// ── result helpers ──────────────────────────────────────────────────────────

export const ok = (data: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    },
  ],
})

export const fail = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
  isError: true as const,
})

// ── reusable zod input pieces (zod 4, same major as @razzoozle/common) ──────────

// Loose question shape for create_question / add_question. The authoritative
// validation is questionValidator (run inside buildQuestion / saveQuizz); this
// just surfaces the fields to the model with helpful descriptions.
export const questionInputShape = {
  type: z
    .enum(QUESTION_TYPES)
    .describe(
      "Question kind: choice (single correct), boolean (true/false), multiple-select (>=2 correct), type-answer (free text), slider (numeric guess), poll (opinion, no correct answer).",
    ),
  question: z.string().min(1).describe("The question text shown to players."),
  answers: z
    .array(z.string().min(1))
    .min(2)
    .max(4)
    .optional()
    .describe("2-4 answer options (choice/boolean/multiple-select/poll)."),
  solutions: z
    .array(z.number().int().min(0))
    .optional()
    .describe(
      "Index(es) into `answers` of the correct option(s). choice/boolean: 1 index; multiple-select: >=2 indices. Omit for poll/type-answer/slider.",
    ),
  min: z.number().optional().describe("slider: minimum value."),
  max: z.number().optional().describe("slider: maximum value."),
  correct: z.number().optional().describe("slider: the correct value."),
  step: z.number().positive().optional().describe("slider: step granularity."),
  unit: z.string().optional().describe("slider: display unit (e.g. '%','km')."),
  acceptedAnswers: z
    .array(z.string().min(1).max(200))
    .optional()
    .describe("type-answer: accepted free-text answers (1-20)."),
  matchMode: z
    .enum(["exact", "normalized", "fuzzy"])
    .optional()
    .describe("type-answer: comparison mode (default normalized)."),
  mediaUrl: z
    .string()
    .optional()
    .describe(
      "Optional image URL (e.g. a /media/...webp from generate_question_image, or any absolute URL).",
    ),
  cooldown: z
    .number()
    .int()
    .min(3)
    .max(15)
    .optional()
    .describe(
      "Seconds the question is shown before answers open (3-15, def 5).",
    ),
  time: z
    .number()
    .int()
    .min(5)
    .max(120)
    .optional()
    .describe("Seconds players have to answer (5-120, def 20)."),
  practice: z.boolean().optional().describe("Practice question (no scoring)."),
  bonus: z.boolean().optional().describe("Bonus question (double points)."),
}

export const toBuildInput = (a: Record<string, unknown>): BuildQuestionInput =>
  a as unknown as BuildQuestionInput
