/**
 * PixiJS Graphics primitives for the Flower Battle team-flower factory
 * (WP-PRESENTER-4, SDD §20.6).
 *
 * Each `drawX` is a pure function over an existing Graphics instance; it
 * `clear()`s and redraws, so callers can re-render in place without
 * re-instantiating the Pixi node tree. Splitting geometry off the factory
 * keeps it under the monolith guard while still letting the factory treat
 * each stage as an idempotent in-place update.
 *
 * No SVG / sprite dependency — pure primitives so the same factory works in
 * SSR snapshot tests without WebGL.
 *
 * Brand-tinted overlays (gold sparkles, cream umbrella shields) are passed
 * in as arguments from the factory so the geometry file never hardcodes a
 * hex literal. The face's "ink" (eye pupils, mouth strokes, X-eyes, shield
 * borders) uses neutral ink black/white — character-art ink, not a brand
 * color, mirroring the project's existing `gardenLayers.ts` shadow fill.
 */

import { Container, Graphics } from "pixi.js"

import type {
  ActivePlantEffect,
  PlantFace,
  TeamFlowerInstance,
} from "./teamFlowerFactory"

/**
 * Character-art ink. Pure black with low alpha is the project's standard
 * "shadow" treatment (see `gardenLayers.ts` sky gradient), and the face's
 * pupils / mouths / X-eyes are *illustration ink* — intentionally not a
 * brand color. If a future rev wants them themed we pipe through the
 * token resolver from the factory side.
 */
const FACE_INK = 0x111111
const FACE_PAPER = 0xffffff
/** Low-alpha shadow tint that reads as ground contact, never as a fill. */
const SOIL_SHADOW = 0x000000

/** Draw soil-shadow disk; sits at y=0 (ground line) and is centered on x=0. */
export function drawSoilShadow(graphics: Graphics, baseWidth: number): void {
  graphics.clear()
  const shadowW = baseWidth * 0.85
  const shadowH = shadowW * 0.32
  graphics.ellipse(0, 0, shadowW, shadowH)
  graphics.fill({ color: SOIL_SHADOW, alpha: 0.18 })
}

/** Draw the curved stem. Width scales with stage height factor. */
export function drawStem(
  graphics: Graphics,
  height: number,
  baseWidth: number,
  tint: number,
): void {
  graphics.clear()
  if (height <= 0) return
  const stemW = Math.max(4, baseWidth * 0.06)
  graphics.moveTo(-stemW / 2, 0)
  graphics.lineTo(-stemW / 2, -height + stemW)
  graphics.quadraticCurveTo(0, -height - stemW * 0.6, stemW / 2, -height + stemW)
  graphics.lineTo(stemW / 2, 0)
  graphics.fill({ color: tint })
}

/** Draw the leaves. Count is governed by stage; positions are deterministic. */
export function drawLeaves(
  graphics: Graphics,
  height: number,
  baseWidth: number,
  count: number,
  tint: number,
): void {
  graphics.clear()
  if (count <= 0 || height <= 0) return
  const leafW = Math.max(8, baseWidth * 0.32)
  const positions = [
    { ratio: 0.32, side: -1, scale: 0.7 },
    { ratio: 0.32, side: 1, scale: 0.7 },
    { ratio: 0.55, side: -1, scale: 0.85 },
    { ratio: 0.55, side: 1, scale: 0.85 },
  ]
  for (let i = 0; i < count; i += 1) {
    const def = positions[i]!
    const y = -height * def.ratio
    const x = def.side * baseWidth * 0.12
    const w = leafW * def.scale
    const h = w * 0.55
    graphics.ellipse(x + def.side * (w / 2), y, w, h)
    graphics.fill({ color: tint })
  }
}

/** Draw the head disk — circular silhouette tinted per team. */
export function drawHead(
  graphics: Graphics,
  radius: number,
  tint: number,
): void {
  graphics.clear()
  if (radius <= 0) return
  graphics.circle(0, 0, radius)
  graphics.fill({ color: tint })
}

