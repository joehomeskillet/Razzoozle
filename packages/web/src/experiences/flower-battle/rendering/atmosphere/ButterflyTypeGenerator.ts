/**
 * Procedural butterfly type schema (FU-Q).
 *
 * Data-driven generator that defines 8 distinct butterfly species as a
 * freezeable config table. Each entry carries:
 *   - silhouette geometry: `drawWings(g, frame, config)` — bezier-based
 *     wing outlines + body ellipse + head + antennae. Two frames are
 *     baked per type (`up` = compressed X-scale, `down` = full X-scale)
 *     so the runtime pool swaps textures instead of redrawing Graphics
 *     each frame.
 *   - flight parameters: `flapFreqHz`, `speedMin/Max` — drive the
 *     per-slot Bezier-trajectory cadence.
 *   - color triple: `bodyColor`, `wingColor`, `accentColor` — passed
 *     to the renderer (`renderer.generateTexture`) and to the
 *     controller (slot tint fallback when no renderer).
 *
 * The 8 species names follow AGY's recommendation (Gemini 3.6 Flash):
 *   0. Tagfalter       — brush-footed, rounded wings
 *   1. Schwalbenschwanz — swallowtail with elongated tails
 *   2. Monarchfalter   — orange-vein monarch
 *   3. Tagpfauenauge   — peacock with prominent eye-spots
 *   4. Bläuling        — small blue copper
 *   5. Zitronenfalter  — pale yellow brimstone
 *   6. Hochzeit-Mantel — black-and-white mourning cloak
 *   7. Glasflügler     — clear-wing glasswing
 *
 * Geometry invariant: every drawWings implementation fits inside a
 * 36×28 logical-px canvas (matches the existing
 * `BUTTERFLY_TEXTURE_WIDTH × BUTTERFLY_TEXTURE_HEIGHT` of the FU-L/-
 * N/-O butterfly). The body ellipse sits at (18, 14), head at
 * (18, 8), antennae leave (18, 7) → (14, 1) and (22, 1).
 *
 * ponytail: a single small dispatch table is preferred over 8 fully
 * duplicated draw functions — the per-type variation lives in the
 * wing-curve control points, the body/head/antennae are shared.
 */

import type { Graphics } from "pixi.js"

import { BUTTERFLY_FLAP_FREQ_RANGE } from "./garden-atmosphere.constants"

export type ButterflyTypeId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export type ButterflyFrame = "up" | "down"

/**
 * Canvas size that every `drawWings` implementation draws into. Matches
 * the FU-O butterfly sprite target (36 logical px wide × 28 high so
 * the visible silhouette lands inside Plan §7.2's 24–44 px band).
 */
export const BUTTERFLY_TEXTURE_WIDTH = 36
export const BUTTERFLY_TEXTURE_HEIGHT = 28

export interface ButterflyTypeConfig {
  readonly id: ButterflyTypeId
  readonly name: string
  /** Visible silhouette width min/max (logical px). FU-Q feeds
   *  `flapFreqHz` into the controller's per-slot flap cadence. */
  readonly sizeMin: number
  readonly sizeMax: number
  /** Wing-flap frequency (Hz). Sampled once per type from
   *  `BUTTERFLY_FLAP_FREQ_RANGE`. */
  readonly flapFreqHz: number
  /** Travel speed band (px/s). The controller picks a fresh value
   *  in this band per Bezier segment for this slot. */
  readonly speedMin: number
  readonly speedMax: number
  /** Body / abdomen tint (mid-saturated, reads as the silhouette's
   *  centre line). */
  readonly bodyColor: number
  /** Dominant wing tint (covers most of the silhouette). */
  readonly wingColor: number
  /** Highlight tint (eye-spots, vein lines, lower wing band). */
  readonly accentColor: number
  /**
   * Draw the silhouette into `g` for the given `frame`. Reusable across
   * the renderer / Canvas2D-fallback paths — both pass a Graphics-shaped
   * (or Canvas-aliased) target here. `config` is passed in so the closure
   * avoids reading external state if a future tweak needs more per-type
   * data beyond what the static fields hold.
   */
  drawWings(
    g: Graphics,
    frame: ButterflyFrame,
    config: ButterflyTypeConfig,
  ): void
}

