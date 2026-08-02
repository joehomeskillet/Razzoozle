import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { GardenSceneLoadedAssets } from "../../assets/loadGardenSceneAssets"
import { createEmptyGardenScene } from "../../garden-pixi.types"
import type {
  GardenPixiApplicationHandle,
  GardenScene,
} from "../../garden-pixi.types"
import type { GardenPalette } from "../gardenPalette"

type LoadAssets = (palette: GardenPalette) => Promise<GardenSceneLoadedAssets>
type CreateProductionScene = (
  app: GardenPixiApplicationHandle,
  options: unknown,
) => GardenScene

const mocks = vi.hoisted(() => ({
  loadAssets: vi.fn<LoadAssets>(),
  createScene: vi.fn<CreateProductionScene>(),
}))

vi.mock("../../assets/loadGardenSceneAssets", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../assets/loadGardenSceneAssets")>()
  return { ...original, loadGardenSceneAssets: mocks.loadAssets }
})

vi.mock("../GardenScene", () => ({
  createGardenScene: mocks.createScene,
}))

import {
  attachGardenPixiApplication,
  type GardenPixiDocument,
  type GardenPixiEnvironment,
} from "../../attachGardenPixiApplication"

const TEST_BACKGROUND = 0x112233

function makeLoaded(release?: () => void): GardenSceneLoadedAssets {
  return {
    layers: {} as GardenSceneLoadedAssets["layers"],
    plantHeads: {},
    plantBody: {},
    plantVariants: null,
    texturesByAlias: {},
    diagnostics: {
      requiredAliases: [],
      loadedAliases: [],
      missingAliases: [],
      failedUrls: [],
      fallbackAliases: [],
      usedSpriteAliases: [],
    },
    complete: true,
    release,
  }
}

function createCanvas(): HTMLCanvasElement {
  return {
    clientWidth: 640,
    clientHeight: 360,
  } as HTMLCanvasElement
}

function createApp(): {
  app: GardenPixiApplicationHandle
  destroy: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
} {
  const destroy = vi.fn()
  const stop = vi.fn()
  return {
    app: {
      canvas: createCanvas(),
      renderer: { resize: vi.fn(), width: 640, height: 360 },
      ticker: { start: vi.fn(), stop },
      destroy,
    },
    destroy,
    stop,
  }
}

function createEnvironment(): GardenPixiEnvironment {
  const listeners = new Set<EventListenerOrEventListenerObject>()
  class ResizeObserverFake {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  const document = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener(
      _type: "visibilitychange",
      listener: EventListenerOrEventListenerObject,
    ) {
      listeners.add(listener)
    },
    removeEventListener(
      _type: "visibilitychange",
      listener: EventListenerOrEventListenerObject,
    ) {
      listeners.delete(listener)
    },
  } satisfies GardenPixiDocument
  return {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    ResizeObserver:
      ResizeObserverFake as unknown as GardenPixiEnvironment["ResizeObserver"],
    document,
  }
}

beforeEach(() => {
  mocks.loadAssets.mockReset()
  mocks.createScene.mockReset()
  mocks.createScene.mockReturnValue(createEmptyGardenScene())
  vi.stubGlobal("document", { documentElement: {} })
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: () => "#112233",
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("owned garden texture lifecycle", () => {
  it("releases loader-owned assets once after the scene and before the app", async () => {
    const order: string[] = []
    const release = vi.fn(() => order.push("release"))
    const scene = createEmptyGardenScene()
    scene.destroy = vi.fn(() => order.push("scene"))
    mocks.loadAssets.mockResolvedValue(makeLoaded(release))
    mocks.createScene.mockReturnValue(scene)
    const { app, destroy } = createApp()
    destroy.mockImplementation(() => order.push("app"))

    const attached = await attachGardenPixiApplication(
      createCanvas(),
      { createApplication: async () => app, background: TEST_BACKGROUND },
      createEnvironment(),
    )
    attached.dispose()
    attached.dispose()

    expect(order).toEqual(["scene", "release", "app"])
    expect(release).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledWith(
      { removeView: false },
      { children: true, texture: false, textureSource: false },
    )
  })

  it("releases assets when production scene creation fails", async () => {
    const release = vi.fn()
    const sceneError = new Error("scene failed")
    mocks.loadAssets.mockResolvedValue(makeLoaded(release))
    mocks.createScene.mockImplementation(() => {
      throw sceneError
    })
    const { app, destroy } = createApp()

    await expect(
      attachGardenPixiApplication(
        createCanvas(),
        { createApplication: async () => app, background: TEST_BACKGROUND },
        createEnvironment(),
      ),
    ).rejects.toBe(sceneError)

    expect(release).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it("preserves an onReady error while attempting every cleanup phase", async () => {
    const order: string[] = []
    const readyError = new Error("onReady failed")
    const release = vi.fn(() => {
      order.push("release")
      throw new Error("release failed")
    })
    const scene = createEmptyGardenScene()
    scene.destroy = vi.fn(() => {
      order.push("scene")
      throw new Error("scene destroy failed")
    })
    mocks.loadAssets.mockResolvedValue(makeLoaded(release))
    mocks.createScene.mockReturnValue(scene)
    const { app, destroy } = createApp()
    destroy.mockImplementation(() => {
      order.push("app")
      throw new Error("app destroy failed")
    })

    await expect(
      attachGardenPixiApplication(
        createCanvas(),
        {
          createApplication: async () => app,
          background: TEST_BACKGROUND,
          onReady: () => {
            throw readyError
          },
        },
        createEnvironment(),
      ),
    ).rejects.toBe(readyError)

    expect(order).toEqual(["scene", "release", "app"])
  })

  it("releases assets when initial scene layout fails", async () => {
    const release = vi.fn()
    const layoutError = new Error("layout failed")
    const destroyScene = vi.fn()
    const scene: GardenScene = {
      updateLayout: vi.fn(() => {
        throw layoutError
      }),
      destroy: destroyScene,
    }
    mocks.loadAssets.mockResolvedValue(makeLoaded(release))
    mocks.createScene.mockReturnValue(scene)
    const { app, destroy } = createApp()

    await expect(
      attachGardenPixiApplication(
        createCanvas(),
        { createApplication: async () => app, background: TEST_BACKGROUND },
        createEnvironment(),
      ),
    ).rejects.toBe(layoutError)

    expect(destroyScene).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it("keeps explicit loadAssets false free of loader ownership", async () => {
    const { app, destroy } = createApp()
    const createScene = vi.fn(() => createEmptyGardenScene())

    const { dispose } = await attachGardenPixiApplication(
      createCanvas(),
      {
        createApplication: async () => app,
        createScene,
        loadAssets: false,
        background: TEST_BACKGROUND,
      },
      createEnvironment(),
    )
    dispose()

    expect(mocks.loadAssets).not.toHaveBeenCalled()
    expect(createScene).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledWith(
      { removeView: false },
      { children: true, texture: false, textureSource: false },
    )
  })

  it("keeps compatibility with injected loaded assets that omit release", async () => {
    mocks.loadAssets.mockResolvedValue(makeLoaded())
    const { app, destroy } = createApp()

    const { dispose } = await attachGardenPixiApplication(
      createCanvas(),
      { createApplication: async () => app, background: TEST_BACKGROUND },
      createEnvironment(),
    )
    dispose()

    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
