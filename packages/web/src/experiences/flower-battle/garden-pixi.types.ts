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
 * Optional internal E2E identity contract for scene-graph stability probes.
 * Real object references only — no copies or proxies.
 *
 * SDD §30 (probe-v3): a probe only PASSes if it verifies at least two
 * independent signals. `revision`, `teamNames`, and `growthStages` expose the
 * normalized scene state alongside the stable Pixi object references, so
 * probes can cross-check the state vector against the rendered plant
 * instances instead of relying on canvas existence alone.
 */
export interface GardenE2EIdentity {
  root: object
  actorPlants: readonly object[]
  labels: readonly string[]
  /**
   * Monotonic counter incremented on every successful `updateSnapshot` call.
   * A stable value proves no further normalization occurred between samples;
   * a different value proves a new normalized state was applied.
   */
  revision: number
  /** Per-plant team names parallel to `actorPlants` (same length, same order). */
  teamNames: readonly string[]
  /** Per-plant growth stages parallel to `actorPlants` (same length, same order). */
  growthStages: readonly number[]
}

/** Read-only canvas handle published when `gardenE2EProbe=1` is present. */
export interface GardenE2EProbeHandle {
  getE2EIdentity(): GardenE2EIdentity
}

/**
 * Minimal scene contract the host resizes/destroys and optionally snapshots.
 * Production `createGardenScene` implements updateSnapshot; empty fakes omit it.
 */
export interface GardenScene {
  updateLayout(width: number, height: number): void
  destroy(): void
  updateSnapshot?(snapshot: GardenSceneLiveSnapshot): void
  /** Optional internal E2E probe — production procedural scene implements it. */
  getE2EIdentity?(): GardenE2EIdentity
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
 * Semantic canvas clear color — sky token so any uncovered pixel matches the
 * garden sky (avoids cream/white flash between layers or on cover-crop edges).
 * Resolved to a Pixi 0xRRGGBB via resolveThemeTokenColor before Application init.
 * Explicit numeric `options.background` bypasses this lookup.
 */
export const GARDEN_CANVAS_BACKGROUND =
  "--flower-battle-sky" satisfies CssTokenName

/** Creates a no-op scene graph placeholder until WP-05. */
export function createEmptyGardenScene(): GardenScene {
  return {
    updateLayout() {},
    destroy() {},
  }
}
