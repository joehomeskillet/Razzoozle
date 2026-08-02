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
 *   → dispose (listeners → scene → loaded assets → Application; keep canvas)
 */

import {
  clearGardenAssetDiagnostics,
  loadGardenSceneAssets,
  publishGardenAssetDiagnostics,
  type GardenAssetDiagnostics,
  type PlantBodyTextures,
  type PlantHeadTextures,
  type PlantVariantTextures,
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

/**
 * Read the canvas's CSS pixel size for the renderer init / resize path.
 *
 * WP3 (FB-HUD-WP3): keep the exact fractional `clientWidth/clientHeight` (no
 * `Math.round`). Rounding to an integer pushes the canvas to a sub-pixel
 * position inside its flex/grid parent slot, and the compositor then resamples
 * it bilinearly → canvas content looks blurred even when the backing store is
 * pixel-perfect. Passing the fractional value lets Pixi set
 * `canvas.style.{width,height}` to the layout's true size; the backing store
 * is still derived by multiplying by `resolution`, so 1 device-pixel = 1/CSS-
 * pixel/2/3 mapping stays intact.
 *
 * `Math.max(1, …)` keeps the backing store non-zero during the brief hidden
 * pre-attach window (a 0×0 parent reports clientWidth=0 and would force a 0×0
 * `app.renderer.resize` that Pixi v8 treats as destroy).
 */
function readCanvasSize(canvas: HTMLCanvasElement): {
  width: number
  height: number
} {
  return {
    width: Math.max(1, canvas.clientWidth || 1),
    height: Math.max(1, canvas.clientHeight || 1),
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

  // WP3 (FB-HUD-WP3): use the actual devicePixelRatio (no cap). The previous
  // `Math.min(dpr, 2)` clamped high-DPR beamers / phones (DPR 3+) to a 2×
  // backing store, so the browser then bilinear-upscaled the canvas to fill
  // every device pixel — that was the source of the presenter / HUD blur on
  // 3× displays. Passing the true DPR keeps the backing store pixel-aligned
  // to the device grid and the compositor from re-sampling.
  const resolution = environment.devicePixelRatio || 1
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

  let scene: GardenScene | undefined
  let releaseLoadedAssets: (() => void) | undefined
  let resizeObserver: GardenPixiResizeObserver | undefined
  let observingCanvas = false
  let visibilityListenerRegistered = false
  let diagnosticsPublished = false
  let cleanupRunning = false
  let cleanupComplete = false

  function onVisibilityChange(): void {
    if (cleanupRunning || cleanupComplete) return
    if (environment.document.visibilityState === "hidden") {
      app.ticker.stop()
    } else {
      app.ticker.start()
    }
  }

  function runCleanupStep(step: () => void): void {
    try {
      step()
    } catch {
      // Cleanup is best-effort and initialization errors keep precedence.
    }
  }

  function cleanup(): void {
    if (cleanupRunning || cleanupComplete) return
    cleanupRunning = true
    try {
      runCleanupStep(() => app.ticker.stop())
      if (observingCanvas && resizeObserver) {
        runCleanupStep(() => resizeObserver?.disconnect())
      }
      if (visibilityListenerRegistered) {
        runCleanupStep(() =>
          environment.document.removeEventListener(
            "visibilitychange",
            onVisibilityChange,
          ),
        )
      }
      if (diagnosticsPublished) {
        runCleanupStep(clearGardenAssetDiagnostics)
      }
      if (scene) {
        runCleanupStep(() => scene?.destroy())
      }
      runCleanupStep(() => releaseLoadedAssets?.())
      runCleanupStep(() =>
        app.destroy(
          { removeView: false },
          { children: true, texture: false, textureSource: false },
        ),
      )
    } finally {
      cleanupComplete = true
      cleanupRunning = false
    }
  }

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
      let plantVariants: PlantVariantTextures | null = null
      let assetDiagnostics: GardenAssetDiagnostics | null = null
      try {
        const loaded = await loadGardenSceneAssets(palette)
        releaseLoadedAssets = loaded.release
        layerAssets = loaded.layers
        plantHeads = loaded.plantHeads
        plantBody = loaded.plantBody
        plantVariants = loaded.plantVariants
        assetDiagnostics = loaded.diagnostics
        publishGardenAssetDiagnostics(loaded.diagnostics)
        diagnosticsPublished = true
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
        diagnosticsPublished = true
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
        plantVariants,
        prefersReducedMotion,
        assetDiagnostics,
      })
    } else {
      scene = createScene(app)
    }
    scene.updateLayout(width, height)

    const resize = (): void => {
      if (cleanupRunning || cleanupComplete || !scene) return
      const size = readCanvasSize(canvas)
      app.renderer.resize(size.width, size.height)
      scene.updateLayout(size.width, size.height)
    }

    resizeObserver = new environment.ResizeObserver(() => resize())
    resizeObserver.observe(canvas)
    observingCanvas = true

    environment.document.addEventListener(
      "visibilitychange",
      onVisibilityChange,
    )
    visibilityListenerRegistered = true

    // Honour current hidden state (e.g. attach while backgrounded).
    if (environment.document.visibilityState === "hidden") {
      app.ticker.stop()
    }

    options.onReady?.(app, scene)
  } catch (error) {
    cleanup()
    throw error
  }

  if (!scene) {
    cleanup()
    throw new Error("Garden scene initialization completed without a scene")
  }

  return { app, scene, prefersReducedMotion, dispose: cleanup }
}
