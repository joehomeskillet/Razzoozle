/**
 * Procedural PixiJS v8 garden scene (WP-PIX-05A).
 *
 * - One stable root Container with ordered layers
 * - Fixed logical viewport + letterbox fit on updateLayout
 * - Plot anchors from viewport + team count/order only
 * - updateSnapshot mutates the same root/actors (no new Application/canvas/root)
 * - Idempotent destroy
 *
 * Does not edit host lifecycle types; implements GardenScene + updateSnapshot.
 *
 * SDD §30 (probe-v3): tracks a monotonic `revision` counter alongside the
 * per-plant team roster so the E2E identity exposes BOTH the normalized
 * state vector AND the stable Pixi object references — a probe can cross-
 * check them in a single call rather than relying on canvas existence.
 */

import { Container } from "pixi.js"

import type {
  GardenE2EIdentity,
  GardenPixiApplicationHandle,
  GardenScene,
} from "../garden-pixi.types"
import { defaultPlantColors, DummyPlantView } from "./DummyPlantView"
import {
  resolveGardenPalette,
  resolveTeamPlotColors,
  type GardenPalette,
} from "./gardenPalette"
import {
  createGardenLayers,
  LAYER_LABELS,
  syncPlotSoil,
  type GardenLayerSet,
} from "./gardenLayers"
import {
  fitLogicalViewport,
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
} from "./gardenViewport"
import {
  computePlotAnchors,
  MAX_PLOT_TEAMS,
  type PlotAnchor,
} from "./plotAnchors"
import {
  resolveThemeTokenColor,
  type ThemeColorResolver,
} from "./resolveThemeColor"

export interface GardenSceneTeamSnapshot {
  name: string
  growthStage: number
}

export interface GardenSceneSnapshot {
  teams: readonly GardenSceneTeamSnapshot[]
  /** Optional phase label for tests / future HUD — does not move anchors. */
  phase?: string
}

export interface ProceduralGardenScene extends GardenScene {
  readonly root: Container
  readonly layers: Readonly<GardenLayerSet>
  readonly phase: string | null
  /**
   * SDD §30 probe-v3: normalized-state revision. Increments on every
   * successful `updateSnapshot`. Same value across two probes means no
   * further normalization happened in between.
   */
  readonly revision: number
  updateSnapshot(snapshot: GardenSceneSnapshot): void
  getE2EIdentity(): GardenE2EIdentity
  getPlotAnchors(): readonly PlotAnchor[]
  getLogicalSize(): { width: number; height: number }
  getLetterbox(): ReturnType<typeof fitLogicalViewport> | null
}

export interface CreateGardenSceneOptions {
  /** Inject a fully resolved palette (tests). */
  palette?: GardenPalette
  /** Inject token → color resolution (tests / SSR). */
  resolveColor?: ThemeColorResolver
  /**
   * When false, root is not attached to app.stage (tests that only inspect the
   * scene graph). Default true when stage is present.
   */
  attachToStage?: boolean
}

type StageHost = GardenPixiApplicationHandle & {
  stage?: { addChild: (child: Container) => unknown }
}

