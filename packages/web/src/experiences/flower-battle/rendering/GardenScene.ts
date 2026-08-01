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

import { Container, Texture } from "pixi.js"

import type {
  GardenAssetDiagnostics,
  PlantBodyTextures,
  PlantHeadTextures,
  PlantVariantTextures,
} from "../assets/loadGardenSceneAssets"
import type {
  GardenE2EIdentity,
  GardenPixiApplicationHandle,
  GardenScene,
} from "../garden-pixi.types"
import { TEAM_PLANT_KEYS } from "../assets/loadGardenSceneAssets"
import { AssetPlantView } from "./AssetPlantView"
import {
  defaultPlantColors,
  DummyPlantView,
  plantHeadKeyForIndex,
} from "./DummyPlantView"
import {
  resolveGardenPalette,
  resolveTeamPlotColors,
  type GardenPalette,
} from "./gardenPalette"
import {
  createGardenLayers,
  LAYER_LABELS,
  layoutSkyForVisibleRect,
  syncPlotSoil,
  type GardenLayerSet,
  type LayerAssets,
} from "./gardenLayers"
import {
  computeVisibleLogicalRect,
  fitLogicalViewport,
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
  type LetterboxTransform,
  type LogicalRect,
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
import {
  buildTeamHud,
  resolveTeamHudPalette,
  type TeamHudPalette,
} from "./teamHud"

export interface GardenSceneTeamSnapshot {
  name: string
  growthStage: number
}

export interface GardenSceneSnapshot {
  teams: readonly GardenSceneTeamSnapshot[]
  /** Optional phase label for tests / future HUD — does not move anchors. */
  phase?: string
}

/**
 * Layout probe for the immersive experience contract (WP §16.2).
 * All rect values are in *logical* scene coordinates so tests can assert
 * the safe-content contract without a real canvas.
 */
export interface GardenLayoutDiagnostics {
  viewport: { width: number; height: number }
  letterbox: LetterboxTransform | null
  visibleRect: LogicalRect | null
  plotAnchors: readonly { x: number; y: number }[]
  /** Per-plant world bounds re-projected into logical coordinates. */
  plantBoundsLogical: readonly LogicalRect[]
  allAnchorsInsideVisibleRect: boolean
  allPlantsInsideVisibleRect: boolean
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
  /** Asset-load diagnostics from the attach path (null when procedural-only). */
  readonly assetDiagnostics: GardenAssetDiagnostics | null
  updateSnapshot(snapshot: GardenSceneSnapshot): void
  getE2EIdentity(): GardenE2EIdentity
  getPlotAnchors(): readonly PlotAnchor[]
  getLogicalSize(): { width: number; height: number }
  getLetterbox(): ReturnType<typeof fitLogicalViewport> | null
  /** Visible logical band after cover-crop (null before first layout). */
  getVisibleRect(): LogicalRect | null
  getLayoutDiagnostics(): GardenLayoutDiagnostics
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
  /** Preloaded layer textures (production path after loadGardenSceneAssets). */
  layerAssets?: LayerAssets
  /** Preloaded flower-head textures per style. */
  plantHeads?: Partial<PlantHeadTextures>
  /** Preloaded stem / leaf / pot body textures for asset-built flowers. */
  plantBody?: PlantBodyTextures
  /**
   * Full-color Fluent production plant stage textures per species. When
   * present, high-quality `AssetPlantView` is used instead of DummyPlantView.
   */
  plantVariants?: PlantVariantTextures | null
  /**
   * Honours `prefers-reduced-motion`: disables the stage transition
   * (AssetPlantView). Forwarded from the attach path.
   */
  prefersReducedMotion?: boolean
  /** Diagnostics snapshot for E2E / window probe. */
  assetDiagnostics?: GardenAssetDiagnostics | null
}

type StageHost = GardenPixiApplicationHandle & {
  stage?: { addChild: (child: Container) => unknown }
  ticker?: {
    add?: (fn: (ticker: { deltaTime: number }) => void) => void
    remove?: (fn: (ticker: { deltaTime: number }) => void) => void
  }
}

export function createGardenScene(
  app: GardenPixiApplicationHandle,
  options: CreateGardenSceneOptions = {},
): ProceduralGardenScene {
  const resolveColor = options.resolveColor ?? resolveThemeTokenColor
  const palette = options.palette ?? resolveGardenPalette(resolveColor)
  const layerAssets = options.layerAssets
  const plantHeads = options.plantHeads
  const plantBody = options.plantBody
  const plantVariants = options.plantVariants ?? null
  const prefersReducedMotion = options.prefersReducedMotion ?? false
  const assetDiagnostics = options.assetDiagnostics ?? null

  const root = new Container()
  root.label = "garden-root"

  const layers = createGardenLayers(palette, layerAssets)
  for (const layer of layers.ordered) {
    root.addChild(layer)
  }

  const attach = options.attachToStage !== false
  const stageHost = app as StageHost
  const stage = stageHost.stage
  if (attach && stage) {
    stage.addChild(root)
  }

  // Soft cloud parallax (P1) — far clouds drift slower than near clouds.
  const cloudSprites = layers.sky.children.filter(
    (c) => typeof c.label === "string" && c.label.startsWith("cloud-sprite-"),
  )
  const cloudBaseX = cloudSprites.map((c) => c.x)
  let parallaxT = 0
  const onTick = (ticker: { deltaTime: number }): void => {
    if (destroyed) return
    parallaxT += ticker.deltaTime * 0.012
    for (let i = 0; i < cloudSprites.length; i += 1) {
      const spr = cloudSprites[i]!
      const far = String(spr.label).includes("far")
      const amp = far ? 18 : 36
      const speed = far ? 0.35 : 0.7
      spr.x = cloudBaseX[i]! + Math.sin(parallaxT * speed + i) * amp
    }
    // Drive per-plant stage transitions (AssetPlantView only; no-op otherwise).
    for (const plant of plants) {
      if (plant instanceof AssetPlantView) {
        plant.update(ticker.deltaTime)
      }
    }
  }
  if (typeof stageHost.ticker?.add === "function") {
    stageHost.ticker.add(onTick)
  }

  let destroyed = false
  let letterbox: ReturnType<typeof fitLogicalViewport> | null = null
  let lastVisibleRect: LogicalRect | null = null
  let anchors: PlotAnchor[] = []
  let phase: string | null = null
  let lastTeamCount = 0
  // SDD §30 probe-v3: monotonic normalized-state revision counter.
  let revision = 0
  // Union: AssetPlantView when Fluent variants are available, else DummyPlantView.
  type PlantView = DummyPlantView | AssetPlantView
  const plants: PlantView[] = []
  const teamNames: string[] = []
  /** Per-plot team HUD containers on `layers.presenterHud` (parallel to real teams). */
  const teamHuds: Container[] = []
  let teamTints: number[] = []

  /**
   * Team-HUD palette: theme resolver when available; otherwise derive from the
   * already-resolved garden palette so tests/offline never touch the DOM.
   */
  const teamHudPalette: TeamHudPalette = options.resolveColor
    ? resolveTeamHudPalette(options.resolveColor)
    : {
        labelFill: palette.fence,
        labelText: palette.teamMeterFrame,
        meterFill: palette.fence,
        meterTrack: palette.soilEdge,
        chipFill: palette.fence,
        chipText: palette.teamMeterFrame,
      }

  function headTextureForIndex(index: number): Texture | undefined {
    if (!plantHeads) return undefined
    const key = plantHeadKeyForIndex(index)
    return plantHeads[key]
  }

  function ensureTeamTints(count: number): void {
    if (teamTints.length >= count) return
    // Production attach passes `palette` but team petal colours MUST come from
    // --team-red/blue/green/yellow — not reused hill/leaf palette channels
    // (which washed teams 1–3 into greens). Prefer live team tokens always.
    const resolver = options.resolveColor ?? resolveThemeTokenColor
    try {
      const resolved = resolveTeamPlotColors(count, resolver)
      if (resolved.length > 0) {
        teamTints = resolved.slice()
        while (teamTints.length < count) {
          teamTints.push(resolved[teamTints.length % resolved.length]!)
        }
        return
      }
    } catch {
      // Theme tokens unavailable (unit tests without CSS vars).
    }
    if (options.palette) {
      // Offline fallback: distinct palette channels only (no hill greens for blue).
      const fallback = [
        options.palette.plantPetal,
        options.palette.sun,
        options.palette.plantLeaf,
        options.palette.sky,
      ]
      teamTints = []
      for (let i = 0; i < count; i += 1) {
        teamTints.push(fallback[i % fallback.length]!)
      }
      return
    }
    teamTints = resolveTeamPlotColors(count, resolveThemeTokenColor)
  }

  function destroyTeamHud(hud: Container): void {
    if (hud.parent) {
      hud.parent.removeChild(hud)
    }
    hud.destroy({ children: true })
  }

  /**
   * Build or replace the per-plot team HUD under the plant (presenterHud).
   * Name + 0–10 segmented growth meter; sun meter stays 0 until host wires sun.
   */
  function setTeamHud(index: number, name: string, growthStage: number): void {
    const anchor = anchors[index] ?? { x: 0, y: 0, index }
    const tint = teamTints[index] ?? palette.plantPetal
    const next = buildTeamHud({
      anchor: { x: anchor.x, y: anchor.y },
      teamName: name || `Team ${index + 1}`,
      teamColor: tint,
      palette: teamHudPalette,
      growthCurrent: growthStage,
      growthMax: 10,
      sunCurrent: 0,
      sunMax: 3,
    })
    next.label = `team-hud-${index}`

    const old = teamHuds[index]
    if (old?.parent) {
      old.parent.addChildAt(next, old.parent.getChildIndex(old))
      destroyTeamHud(old)
    } else {
      if (old) destroyTeamHud(old)
      layers.presenterHud.addChild(next)
    }
    teamHuds[index] = next
  }

  /** Grow/shrink/update team HUDs to match the live roster (not layout padding). */
  function syncTeamHuds(teams: readonly GardenSceneTeamSnapshot[]): void {
    while (teamHuds.length > teams.length) {
      const removed = teamHuds.pop()
      if (removed) destroyTeamHud(removed)
    }
    for (let i = 0; i < teams.length; i += 1) {
      const team = teams[i]!
      setTeamHud(i, team.name, team.growthStage)
    }
  }

  /** Reposition existing HUDs after anchor moves without changing roster data. */
  function relayoutTeamHuds(): void {
    const count = teamNames.length
    for (let i = 0; i < count; i += 1) {
      const growth = plants[i]?.getGrowthStage() ?? 0
      setTeamHud(i, teamNames[i] ?? "", growth)
    }
  }

  function rebuildPlotsForCount(teamCount: number): void {
    const nextAnchors = computePlotAnchors(
      teamCount,
      GARDEN_LOGICAL_WIDTH,
      GARDEN_LOGICAL_HEIGHT,
      lastVisibleRect ?? undefined,
    )
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
      layerAssets?.soilPlots,
    )

    // Grow/shrink plant views while reusing existing instances by index.
    while (plants.length > teamCount) {
      const removed = plants.pop()
      removed?.destroy()
    }
    while (teamNames.length > teamCount) {
      teamNames.pop()
    }
    // Drop HUDs beyond the new layout count (updateSnapshot trims further).
    while (teamHuds.length > teamCount) {
      const removed = teamHuds.pop()
      if (removed) destroyTeamHud(removed)
    }
    while (plants.length < teamCount) {
      const index = plants.length
      const tint = teamTints[index] ?? palette.plantPetal
      // High-quality production path: Fluent-derived species per slot, no
      // global team tint on the plant. Falls back to the legacy asset-built
      // DummyPlantView when plantVariants are unavailable.
      const speciesKey = TEAM_PLANT_KEYS[index % TEAM_PLANT_KEYS.length]!
      const variants = plantVariants?.[speciesKey]
      let plant: PlantView
      if (variants) {
        plant = new AssetPlantView({
          label: `actor-plant-${index}`,
          stages: variants,
          reducedMotion: prefersReducedMotion,
        })
      } else {
        plant = new DummyPlantView({
          colors: {
            ...defaultPlantColors(palette),
            petal: tint,
          },
          label: `actor-plant-${index}`,
          headTexture: headTextureForIndex(index),
          stemTexture: plantBody?.stem,
          leafTexture: plantBody?.leaf,
          potTexture: plantBody?.pot,
        })
      }
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

  /**
   * Re-derive anchors for the *current* team count after a viewport change.
   * Pure reposition: plant views, soil containers, and team tints are
   * reused — only positions move into the visible band (identity-stable,
   * SDD §30). No-op before the first snapshot or when layout is unchanged.
   */
  function relayoutAnchors(): void {
    if (lastTeamCount === 0 || anchors.length === 0) return
    anchors = computePlotAnchors(
      lastTeamCount,
      GARDEN_LOGICAL_WIDTH,
      GARDEN_LOGICAL_HEIGHT,
      lastVisibleRect ?? undefined,
    )
    syncPlotSoil(
      layers.plots,
      anchors,
      palette.soil,
      palette.soilEdge,
      teamTints,
      palette.teamMeterFrame,
      layerAssets?.soilPlots,
    )
    for (let i = 0; i < plants.length; i += 1) {
      const anchor = anchors[i]
      if (anchor) {
        plants[i]!.root.position.set(anchor.x, anchor.y)
      }
    }
    relayoutTeamHuds()
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
    get assetDiagnostics() {
      return assetDiagnostics
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

    getVisibleRect() {
      return lastVisibleRect
    },

    getLayoutDiagnostics(): GardenLayoutDiagnostics {
      const lb = letterbox
      const vis = lastVisibleRect
      const plantBoundsLogical: LogicalRect[] = plants.map((plant) => {
        const b = plant.root.getBounds()
        if (!lb || !(lb.scale > 0)) {
          return { x: b.x, y: b.y, width: b.width, height: b.height }
        }
        // Re-project world (screen) bounds back into logical coordinates so
        // the safe-content contract can be asserted transform-agnostically.
        return {
          x: (b.x - lb.offsetX) / lb.scale,
          y: (b.y - lb.offsetY) / lb.scale,
          width: b.width / lb.scale,
          height: b.height / lb.scale,
        }
      })
      const rectInside = (r: LogicalRect, tol = 1): boolean =>
        vis == null ||
        (r.x >= vis.x - tol &&
          r.y >= vis.y - tol &&
          r.x + r.width <= vis.x + vis.width + tol &&
          r.y + r.height <= vis.y + vis.height + tol)
      const pointInside = (p: { x: number; y: number }, tol = 1): boolean =>
        vis == null ||
        (p.x >= vis.x - tol &&
          p.x <= vis.x + vis.width + tol &&
          p.y >= vis.y - tol &&
          p.y <= vis.y + vis.height + tol)
      return {
        viewport: lb
          ? { width: lb.screen.width, height: lb.screen.height }
          : { width: GARDEN_LOGICAL_WIDTH, height: GARDEN_LOGICAL_HEIGHT },
        letterbox: lb,
        visibleRect: vis,
        plotAnchors: anchors.map((a) => ({ x: a.x, y: a.y })),
        plantBoundsLogical,
        allAnchorsInsideVisibleRect: anchors.every((a) => pointInside(a)),
        allPlantsInsideVisibleRect: plantBoundsLogical.every((r) =>
          rectInside(r),
        ),
      }
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
      // Safe-content contract (WP immersive §11/§13): compute the visible
      // logical band after cover-fit and pull sky objects + plot anchors
      // back inside it, so non-16:9 hosts never amputate gameplay content.
      lastVisibleRect = computeVisibleLogicalRect(letterbox)
      layoutSkyForVisibleRect(layers.sky, lastVisibleRect)
      // Cloud parallax bases follow the clamped cloud positions.
      for (let i = 0; i < cloudSprites.length; i += 1) {
        cloudBaseX[i] = cloudSprites[i]!.x
      }
      relayoutAnchors()
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
      // Team name + 0–10 growth meter under each plant (presenterHud).
      // Rebuild HUD widgets only — plant actor instances stay stable.
      syncTeamHuds(teams)
      // SDD §30 probe-v3: bump revision exactly once per applied snapshot,
      // even when the team count stays stable — the cross-check between
      // identity.revision and identity.teamNames depends on it.
      revision += 1
    },

    destroy(): void {
      if (destroyed) return
      destroyed = true
      if (typeof stageHost.ticker?.remove === "function") {
        stageHost.ticker.remove(onTick)
      }
      for (const plant of plants) {
        plant.destroy()
      }
      plants.length = 0
      teamNames.length = 0
      while (teamHuds.length > 0) {
        const hud = teamHuds.pop()
        if (hud) destroyTeamHud(hud)
      }
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
