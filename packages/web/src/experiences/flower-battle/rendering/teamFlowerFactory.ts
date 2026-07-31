/**
 * Data-driven Flower Battle team-flower PixiJS factory (WP-PRESENTER-4,
 * SDD §20.6).
 *
 *  - 4 teams × 4 growth stages = 16 procedurally distinct silhouettes.
 *  - Head tint is applied per team via PixiJS Graphics tinting resolved
 *    through the project theme-token pipeline (no hard-coded production
 *    colors, no 16 separate SVGs).
 *  - Face layer is decoupled from the head so a face swap (happy / hurt /
 *    protected / boosted / winner) does NOT remount the plant.
 *
 * Geometry primitives live in `./teamFlowerGeometry.ts` to keep this file
 * under the host-wide monolith guard. The factory owns the public type
 * surface + the team's color-token mapping only.
 */

import { Container, Graphics } from "pixi.js"

import type { ThemeColorResolver } from "./resolveThemeColor"
import {
  resolveThemeTokenColor,
  THEME_TOKEN_COLOR_ERROR,
  ThemeTokenColorError,
} from "./resolveThemeColor"
import type { CssTokenName } from "@razzoozle/common/theme-tokens"
import {
  FLOWER_HEAD_BASE_DIAMETER_PX,
  STAGE_HEAD_RATIO,
  STAGE_HEIGHT_FACTOR,
  STAGE_LEAF_COUNT,
} from "./flowerHeads"
import { redrawTeamFlower } from "./teamFlowerGeometry"

/* ─────────────────────────────────────────────────────────────────────────
 * Public type surface
 * ────────────────────────────────────────────────────────────────────── */

/** Team identifier as referenced by the presenter garden slots. */
export type TeamId = "violet" | "blue" | "orange" | "green"

/** Discretized plant growth stage; matches SDD §20.6 stage ladder. */
export type GrowthStage = 1 | 2 | 3 | 4

/** Mood / status of the face overlay on the flower head. */
export type PlantFace =
  | "happy"
  | "hurt"
  | "protected"
  | "boosted"
  | "winner"

/**
 * Visual effects currently active on the plant. Shape only — they feed the
 * face choice + halo overlay, never the silhouette.
 */
export type ActivePlantEffect =
  | "umbrella_shield"
  | "acid_rain"
  | "sunbeam"
  | "fertilizer"

/**
 * Team → project CSS design-token mapping. The presentation palette uses
 * violet/blue/orange/green naming; the project's frozen design tokens
 * expose red/blue/green/yellow base colors only. The closest hue pair is
 * mapped below so we stay strictly on the theme-token pipeline (no new
 * tokens, no hex literals).
 */
export const TEAM_COLOR_TOKENS: Record<TeamId, TeamColorToken> = {
  violet: "--team-red",
  blue: "--team-blue",
  orange: "--team-yellow",
  green: "--team-green",
}

/** Subset of `CssTokenName` containing every team-color leaf we touch. */
export type TeamColorToken =
  | "--team-red"
  | "--team-blue"
  | "--team-yellow"
  | "--team-green"

/** Logical viewport in CSS pixels. Must be finite and positive. */
export interface TeamFlowerViewport {
  width: number
  height: number
}

/** Inputs to {@link createTeamFlower}. */
export interface CreateTeamFlowerOptions {
  teamId: TeamId
  stage: GrowthStage
  face?: PlantFace
  effects?: readonly ActivePlantEffect[]
  viewport: TeamFlowerViewport
  /**
   * Inject a token → color resolver (tests / SSR). Defaults to
   * `resolveThemeTokenColor`.
   */
  resolveColor?: ThemeColorResolver
  /** Stable Pixi label, mostly for e2e probes. */
  label?: string
}

/**
 * Resulting Pixi container. The same instances are returned every call to
 * `updateTeamFlower`, so React can mutate props without re-creating the
 * underlying Containers / Graphics.
 */
