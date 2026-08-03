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

import { Container, Sprite, Texture } from "pixi.js"

import type {
  GardenAssetDiagnostics,
  PlantBodyTextures,
  PlantHeadTextures,
  PlantVariantTextures,
} from "../assets/loadGardenSceneAssets"
import type {
  GardenE2EIdentity,
  GardenPixiApplicationHandle,
  GardenRenderQuality,
  GardenScene,
} from "../garden-pixi.types"
import {
  gardenAssetAliasForTexture,
  TEAM_PLANT_KEYS,
} from "../assets/loadGardenSceneAssets"
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
import type {
  BirdSafeZone,
  BoundGardenAtmosphere,
  CreateGardenAtmosphereOptions,
} from "./atmosphere"
import { createGardenAtmosphere } from "./atmosphere"
import type { GardenAtmosphereTextures } from "../assets/loadGardenSceneAssets"

/**
 * Plot-band safe-zone footprint (logical px). Anchors are plot *centres*
 * in the visible band — extend the rectangle 400×440 around each centre
 * so any bird sprite whose sampled destination falls inside is rejected
 * by `pickSafeDestination`. Values are larger than the soil container so
 * birds can never spawn over a planted team.
 */
const SAFE_ZONE_HALF_WIDTH = 200
const SAFE_ZONE_HALF_HEIGHT = 220

function anchorsToSafeZones(
  anchors: readonly { x: number; y: number }[],
): BirdSafeZone[] {
  return anchors.map((a) => ({
    x: a.x,
    y: a.y,
    width: SAFE_ZONE_HALF_WIDTH * 2,
    height: SAFE_ZONE_HALF_HEIGHT * 2,
  }))
}

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
  /**
   * FU-C test hook: returns the plot-band safe zones currently derived from
   * the plot anchors. Order matches `getPlotAnchors()`. Empty before the
   * first `updateSnapshot` / when no atmosphere was bound at construction
   * time (no-op in that legacy path).
   */
  getAtmosphereSafeZones(): readonly BirdSafeZone[]
  /** True when every visible asset plant has completed its stage transition. */
  arePlantTransitionsSettled(): boolean
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
   * present for a species, high-quality `AssetPlantView` is used for that
   * species. Missing species fall back independently to DummyPlantView.
   */
  plantVariants?: PlantVariantTextures | null
  /**
   * Honours `prefers-reduced-motion`: disables the stage transition
   * (AssetPlantView). Forwarded from the attach path.
   */
  prefersReducedMotion?: boolean
  /** Diagnostics snapshot for E2E / window probe. */
  assetDiagnostics?: GardenAssetDiagnostics | null
  /**
   * Optional wind / bird / mote / gust-leaf atmosphere (Task 2). When
   * present the scene drives the controller from the existing ticker.
   * Undefined keeps the legacy no-atmosphere path (existing tests stay
   * green).
   */
  atmosphere?: GardenAtmosphereInput
}

/**
 * Lightweight input the host passes through to opt into the garden
 * atmosphere. The scene pulls containers / palette from itself and feeds
 * them to `createGardenAtmosphere`.
 *
 * Task 3: `atmosphereTextures` carries the loaded bird / wind-leaf / mote
 * textures (and observation-only pollen / sparkle / ring). When provided
 * the scene unpacks the bird pair, leaves, and mote into the controller
 * options. When omitted every controller degrades to an empty pool, so
 * pre-Task 3 tests that pass only `{ seed }` continue to work.
 */
export interface GardenAtmosphereInput {
  prefersReducedMotion?: boolean
  quality?: GardenRenderQuality
  seed?: number
  /** Task 3 production wiring (optional; null leaves keep their empty pool). */
  atmosphereTextures?: GardenAtmosphereTextures | null
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
  const usedAliasSet = new Set<string>()
  if (assetDiagnostics) {
    // Loading says what is available; scene traversal below is the sole source
    // of truth for what production actually selected into a visible Sprite.
    assetDiagnostics.usedSpriteAliases.length = 0
  }

  function recordUsedSpriteAliases(
    container: Container,
    ancestorsVisible = true,
  ): void {
    if (!assetDiagnostics || !ancestorsVisible) return
    for (const child of container.children) {
      const visible = ancestorsVisible && child.visible
      if (!visible) continue
      if (child instanceof Sprite) {
        const alias = gardenAssetAliasForTexture(child.texture)
        if (alias && !usedAliasSet.has(alias)) {
          usedAliasSet.add(alias)
          assetDiagnostics.usedSpriteAliases.push(alias)
        }
      }
      if (child instanceof Container && child.children.length > 0) {
        recordUsedSpriteAliases(child, visible)
      }
    }
  }

  const root = new Container()
  root.label = "garden-root"

  const layers = createGardenLayers(palette, layerAssets)
  for (const layer of layers.ordered) {
    root.addChild(layer)
  }
  recordUsedSpriteAliases(root)

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

