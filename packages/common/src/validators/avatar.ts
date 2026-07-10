import { z } from "zod"

// Player avatar (in-game profile pic). Ephemeral = ~4 MB limit. Persistent =
// SVG data-URI or external CDN URL; the latter (game state) survives across runs.
export const avatarValidator = z
  .object({
    // Ephemeral (one session): data-URI. E.g., DiceBear generated avatar.
    dataUrl: z.string().min(1).optional(),
    // Persistent (stored): SVG data-URI or public http(s) URL (mirrors quizz
    // subject/title rules — no localhost, file://, gopher://, etc.). Either way,
    // the client shows `<img src={url}>`; data-URIs render safely + carry the SVG
    // inline, public URLs are fetched on render.
    url: z.string().min(1).optional(),
  })
  .refine(
    (v) => v.dataUrl || v.url,
    "Either dataUrl or url must be provided",
  )

export type Avatar = z.infer<typeof avatarValidator>
