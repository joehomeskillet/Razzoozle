/**
 * Vite-resolved URLs for Flower Battle production garden SVGs.
 *
 * Paths are hashed by the bundler; never hard-code public/ absolute URLs.
 * Aliases match `garden-asset-manifest.json` / `GARDEN_LAYER_ASSET_ALIASES`.
 */

import skyDayUrl from "../../../assets/experiences/flower-battle/optimized/fixed/sky-day.svg?url"
import sunGlowUrl from "../../../assets/experiences/flower-battle/optimized/fixed/sun-glow.svg?url"
import cloud01Url from "../../../assets/experiences/flower-battle/optimized/fixed/cloud-soft-01.svg?url"
import cloud02Url from "../../../assets/experiences/flower-battle/optimized/fixed/cloud-soft-02.svg?url"
import cloud03Url from "../../../assets/experiences/flower-battle/optimized/fixed/cloud-soft-03.svg?url"
import distantHillsUrl from "../../../assets/experiences/flower-battle/optimized/fixed/distant-hills-01.svg?url"
import distantBushesUrl from "../../../assets/experiences/flower-battle/optimized/fixed/distant-bushes-01.svg?url"
import midTreesUrl from "../../../assets/experiences/flower-battle/optimized/fixed/mid-trees-01.svg?url"
import fenceUrl from "../../../assets/experiences/flower-battle/optimized/fixed/fence-white-01.svg?url"
import lawnUrl from "../../../assets/experiences/flower-battle/optimized/fixed/lawn-01.svg?url"
import lawnDetailUrl from "../../../assets/experiences/flower-battle/optimized/fixed/lawn-detail-grass-tufts-01.svg?url"
import soilPlotUrl from "../../../assets/experiences/flower-battle/optimized/fixed/soil-plot-team-01.svg?url"
import foregroundLeafLeftUrl from "../../../assets/experiences/flower-battle/optimized/fixed/foreground-leaf-left.svg?url"
import foregroundLeafRightUrl from "../../../assets/experiences/flower-battle/optimized/fixed/foreground-leaf-right.svg?url"
import foregroundBushUrl from "../../../assets/experiences/flower-battle/optimized/fixed/foreground-bush-01.svg?url"
import flowerHeadRoundUrl from "../../../assets/experiences/flower-battle/optimized/fixed/flower-head-round.svg?url"
import flowerHeadBellUrl from "../../../assets/experiences/flower-battle/optimized/fixed/flower-head-bell.svg?url"
import flowerHeadSunUrl from "../../../assets/experiences/flower-battle/optimized/fixed/flower-head-sun.svg?url"
import flowerHeadTulipUrl from "../../../assets/experiences/flower-battle/optimized/fixed/flower-head-tulip.svg?url"
import faceHappyUrl from "../../../assets/experiences/flower-battle/optimized/fixed/face-emotes-face-emote-happy-01.svg?url"

/** Stable Pixi / diagnostics alias → Vite-hashed asset URL. */
export const GARDEN_SCENE_ASSET_URLS = {
  bg_sky_day: skyDayUrl,
  bg_sun_glow: sunGlowUrl,
  bg_cloud_01: cloud01Url,
  bg_cloud_02: cloud02Url,
  bg_cloud_03: cloud03Url,
  bg_hill_back_01: distantHillsUrl,
  bg_bush_back_01: distantBushesUrl,
  bg_tree_mid_01: midTreesUrl,
  env_fence_white: fenceUrl,
  env_grass_base: lawnUrl,
  env_grass_detail_01: lawnDetailUrl,
  env_soil_plot_01: soilPlotUrl,
  env_foreground_leaf_left: foregroundLeafLeftUrl,
  env_foreground_leaf_right: foregroundLeafRightUrl,
  env_foreground_bush_01: foregroundBushUrl,
  plant_head_round: flowerHeadRoundUrl,
  plant_head_bell: flowerHeadBellUrl,
  plant_head_sun: flowerHeadSunUrl,
  plant_head_tulip: flowerHeadTulipUrl,
  face_emote_happy: faceHappyUrl,
} as const

export type GardenSceneAssetAlias = keyof typeof GARDEN_SCENE_ASSET_URLS

/** Mandatory aliases for the happy-path garden scene (no silent fallback). */
export const GARDEN_SCENE_REQUIRED_ALIASES = [
  "bg_sky_day",
  "bg_sun_glow",
  "bg_cloud_01",
  "bg_cloud_02",
  "bg_cloud_03",
  "bg_hill_back_01",
  "bg_bush_back_01",
  "bg_tree_mid_01",
  "env_fence_white",
  "env_grass_base",
  "env_soil_plot_01",
  "env_foreground_leaf_left",
  "env_foreground_leaf_right",
  "plant_head_round",
  "plant_head_bell",
  "plant_head_sun",
  "plant_head_tulip",
] as const satisfies readonly GardenSceneAssetAlias[]

export type GardenSceneRequiredAlias =
  (typeof GARDEN_SCENE_REQUIRED_ALIASES)[number]
