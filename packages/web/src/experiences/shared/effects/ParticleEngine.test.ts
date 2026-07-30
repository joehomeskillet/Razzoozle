import { describe, expect, it } from "vitest"

import { createSeededRandom } from "../random/createSeededRandom"
import {
  DEFAULT_PARTICLE_CAPACITY,
  ParticleEngine,
  REDUCED_MOTION_PARTICLE_CAPACITY,
} from "./ParticleEngine"
import type { Particle } from "./particle-engine.types"

const createFakeContext = (): CanvasRenderingContext2D =>
  ({ clearRect() {} }) as unknown as CanvasRenderingContext2D

describe("ParticleEngine pool", () => {
  it("exports the normal and reduced-motion hard capacities", () => {
    expect(DEFAULT_PARTICLE_CAPACITY).toBe(250)
    expect(REDUCED_MOTION_PARTICLE_CAPACITY).toBe(20)
  })

  it("constructs with a 2D context and fixed capacity", () => {
    const engine = new ParticleEngine(createFakeContext(), 7)

    expect(engine.capacity).toBe(7)
    expect(engine.activeCount).toBe(0)
    expect(engine.activeParticles).toEqual([])
  })

  it("does not spawn beyond pool capacity", () => {
    const engine = new ParticleEngine(createFakeContext(), 2)
    const spawned: Particle[] = []

    engine.emit({
      count: 3,
      random: createSeededRandom(42),
      initialize: (particle) => {
        spawned.push(particle)
        particle.lifetimeMs = 100
      },
      render: () => {},
    })

    expect(engine.activeCount).toBe(2)
    expect(engine.activeParticles).toHaveLength(2)
    expect(spawned).toHaveLength(2)
    expect(new Set(spawned).size).toBe(2)
  })

  it("reuses a released particle object after update expires it", () => {
    const engine = new ParticleEngine(createFakeContext(), 1)
    let first: Particle | undefined
    engine.emit({
      count: 1,
      random: createSeededRandom(1),
      initialize: (particle) => {
        first = particle
        particle.lifetimeMs = 10
      },
      render: () => {},
    })
    engine.update(10)

    let second: Particle | undefined
    engine.emit({
      count: 1,
      random: createSeededRandom(2),
      initialize: (particle) => {
        second = particle
        particle.lifetimeMs = 10
      },
      render: () => {},
    })

    expect(engine.activeCount).toBe(1)
    expect(second).toBe(first)
  })
})

describe("ParticleEngine deterministic emission", () => {
  it("produces literal active-particle snapshots for the same seed and config", () => {
    const first = new ParticleEngine(createFakeContext(), 2)
    const second = new ParticleEngine(createFakeContext(), 2)

    for (const engine of [first, second]) {
      engine.emit({
        count: 2,
        random: createSeededRandom(42),
        initialize: (particle, random) => {
          particle.x = 10
          particle.y = 20
          particle.vx = random()
          particle.vy = random()
          particle.lifetimeMs = 100
        },
        render: () => {},
      })
    }

    const snapshot = (engine: ParticleEngine) =>
      engine.activeParticles.map(({ x, y, vx, vy, ageMs, lifetimeMs }) => ({
        x,
        y,
        vx,
        vy,
        ageMs,
        lifetimeMs,
      }))

    const expected = [
      {
        x: 10,
        y: 20,
        vx: 0.6011037519201636,
        vy: 0.44829055899754167,
        ageMs: 0,
        lifetimeMs: 100,
      },
      {
        x: 10,
        y: 20,
        vx: 0.8524657934904099,
        vy: 0.6697340414393693,
        ageMs: 0,
        lifetimeMs: 100,
      },
    ]

    expect(snapshot(first)).toEqual(expected)
    expect(snapshot(second)).toEqual(expected)
  })

  it("clear releases every active particle", () => {
    const engine = new ParticleEngine(createFakeContext(), 2)
    engine.emit({
      count: 2,
      random: createSeededRandom(42),
      initialize: (particle) => {
        particle.lifetimeMs = 100
      },
      render: () => {},
    })

    engine.clear()

    expect(engine.activeCount).toBe(0)
    expect(engine.activeParticles).toEqual([])
  })
})
