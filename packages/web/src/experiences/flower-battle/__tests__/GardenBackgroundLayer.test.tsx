// Unit tests for GardenBackgroundLayer (WP-958B foundation-visuals fix).
//
// Pure TS/TSX — no jsdom, no Testing Library. Assertions use React's server
// renderer (renderToStaticMarkup) against the rendered HTML string, mirroring
// the sibling FlowerGardenScene.test.tsx pattern. Tests assert observable
// structure (which catalog ids render, opacity/border regressions), not the
// fix's internal layout math — real pixel/overlap verification is
// e2e-deferred (jsdom performs no CSS layout).

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  GARDEN_BOUNDARIES,
  GARDEN_CLOUDS,
  GARDEN_DISTANT_FEATURES,
  GARDEN_EDGE_FOLIAGE,
  GARDEN_HORIZONS,
  GARDEN_SKY_PALETTES,
} from "../background/garden-background.catalog"
import { GardenBackgroundLayer } from "../GardenBackgroundLayer"

const ALL_CATALOG_IDS = [
  ...GARDEN_SKY_PALETTES,
  ...GARDEN_CLOUDS,
  ...GARDEN_HORIZONS,
  ...GARDEN_BOUNDARIES,
  ...GARDEN_EDGE_FOLIAGE,
  ...GARDEN_DISTANT_FEATURES,
]

const SEEDS_100 = Array.from({ length: 100 }, (_, index) => `garden-bg-seed-${index}`)

describe("GardenBackgroundLayer", () => {
  it("renders the composed background container with recipe metadata", () => {
    const html = renderToStaticMarkup(
      <GardenBackgroundLayer seed="fixed-seed" recipeVersion={1} />,
    )
    expect(html).toContain('data-testid="garden-background-layer"')
    expect(html).toMatch(/data-recipe-version="1"/)
    expect(html).toMatch(/data-sky="[a-z-]+"/)
  })

  it("every catalog register (sky/cloud/horizon/boundary/edge-foliage/distant) renders as an opaque element across enough seeds", () => {
    const seen = new Set<string>()
    for (const seed of SEEDS_100) {
      const html = renderToStaticMarkup(
        <GardenBackgroundLayer seed={seed} recipeVersion={1} />,
      )
      for (const id of ALL_CATALOG_IDS) {
        if (html.includes(`data-testid="garden-catalog-${id}"`)) {
          seen.add(id)
        }
      }
    }
    const missing = ALL_CATALOG_IDS.filter((id) => !seen.has(id))
    expect(missing).toEqual([])
  })

  it("never renders the dashed debug-placeholder look (border-dashed / border-line)", () => {
    const html = renderToStaticMarkup(
      <GardenBackgroundLayer seed="debug-tile-regression" recipeVersion={1} />,
    )
    expect(html).not.toContain("border-dashed")
    expect(html).not.toContain("border-line")
  })

  it("renders the sky layer fully opaque (no translucent bg-*/NN utility) so the app-wide icon backdrop never shows through", () => {
    for (const seed of ["opacity-check-a", "opacity-check-b", "opacity-check-c"]) {
      const html = renderToStaticMarkup(
        <GardenBackgroundLayer seed={seed} recipeVersion={1} />,
      )
      const skyMatch = html.match(
        /data-testid="garden-catalog-[a-z-]+"[^>]*data-layer="sky"[^>]*class="([^"]*)"/,
      )
      expect(skyMatch).not.toBeNull()
      expect(skyMatch![1]).not.toMatch(/bg-\S+\/\d+/)
      expect(skyMatch![1]).toMatch(/\bbg-\S+/)
    }
  })

  it("is deterministic for the same seed + recipeVersion pair", () => {
    const first = renderToStaticMarkup(
      <GardenBackgroundLayer seed={4242} recipeVersion="1" />,
    )
    const second = renderToStaticMarkup(
      <GardenBackgroundLayer seed={4242} recipeVersion="1" />,
    )
    expect(first).toBe(second)
  })
})
