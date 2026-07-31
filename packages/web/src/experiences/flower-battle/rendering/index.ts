/**
 * Flower Battle procedural rendering core (WP-PIX-05A).
 * Public surface for host injection via attachOptions.createScene.
 */

export {
  createGardenScene,
  LAYER_LABELS,
  type CreateGardenSceneOptions,
  type GardenSceneSnapshot,
  type GardenSceneTeamSnapshot,
  type ProceduralGardenScene,
} from "./GardenScene"

export {
  fitLogicalViewport,
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
  type LetterboxTransform,
} from "./gardenViewport"

export {
  computePlotAnchors,
  MAX_PLOT_TEAMS,
  MIN_PLOT_TEAMS,
  normalizePlotTeamCount,
  type PlotAnchor,
} from "./plotAnchors"

export {
  GARDEN_PALETTE_TOKENS,
  resolveGardenPalette,
  resolveTeamPlotColors,
  TEAM_PLOT_COLOR_TOKENS,
  type GardenPalette,
} from "./gardenPalette"

export {
  cssColorToPixiNumber,
  resolveThemeTokenColor,
  THEME_TOKEN_COLOR_ERROR,
  ThemeTokenColorError,
  type ThemeColorResolver,
} from "./resolveThemeColor"

export { DummyPlantView } from "./DummyPlantView"

export {
  createTeamFlower,
  updateTeamFlower,
  TEAM_COLOR_TOKENS,
  TEAM_FLOWER_TEAM_IDS,
  TEAM_FLOWER_GROWTH_STAGES,
  type ActivePlantEffect,
  type CreateTeamFlowerOptions,
  type GrowthStage,
  type PlantFace,
  type TeamColorToken,
  type TeamFlowerInstance,
  type TeamFlowerViewport,
  type TeamId,
} from "./teamFlowerFactory"

export {
  FLOWER_HEAD_BASE_DIAMETER_PX,
  STAGE_HEAD_RATIO,
  STAGE_HEIGHT_FACTOR,
  STAGE_LEAF_COUNT,
} from "./flowerHeads"

export {
  TeamPlantPlot,
  useTeamPlantPlot,
  type TeamPlantPlotHandle,
  type TeamPlantPlotProps,
  type TeamPlantSlotSpec,
} from "./TeamPlantPlot"

export {
  buildEventBannerController,
  EventBannerQueue,
  EVENT_BANNER_TOKENS,
  FADE_IN_MS as EVENT_BANNER_FADE_IN_MS,
  HOLD_MS as EVENT_BANNER_HOLD_MS,
  FADE_OUT_MS as EVENT_BANNER_FADE_OUT_MS,
  getEventBannerTokenCssVar,
  resolveEventBannerPalette,
  type EventBannerController,
  type EventBannerInput,
  type EventBannerKind,
  type EventBannerPalette,
} from "./eventBanner"

export {
  buildPowerupLegend,
  getPowerupLegendTokenCssVar,
  POWERUP_KINDS,
  POWERUP_LEGEND_TOKENS,
  resolvePowerupLegendPalette,
  type PowerupKind,
  type PowerupLegendLabels,
  type PowerupLegendPalette,
} from "./powerupLegend"

export {
  buildSegmentedGrowthMeter,
  buildStatusChip,
  buildTeamHud,
  buildTeamLabel,
  getTeamHudTokenCssVar,
  resolveTeamHudPalette,
  TEAM_HUD_TOKENS,
  type SegmentedGrowthMeterOptions,
  type StatusChipOptions,
  type TeamColorTokens,
  type TeamHudOptions,
  type TeamHudPalette,
  type TeamLabelOptions,
} from "./teamHud"

export {
  createGardenHud,
  teamColorTokenFor,
  type GardenHudController,
  type GardenHudOptions,
  type TeamHudEntry,
} from "./gardenHud"
