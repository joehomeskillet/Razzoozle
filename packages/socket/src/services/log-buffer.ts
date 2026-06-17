// In-memory ring buffers of already-serialized + already-redacted log LINES,
// used ONLY by the DEV-gated log-download endpoints. Two bounded rings (server
// + client-events). Each entry is one finished log line (a string) — the pino
// serializer (with its redact config) runs BEFORE the line reaches us, so what
// we store is already censored. This module is a dumb store: it does no
// redaction, no I/O, no timers, and is NOT part of any registry snapshot.
//
// Bounded like metrics.ts (drop-oldest) so a long-running process can never
// grow these unbounded: O(1) append, shift the oldest once over the cap.

const MAX_LINES = 2000

const serverRing: string[] = []
const clientRing: string[] = []

// Append one finished log line to a bounded ring (drop oldest). A pino line is
// emitted as "...}\n"; strip a single trailing newline so the NDJSON join in
// the download endpoint does not produce double blank lines. Empty/whitespace
// lines are ignored (never stored).
const push = (ring: string[], line: string): void => {
  if (line.trim() === "") {
    return
  }

  const normalized = line.endsWith("\n") ? line.slice(0, -1) : line

  ring.push(normalized)

  if (ring.length > MAX_LINES) {
    ring.shift()
  }
}

export const pushServerLog = (line: string): void => push(serverRing, line)

export const pushClientLog = (line: string): void => push(clientRing, line)

// Return COPIES so callers can join/iterate without mutating the live ring.
export const serverLogLines = (): string[] => [...serverRing]

export const clientLogLines = (): string[] => [...clientRing]

// Test seam: empty BOTH rings.
export const clear = (): void => {
  serverRing.length = 0
  clientRing.length = 0
}
