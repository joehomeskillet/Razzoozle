/**
 * WP-02 lifecycle tests for GardenBattleCanvasHost.
 * Follows ParticleCanvas attach-fake pattern (node env, no jsdom/WebGL).
 */

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  type GardenBattleCanvasHostInternalProps,
} from "../GardenBattleCanvasHost"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"
import type {
  CreateGardenPixiApplication,
  GardenPixiApplicationHandle,
  GardenScene,
} from "../garden-pixi.types"
import {
  createEmptyGardenScene,
  GARDEN_CANVAS_BACKGROUND,
} from "../garden-pixi.types"
import { createGardenScene } from "../rendering/GardenScene"
import type { GardenPalette } from "../rendering/gardenPalette"
import {
  ThemeTokenColorError,
  THEME_TOKEN_COLOR_ERROR,
} from "../rendering/resolveThemeColor"

/** Lifecycle-only numeric clear color — not a production hex fallback. */
const TEST_CANVAS_BACKGROUND = 0x112233

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

// --- Minimal DOM shim for createRoot in the node env (same proven pattern as
// TargetTeamVote.test.tsx / useExperienceTimeline.test.ts) -------------------

type DomElement = {
  nodeType: number
  nodeName: string
  tagName: string
  parentNode: DomElement | null
  ownerDocument: DomDocument
  children: unknown[]
  clientWidth?: number
  clientHeight?: number
  className: string
  appendChild: (child: unknown) => unknown
  removeChild: (child: unknown) => unknown
  addEventListener: (event: string, listener: () => void) => void
  removeEventListener: (event: string, listener: () => void) => void
  setAttribute: (name: string, value: string) => void
  getAttribute: (name: string) => string | null
  removeAttribute: (name: string) => void
  hasAttribute: (name: string) => boolean
  remove: () => void
}

type DomDocument = {
  visibilityState: string
  activeElement: DomElement | null
  body: DomElement
  defaultView: DomWindow
  createElement: (tag: string) => DomElement
  addEventListener: (event: string, listener: () => void) => void
  removeEventListener: (event: string, listener: () => void) => void
}

type DomWindow = {
  document: DomDocument
  HTMLIFrameElement: new () => object
  addEventListener: (event: string, listener: () => void) => void
  removeEventListener: (event: string, listener: () => void) => void
}

