import { z } from "zod"
import { AVATAR_MAX_BYTES } from "@razzoozle/common/constants"

// Accepts either a generic avatar id/URL (e.g. "/media/avatars/generic/generic-1.webp")
// or a base64 data URL for an uploaded image. Upper bound roughly covers a
// base64-encoded AVATAR_MAX_BYTES image; the server enforces the real byte cap.
export const setAvatarValidator = z.object({
  avatar: z
    .string()
    .min(1)
    .max(Math.ceil(AVATAR_MAX_BYTES * 1.4)),
})

export type SetAvatarInput = z.infer<typeof setAvatarValidator>
