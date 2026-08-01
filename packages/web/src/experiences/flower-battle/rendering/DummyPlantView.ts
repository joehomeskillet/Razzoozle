/**
 * Team plant view — asset-built flower (stem / leaf / pot / head sprites).
 *
 * Production path: preloaded SVG textures (Vite URLs → baked → Pixi Texture).
 * Graphics remain only as true offline / missing-asset fallback.
 *
 * Growth stage 0..10 scales stem height + head size; view identity is stable
 * across updateSnapshot so ground anchors never recreate.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"

import type { GardenPalette } from "./gardenPalette"

const MAX_GROWTH = 10
const STEM_BASE = 56
const STEM_PER_STAGE = 26
const HEAD_BASE = 42
const HEAD_PER_STAGE = 7
/** Face sits in the head disk — fraction of head diameter (optional overlay). */
const FACE_DIAMETER_RATIO = 0.48
const FACE_UNTINTED = 0xffffff

export interface DummyPlantColors {
  stem: number
  leaf: number
  petal: number
  /** Planter / pot body tint (defaults to stem when omitted). */
  pot?: number
}

export interface DummyPlantViewOptions {
  colors: DummyPlantColors
  label?: string
  /** Flower-head texture (round / bell / sun / tulip). */
  headTexture?: Texture
  /**
   * Optional face/emote overlay. Heads already bake eyes/smile — prefer none
   * in production. Not team-tinted.
   */
  faceTexture?: Texture
  /** Vertical stem sprite (foot at bottom). */
  stemTexture?: Texture
  /** Leaf blade sprite (points right; flipped for left leaves). */
  leafTexture?: Texture
  /** Pot / planter under the plant. */
  potTexture?: Texture
}

function isUsableTexture(texture: Texture | undefined): texture is Texture {
  return texture != null && texture.width > 0
}

export class DummyPlantView {
  readonly root: Container
  /** Graphics fallbacks (used only when matching texture is missing). */
  private readonly stemGfx: Graphics
  private readonly leafLGfx: Graphics
  private readonly leafRGfx: Graphics
  private readonly leafL2Gfx: Graphics
  private readonly leafR2Gfx: Graphics
  private readonly headGraphics: Graphics
  private headSprite: Sprite | null = null
  private faceSprite: Sprite | null = null
  private stemSprite: Sprite | null = null
  private leafLSprite: Sprite | null = null
  private leafRSprite: Sprite | null = null
  private leafL2Sprite: Sprite | null = null
  private leafR2Sprite: Sprite | null = null
  private potSprite: Sprite | null = null
  private growthStage = 0
  private colors: DummyPlantColors
  private headTexture: Texture | undefined
  private faceTexture: Texture | undefined
  private stemTexture: Texture | undefined
  private leafTexture: Texture | undefined
  private potTexture: Texture | undefined

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
    this.stemTexture = options.stemTexture
    this.leafTexture = options.leafTexture
    this.potTexture = options.potTexture
    this.root = new Container()
    this.root.label = options.label ?? label

    this.stemGfx = new Graphics()
    this.stemGfx.label = "plant-stem-graphics"
    this.leafLGfx = new Graphics()
    this.leafLGfx.label = "plant-leaf-l-graphics"
    this.leafRGfx = new Graphics()
    this.leafRGfx.label = "plant-leaf-r-graphics"
    this.leafL2Gfx = new Graphics()
    this.leafL2Gfx.label = "plant-leaf-l2-graphics"
    this.leafR2Gfx = new Graphics()
    this.leafR2Gfx.label = "plant-leaf-r2-graphics"
    this.headGraphics = new Graphics()
    this.headGraphics.label = "plant-head-graphics"

    // z-order: pot → stem → leaves → head → face
    this.root.addChild(
      this.stemGfx,
      this.leafLGfx,
      this.leafRGfx,
      this.leafL2Gfx,
      this.leafR2Gfx,
      this.headGraphics,
    )

    this.ensurePotSprite()
    this.ensureStemSprite()
    this.ensureLeafSprites()
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

  setStemTexture(texture: Texture | undefined): void {
    if (texture === this.stemTexture) return
    this.stemTexture = texture
    this.disposeStemSprite()
    this.ensureStemSprite()
    this.redraw()
  }

  setLeafTexture(texture: Texture | undefined): void {
    if (texture === this.leafTexture) return
    this.leafTexture = texture
    this.disposeLeafSprites()
    this.ensureLeafSprites()
    this.redraw()
  }

