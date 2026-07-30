import type { CssTokenName } from "@razzoozle/common/theme-tokens"

/**
 * Theme color token roles for effect rendering.
 * Handlers resolve these to concrete colors via `getThemeTokenCssVar()` — never raw hex.
 */
export type ExperienceEffectColorRole = CssTokenName

/**
 * Visual-only effect payload passed to registered handlers.
 *
 * The `seed` field drives deterministic visuals via {@link createSeededRandom}
 * (same seed → identical particle paths, hues, timing). Must not influence game
 * outcomes, scoring, or loot — server/Rust owns that domain.
 *
 * @see {@link ../random/createSeededRandom}
 */
export interface ExperienceEffectDescriptor {
  /** Deterministic seed for visual-only PRNG (number or string). */
  seed: number | string
  /** Semantic theme token roles — no hex literals. */
  colorRoles: ExperienceEffectColorRole[]
}

/**
 * Discriminated union describing where an effect should originate.
 *
 * - `normalized` — 0–1 coordinates relative to the experience viewport
 * - `svg-element` — center of an SVG graphics element's bounding box (user units)
 * - `dom-ref` — center of an HTMLElement's layout box (viewport pixels)
 */
export type ExperienceEffectAnchor =
  | {
      kind: "normalized"
      x: number
      y: number
    }
  | {
      kind: "svg-element"
      element: SVGGraphicsElement
    }
  | {
      kind: "dom-ref"
      element: HTMLElement | null
    }

/** Known effect preset identifiers registered in the effect registry. */
export const ExperienceEffectPresetId = {
  ConfettiBurst: "confetti-burst",
  ParticleTrail: "particle-trail",
  ScreenFlash: "screen-flash",
} as const

export type ExperienceEffectPresetId =
  (typeof ExperienceEffectPresetId)[keyof typeof ExperienceEffectPresetId]
