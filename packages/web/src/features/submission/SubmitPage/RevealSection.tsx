import { motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"

interface RevealSectionProps {
  children: ReactNode
  index: number
  label: string
  id?: string
}

const RevealSection = ({ children, index, label, id }: RevealSectionProps) => {
  const reducedMotion = useReducedMotion()

  return (
    <motion.section
      id={id}
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion
          ? undefined
          : { duration: 0.32, ease: "easeOut", delay: index * 0.06 }
      }
      className="flex flex-col gap-2"
    >
      <p className="w-fit text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </p>
      {children}
    </motion.section>
  )
}

export default RevealSection
