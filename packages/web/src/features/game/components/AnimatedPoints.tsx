/**
 * AnimatedPoints — a spring-animated integer counter.
 *
 * Lifted out of Leaderboard.tsx so both the host leaderboard and the solo
 * finished screen can reuse the same count-up. When the user prefers reduced
 * motion the spring is skipped entirely and the final value renders instantly.
 */
import { useReducedMotion, useSpring, useTransform } from "motion/react"
import { useEffect, useState } from "react"

interface Props {
  /** Final value to count up to. */
  to: number
  /** Starting value for the count-up. Defaults to 0. */
  from?: number
  className?: string
}

const AnimatedPoints = ({ to, from = 0, className }: Props) => {
  const reduced = useReducedMotion() ?? false
  const spring = useSpring(from, { stiffness: 1000, damping: 30 })
  const display = useTransform(spring, (value) => Math.round(value))
  const [displayValue, setDisplayValue] = useState(from)

  useEffect(() => {
    // Reduced motion → jump straight to the final value, no spring.
    if (reduced) {
      setDisplayValue(to)
      return
    }
    spring.set(to)
    const unsubscribe = display.on("change", (latest) => {
      setDisplayValue(latest)
    })

    return unsubscribe
  }, [to, reduced, spring, display])

  return (
    <span className={className ?? "tabular-nums drop-shadow-md"}>
      {displayValue}
    </span>
  )
}

export default AnimatedPoints
