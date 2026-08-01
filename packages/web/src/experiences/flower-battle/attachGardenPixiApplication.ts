/**
 * Imperative PixiJS application lifecycle for the Flower Battle presenter
 * canvas (WP-02 / WP-19). Mirrors the ParticleCanvas attach/cleanup pattern so
 * unit tests can inject browser + Application fakes without jsdom or WebGL.
 *
 * Lifecycle:
 *   init Application
 *   → load garden SVG bundle (production default only)
 *   → createGardenScene with textures
 *   → ResizeObserver + visibility pause/resume
 *   → dispose (scene → Application → listeners)
 */

import {
  clearGardenAssetDiagnostics,
  loadGardenSceneAssets,
  publishGardenAssetDiagnostics,
  type GardenAssetDiagnostics,
  type PlantBodyTextures,
  type PlantHeadTextures,
} from "./assets/loadGardenSceneAssets"
import { GARDEN_SCENE_REQUIRED_ALIASES } from "./assets/garden-scene-asset-urls"
import {
  GARDEN_CANVAS_BACKGROUND,
  type CreateGardenPixiApplication,
  type CreateGardenScene,
  type GardenPixiApplicationHandle,
  type GardenPixiInitOptions,
  type GardenScene,
} from "./garden-pixi.types"
import { createGardenScene } from "./rendering/GardenScene"
import type { LayerAssets } from "./rendering/gardenLayers"
import { resolveGardenPalette } from "./rendering/gardenPalette"
import { resolveThemeTokenColor } from "./rendering/resolveThemeColor"

/**
 * Production default scene factory (WP-PIX-05B).
 * Used only when no preloaded assets are available (tests / static).
 * Production attach path loads assets first, then calls createGardenScene
 * with the loaded LayerAssets map.
 */
export const createDefaultGardenScene: CreateGardenScene = (app) =>
  createGardenScene(app)

export interface GardenPixiResizeObserver {
  observe(target: Element): void
  unobserve(target: Element): void
  disconnect(): void
}

export interface GardenPixiDocument {
  readonly visibilityState: DocumentVisibilityState
  addEventListener(
    type: "visibilitychange",
    listener: EventListenerOrEventListenerObject,
  ): void
  removeEventListener(
    type: "visibilitychange",
    listener: EventListenerOrEventListenerObject,
  ): void
}

/** Injectable browser surface — production uses defaults; tests supply fakes. */
export interface GardenPixiEnvironment {
  devicePixelRatio: number
  matchMedia: (query: string) => { matches: boolean }
  ResizeObserver: new (
    callback: ResizeObserverCallback,
  ) => GardenPixiResizeObserver
  document: GardenPixiDocument
}

export interface AttachGardenPixiOptions {
  createApplication?: CreateGardenPixiApplication
  createScene?: CreateGardenScene
  background?: number
  antialias?: boolean
  onReady?: (app: GardenPixiApplicationHandle, scene: GardenScene) => void
  /**
   * When true (default for production default scene), await the garden SVG
   * bundle before createGardenScene. Injected test createScene skips loading.
   */
  loadAssets?: boolean
}

export interface AttachGardenPixiResult {
  app: GardenPixiApplicationHandle
  scene: GardenScene
  prefersReducedMotion: boolean
  dispose: () => void
}

function createDefaultEnvironment(): GardenPixiEnvironment {
  return {
    devicePixelRatio: window.devicePixelRatio,
    matchMedia: (query) => window.matchMedia(query),
    ResizeObserver: window.ResizeObserver,
    document,
  }
}

async function createDefaultApplication(
  options: GardenPixiInitOptions,
): Promise<GardenPixiApplicationHandle> {
  const { Application } = await import("pixi.js")
  const app = new Application()
  await app.init({
    canvas: options.canvas,
    width: options.width,
    height: options.height,
    background: options.background,
    resolution: options.resolution,
    autoDensity: options.autoDensity,
    antialias: options.antialias,
    autoStart: true,
  })
  return app
}

function readCanvasSize(canvas: HTMLCanvasElement): {
  width: number
  height: number
} {
  return {
    width: Math.max(1, Math.round(canvas.clientWidth || 1)),
    height: Math.max(1, Math.round(canvas.clientHeight || 1)),
  }
}

/**
 * Initializes a PixiJS Application on `canvas`, wires resize + visibility
 * listeners, and returns an idempotent dispose function.
 */
