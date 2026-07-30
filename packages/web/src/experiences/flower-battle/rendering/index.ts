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
