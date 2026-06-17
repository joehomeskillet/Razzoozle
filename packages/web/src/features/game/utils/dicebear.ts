// DiceBear-backed avatar generation for the lobby. A small curated set of styles
// is exposed; each (style, seed) pair deterministically renders the same SVG, so
// a player can re-roll the seed until they like the result and the chosen
// data-URI is stored in Player.avatar (which already accepts any string).
//
// PERF: @dicebear/core + @dicebear/collection are heavy (~1.29MB) and would land
// in the eager "vendor" rollup chunk if imported statically. They are therefore
// loaded ONLY via dynamic import inside generateAvatar(), so Rollup splits them
// into an on-demand chunk that is fetched the first time avatar generation runs
// (when the join/avatar UI mounts) — never at initial app load. The style names
// and AvatarStyle type stay synchronously available without loading the libs.

export const AVATAR_STYLES = ["bottts", "thumbs", "fun", "people"] as const

export type AvatarStyle = (typeof AVATAR_STYLES)[number]

// Resolved once and reused: importing the dicebear libs fetches the split chunk
// at most once, after which the memoized promise short-circuits.
type DiceBearModules = {
  createAvatar: typeof import("@dicebear/core").createAvatar
  collections: Record<AvatarStyle, unknown>
}

let modulesPromise: Promise<DiceBearModules> | undefined

const loadModules = (): Promise<DiceBearModules> => {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("@dicebear/core"),
      import("@dicebear/collection"),
    ]).then(([core, collection]) => ({
      createAvatar: core.createAvatar,
      collections: {
        bottts: collection.botttsNeutral,
        thumbs: collection.thumbs,
        fun: collection.funEmoji,
        people: collection.avataaars,
      } as Record<AvatarStyle, unknown>,
    }))
  }

  return modulesPromise
}

export async function generateAvatar(
  style: AvatarStyle,
  seed: string,
): Promise<string> {
  const { createAvatar, collections } = await loadModules()
  // Each collection style has its own incompatible Options generic; we only pass
  // the shared `seed` option, so widen to the createAvatar arg type via unknown.
  const collection = collections[style] as Parameters<typeof createAvatar>[0]

  return createAvatar(collection, { seed }).toDataUri()
}
