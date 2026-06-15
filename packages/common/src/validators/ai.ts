import {
  AI,
  AI_PROVIDER_KINDS,
  AI_PROVIDER_OFF,
} from "@razzoozle/common/constants"
import { z } from "zod"

// One configured text provider. NOTE: the API key is intentionally NOT part of
// this schema — keys are stored server-side (config/ai-secrets.json) and never
// travel over the socket. The client edits the key via AI.SET_KEY and only ever
// reads back a `keyConfigured` boolean (see aiSettingsPublic types).
export const aiProviderValidator = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  kind: z.enum(AI_PROVIDER_KINDS),
  baseUrl: z.url().optional(),
  model: z.string().min(1).max(120),
  // WP-10 — per-provider text temperature, optional for backward-compat.
  temperature: z.number().min(AI.TEMP_MIN).max(AI.TEMP_MAX).optional(),
})

export const aiImageProviderValidator = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  baseUrl: z.url().optional(),
  workflow: z.string().max(300).optional(),
  // WP-10 — accept any of the allowed square sizes; optional for backward-compat.
  // Use a z.union of numeric literals (NOT z.enum, which is string-only).
  resolution: z
    .union([z.literal(512), z.literal(768), z.literal(1024)])
    .optional(),
})

// Persisted AI settings (no secrets). activeProvider is a provider id or "off".
export const aiSettingsValidator = z.object({
  text: z.object({
    activeProvider: z.string().min(1),
    providers: z.array(aiProviderValidator),
  }),
  image: z.object({
    activeProvider: z.string().min(1),
    providers: z.array(aiImageProviderValidator),
  }),
})

// SET_KEY payload: empty/whitespace key clears the stored secret.
export const aiSetKeyValidator = z.object({
  providerId: z.string().min(1).max(40),
  key: z.string().max(400),
})

export const aiTestValidator = z.object({
  providerId: z.string().min(1).max(40).optional(),
})

export const aiGenerateQuestionValidator = z.object({
  topic: z.string().min(1).max(AI.TOPIC_MAX_LEN),
  // Which question kind to author (defaults to "choice" server-side).
  type: z
    .enum(["choice", "boolean", "multiple-select", "type-answer"])
    .optional(),
  language: z.string().min(2).max(8).optional(),
})

export const aiGenerateDistractorsValidator = z.object({
  question: z.string().min(1).max(300),
  correct: z.string().min(1).max(200),
  count: z.number().int().min(1).max(3).optional(),
  language: z.string().min(2).max(8).optional(),
})

export const aiGenerateQuizValidator = z.object({
  topic: z.string().min(1).max(AI.TOPIC_MAX_LEN),
  count: z.number().int().min(AI.QUIZ_MIN_QUESTIONS).max(AI.QUIZ_MAX_QUESTIONS),
  language: z.string().min(2).max(8).optional(),
})

export { AI_PROVIDER_OFF }
