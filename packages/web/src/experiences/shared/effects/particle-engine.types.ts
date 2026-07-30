export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  ageMs: number
  lifetimeMs: number
}

export type ParticleRandom = () => number

export type ParticleInitializer = (
  particle: Particle,
  random: ParticleRandom,
) => void

export type ParticleRenderer = (
  particle: Particle,
  context: CanvasRenderingContext2D,
) => void

export interface ParticleEmission {
  count: number
  random: ParticleRandom
  initialize: ParticleInitializer
  render: ParticleRenderer
}