  setPotTexture(texture: Texture | undefined): void {
    if (texture === this.potTexture) return
    this.potTexture = texture
    this.disposePotSprite()
    this.ensurePotSprite()
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

  private disposeSprite(sprite: Sprite | null): void {
    if (!sprite) return
    if (sprite.parent) sprite.parent.removeChild(sprite)
    sprite.destroy()
  }

  private disposeHeadSprite(): void {
    this.disposeSprite(this.headSprite)
    this.headSprite = null
  }

  private disposeFaceSprite(): void {
    this.disposeSprite(this.faceSprite)
    this.faceSprite = null
  }

  private disposeStemSprite(): void {
    this.disposeSprite(this.stemSprite)
    this.stemSprite = null
  }

  private disposeLeafSprites(): void {
    this.disposeSprite(this.leafLSprite)
    this.disposeSprite(this.leafRSprite)
    this.disposeSprite(this.leafL2Sprite)
    this.disposeSprite(this.leafR2Sprite)
    this.leafLSprite = null
    this.leafRSprite = null
    this.leafL2Sprite = null
    this.leafR2Sprite = null
  }

  private disposePotSprite(): void {
    this.disposeSprite(this.potSprite)
    this.potSprite = null
  }

  private ensurePotSprite(): void {
    if (!isUsableTexture(this.potTexture)) return
    this.potSprite = new Sprite(this.potTexture)
    this.potSprite.label = "plant-pot-sprite"
    this.potSprite.anchor.set(0.5, 1)
    // Under stem
    this.root.addChildAt(this.potSprite, 0)
  }

  private ensureStemSprite(): void {
    if (!isUsableTexture(this.stemTexture)) return
    this.stemSprite = new Sprite(this.stemTexture)
    this.stemSprite.label = "plant-stem-sprite"
    this.stemSprite.anchor.set(0.5, 1)
    // After pot (index 0 or 1)
    const insertAt = this.potSprite ? 1 : 0
    this.root.addChildAt(this.stemSprite, insertAt)
  }

  private ensureLeafSprites(): void {
    if (!isUsableTexture(this.leafTexture)) return
    const make = (label: string, flip: boolean): Sprite => {
      const spr = new Sprite(this.leafTexture!)
      spr.label = label
      spr.anchor.set(0.05, 0.55)
      if (flip) spr.scale.x = -1
      this.root.addChild(spr)
      return spr
    }
    this.leafLSprite = make("plant-leaf-l-sprite", true)
    this.leafRSprite = make("plant-leaf-r-sprite", false)
    this.leafL2Sprite = make("plant-leaf-l2-sprite", true)
    this.leafR2Sprite = make("plant-leaf-r2-sprite", false)
  }

  private ensureHeadSprite(): void {
    if (!isUsableTexture(this.headTexture)) return
    this.headSprite = new Sprite(this.headTexture)
    this.headSprite.label = "plant-head-sprite"
    this.headSprite.anchor.set(0.5, 0.5)
    this.root.addChild(this.headSprite)
  }

  private ensureFaceSprite(): void {
    if (!this.headSprite || !isUsableTexture(this.faceTexture)) return
    this.faceSprite = new Sprite(this.faceTexture)
    this.faceSprite.label = "plant-face-sprite"
    this.faceSprite.anchor.set(0.5, 0.5)
    this.faceSprite.tint = FACE_UNTINTED
    this.root.addChild(this.faceSprite)
  }

  private redraw(): void {
    const t = this.growthStage / MAX_GROWTH
    const stemH = STEM_BASE + STEM_PER_STAGE * this.growthStage
    const headR = HEAD_BASE + HEAD_PER_STAGE * this.growthStage
    const leafSpan = 28 + 18 * t
    const stemW = 10 + 6 * t
    const useStemAsset = this.stemSprite != null
    const useLeafAsset = this.leafLSprite != null
    const usePotAsset = this.potSprite != null

    // ── Pot ────────────────────────────────────────────────────────────
    if (this.potSprite) {
      this.potSprite.visible = true
      const targetW = 110 + 20 * t
      const tw = Math.max(1, this.potTexture!.width)
      const s = targetW / tw
      this.potSprite.scale.set(s, s)
      this.potSprite.position.set(0, 14)
      this.potSprite.tint = this.colors.pot ?? this.colors.stem
    }

    // ── Stem ───────────────────────────────────────────────────────────
    this.stemGfx.clear()
    if (this.stemSprite) {
      this.stemSprite.visible = true
      const th = Math.max(1, this.stemTexture!.height)
      const tw = Math.max(1, this.stemTexture!.width)
      // Fit height to stemH; keep aspect
      const sy = stemH / th
      const sx = Math.min(sy * 1.15, (stemW * 2.4) / tw)
      this.stemSprite.scale.set(sx, sy)
      this.stemSprite.position.set(0, 0)
      this.stemSprite.tint = this.colors.stem
    } else {
      // Graphics fallback
      this.stemGfx.ellipse(0, 8, 34 + 10 * t, 12 + 3 * t)
      this.stemGfx.fill({ color: this.colors.stem, alpha: 0.18 })
      this.stemGfx.roundRect(-stemW / 2, -stemH, stemW, stemH, stemW / 2)
      this.stemGfx.fill({ color: this.colors.stem })
      this.stemGfx.roundRect(
        -stemW * 0.18,
        -stemH + 6,
        stemW * 0.32,
        Math.max(8, stemH - 14),
        stemW / 4,
      )
      this.stemGfx.fill({ color: FACE_UNTINTED, alpha: 0.14 })
    }

    // ── Leaves ─────────────────────────────────────────────────────────
    this.leafLGfx.clear()
    this.leafRGfx.clear()
    this.leafL2Gfx.clear()
    this.leafR2Gfx.clear()

    const placeLeaf = (
      spr: Sprite | null,
      gfx: Graphics,
      x: number,
      y: number,
      flip: boolean,
      scaleMul: number,
      visible: boolean,
    ): void => {
      if (spr && useLeafAsset) {
        spr.visible = visible
        if (!visible) return
        const lw = Math.max(1, this.leafTexture!.width)
        const targetW = (48 + 22 * t) * scaleMul
        const s = targetW / lw
        spr.scale.set(flip ? -s : s, s)
        spr.position.set(x, y)
        spr.rotation = flip ? -0.25 : 0.2
        spr.tint = this.colors.leaf
        return
      }
      if (!visible) return
      gfx.ellipse(x, y, (28 + 10 * t) * scaleMul, (14 + 5 * t) * scaleMul)
      gfx.fill({ color: this.colors.leaf, alpha: scaleMul >= 1 ? 1 : 0.9 })
    }

    placeLeaf(
      this.leafLSprite,
      this.leafLGfx,
      -leafSpan,
      -stemH * 0.4,
      true,
      1,
      true,
    )
    placeLeaf(
      this.leafRSprite,
      this.leafRGfx,
      leafSpan,
      -stemH * 0.5,
      false,
      1,
      true,
    )
    const showUpper = this.growthStage >= 4
    placeLeaf(
      this.leafL2Sprite,
      this.leafL2Gfx,
      -leafSpan * 0.55,
      -stemH * 0.65,
      true,
      0.75,
      showUpper,
    )
    placeLeaf(
      this.leafR2Sprite,
      this.leafR2Gfx,
      leafSpan * 0.55,
      -stemH * 0.72,
      false,
      0.75,
      showUpper,
    )

    // ── Head ───────────────────────────────────────────────────────────
    this.headGraphics.clear()
    if (this.headSprite) {
      const showHead = this.growthStage > 0
      this.headSprite.visible = showHead
      const diameter = Math.max(48, headR * 2.8)
      const tw = Math.max(1, this.headTexture?.width || 1)
      const th = Math.max(1, this.headTexture?.height || 1)
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
        this.faceSprite.position.set(0, -stemH - diameter * 0.02)
        this.faceSprite.tint = FACE_UNTINTED
      }
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
      this.headGraphics.circle(-headR * 0.18, -stemH - headR * 0.08, headR * 0.08)
      this.headGraphics.fill({ color: this.colors.stem })
      this.headGraphics.circle(headR * 0.18, -stemH - headR * 0.08, headR * 0.08)
      this.headGraphics.fill({ color: this.colors.stem })
    }

    if (this.faceSprite && !this.headSprite) {
      this.faceSprite.visible = false
    }

    // Hide graphics fallbacks when sprites carry the geometry
    this.stemGfx.visible = !useStemAsset
    this.leafLGfx.visible = !useLeafAsset
    this.leafRGfx.visible = !useLeafAsset
    this.leafL2Gfx.visible = !useLeafAsset
    this.leafR2Gfx.visible = !useLeafAsset
    void usePotAsset
  }
}

export function defaultPlantColors(palette: GardenPalette): DummyPlantColors {
  return {
    stem: palette.plantStem,
    leaf: palette.plantLeaf,
    petal: palette.plantPetal,
    pot: palette.soil,
  }
}

/** Cycle flower-head styles across team slots for visual distinction. */
export function plantHeadKeyForIndex(
  index: number,
): "round" | "bell" | "sun" | "tulip" {
  const keys = ["round", "bell", "sun", "tulip"] as const
  return keys[index % keys.length]!
}
