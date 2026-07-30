/**
 * garden-background.types.ts — shared shapes for the Garden Background
 * Recipe (WP-FLB-11, SDD §16). Pure type definitions, no logic.
 *
 * Mirrors the Rust-generated `FlowerBattleBackground` binding
 * (rust/protocol/bindings/FlowerBattleBackground.ts: `{ seed: string,
 * recipeVersion: number }`) in spirit — `createGardenBackgroundRecipe`
 * consumes that same `{seed, recipeVersion}` shape as its two parameters.
 */

/**
 * The only recipe version this catalog currently supports. Mirrors Rust's
 * `FLOWER_BATTLE_RECIPE_VERSION` (always `1` today). Kept as a literal type
 * so catalog code can exhaustively branch on known versions; the recipe
 * function itself still accepts plain `number` for the actual
 * `FlowerBattleBackground.recipeVersion` field, since an unknown/future
 * version must fall back gracefully rather than fail to type-check.
 */
export type GardenRecipeVersion = 1

export type GardenSkyPaletteId =
  | "morning"
  | "midday"
  | "warm-afternoon"
  | "soft-overcast"

export type GardenCloudId =
  | "cloud-small-round"
  | "cloud-large-round"
  | "cloud-wisp"
  | "cloud-stacked"
  | "cloud-flat"
  | "cloud-puffy"

export type GardenHorizonId = "hills" | "tree-line" | "orchard" | "low-hedge"

export type GardenBoundaryId = "picket-fence" | "rail-fence" | "hedge"

export type GardenEdgeFoliageId =
  | "bush-round"
  | "bush-tall"
  | "shrub-low"
  | "grass-tuft"
  | "fern-cluster"
  | "leaf-cluster"
  | "flower-tuft"
  | "hedge-sprig"

export type GardenDistantFeatureId = "shed" | "greenhouse" | "birdhouse"

export type GardenEdgeFoliageSide = "left" | "right"

/** A single placed cloud (bounded scale/mirror live in the catalog/renderer). */
export interface GardenCloudPlacement {
  id: GardenCloudId
  mirrored: boolean
}

/** A single placed edge-foliage cluster — outer 8% band, left or right slot. */
export interface GardenEdgeFoliagePlacement {
  id: GardenEdgeFoliageId
  side: GardenEdgeFoliageSide
  mirrored: boolean
}

/**
 * Deterministic output of `createGardenBackgroundRecipe`. Decorative-only —
 * never references a fixed gameplay asset (SDD §16 / asset-inventory §A).
 */
export interface GardenBackgroundRecipe {
  recipeVersion: GardenRecipeVersion
  /** Exactly one sky palette. */
  sky: GardenSkyPaletteId
  /** 2–4 unique clouds. */
  clouds: GardenCloudPlacement[]
  /** Exactly one horizon module. */
  horizon: GardenHorizonId
  /** Exactly one boundary module. */
  boundary: GardenBoundaryId
  /** 2–4 unique edge-foliage clusters. */
  edgeFoliage: GardenEdgeFoliagePlacement[]
  /** Zero or one distant feature. */
  distantFeature: GardenDistantFeatureId | null
}
