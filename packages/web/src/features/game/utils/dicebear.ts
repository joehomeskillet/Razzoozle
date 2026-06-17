import { createAvatar } from "@dicebear/core"
import {
  avataaars,
  botttsNeutral,
  funEmoji,
  thumbs,
} from "@dicebear/collection"

// DiceBear-backed avatar generation for the lobby picker. A small curated set
// of styles is exposed; each (style, seed) pair deterministically renders the
// same SVG, so a player can re-roll the seed until they like the result and the
// chosen data-URI is stored in Player.avatar (which already accepts any string).
//
// @dicebear/core v9 `.toDataUri()` is synchronous and returns a
// "data:image/svg+xml,…" string, so it can be used directly in render.
export const STYLES = {
  bottts: botttsNeutral,
  thumbs,
  fun: funEmoji,
  people: avataaars,
} as const

export type AvatarStyle = keyof typeof STYLES

export const AVATAR_STYLES = Object.keys(STYLES) as AvatarStyle[]

export function generateAvatar(style: AvatarStyle, seed: string): string {
  // Each collection style has its own incompatible Options generic; we only pass
  // the shared `seed` option, so widen to the createAvatar arg type via unknown.
  const collection = STYLES[style] as unknown as Parameters<typeof createAvatar>[0]
  return createAvatar(collection, { seed }).toDataUri()
}
