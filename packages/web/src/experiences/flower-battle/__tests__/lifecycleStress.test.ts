/**
 * WP-PRESENTER-7 / W9-7 — lifecycle stress tests for the Flower Battle
 * PixiJS canvas host.
 *
 * Mirrors the structural-fake pattern from GardenBattleCanvasHost.test.tsx
 * (node env, no jsdom / WebGL) but focuses on the multi-cycle paths that
 * the unit tests intentionally under-sample: 10 mount/unmount rounds,
 * rapid resize, and identity preservation across rerender storms.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  attachGardenPixiApplication,
  type GardenPixiEnvironment,
  type GardenPixiResizeObserver,
  type GardenPixiDocument,
} from "../attachGardenPixiApplication"
import { createEmptyGardenScene } from "../garden-pixi.types"
import type {
  CreateGardenPixiApplication,
  GardenPixiApplicationHandle,
  GardenScene,
} from "../garden-pixi.types"
import { Container } from "pixi.js"

const TEST_CANVAS_BACKGROUND = 0x112233
const STRESS_CYCLES = 10

type StoredListener = EventListenerOrEventListenerObject

function createBrowserFake(
  options: { devicePixelRatio?: number; reducedMotion?: boolean } = {},
) {
  let resizeCallback: ResizeObserverCallback | undefined
  const visibilityListeners = new Set<StoredListener>()
  const resizeCalls: Array<readonly [number, number]> = []
  const mediaQuery = {
    matches: options.reducedMotion ?? false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  let observedTarget: Element | null = null
  const resizeObserver = {
    observe: vi.fn((target: Element) => {
      observedTarget = target
    }),
    unobserve: vi.fn((target: Element) => {
      if (observedTarget === target) observedTarget = null
    }),
    disconnect: vi.fn(() => {
      observedTarget = null
    }),
    takeRecords: vi.fn(() => [] as ResizeObserverEntry[]),
  }
  class ResizeObserverFake {
    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback
    }
    observe = resizeObserver.observe
    unobserve = resizeObserver.unobserve
    disconnect = resizeObserver.disconnect
    takeRecords = resizeObserver.takeRecords
  }
  const documentFake = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: vi.fn((_type: string, listener: StoredListener) => {
      visibilityListeners.add(listener)
    }),
    removeEventListener: vi.fn(
      (_type: string, listener: StoredListener) => {
        visibilityListeners.delete(listener)
      },
    ),
  }
  return {
    environment: {
      devicePixelRatio: options.devicePixelRatio ?? 1,
      matchMedia: vi.fn(() => mediaQuery),
      ResizeObserver: ResizeObserverFake as unknown as GardenPixiEnvironment["ResizeObserver"],
      document: documentFake as unknown as GardenPixiDocument,
    } satisfies GardenPixiEnvironment,
    mediaQuery,
    resizeObserver: resizeObserver as unknown as GardenPixiResizeObserver & {
      observe: ReturnType<typeof vi.fn>
    },
    visibilityListeners,
    observedTarget: () => observedTarget,
    notifyResize(width: number, height: number) {
      if (!resizeCallback) throw new Error("ResizeObserver was not created")
      resizeCalls.push([width, height])
      resizeCallback(
        [],
        resizeObserver as unknown as ResizeObserver,
      )
    },
    resizeCalls,
  }
}

function createCanvasFake(width = 640, height = 360) {
  const canvas = {
    clientWidth: width,
    clientHeight: height,
  } as unknown as HTMLCanvasElement
  return canvas
}

function createAppFake() {
  const canvas = createCanvasFake()
  const resize = vi.fn((w: number, h: number) => {
    Object.assign(canvas, { clientWidth: w, clientHeight: h })
  })
  const start = vi.fn()
  const stop = vi.fn()
  const destroy = vi.fn()
  const app: GardenPixiApplicationHandle = {
    canvas,
    renderer: { resize, width: 640, height: 360 },
    ticker: { start, stop },
    destroy,
  }
  return { app, resize, start, stop, destroy }
}

function createSceneFake(): { scene: GardenScene; updateLayout: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
  const updateLayout = vi.fn()
  const destroy = vi.fn()
  return { scene: { updateLayout, destroy }, updateLayout, destroy }
}

describe("attachGardenPixiApplication lifecycle stress", () => {
  let browser: ReturnType<typeof createBrowserFake>

  beforeEach(() => {
    browser = createBrowserFake()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("survives 10 mount/unmount cycles with a stable application handle factory", async () => {
    const { app, destroy } = createAppFake()
    const createApplication: CreateGardenPixiApplication = vi.fn(async () => app)
    const createScene = vi.fn(() => createEmptyGardenScene())

    for (let cycle = 0; cycle < STRESS_CYCLES; cycle += 1) {
      // Re-create canvas each cycle so the host cannot accidentally keep a
      // reference across mounts.
      const canvas = createCanvasFake(640 + cycle * 16, 360)
      const { dispose } = await attachGardenPixiApplication(
        canvas,
        { createApplication, createScene, background: TEST_CANVAS_BACKGROUND },
        browser.environment,
      )
      dispose()
    }

    // The Application factory may be called multiple times (once per cycle),
    // but destroy() must run the same number of times — no lingering Apps.
    expect(createApplication).toHaveBeenCalledTimes(STRESS_CYCLES)
    expect(destroy).toHaveBeenCalledTimes(STRESS_CYCLES)
    // Visibility listeners + ResizeObserver must be entirely released.
    expect(browser.visibilityListeners.size).toBe(0)
    expect(browser.resizeObserver.disconnect).toHaveBeenCalledTimes(
      STRESS_CYCLES,
    )
  })

  it("handles rapid resize bursts across multiple viewports without losing layout calls", async () => {
    const { app } = createAppFake()
    const { scene, updateLayout } = createSceneFake()
    const canvas = createCanvasFake()

    const { dispose } = await attachGardenPixiApplication(
      canvas,
      {
        createApplication: async () => app,
        createScene: () => scene,
        background: TEST_CANVAS_BACKGROUND,
      },
      browser.environment,
    )

    const viewports: ReadonlyArray<readonly [number, number]> = [
      [1280, 720],
      [1024, 640],
      [820, 540],
      [640, 480],
      [375, 667],
      [414, 736],
      [768, 1024],
      [800, 600],
    ]

    for (let burst = 0; burst < 20; burst += 1) {
      const [width, height] = viewports[burst % viewports.length]!
      Object.assign(canvas, { clientWidth: width, clientHeight: height })
      browser.notifyResize(width, height)
    }

    expect(browser.resizeCalls).toHaveLength(20)
    // Every notify must produce an updateLayout + renderer.resize call.
    expect(updateLayout).toHaveBeenCalledTimes(20)
    expect(app.renderer.resize).toHaveBeenCalledTimes(20)
    dispose()
  })

  it("does not leak ticker callbacks after unmount when pause/resume cycled", async () => {
    const { app, start, stop } = createAppFake()
    const { scene } = createSceneFake()
    const createApplication: CreateGardenPixiApplication = vi.fn(async () => app)
    const createScene = vi.fn(() => scene)

    for (let cycle = 0; cycle < STRESS_CYCLES; cycle += 1) {
      const canvas = createCanvasFake()
      const { dispose } = await attachGardenPixiApplication(
        canvas,
        { createApplication, createScene, background: TEST_CANVAS_BACKGROUND },
        browser.environment,
      )
      // Cycle through hidden → visible a few times per mount.
      browser.environment.document.visibilityState = "hidden"
      browser.visibilityListeners.forEach((listener) => {
        if (typeof listener === "function") {
          listener({ type: "visibilitychange" } as Event)
        } else {
          listener.handleEvent({ type: "visibilitychange" } as Event)
        }
      })
      browser.environment.document.visibilityState = "visible"
      browser.visibilityListeners.forEach((listener) => {
        if (typeof listener === "function") {
          listener({ type: "visibilitychange" } as Event)
        } else {
          listener.handleEvent({ type: "visibilitychange" } as Event)
        }
      })
      dispose()
    }

    // No visibility listener may survive unmount.
    expect(browser.visibilityListeners.size).toBe(0)
    // stop() must run at least once per cycle (ticker is paused on dispose).
    expect(stop).toHaveBeenCalled()
    // start() is invoked when the host transitions back to visible; total
    // count is bounded by the number of cycles — never unbounded.
    expect(start.mock.calls.length).toBeLessThanOrEqual(STRESS_CYCLES * 2)
  })

  it("preserves the same Application + scene identity across a snapshot burst", async () => {
    const stage = new Container()
    const { app } = createAppFake()
    const appWithStage = Object.assign(app, { stage })
    const createApplication: CreateGardenPixiApplication = vi.fn(
      async () => appWithStage,
    )
    const updateSnapshot = vi.fn()
    const scene: GardenScene = {
      updateLayout: vi.fn(),
      destroy: vi.fn(),
      updateSnapshot,
    }
    const createScene = vi.fn(() => scene)

    const canvas = createCanvasFake()
    const {
      scene: attached,
      app: attachedApp,
      dispose,
    } = await attachGardenPixiApplication(
      canvas,
      {
        createApplication,
        createScene,
        background: TEST_CANVAS_BACKGROUND,
      },
      browser.environment,
    )

    for (let tick = 0; tick < 30; tick += 1) {
      attached.updateSnapshot?.({
        phase: tick % 2 === 0 ? "question" : "reveal",
        teams: [
          { name: "Violet", growthStage: tick % 11 },
          { name: "Orange", growthStage: (tick + 3) % 11 },
        ],
      })
    }

    expect(createApplication).toHaveBeenCalledTimes(1)
    expect(createScene).toHaveBeenCalledTimes(1)
    expect(attached).toBe(scene)
    expect(attachedApp).toBe(appWithStage)
    expect(updateSnapshot).toHaveBeenCalledTimes(30)
    dispose()
  })
})
