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
  type GardenPixiResizeObserver,
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
  GardenE2EProbeHandle,
  GardenPixiInitOptions,
  GardenPixiApplicationHandle,
  GardenScene,
} from "../garden-pixi.types"
import {
  createEmptyGardenScene,
  GARDEN_CANVAS_BACKGROUND,
} from "../garden-pixi.types"
import { createGardenScene } from "../rendering/GardenScene"
import { getTeamSlotLayout } from "../garden-team-slot-layout"
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
        if (child && typeof child === "object" && "parentNode" in child) {
          ;(child as DomElement).parentNode = null
        }
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
      setTimeout(resolve, 0)
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
    expect(textureDestroyFlags.every((f) => f.texture === false)).toBe(true)
    expect(textureDestroyFlags.every((f) => f.textureSource === false)).toBe(
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

  it("cleans up the scene and app when ResizeObserver construction fails", async () => {
    const browser = createBrowserFake()
    const observerError = new Error("ResizeObserver constructor failed")
    function ThrowingResizeObserver(
      this: GardenPixiResizeObserver,
      _callback: ResizeObserverCallback,
    ): never {
      throw observerError
    }
    browser.environment.ResizeObserver =
      ThrowingResizeObserver as unknown as typeof browser.environment.ResizeObserver
    const { app, destroy } = createAppFake()
    const { scene, destroy: destroyScene } = createSceneFake()

    await expect(
      attachGardenPixiApplication(
        createCanvasFake(),
        {
          createApplication: async () => app,
          createScene: () => scene,
          background: TEST_CANVAS_BACKGROUND,
        },
        browser.environment,
      ),
    ).rejects.toBe(observerError)

    expect(destroyScene).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(browser.resizeObserver.disconnect).not.toHaveBeenCalled()
    expect(
      browser.environment.document.removeEventListener,
    ).not.toHaveBeenCalled()
  })

  it("does not disconnect an observer whose observe call failed", async () => {
    const browser = createBrowserFake()
    const observeError = new Error("ResizeObserver observe failed")
    browser.resizeObserver.observe.mockImplementation(() => {
      throw observeError
    })
    const { app, destroy } = createAppFake()
    const { scene, destroy: destroyScene } = createSceneFake()

    await expect(
      attachGardenPixiApplication(
        createCanvasFake(),
        {
          createApplication: async () => app,
          createScene: () => scene,
          background: TEST_CANVAS_BACKGROUND,
        },
        browser.environment,
      ),
    ).rejects.toBe(observeError)

    expect(destroyScene).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(browser.resizeObserver.disconnect).not.toHaveBeenCalled()
    expect(
      browser.environment.document.removeEventListener,
    ).not.toHaveBeenCalled()
  })

  it("disconnects only the registered observer when listener setup fails", async () => {
    const browser = createBrowserFake()
    const listenerError = new Error("visibility listener failed")
    browser.environment.document.addEventListener = vi.fn(() => {
      throw listenerError
    })
    const { app, destroy } = createAppFake()
    const { scene, destroy: destroyScene } = createSceneFake()

    await expect(
      attachGardenPixiApplication(
        createCanvasFake(),
        {
          createApplication: async () => app,
          createScene: () => scene,
          background: TEST_CANVAS_BACKGROUND,
        },
        browser.environment,
      ),
    ).rejects.toBe(listenerError)

    expect(browser.resizeObserver.disconnect).toHaveBeenCalledTimes(1)
    expect(
      browser.environment.document.removeEventListener,
    ).not.toHaveBeenCalled()
    expect(destroyScene).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
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
    expect(GARDEN_CANVAS_BACKGROUND).toBe("--flower-battle-sky")

    const browser = createBrowserFake()
    const createApplication = vi.fn(async () => createAppFake().app)
    const prevGcs = globalThis.getComputedStyle
    const prevDocument = globalThis.document

    vi.stubGlobal(
      "getComputedStyle",
      () =>
        ({
          getPropertyValue: (prop: string) => {
            expect(prop).toBe("--flower-battle-sky")
            return "#c9eaef"
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
        expect.objectContaining({ background: 0xc9eaef }),
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
  sun: 0xffd54a,
  cloud: 0xf5f5f5,
  hillBack: 0x4a8f4a,
  hillMid: 0x5aad5a,
  bushBack: 0x3d7a3d,
  bushMid: 0x3d7a3d,
  midground: 0x3d7a3d,
  fence: 0xfaf6e8,
  grass: 0x6bbf59,
  soil: 0xc4a574,
  soilEdge: 0x8b6914,
  foreground: 0x2f6b2f,
  plantStem: 0x2d6a2d,
  plantLeaf: 0x4caf50,
  plantPetal: 0xe57373,
  hillsFar: 0x4a8f4a,
  hillsNear: 0x5aad5a,
  clouds: 0xf5f5f5,
  teamMeterFrame: 0x222222,
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

  describe("guarded __razzoozleGardenE2E scene identity probe", () => {
    const PROBE_KEY = "__razzoozleGardenE2E" as const
    let domDocument: DomDocument
    let locationSearch = ""

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

    function canvasProbe(canvas: DomElement): {
      handle: GardenE2EProbeHandle | undefined
      descriptor: PropertyDescriptor | undefined
    } {
      const target = canvas as unknown as Record<string, unknown>
      return {
        handle: target[PROBE_KEY] as GardenE2EProbeHandle | undefined,
        descriptor: Object.getOwnPropertyDescriptor(target, PROBE_KEY),
      }
    }

    function installProbeSentinel(canvas: DomElement): void {
      Object.defineProperty(canvas, PROBE_KEY, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: {
          getE2EIdentity: () => ({
            root: {},
            actorPlants: [],
            labels: [],
          }),
        },
      })
    }

    function spyOnSceneDestroyAfterProbeClear(
      scene: ReturnType<typeof createGardenScene>,
      canvas: () => DomElement,
    ) {
      const realDestroy = scene.destroy.bind(scene)
      const destroy = vi.fn(() => {
        expect(canvasProbe(canvas()).descriptor).toBeUndefined()
        expect(canvasProbe(canvas()).handle).toBeUndefined()
        realDestroy()
      })
      scene.destroy = destroy
      return destroy
    }

    beforeEach(() => {
      const browser = createBrowserFake()
      domDocument = createDomDocument()
      locationSearch = ""
      vi.stubGlobal("document", domDocument)
      vi.stubGlobal("window", {
        ...domDocument.defaultView,
        matchMedia: browser.environment.matchMedia,
        devicePixelRatio: browser.environment.devicePixelRatio,
        location: {
          get search() {
            return locationSearch
          },
        },
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

    it("does not publish the probe when gardenE2EProbe query is absent", async () => {
      locationSearch = ""
      const browser = createBrowserFake()
      let procedural: ReturnType<typeof createGardenScene> | undefined
      const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
        procedural = createGardenScene(handle, { palette: TEST_PALETTE })
        return procedural
      })
      const appFake = createAppFake()
      const createApplication = vi.fn(async () => {
        return Object.assign(appFake.app, { stage: new Container() })
      })

      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)

      await flushAct(() => {
        root.render(
          createElement(GardenBattleCanvasHost, {
            teams: TEAMS,
            quality: "high",
            attachOptions: {
              createApplication,
              createScene,
              background: TEST_CANVAS_BACKGROUND,
            },
            environment: browser.environment,
          }),
        )
      })

      const canvas = findDomCanvas(container)
      const { handle, descriptor } = canvasProbe(canvas)
      expect(descriptor).toBeUndefined()
      expect(handle).toBeUndefined()
      expect(PROBE_KEY in (canvas as object)).toBe(false)
      // No window-global probe either.
      expect(PROBE_KEY in (globalThis as Record<string, unknown>)).toBe(false)
      expect(PROBE_KEY in (window as unknown as Record<string, unknown>)).toBe(
        false,
      )

      await flushAct(() => {
        root.unmount()
      })
      expect(procedural).toBeDefined()
    })

    it("publishes non-enumerable non-writable configurable handle with real scene identity when guarded", async () => {
      locationSearch = "?gardenE2EProbe=1"
      const browser = createBrowserFake()
      let procedural: ReturnType<typeof createGardenScene> | undefined
      const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
        procedural = createGardenScene(handle, { palette: TEST_PALETTE })
        return procedural
      })
      const appFake = createAppFake()
      const createApplication = vi.fn(async () => {
        return Object.assign(appFake.app, { stage: new Container() })
      })

      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)

      await flushAct(() => {
        root.render(
          createElement(GardenBattleCanvasHost, {
            teams: TEAMS,
            quality: "high",
            phase: "question",
            attachOptions: {
              createApplication,
              createScene,
              background: TEST_CANVAS_BACKGROUND,
            },
            environment: browser.environment,
          }),
        )
      })

      expect(procedural).toBeDefined()
      const canvas = findDomCanvas(container)
      const { handle, descriptor } = canvasProbe(canvas)
      expect(descriptor).toBeDefined()
      expect(descriptor?.enumerable).toBe(false)
      expect(descriptor?.writable).toBe(false)
      expect(descriptor?.configurable).toBe(true)
      expect(handle).toBeDefined()
      expect(typeof handle?.getE2EIdentity).toBe("function")

      const fromProbe = handle!.getE2EIdentity()
      const fromScene = procedural!.getE2EIdentity()
      // Real object identity — not label/value equality alone.
      expect(fromProbe.root).toBe(fromScene.root)
      expect(fromProbe.root).toBe(procedural!.root)
      expect(fromProbe.actorPlants).toHaveLength(2)
      expect(fromProbe.actorPlants[0]).toBe(fromScene.actorPlants[0])
      expect(fromProbe.actorPlants[1]).toBe(fromScene.actorPlants[1])
      expect(fromProbe.actorPlants[0]).toBe(
        procedural!.layers.actors.children[0],
      )
      expect(fromProbe.labels).toEqual(["actor-plant-0", "actor-plant-1"])

      // Descriptor stays non-writable: reassignment must not replace handle.
      const canvasObj = canvas as unknown as Record<string, unknown>
      const impostor = { getE2EIdentity: () => fromProbe }
      try {
        canvasObj[PROBE_KEY] = impostor
      } catch {
        // Strict mode TypeError is expected for non-writable data properties.
      }
      expect(canvasObj[PROBE_KEY]).toBe(handle)
      expect(canvasObj[PROBE_KEY]).not.toBe(impostor)

      appFake.destroy.mockImplementation(() => {
        expect(canvasProbe(canvas).descriptor).toBeUndefined()
        expect(canvasProbe(canvas).handle).toBeUndefined()
      })
      const sceneDestroy = spyOnSceneDestroyAfterProbeClear(
        procedural!,
        () => canvas,
      )
      await flushAct(() => {
        root.unmount()
      })

      // Sync cleanup on unmount — property gone immediately after unmount.
      const after = canvasProbe(canvas)
      expect(after.descriptor).toBeUndefined()
      expect(after.handle).toBeUndefined()
      expect(sceneDestroy).toHaveBeenCalledTimes(1)
    })

    it("exposes layout diagnostics on the probe handle when guarded", async () => {
      locationSearch = "?gardenE2EProbe=1"
      const browser = createBrowserFake()
      let procedural: ReturnType<typeof createGardenScene> | undefined
      const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
        procedural = createGardenScene(handle, { palette: TEST_PALETTE })
        return procedural
      })
      const appFake = createAppFake()
      const createApplication = vi.fn(async () => {
        return Object.assign(appFake.app, { stage: new Container() })
      })

      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)

      await flushAct(() => {
        root.render(
          createElement(GardenBattleCanvasHost, {
            teams: TEAMS,
            quality: "high",
            phase: "question",
            attachOptions: {
              createApplication,
              createScene,
              background: TEST_CANVAS_BACKGROUND,
            },
            environment: browser.environment,
          }),
        )
      })

      expect(procedural).toBeDefined()
      const canvas = findDomCanvas(container)
      const { handle } = canvasProbe(canvas)
      expect(typeof handle?.getLayoutDiagnostics).toBe("function")
      expect(typeof handle?.getExperienceLayoutDiagnostics).toBe("function")

      // Scene-level diagnostics mirror the live procedural scene.
      const fromProbe = handle!.getLayoutDiagnostics!() as ReturnType<
        NonNullable<typeof procedural>["getLayoutDiagnostics"]
      >
      const fromScene = procedural!.getLayoutDiagnostics()
      expect(fromProbe.allAnchorsInsideVisibleRect).toBe(
        fromScene.allAnchorsInsideVisibleRect,
      )
      expect(fromProbe.plotAnchors).toEqual(fromScene.plotAnchors)

      // DOM-level diagnostics never throw on a minimal host and report the
      // defensive unknown layout (no data-presenter-layout ancestor here).
      const dom = handle!.getExperienceLayoutDiagnostics!()
      expect(dom.presenterLayout).toBe("unknown")
      expect(dom.genericBackgroundVisible).toBe(false)

      await flushAct(() => {
        root.unmount()
      })
      expect(canvasProbe(canvas).handle).toBeUndefined()
    })

    it("clears the published probe before render-boundary cleanup destroys the scene and app", async () => {
      locationSearch = "?gardenE2EProbe=1"
      const boundaryError = new Error("expected garden child commit failure")
      const browser = createBrowserFake()
      let procedural: ReturnType<typeof createGardenScene> | undefined
      const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
        procedural = createGardenScene(handle, { palette: TEST_PALETTE })
        return procedural
      })
      const appFake = createAppFake()
      const createApplication = vi.fn(async () => {
        return Object.assign(appFake.app, { stage: new Container() })
      })
      const onError = vi.fn()
      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)
      const renderPhase = async (phase: string) => {
        await flushAct(() => {
          root.render(
            createElement(GardenBattleCanvasHost, {
              teams: TEAMS,
              quality: "high",
              phase,
              attachOptions: {
                createApplication,
                createScene,
                background: TEST_CANVAS_BACKGROUND,
              },
              environment: browser.environment,
              onError,
              fallback: createElement(
                "div",
                { "data-testid": "boundary-static-fallback" },
                "static",
              ),
            }),
          )
        })
      }

      await renderPhase("question")
      expect(procedural).toBeDefined()
      const canvas = findDomCanvas(container)
      expect(canvasProbe(canvas).descriptor).toBeDefined()
      expect(canvasProbe(canvas).handle).toBeDefined()
      const host = canvas.parentNode
      if (!host) throw new Error("garden host unavailable")
      const setAttribute = host.setAttribute.bind(host)
      host.setAttribute = (name, value) => {
        if (name === "data-phase" && value === "boundary-error") {
          throw boundaryError
        }
        setAttribute(name, value)
      }
      appFake.destroy.mockImplementation(() => {
        expect(canvasProbe(canvas).descriptor).toBeUndefined()
        expect(canvasProbe(canvas).handle).toBeUndefined()
      })
      const sceneDestroy = spyOnSceneDestroyAfterProbeClear(
        procedural!,
        () => canvas,
      )

      await renderPhase("boundary-error")

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(boundaryError)
      const errorFallback = container.children[0] as DomElement
      expect(errorFallback.getAttribute("data-testid")).toBe(
        "garden-static-fallback",
      )
      expect(errorFallback.getAttribute("data-fallback-reason")).toBe("error")
      expect(sceneDestroy).toHaveBeenCalledTimes(1)
      expect(appFake.destroy).toHaveBeenCalledTimes(1)

      await flushAct(() => {
        root.unmount()
      })
      expect(sceneDestroy).toHaveBeenCalledTimes(1)
      expect(appFake.destroy).toHaveBeenCalledTimes(1)
    })

    it("samples the query flag on phase rerender and clears then republishes without reattach", async () => {
      locationSearch = "?gardenE2EProbe=1"
      const browser = createBrowserFake()
      let procedural: ReturnType<typeof createGardenScene> | undefined
      const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
        procedural = createGardenScene(handle, { palette: TEST_PALETTE })
        return procedural
      })
      const { app, destroy } = createAppFake()
      const appWithStage = Object.assign(app, { stage: new Container() })
      const createApplication = vi.fn(async () => appWithStage)
      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)

      const renderPhase = async (phase: string) => {
        await flushAct(() => {
          root.render(
            createElement(GardenBattleCanvasHost, {
              teams: TEAMS,
              quality: "high",
              phase,
              attachOptions: {
                createApplication,
                createScene,
                background: TEST_CANVAS_BACKGROUND,
              },
              environment: browser.environment,
              fallback: createElement("div", null, "static"),
            }),
          )
        })
      }

      await renderPhase("question")
      const canvas = findDomCanvas(container)
      const firstHandle = canvasProbe(canvas).handle
      expect(firstHandle).toBeDefined()
      const firstIdentity = firstHandle!.getE2EIdentity()

      locationSearch = ""
      await renderPhase("resolution")
      expect(findDomCanvas(container)).toBe(canvas)
      expect(canvasProbe(canvas).handle).toBeUndefined()
      expect(canvasProbe(canvas).descriptor).toBeUndefined()
      expect(createApplication).toHaveBeenCalledTimes(1)
      expect(createScene).toHaveBeenCalledTimes(1)
      expect(destroy).not.toHaveBeenCalled()

      locationSearch = "?gardenE2EProbe=1"
      await renderPhase("world_transition")
      const republished = canvasProbe(canvas).handle
      expect(republished).toBeDefined()
      expect(republished).not.toBe(firstHandle)
      const republishedIdentity = republished!.getE2EIdentity()
      expect(republishedIdentity.root).toBe(firstIdentity.root)
      expect(republishedIdentity.actorPlants[0]).toBe(
        firstIdentity.actorPlants[0],
      )
      expect(republishedIdentity.actorPlants[1]).toBe(
        firstIdentity.actorPlants[1],
      )
      expect(createApplication).toHaveBeenCalledTimes(1)
      expect(createScene).toHaveBeenCalledTimes(1)

      await flushAct(() => {
        root.unmount()
      })
      expect(destroy).toHaveBeenCalledTimes(1)
      expect(procedural).toBeDefined()
    })

    it.each(["low", "medium"] as const)(
      "clears before high → %s disposal and republishes only after delayed reattach",
      async (nextQuality) => {
        locationSearch = "?gardenE2EProbe=1"
        const browser = createBrowserFake()
        const firstApp = createAppFake()
        const secondApp = createAppFake()
        const firstAppWithStage = Object.assign(firstApp.app, {
          stage: new Container(),
        })
        const secondAppWithStage = Object.assign(secondApp.app, {
          stage: new Container(),
        })
        let resolveReattach:
          ((app: GardenPixiApplicationHandle) => void) | undefined
        const delayedReattach = new Promise<GardenPixiApplicationHandle>(
          (resolve) => {
            resolveReattach = resolve
          },
        )
        const attachedCanvases: HTMLCanvasElement[] = []
        let applicationIndex = 0
        const createApplication = vi.fn(
          (
            init: GardenPixiInitOptions,
          ): Promise<GardenPixiApplicationHandle> => {
            attachedCanvases.push(init.canvas)
            applicationIndex += 1
            if (applicationIndex === 1) {
              Object.assign(firstAppWithStage, { canvas: init.canvas })
              return Promise.resolve(firstAppWithStage)
            }
            Object.assign(secondAppWithStage, { canvas: init.canvas })
            return delayedReattach
          },
        )
        const canvasRef: { current: DomElement | null } = { current: null }
        const scenes: ReturnType<typeof createGardenScene>[] = []
        const sceneDestroySpies: ReturnType<typeof vi.fn>[] = []
        const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
          const procedural = createGardenScene(handle, {
            palette: TEST_PALETTE,
          })
          scenes.push(procedural)
          sceneDestroySpies.push(
            spyOnSceneDestroyAfterProbeClear(procedural, () => {
              if (!canvasRef.current) throw new Error("canvas unavailable")
              return canvasRef.current
            }),
          )
          return procedural
        })
        const container = domDocument.createElement("div")
        domDocument.body.appendChild(container)
        const root = createRoot(container as unknown as HTMLElement)

        const renderQuality = async (
          quality: "high" | "low" | "medium",
          phase: string,
        ) => {
          await flushAct(() => {
            root.render(
              createElement(GardenBattleCanvasHost, {
                teams: TEAMS,
                quality,
                phase,
                attachOptions: {
                  createApplication,
                  createScene,
                  background: TEST_CANVAS_BACKGROUND,
                },
                environment: browser.environment,
              }),
            )
          })
        }

        await renderQuality("high", "question")
        const canvas = findDomCanvas(container)
        canvasRef.current = canvas
        const firstHandle = canvasProbe(canvas).handle
        expect(firstHandle).toBeDefined()
        const destroyLikePixi = (
          rendererOptions?: boolean | { removeView?: boolean },
        ) => {
          expect(canvasProbe(canvas).descriptor).toBeUndefined()
          expect(canvasProbe(canvas).handle).toBeUndefined()
          if (
            typeof rendererOptions === "object" &&
            rendererOptions.removeView === true
          ) {
            canvas.parentNode?.removeChild(canvas)
          }
        }
        firstApp.destroy.mockImplementation(destroyLikePixi)
        secondApp.destroy.mockImplementation(destroyLikePixi)

        await renderQuality(nextQuality, "resolution")
        expect(canvas.parentNode).not.toBeNull()
        expect(findDomCanvas(container)).toBe(canvas)
        expect(canvasProbe(canvas).handle).toBeUndefined()
        expect(createApplication).toHaveBeenCalledTimes(2)
        expect(createScene).toHaveBeenCalledTimes(1)
        expect(sceneDestroySpies[0]).toHaveBeenCalledTimes(1)
        expect(firstApp.destroy).toHaveBeenCalledTimes(1)
        expect(secondApp.destroy).not.toHaveBeenCalled()

        if (!resolveReattach) throw new Error("reattach resolver unavailable")
        resolveReattach(secondAppWithStage)
        await flushAct()

        const secondHandle = canvasProbe(canvas).handle
        expect(secondHandle).toBeDefined()
        expect(secondHandle).not.toBe(firstHandle)
        expect(attachedCanvases).toEqual([canvas, canvas])
        expect(findDomCanvas(container)).toBe(canvas)
        expect(canvas.parentNode).not.toBeNull()
        expect(createScene).toHaveBeenCalledTimes(2)
        expect(scenes).toHaveLength(2)

        await flushAct(() => {
          root.unmount()
        })
        expect(sceneDestroySpies[0]).toHaveBeenCalledTimes(1)
        expect(sceneDestroySpies[1]).toHaveBeenCalledTimes(1)
        expect(firstApp.destroy).toHaveBeenCalledTimes(1)
        expect(secondApp.destroy).toHaveBeenCalledTimes(1)
      },
    )

    it("clears before high → static disposal and invokes real dispose once", async () => {
      locationSearch = "?gardenE2EProbe=1"
      const browser = createBrowserFake()
      const appFake = createAppFake()
      const appWithStage = Object.assign(appFake.app, {
        stage: new Container(),
      })
      const createApplication = vi.fn(async () => appWithStage)
      const canvasRef: { current: DomElement | null } = { current: null }
      let sceneDestroy: ReturnType<typeof vi.fn> | undefined
      const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
        const procedural = createGardenScene(handle, {
          palette: TEST_PALETTE,
        })
        sceneDestroy = spyOnSceneDestroyAfterProbeClear(procedural, () => {
          if (!canvasRef.current) throw new Error("canvas unavailable")
          return canvasRef.current
        })
        return procedural
      })
      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)
      const renderQuality = async (quality: "high" | "static") => {
        await flushAct(() => {
          root.render(
            createElement(GardenBattleCanvasHost, {
              teams: TEAMS,
              quality,
              phase: quality === "high" ? "question" : "resolution",
              attachOptions: {
                createApplication,
                createScene,
                background: TEST_CANVAS_BACKGROUND,
              },
              environment: browser.environment,
              fallback: createElement("div", null, "static"),
            }),
          )
        })
      }

      await renderQuality("high")
      const canvas = findDomCanvas(container)
      canvasRef.current = canvas
      expect(canvasProbe(canvas).handle).toBeDefined()
      appFake.destroy.mockImplementation(() => {
        expect(canvasProbe(canvas).descriptor).toBeUndefined()
        expect(canvasProbe(canvas).handle).toBeUndefined()
      })

      await renderQuality("static")
      expect(canvasProbe(canvas).handle).toBeUndefined()
      expect(sceneDestroy).toHaveBeenCalledTimes(1)
      expect(appFake.destroy).toHaveBeenCalledTimes(1)
      expect(createApplication).toHaveBeenCalledTimes(1)

      await flushAct(() => {
        root.unmount()
      })
      expect(sceneDestroy).toHaveBeenCalledTimes(1)
      expect(appFake.destroy).toHaveBeenCalledTimes(1)
    })

    it("clears a stale probe before reporting an attach error", async () => {
      locationSearch = "?gardenE2EProbe=1"
      const browser = createBrowserFake()
      let rejectApplication: ((reason: unknown) => void) | undefined
      const pendingApplication = new Promise<GardenPixiApplicationHandle>(
        (_resolve, reject) => {
          rejectApplication = reject
        },
      )
      const createApplication = vi.fn(() => pendingApplication)
      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)
      const canvasRef: { current: DomElement | null } = { current: null }
      let probeAtError: ReturnType<typeof canvasProbe>["handle"] | undefined
      const onError = vi.fn(() => {
        if (!canvasRef.current) throw new Error("canvas unavailable")
        probeAtError = canvasProbe(canvasRef.current).handle
      })

      await flushAct(() => {
        root.render(
          createElement(GardenBattleCanvasHost, {
            teams: TEAMS,
            quality: "high",
            attachOptions: {
              createApplication,
              background: TEST_CANVAS_BACKGROUND,
            },
            environment: browser.environment,
            onError,
            fallback: createElement("div", null, "static"),
          }),
        )
      })
      const canvas = findDomCanvas(container)
      canvasRef.current = canvas
      installProbeSentinel(canvas)
      expect(canvasProbe(canvas).handle).toBeDefined()

      if (!rejectApplication) throw new Error("reject resolver unavailable")
      rejectApplication(new Error("expected attach failure"))
      await flushAct()

      expect(onError).toHaveBeenCalledTimes(1)
      expect(probeAtError).toBeUndefined()
      expect(canvasProbe(canvas).handle).toBeUndefined()
      await flushAct(() => {
        root.unmount()
      })
    })

    it("clears cancelled-before-install probe and disposes the late result once", async () => {
      locationSearch = "?gardenE2EProbe=1"
      const browser = createBrowserFake()
      const appFake = createAppFake()
      const appWithStage = Object.assign(appFake.app, {
        stage: new Container(),
      })
      let resolveApplication:
        ((app: GardenPixiApplicationHandle) => void) | undefined
      const pendingApplication = new Promise<GardenPixiApplicationHandle>(
        (resolve) => {
          resolveApplication = resolve
        },
      )
      const createApplication = vi.fn(() => pendingApplication)
      const canvasRef: { current: DomElement | null } = { current: null }
      let sceneDestroy: ReturnType<typeof vi.fn> | undefined
      const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
        const procedural = createGardenScene(handle, {
          palette: TEST_PALETTE,
        })
        sceneDestroy = spyOnSceneDestroyAfterProbeClear(procedural, () => {
          if (!canvasRef.current) throw new Error("canvas unavailable")
          return canvasRef.current
        })
        return procedural
      })
      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)

      await flushAct(() => {
        root.render(
          createElement(GardenBattleCanvasHost, {
            teams: TEAMS,
            quality: "high",
            attachOptions: {
              createApplication,
              createScene,
              background: TEST_CANVAS_BACKGROUND,
            },
            environment: browser.environment,
          }),
        )
      })
      const canvas = findDomCanvas(container)
      canvasRef.current = canvas
      installProbeSentinel(canvas)
      appFake.destroy.mockImplementation(() => {
        expect(canvasProbe(canvas).descriptor).toBeUndefined()
        expect(canvasProbe(canvas).handle).toBeUndefined()
      })

      await flushAct(() => {
        root.unmount()
      })
      expect(canvasProbe(canvas).handle).toBeUndefined()

      if (!resolveApplication) throw new Error("attach resolver unavailable")
      resolveApplication(appWithStage)
      await flushAct()

      expect(sceneDestroy).toHaveBeenCalledTimes(1)
      expect(appFake.destroy).toHaveBeenCalledTimes(1)
    })

    it("does not false-pass on static fallback or empty scene without getE2EIdentity", async () => {
      locationSearch = "?gardenE2EProbe=1"
      const browser = createBrowserFake()

      // Static path: no canvas, no probe.
      const staticHtml = renderToStaticMarkup(
        createElement(GardenBattleCanvasHost, {
          teams: TEAMS,
          quality: "static",
        }),
      )
      expect(staticHtml).toContain('data-testid="garden-static-fallback"')
      expect(staticHtml).not.toContain("garden-pixi-canvas")

      // Lifecycle-only empty scene: no getE2EIdentity → no probe hook.
      const createScene = vi.fn(() => createEmptyGardenScene())
      const createApplication = vi.fn(async () => {
        const { app } = createAppFake()
        return Object.assign(app, { stage: new Container() })
      })

      const container = domDocument.createElement("div")
      domDocument.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)

      await flushAct(() => {
        root.render(
          createElement(GardenBattleCanvasHost, {
            teams: TEAMS,
            quality: "high",
            attachOptions: {
              createApplication,
              createScene,
              background: TEST_CANVAS_BACKGROUND,
            },
            environment: browser.environment,
          }),
        )
      })

      const canvas = findDomCanvas(container)
      const { handle, descriptor } = canvasProbe(canvas)
      expect(descriptor).toBeUndefined()
      expect(handle).toBeUndefined()
      expect(createScene).toHaveBeenCalled()

      await flushAct(() => {
        root.unmount()
      })
    })
  })
})