/* --------------------------------------------------------------------------
 * Shared body / head / antennae — every type draws the same anatomy.
 * ------------------------------------------------------------------------*/

/** Two thin antennae from the head upward-and-out. Drawn first so the
 *  body + wings overlap them cleanly. */
function drawAntennae(g: Graphics, tint: number): void {
  g.moveTo(18, 7).lineTo(14, 1)
  g.moveTo(18, 7).lineTo(22, 1)
  g.stroke({ color: tint, width: 0.8 })
}

/** Vertical body oval — the silhouette spine. */
function drawBody(g: Graphics, tint: number): void {
  g.ellipse(18, 14, 1.5, 7).fill(tint)
}

/** Small head dot above the body. */
function drawHead(g: Graphics, tint: number): void {
  g.circle(18, 8, 1.5).fill(tint)
}

/** Two tiny eye dots flanking the head. Same anatomy on every type. */
function drawEyes(g: Graphics): void {
  g.circle(17, 9, 0.6).fill(0x222222)
  g.circle(19, 9, 0.6).fill(0x222222)
}

function drawCommonAnatomy(
  g: Graphics,
  config: ButterflyTypeConfig,
): void {
  drawAntennae(g, config.bodyColor)
  drawBody(g, config.bodyColor)
  drawHead(g, config.bodyColor)
  drawEyes(g)
}

/* --------------------------------------------------------------------------
 * Per-type wing drawers. Each varies bezier control points to give a
 * distinct silhouette while reusing the common anatomy above.
 *
 * Convention: `sx` is the X-scale factor — `frame === "up"` compresses
 * it (folded-wing silhouette), `frame === "down"` keeps it full-spread.
 * ------------------------------------------------------------------------*/

function drawTagfalterWings(
  g: Graphics,
  frame: ButterflyFrame,
  config: ButterflyTypeConfig,
): void {
  const sx = frame === "up" ? 0.6 : 1.0
  const wing = config.wingColor
  const accent = config.accentColor
  // Upper-left wing (rounded brush-foot).
  g.moveTo(18, 14)
    .bezierCurveTo(8 * sx, 5, -3 * sx, 11, 4 * sx, 14)
    .bezierCurveTo(-3 * sx, 17, 8 * sx, 21, 18, 14)
    .fill(wing)
  // Upper-right wing (mirror).
  g.moveTo(18, 14)
    .bezierCurveTo(28 * sx, 5, 39 * sx, 11, 32 * sx, 14)
    .bezierCurveTo(39 * sx, 17, 28 * sx, 21, 18, 14)
    .fill(wing)
  // Lower wings (smaller droops).
  g.moveTo(18, 14)
    .bezierCurveTo(11, 18, 7, 24, 14, 25)
    .bezierCurveTo(17, 23, 18, 19, 18, 14)
    .fill(accent)
  g.moveTo(18, 14)
    .bezierCurveTo(25, 18, 29, 24, 22, 25)
    .bezierCurveTo(19, 23, 18, 19, 18, 14)
    .fill(accent)
  drawCommonAnatomy(g, config)
}

function drawSchwalbenschwanzWings(
  g: Graphics,
  frame: ButterflyFrame,
  config: ButterflyTypeConfig,
): void {
  const sx = frame === "up" ? 0.6 : 1.0
  const wing = config.wingColor
  const accent = config.accentColor
  // Distinctive elongated tails on the lower wings.
  g.moveTo(18, 14)
    .bezierCurveTo(6 * sx, 4, -6 * sx, 11, 2 * sx, 14)
    .bezierCurveTo(-3 * sx, 17, 9 * sx, 21, 18, 14)
    .fill(wing)
  g.moveTo(18, 14)
    .bezierCurveTo(30 * sx, 4, 42 * sx, 11, 34 * sx, 14)
    .bezierCurveTo(39 * sx, 17, 27 * sx, 21, 18, 14)
    .fill(wing)
  // Lower wings ending in pointed tails.
  g.moveTo(18, 14)
    .bezierCurveTo(11, 19, 7, 26, 13, 27)
    .bezierCurveTo(15, 25, 16, 20, 18, 14)
    .fill(accent)
  g.moveTo(18, 14)
    .bezierCurveTo(25, 19, 29, 26, 23, 27)
    .bezierCurveTo(21, 25, 20, 20, 18, 14)
    .fill(accent)
  drawCommonAnatomy(g, config)
}

