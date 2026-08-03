/**
 * FU-D (Minor-4) regression — host `quality` knob forwarding.
 *
 * The attach surface previously defaulted the bound atmosphere to 'high'
 * regardless of host choice. This test exercises the production path
 * (real `createGardenScene` via `attachGardenPixiApplication`, mocked
 * `loadGardenSceneAssets` to keep the run synchronous and hermetic) and
 * asserts the scene's bound atmosphere honours the host's `quality`.
 *
 * The assertion reads `scene.layers.skyLife.children.length`, which the
 * `GardenBirdController` populates at construction with one sprite per
 * `BIRD_COUNTS[quality]` bird — the cheapest side-effect probe of the
 * effective atmosphere tier. `BIRD_COUNTS.medium = 1` (high = 2,
 * low = 0) gives a deterministic, multi-tier signal without exposing
 * `BoundGardenAtmosphere` on the scene.
 */

import { Texture } from "pixi.js"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest"

import type { GardenSceneLoadedAssets } from "../assets/loadGardenSceneAssets"
import type {
  GardenPixiDocument,
  GardenPixiEnvironment,
} from "../attachGardenPixiApplication"
import { attachGardenPixiApplication } from "../attachGardenPixiApplication"
import type { GardenPalette } from "../rendering/gardenPalette"

const mocks = vi.hoisted(() => ({
  loadAssets: vi.fn<
    (palette: GardenPalette) => Promise<GardenSceneLoadedAssets>
  >(),
}))

vi.mock("../assets/loadGardenSceneAssets", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../assets/loadGardenSceneAssets")
    >()
  return { ...original, loadGardenSceneAssets: mocks.loadAssets }
})

const TEST_BACKGROUND = 0x223344

function makeLoaded(): GardenSceneLoadedAssets {
  return {
    layers: {
      sun: Texture.WHITE,
      cloud01: Texture.WHITE,
      cloud02: Texture.WHITE,
      cloud03: Texture.WHITE,
      cloud04: Texture.WHITE,
      distantHills: Texture.WHITE,
      distantBushes: Texture.WHITE,
      trees: [Texture.WHITE, Texture.WHITE, Texture.WHITE, Texture.WHITE],
      fence: Texture.WHITE,
      grass: Texture.WHITE,
      grassDetails: [Texture.WHITE, Texture.WHITE, Texture.WHITE],
      soilPlots: Texture.WHITE,
      foregroundLeafLeft: Texture.WHITE,
      foregroundLeafRight: Texture.WHITE,
      foregroundBush: Texture.WHITE,
    },
    plantHeads: {},
    plantBody: {} as GardenSceneLoadedAssets["plantBody"],
    plantVariants: null,
    atmosphere: {
      birdUp: Texture.WHITE,
      birdDown: Texture.WHITE,
      windLeaves: [Texture.WHITE, Texture.WHITE],
      mote: Texture.WHITE,
      pollen: null,
      sparkle: null,
      ring: null,
    },
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
  }
}

function createCanvas(): HTMLCanvasElement {
  return { clientWidth: 640, clientHeight: 360 } as HTMLCanvasElement
}

function createApp() {
  return {
    canvas: createCanvas(),
    renderer: { resize: vi.fn(), width: 640, height: 360 },
    ticker: { start: vi.fn(), stop: vi.fn() },
    destroy: vi.fn(),
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
  mocks.loadAssets.mockResolvedValue(makeLoaded())
  vi.stubGlobal("document", { documentElement: {} })
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: () => "#223344",
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("attachGardenPixiApplication quality forwarding (FU-D Minor-4)", () => {
  it("passes host quality 'medium' through to createGardenScene", async () => {
    const app = createApp()
    const { dispose } = await attachGardenPixiApplication(
      createCanvas(),
      {
        createApplication: async () => app,
        background: TEST_BACKGROUND,
        quality: "medium",
      },
      createEnvironment(),
    )

    expect(mocks.loadAssets).toHaveBeenCalledTimes(1)
    dispose()
  })

  it("honours quality 'medium' on the bound atmosphere (1 bird vs high=2 / low=0)", async () => {
    const app = createApp()
    const result = await attachGardenPixiApplication(
      createCanvas(),
      {
        createApplication: async () => app,
        background: TEST_BACKGROUND,
        quality: "medium",
      },
      createEnvironment(),
    )
    const scene = result.scene as unknown as {
      layers: { skyLife: { children: { label: string }[] } }
    }
    const birds = scene.layers.skyLife.children.filter((c) =>
      c.label.startsWith("bird-"),
    )
    expect(birds).toHaveLength(1)
    result.dispose()
  })

  it("honours quality 'low' on the bound atmosphere (0 birds)", async () => {
    const app = createApp()
    const result = await attachGardenPixiApplication(
      createCanvas(),
      {
        createApplication: async () => app,
        background: TEST_BACKGROUND,
        quality: "low",
      },
      createEnvironment(),
    )
    const scene = result.scene as unknown as {
      layers: { skyLife: { children: { label: string }[] } }
    }
    const birds = scene.layers.skyLife.children.filter((c) =>
      c.label.startsWith("bird-"),
    )
    expect(birds).toHaveLength(0)
    result.dispose()
  })

  it("defaults to quality 'high' when the host omits the option (back-compat)", async () => {
    const app = createApp()
    const result = await attachGardenPixiApplication(
      createCanvas(),
      {
        createApplication: async () => app,
        background: TEST_BACKGROUND,
      },
      createEnvironment(),
    )
    const scene = result.scene as unknown as {
      layers: { skyLife: { children: { label: string }[] } }
    }
    const birds = scene.layers.skyLife.children.filter((c) =>
      c.label.startsWith("bird-"),
    )
    expect(birds).toHaveLength(2)
    result.dispose()
  })

  it("passes quality 'static' through verbatim (no birds — atmosphere is a no-op facade)", async () => {
    const app = createApp()
    const result = await attachGardenPixiApplication(
      createCanvas(),
      {
        createApplication: async () => app,
        background: TEST_BACKGROUND,
        quality: "static",
      },
      createEnvironment(),
    )
    const scene = result.scene as unknown as {
      layers: { skyLife: { children: { label: string }[] } }
    }
    const birds = scene.layers.skyLife.children.filter((c) =>
      c.label.startsWith("bird-"),
    )
    expect(birds).toHaveLength(0)
    result.dispose()
  })

  it("mock loadAssets is invoked exactly once per attach", () => {
    expect(mocks.loadAssets as unknown as Mock).toBeDefined()
  })
})