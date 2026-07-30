import { describe, expect, it } from "vitest"

import {
  FLOWER_RIG_MAX_STAGE,
  FLOWER_RIG_MIN_STAGE,
  FLOWER_RIG_STAGE_COUNT,
  FLOWER_RIG_STAGE_KEYFRAMES,
} from "./flower-rig-keyframes"
import {
  FLOWER_RIG_BONE_COUNT,
  FLOWER_RIG_BONE_IDS,
  FLOWER_RIG_POINT_COUNT,
  FLOWER_RIG_POINT_IDS,
  FLOWER_RIG_POINT_INDEX,
} from "./flower-rig.types"

const totalStemLength = (index: number): number =>
  FLOWER_RIG_STAGE_KEYFRAMES[index].boneLengths.reduce(
    (sum, length) => sum + length,
    0,
  )

describe("flower-rig keyframes", () => {
  it("bakes exactly eleven stages indexed 0..10 in order", () => {
    expect(FLOWER_RIG_STAGE_COUNT).toBe(11)
    expect(FLOWER_RIG_MIN_STAGE).toBe(0)
    expect(FLOWER_RIG_MAX_STAGE).toBe(10)
    expect(FLOWER_RIG_STAGE_KEYFRAMES).toHaveLength(11)
    FLOWER_RIG_STAGE_KEYFRAMES.forEach((keyframe, index) => {
      expect(keyframe.stage).toBe(index)
    })
  })

  it("gives every stage exactly four bones and a finite head anchor", () => {
    for (const keyframe of FLOWER_RIG_STAGE_KEYFRAMES) {
      expect(keyframe.boneLengths).toHaveLength(FLOWER_RIG_BONE_COUNT)
      expect(keyframe.localAngles).toHaveLength(FLOWER_RIG_BONE_COUNT)
      expect(Number.isFinite(keyframe.headAnchorLength)).toBe(true)
      expect(keyframe.headAnchorLength).toBeGreaterThan(0)
    }
  })

  it("keeps all baked values finite, positive and in sane angle bounds", () => {
    for (const keyframe of FLOWER_RIG_STAGE_KEYFRAMES) {
      for (const length of keyframe.boneLengths) {
        expect(Number.isFinite(length)).toBe(true)
        expect(length).toBeGreaterThan(0)
      }
      for (const angle of keyframe.localAngles) {
        expect(Number.isFinite(angle)).toBe(true)
        expect(Math.abs(angle)).toBeLessThan(Math.PI / 2)
      }
    }
  })

  it("grows total stem length monotonically across stages", () => {
    for (let index = 1; index < FLOWER_RIG_STAGE_KEYFRAMES.length; index += 1) {
      expect(totalStemLength(index)).toBeGreaterThan(totalStemLength(index - 1))
    }
  })

  it("declares four bones and six stable ordered points", () => {
    expect(FLOWER_RIG_BONE_IDS).toEqual([
      "stem-root",
      "stem-mid",
      "stem-top",
      "head-stem",
    ])
    expect(FLOWER_RIG_POINT_IDS).toEqual([
      "root",
      "stem-root-tip",
      "stem-mid-tip",
      "stem-top-tip",
      "head-stem-tip",
      "head-anchor",
    ])
    expect(FLOWER_RIG_POINT_COUNT).toBe(6)
  })

  it("maps every point id to its stable positional index", () => {
    FLOWER_RIG_POINT_IDS.forEach((pointId, index) => {
      expect(FLOWER_RIG_POINT_INDEX[pointId]).toBe(index)
    })
  })
})
