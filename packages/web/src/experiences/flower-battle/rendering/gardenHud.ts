/**
 * Garden HUD wiring — combines Team-HUD widgets, Event-Banner queue, and the
 * power-up legend strip into a single set bound to the GardenScene layer set
 * (WP-PRESENTER-5).
 *
 * The factory is intentionally side-effect free: it never touches the scene
 * graph outside the layer containers the host provides. Callers add the
 * returned controllers to their preferred Pixi tick / ticker wiring.
 */

import { Container } from "pixi.js"

import { TEAMS } from "@razzoozle/common/constants"

import {
  type EventBannerController,
  buildEventBannerController,
  resolveEventBannerPalette,
} from "./eventBanner"
import type { GardenLayerSet } from "./gardenLayers"
import {
  type PowerupLegendLabels,
  buildPowerupLegend,
  resolvePowerupLegendPalette,
} from "./powerupLegend"
import {
  type TeamHudPalette,
  buildTeamHud,
  resolveTeamHudPalette,
} from "./teamHud"
import {
  resolveThemeTokenColor,
  type ThemeColorResolver,
} from "./resolveThemeColor"
import { resolveTeamPlotColors } from "./gardenPalette"

const TEAM_COLOR_TOKEN_BY_INDEX = [
  "--team-red",
  "--team-blue",
  "--team-green",
  "--team-yellow",
] as const

/** Map a 0-based team index to its design token. Clamped to the 4 known teams. */
export function teamColorTokenFor(index: number): (typeof TEAM_COLOR_TOKEN_BY_INDEX)[number] {
  const idx = Math.max(0, Math.min(TEAM_COLOR_TOKEN_BY_INDEX.length - 1, index))
  return TEAM_COLOR_TOKEN_BY_INDEX[idx]!
}

export interface TeamHudEntry {
  name: string
  growthCurrent: number
  growthMax?: number
  sunCurrent: number
  sunMax?: number
  chipText?: string
}

export interface GardenHudOptions {
  /** Resolved team roster (1–4 entries). */
  teams: readonly TeamHudEntry[]
  /** Plot anchors in logical pixels (from `computePlotAnchors`). */
  anchors: readonly { x: number; y: number; index: number }[]
  /** Localised power-up labels. */
  powerupLabels: PowerupLegendLabels
  /** Inject pre-resolved palette (tests). */
  resolveColor?: ThemeColorResolver
  /** Honor prefers-reduced-motion (host should pass the live flag). */
  prefersReducedMotion?: boolean
}

export interface GardenHudController {
  readonly layerSet: GardenLayerSet
  readonly hudContainers: readonly Container[]
  readonly eventBanner: EventBannerController
  readonly legend: Container
  readonly teamHudPalette: TeamHudPalette
  /** Tick the event banner timeline. Call from the host ticker. */
  tickEventBanner(deltaMs: number): void
  /** Update one team's HUD (rebuild only the affected slot). */
  updateTeam(index: number, entry: TeamHudEntry): void
  /** Push a new event onto the banner queue. */
  pushEvent(event: Parameters<EventBannerController["push"]>[0]): void
  /** Drop the banner queue. */
  clearEvents(): void
  /** Toggle a power-up legend indicator. */
  setLegendActive(
    kind: Parameters<
      NonNullable<
        (Container & { setActive?: (k: string, v: boolean) => void })["setActive"]
      >
    >[0],
    active: boolean,
  ): void
}

/**
 * Wire the HUD layers: presenter-hud receives the per-team widgets +
 * legend; event-banner receives the bubble controller. Returns a single
 * controller the host calls from its ticker.
 */
export function createGardenHud(
  layers: GardenLayerSet,
  options: GardenHudOptions,
): GardenHudController {
  const resolveColor = options.resolveColor ?? resolveThemeTokenColor
  const hudPalette = resolveTeamHudPalette(resolveColor)
  const bannerPalette = resolveEventBannerPalette(resolveColor)
  const legendPalette = resolvePowerupLegendPalette(resolveColor)
  const teamTints = resolveTeamPlotColors(
    Math.max(2, options.teams.length || 2),
    resolveColor,
  )

  // Build per-team HUD containers, anchored to the supplied plot positions.
  const hudContainers: Container[] = options.teams.map((team, index) => {
    const anchor = options.anchors.find((a) => a.index === index)
      ?? { x: 0, y: 0, index }
    const teamColor = teamTints[index] ?? resolveColor(teamColorTokenFor(index))
    return buildTeamHud({
      anchor: { x: anchor.x, y: anchor.y },
      teamName: team.name || TEAMS[index] || `Team ${index + 1}`,
      teamColor,
      palette: hudPalette,
      growthCurrent: team.growthCurrent,
      growthMax: team.growthMax,
      sunCurrent: team.sunCurrent,
      sunMax: team.sunMax,
      chipText: team.chipText,
    })
  })

  for (const hud of hudContainers) {
    layers.presenterHud.addChild(hud)
  }

  // Legend strip — single container, centered bottom edge.
  const legend = buildPowerupLegend({
    palette: legendPalette,
    labels: options.powerupLabels,
  })
  layers.presenterHud.addChild(legend)

  // Event banner — owns its own queue + animation timeline.
  const eventBanner = buildEventBannerController({
    palette: bannerPalette,
    onAdvance: () => {
      /* host ticker wiring is responsible for downstream calls */
    },
    prefersReducedMotion: options.prefersReducedMotion,
  })
  layers.eventBanner.addChild(eventBanner.container)

  return {
    layerSet: layers,
    hudContainers,
    eventBanner,
    legend,
    teamHudPalette: hudPalette,
    tickEventBanner(deltaMs) {
      eventBanner.tick(deltaMs)
    },
    updateTeam(index, entry) {
      const old = hudContainers[index]
      if (!old) return
      const anchor = options.anchors.find((a) => a.index === index)
        ?? { x: 0, y: 0, index }
      const teamColor = teamTints[index] ?? resolveColor(teamColorTokenFor(index))
      const next = buildTeamHud({
        anchor: { x: anchor.x, y: anchor.y },
        teamName: entry.name || TEAMS[index] || `Team ${index + 1}`,
        teamColor,
        palette: hudPalette,
        growthCurrent: entry.growthCurrent,
        growthMax: entry.growthMax,
        sunCurrent: entry.sunCurrent,
        sunMax: entry.sunMax,
        chipText: entry.chipText,
      })
      const parent = old.parent
      if (parent) {
        parent.addChildAt(next, parent.getChildIndex(old))
        old.destroy({ children: true })
      }
      hudContainers[index] = next
    },
    pushEvent(event) {
      eventBanner.push(event)
    },
    clearEvents() {
      eventBanner.clear()
    },
    setLegendActive(kind, active) {
      const fn = (legend as Container & {
        setActive?: (k: string, v: boolean) => void
      }).setActive
      if (typeof fn === "function") {
        fn.call(legend, String(kind), active)
      }
    },
  }
}
