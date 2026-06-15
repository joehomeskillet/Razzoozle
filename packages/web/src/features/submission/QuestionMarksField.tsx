import { motion, useReducedMotion } from "motion/react"
import { useMemo } from "react"

// Decorative palette — vibrant, pops on the purple frame. These are NOT
// theme-bound; they stay constant so the field always reads as celebratory.
const PALETTE = [
  "#FBBF24",
  "#F472B6",
  "#34D399",
  "#38BDF8",
  "#FB923C",
  "#A3E635",
  "#FFFFFF",
  "#C084FC",
]

const COUNT = 36

interface Mark {
  left: number
  top: number
  size: number
  color: string
  delay: number
  duration: number
  repeatDelay: number
  rotate: number
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

const pick = <T,>(arr: readonly T[]) =>
  arr[Math.floor(Math.random() * arr.length)]

/**
 * A full-bleed, behind-content layer of multicolored "?" glyphs that
 * continuously POP in and out — the celebratory spirit of the results-page
 * confetti, rendered as question marks for the /submit page.
 *
 * Sits inside the page frame BEHIND the form surface (`-z-0`); the surface is a
 * higher-z sibling. Always `pointer-events-none` + `aria-hidden`, so it never
 * intercepts form clicks. Honours `prefers-reduced-motion`: a few static,
 * low-opacity marks instead of any animation.
 */
export default function QuestionMarksField() {
  const reducedMotion = useReducedMotion()

  // Generate the field ONCE — Math.random is fine at browser runtime.
  const marks = useMemo<Mark[]>(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        // Bias ~2/3 of the marks into the outer left/right columns so plenty
        // stay visible in the side margins around the (wide) form surface
        // instead of being hidden behind it; the rest spread freely.
        const edgeBiased = i % 3 !== 0
        const left = edgeBiased
          ? Math.random() < 0.5
            ? rand(0, 13)
            : rand(87, 100)
          : rand(4, 94)

        return {
          left,
          top: rand(3, 95),
          size: rand(1.6, 4.5),
          color: pick(PALETTE),
          delay: rand(0, 5),
          duration: rand(2.8, 5.5),
          repeatDelay: rand(0.4, 1.6),
          rotate: rand(-18, 18),
        }
      }),
    [],
  )

  if (reducedMotion) {
    // A few calm, static marks — no motion under reduced-motion.
    return (
      <div
        className="pointer-events-none absolute inset-0 -z-0 overflow-hidden"
        aria-hidden
      >
        {marks.slice(0, 10).map((mark, i) => (
          <span
            key={i}
            className="absolute font-extrabold select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
            style={{
              left: `${mark.left}%`,
              top: `${mark.top}%`,
              fontSize: `${mark.size}rem`,
              color: mark.color,
              opacity: 0.35,
              transform: `rotate(${mark.rotate}deg)`,
            }}
          >
            ?
          </span>
        ))}
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 -z-0 overflow-hidden"
      aria-hidden
    >
      {marks.map((mark, i) => (
        <motion.span
          key={i}
          className="absolute font-extrabold select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
          style={{
            left: `${mark.left}%`,
            top: `${mark.top}%`,
            fontSize: `${mark.size}rem`,
            color: mark.color,
          }}
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{
            opacity: [0, 0.9, 0.9, 0],
            scale: [0.2, 1.15, 1, 0.6],
            y: [12, -6, -10, -22],
            rotate: [mark.rotate * 0.4, mark.rotate],
          }}
          transition={{
            duration: mark.duration,
            delay: mark.delay,
            repeat: Infinity,
            repeatDelay: mark.repeatDelay,
            ease: "easeInOut",
            times: [0, 0.25, 0.7, 1],
          }}
        >
          ?
        </motion.span>
      ))}
    </div>
  )
}
