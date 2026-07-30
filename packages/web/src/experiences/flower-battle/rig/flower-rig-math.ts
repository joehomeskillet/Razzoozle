/**
 * flower-rig-math.ts — pure rig evaluation for the Flower Battle puppet rig
 * (WP-PIX-04A; ADR-013 procedural puppet rig).
 *
 * Pipeline: clamp + fractional-lerp the baked stage keyframes, optionally add
 * the deterministic three-sine idle sway (per-segment damped), then solve the
 * four-bone local-angle FK chain into the six stable points.
 *
 * `reducedMotion: true` returns the exact baked pose with no sway, so output
 * is identical for every `timeMs`. All functions are pure: no randomness, no
 * hidden state, no pixi.js / motion / React imports.
 */

import {
  type EvaluateFlowerRigPointsOptions,
  type FlowerRigBoneVector,
  type FlowerRigIdleSwayConfig,
  type FlowerRigPoints,
  type FlowerRigStageKeyframe,
  type FlowerRigVec2,
} from "./flower-rig.types"
import {
  FLOWER_RIG_MAX_STAGE,
  FLOWER_RIG_MIN_STAGE,
  FLOWER_RIG_STAGE_KEYFRAMES,
} from "./flower-rig-keyframes"

const RIG_ORIGIN: FlowerRigVec2 = { x: 0, y: 0 }

const lerpNumber = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * Clamps a (possibly fractional) stage into [0, 10]. NaN maps to the minimum
 * stage; ±Infinity clamps to the nearest endpoint like any out-of-range value.
 */
export function clampFlowerRigStage(stage: number): number {
  if (Number.isNaN(stage)) {
    return FLOWER_RIG_MIN_STAGE
  }
  return Math.min(FLOWER_RIG_MAX_STAGE, Math.max(FLOWER_RIG_MIN_STAGE, stage))
}

/**
 * Linear interpolation between two baked keyframes. `t` clamps into [0, 1];
 * the endpoints short-circuit so integer stages stay bit-exact baked poses.
 */
export function lerpFlowerRigKeyframes(
  a: FlowerRigStageKeyframe,
  b: FlowerRigStageKeyframe,
  t: number,
): FlowerRigStageKeyframe {
  const u = Number.isNaN(t) ? 0 : Math.min(1, Math.max(0, t))
  if (u === 0) {
    return a
  }
  if (u === 1) {
    return b
  }
  return {
    stage: lerpNumber(a.stage, b.stage, u),
    boneLengths: [
      lerpNumber(a.boneLengths[0], b.boneLengths[0], u),
      lerpNumber(a.boneLengths[1], b.boneLengths[1], u),
      lerpNumber(a.boneLengths[2], b.boneLengths[2], u),
      lerpNumber(a.boneLengths[3], b.boneLengths[3], u),
    ],
    localAngles: [
      lerpNumber(a.localAngles[0], b.localAngles[0], u),
      lerpNumber(a.localAngles[1], b.localAngles[1], u),
      lerpNumber(a.localAngles[2], b.localAngles[2], u),
      lerpNumber(a.localAngles[3], b.localAngles[3], u),
    ],
    headAnchorLength: lerpNumber(a.headAnchorLength, b.headAnchorLength, u),
  }
}

/**
 * Samples the baked stage table at a fractional stage: clamps into [0, 10],
 * then lerps between the neighbouring keyframes. Integer stages return the
 * baked keyframe object untouched (exact baked pose, no blended copy).
 */
export function sampleFlowerRigPose(stage: number): FlowerRigStageKeyframe {
  const clamped = clampFlowerRigStage(stage)
  const lowerIndex = Math.min(Math.floor(clamped), FLOWER_RIG_MAX_STAGE - 1)
  const lower = FLOWER_RIG_STAGE_KEYFRAMES[lowerIndex]
  const upper = FLOWER_RIG_STAGE_KEYFRAMES[lowerIndex + 1]
  return lerpFlowerRigKeyframes(lower, upper, clamped - lowerIndex)
}

/**
 * Default idle sway profile: three sine components (a slow fundamental plus
 * two harmonics) form one base signal; amplitudes grow along the chain and
 * per-segment damping keeps the root calm while the head moves most.
 */
export const FLOWER_RIG_IDLE_SWAY: FlowerRigIdleSwayConfig = {
  components: [
    { frequencyHz: 0.5, phaseRadians: 0, weight: 1 },
    { frequencyHz: 1.1, phaseRadians: 1.3, weight: 0.5 },
    { frequencyHz: 2.3, phaseRadians: 2.6, weight: 0.25 },
  ],
  boneAmplitudes: [0.012, 0.016, 0.02, 0.024],
  segmentDamping: [0.4, 0.65, 0.85, 1],
}

/**
 * Base sway signal at a point in time: the weight-normalized sum of the
 * three configured sine components. Pure function of `timeMs` and config.
 */
