import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { ExperienceEffectDescriptor } from "../types/experience-effect"
import { EffectRegistry } from "./EffectRegistry"
import { ParticleCanvas, attachParticleCanvas } from "./ParticleCanvas"

type StoredListener = EventListenerOrEventListenerObject

function callListener(listener: StoredListener, event: Event): void {
  if (typeof listener === "function") listener(event)
  else listener.handleEvent(event)
}

function createBrowserFake(options?: {
  devicePixelRatio?: number
  reducedMotion?: boolean
}) {
  let visibilityState: DocumentVisibilityState = "visible"
  let nextFrameId = 1
  let resizeCallback: ResizeObserverCallback | undefined
  const visibilityListeners = new Set<StoredListener>()
  const queuedFrames = new Map<number, FrameRequestCallback>()
  const allFrames = new Map<number, FrameRequestCallback>()
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
  const document = {
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
  const environment = {
    devicePixelRatio: options?.devicePixelRatio ?? 1,
    matchMedia: vi.fn(() => mediaQuery),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++
      queuedFrames.set(id, callback)
      allFrames.set(id, callback)
      return id
    }),
    cancelAnimationFrame: vi.fn((id: number) => {
      queuedFrames.delete(id)
    }),
    ResizeObserver: ResizeObserverFake,
    document,
  }

  return {
    environment,
    resizeObserver,
    queuedFrameIds: () => [...queuedFrames.keys()],
    notifyResize() {
      if (!resizeCallback) throw new Error("ResizeObserver was not created")
      resizeCallback([], resizeObserver as unknown as ResizeObserver)
    },
    setVisibility(state: DocumentVisibilityState) {
      visibilityState = state
      const event = { type: "visibilitychange" } as Event
      for (const listener of [...visibilityListeners]) {
        callListener(listener, event)
      }
    },
    runFrame(id: number, timestamp = 16) {
      queuedFrames.delete(id)
      allFrames.get(id)?.(timestamp)
    },
  }
}

function createCanvas(width = 320, height = 180) {
  // No `as unknown as CanvasRenderingContext2D` cast here on purpose: typing
  // this as the real DOM interface makes `setTransform` a "method" in tsc's
  // eyes, which trips oxlint's unbound-method check on
  // `expect(context.setTransform)...` below. `canvas` (incl. this mock's
  // return) is cast to HTMLCanvasElement at each call site instead.
  const context = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
  }
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: width,
    clientHeight: height,
    style: {},
    getContext: vi.fn(() => context),
  }
  return { canvas, context }
}

function createEngine() {
  return {
    update: vi.fn<(elapsedMs: number) => void>(),
    render: vi.fn<() => void>(),
    clear: vi.fn<() => void>(),
  }
}

function createEmitter() {
  return { emit: vi.fn() }
}

function requiredFrameId(
  browser: ReturnType<typeof createBrowserFake>,
): number {
  const id = browser.queuedFrameIds()[0]
  if (id === undefined) throw new Error("Expected a queued animation frame")
  return id
}

const descriptor: ExperienceEffectDescriptor = {
  seed: "visual-seed",
  anchor: { type: "normalized", x: 0.25, y: 0.75 },
  colorRoles: ["primary", "success"],
}