function drawMonarchfalterWings(
  g: Graphics,
  frame: ButterflyFrame,
  config: ButterflyTypeConfig,
): void {
  const sx = frame === "up" ? 0.6 : 1.0
  const wing = config.wingColor
  const accent = config.accentColor
  // Classic monarch shape: rounded upper, veined lower.
  g.moveTo(18, 14)
    .bezierCurveTo(7 * sx, 4, -4 * sx, 12, 3 * sx, 14)
    .bezierCurveTo(-2 * sx, 16, 9 * sx, 22, 18, 14)
    .fill(wing)
  g.moveTo(18, 14)
    .bezierCurveTo(29 * sx, 4, 40 * sx, 12, 33 * sx, 14)
    .bezierCurveTo(38 * sx, 16, 27 * sx, 22, 18, 14)
    .fill(wing)
  // Monarch's trademark black vein band along the lower wing edges.
  g.moveTo(18, 14)
    .bezierCurveTo(10, 19, 7, 25, 13, 26)
    .bezierCurveTo(16, 24, 18, 19, 18, 14)
    .fill(accent)
  g.moveTo(18, 14)
    .bezierCurveTo(26, 19, 29, 25, 23, 26)
    .bezierCurveTo(20, 24, 18, 19, 18, 14)
    .fill(accent)
  drawCommonAnatomy(g, config)
}

function drawTagpfauenaugeWings(
  g: Graphics,
  frame: ButterflyFrame,
  config: ButterflyTypeConfig,
): void {
  const sx = frame === "up" ? 0.6 : 1.0
  const wing = config.wingColor
  const accent = config.accentColor
  // Broader upper wings — the peacock silhouette's signature.
  g.moveTo(18, 14)
    .bezierCurveTo(5 * sx, 3, -6 * sx, 10, 3 * sx, 13)
    .bezierCurveTo(-4 * sx, 16, 6 * sx, 21, 18, 14)
    .fill(wing)
  g.moveTo(18, 14)
    .bezierCurveTo(31 * sx, 3, 42 * sx, 10, 33 * sx, 13)
    .bezierCurveTo(40 * sx, 16, 30 * sx, 21, 18, 14)
    .fill(wing)
  // Large lower-wing eye-spots on the accent (yellow/black peacock eyes).
  g.moveTo(18, 14)
    .bezierCurveTo(12, 18, 7, 25, 14, 26)
    .bezierCurveTo(16, 25, 18, 19, 18, 14)
    .fill(accent)
  g.moveTo(18, 14)
    .bezierCurveTo(24, 18, 29, 25, 22, 26)
    .bezierCurveTo(20, 25, 18, 19, 18, 14)
    .fill(accent)
  // Eye-spot dots.
  g.circle(13, 23, 1.4).fill(0x111111)
  g.circle(23, 23, 1.4).fill(0x111111)
  g.circle(13, 23, 0.6).fill(0xffe066)
  g.circle(23, 23, 0.6).fill(0xffe066)
  drawCommonAnatomy(g, config)
}

function drawBlaeulingWings(
  g: Graphics,
  frame: ButterflyFrame,
  config: ButterflyTypeConfig,
): void {
  const sx = frame === "up" ? 0.6 : 1.0
  const wing = config.wingColor
  const accent = config.accentColor
  // Small copper: tighter silhouette, lower wings tuck under upper.
  g.moveTo(18, 14)
    .bezierCurveTo(10 * sx, 6, 2 * sx, 12, 7 * sx, 14)
    .bezierCurveTo(2 * sx, 16, 10 * sx, 20, 18, 14)
    .fill(wing)
  g.moveTo(18, 14)
    .bezierCurveTo(26 * sx, 6, 34 * sx, 12, 29 * sx, 14)
    .bezierCurveTo(34 * sx, 16, 26 * sx, 20, 18, 14)
    .fill(wing)
  g.moveTo(18, 14)
    .bezierCurveTo(13, 18, 10, 23, 15, 24)
    .bezierCurveTo(17, 22, 18, 18, 18, 14)
    .fill(accent)
  g.moveTo(18, 14)
    .bezierCurveTo(23, 18, 26, 23, 21, 24)
    .bezierCurveTo(19, 22, 18, 18, 18, 14)
    .fill(accent)
  drawCommonAnatomy(g, config)
}

