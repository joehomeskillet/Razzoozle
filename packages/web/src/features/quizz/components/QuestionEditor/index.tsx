import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import QuestionEditorAcceptedAnswers from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorAcceptedAnswers"
import QuestionEditorAnswers from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorSentence from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorSentence"
import QuestionEditorTitle from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import QuestionEditorType from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorType"
import QuestionEditorMathe from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorMathe"
import QuestionEditorWortarten from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorWortarten"
import { motion, useReducedMotion } from "motion/react"
import { type ReactNode } from "react"

interface RevealProps {
  children: ReactNode
  index: number
}

/**
 * One subtle staggered fade/slide-up reveal on mount (matches /submit). GPU-only
 * (transform/opacity) and gated by `useReducedMotion()`.
 */
const Reveal = ({ children, index }: RevealProps) => {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion
          ? undefined
          : { duration: 0.32, ease: "easeOut", delay: index * 0.06 }
      }
    >
      {children}
    </motion.div>
  )
}

/**
 * The editor body: the question canvas (`<main>`) plus the per-question config.
 *
 * Layout is driven by the parent page shell. On desktop the parent lays
 * sidebar | this | (nothing else) out in a row and `main` + `config` sit
 * side-by-side here (`xl:flex-row`); on mobile (< 768px / < xl when the rail is
 * already cramped) `main` and the config rail STACK — the config flows
 * full-width below the canvas instead of squeezing into a tiny side column.
 *
 * The shared sub-components (Title/Type/Media/Answers/Config) are reused as-is —
 * /submit wraps the same components, so their markup stays untouched here.
 */
const QuestionEditor = () => {
  const { currentQuestion } = useQuizzEditor()
  const isSlider = currentQuestion.type === "slider"
  const isTypeAnswer = currentQuestion.type === "type-answer"
  const isSentenceBuilder = currentQuestion.type === "sentence-builder"
  const isMathematik = currentQuestion.type === "mathematik"
  const isWortarten = currentQuestion.type === "wortarten"

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain xl:flex-row xl:overflow-hidden">
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-6 xl:overflow-y-auto">
        <Reveal index={0}>
          <QuestionEditorTitle />
        </Reveal>

        <Reveal index={1}>
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm [&_audio]:max-w-full [&_img]:max-w-full [&_video]:max-w-full">
            <QuestionEditorMedia />
          </div>
        </Reveal>

        {!isSlider && !isTypeAnswer && !isSentenceBuilder && !isMathematik && !isWortarten && (
          <Reveal index={2}>
            <QuestionEditorAnswers />
          </Reveal>
        )}
        {isTypeAnswer && (
          <Reveal index={2}>
            <QuestionEditorAcceptedAnswers />
          </Reveal>
        )}
        {isSentenceBuilder && (
          <Reveal index={2}>
            <QuestionEditorSentence />
          </Reveal>
        )}
        {isMathematik && (
          <Reveal index={2}>
            <QuestionEditorMathe />
          </Reveal>
        )}
        {isWortarten && (
          <Reveal index={2}>
            <QuestionEditorWortarten />
          </Reveal>
        )}

        <Reveal index={3}>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <QuestionEditorType />
          </div>
        </Reveal>
      </main>

      <QuestionEditorConfig />
    </div>
  )
}

export default QuestionEditor
