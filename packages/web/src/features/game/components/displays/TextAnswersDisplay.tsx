import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { matchAnswer } from "@razzoozle/web/features/game/utils/text-match"
import clsx from "clsx"
import { Check } from "lucide-react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

interface Props {
  textResponses: Record<string, number> | undefined
  acceptedAnswers: string[] | undefined
  matchMode: "exact" | "normalized" | "fuzzy" | undefined
  correctChunks?: string[] | undefined
  isTypeAnswer?: boolean
  isSentenceBuilder?: boolean
}

const TextAnswersDisplay = ({
  textResponses,
  acceptedAnswers,
  matchMode,
  correctChunks,
  isTypeAnswer = false,
  isSentenceBuilder = false,
}: Props) => {
  const reveal = useReveal()
  const { t } = useTranslation()

  return (
    <div className="mx-auto w-full max-w-7xl px-4 lg:max-w-[85vw]">
      {/* Accepted answers legend (outside scroll area) */}
      {isTypeAnswer && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(acceptedAnswers ?? []).map((a) => (
            <span
              key={a}
              className="text-answer-text rounded-full bg-[var(--state-correct-soft)] px-4 py-2 text-base font-semibold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
            >
              {a}
            </span>
          ))}
        </div>
      )}
      {/* Submitted text answers, ranked by frequency — internal scroll */}
      <motion.div
        className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto"
        variants={reveal.container()}
        initial="hidden"
        animate="visible"
      >
        {Object.entries(textResponses ?? {})
          .sort(([, a], [, b]) => b - a)
          .map(([text, count]) => {
            const isMatch = matchAnswer(
              text,
              acceptedAnswers ?? [],
              matchMode ?? "normalized",
            )

            return (
              <motion.div
                key={text}
                variants={reveal.item()}
                transition={reveal.spring}
                className={clsx(
                  "flex items-center justify-between rounded-xl px-5 py-3 text-lg md:px-6 md:py-4 md:text-2xl lg:text-[clamp(1.25rem,3vh,2.5rem)]",
                  isMatch
                    ? "text-answer-text bg-[var(--state-correct-soft)]"
                    : "border border-[var(--border-hairline)] bg-white text-[color:var(--color-field-ink)]/70",
                )}
              >
                <span className="font-semibold">{text}</span>
                <span className="ml-4 flex shrink-0 items-center gap-2 font-bold">
                  {count}
                  {isMatch && (
                    <Check className="size-6 text-[var(--state-correct)] md:size-8 lg:size-10" />
                  )}
                </span>
              </motion.div>
            )
          })}
      </motion.div>
      {isSentenceBuilder && correctChunks && (
        <motion.div
          className="mt-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]"
          variants={reveal.item()}
          transition={reveal.spring}
        >
          <p className="mb-2 text-sm font-semibold text-[color:var(--game-fg)]">
            {t("game:sentenceBuilder.correctSentence")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {correctChunks.map((chunk, i) => (
              <span
                key={`${chunk}-${i}`}
                className="text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--state-correct)] px-3 py-2 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
              >
                {chunk}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default TextAnswersDisplay
