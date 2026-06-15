// Drop blank answer slots (and reindex the solution indices) before a question
// is validated. The editor seeds four empty answer slots (A–D) by default, so a
// question saved/submitted with only two or three answers filled would otherwise
// fail `errors:quizz.answerEmpty` on the untouched trailing slots. Trimming the
// blanks here lets a user fill ≥2 and leave the rest empty — the classic Kahoot
// behavior.
//
// Only touches questions that carry an `answers` array (choice / poll /
// multiple-select). Slider and type-answer have `answers` undefined and pass
// through untouched; boolean answers ("Wahr"/"Falsch") contain no blanks.
//
// If fewer than two answers survive, the ORIGINAL question is returned unchanged
// so the validator still surfaces the friendly `tooFewAnswers` message instead of
// this helper silently fabricating answers. A solution pointing at a removed
// (blank) slot is dropped, not remapped to a wrong answer — if that empties the
// solution set the validator surfaces `noSolution`, which is correct.
export const dropEmptyAnswers = <
  T extends { answers?: string[]; solutions?: number[] },
>(
  question: T,
): T => {
  const { answers } = question

  if (!answers) {
    return question
  }

  const indexMap = new Map<number, number>()
  const kept: string[] = []

  answers.forEach((answer, index) => {
    if (answer.trim() !== "") {
      indexMap.set(index, kept.length)
      kept.push(answer)
    }
  })

  // Nothing to trim (no blanks), or too few real answers — leave it to the
  // validator to report honestly.
  if (kept.length === answers.length || kept.length < 2) {
    return question
  }

  const solutions = (question.solutions ?? [])
    .map((solution) => indexMap.get(solution))
    .filter((value): value is number => value !== undefined)

  return { ...question, answers: kept, solutions }
}
