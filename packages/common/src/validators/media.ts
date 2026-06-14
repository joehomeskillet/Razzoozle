import { z } from "zod"
import { MEDIA_CATEGORIES } from "@razzia/common/constants"

// Upload guard (server input + client pre-submit). dataUrl must be a base64
// data URL for an image or audio asset; the server re-encodes/validates bytes.
export const mediaUploadValidator = z.object({
  filename: z.string().min(1).max(200),
  dataUrl: z
    .string()
    .regex(/^data:(?:image|audio)\//, "errors:media.invalidDataUrl"),
  category: z.enum(MEDIA_CATEGORIES).optional(),
})

export type MediaUploadInput = z.infer<typeof mediaUploadValidator>

export const mediaDeleteValidator = z.object({
  id: z.string().min(1),
})

export type MediaDeleteInput = z.infer<typeof mediaDeleteValidator>
