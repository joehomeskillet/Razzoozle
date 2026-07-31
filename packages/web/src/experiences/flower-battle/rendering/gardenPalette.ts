/**
 * Garden scene palette bound to project theme tokens (WP-PIX-05A).
 * No hardcoded production colors — every channel is a CssTokenName.
 *
 * WP-PRESENTER-3: extended with the atmospheric layer roles so the new
 * 13-layer scene graph (sky → distant hills → distant bushes → mid trees →
 * fence → grass → soil → flower teams → weather → powerup → ambient →
 * presenter hud → event banner) can resolve per-layer colors via the same
 * single token-source / theme-token resolver pipeline.
 *
 * All tokens are existing CssTokenName entries — no new design tokens are
 * introduced here. New semantic keys map to the closest existing palette
 * channel (e.g. cloud → surface, sun → accent, fence → field-cream).
 */

import type { CssTokenName } from "@razzoozle/common/theme-tokens"

import {
  resolveThemeTokenColor,
  type ThemeColorResolver,
} from "./resolveThemeColor"

export interface GardenPalette {
  // Backdrop / sky
  sky: number
  sun: number
  cloud: number
  // Distant hills
  hillBack: number
  hillMid: number
  // Distant bushes + mid trees
  bushBack: number
  bushMid: number
  midground: number
  // Fence
  fence: number
  // Grass + soil
  grass: number
  soil: number
  soilEdge: number
  // Foreground frame
  foreground: number
  // Plant visuals
  plantStem: number
  plantLeaf: number
  plantPetal: number
  // Reused compatibility aliases (preserve existing public field names)
  hillsFar: number
  hillsNear: number
  clouds: number
  // Team-meter frame on the soil lip
  teamMeterFrame: number
}

/** Semantic token map for the procedural garden (WP-PRESENTER-3 extended). */
export const GARDEN_PALETTE_TOKENS = {
  sky: "--flower-battle-sky",
  sun: "--flower-battle-sun",
  cloud: "--flower-battle-cloud",
  hillBack: "--flower-battle-hill-back",
  hillMid: "--flower-battle-hill-mid",
  bushBack: "--flower-battle-bush",
  bushMid: "--flower-battle-bush",
  midground: "--flower-battle-bush",
  fence: "--flower-battle-fence",
  grass: "--flower-battle-grass",
  soil: "--flower-battle-soil",
  soilEdge: "--flower-battle-soil",
  foreground: "--flower-battle-foreground",
  plantStem: "--flower-battle-ink",
  plantLeaf: "--flower-battle-bush",
  plantPetal: "--flower-battle-primary",
  hillsFar: "--flower-battle-hill-back",
  hillsNear: "--flower-battle-hill-mid",
  clouds: "--flower-battle-cloud",
  teamMeterFrame: "--flower-battle-ink",
} as const satisfies Record<keyof GardenPalette, CssTokenName>

/** Stable team order for plot tinting (matches TEAMS / presenter slots). */
export const TEAM_PLOT_COLOR_TOKENS = [
  "--team-red",
  "--team-blue",
  "--team-green",
  "--team-yellow",
] as const satisfies readonly CssTokenName[]

export function resolveGardenPalette(
  resolveColor: ThemeColorResolver = resolveThemeTokenColor,
): GardenPalette {
  const entries = Object.entries(GARDEN_PALETTE_TOKENS) as Array<
    [keyof GardenPalette, CssTokenName]
  >
  const palette = {} as GardenPalette
  for (const [key, token] of entries) {
    palette[key] = resolveColor(token)
  }
  return palette
}

export function resolveTeamPlotColors(
  teamCount: number,
  resolveColor: ThemeColorResolver = resolveThemeTokenColor,
): number[] {
  const colors: number[] = []
  const n = Math.min(teamCount, TEAM_PLOT_COLOR_TOKENS.length)
  for (let i = 0; i < n; i += 1) {
    colors.push(resolveColor(TEAM_PLOT_COLOR_TOKENS[i]!))
  }
  return colors
}
