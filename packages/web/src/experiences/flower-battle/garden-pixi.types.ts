/**
 * Shared contracts for the Flower Battle PixiJS canvas host (WP-02).
 * Scene content (layers, plants) lands in WP-05 — only the lifecycle shell
 * and a placeholder GardenScene live here.
 */

import type { ReactNode } from "react"
import type { Application } from "pixi.js"

import type { FlowerBattleTeamState } from "./flower-battle-scene.types"

/** Render quality tiers. `static` skips WebGL and uses the DOM garden scene. */
export type GardenRenderQuality = "high" | "medium" | "low" | "static"

/**
 * Minimal scene contract the host resizes/destroys.
 * WP-05 replaces the empty placeholder with real layer content.
 */
export interface GardenScene {
  updateLayout(width: number, height: number): void
  destroy(): void
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
  /** Override static fallback markup (defaults to FlowerGardenScene). */
  fallback?: ReactNode
}

/**
 * Temporary canvas clear color (warm paper). OK as numeric canvas fill;
 * CSS token mapping via getThemeTokenCssVar lands with theme wiring later.
 */
export const GARDEN_CANVAS_BACKGROUND = 0xf4f1ea

/** Creates a no-op scene graph placeholder until WP-05. */
export function createEmptyGardenScene(): GardenScene {
  return {
    updateLayout() {},
    destroy() {},
  }
}
