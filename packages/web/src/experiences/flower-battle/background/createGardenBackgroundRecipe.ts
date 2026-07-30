/**
 * createGardenBackgroundRecipe.ts — deterministic garden-background
 * composition (WP-FLB-11, SDD §16, asset-inventory §B.9).
 *
 * Pure function: same `(seed, recipeVersion)` always yields byte-identical
 * output. No network, no Date/Math.random, no storage, no DOM, no gameplay
 * assets, no ad-hoc RGB/HSL — only stable catalog IDs (see
 * garden-background.catalog.ts). Seed source is exclusively
 * `createSeededRandom` from experiences/shared/random (E-09) — no local
 * PRNG fork. `stableVisualSeed` is not used here: this function receives an
 * already-derived seed string (matching the Rust-generated
 * `FlowerBattleBackground.seed`, produced upstream), not raw
 * {gameId,revision,...} context — there is nothing left to combine.
 */
import { createSeededRandom } from "../../shared/random/createSeededRandom"
import {
  GARDEN_BOUNDARIES,
  GARDEN_CLOUDS,
  GARDEN_DISTANT_FEATURES,
  GARDEN_EDGE_FOLIAGE,
  GARDEN_HORIZONS,
  GARDEN_SKY_PALETTES,
} from "./garden-background.catalog"
import type {
  GardenBackgroundRecipe,
  GardenCloudPlacement,
  GardenEdgeFoliagePlacement,
  GardenRecipeVersion,
} from "./garden-background.types"
import {
  GARDEN_CLOUD_MAX_COUNT,
  GARDEN_CLOUD_MIN_COUNT,
  GARDEN_EDGE_FOLIAGE_MAX_COUNT,
  GARDEN_EDGE_FOLIAGE_MIN_COUNT,
  GARDEN_EDGE_FOLIAGE_SIDES,
} from "./garden-safe-zones"

/** The only version this catalog currently understands. */
export const CURRENT_GARDEN_RECIPE_VERSION: GardenRecipeVersion = 1

/**
 * Fully static fallback for an unknown/future recipeVersion — no randomness,
 * so it never depends on `seed` and never throws. Uses the first entry of
 * every register plus the safe-zone minimums.
 */
export const FALLBACK_GARDEN_BACKGROUND_RECIPE: GardenBackgroundRecipe = {
  recipeVersion: CURRENT_GARDEN_RECIPE_VERSION,
  sky: GARDEN_SKY_PALETTES[0],
  clouds: [
    { id: GARDEN_CLOUDS[0], mirrored: false },
    { id: GARDEN_CLOUDS[1], mirrored: false },
  ],
  horizon: GARDEN_HORIZONS[0],
  boundary: GARDEN_BOUNDARIES[0],
  edgeFoliage: [
    { id: GARDEN_EDGE_FOLIAGE[0], side: "left", mirrored: false },
    { id: GARDEN_EDGE_FOLIAGE[1], side: "right", mirrored: false },
  ],
  distantFeature: null,
}

/** [0, poolSize) — relies on createSeededRandom always returning [0, 1). */
function pickIndex(random: () => number, poolSize: number): number {
  return Math.floor(random() * poolSize)
}

/** Uniform integer in [min, max] inclusive. */
function pickCount(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

/**
 * `count` unique indices into [0, poolSize) via partial Fisher-Yates —
 * simple, deterministic given the PRNG stream, no constraint solver.
 */
function pickUniqueIndices(
  random: () => number,
  poolSize: number,
  count: number,
): number[] {
  const pool = Array.from({ length: poolSize }, (_, index) => index)
  for (let i = 0; i < count; i += 1) {
    const j = i + pickIndex(random, poolSize - i)
    const swap = pool[i]
    pool[i] = pool[j]
    pool[j] = swap
  }
  return pool.slice(0, count)
}

/**
 * Composes a deterministic garden background from a seed + recipe version.
 *
 * @param seed - Already-derived deterministic seed string (e.g. from the
 *   server-issued `FlowerBattleBackground.seed`).
 * @param recipeVersion - Recipe schema version. Anything other than
 *   {@link CURRENT_GARDEN_RECIPE_VERSION} returns
 *   {@link FALLBACK_GARDEN_BACKGROUND_RECIPE} unconditionally (never throws).
 */
export function createGardenBackgroundRecipe(
  seed: string,
  recipeVersion: number,
): GardenBackgroundRecipe {
  if (recipeVersion !== CURRENT_GARDEN_RECIPE_VERSION) {
    return FALLBACK_GARDEN_BACKGROUND_RECIPE
  }

  const random = createSeededRandom(seed)

  const sky = GARDEN_SKY_PALETTES[pickIndex(random, GARDEN_SKY_PALETTES.length)]

  const cloudCount = pickCount(random, GARDEN_CLOUD_MIN_COUNT, GARDEN_CLOUD_MAX_COUNT)
  const clouds: GardenCloudPlacement[] = pickUniqueIndices(
    random,
    GARDEN_CLOUDS.length,
    cloudCount,
  ).map((index) => ({ id: GARDEN_CLOUDS[index], mirrored: random() < 0.5 }))

  const horizon = GARDEN_HORIZONS[pickIndex(random, GARDEN_HORIZONS.length)]
  const boundary = GARDEN_BOUNDARIES[pickIndex(random, GARDEN_BOUNDARIES.length)]

  const edgeFoliageCount = pickCount(
    random,
    GARDEN_EDGE_FOLIAGE_MIN_COUNT,
    GARDEN_EDGE_FOLIAGE_MAX_COUNT,
  )
  const edgeFoliage: GardenEdgeFoliagePlacement[] = pickUniqueIndices(
    random,
    GARDEN_EDGE_FOLIAGE.length,
    edgeFoliageCount,
  ).map((index) => ({
    id: GARDEN_EDGE_FOLIAGE[index],
    side: GARDEN_EDGE_FOLIAGE_SIDES[pickIndex(random, GARDEN_EDGE_FOLIAGE_SIDES.length)],
    mirrored: random() < 0.5,
  }))

  const hasDistantFeature = random() < 0.5
  const distantFeature = hasDistantFeature
    ? GARDEN_DISTANT_FEATURES[pickIndex(random, GARDEN_DISTANT_FEATURES.length)]
    : null

  return {
    recipeVersion: CURRENT_GARDEN_RECIPE_VERSION,
    sky,
    clouds,
    horizon,
    boundary,
    edgeFoliage,
    distantFeature,
  }
}
