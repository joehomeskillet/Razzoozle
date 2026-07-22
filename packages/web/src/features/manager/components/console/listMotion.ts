/**
 * SDD docs/specs/manager-row-system.md §9 (R15) — geteilte Listen-Entry-Motion
 * Konsumenten: SelectQuizz, Results, QuizzList, Catalog, Submissions
 */

import type { TargetAndTransition, VariantLabels } from "motion/react"

export interface ListContainerMotionProps {
  initial: boolean | TargetAndTransition | VariantLabels
  animate?: TargetAndTransition | VariantLabels | boolean
  transition?: {
    duration: number
    ease: "easeOut"
  }
}

export interface ListItemMotionProps {
  initial: boolean | TargetAndTransition | VariantLabels
  animate?: TargetAndTransition | VariantLabels | boolean
  transition?: {
    duration: number
    ease: "easeOut"
    delay: number
  }
}

export function listContainerMotion(
  reducedMotion: boolean | null,
): ListContainerMotionProps {
  if (reducedMotion) {
    return {
      initial: false as const,
    }
  }
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3, ease: "easeOut" as const },
  }
}

export function listItemMotion(
  index: number,
  reducedMotion: boolean | null,
): ListItemMotionProps {
  if (reducedMotion) {
    return {
      initial: false as const,
    }
  }
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.28,
      ease: "easeOut" as const,
      delay: Math.min(index, 8) * 0.04,
    },
  }
}
