/**
 * Growth-stage head scaling constants for the Flower Battle presenter
 * (WP-PRESENTER-4, SDD §20.6).
 *
 * Stage-to-head-size ratio contract:
 *   Stage 1 = Keimling  → no flower head
 *   Stage 2 = Knospe    → small bud (half size)
 *   Stage 3 = Bud-Open  → partially open flower (3/4 size)
 *   Stage 4 = Bloom     → fully blossomed flower (full size)
 *
 * The base head diameter is fixed in logical pixels and multiplied by the
 * stage ratio; the factory multiplies the result by a stage-tier adjustment
 * (smaller for sprout, larger for bloom) so the visual range reads as growth,
 * not as four separate pieces of art.
 */

import type { GrowthStage } from "./teamFlowerFactory"

/**
 * Single baseline head diameter in logical pixels. The factory scales this by
 * `STAGE_HEAD_RATIO[stage]` plus a height factor so stage 1 = 0 (no head)
 * and stage 4 = full bloom diameter.
 */
export const FLOWER_HEAD_BASE_DIAMETER_PX = 140

/**
 * Per-stage head size ratio in (0..1] of the baseline diameter.
 * Stage 1 returns 0 — the Keimling has no flower head, only stem + leaves.
 */
export const STAGE_HEAD_RATIO: Record<GrowthStage, number> = {
  1: 0,
  2: 0.5,
  3: 0.75,
  4: 1,
}

/**
 * Per-stage height factor for the visible stage silhouette. Stage 1 stays
 * close to the soil, stage 4 reaches full height. Stems + leaves follow this
 * curve so the plant reads as 'growing', not just 'changing color'.
 */
export const STAGE_HEIGHT_FACTOR: Record<GrowthStage, number> = {
  1: 0.32,
  2: 0.55,
  3: 0.8,
  4: 1,
}

/**
 * Min/max leaf count a stage is allowed to show.
 * Stage 1 sprouts only 1–2 leaves; stage 4 has all four leaves at full scale.
 */
export const STAGE_LEAF_COUNT: Record<GrowthStage, number> = {
  1: 2,
  2: 2,
  3: 3,
  4: 4,
}