function drawZitronenfalterWings(
  g: Graphics,
  frame: ButterflyFrame,
  config: ButterflyTypeConfig,
): void {
  const sx = frame === "up" ? 0.6 : 1.0
  const wing = config.wingColor
  const accent = config.accentColor
  // Brimstone: angular leaf-shape upper wings.
  g.moveTo(18, 14)
    .bezierCurveTo(9 * sx, 5, -2 * sx, 13, 6 * sx, 14)
    .bezierCurveTo(-1 * sx, 17, 9 * sx, 21, 18, 14)
    .fill(wing)
  g.moveTo(18, 14)
    .bezierCurveTo(27 * sx, 5, 38 * sx, 13, 30 * sx, 14)
    .bezierCurveTo(37 * sx, 17, 27 * sx, 21, 18, 14)
    .fill(wing)
  g.moveTo(18, 14)
    .bezierCurveTo(12, 18, 8, 24, 14, 25)
    .bezierCurveTo(16, 23, 18, 19, 18, 14)
    .fill(accent)
  g.moveTo(18, 14)
    .bezierCurveTo(24, 18, 28, 24, 22, 25)
    .bezierCurveTo(20, 23, 18, 19, 18, 14)
    .fill(accent)
  drawCommonAnatomy(g, config)
}

function drawHochzeitMantelWings(
  g: Graphics,
  frame: ButterflyFrame,
  config: ButterflyTypeConfig,
): void {
  const sx = frame === "up" ? 0.6 : 1.0
  const wing = config.wingColor
  const accent = config.accentColor
  // Mourning cloak: dark upper with bright cream-yellow border.
  g.moveTo(18, 14)
    .bezierCurveTo(7 * sx, 4, -4 * sx, 11, 3 * sx, 13)
    .bezierCurveTo(-3 * sx, 16, 8 * sx, 22, 18, 14)
    .fill(wing)
  g.moveTo(18, 14)
    .bezierCurveTo(29 * sx, 4, 40 * sx, 11, 33 * sx, 13)
    .bezierCurveTo(39 * sx, 16, 28 * sx, 22, 18, 14)
    .fill(wing)
  // Cream-yellow border band on lower wings.
  g.moveTo(18, 14)
    .bezierCurveTo(11, 18, 6, 25, 13, 26)
    .bezierCurveTo(16, 24, 18, 19, 18, 14)
    .fill(accent)
  g.moveTo(18, 14)
    .bezierCurveTo(25, 18, 30, 25, 23, 26)
    .bezierCurveTo(20, 24, 18, 19, 18, 14)
    .fill(accent)
  drawCommonAnatomy(g, config)
}

function drawGlasflueglerWings(
  g: Graphics,
  frame: ButterflyFrame,
  config: ButterflyTypeConfig,
): void {
  const sx = frame === "up" ? 0.6 : 1.0
  const wing = config.wingColor
  const accent = config.accentColor
  // Glasswing: large translucent upper wings with red-brown border.
  g.moveTo(18, 14)
    .bezierCurveTo(4 * sx, 3, -7 * sx, 9, 1 * sx, 13)
    .bezierCurveTo(-6 * sx, 15, 5 * sx, 21, 18, 14)
    .fill(wing)
  g.moveTo(18, 14)
    .bezierCurveTo(32 * sx, 3, 43 * sx, 9, 35 * sx, 13)
    .bezierCurveTo(42 * sx, 15, 31 * sx, 21, 18, 14)
    .fill(wing)
  // Red-brown frame around lower wings (the trademark glasswing rim).
  g.moveTo(18, 14)
    .bezierCurveTo(11, 19, 6, 26, 13, 27)
    .bezierCurveTo(16, 25, 18, 19, 18, 14)
    .fill(accent)
  g.moveTo(18, 14)
    .bezierCurveTo(25, 19, 30, 26, 23, 27)
    .bezierCurveTo(20, 25, 18, 19, 18, 14)
    .fill(accent)
  drawCommonAnatomy(g, config)
}

