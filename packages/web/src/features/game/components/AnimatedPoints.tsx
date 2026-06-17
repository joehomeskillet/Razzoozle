/**
 * AnimatedPoints — a spring-animated integer counter.
 *
 * Lifted out of Leaderboard.tsx so both the host leaderboard and the solo
 * finished screen can reuse the same count-up. When the user prefers reduced
 * motion the spring is skipped entirely and the final value renders instantly.
 *
 * The rounded value is rendered straight from a MotionValue child, so the spring
 * drives the text node directly — no per-frame React setState / re-render.
 */
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react"
import { useEffect } from "react"

import { SPRING_COUNT } from "@razzoozle/web/features/game/animation/presets"

interface Props {
  /** Final value to count up to. */
  to: number
  /** Starting value for the count-up. Defaults to 0. */
  from?: number
  className?: string
}

const AnimatedPoints = ({ to, from = 0, className }: Props) => {
  const reduced = useReducedMotion() ?? false
  const spring = useSpring(from, SPRING_COUNT)
  const display = useTransform(spring, (value) => Math.round(value))

  useEffect(() => {
    // Reduced motion → jump straight to the final value, no spring.
    if (reduced) {
      spring.jump(to)
      return
    }
    spring.set(to)
  }, [to, reduced, spring])

  return (
    <motion.span className={className ?? "tabular-nums drop-shadow-md"}>
      {display}
    </motion.span>
  )
}

export default AnimatedPoints