function createDomDocument(): DomDocument {
  const eventListeners = new Map<string, Set<() => void>>()
  const win: DomWindow = {
    document: null as unknown as DomDocument,
    HTMLIFrameElement: class HTMLIFrameElement {
      readonly tagName = "IFRAME"
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const doc: DomDocument = {
    visibilityState: "visible",
    activeElement: null,
    body: null as unknown as DomElement,
    defaultView: win,
    createElement: (tag: string) => createDomElement(tag, doc),
    addEventListener(event: string, listener: () => void) {
      const listeners = eventListeners.get(event) ?? new Set<() => void>()
      listeners.add(listener)
      eventListeners.set(event, listeners)
    },
    removeEventListener(event: string, listener: () => void) {
      eventListeners.get(event)?.delete(listener)
    },
  }
  win.document = doc
  doc.body = createDomElement("body", doc)
  return doc
}

function createDomElement(tag: string, ownerDocument: DomDocument): DomElement {
  const children: unknown[] = []
  const eventListeners = new Map<string, Set<() => void>>()
  const attributes = new Map<string, string>()
  const element: DomElement = {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    tagName: tag.toUpperCase(),
    parentNode: null,
    ownerDocument,
    children,
    className: "",
    appendChild(child: unknown) {
      if (
        child &&
        typeof child === "object" &&
        "parentNode" in child &&
        typeof child.parentNode !== "undefined"
      ) {
        ;(child as DomElement).parentNode = element
      }
      children.push(child)
      return child
    },
    removeChild(child: unknown) {
      const index = children.indexOf(child)
      if (index >= 0) {
        children.splice(index, 1)
      }
      return child
    },
    addEventListener(event: string, listener: () => void) {
      const listeners = eventListeners.get(event) ?? new Set<() => void>()
      listeners.add(listener)
      eventListeners.set(event, listeners)
    },
    removeEventListener(event: string, listener: () => void) {
      eventListeners.get(event)?.delete(listener)
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value)
    },
    getAttribute(name: string) {
      return attributes.get(name) ?? null
    },
    removeAttribute(name: string) {
      attributes.delete(name)
    },
    hasAttribute(name: string) {
      return attributes.has(name)
    },
    remove() {
      const parent = element.parentNode as DomElement | null
      parent?.removeChild(element)
    },
  }
  if (tag.toLowerCase() === "canvas") {
    element.clientWidth = 640
    element.clientHeight = 360
  }
  return element
}

async function flushAct(run?: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    await run?.()
  })
  await act(async () => {
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
  })
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
      let iterationDestroyCount = 0
      const iterationTextureDestroyFlags: typeof textureDestroyFlags = []
      destroy.mockImplementation(
        (
          _renderer?: boolean | { removeView?: boolean },
          options?: {
            children?: boolean
            texture?: boolean
            textureSource?: boolean
          },
        ) => {
          iterationDestroyCount += 1
          if (options) iterationTextureDestroyFlags.push(options)
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
        {
          createApplication,
          createScene,
          background: TEST_CANVAS_BACKGROUND,
        },
        browser.environment,
      )
      dispose()
      dispose() // idempotent
      destroyCount += iterationDestroyCount
      textureDestroyFlags.push(...iterationTextureDestroyFlags)
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
        background: TEST_CANVAS_BACKGROUND,
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
        background: TEST_CANVAS_BACKGROUND,
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
        background: TEST_CANVAS_BACKGROUND,
      },
      browser.environment,
    )

    expect(stop).toHaveBeenCalled()
    dispose()
  })

  it("detects prefers-reduced-motion and disables antialias", async () => {
    const browser = createBrowserFake({ reducedMotion: true })
    const createApplication = vi.fn(async () => createAppFake().app)

    const { prefersReducedMotion, dispose } = await attachGardenPixiApplication(
      createCanvasFake(),
      {
        createApplication,
        // Lifecycle-only fake — avoid token-resolved production scene in node.
        createScene: () => createEmptyGardenScene(),
        background: TEST_CANVAS_BACKGROUND,
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
        background: TEST_CANVAS_BACKGROUND,
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
          background: TEST_CANVAS_BACKGROUND,
        },
        browser.environment,
      ),
    ).rejects.toThrow("WebGL context lost")

    expect(browser.visibilityListeners.size).toBe(0)
    expect(browser.resizeObserver.disconnect).not.toHaveBeenCalled()
  })

  it("cleans up the initialized app without masking a scene creation failure", async () => {
    const browser = createBrowserFake()
    const { app, destroy } = createAppFake()
    const sceneError = new Error("Garden scene creation failed")
    destroy.mockImplementation(() => {
      throw new Error("Application destroy failed")
    })

    await expect(
      attachGardenPixiApplication(
        createCanvasFake(),
        {
          createApplication: async () => app,
          createScene: () => {
            throw sceneError
          },
          background: TEST_CANVAS_BACKGROUND,
        },
        browser.environment,
      ),
    ).rejects.toBe(sceneError)

    expect(destroy).toHaveBeenCalledTimes(1)
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
        background: TEST_CANVAS_BACKGROUND,
      },
      browser.environment,
    )

    expect(onReady).toHaveBeenCalledWith(app, scene)
    dispose()
  })
})

