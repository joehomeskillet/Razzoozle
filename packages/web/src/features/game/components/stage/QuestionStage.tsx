import type { ReactNode } from "react"
import { motion } from "motion/react"
import Markdown from "@razzoozle/web/components/Markdown"
import { useGameAudience } from "@razzoozle/web/features/game/audience"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"

export interface QuestionStageProps {
  question: string
  media?: ReactNode
  hud?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

export function QuestionStage({
  question,
  media,
  hud,
  actions,
  children,
}: QuestionStageProps): ReactNode {
  const audience = useGameAudience()
  const reveal = useReveal()

  // Audience-aware typography: presenter/display scales larger for distance,
  // player keeps compact mobile-first scaling.
  const headingClass =
    audience === "player"
      ? "text-2xl font-bold md:text-4xl"
      : "text-3xl font-bold md:text-5xl lg:text-[clamp(2.5rem,6vh,6rem)]"

  return (
    <div className="flex min-h-full flex-1 flex-col justify-between gap-[var(--game-space-4)]">
      {/* Question + optional media — reveal container animates on question change */}
      <motion.div
        key={`question-reveal-${question}`}
        variants={reveal.container()}
        initial="hidden"
        animate="visible"
        transition={reveal.spring}
        className="mx-auto inline-flex min-h-0 w-full max-w-7xl flex-1 flex-col items-center justify-center gap-[var(--game-space-5)] lg:max-w-[85vw]"
      >
        <motion.h2
          variants={reveal.item()}
          data-testid="question-text"
          className={`text-center text-[color:var(--game-fg)] ${headingClass}`}
        >
          <Markdown>{question}</Markdown>
        </motion.h2>

        {media && (
          <motion.div variants={reveal.item()} className="w-full">
            {media}
          </motion.div>
        )}
      </motion.div>

      {/* HUD + interaction + actions */}
      <div className="space-y-[var(--game-space-5)]">
        {hud}

        {children && <div className="w-full">{children}</div>}

        {actions && <div className="w-full">{actions}</div>}
      </div>
    </div>
  )
}
