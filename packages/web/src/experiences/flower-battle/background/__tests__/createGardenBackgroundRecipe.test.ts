import { describe, expect, it } from "vitest"

import {
  GARDEN_BOUNDARIES,
  GARDEN_CLOUDS,
  GARDEN_DISTANT_FEATURES,
  GARDEN_EDGE_FOLIAGE,
  GARDEN_HORIZONS,
  GARDEN_SKY_PALETTES,
} from "../garden-background.catalog"
import {
  CURRENT_GARDEN_RECIPE_VERSION,
  createGardenBackgroundRecipe,
  FALLBACK_GARDEN_BACKGROUND_RECIPE,
} from "../createGardenBackgroundRecipe"
import {
  GARDEN_CLOUD_MAX_COUNT,
  GARDEN_CLOUD_MIN_COUNT,
  GARDEN_EDGE_FOLIAGE_MAX_COUNT,
  GARDEN_EDGE_FOLIAGE_MIN_COUNT,
} from "../garden-safe-zones"

const SEEDS_100 = Array.from({ length: 100 }, (_, index) => `garden-seed-${index}`)

describe("createGardenBackgroundRecipe — determinism", () => {
  it("same seed + version always yields byte-identical output (100 seeds)", () => {
    for (const seed of SEEDS_100) {
      const first = createGardenBackgroundRecipe(seed, CURRENT_GARDEN_RECIPE_VERSION)
      const second = createGardenBackgroundRecipe(seed, CURRENT_GARDEN_RECIPE_VERSION)
      expect(second).toEqual(first)
    }
  })

  it("different seeds are not all identical (sanity — not a constant function)", () => {
    const results = SEEDS_100.map((seed) =>
      JSON.stringify(createGardenBackgroundRecipe(seed, CURRENT_GARDEN_RECIPE_VERSION)),
    )
    expect(new Set(results).size).toBeGreaterThan(1)
  })
})

describe("createGardenBackgroundRecipe — cardinalities (100 seeds)", () => {
  const recipes = SEEDS_100.map((seed) =>
    createGardenBackgroundRecipe(seed, CURRENT_GARDEN_RECIPE_VERSION),
  )

  it("exactly one sky palette, always a catalog id", () => {
    for (const recipe of recipes) {
      expect(GARDEN_SKY_PALETTES).toContain(recipe.sky)
    }
  })

  it("2-4 unique clouds, all catalog ids", () => {
    for (const recipe of recipes) {
      expect(recipe.clouds.length).toBeGreaterThanOrEqual(GARDEN_CLOUD_MIN_COUNT)
      expect(recipe.clouds.length).toBeLessThanOrEqual(GARDEN_CLOUD_MAX_COUNT)
      const ids = recipe.clouds.map((cloud) => cloud.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) {
        expect(GARDEN_CLOUDS).toContain(id)
      }
    }
  })

  it("exactly one horizon module, a catalog id", () => {
    for (const recipe of recipes) {
      expect(GARDEN_HORIZONS).toContain(recipe.horizon)
    }
  })

  it("exactly one boundary module, a catalog id", () => {
    for (const recipe of recipes) {
      expect(GARDEN_BOUNDARIES).toContain(recipe.boundary)
    }
  })

  it("2-4 unique edge-foliage clusters, all catalog ids with a left/right side", () => {
    for (const recipe of recipes) {
      expect(recipe.edgeFoliage.length).toBeGreaterThanOrEqual(
        GARDEN_EDGE_FOLIAGE_MIN_COUNT,
      )
      expect(recipe.edgeFoliage.length).toBeLessThanOrEqual(GARDEN_EDGE_FOLIAGE_MAX_COUNT)
      const ids = recipe.edgeFoliage.map((item) => item.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const item of recipe.edgeFoliage) {
        expect(GARDEN_EDGE_FOLIAGE).toContain(item.id)
        expect(["left", "right"]).toContain(item.side)
      }
    }
  })

  it("0-1 distant feature, null or a catalog id — never more than one", () => {
    for (const recipe of recipes) {
      if (recipe.distantFeature !== null) {
        expect(GARDEN_DISTANT_FEATURES).toContain(recipe.distantFeature)
      }
    }
  })

  it("no gameplay-asset ids ever appear in any register or recipe (SDD §16 boundary)", () => {
    const forbidden = ["fertilizer", "umbrella", "sunbeam", "acid-rain", "watering-can"]
    for (const recipe of recipes) {
      const serialized = JSON.stringify(recipe)
      for (const banned of forbidden) {
        expect(serialized).not.toContain(banned)
      }
    }
  })
})

