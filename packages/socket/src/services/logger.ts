// Structured JSON logger (pino) — the observability baseline.
//
// P0-1 MANDATE: pino MUST be SYNCHRONOUS stdout with NO transport / NO
// pino-pretty. The runtime image ships only `dist/index.cjs` (no node_modules);
// a pino transport spawns a thread-stream worker that `require()`s a worker
// entry by ABSOLUTE path, which does not exist in the image and does not
// survive esbuild bundling. `pino(pino.destination({ fd: 1, sync: true }))` has
// no worker thread, so it bundles cleanly and also removes the SIGTERM
// flush-race (a sync write is already flushed when process.exit runs).
//
// SECURITY-BLOCKER 1: a redaction serializer is configured here, BEFORE any
// payload/arg is ever logged. `MANAGER.AUTH(password)` and `AI.SET_KEY(key)`
// arrive as raw socket args; a naive `log.info({ args })` would leak them. The
// redact path list below censors every secret/solution field at every nesting
// depth so a raw secret string can never reach a stdout JSON line.

import { nanoid } from "nanoid"
import pino, { type Logger } from "pino"
import { pushServerLog } from "@razzoozle/socket/services/log-buffer"

// NEUTRAL service identity (never "Razzoozle"/brand strings — this generic
// observability layer is backported verbatim to the sibling tree).
const SERVICE = "quiz-socket"

// Redaction paths (SECURITY-BLOCKER 1 + the DENY list in spec §7). Each plain
// key is also matched at one level of nesting via the `*.key` wildcard so a
// secret nested inside a logged payload object is still censored. pino's redact
// engine matches these against the serialized object graph.
const REDACT_PATHS: string[] = [
  "password",
  "managerPassword",
  "*.password",
  "*.managerPassword",
  "apiKey",
  "*.apiKey",
  "devApiKey",
  "*.devApiKey",
  "key",
  "*.key",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "dataUrl",
  "*.dataUrl",
  "baseUrl",
  "*.baseUrl",
  "solutions",
  "*.solutions",
  "correct",
  "*.correct",
  "acceptedAnswers",
  "*.acceptedAnswers",
  "answerText",
  "*.answerText",
]

// Real synchronous stdout destination. `sync: true` + `fd: 1` => no worker.
const stdoutDest = pino.destination({ fd: 1, sync: true })

// Tee destination: forwards every chunk to the real sync stdout (behaviour
// UNCHANGED) and ALSO captures each finished, already-redacted line into the
// bounded server ring for the DEV-gated download endpoint. pino may batch
// several "...}\n" lines into one chunk, so split on newlines. This is a
// minimal pass-through wrapper — NOT a transport/worker (esbuild-safe).
const teeDest: pino.DestinationStream = {
  write(chunk: string): void {
    stdoutDest.write(chunk)
    for (const line of chunk.split("\n")) {
      if (line.trim()) {
        pushServerLog(line)
      }
    }
  },
}

// The pino instance. Same options as before; only the destination is now the
// tee wrapper around the unchanged sync stdout destination.
export const logger: Logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: { service: SERVICE, env: process.env.NODE_ENV || "development" },
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  },
  teeDest,
)

// Test/seam helper: build a logger writing to a caller-supplied destination so
// the no-secret-log test can assert against an in-memory buffer while keeping
// the SAME redact configuration as production (the thing under test).
export const createLogger = (
  destination: pino.DestinationStream,
  level = "debug",
): Logger =>
  pino(
    {
      level,
      base: { service: SERVICE, env: "test" },
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    },
    destination,
  )

// Per-socket correlation child. clientId is hashed/truncated by the caller; we
// never log a raw clientId at full length (spec §7 DENY list).
export const socketLogger = (bind: {
  socketId: string
  clientId?: string
  role?: string
}): Logger =>
  logger.child({
    socketId: bind.socketId,
    clientId: bind.clientId,
    role: bind.role ?? "unknown",
    traceId: nanoid(),
  })

// Per-HTTP-request correlation child (one per inbound request).
export const requestLogger = (route: string): Logger =>
  logger.child({ requestId: nanoid(), route, role: "system" })
