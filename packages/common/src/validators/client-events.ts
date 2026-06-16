import { z } from "zod"

// Client telemetry events posted to POST /api/v1/client-events. A zod
// discriminated union keyed on `type`. zod v4 STRIPS unknown keys on parse (so a
// smuggled `correct`/`solutions` field is dropped, never persisted/logged) and
// REJECTS an unknown discriminant value — both asserted by the test plan.
//
// Strings are bounded with `.max(...)`; the HTTP handler additionally truncates
// before logging. Only safe, low-cardinality numeric/string outcomes are kept.

// Max length for any free-text field (message, name, url). The handler also
// hard-truncates, but bounding here keeps a single oversized field from
// inflating the parsed object.
const SHORT = 200
const TEXT = 2000

const clientErrorEvent = z.object({
  type: z.literal("client-error"),
  clientId: z.string().min(1).max(SHORT),
  message: z.string().max(TEXT),
  // Optional structured context — page/route + an error name. Never a stack
  // with secrets; bounded length.
  context: z.string().max(TEXT).optional(),
  ts: z.number().int().optional(),
})

const joinFailureEvent = z.object({
  type: z.literal("join-failure"),
  clientId: z.string().min(1).max(SHORT),
  // The join pin/room the client failed to join + a reason code.
  pin: z.string().max(SHORT).optional(),
  reason: z.string().max(SHORT),
  ts: z.number().int().optional(),
})

const socketReconnectEvent = z.object({
  type: z.literal("socket-reconnect"),
  clientId: z.string().min(1).max(SHORT),
  // Number of reconnect attempts before success.
  attempts: z.number().int().min(0).max(100000),
  ts: z.number().int().optional(),
})

const answerLatencyEvent = z.object({
  type: z.literal("answer-latency"),
  clientId: z.string().min(1).max(SHORT),
  // Client-measured submit→ack latency (ms).
  latencyMs: z.number().min(0).max(600000),
  ts: z.number().int().optional(),
})

export const clientEventValidator = z.discriminatedUnion("type", [
  clientErrorEvent,
  joinFailureEvent,
  socketReconnectEvent,
  answerLatencyEvent,
])

export type ClientEvent = z.infer<typeof clientEventValidator>
export type ClientEventType = ClientEvent["type"]

// Events we ALWAYS keep (never sampled away): operator needs every error and
// every join failure. The other two types are sampled at 0.1.
export const ALWAYS_KEEP_TYPES: ReadonlySet<ClientEventType> = new Set([
  "client-error",
  "join-failure",
])
