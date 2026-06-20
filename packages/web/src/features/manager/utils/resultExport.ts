import type { GameResult } from "@razzoozle/common/types/game"
import { isAnswerCorrect } from "@razzoozle/web/features/manager/utils/answerCorrectness"

// Quote a single CSV field per RFC 4180: wrap in double quotes and double any
// embedded quote, so commas/quotes/newlines in a username can't break the grid.
// Also neutralise CSV/formula injection: a value beginning with =,+,-,@,tab or
// CR is treated as a formula by Excel/Sheets, so prefix it with a single quote.
const csvField = (value: string | number) => {
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`
  }
  return `"${s.replace(/"/g, '""')}"`
}

// Build a deterministic, spreadsheet-friendly filename from the game subject +
// date. Strips anything that isn't a safe path char so the download never
// produces a slash/colon that confuses the OS.
const csvFilename = (subject: string, date: string) => {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
  // An invalid/missing date would make `toISOString()` throw a RangeError, so
  // guard it and just drop the datestamp from the filename in that case.
  const parsed = new Date(date)
  const day = Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toISOString().slice(0, 10)
  const base = [slug(subject), day].filter(Boolean).join("-") || "ergebnis"

  return `${base}.csv`
}

export interface ResultCsvLabels {
  rank: string
  player: string
  points: string
}

// Build the CSV text for a finished game's ranking: a header row + one row per
// player (rank, player, points), sorted by rank. `displayName` maps the real
// username to the label that should appear in the file — pass the result-modal's
// `displayName` so the export honours the anonymise toggle (masked → "Spieler N",
// revealed → real name). The leading BOM lets Excel open UTF-8 names (umlauts /
// accents) correctly; lines use CRLF per RFC 4180.
export const buildResultCsv = (
  result: GameResult,
  labels: ResultCsvLabels,
  displayName: (_name: string) => string,
) => {
  const header = [labels.rank, labels.player, labels.points]
  const rows = [...result.players]
    .sort((a, b) => a.rank - b.rank)
    .map((p) => [p.rank, displayName(p.username), p.points])

  const lines = [header, ...rows].map((cols) => cols.map(csvField).join(","))

  return `﻿${lines.join("\r\n")}\r\n`
}

// Trigger a client-side download of `csv` as a UTF-8 CSV file via a transient
// object-URL anchor. No backend round-trip; the blob is built from the already
// loaded GameResult.
export const downloadResultCsv = (csv: string, subject: string, date: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = csvFilename(subject, date)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Trigger a client-side download of `json` as a UTF-8 JSON file via a transient
// object-URL anchor. No backend round-trip; the blob is built from the already
// loaded GameResult.
export const downloadResultJson = (json: string, subject: string, date: string) => {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = csvFilename(subject, date).replace(".csv", ".json")
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Export the full GameResult as JSON for complete data ownership.
export const exportResultJson = (
  result: GameResult,
  subject: string = result.subject,
  date: string = result.date,
) => {
  const json = JSON.stringify(result, null, 2)
  downloadResultJson(json, subject, date)
}

export interface QuestionsCsvLabels {
  questionNo: string
  question: string
  player: string
  answer: string
  correct: string
  responseMs: string
  yes: string
  no: string
}

// Build the CSV text for per-question per-player answers: one header row + one
// row per (question × playerAnswer). Columns: question number, question text,
// player (display name), answer (plain text), correct (yes/no or empty for polls),
// response time (ms). `displayName` honors the anonymise toggle. Uses csvField
// for RFC 4180 safety + BOM for UTF-8 Excel compatibility.
export const buildQuestionsCsv = (
  result: GameResult,
  labels: QuestionsCsvLabels,
  displayName: (_name: string) => string,
): string => {
  const header = [
    labels.questionNo,
    labels.question,
    labels.player,
    labels.answer,
    labels.correct,
    labels.responseMs,
  ]

  const rows: (string | number)[][] = []

  for (let qi = 0; qi < result.questions.length; qi++) {
    const question = result.questions[qi]

    for (const pa of question.playerAnswers) {
      // Format answer as plain text, mirroring ResultModalTable logic:
      // - type-answer → pa.answerText
      // - multiple-select → join selected option labels with "; "
      // - slider → number + unit
      // - choice/boolean → option label (or id if no label)
      // - no-answer → ""
      let answerText = ""

      if (pa.answerText != null) {
        answerText = pa.answerText
      } else if (pa.answerIds != null && pa.answerIds.length > 0) {
        answerText = pa.answerIds
          .map((id) => question.answers?.[id] ?? id)
          .join("; ")
      } else if (pa.answerId !== null && question.type === "slider") {
        answerText =
          String(pa.answerId) + (question.unit ? ` ${question.unit}` : "")
      } else if (pa.answerId !== null) {
        answerText = String(question.answers?.[pa.answerId] ?? pa.answerId)
      }

      // Correctness: polls show empty, others show yes/no via the single source of truth
      const correct =
        question.type === "poll"
          ? ""
          : isAnswerCorrect(question, pa)
            ? labels.yes
            : labels.no

      rows.push([
        qi + 1,
        question.question,
        displayName(pa.playerName),
        answerText,
        correct,
        pa.responseMs ?? "",
      ])
    }
  }

  const lines = [header, ...rows].map((cols) => cols.map(csvField).join(","))

  return `﻿${lines.join("\r\n")}\r\n`
}

// Convenience wrapper: build + download per-question CSV in one call from a GameResult.
export const exportQuestionsCsv = (
  result: GameResult,
  labels: QuestionsCsvLabels,
  displayName: (_name: string) => string,
) => {
  const csv = buildQuestionsCsv(result, labels, displayName)
  const filename = csvFilename(result.subject, result.date).replace(
    ".csv",
    "-fragen.csv",
  )
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Convenience wrapper: build + download in one call from a GameResult.
export const exportResultCsv = (
  result: GameResult,
  labels: ResultCsvLabels,
  displayName: (_name: string) => string,
) => {
  const csv = buildResultCsv(result, labels, displayName)
  downloadResultCsv(csv, result.subject, result.date)
}
