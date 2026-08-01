/**
 * Team plant view (WP-PIX-05A + WP-19 asset finisher).
 *
 * Stem + leaves stay lightweight Graphics (tintable, cheap redraw on growth).
 * Flower head prefers a preloaded SVG Texture (Sprite) so plants read as
 * large friendly cartoon blooms; Graphics petals remain the offline fallback.
 * Optional faceTexture overlays a smile/emote on the tinted head without
 * inheriting the team petal tint (face ink stays readable).
 *
 * Growth stage 0..10 scales stem/head; view identity is stable across
 * updateSnapshot so ground anchors never recreate.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"

import type { GardenPalette } from "./gardenPalette"

const MAX_GROWTH = 10
const STEM_BASE = 56
const STEM_PER_STAGE = 26
const HEAD_BASE = 42
const HEAD_PER_STAGE = 7
/** Face sits in the head disk — fraction of head diameter. */
const FACE_DIAMETER_RATIO = 0.48
const FACE_UNTINTED = 0xffffff

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
  /**
   * Optional face/emote texture overlaid on the head Sprite.
   * Not tinted with team color so the smile stays readable on any petal tint.
   * Ignored when headTexture is missing (Graphics fallback draws its own face).
   */
  faceTexture?: Texture
}

function isUsableTexture(texture: Texture | undefined): texture is Texture {
  return texture != null && texture.width > 0
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
  private faceSprite: Sprite | null = null
  private growthStage = 0
  private colors: DummyPlantColors
  private headTexture: Texture | undefined
  private faceTexture: Texture | undefined

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
    this.faceTexture = options.faceTexture
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

    this.ensureHeadSprite()
    this.ensureFaceSprite()
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
    this.disposeHeadSprite()
    this.ensureHeadSprite()
    // Face sits above the head — re-attach so z-order stays correct.
    this.disposeFaceSprite()
    this.ensureFaceSprite()
    this.redraw()
  }

  setFaceTexture(texture: Texture | undefined): void {
    if (texture === this.faceTexture) return
    this.faceTexture = texture
    this.disposeFaceSprite()
    this.ensureFaceSprite()
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

  private disposeHeadSprite(): void {
    if (!this.headSprite) return
    this.root.removeChild(this.headSprite)
    this.headSprite.destroy()
    this.headSprite = null
  }

  private disposeFaceSprite(): void {
    if (!this.faceSprite) return
    this.root.removeChild(this.faceSprite)
    this.faceSprite.destroy()
    this.faceSprite = null
  }

  private ensureHeadSprite(): void {
    if (!isUsableTexture(this.headTexture)) return
    this.headSprite = new Sprite(this.headTexture)
    this.headSprite.label = "plant-head-sprite"
    this.headSprite.anchor.set(0.5, 0.5)
    this.root.addChild(this.headSprite)
  }

  private ensureFaceSprite(): void {
    // Face overlay only on the texture-head path — Graphics fallback has its own face.
    if (!this.headSprite || !isUsableTexture(this.faceTexture)) return
    this.faceSprite = new Sprite(this.faceTexture)
    this.faceSprite.label = "plant-face-sprite"
    this.faceSprite.anchor.set(0.5, 0.5)
    // Keep face ink readable: never multiply by team petal color.
    this.faceSprite.tint = FACE_UNTINTED
    this.root.addChild(this.faceSprite)
  }

  private redraw(): void {
    const t = this.growthStage / MAX_GROWTH
    const stemH = STEM_BASE + STEM_PER_STAGE * this.growthStage
    const headR = HEAD_BASE + HEAD_PER_STAGE * this.growthStage
    const leafSpan = 28 + 18 * t
    const stemW = 10 + 6 * t

    // Soft contact shadow on the soil so plants sit in the bed.
    this.stem.clear()
    this.stem.ellipse(0, 8, 34 + 10 * t, 12 + 3 * t)
    this.stem.fill({ color: this.colors.stem, alpha: 0.18 })
    // Stem body — rounded stalk.
    this.stem.roundRect(-stemW / 2, -stemH, stemW, stemH, stemW / 2)
    this.stem.fill({ color: this.colors.stem })
    // Soft highlight for a friendlier, less flat stalk.
    this.stem.roundRect(
      -stemW * 0.18,
      -stemH + 6,
      stemW * 0.32,
      Math.max(8, stemH - 14),
      stemW / 4,
    )
    this.stem.fill({ color: 0xffffff, alpha: 0.14 })

    // Leaves: primary pair + soft tip highlight for readability at distance.
    this.leafL.clear()
    this.leafL.ellipse(-leafSpan, -stemH * 0.4, 28 + 10 * t, 14 + 5 * t)
    this.leafL.fill({ color: this.colors.leaf })
    this.leafL.ellipse(-leafSpan - 4, -stemH * 0.4, 10 + 4 * t, 5 + 2 * t)
    this.leafL.fill({ color: 0xffffff, alpha: 0.12 })

    this.leafR.clear()
    this.leafR.ellipse(leafSpan, -stemH * 0.5, 28 + 10 * t, 14 + 5 * t)
    this.leafR.fill({ color: this.colors.leaf })
    this.leafR.ellipse(leafSpan + 4, -stemH * 0.5, 10 + 4 * t, 5 + 2 * t)
    this.leafR.fill({ color: 0xffffff, alpha: 0.12 })

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
      const showHead = this.growthStage > 0
      this.headSprite.visible = showHead
      // Heads are large and friendly — diameter scales with growth, anchored
      // at the top of the stem so the blossom sits on the stalk.
      const diameter = Math.max(48, headR * 2.8)
      const tw = Math.max(1, this.headTexture?.width || 1)
      const th = Math.max(1, this.headTexture?.height || 1)
      // Uniform scale. Petals are white-baked so team tint multiplies cleanly.
      const s = diameter / Math.max(tw, th)
      this.headSprite.scale.set(s, s)
      this.headSprite.position.set(0, -stemH)
      this.headSprite.tint = this.colors.petal

      if (this.faceSprite) {
        this.faceSprite.visible = showHead
        const faceDiameter = diameter * FACE_DIAMETER_RATIO
        const fw = Math.max(1, this.faceTexture?.width || 1)
        const fh = Math.max(1, this.faceTexture?.height || 1)
        const fs = faceDiameter / Math.max(fw, fh)
        this.faceSprite.scale.set(fs, fs)
        // Slightly above head center so eyes/smile sit in the bloom face area.
        this.faceSprite.position.set(0, -stemH - diameter * 0.02)
        this.faceSprite.tint = FACE_UNTINTED
      }
    } else if (this.growthStage > 0) {
      // Offline / missing-asset fallback: simple daisy + ink face.
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

    if (this.faceSprite && !this.headSprite) {
      this.faceSprite.visible = false
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
