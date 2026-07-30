/**
 * Procedural dummy plant (WP-PIX-05A). No WP-04 rig imports — Graphics only.
 * Growth stage (0..10) scales stem/head; identity of the view is stable across
 * updateSnapshot calls so ground anchors never recreate.
 */

import { Container, Graphics } from "pixi.js"

import type { GardenPalette } from "./gardenPalette"

const MAX_GROWTH = 10
const STEM_BASE = 28
const STEM_PER_STAGE = 14
const HEAD_BASE = 18
const HEAD_PER_STAGE = 2.2

export interface DummyPlantColors {
  stem: number
  leaf: number
  petal: number
}

export class DummyPlantView {
  readonly root: Container
  private readonly stem: Graphics
  private readonly leafL: Graphics
  private readonly leafR: Graphics
  private readonly head: Graphics
  private growthStage = 0
  private colors: DummyPlantColors

  constructor(colors: DummyPlantColors, label = "dummy-plant") {
    this.colors = colors
    this.root = new Container()
    this.root.label = label
    this.stem = new Graphics()
    this.leafL = new Graphics()
    this.leafR = new Graphics()
    this.head = new Graphics()
    this.root.addChild(this.stem, this.leafL, this.leafR, this.head)
    this.redraw()
  }

  getGrowthStage(): number {
    return this.growthStage
  }

  setColors(colors: DummyPlantColors): void {
    this.colors = colors
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
    const leafSpan = 16 + 10 * t

    this.stem.clear()
    this.stem.roundRect(-6, -stemH, 12, stemH, 6)
    this.stem.fill({ color: this.colors.stem })

    this.leafL.clear()
    this.leafL.ellipse(-leafSpan, -stemH * 0.45, 18 + 6 * t, 10 + 3 * t)
    this.leafL.fill({ color: this.colors.leaf })

    this.leafR.clear()
    this.leafR.ellipse(leafSpan, -stemH * 0.55, 18 + 6 * t, 10 + 3 * t)
    this.leafR.fill({ color: this.colors.leaf })

    this.head.clear()
    // Petal ring
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2
      const px = Math.cos(angle) * headR * 0.75
      const py = -stemH + Math.sin(angle) * headR * 0.75
      this.head.circle(px, py, headR * 0.45)
      this.head.fill({ color: this.colors.petal })
    }
    // Centre bud
    this.head.circle(0, -stemH, headR * 0.55)
    this.head.fill({ color: this.colors.stem })
  }
}

export function defaultPlantColors(palette: GardenPalette): DummyPlantColors {
  return {
    stem: palette.plantStem,
    leaf: palette.plantLeaf,
    petal: palette.plantPetal,
  }
}
