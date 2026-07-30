import { describe, expect, it } from "vitest"

import { FLOWER_RIG_STAGE_KEYFRAMES } from "./flower-rig-keyframes"
import type { FlowerRigStageKeyframe } from "./flower-rig.types"
import {
  clampFlowerRigStage,
  computeFlowerRigIdleSway,
  computeFlowerRigSwaySignal,
  evaluateFlowerRigPoints,
  FLOWER_RIG_IDLE_SWAY,
  lerpFlowerRigKeyframes,
  sampleFlowerRigPose,
  solveFlowerRigFk,
} from "./flower-rig-math"

const STRAIGHT_POSE: FlowerRigStageKeyframe = {
  stage: 0,
  boneLengths: [1, 2, 3, 4],
  localAngles: [0, 0, 0, 0],
  headAnchorLength: 5,
}

describe("clampFlowerRigStage", () => {
  it("clamps below the minimum stage", () => {
    expect(clampFlowerRigStage(-3)).toBe(0)
    expect(clampFlowerRigStage(-Infinity)).toBe(0)
  })

  it("clamps above the maximum stage", () => {
    expect(clampFlowerRigStage(99)).toBe(10)
    expect(clampFlowerRigStage(Infinity)).toBe(10)
  })

  it("keeps fractional stages inside the range", () => {
    expect(clampFlowerRigStage(4.6)).toBe(4.6)
    expect(clampFlowerRigStage(0)).toBe(0)
    expect(clampFlowerRigStage(10)).toBe(10)
  })

  it("maps non-finite input to the minimum stage", () => {
    expect(clampFlowerRigStage(NaN)).toBe(0)
  })
})

describe("lerpFlowerRigKeyframes", () => {
  const a = FLOWER_RIG_STAGE_KEYFRAMES[2]
  const b = FLOWER_RIG_STAGE_KEYFRAMES[3]

  it("returns the exact endpoint keyframes at t = 0 and t = 1", () => {
    expect(lerpFlowerRigKeyframes(a, b, 0)).toBe(a)
    expect(lerpFlowerRigKeyframes(a, b, 1)).toBe(b)
  })

  it("clamps out-of-range and non-finite t to the endpoints", () => {
    expect(lerpFlowerRigKeyframes(a, b, -0.5)).toBe(a)
    expect(lerpFlowerRigKeyframes(a, b, 1.5)).toBe(b)
    expect(lerpFlowerRigKeyframes(a, b, NaN)).toBe(a)
  })

  it("blends lengths, angles and head anchor at a fractional t", () => {
    const mid = lerpFlowerRigKeyframes(a, b, 0.5)
    expect(mid.stage).toBeCloseTo(2.5, 10)
    expect(mid.boneLengths[0]).toBeCloseTo((8.8 + 11.2) / 2, 10)
    expect(mid.localAngles[0]).toBeCloseTo((0.04 + 0.05) / 2, 10)
    expect(mid.headAnchorLength).toBeCloseTo((4.8 + 6.2) / 2, 10)
  })
})

describe("sampleFlowerRigPose", () => {
  it("returns the baked keyframe untouched for integer stages", () => {
    expect(sampleFlowerRigPose(4)).toBe(FLOWER_RIG_STAGE_KEYFRAMES[4])
    expect(sampleFlowerRigPose(0)).toBe(FLOWER_RIG_STAGE_KEYFRAMES[0])
    expect(sampleFlowerRigPose(10)).toBe(FLOWER_RIG_STAGE_KEYFRAMES[10])
  })

  it("clamps out-of-range stages onto the baked endpoints", () => {
    expect(sampleFlowerRigPose(-2)).toBe(FLOWER_RIG_STAGE_KEYFRAMES[0])
    expect(sampleFlowerRigPose(42)).toBe(FLOWER_RIG_STAGE_KEYFRAMES[10])
    expect(sampleFlowerRigPose(NaN)).toBe(FLOWER_RIG_STAGE_KEYFRAMES[0])
  })

  it("lerps between neighbours for fractional stages", () => {
    const pose = sampleFlowerRigPose(2.5)
    expect(pose.stage).toBeCloseTo(2.5, 10)
    expect(pose.boneLengths[0]).toBeCloseTo(10, 10)
    expect(pose.localAngles[0]).toBeCloseTo(0.045, 10)
  })
})

describe("solveFlowerRigFk", () => {
  it("solves a straight pose exactly: root, four tips, head anchor", () => {
    expect(solveFlowerRigFk(STRAIGHT_POSE)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: -3 },
      { x: 0, y: -6 },
      { x: 0, y: -10 },
      { x: 0, y: -15 },
    ])
  })

  it("translates the whole rig by the root offset", () => {
    const points = solveFlowerRigFk(STRAIGHT_POSE, { x: 10, y: 20 })
    expect(points[0]).toEqual({ x: 10, y: 20 })
    expect(points[4]).toEqual({ x: 10, y: 10 })
    expect(points[5]).toEqual({ x: 10, y: 5 })
  })

  it("leans toward +x for positive angles and accumulates local angles", () => {
    const pose: FlowerRigStageKeyframe = {
      stage: 0,
      boneLengths: [2, 1, 1, 1],
      localAngles: [Math.PI / 2, -Math.PI / 2, 0, 0],
      headAnchorLength: 0,
    }
    const points = solveFlowerRigFk(pose)
    expect(points[1].x).toBeCloseTo(2, 10)
    expect(points[1].y).toBeCloseTo(0, 10)
    // Second bone cancels the first: cumulative angle back to straight up.
    expect(points[2].x).toBeCloseTo(2, 10)
    expect(points[2].y).toBeCloseTo(-1, 10)
  })

  it("always returns exactly six points in stable order", () => {
    for (const keyframe of FLOWER_RIG_STAGE_KEYFRAMES) {
      const points = solveFlowerRigFk(keyframe)
      expect(points).toHaveLength(6)
      expect(points[5].y).toBeLessThan(points[0].y)
    }
  })
})

