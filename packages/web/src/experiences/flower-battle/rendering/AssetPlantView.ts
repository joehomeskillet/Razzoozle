/**
 * High-quality production team plant view (Fluent-derived stage textures).
 *
 * One instance per team slot. Keeps a single stable root Container; stage
 * changes swap textures on a single Sprite — no root recreation, no per-
 * snapshot refetch. Full-color source assets are never team-tinted
 * (`sprite.tint = 0xffffff`).
 *
 * Growth mapping (0–10):
 *   0       → soil only (no plant sprite)
 *   1       → seedling
 *   2–4     → sprout  (progressive scale)
 *   5–6     → bud
 *   7–8     → halfBloom
 *   9–10    → fullBloom
 */

import { Container, Sprite } from "pixi.js"

import {
  plantMacroStageForGrowth,
  type PlantMacroStage,
  type PlantStageTextures,
} from "../assets/loadGardenSceneAssets"

const MAX_GROWTH = 10

/** Total plant height in logical px at full bloom (matches §10 target ~335). */
const FULL_HEIGHT_PX = 335

/** Per-stage scale factors relative to full bloom. */
const STAGE_SCALE: Record<PlantMacroStage, number> = {
  seedling: 0.22,
  sprout: 0.42,
  bud: 0.6,
  halfBloom: 0.8,
  fullBloom: 1,
}

/** Growth-stage ranges for intermediate scale within a macro band. */
function stageScale(growthStage: number, macro: PlantMacroStage): number {
  const base = STAGE_SCALE[macro]
  if (macro === "sprout") {
    // 2–4 → 0.42 … 0.52 (subtle growth within the sprout band)
    const t = (growthStage - 2) / 2
    return base + t * 0.1
  }
  if (macro === "bud") {
    const t = (growthStage - 5) / 1
    return base + t * 0.05
  }
  if (macro === "halfBloom") {
    const t = (growthStage - 7) / 1
    return base + t * 0.05
  }
  return base
}

export interface AssetPlantViewOptions {
  label?: string
  /** Complete stage texture set for this team slot's species. */
  stages: PlantStageTextures
  /**
   * When true, disables the short scale/alpha transition on stage change
   * (prefers-reduced-motion). Default false.
   */
  reducedMotion?: boolean
}

export class AssetPlantView {
  readonly root: Container
  private readonly sprite: Sprite
  private readonly stages: PlantStageTextures
  private readonly reducedMotion: boolean
  private growthStage = 0
  private macro: PlantMacroStage = "seedling"
  /** Transition progress 0→1 on macro change (1 = settled). */
  private transitionT = 1
  /** Texture natural size (square, contain-fit). */
  private textureSize: number

  constructor(options: AssetPlantViewOptions) {
    this.stages = options.stages
    this.reducedMotion = options.reducedMotion ?? false
    this.root = new Container()
    this.root.label = options.label ?? "asset-plant"

    this.sprite = new Sprite(this.stages.seedling)
    this.sprite.label = "plant-sprite"
    this.sprite.anchor.set(0.5, 1)
    this.sprite.tint = 0xffffff
    this.sprite.visible = false
    this.root.addChild(this.sprite)

    this.textureSize = Math.max(
      1,
      Math.min(this.stages.fullBloom.width, this.stages.fullBloom.height),
    )
    this.applyStage(0, true)
  }

  getGrowthStage(): number {
    return this.growthStage
  }

  getMacroStage(): PlantMacroStage {
    return this.macro
  }

  /** Per-frame update for the short stage transition. Safe to call every tick. */
  update(deltaTime: number): void {
    if (this.transitionT >= 1) return
    if (this.reducedMotion) {
      this.transitionT = 1
    } else {
      this.transitionT = Math.min(1, this.transitionT + deltaTime * 0.06)
    }
    this.applyVisual()
  }

  setGrowthStage(stage: number): void {
    const next = Math.min(MAX_GROWTH, Math.max(0, Math.floor(stage)))
    if (next === this.growthStage) return
    this.growthStage = next
    const nextMacro = plantMacroStageForGrowth(next)
    if (nextMacro !== this.macro) {
      this.macro = nextMacro
      this.transitionT = this.reducedMotion ? 1 : 0
      this.applyStage(next, false)
    } else {
      this.applyStage(next, false)
    }
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }

  /** Swap texture + visibility for the current stage; scale applied in applyVisual. */
  private applyStage(stage: number, immediate: boolean): void {
    if (stage === 0) {
      this.sprite.visible = false
      return
    }
    const tex = this.stages[this.macro]
    if (this.sprite.texture !== tex) {
      this.sprite.texture = tex
    }
    this.sprite.visible = true
    if (immediate) {
      this.transitionT = 1
    }
    this.applyVisual()
  }

  private applyVisual(): void {
    if (!this.sprite.visible) return
    const scaleFactor = stageScale(this.growthStage, this.macro)
    // Transition: slight scale-up + fade-in from 85%.
    const trans = this.transitionT
    const ease = 1 - (1 - trans) * (1 - trans) // ease-out quad
    const s =
      (FULL_HEIGHT_PX / this.textureSize) * scaleFactor * (0.85 + 0.15 * ease)
    this.sprite.scale.set(s, s)
    this.sprite.alpha = 0.5 + 0.5 * ease
  }
}
