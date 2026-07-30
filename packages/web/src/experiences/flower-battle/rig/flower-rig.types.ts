/**
 * flower-rig.types.ts — shared contracts for the Flower Battle puppet rig
 * math core (WP-PIX-04A; ADR-013 procedural puppet rig; SDD §6.1 stable bone
 * semantics).
 *
 * Pure TypeScript: no pixi.js, no motion, no React, no colors. Render layers
 * map these points onto their own scene graph and own all visual styling.
 *
 * Coordinate convention: rig-local space, y grows downward (screen style),
 * so "up" is negative y. Angle 0 rad points straight up; positive angles
 * lean the stem toward +x (viewer right).
 */

/** Two-dimensional point/vector in rig-local space. */
export interface FlowerRigVec2 {
  readonly x: number
  readonly y: number
}

/** Fixed numeric tuple with one entry per bone in {@link FLOWER_RIG_BONE_IDS}. */
export type FlowerRigBoneVector = readonly [number, number, number, number]

/**
 * FK bone ids — serial chain from root to head. Exactly four local-angle
 * bones; each bone's local angle is relative to its parent's direction.
 */
export const FLOWER_RIG_BONE_IDS = [
  "stem-root",
  "stem-mid",
  "stem-top",
  "head-stem",
] as const

export type FlowerRigBoneId = (typeof FLOWER_RIG_BONE_IDS)[number]

/** Number of FK bones in the rig chain (always four). */
export const FLOWER_RIG_BONE_COUNT = FLOWER_RIG_BONE_IDS.length

/**
 * Stable ordered rig point ids: root, four bone tips, head anchor.
 * Order never changes across growth stages or poses — consumers may index
 * positionally or look up indices via {@link FLOWER_RIG_POINT_INDEX}.
 */
export const FLOWER_RIG_POINT_IDS = [
  "root",
  "stem-root-tip",
  "stem-mid-tip",
  "stem-top-tip",
  "head-stem-tip",
  "head-anchor",
] as const

export type FlowerRigPointId = (typeof FLOWER_RIG_POINT_IDS)[number]

/** Number of solved rig points (always six, any stage, any pose). */
export const FLOWER_RIG_POINT_COUNT = FLOWER_RIG_POINT_IDS.length

/** Stable lookup from point id to its index in {@link FlowerRigPoints}. */
export const FLOWER_RIG_POINT_INDEX: Readonly<
  Record<FlowerRigPointId, number>
> = {
  root: 0,
  "stem-root-tip": 1,
  "stem-mid-tip": 2,
  "stem-top-tip": 3,
  "head-stem-tip": 4,
  "head-anchor": 5,
}

/**
 * Baked pose for one growth stage. All stages share this topology — only
 * lengths and angles change. Local angles are radians relative to the parent
 * bone direction; lengths are rig-local units.
 */
export interface FlowerRigStageKeyframe {
  readonly stage: number
  readonly boneLengths: FlowerRigBoneVector
  readonly localAngles: FlowerRigBoneVector
  /** Distance from the last bone tip to the head anchor along the head axis. */
  readonly headAnchorLength: number
}

/** Solved rig: exactly six points in {@link FLOWER_RIG_POINT_IDS} order. */
export type FlowerRigPoints = readonly [
  FlowerRigVec2,
  FlowerRigVec2,
  FlowerRigVec2,
  FlowerRigVec2,
  FlowerRigVec2,
  FlowerRigVec2,
]

/** One sine component of the deterministic idle sway signal. */
export interface FlowerRigSwayComponent {
  readonly frequencyHz: number
  readonly phaseRadians: number
  readonly weight: number
}

/**
 * Idle sway profile: exactly three sine components form one shared base
 * signal; per-segment amplitude and damping shape it along the chain.
 */
export interface FlowerRigIdleSwayConfig {
  readonly components: readonly [
    FlowerRigSwayComponent,
    FlowerRigSwayComponent,
    FlowerRigSwayComponent,
  ]
  /** Peak sway angle per bone (radians) before damping. */
  readonly boneAmplitudes: FlowerRigBoneVector
  /** Per-segment damping multipliers — root damped, head full. */
  readonly segmentDamping: FlowerRigBoneVector
}

/** Options for evaluating the rig into world points. */
export interface EvaluateFlowerRigPointsOptions {
  /** Growth stage 0–10; fractional values are clamped and lerped. */
  readonly stage: number
  /** Deterministic clock in milliseconds; ignored under reduced motion. */
  readonly timeMs?: number
  /** Reduced motion: exact baked pose, no idle sway. */
  readonly reducedMotion?: boolean
  /** Rig root translation in consumer space (defaults to the origin). */
  readonly root?: FlowerRigVec2
}
