import type {
  Particle,
  ParticleEmission,
  ParticleRenderer,
} from "./particle-engine.types"

export const DEFAULT_PARTICLE_CAPACITY = 250
export const REDUCED_MOTION_PARTICLE_CAPACITY = 20

interface PooledParticle extends Particle {
  renderer: ParticleRenderer
}

const noopRenderer: ParticleRenderer = () => {}

function createParticle(): PooledParticle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ageMs: 0,
    lifetimeMs: 0,
    renderer: noopRenderer,
  }
}

function clampCapacity(requestedCapacity: number): number {
  if (Number.isNaN(requestedCapacity)) {
    return 0
  }

  return Math.trunc(
    Math.min(
      DEFAULT_PARTICLE_CAPACITY,
      Math.max(0, requestedCapacity),
    ),
  )
}

function emissionCount(count: number, availableCount: number): number {
  if (Number.isNaN(count) || count <= 0) {
    return 0
  }

  return Math.min(Math.floor(count), availableCount)
}

function resetParticle(particle: PooledParticle): void {
  particle.x = 0
  particle.y = 0
  particle.vx = 0
  particle.vy = 0
  particle.ageMs = 0
  particle.lifetimeMs = 0
  particle.renderer = noopRenderer
}

export class ParticleEngine {
  readonly capacity: number

  private readonly context: CanvasRenderingContext2D
  private readonly active: PooledParticle[] = []
  private readonly available: PooledParticle[] = []

  constructor(
    context: CanvasRenderingContext2D,
    requestedCapacity = DEFAULT_PARTICLE_CAPACITY,
  ) {
    this.context = context
    this.capacity = clampCapacity(requestedCapacity)

    for (let index = 0; index < this.capacity; index += 1) {
      this.available.push(createParticle())
    }
  }

  get activeCount(): number {
    return this.active.length
  }

  get activeParticles(): readonly Particle[] {
    return this.active
  }

  emit(emission: ParticleEmission): void {
    const count = emissionCount(emission.count, this.available.length)

    for (let index = 0; index < count; index += 1) {
      const particle = this.available.pop()
      if (!particle) {
        return
      }

      resetParticle(particle)
      particle.renderer = emission.render

      try {
        emission.initialize(particle, emission.random)
      } catch (error: unknown) {
        resetParticle(particle)
        this.available.push(particle)
        throw error
      }

      this.active.push(particle)
    }
  }

  update(deltaMs: number): void {
    const elapsedMs = Math.max(0, deltaMs)
    const elapsedSeconds = elapsedMs / 1_000

    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const particle = this.active[index]
      if (!particle) {
        continue
      }

      particle.ageMs += elapsedMs
      particle.x += particle.vx * elapsedSeconds
      particle.y += particle.vy * elapsedSeconds

      if (particle.ageMs >= particle.lifetimeMs) {
        this.release(index)
      }
    }
  }

  render(): void {
    for (const particle of this.active) {
      particle.renderer(particle, this.context)
    }
  }

  frame(deltaMs: number): void {
    this.update(deltaMs)
    this.render()
  }

  clear(): void {
    while (this.active.length > 0) {
      this.release(this.active.length - 1)
    }
  }

  private release(index: number): void {
    const particle = this.active[index]
    const last = this.active.pop()
    if (!particle || !last) {
      return
    }

    if (index < this.active.length) {
      this.active[index] = last
    }

    particle.renderer = noopRenderer
    this.available.push(particle)
  }
}
