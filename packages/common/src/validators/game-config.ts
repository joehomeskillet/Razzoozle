import {
  DEFAULT_MANAGER_PASSWORD,
  MAX_LATENCY_COMPENSATION_MS,
} from "@razzoozle/common/constants"
import { z } from "zod"

// Low-latency mode feature flag. Master switch `enabled` defaults FALSE so the
// game behaves byte-identically to today unless explicitly opted in. Every
// field is `.default(...)`ed so a bare `{ managerPassword }` config back-fills
// the whole block without manual edits.
export const lowLatencyModeValidator = z
  .object({
    enabled: z.boolean().default(false),
    clockSync: z.boolean().default(true),
    preloadNextQuestion: z.boolean().default(true),
    answerAck: z.boolean().default(true),
    scoreboardBroadcastThrottleMs: z
      .number()
      .int()
      .min(0)
      .max(5000)
      .default(100),
    maxLatencyCompensationMs: z
      .number()
      .int()
      .min(0)
      .max(MAX_LATENCY_COMPENSATION_MS)
      .default(150),
  })
  // A missing block back-fills the whole thing (enabled=false). `prefault`
  // pre-parses `{}` through this schema so every inner `.default(...)` applies;
  // a partial `lowLatencyMode` likewise fills only its missing sub-fields.
  .prefault({})

export const gameConfigValidator = z.object({
  // The existing manager-password gate. Passed through unchanged so the auth
  // check (managerPassword === "PASSWORD" by default) keeps working.
  managerPassword: z.string().default(DEFAULT_MANAGER_PASSWORD),
  teamMode: z.boolean().default(false),
  lowLatencyMode: lowLatencyModeValidator,
})

export type GameConfig = z.infer<typeof gameConfigValidator>

export type LowLatencyMode = z.infer<typeof lowLatencyModeValidator>