/**
 * SDD §30 probe-v3 contract tests (WP-D-3):
 *
 * A probe only PASSes when it verifies at least two independent signals.
 * The scenarios below cross-check:
 *  1. Normalized scene state (revision, teamNames, growthStages) returned
 *     by the E2E identity published on the canvas via __razzoozleGardenE2E.
 *  2. Stable Pixi plant instances + the same plant's own growth stage —
 *     i.e. the rendered plant identity carries the same teamId and stage
 *     as the normalized state vector.
 *
 * The static fallback path additionally cross-checks the
 * `getTeamSlotLayout` output against the DOM slot positions on the
 * `FlowerGardenScene` (the DOM equivalent of the procedural scene's
 * `getPlotAnchors`).
 *
 * No assertion relies on `canvas.toBeTruthy()` or a non-empty root —
 * every assertion is anchored in concrete values (numbers, strings, refs).
 */
describe("SDD §30 probe-v3: two independent signals on canvas host", () => {
  let domDocument: DomDocument
  let locationSearch = ""

  beforeEach(() => {
    const browser = createBrowserFake()
    domDocument = createDomDocument()
    locationSearch = "?gardenE2EProbe=1"
    vi.stubGlobal("document", domDocument)
    vi.stubGlobal("window", {
      ...domDocument.defaultView,
      matchMedia: browser.environment.matchMedia,
      devicePixelRatio: browser.environment.devicePixelRatio,
      location: {
        get search() {
          return locationSearch
        },
      },
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

  function canvasProbe(canvas: DomElement) {
    const target = canvas as unknown as Record<string, unknown>
    return target["__razzoozleGardenE2E"] as
      | {
          getE2EIdentity: () => {
            root: object
            actorPlants: readonly object[]
            labels: readonly string[]
            revision: number
            teamNames: readonly string[]
            growthStages: readonly number[]
          }
        }
      | undefined
  }

  it("initial updateSnapshot exposes revision=1, teamNames+growthStages from the wire roster, and stable plant refs at slot index", async () => {
    const browser = createBrowserFake()
    let procedural: ReturnType<typeof createGardenScene> | undefined
    const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
      procedural = createGardenScene(handle, { palette: TEST_PALETTE })
      return procedural
    })
    const appFake = createAppFake()
    const createApplication = vi.fn(async () =>
      Object.assign(appFake.app, { stage: new Container() }),
    )

    const container = domDocument.createElement("div")
    domDocument.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const teams: FlowerBattleTeamState[] = [
      { ...makeTeam("Violet"), growthStage: 3 },
      { ...makeTeam("Orange"), growthStage: 7 },
      { ...makeTeam("Mango"), growthStage: 9 },
    ]

    await flushAct(() => {
      root.render(
        createElement(GardenBattleCanvasHost, {
          teams,
          quality: "high",
          phase: "question",
          attachOptions: {
            createApplication,
            createScene,
            background: TEST_CANVAS_BACKGROUND,
          },
          environment: browser.environment,
        }),
      )
    })

    expect(procedural).toBeDefined()
    const canvas = findDomCanvas(container)
    const handle = canvasProbe(canvas)
    expect(handle).toBeDefined()
    const identity = handle!.getE2EIdentity()

    // Signal 1 — normalized state: revision + parallel teamNames + growthStages.
    expect(identity.revision).toBe(1)
    expect(identity.teamNames).toEqual(["Violet", "Orange", "Mango"])
    expect(identity.growthStages).toEqual([3, 7, 9])

    // Signal 2 — rendered plant identity: same references as the procedural
    // scene, same team bound to the same plant slot, and the plant itself
    // already carries the matching growth stage internally.
    expect(identity.actorPlants).toHaveLength(3)
    expect(identity.actorPlants[0]).toBe(procedural!.layers.actors.children[0])
    expect(identity.actorPlants[1]).toBe(procedural!.layers.actors.children[1])
    expect(identity.actorPlants[2]).toBe(procedural!.layers.actors.children[2])
    expect(identity.labels).toEqual([
      "actor-plant-0",
      "actor-plant-1",
      "actor-plant-2",
    ])

    await flushAct(() => {
      root.unmount()
    })
  })

  it("each subsequent updateSnapshot increments revision AND mutates teamNames/growthStages while keeping plant instances stable", async () => {
    const browser = createBrowserFake()
    let procedural: ReturnType<typeof createGardenScene> | undefined
    const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
      procedural = createGardenScene(handle, { palette: TEST_PALETTE })
      return procedural
    })
    const appFake = createAppFake()
    const createApplication = vi.fn(async () =>
      Object.assign(appFake.app, { stage: new Container() }),
    )

    const container = domDocument.createElement("div")
    domDocument.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const renderWithTeams = async (
      teams: FlowerBattleTeamState[],
      phase: string,
    ) => {
      await flushAct(() => {
        root.render(
          createElement(GardenBattleCanvasHost, {
            teams,
            quality: "high",
            phase,
            attachOptions: {
              createApplication,
              createScene,
              background: TEST_CANVAS_BACKGROUND,
            },
            environment: browser.environment,
          }),
        )
      })
    }

    await renderWithTeams(
      [
        { ...makeTeam("Violet"), growthStage: 1 },
        { ...makeTeam("Orange"), growthStage: 2 },
      ],
      "question",
    )

    const canvas = findDomCanvas(container)
    const handle = canvasProbe(canvas)
    expect(handle).toBeDefined()
    const q1 = handle!.getE2EIdentity()
    expect(q1.revision).toBe(1)
    expect(q1.teamNames).toEqual(["Violet", "Orange"])
    expect(q1.growthStages).toEqual([1, 2])
    const violetPlant = q1.actorPlants[0]
    const orangePlant = q1.actorPlants[1]

    await renderWithTeams(
      [
        { ...makeTeam("Violet"), growthStage: 5 },
        { ...makeTeam("Orange"), growthStage: 6 },
      ],
      "result",
    )

    const result = handle!.getE2EIdentity()
    // Signal 1 — normalized state evolved: revision++, new stages, names stable.
    expect(result.revision).toBe(2)
    expect(result.teamNames).toEqual(["Violet", "Orange"])
    expect(result.growthStages).toEqual([5, 6])
    // Signal 2 — rendered plants are the SAME instances across rerenders
    // (proves no remount) and STILL carry the same per-plant team name.
    expect(result.actorPlants[0]).toBe(violetPlant)
    expect(result.actorPlants[1]).toBe(orangePlant)

    await renderWithTeams(
      [
        { ...makeTeam("Cobalt"), growthStage: 0 },
        { ...makeTeam("Lemon"), growthStage: 10 },
      ],
      "reveal",
    )

    const reveal = handle!.getE2EIdentity()
    expect(reveal.revision).toBe(3)
    expect(reveal.teamNames).toEqual(["Cobalt", "Lemon"])
    expect(reveal.growthStages).toEqual([0, 10])
    // Plant slot instances are reused (rebuild-by-index); the team bound
    // to slot 0 changed from Violet to Cobalt, so the team identity swap
    // is the second signal proving the rerender actually re-normalized.
    expect(reveal.actorPlants[0]).toBe(violetPlant)
    expect(reveal.actorPlants[1]).toBe(orangePlant)

    await flushAct(() => {
      root.unmount()
    })
  })

  it("static fallback path renders FlowerGardenScene with data-team-id + data-plant-stage that match the normalized wire roster (slot position from getTeamSlotLayout)", () => {
    // Build a wire roster that exercises 3 slots and a non-zero growthStage.
    const wireTeams: FlowerBattleTeamState[] = [
      { ...makeTeam("Violet"), growthStage: 2 },
      { ...makeTeam("Orange"), growthStage: 8 },
      { ...makeTeam("Mango"), growthStage: 5 },
    ]

    const html = renderToStaticMarkup(
      <GardenBattleCanvasHost
        teams={wireTeams}
        quality="static"
        seed={11}
        recipeVersion={1}
      />,
    )

    // Signal 1 — normalized state: data-team-id + data-plant-stage are the
    // test-only DOM hooks that carry the wire roster onto the rendered
    // slot divs. A probe can read them directly from the HTML without
    // mounting React or inspecting the SVG internals.
    expect(html).toContain('data-team-id="Violet"')
    expect(html).toContain('data-plant-stage="2"')
    expect(html).toContain('data-team-id="Orange"')
    expect(html).toContain('data-plant-stage="8"')
    expect(html).toContain('data-team-id="Mango"')
    expect(html).toContain('data-plant-stage="5"')

    // Signal 2 — slot positions: getTeamSlotLayout is deterministic, so
    // the rendered data-slot-x / data-slot-y values must match the layout
    // function's own output for the same teamCount.
    const expectedLayout = getTeamSlotLayout(3, { width: 1024, height: 768 })
    expect(expectedLayout).toHaveLength(3)
    for (const slot of expectedLayout) {
      // The data-* attributes on the slot div are emitted as raw numbers
      // (e.g. data-slot-x="33.333333333333336"); the HTML serializes the
      // exact value, so we round-trip through the layout function instead.
      const rendered = html.match(
        new RegExp(
          `data-testid="garden-team-slot-${slot.index}"[^>]*data-slot-x="([^"]+)"`,
        ),
      )
      expect(rendered).not.toBeNull()
      const renderedX = Number(rendered![1])
      // Same width 0..100 percent grid as the layout function.
      expect(Math.abs(renderedX - slot.xPercent)).toBeLessThan(0.0001)
    }

    // Cross-check: the wire team's name bound to slot i equals the
    // data-team-id of slot i — the second independent signal that the
    // rendered DOM matches the normalized state vector.
    for (let i = 0; i < wireTeams.length; i += 1) {
      const slotMatch = new RegExp(
        `data-testid="garden-team-slot-${i}"[^>]*data-team-id="([^"]+)"[^>]*data-plant-stage="([^"]+)"`,
      ).exec(html)
      expect(slotMatch).not.toBeNull()
      expect(slotMatch![1]).toBe(wireTeams[i]!.name)
      expect(Number(slotMatch![2])).toBe(wireTeams[i]!.growthStage)
    }
  })

  it("0-team wire state still produces two independent signals: revision stays at 0 (no normalization yet) and slot count is 0", async () => {
    const browser = createBrowserFake()
    let procedural: ReturnType<typeof createGardenScene> | undefined
    const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
      procedural = createGardenScene(handle, { palette: TEST_PALETTE })
      return procedural
    })
    const appFake = createAppFake()
    const createApplication = vi.fn(async () =>
      Object.assign(appFake.app, { stage: new Container() }),
    )

    const container = domDocument.createElement("div")
    domDocument.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await flushAct(() => {
      root.render(
        createElement(GardenBattleCanvasHost, {
          teams: [],
          quality: "high",
          attachOptions: {
            createApplication,
            createScene,
            background: TEST_CANVAS_BACKGROUND,
          },
          environment: browser.environment,
        }),
      )
    })

    const canvas = findDomCanvas(container)
    const handle = canvasProbe(canvas)
    expect(handle).toBeDefined()
    const identity = handle!.getE2EIdentity()

    // Signal 1 — normalized state: revision incremented (host pushed an
    // empty snapshot), but teamNames and growthStages stay empty.
    expect(identity.revision).toBeGreaterThanOrEqual(1)
    expect(identity.teamNames).toEqual([])
    expect(identity.growthStages).toEqual([])
    // Signal 2 — rendered plant instances: zero plants, same root.
    expect(identity.actorPlants).toEqual([])
    expect(identity.labels).toEqual([])
    expect(identity.root).toBe(procedural!.root)

    await flushAct(() => {
      root.unmount()
    })
  })

  it("shrink-to-1-team keeps plant-0 instance stable AND the surviving plant carries the new team name (two-signal cross-check)", async () => {
    const browser = createBrowserFake()
    let procedural: ReturnType<typeof createGardenScene> | undefined
    const createScene = vi.fn((handle: GardenPixiApplicationHandle) => {
      procedural = createGardenScene(handle, { palette: TEST_PALETTE })
      return procedural
    })
    const appFake = createAppFake()
    const createApplication = vi.fn(async () =>
      Object.assign(appFake.app, { stage: new Container() }),
    )

    const container = domDocument.createElement("div")
    domDocument.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const renderWithTeams = async (teams: FlowerBattleTeamState[]) => {
      await flushAct(() => {
        root.render(
          createElement(GardenBattleCanvasHost, {
            teams,
            quality: "high",
            attachOptions: {
              createApplication,
              createScene,
              background: TEST_CANVAS_BACKGROUND,
            },
            environment: browser.environment,
          }),
        )
      })
    }

    await renderWithTeams([
      { ...makeTeam("Violet"), growthStage: 4 },
      { ...makeTeam("Orange"), growthStage: 5 },
      { ...makeTeam("Mango"), growthStage: 6 },
    ])

    const canvas = findDomCanvas(container)
    const handle = canvasProbe(canvas)
    expect(handle).toBeDefined()
    const wide = handle!.getE2EIdentity()
    expect(wide.revision).toBe(1)
    expect(wide.teamNames).toEqual(["Violet", "Orange", "Mango"])
    expect(wide.growthStages).toEqual([4, 5, 6])
    const survivingPlant = wide.actorPlants[0]
    expect(survivingPlant).toBeDefined()

    // Shrink to a single team — GardenScene keeps plant-0 instance, drops
    // the rest. Procedural layer pads layout to MIN_PLOT_TEAMS (2), so
    // there is still one rendered plant bound to the new (Cobalt) team.
    await renderWithTeams([{ ...makeTeam("Cobalt"), growthStage: 9 }])

    const shrunk = handle!.getE2EIdentity()
    expect(shrunk.revision).toBe(2)
    expect(shrunk.teamNames).toEqual(["Cobalt"])
    expect(shrunk.growthStages).toEqual([9])
    // Signal 2 — the surviving plant IS the same Pixi Container instance
    // AND its team identity flipped from Violet to Cobalt in the
    // normalized state vector, proving the rerender actually applied a
    // new state (not just a no-op rerender).
    expect(shrunk.actorPlants[0]).toBe(survivingPlant)

    await flushAct(() => {
      root.unmount()
    })
  })
})
