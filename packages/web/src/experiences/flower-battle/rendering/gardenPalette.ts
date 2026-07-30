/**
 * Garden scene palette bound to project theme tokens (WP-PIX-05A).
 * No hardcoded production colors — every channel is a CssTokenName.
 */

import type { CssTokenName } from "@razzoozle/common/theme-tokens"

import {
  resolveThemeTokenColor,
  type ThemeColorResolver,
} from "./resolveThemeColor"

export interface GardenPalette {
  sky: number
  hillsFar: number
  hillsNear: number
  clouds: number
  midground: number
  soil: number
  soilEdge: number
  foreground: number
  plantStem: number
  plantLeaf: number
  plantPetal: number
}

/** Semantic token map for the procedural garden. */
export const GARDEN_PALETTE_TOKENS = {
  sky: "--surface-2",
  hillsFar: "--team-green",
  hillsNear: "--state-correct",
  clouds: "--surface",
  midground: "--team-green-ring",
  soil: "--color-field-cream",
  soilEdge: "--surface-muted",
  foreground: "--surface-3",
  plantStem: "--status-online-text",
  plantLeaf: "--team-green-ring",
  plantPetal: "--status-online-bg",
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