export async function attachGardenPixiApplication(
  canvas: HTMLCanvasElement,
  options: AttachGardenPixiOptions = {},
  environment: GardenPixiEnvironment = createDefaultEnvironment(),
): Promise<AttachGardenPixiResult> {
  const createApplication =
    options.createApplication ?? createDefaultApplication
  const createScene = options.createScene ?? createDefaultGardenScene
  // Explicit numeric override bypasses theme lookup (tests / special hosts).
  // Default path resolves --surface-2; unresolved tokens throw ThemeTokenColorError
  // so the host can fall back to the static DOM garden (no hard-coded hex).
  const background =
    typeof options.background === "number"
      ? options.background
      : resolveThemeTokenColor(GARDEN_CANVAS_BACKGROUND)
  const antialias = options.antialias ?? true

  const prefersReducedMotion = environment.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches

  const resolution = Math.min(environment.devicePixelRatio || 1, 2)
  const { width, height } = readCanvasSize(canvas)

  const app = await createApplication({
    canvas,
    width,
    height,
    background,
    resolution,
    autoDensity: true,
    antialias: antialias && !prefersReducedMotion,
  })

  let scene: GardenScene
  try {
    // Production path: load SVG textures BEFORE scene construction so layers
    // mount Sprites instead of procedural Graphics. Injected createScene
    // (unit tests) skips the network/Pixi Assets work unless loadAssets=true.
    const shouldLoadAssets =
      options.loadAssets === true ||
      (options.loadAssets !== false && options.createScene == null)

    if (shouldLoadAssets && options.createScene == null) {
      const palette = resolveGardenPalette(resolveThemeTokenColor)
      // Asset load must never abort the match: on throw, fall back to the
      // procedural Graphics path and still publish diagnostics for probes.
      let layerAssets: LayerAssets | undefined
      let plantHeads: Partial<PlantHeadTextures> | undefined
      let plantBody: PlantBodyTextures | undefined
      let assetDiagnostics: GardenAssetDiagnostics | null = null
      try {
        const loaded = await loadGardenSceneAssets(palette)
        layerAssets = loaded.layers
        plantHeads = loaded.plantHeads
        plantBody = loaded.plantBody
        assetDiagnostics = loaded.diagnostics
        publishGardenAssetDiagnostics(loaded.diagnostics)
        if (
          typeof console !== "undefined" &&
          typeof console.info === "function"
        ) {
          console.info("[flower-battle] garden assets", {
            complete: loaded.complete,
            loaded: loaded.diagnostics.loadedAliases.length,
            missing: loaded.diagnostics.missingAliases,
            usedSprites: loaded.diagnostics.usedSpriteAliases,
          })
        }
      } catch (loadError) {
        const failed: GardenAssetDiagnostics = {
          requiredAliases: [...GARDEN_SCENE_REQUIRED_ALIASES],
          loadedAliases: [],
          missingAliases: [...GARDEN_SCENE_REQUIRED_ALIASES],
          failedUrls: [],
          fallbackAliases: [...GARDEN_SCENE_REQUIRED_ALIASES],
          usedSpriteAliases: [],
        }
        assetDiagnostics = failed
        publishGardenAssetDiagnostics(failed)
        if (
          typeof console !== "undefined" &&
          typeof console.warn === "function"
        ) {
          console.warn(
            "[flower-battle] garden assets load failed; using procedural scene",
            loadError,
          )
        }
      }
      scene = createGardenScene(app, {
        palette,
        layerAssets,
        plantHeads,
        plantBody,
        assetDiagnostics,
      })
    } else {
      scene = createScene(app)
    }
  } catch (error) {
    try {
      app.destroy(
        { removeView: true },
        { children: true, texture: true, textureSource: true },
      )
    } catch {
      // Preserve the scene-creation error that caused this cleanup path.
    }
    throw error
  }
  scene.updateLayout(width, height)

  let disposed = false

  function resize(): void {
    if (disposed) return
    const size = readCanvasSize(canvas)
    app.renderer.resize(size.width, size.height)
    scene.updateLayout(size.width, size.height)
  }

  const resizeObserver = new environment.ResizeObserver(() => resize())
  resizeObserver.observe(canvas)

  function onVisibilityChange(): void {
    if (disposed) return
    if (environment.document.visibilityState === "hidden") {
      app.ticker.stop()
    } else {
      app.ticker.start()
    }
  }

  environment.document.addEventListener("visibilitychange", onVisibilityChange)

  // Honour current hidden state (e.g. attach while backgrounded).
  if (environment.document.visibilityState === "hidden") {
    app.ticker.stop()
  }

  options.onReady?.(app, scene)

  function dispose(): void {
    if (disposed) return
    disposed = true

    app.ticker.stop()
    resizeObserver.disconnect()
    environment.document.removeEventListener(
      "visibilitychange",
      onVisibilityChange,
    )
    clearGardenAssetDiagnostics()

    try {
      scene.destroy()
    } catch {
      // Scene destroy is best-effort; Application teardown still runs.
    }

    // Recursive destroy: children + textures + texture sources (v8 baseTexture).
    app.destroy(
      { removeView: true },
      { children: true, texture: true, textureSource: true },
    )
  }

  return { app, scene, prefersReducedMotion, dispose }
}
