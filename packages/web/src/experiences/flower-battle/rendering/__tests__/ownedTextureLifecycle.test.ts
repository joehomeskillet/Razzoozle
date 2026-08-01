import { Cache, Texture, TextureSource } from "pixi.js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { GardenSceneLoadedAssets } from "../../assets/loadGardenSceneAssets"
import { createEmptyGardenScene } from "../../garden-pixi.types"
import type {
  CreateGardenPixiApplication,
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

type CacheKey = Parameters<typeof Cache.set>[0]

const cacheKeys: CacheKey[] = []
const textures: Texture[] = []
const sources: TextureSource[] = []

function cache(key: CacheKey, texture: Texture): void {
  Cache.set(key, texture)
  cacheKeys.push(key)
}

function makeTexture(resource?: { width: number; height: number }): {
  texture: Texture
  source: TextureSource
} {
  const source = new TextureSource(
    resource ? { resource } : { width: 4, height: 4 },
  )
  const texture = new Texture({ source })
  sources.push(source)
  textures.push(texture)
  return { texture, source }
}

function makeLoaded(
  texturesByAlias: Record<string, Texture>,
): GardenSceneLoadedAssets {
  const aliases = Object.keys(texturesByAlias)
  return {
    layers: {} as GardenSceneLoadedAssets["layers"],
    plantHeads: {},
    plantBody: {},
    plantVariants: null,
    texturesByAlias,
    diagnostics: {
      requiredAliases: aliases,
      loadedAliases: aliases,
      missingAliases: [],
      failedUrls: [],
      fallbackAliases: [],
      usedSpriteAliases: aliases,
    },
    complete: true,
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
} {
  const destroy = vi.fn()
  return {
    app: {
      canvas: createCanvas(),
      renderer: { resize: vi.fn(), width: 640, height: 360 },
      ticker: { start: vi.fn(), stop: vi.fn() },
      destroy,
    },
    destroy,
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
  cacheKeys.length = 0
  textures.length = 0
  sources.length = 0
  mocks.loadAssets.mockReset()
  mocks.createScene.mockReset()
  mocks.createScene.mockReturnValue(createEmptyGardenScene())
  vi.stubGlobal("document", { documentElement: {} })
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: () => "#112233",
  }))
})

afterEach(() => {
  for (const key of cacheKeys) {
    if (Cache.has(key)) Cache.remove(key)
  }
  for (const texture of textures) {
    if (!texture.destroyed) texture.destroy()
  }
  for (const source of sources) {
    if (!source.destroyed) source.destroy()
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("owned garden texture lifecycle", () => {
  it("destroys its TextureSource and evicts alias and resource cache entries", async () => {
    const resource = { width: 4, height: 4 }
    const { texture, source } = makeTexture(resource)
    const destroySource = vi.spyOn(source, "destroy")
    cache("plant_violet_full", texture)
    cache(resource, texture)
    mocks.loadAssets.mockResolvedValue(
      makeLoaded({ plant_violet_full: texture }),
    )
    const { app, destroy } = createApp()

    const attached = await attachGardenPixiApplication(
      createCanvas(),
      { createApplication: async () => app, background: TEST_BACKGROUND },
      createEnvironment(),
    )
    attached.dispose()

    expect(texture.destroyed).toBe(true)
    expect(source.destroyed).toBe(true)
    expect(destroySource).toHaveBeenCalledTimes(1)
    expect(Cache.has("plant_violet_full")).toBe(false)
    expect(Cache.has(resource)).toBe(false)
    expect(destroy).toHaveBeenCalledWith(
      { removeView: true },
      { children: true, texture: false, textureSource: false },
    )
  })

  it("does not evict or destroy a cached texture outside its loaded map", async () => {
    const owned = makeTexture()
    const shared = makeTexture()
    cache("owned", owned.texture)
    cache("shared-global", shared.texture)
    mocks.loadAssets.mockResolvedValue(makeLoaded({ owned: owned.texture }))
    const { app } = createApp()

    const { dispose } = await attachGardenPixiApplication(
      createCanvas(),
      { createApplication: async () => app, background: TEST_BACKGROUND },
      createEnvironment(),
    )
    dispose()

    expect(owned.source.destroyed).toBe(true)
    expect(shared.texture.destroyed).toBe(false)
    expect(shared.source.destroyed).toBe(false)
    expect(Cache.has("shared-global")).toBe(true)
  })

  it("deduplicates duplicate aliases, Texture objects, and shared sources", async () => {
    const source = new TextureSource({ width: 4, height: 4 })
    const first = new Texture({ source })
    const second = new Texture({ source })
    sources.push(source)
    textures.push(first, second)
    const destroySource = vi.spyOn(source, "destroy")
    const destroyFirst = vi.spyOn(first, "destroy")
    const destroySecond = vi.spyOn(second, "destroy")
    mocks.loadAssets.mockResolvedValue(
      makeLoaded({ first, duplicate: first, second }),
    )
    const { app } = createApp()

    const { dispose } = await attachGardenPixiApplication(
      createCanvas(),
      { createApplication: async () => app, background: TEST_BACKGROUND },
      createEnvironment(),
    )
    dispose()
    dispose()

    expect(destroyFirst).toHaveBeenCalledTimes(1)
    expect(destroySecond).toHaveBeenCalledTimes(1)
    expect(destroySource).toHaveBeenCalledTimes(1)
  })

  it("releases loaded resources when production scene creation fails", async () => {
    const owned = makeTexture()
    const destroySource = vi.spyOn(owned.source, "destroy")
    cache("failing-plant", owned.texture)
    mocks.loadAssets.mockResolvedValue(
      makeLoaded({ "failing-plant": owned.texture }),
    )
    mocks.createScene.mockImplementation(() => {
      throw new Error("scene failed")
    })
    const { app, destroy } = createApp()

    await expect(
      attachGardenPixiApplication(
        createCanvas(),
        { createApplication: async () => app, background: TEST_BACKGROUND },
        createEnvironment(),
      ),
    ).rejects.toThrow("scene failed")

    expect(destroySource).toHaveBeenCalledTimes(1)
    expect(Cache.has("failing-plant")).toBe(false)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it("can attach again after disposal without reusing a destroyed cache entry", async () => {
    const first = makeTexture()
    const second = makeTexture()
    mocks.loadAssets
      .mockImplementationOnce(async () => {
        cache("plant", first.texture)
        return makeLoaded({ plant: first.texture })
      })
      .mockImplementationOnce(async () => {
        expect(Cache.has("plant")).toBe(false)
        cache("plant", second.texture)
        return makeLoaded({ plant: second.texture })
      })
    const firstApp = createApp()
    const secondApp = createApp()
    const createApplication: CreateGardenPixiApplication = vi
      .fn<CreateGardenPixiApplication>()
      .mockResolvedValueOnce(firstApp.app)
      .mockResolvedValueOnce(secondApp.app)

    const firstAttach = await attachGardenPixiApplication(
      createCanvas(),
      { createApplication, background: TEST_BACKGROUND },
      createEnvironment(),
    )
    firstAttach.dispose()
    const secondAttach = await attachGardenPixiApplication(
      createCanvas(),
      { createApplication, background: TEST_BACKGROUND },
      createEnvironment(),
    )
    secondAttach.dispose()

    expect(mocks.loadAssets).toHaveBeenCalledTimes(2)
    expect(first.source.destroyed).toBe(true)
    expect(second.source.destroyed).toBe(true)
    expect(Cache.has("plant")).toBe(false)
  })

  it("keeps explicit loadAssets false free of asset ownership work", async () => {
    const { app } = createApp()
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
  })
})
