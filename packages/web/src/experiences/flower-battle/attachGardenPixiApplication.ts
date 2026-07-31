/**
 * Imperative PixiJS application lifecycle for the Flower Battle presenter
 * canvas (WP-02). Mirrors the ParticleCanvas attach/cleanup pattern so unit
 * tests can inject browser + Application fakes without jsdom or WebGL.
 *
 * Lifecycle: init → ResizeObserver → visibility pause/resume → dispose
 * (scene → textures → Application → listeners).
 */

import {
  GARDEN_CANVAS_BACKGROUND,
  type CreateGardenPixiApplication,
  type CreateGardenScene,
  type GardenPixiApplicationHandle,
  type GardenPixiInitOptions,
  type GardenScene,
} from "./garden-pixi.types"
import { createGardenScene } from "./rendering/GardenScene"

/**
 * Production default scene factory (WP-PIX-05B).
 * Procedural layers + plants; host feeds roster via updateSnapshot.
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
  const background = options.background ?? GARDEN_CANVAS_BACKGROUND
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
    scene = createScene(app)
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
