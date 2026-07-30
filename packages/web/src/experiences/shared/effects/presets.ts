import type { ExperienceEffectColorRole } from "../types/experience-effect"
import type {
  Particle,
  ParticleEmission,
  ParticleRandom,
} from "./particle-engine.types"

/**
 * Intensity scaling for particle emissions.
 *
 * Each preset adapts its particle count and behavior based on intensity.
 * - subtle: minimal visual impact (≤20 particles for reduced-motion compat)
 * - normal: balanced visibility and performance
 * - strong: pronounced effect with higher particle counts
 */
export type PresetIntensity = "subtle" | "normal" | "strong"

/**
 * Common parameters passed to all preset generators.
 */
export interface PresetGeneratorParams {
  intensity: PresetIntensity
  random: ParticleRandom
  colorRoles?: ExperienceEffectColorRole[]
}

/**
 * Preset generator factory function signature.
 */
export type PresetGenerator = (params: PresetGeneratorParams) => ParticleEmission

// ============================================================================
// Utility: Particle initializers
// ============================================================================

/**
 * Initialize a burst particle: explosive spread from center.
 */
function initBurstParticle(
  particle: Particle,
  random: ParticleRandom,
  spread = 200,
  lifetime = 800,
): void {
  const angle = random() * Math.PI * 2
  const speed = 100 + random() * spread
  particle.vx = Math.cos(angle) * speed
  particle.vy = Math.sin(angle) * speed
  particle.lifetimeMs = lifetime
}

/**
 * Initialize a falling/gravity particle.
 */
function initFallingParticle(
  particle: Particle,
  random: ParticleRandom,
  horizontalSpread = 80,
  lifetime = 1200,
): void {
  particle.vx = (random() - 0.5) * horizontalSpread
  particle.vy = 50 + random() * 100
  particle.lifetimeMs = lifetime
}

// ============================================================================
// Preset generators (11 total)
// ============================================================================

/**
 * Dust Burst: Small particles exploding outward with quick fade.
 */
export const dustBurst: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 15,
    normal: 45,
    strong: 90,
  }
  const count = intensityMap[intensity]
  const lifetime = intensity === "subtle" ? 400 : 600

  return {
    count,
    random,
    initialize: (particle) => initBurstParticle(particle, random, 150, lifetime),
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = (1 - progress) * 0.7
      const size = Math.max(0.5, 1.5 * (1 - progress))

      context.fillStyle = `rgba(200, 180, 160, ${alpha})`
      context.beginPath()
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2)
      context.fill()
    },
  }
}

/**
 * Sand Trail: Descending granular particles in a narrow column.
 */
export const sandTrail: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 12,
    normal: 35,
    strong: 70,
  }
  const count = intensityMap[intensity]
  const lifetime = intensity === "subtle" ? 800 : 1200

  return {
    count,
    random,
    initialize: (particle) => {
      particle.vx = (random() - 0.5) * 40
      particle.vy = 80 + random() * 60
      particle.lifetimeMs = lifetime
    },
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = Math.max(0, 1 - progress * 1.2)
      const size = 1 + random() * 0.5

      context.fillStyle = `rgba(210, 190, 140, ${alpha})`
      context.beginPath()
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2)
      context.fill()
    },
  }
}

/**
 * Bubble Trail: Rising, semi-transparent circular particles.
 */
export const bubbleTrail: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 10,
    normal: 30,
    strong: 60,
  }
  const count = intensityMap[intensity]
  const lifetime = intensity === "subtle" ? 1000 : 1500

  return {
    count,
    random,
    initialize: (particle) => {
      particle.vx = (random() - 0.5) * 60
      particle.vy = -100 - random() * 80
      particle.lifetimeMs = lifetime
    },
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = (1 - progress) * 0.5
      const size = 3 + random() * 2

      context.strokeStyle = `rgba(100, 180, 220, ${alpha})`
      context.lineWidth = 1
      context.beginPath()
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2)
      context.stroke()
    },
  }
}

/**
 * Bubble Burst: Rapid outward expansion of bubble-like particles.
 */
export const bubbleBurst: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 16,
    normal: 50,
    strong: 100,
  }
  const count = intensityMap[intensity]

  return {
    count,
    random,
    initialize: (particle) => initBurstParticle(particle, random, 250, 700),
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = (1 - progress) * 0.6
      const size = 2 + random() * 1.5

      context.strokeStyle = `rgba(100, 180, 220, ${alpha})`
      context.lineWidth = 1.5
      context.beginPath()
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2)
      context.stroke()
    },
  }
}

/**
 * Speed Lines: Fast horizontal streaks suggesting motion.
 */
export const speedLines: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 8,
    normal: 20,
    strong: 40,
  }
  const count = intensityMap[intensity]

  return {
    count,
    random,
    initialize: (particle) => {
      particle.vx = 200 + random() * 300
      particle.vy = (random() - 0.5) * 50
      particle.lifetimeMs = 300
    },
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = (1 - progress) * 0.8
      const length = 10 + random() * 20

      context.strokeStyle = `rgba(220, 150, 80, ${alpha})`
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(particle.x - length / 2, particle.y)
      context.lineTo(particle.x + length / 2, particle.y)
      context.stroke()
    },
  }
}

