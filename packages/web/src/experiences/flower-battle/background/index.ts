export {
  CURRENT_GARDEN_RECIPE_VERSION,
  createGardenBackgroundRecipe,
  FALLBACK_GARDEN_BACKGROUND_RECIPE,
} from "./createGardenBackgroundRecipe"
export {
  GARDEN_BOUNDARIES,
  GARDEN_CLOUDS,
  GARDEN_DISTANT_FEATURES,
  GARDEN_EDGE_FOLIAGE,
  GARDEN_HORIZONS,
  GARDEN_SKY_PALETTES,
} from "./garden-background.catalog"
export {
  GARDEN_BOUNDARY_COUNT,
  GARDEN_CLOUD_MAX_COUNT,
  GARDEN_CLOUD_MIN_COUNT,
  GARDEN_CLOUD_STATIC_UNDER_REDUCED_MOTION,
  GARDEN_DISTANT_FEATURE_MAX_COUNT,
  GARDEN_EDGE_FOLIAGE_BAND_WIDTH_PERCENT,
  GARDEN_EDGE_FOLIAGE_MAX_COUNT,
  GARDEN_EDGE_FOLIAGE_MIN_COUNT,
  GARDEN_EDGE_FOLIAGE_SIDES,
  GARDEN_HORIZON_COUNT,
} from "./garden-safe-zones"
export type {
  GardenBackgroundRecipe,
  GardenBoundaryId,
  GardenCloudId,
  GardenCloudPlacement,
  GardenDistantFeatureId,
  GardenEdgeFoliageId,
  GardenEdgeFoliagePlacement,
  GardenEdgeFoliageSide,
  GardenHorizonId,
  GardenRecipeVersion,
  GardenSkyPaletteId,
} from "./garden-background.types"
