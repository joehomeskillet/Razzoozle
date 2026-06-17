/**
 * presets.ts — shared in-game animation vocabulary (Wave 0 contract).
 *
 * Single source of truth so every in-game screen / sub-component animates with the
 * same spring feel, stagger rhythm, and reduced-motion behaviour. Every animated
 * file under `features/game` imports from here instead of hand-rolling spring
 * numbers, so a fleet of independently-edited components stays visually coherent.
 *
 * Rules of thumb:
 *   - Lifecycle moments (screen enter, podium rise, result pop) → spring / layout.
 *   - Hot-path per-question / per-answer effects (timer pulse, tile press) → keep
 *     CSS / opacity cheap; reach for DURATION / EASE tokens, NOT layout springs
 *     (rooms can hold ~200 players — the per-answer firehose must stay light).
 *   - Everything behind `useReveal()` / the `reduced` flag → no fabricated motion
 *     when the user prefers reduced motion (opacity-only fallback, stagger → 0).
 *
 * Canonical usage (copy this shape):
 *
 *   const reveal = useReveal()
 *   <motion.ul variants={reveal.container()} initial="hidden" animate="visible">
 *     {items.map((it) => (
 *       <motion.li key={it.id} variants={reveal.item()} transition={reveal.spring}>
 *         …
 *       </motion.li>
 *     ))}
 *   </motion.ul>
 */
import { useReducedMotion } from "motion/react"
import type { Transition, Variants } from "motion/react"

type Bezier = [number, number, number, number]

/** Primary lifecycle spring — matches the dominant existing feel (300 / 24). */
export const SPRING: Transition = { type: "spring", stiffness: 300, damping: 24 }
/** Gentler settle for larger surfaces / full-screen entrances. */
export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 210,
  damping: 26,
}
/** Snappy feedback for press / lock-in / pop. */
export const SPRING_SNAP: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 28,
}
/** Numeric count-up spring (AnimatedPoints feel). */
export const SPRING_COUNT: Transition = {
  type: "spring",
  stiffness: 1000,
  damping: 30,
}

/** Tween durations (seconds) for CSS-cheap / opacity effects. */
export const DURATION = {
  instant: 0.12,
  fast: 0.2,
  base: 0.32,
  slow: 0.5,
  sheen: 0.8,
} as const

/** Shared easing curves (cubic-bezier tuples). */
export const EASE = {
  /** expo-out — snappy, decelerating entrances. */
  out: [0.16, 1, 0.3, 1] as Bezier,
  inOut: [0.65, 0, 0.35, 1] as Bezier,
} as const

/** Stagger delays between children (seconds). */
export const STAGGER = {
  fast: 0.04,
  base: 0.06,
  slow: 0.1,
} as const

/** Default rise distance (px) for fade-up reveals. */
export const RISE = 16

/* ----- Variant factories (pure; pair with the `reduced` flag from useReveal) ----- */

export const fadeUp = (distance: number = RISE): Variants => ({
  hidden: { opacity: 0, y: distance },
  visible: { opacity: 1, y: 0 },
})

export const fadeIn = (): Variants => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
})

export const scaleIn = (from: number = 0.92): Variants => ({
  hidden: { opacity: 0, scale: from },
  visible: { opacity: 1, scale: 1 },
})

/** Overshoot pop — for medals, result "moment of truth", reward badges. */
export const popIn = (from: number = 0.6): Variants => ({
  hidden: { opacity: 0, scale: from },
  visible: { opacity: 1, scale: [from, 1.08, 1] },
})

export const staggerContainer = (
  stagger: number = STAGGER.base,
  delayChildren: number = 0,
): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren } },
})

/** Opacity-only variants — the universal reduced-motion substitute. */
export const reducedVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

/* ----- The hook every blind packet should reach for first ----- */

export interface Reveal {
  /** True when the user prefers reduced motion. */
  reduced: boolean
  /** Lifecycle spring, or an instant fade tween when reduced. */
  spring: Transition
  /** Snappy spring, or instant fade when reduced. */
  snap: Transition
  /** Container variants with staggerChildren (stagger → 0 when reduced). */
  container: (stagger?: number, delayChildren?: number) => Variants
  /** Item reveal variants (fade + rise; opacity-only when reduced). */
  item: (distance?: number) => Variants
  /** Scale / overshoot pop reveal (opacity-only when reduced). */
  pop: (from?: number) => Variants
  /** A tween transition honouring reduced motion. */
  tween: (duration?: number, ease?: Bezier) => Transition
}

/**
 * Reduced-motion-aware bundle. Prefer this over the raw tokens in components:
 * it guarantees the opacity-only fallback and stagger collapse without each file
 * re-implementing the `useReducedMotion` guard.
 */
export const useReveal = (): Reveal => {
  const reduced = useReducedMotion() ?? false
  const instant: Transition = { duration: DURATION.instant }
  return {
    reduced,
    spring: reduced ? instant : SPRING,
    snap: reduced ? instant : SPRING_SNAP,
    container: (stagger = STAGGER.base, delayChildren = 0) =>
      staggerContainer(reduced ? 0 : stagger, reduced ? 0 : delayChildren),
    item: (distance = RISE) => (reduced ? reducedVariants : fadeUp(distance)),
    pop: (from = 0.6) => (reduced ? reducedVariants : popIn(from)),
    tween: (duration = DURATION.base, ease = EASE.out) =>
      reduced ? instant : { duration, ease },
  }
}