describe("createGardenBackgroundRecipe — fallback for unknown recipeVersion", () => {
  it.each([0, 2, 99, -1, Number.NaN])(
    "recipeVersion %s falls back to the static preset regardless of seed",
    (badVersion) => {
      const a = createGardenBackgroundRecipe("any-seed-a", badVersion)
      const b = createGardenBackgroundRecipe("completely-different-seed-b", badVersion)
      expect(a).toEqual(FALLBACK_GARDEN_BACKGROUND_RECIPE)
      expect(b).toEqual(FALLBACK_GARDEN_BACKGROUND_RECIPE)
    },
  )

  it("fallback never throws and never depends on the seed", () => {
    expect(() => createGardenBackgroundRecipe("", 7)).not.toThrow()
    expect(createGardenBackgroundRecipe("", 7)).toEqual(
      FALLBACK_GARDEN_BACKGROUND_RECIPE,
    )
  })
})

describe("createGardenBackgroundRecipe — hard literals (regression pins)", () => {
  // Computed once from the implementation and pinned here — any future
  // algorithm change that shifts the PRNG consumption order must update
  // these literals deliberately, not silently.
  it("seed 'garden-seed-alpha' v1 produces a pinned recipe", () => {
    expect(createGardenBackgroundRecipe("garden-seed-alpha", 1)).toEqual({
      recipeVersion: 1,
      sky: "midday",
      clouds: [
        { id: "cloud-wisp", mirrored: true },
        { id: "cloud-puffy", mirrored: false },
        { id: "cloud-flat", mirrored: true },
      ],
      horizon: "low-hedge",
      boundary: "rail-fence",
      edgeFoliage: [
        { id: "bush-tall", side: "left", mirrored: false },
        { id: "flower-tuft", side: "left", mirrored: true },
        { id: "fern-cluster", side: "left", mirrored: true },
      ],
      distantFeature: "greenhouse",
    })
  })

  it("seed 'garden-seed-beta' v1 produces a pinned recipe", () => {
    expect(createGardenBackgroundRecipe("garden-seed-beta", 1)).toEqual({
      recipeVersion: 1,
      sky: "warm-afternoon",
      clouds: [
        { id: "cloud-wisp", mirrored: true },
        { id: "cloud-large-round", mirrored: true },
        { id: "cloud-flat", mirrored: false },
        { id: "cloud-stacked", mirrored: false },
      ],
      horizon: "low-hedge",
      boundary: "hedge",
      edgeFoliage: [
        { id: "hedge-sprig", side: "right", mirrored: true },
        { id: "leaf-cluster", side: "right", mirrored: true },
        { id: "bush-round", side: "left", mirrored: false },
        { id: "flower-tuft", side: "left", mirrored: false },
      ],
      distantFeature: null,
    })
  })

  it("seed 'garden-seed-gamma' v1 produces a pinned recipe", () => {
    expect(createGardenBackgroundRecipe("garden-seed-gamma", 1)).toEqual({
      recipeVersion: 1,
      sky: "warm-afternoon",
      clouds: [
        { id: "cloud-stacked", mirrored: true },
        { id: "cloud-small-round", mirrored: false },
      ],
      horizon: "tree-line",
      boundary: "hedge",
      edgeFoliage: [
        { id: "flower-tuft", side: "right", mirrored: true },
        { id: "hedge-sprig", side: "right", mirrored: true },
        { id: "grass-tuft", side: "right", mirrored: false },
        { id: "fern-cluster", side: "left", mirrored: true },
      ],
      distantFeature: "birdhouse",
    })
  })
})