  // Task 2: optional atmosphere (wind / birds / motes / gust leaves).
  // When `atmosphere` is undefined the legacy code path is unchanged.
  // FU-C (Minor-5 wiring): plot anchors drive the bird controller's
  // `safeZones` so birds reject spawns over team plots. The closure-local
  // `safeZones` mirrors `anchors` and is recomputed on every rebuild; at
  // bind time anchors is empty (no snapshot applied yet) so an empty
  // array is passed — the bird controller short-circuits on empty zones.
  let safeZones: BirdSafeZone[] = []
  // Declared up here (instead of in the lower batch) so the atmosphere
  // bind below can read the current anchors — none have been computed
  // yet, so the bind sees an empty safeZones list.
  let anchors: PlotAnchor[] = []
  let atmosphere: BoundGardenAtmosphere | null = null
  if (options.atmosphere) {
    const atmosInput = options.atmosphere
    // Task 3: unpack the loaded atmosphere textures into the controller
    // factory. Bird pair → GardenBirdTextures; windLeaves/mote →
    // GardenParticleController. The legacy `birdTextures`/`windLeafTextures`/
    // `moteTexture` fields on the controller input are unchanged — we just
    // bridge the new host-facing `atmosphereTextures` into them.
    const tex = atmosInput.atmosphereTextures ?? null
    const birdTextures =
      tex && tex.birdUp && tex.birdDown
        ? { up: tex.birdUp, down: tex.birdDown }
        : null
    safeZones = anchorsToSafeZones(anchors)
    // FU-A (Minor-1): plumb the sun-holder position to the bird controller
    // so its sun-safe exclusion is the post-letterbox value, not the
    // default fallback. The full `scene.updateLayout()` runs again at the
    // bottom of this function and is idempotent for the sun on the same
    // host size. We re-derive the post-layout sun x/y here (same source
    // `layoutSkyForVisibleRect` uses) and refresh the cloud parallax base
    // so the first onTick doesn't drift from the initial cloud position.
    const initialWidth = app.renderer?.width ?? GARDEN_LOGICAL_WIDTH
    const initialHeight = app.renderer?.height ?? GARDEN_LOGICAL_HEIGHT
    const initialLetterbox = fitLogicalViewport(initialWidth, initialHeight)
    const initialVisibleRect = computeVisibleLogicalRect(initialLetterbox)
    layoutSkyForVisibleRect(layers.sky, initialVisibleRect)
    for (let i = 0; i < cloudSprites.length; i += 1) {
      cloudBaseX[i] = cloudSprites[i]!.x
    }
    const sunHolder = layers.sky.children.find(
      (c) => c.label === "sun-holder",
    )
    const sunPos = sunHolder ? { x: sunHolder.x, y: sunHolder.y } : null
    const atmosOptions: CreateGardenAtmosphereOptions = {
      skyLife: layers.skyLife,
      ambient: layers.ambient,
      weather: layers.weather,
      grass: layers.grass,
      palette,
      quality: atmosInput.quality ?? "high",
      prefersReducedMotion: atmosInput.prefersReducedMotion ?? false,
      seed: atmosInput.seed,
      birdTextures,
      windLeafTextures: tex ? tex.windLeaves : [],
      moteTexture: tex ? tex.mote : null,
      safeZones,
      sunPosition: sunPos,
    }
    // Lazy import to keep GardenScene.ts free of the sub-controller
    // graph (the scene only depends on the factory + input shape).
    atmosphere = createGardenAtmosphere(atmosOptions)
  }

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
    // Atmosphere drives wind / birds / motes / gust leaves off the SAME
    // ticker. Delta clamped to [0, 50] ms per the brief.
    if (atmosphere) {
      const deltaMs = Math.min(
        50,
        Math.max(0, ticker.deltaTime * (1000 / 60)),
      )
      atmosphere.update(deltaMs)
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
  let phase: string | null = null
  let lastTeamCount = 0
  // SDD §30 probe-v3: monotonic normalized-state revision counter.
  let revision = 0
  // Union: AssetPlantView when Fluent variants are available, else DummyPlantView.
  type PlantView = DummyPlantView | AssetPlantView
  const plants: PlantView[] = []
  const teamNames: string[] = []
  // FB-HUD4 (Gartenmodus-Korrektur): the per-plot Pixi team HUD
  // (pill + segmented growth/sun meters) is gone. Per-team compact cards
  // live UNDER each plant in the DOM (PlantTeamCard), not inside the canvas.
  // `teamHuds` and its helper are removed; the `presenterHud` Pixi layer
  // stays for any future overlay and remains empty.
  let teamTints: number[] = []

  function arePlantTransitionsSettled(): boolean {
    for (const plant of plants) {
      if (!(plant instanceof AssetPlantView)) continue
      const sprite = plant.root.getChildByLabel("plant-sprite")
      if (sprite instanceof Sprite && sprite.visible && sprite.alpha < 1) {
        return false
      }
    }
    return true
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

  function rebuildPlotsForCount(teamCount: number): void {
    const nextAnchors = computePlotAnchors(
      teamCount,
      GARDEN_LOGICAL_WIDTH,
      GARDEN_LOGICAL_HEIGHT,
      lastVisibleRect ?? undefined,
    )
    anchors = nextAnchors
    // FU-C: re-derive bird safe zones so the list follows the plot count
    // (2 → 3 → 4 teams). The closure-local snapshot mirrors anchors; the
    // bird controller's frozen copy was already populated at bind time.
    safeZones = anchorsToSafeZones(anchors)
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
          potTexture: plantBody?.pot,
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

    arePlantTransitionsSettled,

    getAtmosphereSafeZones() {
      return safeZones
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
      recordUsedSpriteAliases(layers.actors)
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
      // Task 2: tear down the atmosphere BEFORE removing the ticker so
      // any in-flight `update()` cannot race a half-destroyed controller.
      atmosphere?.destroy()
      atmosphere = null
      if (typeof stageHost.ticker?.remove === "function") {
        stageHost.ticker.remove(onTick)
      }
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