/* --------------------------------------------------------------------------
 * Type-config table. Flap frequencies are sampled from
 * BUTTERFLY_FLAP_FREQ_RANGE — kept locked to the Mulberry32 seed used
 * by the bake step so the per-slot flap cadence is deterministic. The
 * frequencies here are tuned by hand (heavier species flap slower)
 * rather than RNG-sampled so the visual mix stays coherent.
 * ------------------------------------------------------------------------*/

const TYPE_TABLE: readonly ButterflyTypeConfig[] = [
  {
    id: 0,
    name: "Tagfalter",
    sizeMin: 32,
    sizeMax: 40,
    flapFreqHz: 6.0,
    speedMin: 50,
    speedMax: 70,
    bodyColor: 0x222222,
    wingColor: 0xcc4444,
    accentColor: 0xf2c14e,
    drawWings: drawTagfalterWings,
  },
  {
    id: 1,
    name: "Schwalbenschwanz",
    sizeMin: 36,
    sizeMax: 44,
    flapFreqHz: 4.5,
    speedMin: 55,
    speedMax: 75,
    bodyColor: 0x2a2a2a,
    wingColor: 0xf2d24e,
    accentColor: 0x2a2a2a,
    drawWings: drawSchwalbenschwanzWings,
  },
  {
    id: 2,
    name: "Monarchfalter",
    sizeMin: 34,
    sizeMax: 42,
    flapFreqHz: 5.5,
    speedMin: 45,
    speedMax: 65,
    bodyColor: 0x111111,
    wingColor: 0xe7572a,
    accentColor: 0x111111,
    drawWings: drawMonarchfalterWings,
  },
  {
    id: 3,
    name: "Tagpfauenauge",
    sizeMin: 38,
    sizeMax: 44,
    flapFreqHz: 4.0,
    speedMin: 40,
    speedMax: 60,
    bodyColor: 0x111111,
    wingColor: 0x4a2a18,
    accentColor: 0xddb033,
    drawWings: drawTagpfauenaugeWings,
  },
  {
    id: 4,
    name: "Bläuling",
    sizeMin: 24,
    sizeMax: 32,
    flapFreqHz: 9.0,
    speedMin: 35,
    speedMax: 55,
    bodyColor: 0x1a1a1a,
    wingColor: 0x3a6dbf,
    accentColor: 0x6a8cc4,
    drawWings: drawBlaeulingWings,
  },
  {
    id: 5,
    name: "Zitronenfalter",
    sizeMin: 30,
    sizeMax: 38,
    flapFreqHz: 7.5,
    speedMin: 50,
    speedMax: 70,
    bodyColor: 0x2a4a18,
    wingColor: 0xf2e24e,
    accentColor: 0xe8c64a,
    drawWings: drawZitronenfalterWings,
  },
  {
    id: 6,
    name: "Hochzeit-Mantel",
    sizeMin: 36,
    sizeMax: 42,
    flapFreqHz: 5.0,
    speedMin: 50,
    speedMax: 70,
    bodyColor: 0x111111,
    wingColor: 0x222222,
    accentColor: 0xf2c14e,
    drawWings: drawHochzeitMantelWings,
  },
  {
    id: 7,
    name: "Glasflügler",
    sizeMin: 34,
    sizeMax: 40,
    flapFreqHz: 6.5,
    speedMin: 45,
    speedMax: 65,
    bodyColor: 0x111111,
    wingColor: 0xeaeaea,
    accentColor: 0x9a3a1a,
    drawWings: drawGlasflueglerWings,
  },
]

/**
 * The freezeable 8-entry type table. Exposed as `readonly` so callers
 * can't mutate the schema at runtime — bugs that try to do so fail at
 * the type system, not at the cache step.
 */
export const BUTTERFLY_TYPES: readonly ButterflyTypeConfig[] = TYPE_TABLE

/**
 * Mulberry32 deterministic flap-frequency shuffle. The schema above
 * carries static `flapFreqHz` per type, but a sibling constant here
 * (`BUTTERFLY_FLAP_FREQ_RANGE`) gives the original range the bake step
 * can re-sample from if a future iteration wants a stochastic pass.
 */
export const BUTTERFLY_FLAP_FREQ_RANGE_HZ: readonly [number, number] =
  BUTTERFLY_FLAP_FREQ_RANGE
