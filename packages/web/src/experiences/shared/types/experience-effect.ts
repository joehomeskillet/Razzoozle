import type { RefObject } from "react"

/**
 * Semantic theme color roles for effect descriptors.
 *
 * Descriptors reference roles only — never raw hex values. Renderers resolve
 * roles to CSS custom properties via the theme token system (e.g.
 * `getThemeTokenCssVar('--color-primary')` for `"primary"`).
 */
export type ExperienceEffectColorRole =
  | "primary"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "neutral"
  | "correct"
  | "wrong"
  | "info"
  | "muted"

/**
 * Central catalog of all effect preset identifiers.
 *
 * Concrete preset entries are added in WP-KIT-11. Call sites and the
 * EffectRegistry use these string IDs for registration and resolution.
 */
export const ExperienceEffectPresetId = {
  // Populated by WP-KIT-11 — no concrete presets in WP-912.
} as const

/**
 * Union of all known preset ID string literals.
 *
 * Extends to arbitrary `string` so externally registered presets remain valid
 * until the catalog is updated in WP-KIT-11.
 */
export type ExperienceEffectPresetId = string

/**
 * Normalized anchor — coordinates in [0, 1] relative to the stage viewbox
 * (ExperienceViewportProps container).
 *
 * Values outside [0, 1] are clamped at resolution time (see effect-anchor.ts).
 */
export interface ExperienceEffectNormalizedAnchor {
  type: "normalized"
  /** Horizontal position in [0, 1] across the stage viewbox. */
  x: number
  /** Vertical position in [0, 1] across the stage viewbox. */
  y: number
}

/**
 * SVG-element anchor — resolved via SVGGraphicsElement.getBBox() in SVG user space.
 */
export interface ExperienceEffectSvgElementAnchor {
  type: "svg-element"
  /** Live SVG element or a ref whose current holds the element. */
  element?: SVGGraphicsElement | null
  ref?: RefObject<SVGGraphicsElement | null>
}

/**
 * DOM-element anchor — resolved via HTMLElement.getBoundingClientRect() in
 * viewport (client) coordinates.
 */
export interface ExperienceEffectDomRefAnchor {
  type: "dom-ref"
  /** Live DOM element or a ref whose current holds the element. */
  element?: HTMLElement | null
  ref?: RefObject<HTMLElement | null>
}

/**
 * Discriminated union of all supported effect anchor types.
 *
 * Resolution is pure geometry — no rendering. See resolveEffectAnchorToPixels.
 */
export type ExperienceEffectAnchor =
  | ExperienceEffectNormalizedAnchor
  | ExperienceEffectSvgElementAnchor
  | ExperienceEffectDomRefAnchor

/**
 * Declarative descriptor for a visual-only experience effect.
 *
 * @remarks
 * **Seed usage** — seed feeds createSeededRandom for deterministic
 * visual variation (particle spread, hue jitter, etc.). Same seed always
 * produces the same sequence. Must never influence game outcomes, scoring, or
 * loot selection (see SDD §16 / createSeededRandom forbidden-use list).
 *
 * **Theme integration** — colorRoles lists semantic ExperienceEffectColorRole
 * values only. Hex resolution happens at render time through theme tokens, never
 * in the descriptor payload.
 */
export interface ExperienceEffectDescriptor {
  /** Deterministic seed — number or string, compatible with createSeededRandom. */
  seed: number | string
  /** Optional anchor for effect origin. Defaults to stage center when omitted. */
  anchor?: ExperienceEffectAnchor
  /** Theme-token color roles (no hex literals). */
  colorRoles?: ExperienceEffectColorRole[]
  /** Preset identifier — must match a handler registered in EffectRegistry. */
  presetId?: ExperienceEffectPresetId
}