export interface TeamFlowerInstance {
  /** Root container — caller positions this inside the team slot. */
  container: Container
  /** Soil shadow disk. */
  soilShadow: Graphics
  /** Stem trapezoid + curved arc. */
  stem: Graphics
  /** Decorative leaves (2–4 drawn depending on stage). */
  leaves: Graphics
  /** Flower head disk (tinted per team) — empty when stage < 2. */
  head: Graphics
  /** Petal ring inside the head — empty when stage < 3. */
  petalRing: Graphics
  /** Face overlay — empty when stage < 4. Faces never mutate silhouette. */
  faceLayer: Container
  /** Optional halo / shield ring (drawn for protected/boosted). */
  haloLayer: Container
  /** Dispose all Graphics — caller is responsible to detach from parent first. */
  destroy(): void
}

/* ─────────────────────────────────────────────────────────────────────────
 * Color resolution
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Resolve one token safely; return a deterministic neutral if the theme
 * pipeline is unavailable (tests / SSR fallback).
 */
function safeResolve(
  token: CssTokenName,
  resolveColor: ThemeColorResolver,
  fallback: number,
): number {
  try {
    return resolveColor(token)
  } catch (err) {
    if (
      err instanceof ThemeTokenColorError ||
      (err as { code?: string }).code === THEME_TOKEN_COLOR_ERROR
    ) {
      return fallback
    }
    throw err
  }
}

/** Resolve all layer tints in one call so each `redraw` is fast. */
function resolveLayerTints(
  options: CreateTeamFlowerOptions,
): {
  teamTint: number
  leafTint: number
  petalTint: number
  accentTint: number
  creamTint: number
} {
  const resolveColor = options.resolveColor ?? resolveThemeTokenColor
  const teamTint = safeResolve(
    TEAM_COLOR_TOKENS[options.teamId],
    resolveColor,
    0x808080,
  )
  const leafTint = safeResolve("--team-green-ring", resolveColor, 0x3d7a3d)
  const petalTint = safeResolve("--state-correct-soft", resolveColor, 0xffffff)
  const accentTint = safeResolve("--color-accent", resolveColor, 0xffd54a)
  const creamTint = safeResolve("--color-field-cream", resolveColor, 0xfaf6e8)
  return { teamTint, leafTint, petalTint, accentTint, creamTint }
}

/** Resolve the face implied by the active effects when the caller omits one. */
function resolveFaceFromEffects(
  effects: readonly ActivePlantEffect[],
): PlantFace {
  if (effects.includes("acid_rain")) return "hurt"
  if (effects.includes("umbrella_shield")) return "protected"
  if (effects.includes("sunbeam") || effects.includes("fertilizer"))
    return "boosted"
  return "happy"
}

/** Compute the size budget of one plant, in logical pixels. */
function resolveBaseWidth(
  viewport: TeamFlowerViewport,
  stage: GrowthStage,
): number {
  if (!Number.isFinite(viewport.width) || viewport.width <= 0) return 200
  const slotFraction = Math.min(0.9, 0.18 + stage * 0.05)
  const heightCap = viewport.height * 0.3
  return Math.max(120, Math.min(viewport.width * slotFraction, heightCap))
}

