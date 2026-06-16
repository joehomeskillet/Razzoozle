import type { GameResult } from "@razzoozle/common/types/game"

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

// Convenience wrapper: build + download in one call from a GameResult.
export const exportResultCsv = (
  result: GameResult,
  labels: ResultCsvLabels,
  displayName: (_name: string) => string,
) => {
  const csv = buildResultCsv(result, labels, displayName)
  downloadResultCsv(csv, result.subject, result.date)
}