export function computeFlowerRigSwaySignal(
  timeMs: number,
  config: FlowerRigIdleSwayConfig = FLOWER_RIG_IDLE_SWAY,
): number {
  const timeSeconds = timeMs / 1000
  let signal = 0
  let weightSum = 0
  for (const component of config.components) {
    signal +=
      component.weight *
      Math.sin(
        2 * Math.PI * component.frequencyHz * timeSeconds +
          component.phaseRadians,
      )
    weightSum += component.weight
  }
  return weightSum === 0 ? 0 : signal / weightSum
}

/**
 * Per-bone sway offsets (radians) at a point in time: the shared three-sine
 * signal scaled by per-segment amplitude and damping. Deterministic — equal
 * inputs always yield equal outputs, with no randomness or hidden state.
 */
export function computeFlowerRigIdleSway(
  timeMs: number,
  config: FlowerRigIdleSwayConfig = FLOWER_RIG_IDLE_SWAY,
): FlowerRigBoneVector {
  const signal = computeFlowerRigSwaySignal(timeMs, config)
  return [
    signal * config.boneAmplitudes[0] * config.segmentDamping[0],
    signal * config.boneAmplitudes[1] * config.segmentDamping[1],
    signal * config.boneAmplitudes[2] * config.segmentDamping[2],
    signal * config.boneAmplitudes[3] * config.segmentDamping[3],
  ]
}

/** FK cursor: running tip position plus the running cumulative angle. */
interface FlowerRigFkCursor {
  readonly x: number
  readonly y: number
  readonly angle: number
}

/**
 * Advances one FK segment. Direction for an angle θ is (sin θ, −cos θ), so
 * θ = 0 points straight up and positive angles lean toward +x. Local angles
 * accumulate along the chain (local-angle FK).
 */
const advanceFlowerRigSegment = (
  cursor: FlowerRigFkCursor,
  localAngle: number,
  length: number,
): FlowerRigFkCursor => {
  const angle = cursor.angle + localAngle
  return {
    x: cursor.x + Math.sin(angle) * length,
    y: cursor.y - Math.cos(angle) * length,
    angle,
  }
}

/**
 * Solves the four-bone local-angle FK chain into the six stable points:
 * root, the four bone tips, then the head anchor extended from the last tip
 * by `headAnchorLength` along the head axis. `root` translates the rig.
 */
export function solveFlowerRigFk(
  pose: FlowerRigStageKeyframe,
  root: FlowerRigVec2 = RIG_ORIGIN,
): FlowerRigPoints {
  const start: FlowerRigFkCursor = { x: root.x, y: root.y, angle: 0 }
  const stemRootTip = advanceFlowerRigSegment(
    start,
    pose.localAngles[0],
    pose.boneLengths[0],
  )
  const stemMidTip = advanceFlowerRigSegment(
    stemRootTip,
    pose.localAngles[1],
    pose.boneLengths[1],
  )
  const stemTopTip = advanceFlowerRigSegment(
    stemMidTip,
    pose.localAngles[2],
    pose.boneLengths[2],
  )
  const headStemTip = advanceFlowerRigSegment(
    stemTopTip,
    pose.localAngles[3],
    pose.boneLengths[3],
  )
  const headAnchor = advanceFlowerRigSegment(
    headStemTip,
    0,
    pose.headAnchorLength,
  )
  return [
    { x: root.x, y: root.y },
    { x: stemRootTip.x, y: stemRootTip.y },
    { x: stemMidTip.x, y: stemMidTip.y },
    { x: stemTopTip.x, y: stemTopTip.y },
    { x: headStemTip.x, y: headStemTip.y },
    { x: headAnchor.x, y: headAnchor.y },
  ]
}

/**
 * Main entry point: samples the baked pose at `stage` (clamped, fractional
 * lerp), adds the deterministic idle sway unless reduced motion is requested,
 * and solves the FK chain into the six stable rig points.
 *
 * `reducedMotion: true` yields the exact baked pose — zero sway — so the
 * output is identical for every `timeMs`.
 *
 * Non-finite `timeMs` (NaN, ±Infinity) normalizes to 0 at this single source
 * so motion-on sway never feeds non-finite values into Math.sin. Finite
 * negative and positive times keep their natural sine-phase semantics.
 */
export function evaluateFlowerRigPoints(
  options: EvaluateFlowerRigPointsOptions,
): FlowerRigPoints {
  const pose = sampleFlowerRigPose(options.stage)
  if (options.reducedMotion === true) {
    return solveFlowerRigFk(pose, options.root)
  }
  // Single source: undefined/nullish → 0; any non-finite number → 0.
  const rawTimeMs = options.timeMs ?? 0
  const timeMs = Number.isFinite(rawTimeMs) ? rawTimeMs : 0
  const sway = computeFlowerRigIdleSway(timeMs)
  const swayedPose: FlowerRigStageKeyframe = {
    ...pose,
    localAngles: [
      pose.localAngles[0] + sway[0],
      pose.localAngles[1] + sway[1],
      pose.localAngles[2] + sway[2],
      pose.localAngles[3] + sway[3],
    ],
  }
  return solveFlowerRigFk(swayedPose, options.root)
}
