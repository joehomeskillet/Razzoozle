import { describe, expect, it } from "vitest"

import {
  bakeSvgForPixi,
  ensureSvgIntrinsicSize,
  hexToCssColor,
  isRasterUrl,
  normalizeSvgViewBox,
  parseSvgViewBox,
  targetRasterSize,
} from "../loadGardenSceneAssets"
import {
  GARDEN_SCENE_ASSET_URLS,
  GARDEN_SCENE_REQUIRED_ALIASES,
} from "../garden-scene-asset-urls"

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
    expect(size).toEqual({ width: 256, height: 256 })
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
})