/**
 * Sparkle Burst: Small bright points expanding with quick fade.
 */
export const sparkleBurst: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 12,
    normal: 40,
    strong: 80,
  }
  const count = intensityMap[intensity]

  return {
    count,
    random,
    initialize: (particle) => initBurstParticle(particle, random, 180, 500),
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = (1 - progress) * 0.9
      const size = Math.max(0.3, 0.8 * (1 - progress))

      context.fillStyle = `rgba(255, 220, 100, ${alpha})`
      context.beginPath()
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2)
      context.fill()
    },
  }
}

/**
 * Rain Shower: Descending particles in a vertical curtain.
 */
export const rainShower: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 10,
    normal: 30,
    strong: 60,
  }
  const count = intensityMap[intensity]

  return {
    count,
    random,
    initialize: (particle) => initFallingParticle(particle, random, 100, 1200),
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = Math.max(0, (1 - progress) * 0.6)

      context.strokeStyle = `rgba(100, 150, 220, ${alpha})`
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(particle.x, particle.y - 4)
      context.lineTo(particle.x, particle.y)
      context.stroke()
    },
  }
}

/**
 * Leaf Burst: Rotating particles expanding outward with flutter.
 */
export const leafBurst: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 10,
    normal: 35,
    strong: 70,
  }
  const count = intensityMap[intensity]

  return {
    count,
    random,
    initialize: (particle) => initBurstParticle(particle, random, 160, 900),
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = (1 - progress) * 0.7
      const rotation = progress * Math.PI * 4

      context.save()
      context.translate(particle.x, particle.y)
      context.rotate(rotation)
      context.fillStyle = `rgba(100, 180, 80, ${alpha})`
      context.fillRect(-2, -3, 4, 6)
      context.restore()
    },
  }
}

/**
 * Granule Drop: Small discrete particles falling and bouncing slightly.
 */
export const granuleDrop: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 12,
    normal: 35,
    strong: 70,
  }
  const count = intensityMap[intensity]

  return {
    count,
    random,
    initialize: (particle) => {
      particle.vx = (random() - 0.5) * 60
      particle.vy = 120 + random() * 100
      particle.lifetimeMs = intensity === "subtle" ? 600 : 1000
    },
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = (1 - progress) * 0.8
      const size = 0.8 + random() * 0.6

      context.fillStyle = `rgba(180, 160, 140, ${alpha})`
      context.beginPath()
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2)
      context.fill()
    },
  }
}

/**
 * Shield Deflect: Particles ricocheting outward in defensive pattern.
 */
export const shieldDeflect: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 14,
    normal: 50,
    strong: 100,
  }
  const count = intensityMap[intensity]

  return {
    count,
    random,
    initialize: (particle) => initBurstParticle(particle, random, 220, 600),
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = (1 - progress) * 0.8
      const size = 1.5 + random() * 1

      context.fillStyle = `rgba(120, 180, 255, ${alpha})`
      context.beginPath()
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2)
      context.fill()

      context.strokeStyle = `rgba(200, 230, 255, ${alpha * 0.5})`
      context.lineWidth = 0.5
      context.beginPath()
      context.arc(particle.x, particle.y, size + 1, 0, Math.PI * 2)
      context.stroke()
    },
  }
}

/**
 * Soft Poof: Gentle dissipating particles suggesting absorption or dissolution.
 */
export const softPoof: PresetGenerator = ({
  intensity,
  random,
  // colorRoles reserved for future renderer integration
}) => {
  const intensityMap: Record<PresetIntensity, number> = {
    subtle: 8,
    normal: 25,
    strong: 50,
  }
  const count = intensityMap[intensity]

  return {
    count,
    random,
    initialize: (particle) => {
      const angle = random() * Math.PI * 2
      const speed = 40 + random() * 80
      particle.vx = Math.cos(angle) * speed
      particle.vy = Math.sin(angle) * speed
      particle.lifetimeMs = intensity === "subtle" ? 500 : 800
    },
    render: (particle, context) => {
      const progress = particle.ageMs / particle.lifetimeMs
      const alpha = (1 - progress) * (1 - progress) * 0.6
      const size = 2 * (1 - progress)

      context.fillStyle = `rgba(200, 200, 200, ${alpha})`
      context.beginPath()
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2)
      context.fill()
    },
  }
}

/**
 * Catalog of all preset generators.
 * Each maps a presetId to its factory function.
 */
export const presetCatalog = {
  "dust-burst": dustBurst,
  "sand-trail": sandTrail,
  "bubble-trail": bubbleTrail,
  "bubble-burst": bubbleBurst,
  "speed-lines": speedLines,
  "sparkle-burst": sparkleBurst,
  "rain-shower": rainShower,
  "leaf-burst": leafBurst,
  "granule-drop": granuleDrop,
  "shield-deflect": shieldDeflect,
  "soft-poof": softPoof,
} as const

/**
 * Export all preset IDs for type safety and registration.
 */
export const allPresetIds = Object.keys(presetCatalog)