describe("ParticleCanvas markup", () => {
  it("keeps exactly one inert canvas after repeated effect emits", () => {
    const registry = new EffectRegistry()
    registry.register("burst", vi.fn())
    registry.trigger("burst", descriptor, "markup-1")
    registry.trigger("burst", descriptor, "markup-2")
    registry.trigger("burst", descriptor, "markup-3")

    const html = renderToStaticMarkup(
      <ParticleCanvas emittersByPresetId={{}} registry={registry} />,
    )

    expect(html.match(/<canvas/g)).toHaveLength(1)
    expect(html).toContain('aria-label="effects layer"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('tabindex="-1"')
    expect(html).toMatch(/style="[^"]*pointer-events:none[^"]*"/)
  })
})

describe("attachParticleCanvas", () => {
  it("registers every supplied preset as a registry handler", () => {
    const { canvas } = createCanvas()
    const browser = createBrowserFake()
    const registry = new EffectRegistry()
    const burst = createEmitter()
    const sparkle = createEmitter()
    const engine = createEngine()
    const cleanup = attachParticleCanvas(
      canvas as unknown as HTMLCanvasElement,
      {
        registry,
        emittersByPresetId: { burst, sparkle },
        createEngine: vi.fn(() => engine),
      },
      browser.environment,
    )

    expect(registry.resolve("burst")).not.toBeNull()
    expect(registry.resolve("sparkle")).not.toBeNull()
    registry.trigger("burst", descriptor, "burst-1")
    registry.trigger("sparkle", descriptor, "sparkle-1")
    expect(burst.emit).toHaveBeenCalledOnce()
    expect(sparkle.emit).toHaveBeenCalledOnce()
    cleanup()
  })

  it("resolves anchors and theme roles at trigger time", () => {
    const { canvas } = createCanvas(640, 360)
    const browser = createBrowserFake()
    const registry = new EffectRegistry()
    const burst = createEmitter()
    const engine = createEngine()
    const cleanup = attachParticleCanvas(
      canvas as unknown as HTMLCanvasElement,
      {
        registry,
        emittersByPresetId: { burst },
        createEngine: vi.fn(() => engine),
      },
      browser.environment,
    )

    expect(burst.emit).not.toHaveBeenCalled()
    registry.trigger("burst", descriptor, "burst-render")
    expect(burst.emit).toHaveBeenCalledWith({
      engine,
      descriptor,
      seed: "visual-seed",
      instanceId: "burst-render",
      origin: { x: 160, y: 270 },
      colors: ["var(--color-primary)", "var(--state-correct)"],
    })
    cleanup()
  })

  it("clamps DPR to 2 and resizes through ResizeObserver", () => {
    const { canvas, context } = createCanvas()
    const browser = createBrowserFake({ devicePixelRatio: 3 })
    const cleanup = attachParticleCanvas(
      canvas as unknown as HTMLCanvasElement,
      {
        registry: new EffectRegistry(),
        emittersByPresetId: {},
        createEngine: vi.fn(() => createEngine()),
      },
      browser.environment,
    )

    expect({ width: canvas.width, height: canvas.height }).toEqual({
      width: 640,
      height: 360,
    })
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
    expect(browser.resizeObserver.observe).toHaveBeenCalledWith(canvas)

    canvas.clientWidth = 240
    canvas.clientHeight = 100
    browser.notifyResize()
    expect({ width: canvas.width, height: canvas.height }).toEqual({
      width: 480,
      height: 200,
    })
    cleanup()
  })

  it("chooses capacity 20 under reduced motion without disabling emitters", () => {
    const { canvas, context } = createCanvas()
    const browser = createBrowserFake({ reducedMotion: true })
    const registry = new EffectRegistry()
    const burst = createEmitter()
    const engine = createEngine()
    const createEngineFactory = vi.fn(() => engine)
    const cleanup = attachParticleCanvas(
      canvas as unknown as HTMLCanvasElement,
      {
        registry,
        emittersByPresetId: { burst },
        createEngine: createEngineFactory,
      },
      browser.environment,
    )

    expect(browser.environment.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    )
    expect(createEngineFactory).toHaveBeenCalledWith(context, 20)
    registry.trigger("burst", descriptor, "reduced-1")
    expect(burst.emit).toHaveBeenCalledOnce()
    cleanup()
  })

  it("cancels hidden frames and resumes with only one safe frame", () => {
    const { canvas } = createCanvas()
    const browser = createBrowserFake()
    const engine = createEngine()
    const cleanup = attachParticleCanvas(
      canvas as unknown as HTMLCanvasElement,
      {
        registry: new EffectRegistry(),
        emittersByPresetId: {},
        createEngine: vi.fn(() => engine),
      },
      browser.environment,
    )
    const hiddenFrame = requiredFrameId(browser)

    browser.setVisibility("hidden")
    expect(browser.environment.cancelAnimationFrame).toHaveBeenCalledWith(
      hiddenFrame,
    )
    browser.runFrame(hiddenFrame)
    expect(engine.update).not.toHaveBeenCalled()
    expect(browser.queuedFrameIds()).toEqual([])

    browser.setVisibility("visible")
    browser.setVisibility("visible")
    expect(browser.queuedFrameIds()).toHaveLength(1)
    browser.runFrame(requiredFrameId(browser))
    expect(engine.render).toHaveBeenCalledOnce()
    expect(browser.queuedFrameIds()).toHaveLength(1)
    cleanup()
  })

  it("cleans all resources and ignores frames racing after disposal", () => {
    const { canvas } = createCanvas()
    const browser = createBrowserFake()
    const registry = new EffectRegistry()
    const burst = createEmitter()
    const engine = createEngine()
    const cleanup = attachParticleCanvas(
      canvas as unknown as HTMLCanvasElement,
      {
        registry,
        emittersByPresetId: { burst },
        createEngine: vi.fn(() => engine),
      },
      browser.environment,
    )
    const pendingFrame = requiredFrameId(browser)
    const requestsBeforeCleanup =
      browser.environment.requestAnimationFrame.mock.calls.length

    cleanup()
    cleanup()

    expect(browser.resizeObserver.disconnect).toHaveBeenCalledOnce()
    expect(
      browser.environment.document.removeEventListener,
    ).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
    expect(browser.environment.cancelAnimationFrame).toHaveBeenCalledWith(
      pendingFrame,
    )
    expect(engine.clear).toHaveBeenCalledOnce()
    expect(registry.resolve("burst")).toBeNull()

    registry.trigger("burst", descriptor, "after-cleanup")
    browser.runFrame(pendingFrame)
    expect(burst.emit).not.toHaveBeenCalled()
    expect(engine.update).not.toHaveBeenCalled()
    expect(browser.environment.requestAnimationFrame).toHaveBeenCalledTimes(
      requestsBeforeCleanup,
    )
  })
})