export function createGardenScene(
  app: GardenPixiApplicationHandle,
  options: CreateGardenSceneOptions = {},
): ProceduralGardenScene {
  const resolveColor = options.resolveColor ?? resolveThemeTokenColor
  const palette = options.palette ?? resolveGardenPalette(resolveColor)

  const root = new Container()
  root.label = "garden-root"

  const layers = createGardenLayers(palette)
  for (const layer of layers.ordered) {
    root.addChild(layer)
  }

  const attach = options.attachToStage !== false
  const stage = (app as StageHost).stage
  if (attach && stage) {
    stage.addChild(root)
  }

  let destroyed = false
  let letterbox: ReturnType<typeof fitLogicalViewport> | null = null
  let anchors: PlotAnchor[] = []
  let phase: string | null = null
  let lastTeamCount = 0
  // SDD §30 probe-v3: monotonic normalized-state revision counter.
  let revision = 0
  const plants: DummyPlantView[] = []
  const teamNames: string[] = []
  let teamTints: number[] = []

  function ensureTeamTints(count: number): void {
    if (teamTints.length >= count) return
    if (options.resolveColor) {
      teamTints = resolveTeamPlotColors(count, options.resolveColor)
      return
    }
    if (options.palette) {
      // Injected palette (tests / offline): reuse already-resolved channels —
      // never invent hex literals and never touch the live DOM.
      teamTints = [
        options.palette.plantPetal,
        options.palette.hillsNear,
        options.palette.plantLeaf,
        options.palette.hillsFar,
      ]
      return
    }
    teamTints = resolveTeamPlotColors(count, resolveThemeTokenColor)
  }

  function rebuildPlotsForCount(teamCount: number): void {
    const nextAnchors = computePlotAnchors(teamCount)
    anchors = nextAnchors
    lastTeamCount = teamCount
    ensureTeamTints(teamCount)
    syncPlotSoil(
      layers.plots,
      anchors,
      palette.soil,
      palette.soilEdge,
      teamTints,
      palette.teamMeterFrame,
    )

    // Grow/shrink plant views while reusing existing instances by index.
    while (plants.length > teamCount) {
      const removed = plants.pop()
      removed?.destroy()
    }
    while (teamNames.length > teamCount) {
      teamNames.pop()
    }
    while (plants.length < teamCount) {
      const index = plants.length
      const tint = teamTints[index] ?? palette.plantPetal
      const plant = new DummyPlantView(
        {
          ...defaultPlantColors(palette),
          petal: tint,
        },
        `actor-plant-${index}`,
      )
      plants.push(plant)
      // SDD §30 probe-v3: per-plant team name parallel to the actorPlants
      // array; defaults to "" until the next updateSnapshot applies a name.
      teamNames.push("")
      layers.actors.addChild(plant.root)
    }

    for (let i = 0; i < plants.length; i += 1) {
      const anchor = anchors[i]!
      const plant = plants[i]!
      plant.root.position.set(anchor.x, anchor.y)
    }
  }

  const scene: ProceduralGardenScene = {
    get root() {
      return root
    },
    get layers() {
      return layers
    },
    get phase() {
      return phase
    },
    get revision() {
      return revision
    },

    getPlotAnchors() {
      return anchors
    },

    getLogicalSize() {
      return { width: GARDEN_LOGICAL_WIDTH, height: GARDEN_LOGICAL_HEIGHT }
    },

    getLetterbox() {
      return letterbox
    },

    getE2EIdentity(): GardenE2EIdentity {
      // SDD §30 probe-v3: every per-plant parallel array is sliced to the
      // teamNames length (= the snapshot team count, NOT the layout-padded
      // plant count) so identity.* stays length-aligned with the wire
      // roster. Layout-padded plants carry no team identity and would
      // otherwise leak placeholder values (empty name, growth 0) into
      // the probe.
      const count = teamNames.length
      return {
        root,
        actorPlants: plants.slice(0, count).map((plant) => plant.root),
        labels: plants
          .slice(0, count)
          .map((_, index) => `actor-plant-${index}`),
        revision,
        teamNames: teamNames.slice(),
        growthStages: plants
          .slice(0, count)
          .map((plant) => plant.getGrowthStage()),
      }
    },

    updateLayout(width: number, height: number): void {
      if (destroyed) return
      letterbox = fitLogicalViewport(width, height)
      root.scale.set(letterbox.scale)
      root.position.set(letterbox.offsetX, letterbox.offsetY)
    },

    updateSnapshot(snapshot: GardenSceneSnapshot): void {
      if (destroyed) return
      phase = snapshot.phase ?? null

      const teams = snapshot.teams.slice(0, MAX_PLOT_TEAMS)
      // Supported presenter range is 2–4; pad layout count to min 2 for anchors.
      const layoutCount = Math.max(2, teams.length || 2)
      const count = Math.min(MAX_PLOT_TEAMS, layoutCount)

      if (count !== lastTeamCount || anchors.length === 0) {
        rebuildPlotsForCount(count)
      }

      // Growth / phase only — never recompute anchors when count is stable.
      for (let i = 0; i < plants.length; i += 1) {
        const team = teams[i]
        const plant = plants[i]!
        plant.setGrowthStage(team?.growthStage ?? 0)
        // SDD §30 probe-v3: record the team name bound to this plant slot
        // so the E2E identity carries the normalized team identity, not
        // just a positional index. teamNames follows the snapshot team
        // count (not the layout-padded count) so probes can rely on
        // length parity with the wire roster.
        teamNames[i] = team?.name ?? ""
        // Keep plant on its ground anchor (defensive against accidental moves).
        const anchor = anchors[i]
        if (anchor) {
          plant.root.position.set(anchor.x, anchor.y)
        }
      }
      // SDD §30 probe-v3: drop padded slots beyond the snapshot team
      // count so teamNames.length === teams.length even when layout pads
      // to a minimum of 2 anchors for visual stability.
      while (teamNames.length > teams.length) {
        teamNames.pop()
      }
      // SDD §30 probe-v3: bump revision exactly once per applied snapshot,
      // even when the team count stays stable — the cross-check between
      // identity.revision and identity.teamNames depends on it.
      revision += 1
    },

    destroy(): void {
      if (destroyed) return
      destroyed = true
      for (const plant of plants) {
        plant.destroy()
      }
      plants.length = 0
      teamNames.length = 0
      anchors = []
      lastTeamCount = 0
      if (root.parent) {
        root.parent.removeChild(root)
      }
      root.destroy({ children: true })
    },
  }

  // Initial layout from current renderer size when available.
  const rw = app.renderer?.width ?? GARDEN_LOGICAL_WIDTH
  const rh = app.renderer?.height ?? GARDEN_LOGICAL_HEIGHT
  scene.updateLayout(rw, rh)

  return scene
}

/** Stable layer order contract for tests and docs. */
export { LAYER_LABELS }
