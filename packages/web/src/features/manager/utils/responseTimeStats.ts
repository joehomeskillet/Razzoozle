import type { GameResult, QuestionResult } from "@razzoozle/common/types/game"

export type ResponseTimeSummary = {
  avgMs: number | null
  medianMs: number | null
  minMs: number | null
  maxMs: number | null
  count: number
}

/** Aggregate responseMs for one question (or all questions if none). */
export function summarizeResponseTimes(
  questions: QuestionResult[],
  questionIndex?: number,
): ResponseTimeSummary {
  const list =
    questionIndex == null ? questions : [questions[questionIndex]].filter(Boolean)
  const values: number[] = []
  for (const q of list) {
    for (const pa of q?.playerAnswers ?? []) {
      if (typeof pa.responseMs === "number" && pa.responseMs >= 0) {
        values.push(pa.responseMs)
      }
    }
  }
  if (values.length === 0) {
    return { avgMs: null, medianMs: null, minMs: null, maxMs: null, count: 0 }
  }
  values.sort((a, b) => a - b)
  const sum = values.reduce((a, b) => a + b, 0)
  const mid = Math.floor(values.length / 2)
  const median =
    values.length % 2 === 0
      ? Math.round((values[mid - 1]! + values[mid]!) / 2)
      : values[mid]!
  return {
    avgMs: Math.round(sum / values.length),
    medianMs: median,
    minMs: values[0]!,
    maxMs: values[values.length - 1]!,
    count: values.length,
  }
}

export function perQuestionResponseAverages(
  result: GameResult,
): Array<{ questionIndex: number; summary: ResponseTimeSummary }> {
  return result.questions.map((q, i) => ({
    questionIndex: i,
    summary: summarizeResponseTimes([q]),
  }))
}