/** Draw the petal ring inside the head (stage 3+). */
export function drawPetalRing(
  graphics: Graphics,
  headTopY: number,
  radius: number,
  tint: number,
  petalTint: number,
): void {
  graphics.clear()
  if (radius <= 0) return
  const petalCount = 8
  const innerRadius = radius * 0.45
  const angleStep = (Math.PI * 2) / petalCount
  for (let i = 0; i < petalCount; i += 1) {
    const angle = angleStep * i - Math.PI / 2
    const cx = Math.cos(angle) * innerRadius
    const cy = headTopY + Math.sin(angle) * innerRadius
    graphics.ellipse(cx, cy, radius * 0.32, radius * 0.18)
    graphics.fill({ color: petalTint, alpha: 0.85 })
  }
  graphics.ellipse(0, headTopY, radius * 0.92, radius * 0.45)
  graphics.fill({ color: tint, alpha: 0.5 })
}

/** Dispose all current children of a Container. */
function emptyContainer(container: Container): void {
  while (container.children.length > 0) {
    const child = container.children[0]
    container.removeChild(child)
    child.destroy()
  }
}

/** Draw eyes (white + pupil) on a face Graphics. */
function drawEyes(
  g: Graphics,
  eyeOffsetX: number,
  eyeY: number,
  eyeRadius: number,
  withPupils: boolean,
): void {
  g.circle(-eyeOffsetX, eyeY, eyeRadius)
  g.fill({ color: FACE_PAPER })
  g.circle(eyeOffsetX, eyeY, eyeRadius)
  g.fill({ color: FACE_PAPER })
  if (!withPupils) return
  g.circle(-eyeOffsetX, eyeY, eyeRadius * 0.55)
  g.fill({ color: FACE_INK })
  g.circle(eyeOffsetX, eyeY, eyeRadius * 0.55)
  g.fill({ color: FACE_INK })
}

/** Draw an X-shape over a single eye to indicate injury. */
function drawXEye(
  g: Graphics,
  eyeOffsetX: number,
  eyeY: number,
  eyeRadius: number,
  width: number,
): void {
  g.moveTo(-eyeOffsetX - eyeRadius, eyeY - eyeRadius)
  g.lineTo(-eyeOffsetX + eyeRadius, eyeY + eyeRadius)
  g.moveTo(-eyeOffsetX - eyeRadius, eyeY + eyeRadius)
  g.lineTo(-eyeOffsetX + eyeRadius, eyeY - eyeRadius)
  g.moveTo(eyeOffsetX - eyeRadius, eyeY - eyeRadius)
  g.lineTo(eyeOffsetX + eyeRadius, eyeY + eyeRadius)
  g.moveTo(eyeOffsetX - eyeRadius, eyeY + eyeRadius)
  g.lineTo(eyeOffsetX + eyeRadius, eyeY - eyeRadius)
  g.stroke({ color: FACE_INK, width })
}

