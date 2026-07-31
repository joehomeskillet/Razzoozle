import { describe, expect, it } from "vitest"

import {
  bakeSvgForPixi,
  hexToCssColor,
  normalizeSvgViewBox,
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
    expect(out).toContain('translate(40 40)')
    expect(out).toContain("</g></svg>")
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
    expect(GARDEN_SCENE_ASSET_URLS.plant_head_round).toMatch(/flower-head-round/)
    expect(GARDEN_SCENE_ASSET_URLS.env_fence_white).toMatch(/fence-white/)
  })
})
