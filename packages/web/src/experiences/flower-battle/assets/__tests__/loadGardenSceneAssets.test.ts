import { Cache, Texture, TextureSource } from "pixi.js"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  bakeSvgForPixi,
  buildAtmosphereTextures,
  buildPlantVariants,
  ensureSvgIntrinsicSize,
  hexToCssColor,
  isRasterUrl,
  loadGardenSceneAssets,
  normalizeSvgViewBox,
  parseSvgViewBox,
  targetRasterSize,
} from "../loadGardenSceneAssets"
import {
  GARDEN_SCENE_ASSET_URLS,
  GARDEN_SCENE_REQUIRED_ALIASES,
} from "../garden-scene-asset-urls"
import type { GardenPalette } from "../../rendering/gardenPalette"

const TEST_PALETTE: GardenPalette = {
  sky: 0x112233,
  sun: 0x112233,
  cloud: 0x112233,
  hillBack: 0x112233,
  hillMid: 0x112233,
  bushBack: 0x112233,
  bushMid: 0x112233,
  midground: 0x112233,
  fence: 0x112233,
  grass: 0x112233,
  soil: 0x112233,
  soilEdge: 0x112233,
  foreground: 0x112233,
  plantStem: 0x112233,
  plantLeaf: 0x112233,
  plantPetal: 0x112233,
  hillsFar: 0x112233,
  hillsNear: 0x112233,
  clouds: 0x112233,
  teamMeterFrame: 0x112233,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("hexToCssColor", () => {
  it("formats 0xRRGGBB as #rrggbb", () => {
    expect(hexToCssColor(0xc9eaef)).toBe("#c9eaef")
    expect(hexToCssColor(0)).toBe("#000000")
    expect(hexToCssColor(0xffffff)).toBe("#ffffff")
  })
})

describe("bakeSvgForPixi", () => {
  it("replaces currentColor and known CSS vars with concrete colours", () => {
    const raw = `
      <svg>
        <rect fill="currentColor"/>
        <circle fill="var(--flower-battle-sky, currentColor)"/>
        <path stroke="var(--flower-battle-ink, currentColor)"/>
        <ellipse fill="var(--status-pending-bg)"/>
        <line stroke="var(--line)"/>
      </svg>
    `
    const baked = bakeSvgForPixi(raw, {
      fill: "#c9eaef",
      ink: "#242236",
      accent: "#f9b20b",
    })
    expect(baked).not.toContain("currentColor")
    expect(baked).not.toContain("var(--flower-battle-sky")
    expect(baked).not.toContain("var(--flower-battle-ink")
    expect(baked).toContain("#c9eaef")
    expect(baked).toContain("#242236")
    expect(baked).toContain("#f9b20b")
  })
})

describe("normalizeSvgViewBox", () => {
  it("rewrites negative-origin viewBoxes with a compensating translate", () => {
    const raw =
      '<svg viewBox="-40 -40 80 80"><circle cx="0" cy="0" r="10"/></svg>'
    const out = normalizeSvgViewBox(raw)
    expect(out).toContain('viewBox="0 0 80 80"')
    expect(out).toContain("translate(40 40)")
    expect(out).toContain("</g></svg>")
  })
})

describe("ensureSvgIntrinsicSize", () => {
  it("injects explicit width/height so browsers do not default to 300×150", () => {
    const raw =
      '<svg viewBox="0 0 1920 400" xmlns="http://www.w3.org/2000/svg"></svg>'
    const out = ensureSvgIntrinsicSize(raw, 1920, 400)
    expect(out).toContain('width="1920"')
    expect(out).toContain('height="400"')
    expect(out).toContain('viewBox="0 0 1920 400"')
  })
})

describe("targetRasterSize", () => {
  it("keeps full-width stage strips at design resolution", () => {
    const size = targetRasterSize("bg_sky_day", {
      minX: 0,
      minY: 0,
      width: 1920,
      height: 1080,
    })
    expect(size).toEqual({ width: 1920, height: 1080 })
  })

  it("2× supersamples small props", () => {
    const size = targetRasterSize("bg_cloud_01", {
      minX: 0,
      minY: 0,
      width: 320,
      height: 120,
    })
    expect(size).toEqual({ width: 640, height: 240 })
  })

  it("squares plant heads at 256", () => {
    const size = targetRasterSize("plant_head_round", {
      minX: 0,
      minY: 0,
      width: 80,
      height: 80,
    })
    expect(size).toEqual({ width: 512, height: 512 })
  })

  it("rasterizes faces at 512 square", () => {
    const size = targetRasterSize("face_emote_happy", {
      minX: 0,
      minY: 0,
      width: 36,
      height: 36,
    })
    expect(size).toEqual({ width: 512, height: 512 })
  })

  it("rasterizes stems at 256×512 (high-DPI floor, slight stretch)", () => {
    const size = targetRasterSize("plant_stem_01", {
      minX: 0,
      minY: 0,
      width: 48,
      height: 256,
    })
    expect(size).toEqual({ width: 256, height: 512 })
  })

  it("rasterizes pots at 256×512 (high-DPI floor, slight stretch)", () => {
    const size = targetRasterSize("plant_pot_01", {
      minX: 0,
      minY: 0,
      width: 160,
      height: 100,
    })
    expect(size).toEqual({ width: 512, height: 320 })
  })

  it("bumps leaves to 256×149 (smaller detail, aspect preserved)", () => {
    const size = targetRasterSize("plant_leaf_01", {
      minX: 0,
      minY: 0,
      width: 96,
      height: 56,
    })
    expect(size).toEqual({ width: 256, height: 149 })
  })
})

describe("buildPlantVariants", () => {
  const texture = (label: string) =>
    new Texture({ source: Texture.WHITE.source, label })

  it("retains complete species while omitting only incomplete species", () => {
    const textures = {
      plant_shared_seedling: texture("seedling"),
      plant_shared_sprout: texture("sprout"),
      plant_violet_bud: texture("violet-bud"),
      plant_violet_half: texture("violet-half"),
      plant_violet_full: texture("violet-full"),
      plant_blue_bud: texture("blue-bud"),
      plant_blue_half: texture("blue-half"),
      // Blue full and every orange/green species texture are absent.
    }

    const variants = buildPlantVariants(textures)
    expect(variants?.violet).toEqual({
      seedling: textures.plant_shared_seedling,
      sprout: textures.plant_shared_sprout,
      bud: textures.plant_violet_bud,
      halfBloom: textures.plant_violet_half,
      fullBloom: textures.plant_violet_full,
    })
    expect(variants?.blue).toBeUndefined()
    expect(variants?.orange).toBeUndefined()
    expect(variants?.green).toBeUndefined()
  })

  it("returns null when shared seedling or sprout is unavailable", () => {
    expect(
      buildPlantVariants({
        plant_shared_seedling: texture("seedling"),
        plant_violet_bud: texture("violet-bud"),
        plant_violet_half: texture("violet-half"),
        plant_violet_full: texture("violet-full"),
      }),
    ).toBeNull()
  })
})

describe("parseSvgViewBox", () => {
  it("reads width/height from viewBox", () => {
    expect(parseSvgViewBox('<svg viewBox="0 0 1920 350"></svg>')).toEqual({
      minX: 0,
      minY: 0,
      width: 1920,
      height: 350,
    })
  })
})

describe("isRasterUrl", () => {
  it("detects file paths and query-hashed PNGs", () => {
    expect(isRasterUrl("/assets/kenney-sun-01.png")).toBe(true)
    expect(isRasterUrl("/assets/foo.png?v=1")).toBe(true)
    expect(isRasterUrl("/assets/photo.jpg")).toBe(true)
  })

  it("detects Vite-inlined data:image/png|jpeg URLs (production bug)", () => {
    expect(isRasterUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true)
    expect(isRasterUrl("data:image/jpeg;base64,/9j/4AAQ=")).toBe(true)
    expect(isRasterUrl("data:image/jpg;base64,xx")).toBe(true)
  })

  it("does not treat SVG data URIs or plain SVG paths as raster", () => {
    expect(isRasterUrl("data:image/svg+xml,%3Csvg")).toBe(false)
    expect(isRasterUrl("/assets/sky-day.svg")).toBe(false)
    expect(isRasterUrl("data:image/svg+xml;charset=utf-8,x")).toBe(false)
  })
})

describe("loadGardenSceneAssets ownership", () => {
  it("releases only its uncached textures once and survives one destroy failure", async () => {
    class ImageFake {
      decoding = "auto"
      crossOrigin: string | null = null
      naturalWidth = 64
      naturalHeight = 64
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    interface CanvasFakeInstance {
      width: number
      height: number
      getContext(): CanvasRenderingContext2D
    }
    function CanvasFake(this: CanvasFakeInstance): void {
      this.width = 0
      this.height = 0
      this.getContext = () =>
        ({
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
        }) as unknown as CanvasRenderingContext2D
    }
    const createCanvasFake = () =>
      new (CanvasFake as unknown as new () => CanvasFakeInstance)()

    vi.stubGlobal("Image", ImageFake)
    vi.stubGlobal("HTMLImageElement", ImageFake)
    vi.stubGlobal("HTMLCanvasElement", CanvasFake)
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        expect(tag).toBe("canvas")
        return createCanvasFake()
      },
    })
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 64 64"></svg>',
    }))

    const sharedResource = createCanvasFake()
    sharedResource.width = 64
    sharedResource.height = 64
    const sharedSource = TextureSource.from(
      sharedResource as unknown as HTMLCanvasElement,
    )
    const destroySharedSource = vi.spyOn(sharedSource, "destroy")
    vi.spyOn(TextureSource, "from").mockReturnValue(sharedSource)

    const loaded = await loadGardenSceneAssets(TEST_PALETTE)
    const owned = Object.values(loaded.texturesByAlias)
    expect(owned.length).toBeGreaterThan(2)
    expect(loaded.release).toBeTypeOf("function")

    const first = owned[0]!
    const second = owned[1]!
    expect(first.source).toBe(sharedSource)
    expect(second.source).toBe(sharedSource)
    const firstDestroy = vi.spyOn(first, "destroy").mockImplementation(() => {
      throw new Error("first texture destroy failed")
    })
    const secondDestroy = vi.spyOn(second, "destroy")
    const sharedOutside = new Texture({ source: Texture.WHITE.source })
    const cacheReplacement = new Texture({ source: Texture.WHITE.source })
    const resourceKey = first.source.resource
    Cache.set(resourceKey, cacheReplacement)

    loaded.release?.()
    loaded.release?.()

    expect(firstDestroy).toHaveBeenCalledTimes(1)
    expect(secondDestroy).toHaveBeenCalledTimes(1)
    expect(destroySharedSource).toHaveBeenCalledTimes(1)
    expect(second.destroyed).toBe(true)
    expect(first.source.destroyed).toBe(true)
    expect(sharedOutside.destroyed).toBe(false)
    expect(cacheReplacement.destroyed).toBe(false)
    expect(Cache.get(resourceKey)).toBe(cacheReplacement)

    Cache.remove(resourceKey)
    sharedOutside.destroy(false)
    cacheReplacement.destroy(false)
  })
})