describe("garden canvas background token", () => {
  it("defaults to GARDEN_CANVAS_BACKGROUND token resolved before Pixi init", async () => {
    expect(GARDEN_CANVAS_BACKGROUND).toBe("--surface-2")

    const browser = createBrowserFake()
    const createApplication = vi.fn(async () => createAppFake().app)
    const prevGcs = globalThis.getComputedStyle
    const prevDocument = globalThis.document

    vi.stubGlobal(
      "getComputedStyle",
      () =>
        ({
          getPropertyValue: (prop: string) => {
            expect(prop).toBe("--surface-2")
            return "#f4f1ea"
          },
        }) as unknown as CSSStyleDeclaration,
    )
    vi.stubGlobal("document", {
      documentElement: {},
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    })

    try {
      const { dispose } = await attachGardenPixiApplication(
        createCanvasFake(),
        {
          createApplication,
          createScene: () => createEmptyGardenScene(),
        },
        browser.environment,
      )

      expect(createApplication).toHaveBeenCalledWith(
        expect.objectContaining({ background: 0xf4f1ea }),
      )
      dispose()
    } finally {
      if (prevGcs) vi.stubGlobal("getComputedStyle", prevGcs)
      if (prevDocument) vi.stubGlobal("document", prevDocument)
      else vi.unstubAllGlobals()
    }
  })

  it("explicit numeric options.background bypasses token lookup", async () => {
    const browser = createBrowserFake()
    const createApplication = vi.fn(async () => createAppFake().app)
    const getPropertyValue = vi.fn(() => "#f4f1ea")

    vi.stubGlobal(
      "getComputedStyle",
      () =>
        ({
          getPropertyValue,
        }) as unknown as CSSStyleDeclaration,
    )
    vi.stubGlobal("document", {
      documentElement: {},
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    })

    try {
      const override = 0xdeadbe
      const { dispose } = await attachGardenPixiApplication(
        createCanvasFake(),
        {
          createApplication,
          createScene: () => createEmptyGardenScene(),
          background: override,
        },
        browser.environment,
      )

      expect(createApplication).toHaveBeenCalledWith(
        expect.objectContaining({ background: override }),
      )
      expect(getPropertyValue).not.toHaveBeenCalled()
      dispose()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("unresolved token throws ThemeTokenColorError with no numeric fallback", async () => {
    const browser = createBrowserFake()
    const createApplication = vi.fn(async () => createAppFake().app)

    // No getComputedStyle / document → controlled theme error before init.
    vi.stubGlobal("getComputedStyle", undefined)
    vi.stubGlobal("document", undefined)

    try {
      await expect(
        attachGardenPixiApplication(
          createCanvasFake(),
          {
            createApplication,
            createScene: () => createEmptyGardenScene(),
          },
          browser.environment,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ThemeTokenColorError)
        const e = err as ThemeTokenColorError
        expect(e.code).toBe(THEME_TOKEN_COLOR_ERROR)
        expect(e.token).toBe(GARDEN_CANVAS_BACKGROUND)
        expect(e.message).toMatch(/unresolved|unavailable|no element/i)
        return true
      })
      expect(createApplication).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
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
        fallback={<div data-testid="custom-static-fallback">static ok</div>}
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

    const {
      scene,
      app: attachedApp,
      dispose,
    } = await attachGardenPixiApplication(
      createCanvasFake(),
      {
        createApplication,
        createScene,
        background: TEST_CANVAS_BACKGROUND,
      },
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

  describe("mounted host rerender", () => {
    let domDocument: DomDocument

    function findDomCanvas(root: DomElement): DomElement {
      if (root.tagName === "CANVAS") return root
      for (const child of root.children) {
        if (child && typeof child === "object" && "tagName" in child) {
          const found = findDomCanvas(child as DomElement)
          if (found) return found
        }
      }
      throw new Error("canvas element not found in DOM shim")
    }

    beforeEach(() => {
      const browser = createBrowserFake()
      domDocument = createDomDocument()
      vi.stubGlobal("document", domDocument)
      vi.stubGlobal("window", {
        ...domDocument.defaultView,
        matchMedia: browser.environment.matchMedia,
        devicePixelRatio: browser.environment.devicePixelRatio,
      })
      vi.stubGlobal(
        "HTMLElement",
        class HTMLElement {
          readonly tagName = "HTMLElement"
        },
      )
      vi.stubGlobal(
        "HTMLDivElement",
        class HTMLDivElement {
          readonly tagName = "DIV"
        },
      )
      vi.stubGlobal(
        "HTMLCanvasElement",
        class HTMLCanvasElement {
          readonly tagName = "CANVAS"
        },
      )
      vi.stubGlobal(
        "Node",
        class Node {
          readonly nodeType = 1
        },
      )
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("mounted rerender with fresh teams/phase/options/env identities attaches once and snapshots only", async () => {
      const browser = createBrowserFake()
      const updateSnapshot = vi.fn()
      const updateLayout = vi.fn()
      const sceneDestroy = vi.fn()
      const scene: GardenScene = {
        updateLayout,
        destroy: sceneDestroy,
        updateSnapshot,
      }
      const createScene = vi.fn(() => scene)
      let attachedApp: GardenPixiApplicationHandle | undefined
      const createApplication = vi.fn(async () => {
        const { app } = createAppFake()
        attachedApp = app
        return Object.assign(app, { stage: new Container() })
      })

      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)

      let props: GardenBattleCanvasHostInternalProps = {
        teams: TEAMS.map((team) => ({ ...team })),
        quality: "high",
        phase: "question",
        attachOptions: {
          createApplication,
          createScene,
          background: TEST_CANVAS_BACKGROUND,
        },
        environment: { ...browser.environment },
      }

      await flushAct(() => {
        root.render(createElement(GardenBattleCanvasHost, props))
      })

      const canvasBefore = findDomCanvas(container)
      const appBefore = attachedApp
      const sceneBefore = scene

      expect(createApplication).toHaveBeenCalledTimes(1)
      expect(createScene).toHaveBeenCalledTimes(1)
      expect(updateSnapshot).toHaveBeenCalledTimes(1)
      expect(updateSnapshot.mock.calls[0]?.[0]).toMatchObject({
        phase: "question",
        teams: [
          { name: "Violet", growthStage: 0 },
          { name: "Orange", growthStage: 0 },
        ],
      })
      expect(appBefore?.destroy).not.toHaveBeenCalled()
      expect(sceneDestroy).not.toHaveBeenCalled()

      props = {
        teams: [
          { ...makeTeam("Violet"), growthStage: 5 },
          { ...makeTeam("Orange"), growthStage: 6 },
        ],
        quality: "high",
        phase: "reveal",
        attachOptions: {
          createApplication,
          createScene,
          background: TEST_CANVAS_BACKGROUND,
        },
        environment: { ...browser.environment },
      }

      await flushAct(() => {
        root.render(createElement(GardenBattleCanvasHost, props))
      })

      expect(createApplication).toHaveBeenCalledTimes(1)
      expect(createScene).toHaveBeenCalledTimes(1)
      expect(updateSnapshot).toHaveBeenCalledTimes(2)
      expect(updateSnapshot.mock.calls[1]?.[0]).toMatchObject({
        phase: "reveal",
        teams: [
          { name: "Violet", growthStage: 5 },
          { name: "Orange", growthStage: 6 },
        ],
      })
      expect(findDomCanvas(container)).toBe(canvasBefore)
      expect(attachedApp).toBe(appBefore)
      expect(scene).toBe(sceneBefore)
      expect(appBefore?.destroy).not.toHaveBeenCalled()
      expect(sceneDestroy).not.toHaveBeenCalled()

      await flushAct(() => {
        root.unmount()
      })

      expect(appBefore?.destroy).toHaveBeenCalledTimes(1)
      expect(sceneDestroy).toHaveBeenCalledTimes(1)
    })
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
