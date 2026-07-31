/**
 * Team plant view (WP-PIX-05A + WP-19 asset finisher).
 *
 * Stem + leaves stay lightweight Graphics (tintable, cheap redraw on growth).
 * Flower head prefers a preloaded SVG Texture (Sprite) so plants read as
 * large friendly cartoon blooms; Graphics petals remain the offline fallback.
 *
 * Growth stage 0..10 scales stem/head; view identity is stable across
 * updateSnapshot so ground anchors never recreate.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"

import type { GardenPalette } from "./gardenPalette"

const MAX_GROWTH = 10
const STEM_BASE = 48
const STEM_PER_STAGE = 22
const HEAD_BASE = 36
const HEAD_PER_STAGE = 6

export interface DummyPlantColors {
  stem: number
  leaf: number
  petal: number
}

export interface DummyPlantViewOptions {
  colors: DummyPlantColors
  label?: string
  /** Optional baked flower-head texture (Sprite path). */
  headTexture?: Texture
}

export class DummyPlantView {
  readonly root: Container
  private readonly stem: Graphics
  private readonly leafL: Graphics
  private readonly leafR: Graphics
  private readonly leafL2: Graphics
  private readonly leafR2: Graphics
  private readonly headGraphics: Graphics
  private headSprite: Sprite | null = null
  private growthStage = 0
  private colors: DummyPlantColors
  private headTexture: Texture | undefined

  constructor(
    colorsOrOptions: DummyPlantColors | DummyPlantViewOptions,
    label = "dummy-plant",
  ) {
    const isOptions =
      colorsOrOptions != null &&
      typeof colorsOrOptions === "object" &&
      "colors" in colorsOrOptions
    const options: DummyPlantViewOptions = isOptions
      ? (colorsOrOptions as DummyPlantViewOptions)
      : {
          colors: colorsOrOptions as DummyPlantColors,
          label,
        }

    this.colors = options.colors
    this.headTexture = options.headTexture
    this.root = new Container()
    this.root.label = options.label ?? label
    this.stem = new Graphics()
    this.leafL = new Graphics()
    this.leafR = new Graphics()
    this.leafL2 = new Graphics()
    this.leafR2 = new Graphics()
    this.headGraphics = new Graphics()
    this.root.addChild(
      this.stem,
      this.leafL,
      this.leafR,
      this.leafL2,
      this.leafR2,
      this.headGraphics,
    )

    if (this.headTexture && this.headTexture.width > 0) {
      this.headSprite = new Sprite(this.headTexture)
      this.headSprite.label = "plant-head-sprite"
      this.headSprite.anchor.set(0.5, 0.5)
      this.root.addChild(this.headSprite)
    }

    this.redraw()
  }

  getGrowthStage(): number {
    return this.growthStage
  }

  setColors(colors: DummyPlantColors): void {
    this.colors = colors
    this.redraw()
  }

  setHeadTexture(texture: Texture | undefined): void {
    if (texture === this.headTexture) return
    this.headTexture = texture
    if (this.headSprite) {
      this.root.removeChild(this.headSprite)
      this.headSprite.destroy()
      this.headSprite = null
    }
    if (texture && texture.width > 0) {
      this.headSprite = new Sprite(texture)
      this.headSprite.label = "plant-head-sprite"
      this.headSprite.anchor.set(0.5, 0.5)
      this.root.addChild(this.headSprite)
    }
    this.redraw()
  }

  setGrowthStage(stage: number): void {
    const next = Math.min(MAX_GROWTH, Math.max(0, Math.floor(stage)))
    if (next === this.growthStage) return
    this.growthStage = next
    this.redraw()
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }

  private redraw(): void {
    const t = this.growthStage / MAX_GROWTH
    const stemH = STEM_BASE + STEM_PER_STAGE * this.growthStage
    const headR = HEAD_BASE + HEAD_PER_STAGE * this.growthStage
    const leafSpan = 28 + 18 * t
    const stemW = 10 + 6 * t

    this.stem.clear()
    this.stem.roundRect(-stemW / 2, -stemH, stemW, stemH, stemW / 2)
    this.stem.fill({ color: this.colors.stem })

    this.leafL.clear()
    this.leafL.ellipse(-leafSpan, -stemH * 0.4, 28 + 10 * t, 14 + 5 * t)
    this.leafL.fill({ color: this.colors.leaf })

    this.leafR.clear()
    this.leafR.ellipse(leafSpan, -stemH * 0.5, 28 + 10 * t, 14 + 5 * t)
    this.leafR.fill({ color: this.colors.leaf })

    this.leafL2.clear()
    this.leafR2.clear()
    if (this.growthStage >= 4) {
      this.leafL2.ellipse(-leafSpan * 0.55, -stemH * 0.65, 20 + 6 * t, 10 + 3 * t)
      this.leafL2.fill({ color: this.colors.leaf, alpha: 0.9 })
      this.leafR2.ellipse(leafSpan * 0.55, -stemH * 0.72, 20 + 6 * t, 10 + 3 * t)
      this.leafR2.fill({ color: this.colors.leaf, alpha: 0.9 })
    }

    this.headGraphics.clear()
    if (this.headSprite) {
      this.headSprite.visible = this.growthStage > 0
      // Heads are large and friendly — diameter scales with growth, anchored
      // at the top of the stem so the blossom sits on the stalk.
      const diameter = Math.max(48, headR * 2.8)
      const tw = Math.max(1, this.headTexture?.width || 1)
      const th = Math.max(1, this.headTexture?.height || 1)
      // Uniform scale preserves face proportions. Colours are baked into the
      // SVG at load time — leave tint white so multi-colour faces stay visible.
      const s = diameter / Math.max(tw, th)
      this.headSprite.scale.set(s, s)
      this.headSprite.position.set(0, -stemH)
      this.headSprite.tint = 0xffffff
    } else if (this.growthStage > 0) {
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2
        const px = Math.cos(angle) * headR * 0.75
        const py = -stemH + Math.sin(angle) * headR * 0.75
        this.headGraphics.circle(px, py, headR * 0.42)
        this.headGraphics.fill({ color: this.colors.petal })
      }
      this.headGraphics.circle(0, -stemH, headR * 0.5)
      this.headGraphics.fill({ color: this.colors.stem })
      // Simple happy face so plants stay readable without SVG heads.
      this.headGraphics.circle(-headR * 0.18, -stemH - headR * 0.08, headR * 0.08)
      this.headGraphics.fill({ color: this.colors.stem })
      this.headGraphics.circle(headR * 0.18, -stemH - headR * 0.08, headR * 0.08)
      this.headGraphics.fill({ color: this.colors.stem })
    }
  }
}

export function defaultPlantColors(palette: GardenPalette): DummyPlantColors {
  return {
    stem: palette.plantStem,
    leaf: palette.plantLeaf,
    petal: palette.plantPetal,
  }
}

/** Cycle flower-head styles across team slots for visual distinction. */
export function plantHeadKeyForIndex(
  index: number,
): "round" | "bell" | "sun" | "tulip" {
  const keys = ["round", "bell", "sun", "tulip"] as const
  return keys[index % keys.length]!
}
