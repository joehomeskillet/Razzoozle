import { z } from "zod"
import { AVATAR_MAX_BYTES } from "@razzoozle/common/constants"

// Accepts either a DiceBear-generated SVG data-URI (e.g.
// "data:image/svg+xml;utf8,…") or a base64 raster data-URL for an uploaded
// image. Upper bound roughly covers a base64-encoded AVATAR_MAX_BYTES image;
// the server enforces the real byte cap.
export const setAvatarValidator = z.object({
  avatar: z
    .string()
    .min(1)
    .max(Math.ceil(AVATAR_MAX_BYTES * 1.4)),
})

export type SetAvatarInput = z.infer<typeof setAvatarValidator>
