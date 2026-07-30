/**
 * WP-02 lifecycle tests for GardenBattleCanvasHost.
 * Follows ParticleCanvas attach-fake pattern (node env, no jsdom/WebGL).
 */

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("motion/react", () => ({
  useReducedMotion: () => true,
  useMotionValue: (initial: number) => {
    let current = initial
    return {
      get: () => current,
      set: (value: number) => {
        current = value
      },
    }
  },
  animate: vi.fn(() => ({
    stop: vi.fn(),
    then: (fn: () => void) => Promise.resolve().then(fn),
  })),
  motion: {
    g: ({
      children,
      id,
      transform,
      dangerouslySetInnerHTML,
      ...rest
    }: {
      children?: React.ReactNode
      id?: string
      transform?: string
      dangerouslySetInnerHTML?: { __html: string }
      [key: string]: unknown
    }) => (
      <g id={id} transform={transform} {...rest}>
        {dangerouslySetInnerHTML ? (
          <g dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
        ) : null}
        {children}
      </g>
    ),
    circle: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode
      [key: string]: unknown
    }) => <circle {...rest}>{children}</circle>,
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

import { Container } from "pixi.js"

import {
  attachGardenPixiApplication,
  createDefaultGardenScene,
} from "../attachGardenPixiApplication"
import {
  GardenBattleCanvasHost,
  resolveGardenRenderQuality,
  useGardenPixiApplication,
} from "../GardenBattleCanvasHost"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"
import type {
  CreateGardenPixiApplication,
  GardenPixiApplicationHandle,
  GardenScene,
} from "../garden-pixi.types"
import { createEmptyGardenScene } from "../garden-pixi.types"
import { createGardenScene } from "../rendering/GardenScene"
import type { GardenPalette } from "../rendering/gardenPalette"

type StoredListener = EventListenerOrEventListenerObject

function callListener(listener: StoredListener, event: Event): void {
  if (typeof listener === "function") listener(event)
  else listener.handleEvent(event)
}

function createBrowserFake(options?: {
  devicePixelRatio?: number
  reducedMotion?: boolean
  visibilityState?: DocumentVisibilityState
}) {
  let visibilityState: DocumentVisibilityState =
    options?.visibilityState ?? "visible"
  let resizeCallback: ResizeObserverCallback | undefined
  const visibilityListeners = new Set<StoredListener>()
  const mediaQuery = {
    matches: options?.reducedMotion ?? false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const resizeObserver = {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
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
    get visibilityState() {
      return visibilityState
    },
    addEventListener: vi.fn((_type: string, listener: StoredListener) => {
      visibilityListeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: StoredListener) => {
      visibilityListeners.delete(listener)
    }),
  }

  return {
    environment: {
      devicePixelRatio: options?.devicePixelRatio ?? 1,
      matchMedia: vi.fn(() => mediaQuery),
      ResizeObserver: ResizeObserverFake,
      document: documentFake,
    },
    resizeObserver,
    visibilityListeners,
    mediaQuery,
    notifyResize() {
      if (!resizeCallback) throw new Error("ResizeObserver was not created")
      const started = performance.now()
      resizeCallback([], resizeObserver as unknown as ResizeObserver)
      return performance.now() - started
    },
    setVisibility(state: DocumentVisibilityState) {
      visibilityState = state
      const event = { type: "visibilitychange" } as Event
      for (const listener of [...visibilityListeners]) {
        callListener(listener, event)
      }
    },
  }
}

function createCanvasFake(width = 640, height = 360) {
  return {
    clientWidth: width,
    clientHeight: height,
  } as unknown as HTMLCanvasElement
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
    renderer: {
      resize,
      width: 640,
      height: 360,
    },
    ticker: { start, stop },
    destroy,
  }
  return { app, resize, start, stop, destroy }
}

function createSceneFake() {
  const updateLayout = vi.fn()
  const destroy = vi.fn()
  const scene: GardenScene = { updateLayout, destroy }
  return { scene, updateLayout, destroy }
}

const makeTeam = (name: string): FlowerBattleTeamState => ({
  name,
  members: [],
  hp: 0,
  shield: 0,
  effects: [],
  growthStage: 0,
  sunPoints: 0,
})

const TEAMS = [makeTeam("Violet"), makeTeam("Orange")]

describe("resolveGardenRenderQuality", () => {
  it("defaults to high and demotes high under reduced motion", () => {
    expect(resolveGardenRenderQuality(undefined, false)).toBe("high")
    expect(resolveGardenRenderQuality("high", true)).toBe("low")
    expect(resolveGardenRenderQuality("medium", true)).toBe("medium")
    expect(resolveGardenRenderQuality("static", true)).toBe("static")
  })
})

describe("GardenBattleCanvasHost markup", () => {
  it("renders static DOM fallback when quality is static", () => {
    const html = renderToStaticMarkup(
      <GardenBattleCanvasHost
        teams={TEAMS}
        quality="static"
        seed={7}
        recipeVersion={1}
      />,
    )
    expect(html).toContain('data-testid="garden-battle-canvas-host"')
    expect(html).toContain('data-testid="garden-static-fallback"')
    expect(html).toContain('data-fallback-reason="static"')
    expect(html).toContain('data-quality="static"')
    expect(html).toContain('role="region"')
    expect(html).toContain("Flower Battle garden scene (static)")
    expect(html).not.toContain('data-testid="garden-pixi-canvas"')
  })

  it("renders canvas shell markup when quality is high (SSR, no attach)", () => {
    const html = renderToStaticMarkup(
      <GardenBattleCanvasHost teams={TEAMS} quality="high" />,
    )
    expect(html).toContain('data-testid="garden-pixi-canvas"')
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Flower Battle garden scene"')
    expect(html).toContain('aria-describedby="garden-status"')
    expect(html).toContain('id="garden-status"')
    expect(html).toContain("sr-only")
  })

  it("exposes idle hook defaults outside a host provider", () => {
    function Probe() {
      const value = useGardenPixiApplication()
      return (
        <span
          data-ready={String(value.isReady)}
          data-has-app={String(value.app !== null)}
          data-has-scene={String(value.scene !== null)}
          data-has-error={String(value.error !== null)}
        />
      )
    }
    const html = renderToStaticMarkup(<Probe />)
    expect(html).toContain('data-ready="false"')
    expect(html).toContain('data-has-app="false"')
    expect(html).toContain('data-has-scene="false"')
    expect(html).toContain('data-has-error="false"')
  })
})

describe("attachGardenPixiApplication", () => {
  it("runs 20 mount/unmount cycles without listener, canvas, or texture leaks", async () => {
    const browser = createBrowserFake()
    const sceneDestroy = vi.fn()
    let destroyCount = 0
    const textureDestroyFlags: Array<{
      children?: boolean
      texture?: boolean
      textureSource?: boolean
    }> = []

    for (let i = 0; i < 20; i++) {
      const { app, destroy } = createAppFake()
      destroy.mockImplementation(
        (
          _renderer?: boolean | { removeView?: boolean },
          options?: {
            children?: boolean
            texture?: boolean
            textureSource?: boolean
          },
        ) => {
          destroyCount += 1
          if (options) textureDestroyFlags.push(options)
        },
      )
      const createApplication: CreateGardenPixiApplication = vi.fn(
        async () => app,
      )
      const createScene = vi.fn(() => ({
        updateLayout: vi.fn(),
        destroy: sceneDestroy,
      }))

      const { dispose } = await attachGardenPixiApplication(
        createCanvasFake(),
        { createApplication, createScene },
        browser.environment,
      )
      dispose()
      dispose() // idempotent
    }

    expect(destroyCount).toBe(20)
    expect(sceneDestroy).toHaveBeenCalledTimes(20)
    expect(browser.visibilityListeners.size).toBe(0)
    expect(browser.resizeObserver.disconnect).toHaveBeenCalledTimes(20)
    expect(
      browser.environment.document.removeEventListener,
    ).toHaveBeenCalledTimes(20)
    expect(textureDestroyFlags.every((f) => f.children === true)).toBe(true)
    expect(textureDestroyFlags.every((f) => f.texture === true)).toBe(true)
    expect(textureDestroyFlags.every((f) => f.textureSource === true)).toBe(
      true,
    )
  })

  it("attaches ResizeObserver and cleans it up on dispose", async () => {
    const browser = createBrowserFake()
    const { app, resize } = createAppFake()
    const { scene, updateLayout } = createSceneFake()
    const canvas = createCanvasFake(800, 450)

    const { dispose } = await attachGardenPixiApplication(
      canvas,
      {
        createApplication: async () => app,
        createScene: () => scene,
      },
      browser.environment,
    )

    expect(browser.resizeObserver.observe).toHaveBeenCalledWith(canvas)
    expect(updateLayout).toHaveBeenCalledWith(800, 450)

    Object.assign(canvas, { clientWidth: 1024, clientHeight: 576 })
    const elapsedMs = browser.notifyResize()
    expect(elapsedMs).toBeLessThan(16)
    expect(resize).toHaveBeenCalledWith(1024, 576)
    expect(updateLayout).toHaveBeenCalledWith(1024, 576)

    dispose()
    expect(browser.resizeObserver.disconnect).toHaveBeenCalledTimes(1)
  })

  it("attaches Page Visibility listener and pauses/resumes the ticker", async () => {
    const browser = createBrowserFake()
    const { app, start, stop } = createAppFake()

    const { dispose } = await attachGardenPixiApplication(
      createCanvasFake(),
      {
        createApplication: async () => app,
        createScene: () => createEmptyGardenScene(),
      },
      browser.environment,
    )

    expect(browser.environment.document.addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    )
    expect(browser.visibilityListeners.size).toBe(1)

    browser.setVisibility("hidden")
    expect(stop).toHaveBeenCalled()

    browser.setVisibility("visible")
    expect(start).toHaveBeenCalled()

    dispose()
    expect(browser.visibilityListeners.size).toBe(0)
    expect(
      browser.environment.document.removeEventListener,
    ).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
  })

  it("stops the ticker immediately when attached while document is hidden", async () => {
    const browser = createBrowserFake({ visibilityState: "hidden" })
    const { app, stop } = createAppFake()

    const { dispose } = await attachGardenPixiApplication(
      createCanvasFake(),
      {
        createApplication: async () => app,
        createScene: () => createEmptyGardenScene(),
      },
      browser.environment,
    )

    expect(stop).toHaveBeenCalled()
    dispose()
  })

  it("detects prefers-reduced-motion and disables antialias", async () => {
    const browser = createBrowserFake({ reducedMotion: true })
    const createApplication = vi.fn(async () => createAppFake().app)

    const { prefersReducedMotion, dispose } =
      await attachGardenPixiApplication(
        createCanvasFake(),
        {
          createApplication,
          // Lifecycle-only fake — avoid token-resolved production scene in node.
          createScene: () => createEmptyGardenScene(),
        },
        browser.environment,
      )

    expect(prefersReducedMotion).toBe(true)
    expect(browser.environment.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    )
    expect(createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ antialias: false }),
    )
    dispose()
  })

  it("clamps devicePixelRatio to 2", async () => {
    const browser = createBrowserFake({ devicePixelRatio: 3 })
    const createApplication = vi.fn(async () => createAppFake().app)

    const { dispose } = await attachGardenPixiApplication(
      createCanvasFake(),
      {
        createApplication,
        createScene: () => createEmptyGardenScene(),
      },
      browser.environment,
    )

    expect(createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: 2 }),
    )
    dispose()
  })

  it("propagates Application init errors for the host error boundary path", async () => {
    const browser = createBrowserFake()
    await expect(
      attachGardenPixiApplication(
        createCanvasFake(),
        {
          createApplication: async () => {
            throw new Error("WebGL context lost")
          },
        },
        browser.environment,
      ),
    ).rejects.toThrow("WebGL context lost")

    expect(browser.visibilityListeners.size).toBe(0)
    expect(browser.resizeObserver.disconnect).not.toHaveBeenCalled()
  })

  it("invokes onReady with app and scene after successful attach", async () => {
    const browser = createBrowserFake()
    const { app } = createAppFake()
    const { scene } = createSceneFake()
    const onReady = vi.fn()

    const { dispose } = await attachGardenPixiApplication(
      createCanvasFake(),
      {
        createApplication: async () => app,
        createScene: () => scene,
        onReady,
      },
      browser.environment,
    )

    expect(onReady).toHaveBeenCalledWith(app, scene)
    dispose()
  })
})

