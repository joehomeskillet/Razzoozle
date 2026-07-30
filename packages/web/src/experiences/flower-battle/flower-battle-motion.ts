/**
 * Flower Battle Motion & Timing Constants
 * Pure timing definitions for power-up effects (fertilizer, umbrella, sunbeam, acid-cloud).
 * No React imports, no state, no side effects. Motion enums + reduced-motion variants.
 *
 * Anchor documentation:
 *   - fertilizer.svg: id="bucket-body", id="liquid-level", id="pour-stream"
 *   - umbrella.svg: id="canopy", id="droplet-1", id="droplet-2", id="droplet-3"
 *   - sunbeam.svg: id="center-glow", id="ray-1"..."ray-5"
 *   - acid-cloud.svg: id="cloud-base", id="drop-1"..."drop-7"
 */

// ============================================================================
// FERTILIZER EFFECT
// ============================================================================

export const FertilizerPhase = {
  /** Container appears (0–100ms) */
  Enter: 0,
  /** Liquid pour starts (100–220ms) */
  PourStart: 100,
  /** Pour peak & glow (220–500ms) */
  PourActive: 220,
  /** Fade-out (500–520ms) */
  Exit: 500,
} as const

export const FertilizerTiming = {
  duration: 520,
  phases: FertilizerPhase,
  reduced: {
    /** Reduced motion: compress to 150ms, no bounce */
    duration: 150,
    phases: {
      Enter: 0,
      PourStart: 40,
      PourActive: 80,
      Exit: 150,
    },
  },
} as const

// ============================================================================
// SUNBEAM EFFECT
// ============================================================================

export const SunbeamRay = {
  Ray1: 0,
  Ray2: 1,
  Ray3: 2,
  Ray4: 3,
  Ray5: 4,
} as const

export const SunbeamTiming = {
  /** Total duration: 200ms (3–5 rays staggered) */
  duration: 200,
  rayStartMs: (rayIndex: number): number => {
    const offsets = [600, 630, 660, 690, 720] // ms offset from effect start
    return offsets[rayIndex] || offsets[0]
  },
  rayDurationMs: 140,
  reduced: {
    /** Reduced motion: 100ms total, single ray */
    duration: 100,
    rayStartMs: () => 0,
    rayDurationMs: 100,
  },
} as const

// ============================================================================
// UMBRELLA EFFECT (SHIELD)
// ============================================================================

export const UmbrellaDroplet = {
  Droplet1: 0,
  Droplet2: 1,
  Droplet3: 2,
} as const

export const UmbrellaTiming = {
  /** Scale from 0.8 to 1.0 + droplet block (3 drops) */
  duration: 300,
  /** Canopy scale-in: 0.8 → 1.0 (elastic) */
  scaleStartMs: 0,
  scaleDurationMs: 200,
  /** Droplet block starts after scale peak */
  dropletStartMs: 150,
  dropletDurationMs: 150,
  dropletCount: 3,
  reduced: {
    /** Reduced motion: instant scale, no droplet fall */
    duration: 100,
    scaleStartMs: 0,
    scaleDurationMs: 100,
    dropletStartMs: 100,
    dropletDurationMs: 0,
  },
} as const

// ============================================================================
// ACID CLOUD EFFECT
// ============================================================================

export const AcidDroplet = {
  Drop1: 0,
  Drop2: 1,
  Drop3: 2,
  Drop4: 3,
  Drop5: 4,
  Drop6: 5,
  Drop7: 6,
} as const

export const AcidCloudTiming = {
  /** Cloud poison effect: 5–7 drops fall over ~400ms */
  duration: 400,
  cloudEnterMs: 0,
  cloudEnterDurationMs: 100,
  /** Droplet fall stagger (each drop delays by ~40ms) */
  dropletStartMs: (dropIndex: number): number => {
    const baseStart = 120
    return baseStart + dropIndex * 40
  },
  dropletFallDurationMs: 250,
  dropletCount: 7,
  reduced: {
    /** Reduced motion: cloud only, no falling drops */
    duration: 80,
    cloudEnterMs: 0,
    cloudEnterDurationMs: 80,
    dropletStartMs: () => 80,
    dropletFallDurationMs: 0,
  },
} as const

// ============================================================================
// REDUCED MOTION PRESET
// ============================================================================

export const ReducedMotionPreset = {
  fertilizer: FertilizerTiming.reduced,
  sunbeam: SunbeamTiming.reduced,
  umbrella: UmbrellaTiming.reduced,
  acidCloud: AcidCloudTiming.reduced,
} as const

/**
 * Get timing config respecting user's prefers-reduced-motion
 * Usage: const timing = getMotionTiming(prefersReducedMotion, 'fertilizer')
 */
export function getMotionTiming(
  prefersReduced: boolean,
  effectKey: 'fertilizer' | 'sunbeam' | 'umbrella' | 'acidCloud',
) {
  if (!prefersReduced) {
    switch (effectKey) {
      case 'fertilizer':
        return FertilizerTiming
      case 'sunbeam':
        return SunbeamTiming
      case 'umbrella':
        return UmbrellaTiming
      case 'acidCloud':
        return AcidCloudTiming
    }
  }
  return ReducedMotionPreset[effectKey]
}
