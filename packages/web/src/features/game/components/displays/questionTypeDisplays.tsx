import type { QuestionMedia, SequencingItem } from "@razzoozle/common/types/game"
import type { ReactNode } from "react"
import type { QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { calculatePercentages } from "@razzoozle/web/features/game/utils/score"
import { motion } from "motion/react"
import { AnswerDistributionDisplay } from "./AnswerDistributionDisplay"
import BrainstormDisplay from "./BrainstormDisplay"
import { DropPinDisplay } from "./DropPinDisplay"
import { FillBlankDisplay } from "./FillBlankDisplay"
import { MatchingDisplay } from "./MatchingDisplay"
import { MathematikWortartenDisplay } from "./MathematikWortartenDisplay"
import { SliderValueDisplay } from "./SliderValueDisplay"
import TextAnswersDisplay from "./TextAnswersDisplay"
import { WordCloudResponsesDisplay } from "./WordCloudResponsesDisplay"

export interface ResponsesDisplayProps {
  question: string
  responses: Record<number, number>
  solutions: number[]
  answers: string[]
  media?: QuestionMedia
  type?: string
  correct?: number
  correctAnswer?: string
  unit?: string
  averageGuess?: number
  textResponses?: Record<string, number>
  acceptedAnswers?: string[]
  matchMode?: "exact" | "normalized" | "fuzzy"
  correctChunks?: string[]
  correctOrder?: string[]
  items?: SequencingItem[]
  correctTokenPos?: { token: string; pos: string }[]
  correctOptions?: string[]
  correctMatches?: string[]
  correctHotspotIndex?: number
}

export type QuestionTypeDisplay = (
  props: ResponsesDisplayProps,
) => ReactNode

/**
 * Shared centering shell for fill-blank / matching / drop-pin. Mirrors the
 * wrapper `motion.div` (`mx-auto flex w-full max-w-3xl flex-col items-center
 * gap-4 px-4`) that, in the pre-registry Responses.tsx, ALWAYS rendered for
 * these three types regardless of whether the type's own reveal guard
 * passed — only the inner content (now the extracted display component,
 * which returns null when its guard fails) was conditional. Keeping this
 * shell here (rather than inside the individual display components, which
 * are frozen 1:1 extractions) preserves that always-present layout wrapper.
 */
function ResultShell({ children }: { children: ReactNode }) {
  const reveal = useReveal()
  return (
    <motion.div
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  )
}

// Bar-chart distribution — today's catch-all for choice/boolean/poll/
// multiple-select. `percentages` isn't part of ResponsesDisplayProps (it was
// derived state in the old Responses.tsx); calculatePercentages is pure, so
// it's recomputed here from `responses` instead — same function, same result.
const answerDistribution: QuestionTypeDisplay = (props) => (
  <AnswerDistributionDisplay
    answers={props.answers}
    responses={props.responses}
    percentages={calculatePercentages(props.responses)}
  />
)

// Mathematik/Wortarten: reveal the correct answer when present; otherwise
// today's ternary chain falls all the way through to the bar chart (none of
// the other type branches match either) — replicated here so the visible
// fallback for this edge case is unchanged.
const mathematikWortarten: QuestionTypeDisplay = (props) =>
  props.correctAnswer ? (
    <MathematikWortartenDisplay correctAnswer={props.correctAnswer} />
  ) : (
    answerDistribution(props)
  )

export const QUESTION_TYPE_DISPLAYS: Partial<
  Record<QuestionTypeKey, QuestionTypeDisplay>
> = {
  "type-answer": (props) => (
    <TextAnswersDisplay
      textResponses={props.textResponses}
      acceptedAnswers={props.acceptedAnswers}
      matchMode={props.matchMode}
      correctChunks={props.correctChunks}
      isTypeAnswer={true}
      isSentenceBuilder={false}
    />
  ),
  "sentence-builder": (props) => (
    <TextAnswersDisplay
      textResponses={props.textResponses}
      acceptedAnswers={props.acceptedAnswers}
      matchMode={props.matchMode}
      correctChunks={props.correctChunks}
      isTypeAnswer={false}
      isSentenceBuilder={true}
    />
  ),
  brainstorm: (props) => (
    <BrainstormDisplay textResponses={props.textResponses} />
  ),
  // SliderValueDisplay.correct is required (number | string); the server
  // always populates `correct` on SHOW_RESPONSES for slider questions (the
  // field is optional on the shared payload only because most other types
  // don't use it) — same unguarded usage as the original inline JSX.
  slider: (props) => (
    <SliderValueDisplay
      correct={props.correct!}
      unit={props.unit}
      averageGuess={props.averageGuess}
    />
  ),
  mathematik: mathematikWortarten,
  wortarten: mathematikWortarten,
  "fill-blank": (props) => (
    <ResultShell>
      <FillBlankDisplay correctOptions={props.correctOptions} />
    </ResultShell>
  ),
  matching: (props) => (
    <ResultShell>
      <MatchingDisplay correctMatches={props.correctMatches} />
    </ResultShell>
  ),
  "drop-pin": (props) => (
    <ResultShell>
      <DropPinDisplay
        media={props.media}
        correctAnswer={props.correctAnswer}
        correctHotspotIndex={props.correctHotspotIndex}
      />
    </ResultShell>
  ),
  "word-cloud": (props) => (
    <WordCloudResponsesDisplay textResponses={props.textResponses} />
  ),
  // Classic answer-array + bar-chart types (today's ternary catch-all).
  choice: answerDistribution,
  boolean: answerDistribution,
  poll: answerDistribution,
  "multiple-select": answerDistribution,
}

export function resolveDisplay(
  type: QuestionTypeKey | undefined,
  fallback: QuestionTypeDisplay,
): QuestionTypeDisplay {
  if (type === undefined) {
    return fallback
  }
  return QUESTION_TYPE_DISPLAYS[type] ?? fallback
}
