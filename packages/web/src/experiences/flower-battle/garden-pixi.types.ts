/**
 * Shared contracts for the Flower Battle PixiJS canvas host (WP-02 / WP-PIX-05B).
 * Production attaches `createGardenScene` (procedural layers + plants).
 * Empty placeholder remains for tests that inject lifecycle-only fakes.
 */

import type { CssTokenName } from "@razzoozle/common/theme-tokens"
import type { ReactNode } from "react"
import type { Application } from "pixi.js"

import type { FlowerBattleTeamState } from "./flower-battle-scene.types"

/** Render quality tiers. `static` skips WebGL and uses the DOM garden scene. */
export type GardenRenderQuality = "high" | "medium" | "low" | "static"

/**
 * Live roster slice the host pushes into a procedural scene without recreating
 * the Application, canvas, scene root, or stable plot anchors.
 */
export interface GardenSceneLiveSnapshot {
  teams: readonly { name: string; growthStage: number }[]
  /** Experience / question phase label (optional; does not move anchors). */
  phase?: string
}

/**
 * Minimal scene contract the host resizes/destroys and optionally snapshots.
 * Production `createGardenScene` implements updateSnapshot; empty fakes omit it.
 */
export interface GardenScene {
  updateLayout(width: number, height: number): void
  destroy(): void
  updateSnapshot?(snapshot: GardenSceneLiveSnapshot): void
}

/**
 * Subset of PixiJS Application the lifecycle core depends on.
 * Production uses real `Application`; tests inject structural fakes.
 */
export interface GardenPixiApplicationHandle {
  readonly canvas: HTMLCanvasElement
  readonly renderer: {
    resize: (width: number, height: number) => void
    readonly width: number
    readonly height: number
  }
  readonly ticker: {
    start: () => void
    stop: () => void
  }
  destroy: (
    rendererDestroyOptions?: boolean | { removeView?: boolean },
    options?: {
      children?: boolean
      texture?: boolean
      /** PixiJS v8 name for v7 `baseTexture`. */
      textureSource?: boolean
    },
  ) => void
}

export interface GardenPixiInitOptions {
  canvas: HTMLCanvasElement
  width: number
  height: number
  background: number
  resolution: number
  autoDensity: boolean
  antialias: boolean
}

export type CreateGardenPixiApplication = (
  options: GardenPixiInitOptions,
) => Promise<GardenPixiApplicationHandle>

export type CreateGardenScene = (
  app: GardenPixiApplicationHandle,
) => GardenScene

export interface GardenPixiHookValue {
  app: Application | null
  isReady: boolean
  error: Error | null
  scene: GardenScene | null
}

export interface GardenBattleCanvasHostProps {
  teams: FlowerBattleTeamState[]
  quality?: GardenRenderQuality
  onReady?: (app: Application) => void
  onError?: (error: Error) => void
  className?: string
  /** Seed for the DOM static fallback (`FlowerGardenScene`). */
  seed?: number | string
  /** Recipe version for the DOM static fallback. */
  recipeVersion?: number | string
  /**
   * Live experience / question phase for `scene.updateSnapshot`.
   * Does not remount the Pixi Application or scene root.
   */
  phase?: string
  /** Override static fallback markup (defaults to FlowerGardenScene). */
  fallback?: ReactNode
}

/**
 * Semantic canvas clear color (warm paper / field surface).
 * Resolved to a Pixi 0xRRGGBB via resolveThemeTokenColor before Application init.
 * Explicit numeric `options.background` bypasses this lookup.
 */
export const GARDEN_CANVAS_BACKGROUND = "--surface-2" satisfies CssTokenName

/** Creates a no-op scene graph placeholder until WP-05. */
export function createEmptyGardenScene(): GardenScene {
  return {
    updateLayout() {},
    destroy() {},
  }
}