describe("computeFlowerRigSwaySignal", () => {
  it("is the weight-normalized sum of exactly three sines", () => {
    const timeMs = 1234
    const seconds = timeMs / 1000
    const [c0, c1, c2] = FLOWER_RIG_IDLE_SWAY.components
    const expected =
      (c0.weight *
        Math.sin(2 * Math.PI * c0.frequencyHz * seconds + c0.phaseRadians) +
        c1.weight *
          Math.sin(2 * Math.PI * c1.frequencyHz * seconds + c1.phaseRadians) +
        c2.weight *
          Math.sin(2 * Math.PI * c2.frequencyHz * seconds + c2.phaseRadians)) /
      (c0.weight + c1.weight + c2.weight)
    expect(computeFlowerRigSwaySignal(timeMs)).toBeCloseTo(expected, 12)
  })

  it("is deterministic: equal time inputs give equal signals", () => {
    expect(computeFlowerRigSwaySignal(987.6)).toBe(
      computeFlowerRigSwaySignal(987.6),
    )
  })
})

describe("computeFlowerRigIdleSway", () => {
  it("applies per-segment amplitude and damping to the shared signal", () => {
    const timeMs = 4321
    const signal = computeFlowerRigSwaySignal(timeMs)
    const sway = computeFlowerRigIdleSway(timeMs)
    const { boneAmplitudes, segmentDamping } = FLOWER_RIG_IDLE_SWAY
    for (let bone = 0; bone < 4; bone += 1) {
      expect(sway[bone]).toBe(
        signal * boneAmplitudes[bone] * segmentDamping[bone],
      )
    }
  })

  it("damps the root below the head for a nonzero signal", () => {
    const timeMs = 250
    expect(computeFlowerRigSwaySignal(timeMs)).not.toBe(0)
    const sway = computeFlowerRigIdleSway(timeMs)
    expect(Math.abs(sway[0])).toBeLessThan(Math.abs(sway[3]))
  })

  it("is deterministic: equal time inputs give equal offsets", () => {
    expect(computeFlowerRigIdleSway(777)).toEqual(computeFlowerRigIdleSway(777))
  })
})

describe("evaluateFlowerRigPoints", () => {
  it("reduced motion returns the exact baked pose for an integer stage", () => {
    const points = evaluateFlowerRigPoints({
      stage: 4,
      timeMs: 1234,
      reducedMotion: true,
    })
    expect(points).toEqual(solveFlowerRigFk(FLOWER_RIG_STAGE_KEYFRAMES[4]))
  })

  it("reduced motion ignores timeMs entirely (no sway)", () => {
    const early = evaluateFlowerRigPoints({
      stage: 7,
      timeMs: 0,
      reducedMotion: true,
    })
    const late = evaluateFlowerRigPoints({
      stage: 7,
      timeMs: 987654,
      reducedMotion: true,
    })
    expect(early).toEqual(late)
  })

  it("reduced motion matches the sampled fractional pose exactly", () => {
    const points = evaluateFlowerRigPoints({
      stage: 4.5,
      timeMs: 500,
      reducedMotion: true,
    })
    expect(points).toEqual(solveFlowerRigFk(sampleFlowerRigPose(4.5)))
  })

  it("is deterministic with motion enabled", () => {
    const first = evaluateFlowerRigPoints({ stage: 6, timeMs: 1234 })
    const second = evaluateFlowerRigPoints({ stage: 6, timeMs: 1234 })
    expect(first).toEqual(second)
  })

  it("moves the head anchor over time when motion is enabled", () => {
    const atZero = evaluateFlowerRigPoints({ stage: 6, timeMs: 0 })
    const atLater = evaluateFlowerRigPoints({ stage: 6, timeMs: 250 })
    expect(atLater).not.toEqual(atZero)
    expect(atLater).not.toEqual(
      evaluateFlowerRigPoints({ stage: 6, reducedMotion: true }),
    )
  })

  it("defaults timeMs to 0 and still yields six points", () => {
    const points = evaluateFlowerRigPoints({ stage: 3 })
    expect(points).toHaveLength(6)
    expect(points).toEqual(evaluateFlowerRigPoints({ stage: 3, timeMs: 0 }))
  })

  it("honours the root offset together with reduced motion", () => {
    const root = { x: 40, y: 120 }
    const points = evaluateFlowerRigPoints({
      stage: 2,
      timeMs: 31415,
      reducedMotion: true,
      root,
    })
    expect(points).toEqual(
      solveFlowerRigFk(FLOWER_RIG_STAGE_KEYFRAMES[2], root),
    )
  })
})