/** Compute the geometry args shared by create + update. */
function computeRenderArgs(
  options: CreateTeamFlowerOptions,
  tints: {
    teamTint: number
    leafTint: number
    petalTint: number
    accentTint: number
    creamTint: number
  },
): {
  baseWidth: number
  stemHeight: number
  headTopY: number
  headRadius: number
  leafCount: number
  face: PlantFace
  effects: readonly ActivePlantEffect[]
  teamTint: number
  leafTint: number
  petalTint: number
  accentTint: number
  creamTint: number
} {
  const baseWidth = resolveBaseWidth(options.viewport, options.stage)
  const heightFactor = STAGE_HEIGHT_FACTOR[options.stage]
  const stemHeight = baseWidth * 0.95 * heightFactor
  const headRatio = STAGE_HEAD_RATIO[options.stage]
  const headRadius =
    (FLOWER_HEAD_BASE_DIAMETER_PX / 2) * baseWidth * 0.0025 * headRatio
  const effects = options.effects ?? []
  return {
    baseWidth,
    stemHeight,
    headTopY: -stemHeight,
    headRadius,
    leafCount: STAGE_LEAF_COUNT[options.stage],
    face: options.face ?? resolveFaceFromEffects(effects),
    effects,
    teamTint: tints.teamTint,
    leafTint: tints.leafTint,
    petalTint: tints.petalTint,
    accentTint: tints.accentTint,
    creamTint: tints.creamTint,
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Factory
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Public factory — creates a new instance. Caller attaches `instance.container`
 * to the parent slot Container and disposes via `instance.destroy()` when
 * the slot is recycled.
 */
export function createTeamFlower(
  options: CreateTeamFlowerOptions,
): TeamFlowerInstance {
  validateStage(options.stage)
  validateTeamId(options.teamId)

  const root = new Container()
  root.label = options.label ?? `team-flower-${options.teamId}`
  // Z-order: soil → stem → leaves → head → petals → face → halo.
  const soilShadow = new Graphics()
  soilShadow.label = "soil-shadow"
  const stem = new Graphics()
  stem.label = "stem"
  const leaves = new Graphics()
  leaves.label = "leaves"
  const head = new Graphics()
  head.label = "head"
  const petalRing = new Graphics()
  petalRing.label = "petal-ring"
  const faceLayer = new Container()
  faceLayer.label = "face-layer"
  const haloLayer = new Container()
  haloLayer.label = "halo-layer"

  root.addChild(soilShadow)
  root.addChild(stem)
  root.addChild(leaves)
  root.addChild(head)
  root.addChild(petalRing)
  root.addChild(faceLayer)
  root.addChild(haloLayer)

  const instance: TeamFlowerInstance = {
    container: root,
    soilShadow,
    stem,
    leaves,
    head,
    petalRing,
    faceLayer,
    haloLayer,
    destroy(): void {
      root.destroy({ children: true })
    },
  }
  const tints = resolveLayerTints(options)
  redrawTeamFlower(instance, computeRenderArgs(options, tints))
  return instance
}

/**
 * In-place update — mutates the same Pixi children, never re-instantiates
 * the root `Container`. Used by the React wrapper for prop changes.
 */
export function updateTeamFlower(
  instance: TeamFlowerInstance,
  options: CreateTeamFlowerOptions,
): void {
  validateStage(options.stage)
  validateTeamId(options.teamId)
  const tints = resolveLayerTints(options)
  redrawTeamFlower(instance, computeRenderArgs(options, tints))
  if (options.label) instance.container.label = options.label
}

/* ─────────────────────────────────────────────────────────────────────────
 * Validation
 * ────────────────────────────────────────────────────────────────────── */

export const VALID_TEAM_IDS: readonly TeamId[] = [
  "violet",
  "blue",
  "orange",
  "green",
]
export const TEAM_FLOWER_TEAM_IDS = VALID_TEAM_IDS
export const VALID_GROWTH_STAGES: readonly GrowthStage[] = [1, 2, 3, 4]
export const TEAM_FLOWER_GROWTH_STAGES = VALID_GROWTH_STAGES

function validateTeamId(teamId: string): asserts teamId is TeamId {
  if (!VALID_TEAM_IDS.includes(teamId as TeamId)) {
    throw new Error(
      `createTeamFlower: unsupported teamId "${teamId}". Expected one of: ${VALID_TEAM_IDS.join(", ")}`,
    )
  }
}

function validateStage(stage: number): asserts stage is GrowthStage {
  if (!VALID_GROWTH_STAGES.includes(stage as GrowthStage)) {
    throw new Error(
      `createTeamFlower: unsupported stage "${stage}". Expected 1..4.`,
    )
  }
}