describe("GARDEN_SCENE_ASSET_URLS", () => {
  it("exposes Vite URLs for every required alias", () => {
    for (const alias of GARDEN_SCENE_REQUIRED_ALIASES) {
      expect(GARDEN_SCENE_ASSET_URLS[alias]).toBeTruthy()
      expect(typeof GARDEN_SCENE_ASSET_URLS[alias]).toBe("string")
    }
  })

  it("includes layer + plant head coverage", () => {
    expect(GARDEN_SCENE_ASSET_URLS.bg_sky_day).toMatch(/sky-day/)
    expect(GARDEN_SCENE_ASSET_URLS.plant_head_round).toMatch(
      /flower-head-round/,
    )
    expect(GARDEN_SCENE_ASSET_URLS.env_fence_white).toMatch(/fence-white/)
  })

  it("production URLs never use /placeholders/ public path", () => {
    for (const [alias, url] of Object.entries(GARDEN_SCENE_ASSET_URLS)) {
      // Path segment only — inline SVG comments may contain the word "placeholder".
      expect(url, alias).not.toMatch(/\/placeholders\//i)
      expect(url, alias).not.toMatch(/(^|\/)placeholder\//i)
    }
  })

  it("exposes Vite URLs for all 14 Fluent plant stage assets", () => {
    const fluentAliases = [
      "plant_shared_seedling",
      "plant_shared_sprout",
      "plant_violet_bud",
      "plant_violet_half",
      "plant_violet_full",
      "plant_blue_bud",
      "plant_blue_half",
      "plant_blue_full",
      "plant_orange_bud",
      "plant_orange_half",
      "plant_orange_full",
      "plant_green_bud",
      "plant_green_half",
      "plant_green_full",
    ] as const
    for (const alias of fluentAliases) {
      expect(GARDEN_SCENE_ASSET_URLS[alias], alias).toBeTruthy()
      expect(typeof GARDEN_SCENE_ASSET_URLS[alias]).toBe("string")
    }
    // All 14 are also mandatory.
    for (const alias of fluentAliases) {
      expect(GARDEN_SCENE_REQUIRED_ALIASES).toContain(alias)
    }
  })

  it("Fluent plant assets are rasterized at 512x512 (preserveSourceColors)", () => {
    const size = targetRasterSize("plant_violet_full", {
      minX: 0,
      minY: 0,
      width: 32,
      height: 32,
    })
    expect(size).toEqual({ width: 512, height: 512 })
  })

  it("uses the full-color Fluent pot at a crisp 4:3 raster size", () => {
    expect(GARDEN_SCENE_ASSET_URLS.plant_pot_01).toMatch(
      /optimized\/plants\/shared\/pot\.svg/,
    )

    const size = targetRasterSize("plant_pot_01", {
      minX: 0,
      minY: 0,
      width: 16,
      height: 12,
    })
    expect(size).toEqual({ width: 512, height: 384 })
  })
})

describe("Garden atmosphere assets (Task 3)", () => {
  const ATMOSPHERE_ALIASES = [
    "env_bird_distant_wings_up",
    "env_bird_distant_wings_down",
    "env_wind_leaf_01",
    "env_wind_leaf_02",
    "env_mote_soft",
    "env_pollen_soft",
    "env_sparkle_soft",
    "env_ring_soft",
  ] as const

  it("requires every atmosphere alias", () => {
    for (const alias of ATMOSPHERE_ALIASES) {
      expect(GARDEN_SCENE_REQUIRED_ALIASES).toContain(alias)
    }
  })

  it("exposes a Vite-resolved URL for every atmosphere alias", () => {
    for (const alias of ATMOSPHERE_ALIASES) {
      const url = GARDEN_SCENE_ASSET_URLS[alias]
      expect(url, alias).toBeTruthy()
      expect(typeof url, alias).toBe("string")
      // Vite may inline small SVGs as data URLs (asset inline threshold). Accept
      // either the hashed public asset path OR a data: URI carrying the alias's
      // file name so the contract stays observable across build configs.
      const fileStem = alias.replace(/^env_/, "").replace(/_/g, "-")
      const ok =
        url.includes(`/optimized/atmosphere/${fileStem}`) ||
        url.includes(encodeURIComponent(fileStem)) ||
        url.startsWith("data:")
      expect(ok, `${alias}=${url}`).toBe(true)
    }
  })

  it("buildAtmosphereTextures pulls every atmosphere alias into the typed shape", () => {
    const texture = (label: string) =>
      new Texture({ source: Texture.WHITE.source, label })
    const leaves = [texture("leaf-01"), texture("leaf-02")]
    const out = buildAtmosphereTextures({
      env_bird_distant_wings_up: texture("bird-up"),
      env_bird_distant_wings_down: texture("bird-down"),
      env_wind_leaf_01: leaves[0]!,
      env_wind_leaf_02: leaves[1]!,
      env_mote_soft: texture("mote"),
      env_pollen_soft: texture("pollen"),
      env_sparkle_soft: texture("sparkle"),
      env_ring_soft: texture("ring"),
    })
    expect(out.birdUp).toBeDefined()
    expect(out.birdDown).toBeDefined()
    expect(out.windLeaves).toHaveLength(2)
    expect(out.windLeaves[0]).toBe(leaves[0])
    expect(out.windLeaves[1]).toBe(leaves[1])
    expect(out.mote).toBeDefined()
    expect(out.pollen).toBeDefined()
    expect(out.sparkle).toBeDefined()
    expect(out.ring).toBeDefined()
  })

  it("buildAtmosphereTextures degrades to null fields when entries are missing", () => {
    const out = buildAtmosphereTextures({})
    expect(out.birdUp).toBeNull()
    expect(out.birdDown).toBeNull()
    expect(out.windLeaves).toEqual([])
    expect(out.mote).toBeNull()
    expect(out.pollen).toBeNull()
    expect(out.sparkle).toBeNull()
    expect(out.ring).toBeNull()
  })

  it("buildAtmosphereTextures only retains present leaf textures", () => {
    const texture = (label: string) =>
      new Texture({ source: Texture.WHITE.source, label })
    const out = buildAtmosphereTextures({
      env_wind_leaf_01: texture("leaf-01"),
      // env_wind_leaf_02 intentionally absent
    })
    expect(out.windLeaves).toHaveLength(1)
  })
})
