// Stable element ids so a validation failure can scroll+focus the offending
// field. The name input is owned here; the question/answers fields live in
// child editor components, so we anchor on their section containers.
export const NAME_INPUT_ID = "submit-submitted-by"
export const NAME_ERROR_ID = "submit-submitted-by-error"
export const QUESTION_SECTION_ID = "submit-section-question"
export const ANSWERS_SECTION_ID = "submit-section-answers"

// Which on-page target a failing validator path maps to. The submission
// validator parses `{ submittedBy, question }`, so issue paths start with
// "submittedBy" (the name field) or "question" (the editor sub-fields).
export type InvalidTarget = "name" | "question" | "answers"

// questionValidator's superRefine emits answer-shape errors with path
// ["question"] (no index) and a known i18n message key, so a path-only check
// strands them on the question section. Match those messages (and "solutions")
// so they land on the ANSWERS section where the offending control lives.
const ANSWER_ERROR_MESSAGES = new Set([
  "errors:quizz.tooFewAnswers",
  "errors:quizz.tooManyAnswers",
  "errors:quizz.noSolution",
  "errors:quizz.solutionsMin2",
  "errors:quizz.answerEmpty",
  "errors:quizz.acceptedAnswersMin",
  "errors:quizz.tooFewChunks",
  "errors:quizz.chunkEmpty",
  "errors:quizz.chunkTooLong",
])

export const resolveInvalidTarget = (
  path: PropertyKey[],
  message: string,
): InvalidTarget => {
  if (path[0] === "submittedBy") {
    return "name"
  }

  // path[0] === "question": answer-shape paths ("answers"/"acceptedAnswers"/
  // "solutions"/"chunks") AND the message-keyed superRefine answer errors → answers
  // section. Everything else (question text, slider refine issues) → question.
  if (
    path[1] === "answers" ||
    path[1] === "acceptedAnswers" ||
    path[1] === "solutions" ||
    path[1] === "chunks" ||
    ANSWER_ERROR_MESSAGES.has(message)
  ) {
    return "answers"
  }

  return "question"
}
