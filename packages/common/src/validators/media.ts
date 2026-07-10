import { z } from "zod"
import { MEDIA_CATEGORIES, PROMPT_MAX_LEN } from "@razzoozle/common/constants"

// Upload guard (server input + client pre-submit). dataUrl must be a base64
// data URL for an image or audio asset; the server re-encodes/validates bytes.
export const mediaUploadValidator = z.object({
  filename: z.string().min(1).max(200),
  dataUrl: z
    .string()
    .regex(/^data:(?:image|audio)\//, "errors:media.invalidDataUrl"),
  category: z.enum(MEDIA_CATEGORIES).optional(),
})

export const mediaDeleteValidator = z.object({
  id: z.string().min(1),
})

// ── #23 media pipeline validators (public /submit) ──────────────────────────

// img2img edit. baseUrl must be a same-origin RELATIVE /media/ path only (the
// server resolves it to bytes via a disk read, NOT a network fetch — anti-SSRF;
// absolute/external URLs are rejected by the regex).
export const editImageValidator = z.object({
  baseUrl: z
    .string()
    .min(1)
    .max(300)
    .regex(/^\/media\//, "errors:media.invalidUrl"),
  prompt: z.string().min(1).max(PROMPT_MAX_LEN),
})

// Public image upload (image-only, NO audio, NO category — the manager library
// stays auth-gated). The byte cap is enforced in the handler, not here.
export const publicUploadValidator = z.object({
  filename: z.string().min(1).max(200),
  dataUrl: z.string().regex(/^data:image\//, "errors:media.invalidDataUrl"),
})

// Standalone prompt-enhance preview (LLM op, no GPU).
export const enhancePromptValidator = z.object({
  prompt: z.string().min(1).max(PROMPT_MAX_LEN),
})
