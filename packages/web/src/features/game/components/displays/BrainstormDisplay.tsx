import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { motion } from "motion/react"

interface Props {
  textResponses: Record<string, number> | undefined
}

const BrainstormDisplay = ({ textResponses }: Props) => {
  const reveal = useReveal()

  return (
    <motion.div
      className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      {Object.entries(textResponses ?? {})
        .sort(([, a], [, b]) => b - a)
        .map(([text, count]) => (
          <motion.div
            key={text}
            variants={reveal.item()}
            transition={reveal.spring}
            className="flex items-center justify-between rounded-xl border border-[var(--border-hairline)] bg-white px-5 py-3 text-lg md:px-6 md:py-4 md:text-2xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
          >
            <span className="font-semibold">{text}</span>
            <span className="ml-4 flex shrink-0 items-center gap-2 font-bold">
              {count}
            </span>
          </motion.div>
        ))}
    </motion.div>
  )
}

export default BrainstormDisplay
