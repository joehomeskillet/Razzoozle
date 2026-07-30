/**
 * garden-background.catalog.ts — the six stable ID registers for the Garden
 * Background Recipe (WP-FLB-11, SDD §16). Plain readonly ID lists — no
 * selection logic, no positions, no colors (see
 * docs/design/flower-battle-asset-inventory.md §B for the approved raw
 * materials each register maps to).
 *
 * IDs are derived from the asset inventory's named categories where it names
 * concrete items (sky palettes §B.10, horizons §B.5, boundaries §B.6,
 * distant features §B.8). The inventory only gives *counts* for clouds
 * (§B.4, 6 silhouettes) and edge foliage (§B.7, 8 clusters) without naming
 * each one yet, since no concrete SVGs exist there yet — those IDs are
 * descriptive placeholders that a future asset-import WP can rename without
 * touching selection logic (`createGardenBackgroundRecipe` only ever
 * indexes into these arrays, never hardcodes a literal id).
 */
import type {
  GardenBoundaryId,
  GardenCloudId,
  GardenDistantFeatureId,
  GardenEdgeFoliageId,
  GardenHorizonId,
  GardenSkyPaletteId,
} from "./garden-background.types"

/** §B.10 — four approved bright sky palettes. No night/dark preset. */
export const GARDEN_SKY_PALETTES: readonly GardenSkyPaletteId[] = [
  "morning",
  "midday",
  "warm-afternoon",
  "soft-overcast",
]

/** §B.4 — six fixed cloud silhouettes. */
export const GARDEN_CLOUDS: readonly GardenCloudId[] = [
  "cloud-small-round",
  "cloud-large-round",
  "cloud-wisp",
  "cloud-stacked",
  "cloud-flat",
  "cloud-puffy",
]

/** §B.5 — four canonical horizon modules (hills, tree line, orchard, hedge). */
export const GARDEN_HORIZONS: readonly GardenHorizonId[] = [
  "hills",
  "tree-line",
  "orchard",
  "low-hedge",
]

/** §B.6 — three canonical boundary modules (picket fence, rail fence, hedge). */
export const GARDEN_BOUNDARIES: readonly GardenBoundaryId[] = [
  "picket-fence",
  "rail-fence",
  "hedge",
]

/** §B.7 — eight curated edge-foliage clusters, outer 8% band only. */
export const GARDEN_EDGE_FOLIAGE: readonly GardenEdgeFoliageId[] = [
  "bush-round",
  "bush-tall",
  "shrub-low",
  "grass-tuft",
  "fern-cluster",
  "leaf-cluster",
  "flower-tuft",
  "hedge-sprig",
]

/** §B.8 — three optional distant features (shed, greenhouse, birdhouse). */
export const GARDEN_DISTANT_FEATURES: readonly GardenDistantFeatureId[] = [
  "shed",
  "greenhouse",
  "birdhouse",
]