/** Redraw the face layer — face is a separate sub-Container (no remount). */
export function drawFace(
  faceLayer: Container,
  face: PlantFace,
  headTopY: number,
  radius: number,
  tint: number,
  /** Theme-token tint for the winner crown / boost sparkle. */
  accentTint: number,
): void {
  emptyContainer(faceLayer)
  if (radius <= 0) return
  const g = new Graphics()
  g.label = `face-${face}`
  const eyeRadius = Math.max(2, radius * 0.06)
  const eyeOffsetX = radius * 0.22
  const eyeY = headTopY - radius * 0.05
  const strokeW = Math.max(1, radius * 0.05)
  const mouthY = headTopY + radius * 0.12
  const mouthW = radius * 0.28
  switch (face) {
    case "happy":
      drawEyes(g, eyeOffsetX, eyeY, eyeRadius, true)
      g.moveTo(-mouthW, mouthY)
      g.quadraticCurveTo(0, mouthY + mouthW * 0.55, mouthW, mouthY)
      g.stroke({ color: FACE_INK, width: strokeW })
      break
    case "winner":
      drawEyes(g, eyeOffsetX, eyeY, eyeRadius, true)
      g.moveTo(-mouthW, mouthY)
      g.quadraticCurveTo(0, mouthY + mouthW * 0.55, mouthW, mouthY)
      g.stroke({ color: FACE_INK, width: strokeW })
      g.ellipse(0, headTopY - radius, radius * 0.9, radius * 0.18)
      g.stroke({ color: accentTint, width: strokeW })
      break
    case "hurt":
      drawEyes(g, eyeOffsetX, eyeY, eyeRadius, true)
      drawXEye(g, eyeOffsetX, eyeY, eyeRadius, strokeW * 0.8)
      g.moveTo(-mouthW, mouthY + mouthW * 0.3)
      g.quadraticCurveTo(0, mouthY - mouthW * 0.2, mouthW, mouthY + mouthW * 0.3)
      g.stroke({ color: FACE_INK, width: strokeW })
      break
    case "protected":
      // Shield glyph centered on face — no eyes drawn so the shield is dominant.
      g.moveTo(-radius * 0.25, headTopY - radius * 0.18)
      g.lineTo(radius * 0.25, headTopY - radius * 0.18)
      g.lineTo(radius * 0.25, headTopY + radius * 0.18)
      g.quadraticCurveTo(
        0,
        headTopY + radius * 0.42,
        -radius * 0.25,
        headTopY + radius * 0.18,
      )
      g.lineTo(-radius * 0.25, headTopY - radius * 0.18)
      g.fill({ color: tint, alpha: 0.55 })
      g.stroke({ color: FACE_PAPER, width: strokeW * 0.8 })
      break
    case "boosted":
      // Sparkle burst (4 rays + center).
      for (let i = 0; i < 4; i += 1) {
        const ang = (Math.PI / 4) * i
        const x1 = Math.cos(ang) * radius * 0.18
        const y1 = headTopY + Math.sin(ang) * radius * 0.18
        g.moveTo(0, headTopY)
        g.lineTo(x1, y1)
      }
      g.stroke({ color: accentTint, width: strokeW * 1.2 })
      g.circle(0, headTopY, radius * 0.07)
      g.fill({ color: accentTint })
      break
  }
  faceLayer.addChild(g)
}

/** Render an effect halo (umbrella / fertilizer ring). */
export function drawHalo(
  haloLayer: Container,
  headTopY: number,
  radius: number,
  effects: readonly ActivePlantEffect[],
  /** Theme-token tints for cream-shield arc and gold fertilizer ring. */
  creamTint: number,
  accentTint: number,
): void {
  emptyContainer(haloLayer)
  if (radius <= 0 || effects.length === 0) return
  const g = new Graphics()
  g.label = "halo"
  if (effects.includes("umbrella_shield")) {
    g.moveTo(-radius, headTopY - radius)
    g.quadraticCurveTo(0, headTopY - radius * 1.8, radius, headTopY - radius)
    g.stroke({ color: creamTint, width: Math.max(1, radius * 0.08) })
  }
  if (effects.includes("fertilizer") || effects.includes("sunbeam")) {
    g.ellipse(0, headTopY, radius * 1.25, radius * 0.4)
    g.stroke({
      color: accentTint,
      width: Math.max(1, radius * 0.07),
      alpha: 0.55,
    })
  }
  haloLayer.addChild(g)
}

/** One-shot convenience: redraw every layer of an instance. */
export function redrawTeamFlower(
  instance: TeamFlowerInstance,
  args: {
    baseWidth: number
    stemHeight: number
    headTopY: number
    headRadius: number
    leafCount: number
    face: PlantFace
    effects: readonly ActivePlantEffect[]
    teamTint: number
    leafTint: number
    petalTint: number
    accentTint: number
    creamTint: number
  },
): void {
  drawSoilShadow(instance.soilShadow, args.baseWidth)
  drawStem(instance.stem, args.stemHeight, args.baseWidth, args.teamTint)
  drawLeaves(
    instance.leaves,
    args.stemHeight,
    args.baseWidth,
    args.leafCount,
    args.leafTint,
  )
  drawHead(instance.head, args.headRadius, args.teamTint)
  drawPetalRing(
    instance.petalRing,
    args.headTopY,
    args.headRadius,
    args.teamTint,
    args.petalTint,
  )
  drawFace(
    instance.faceLayer,
    args.face,
    args.headTopY,
    args.headRadius,
    args.teamTint,
    args.accentTint,
  )
  drawHalo(
    instance.haloLayer,
    args.headTopY,
    args.headRadius,
    args.effects,
    args.creamTint,
    args.accentTint,
  )
}
