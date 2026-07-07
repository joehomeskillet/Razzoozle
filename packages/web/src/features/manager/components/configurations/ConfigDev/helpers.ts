// Format a millisecond percentile value: "—" when null (no samples yet),
// otherwise a rounded integer with a "ms" suffix. Mirrors LowLatencyHealth so
// answerAck.p50/p95 read as "12ms" but a pre-answer null reads as "—" rather
// than a fabricated raw number.
export const fmtMs = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)}ms`
    : "—"

// Open a same-origin dev endpoint in a new tab without giving it window.opener.
export const openEndpoint = (url: string) => () => {
  window.open(url, "_blank", "noopener")
}
