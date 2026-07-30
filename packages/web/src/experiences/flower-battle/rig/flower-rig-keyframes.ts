/**
 * flower-rig-keyframes.ts — baked growth-stage keyframes for the Flower
 * Battle puppet rig (WP-PIX-04A; ADR-013; SDD §6.1 stable bone semantics).
 *
 * Eleven discrete stages 0–10 on one shared topology: four bones, six stable
 * points. Values are baked literals (not computed at runtime) so the art
 * direction of each growth stage is reviewable in code review.
 *
 * Column legend per entry:
 *   boneLengths  — [stem-root, stem-mid, stem-top, head-stem] rig units
 *   localAngles  — radians relative to parent direction (0 = up, + = right)
 *   headAnchorLength — last tip → head anchor distance along the head axis
 *
 * Pure data — no runtime logic lives here.
 */

import type { FlowerRigStageKeyframe } from "./flower-rig.types"

/** Inclusive growth-stage bounds (fractional stages clamp into this range). */
export const FLOWER_RIG_MIN_STAGE = 0
export const FLOWER_RIG_MAX_STAGE = 10

/** Number of baked stage keyframes (stages 0–10 inclusive → eleven). */
export const FLOWER_RIG_STAGE_COUNT =
  FLOWER_RIG_MAX_STAGE - FLOWER_RIG_MIN_STAGE + 1

/**
 * Baked poses for stages 0..10, ordered by stage. Every stage shares the
 * same topology (four bones, six points); only lengths and angles change.
 * Total stem length grows monotonically from seedling to full bloom while
 * the gentle right-lean curl slowly shifts upward along the stem.
 */
export const FLOWER_RIG_STAGE_KEYFRAMES: readonly FlowerRigStageKeyframe[] = [
  {
    stage: 0,
    boneLengths: [4, 3, 2, 1],
    localAngles: [0.0, 0.1, 0.15, 0.2],
    headAnchorLength: 2,
  },
  {
    stage: 1,
    boneLengths: [6.4, 5.3, 4.2, 2.3],
    localAngles: [0.02, 0.08, 0.14, 0.18],
    headAnchorLength: 3.4,
  },
  {
    stage: 2,
    boneLengths: [8.8, 7.6, 6.4, 3.6],
    localAngles: [0.04, 0.08, 0.12, 0.16],
    headAnchorLength: 4.8,
  },
  {
    stage: 3,
    boneLengths: [11.2, 9.9, 8.6, 4.9],
    localAngles: [0.05, 0.09, 0.12, 0.14],
    headAnchorLength: 6.2,
  },
  {
    stage: 4,
    boneLengths: [13.6, 12.2, 10.8, 6.2],
    localAngles: [0.06, 0.1, 0.11, 0.12],
    headAnchorLength: 7.6,
  },
  {
    stage: 5,
    boneLengths: [16, 14.5, 13, 7.5],
    localAngles: [0.07, 0.1, 0.1, 0.1],
    headAnchorLength: 9,
  },
  {
    stage: 6,
    boneLengths: [18.4, 16.8, 15.2, 8.8],
    localAngles: [0.06, 0.11, 0.1, 0.09],
    headAnchorLength: 10.4,
  },
  {
    stage: 7,
    boneLengths: [20.8, 19.1, 17.4, 10.1],
    localAngles: [0.05, 0.12, 0.1, 0.08],
    headAnchorLength: 11.8,
  },
  {
    stage: 8,
    boneLengths: [23.2, 21.4, 19.6, 11.4],
    localAngles: [0.04, 0.12, 0.11, 0.07],
    headAnchorLength: 13.2,
  },
  {
    stage: 9,
    boneLengths: [25.6, 23.7, 21.8, 12.7],
    localAngles: [0.03, 0.11, 0.12, 0.06],
    headAnchorLength: 14.6,
  },
  {
    stage: 10,
    boneLengths: [28, 26, 24, 14],
    localAngles: [0.02, 0.1, 0.12, 0.05],
    headAnchorLength: 16,
  },
]