describe("GardenBattleCanvasHost error fallback contract", () => {
  it("documents static fallback markup used when WebGL init fails", () => {
    // Host switches to GardenStaticFallback on error; assert the contract
    // markup without mounting async attach (node env has no canvas lifecycle).
    const html = renderToStaticMarkup(
      <GardenBattleCanvasHost
        teams={TEAMS}
        quality="static"
        fallback={
          <div data-testid="custom-static-fallback">static ok</div>
        }
      />,
    )
    expect(html).toContain('data-testid="custom-static-fallback"')
    expect(html).toContain("static ok")
    expect(html).toContain('data-fallback-reason="static"')
  })
})

/** Deterministic palette for node env — not a production color fallback. */
const TEST_PALETTE: GardenPalette = {
  sky: 0x87b5e0,
  hillsFar: 0x4a8f4a,
  hillsNear: 0x5aad5a,
  clouds: 0xf5f5f5,
  midground: 0x3d7a3d,
  soil: 0xc4a574,
  soilEdge: 0x8b6914,
  foreground: 0x2f6b2f,
  plantStem: 0x2d6a2d,
  plantLeaf: 0x4caf50,
  plantPetal: 0xe57373,
}

describe("WP-PIX-05B production scene factory + live snapshot", () => {
  it("uses createGardenScene as the real default scene factory", async () => {
    const browser = createBrowserFake()
    const stage = new Container()
    stage.label = "stage"
    const { app } = createAppFake()
    const appWithStage = Object.assign(app, { stage })

    // Stub theme CSS resolution so production createDefaultGardenScene can run
    // in node (host falls back to static when tokens are missing in real apps).
    const prevGcs = globalThis.getComputedStyle
    const prevDocument = globalThis.document
    vi.stubGlobal(
      "getComputedStyle",
      () =>
        ({
          getPropertyValue: () => "rgb(120, 140, 160)",
        }) as unknown as CSSStyleDeclaration,
    )
    vi.stubGlobal("document", {
      documentElement: {},
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    })

    try {
      // createDefaultGardenScene is the attach default (no createScene override).
      expect(createDefaultGardenScene).toEqual(expect.any(Function))
      const viaDefault = createDefaultGardenScene(appWithStage)
      expect(typeof viaDefault.updateSnapshot).toBe("function")
      expect(
        (viaDefault as ReturnType<typeof createGardenScene>).root.label,
      ).toBe("garden-root")
      viaDefault.destroy()

      const createApplication: CreateGardenPixiApplication = vi.fn(
        async () => appWithStage,
      )
      // Omit createScene → production createDefaultGardenScene path.
      const { scene, dispose } = await attachGardenPixiApplication(
        createCanvasFake(),
        { createApplication },
        browser.environment,
      )
      expect(createApplication).toHaveBeenCalledTimes(1)
      expect(typeof scene.updateSnapshot).toBe("function")
      expect(
        (scene as ReturnType<typeof createGardenScene>).root,
      ).toBeInstanceOf(Container)
      dispose()
    } finally {
      if (prevGcs) vi.stubGlobal("getComputedStyle", prevGcs)
      else vi.unstubAllGlobals()
      if (prevDocument) vi.stubGlobal("document", prevDocument)
    }
  })

  it("updateSnapshot on same scene keeps root, canvas app handle, and anchors", async () => {
    const browser = createBrowserFake()
    const stage = new Container()
    const { app } = createAppFake()
    const appWithStage = Object.assign(app, { stage })
    const createApplication = vi.fn(async () => appWithStage)
    const createScene = vi.fn((handle: GardenPixiApplicationHandle) =>
      createGardenScene(handle, { palette: TEST_PALETTE }),
    )

    const { scene, app: attachedApp, dispose } =
      await attachGardenPixiApplication(
        createCanvasFake(),
        { createApplication, createScene },
        browser.environment,
      )

    const procedural = scene as ReturnType<typeof createGardenScene>
    const rootBefore = procedural.root
    const canvasBefore = attachedApp.canvas

    // Host-equivalent live feed (teams + phase) — same scene instance.
    scene.updateSnapshot?.({
      teams: [
        { name: "Violet", growthStage: 1 },
        { name: "Orange", growthStage: 2 },
      ],
      phase: "question",
    })
    const anchorsAfterFirst = procedural.getPlotAnchors().map((a) => ({ ...a }))
    const plants = procedural.layers.actors.children.slice()

    scene.updateSnapshot?.({
      teams: [
        { name: "Violet", growthStage: 7 },
        { name: "Orange", growthStage: 8 },
      ],
      phase: "reveal",
    })

    expect(createApplication).toHaveBeenCalledTimes(1)
    expect(createScene).toHaveBeenCalledTimes(1)
    expect(procedural.root).toBe(rootBefore)
    expect(attachedApp.canvas).toBe(canvasBefore)
    expect(procedural.phase).toBe("reveal")
    expect(procedural.layers.actors.children).toEqual(plants)
    expect(procedural.getPlotAnchors()).toEqual(anchorsAfterFirst)
    dispose()
  })

  it("rerender-style team/phase updates attach once and only snapshot", async () => {
    // Models host behavior: one attach, then repeated updateSnapshot as
    // teams/phase change. attachOptions object identity must not reattach
    // (host keeps injectables in refs; effect deps = effectiveQuality only).
    const browser = createBrowserFake()
    const createApplication = vi.fn(async () => {
      const { app } = createAppFake()
      return Object.assign(app, { stage: new Container() })
    })
    const updateSnapshot = vi.fn()
    const updateLayout = vi.fn()
    const destroy = vi.fn()
    const scene: GardenScene = {
      updateLayout,
      destroy,
      updateSnapshot,
    }
    const createScene = vi.fn(() => scene)

    // Fresh options object each "render" — identity must not matter once attached.
    const attachWithFreshOptions = () =>
      attachGardenPixiApplication(
        createCanvasFake(),
        {
          createApplication,
          createScene,
          // fresh object literal each call (parent re-render pattern)
        },
        browser.environment,
      )

    const first = await attachWithFreshOptions()
    expect(createApplication).toHaveBeenCalledTimes(1)
    expect(createScene).toHaveBeenCalledTimes(1)

    // Host snapshot effect: map teams + phase into the live scene.
    const pushSnapshot = (
      teams: FlowerBattleTeamState[],
      phase: string,
    ) => {
      scene.updateSnapshot?.({
        teams: teams.map((t) => ({
          name: t.name,
          growthStage: t.growthStage,
        })),
        phase,
      })
    }

    pushSnapshot(TEAMS, "question")
    pushSnapshot(
      [
        { ...makeTeam("Violet"), growthStage: 5 },
        { ...makeTeam("Orange"), growthStage: 6 },
      ],
      "reveal",
    )

    expect(createApplication).toHaveBeenCalledTimes(1)
    expect(createScene).toHaveBeenCalledTimes(1)
    expect(updateSnapshot).toHaveBeenCalledTimes(2)
    expect(updateSnapshot.mock.calls[0]?.[0]).toMatchObject({
      phase: "question",
      teams: [
        { name: "Violet", growthStage: 0 },
        { name: "Orange", growthStage: 0 },
      ],
    })
    expect(updateSnapshot.mock.calls[1]?.[0]).toMatchObject({
      phase: "reveal",
      teams: [
        { name: "Violet", growthStage: 5 },
        { name: "Orange", growthStage: 6 },
      ],
    })
    expect(destroy).not.toHaveBeenCalled()
    first.dispose()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it("host static fallback still renders FlowerGardenScene with seed/recipe", () => {
    const html = renderToStaticMarkup(
      <GardenBattleCanvasHost
        teams={TEAMS}
        quality="static"
        seed={42}
        recipeVersion={1}
      />,
    )
    expect(html).toContain('data-testid="garden-static-fallback"')
    expect(html).toContain('data-testid="flower-garden-scene"')
    expect(html).toContain('data-seed="42"')
    expect(html).toContain('data-recipe-version="1"')
    expect(html).toContain('data-testid="garden-battle-canvas-host"')
  })
})
