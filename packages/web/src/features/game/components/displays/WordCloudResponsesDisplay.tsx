import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { WordCloudDisplay as WordCloudComponent } from "@razzoozle/web/features/game/components/answers/WordCloudDisplay"
import { motion } from "motion/react"

interface Props {
  textResponses?: Record<string, number>
}

/**
 * Wraps the existing WordCloudDisplay component with reveal animation.
 * Renders the word cloud if textResponses contains any entries.
 */
export function WordCloudResponsesDisplay({ textResponses }: Props) {
  const reveal = useReveal()

  const words =
    textResponses && Object.keys(textResponses).length > 0
      ? Object.entries(textResponses).map(([text, count]) => ({ text, count }))
      : []

  return (
    <motion.div
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      <WordCloudComponent words={words} />
    </motion.div>
  )
}
