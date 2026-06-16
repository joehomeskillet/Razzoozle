// Prometheus metrics (prom-client) — pure JS, bundles cleanly under esbuild.
//
// HARD RULE (spec §6.2/§7): BOUNDED labels only — NEVER a high-cardinality id
// (no gameId/playerId/socketId/clientId label). The full allowed label set is
// {event, role, type, reason, status, env}; an id always goes into a log FIELD,
// never a metric label. The /metrics text-exposition is DEV-gated AND
// localhost-only (nginx `allow 127.0.0.1; deny all`).
//
// HOT-PATH: per-event `.inc()` is fine on the answer firehose; per-answer
// `.observe()` (histograms) is bridged ONLY inside the existing `ll.enabled`
// gate (see metrics.ts callers), never unconditionally.

import client from "prom-client"

export const registry = new client.Registry()

// Default process/runtime metrics (event-loop lag, heap, gc, …). Pure JS.
client.collectDefaultMetrics({ register: registry })

// ── Counters (hot-path safe) ───────────────────────────────────────────────
export const socketEventsTotal = new client.Counter({
  name: "socket_events_total",
  help: "Socket.io events processed, by event name and role.",
  labelNames: ["event", "role"] as const,
  registers: [registry],
})

export const clientEventsTotal = new client.Counter({
  name: "client_events_total",
  help: "Client telemetry events ingested via /api/v1/client-events, by type.",
  labelNames: ["type"] as const,
  registers: [registry],
})

export const answersRejectedTotal = new client.Counter({
  name: "answers_rejected_total",
  help: "Answers rejected by the round manager, by reason.",
  labelNames: ["reason"] as const,
  registers: [registry],
})

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "HTTP requests served by the raw node http handler, by route and status.",
  labelNames: ["route", "status"] as const,
  registers: [registry],
})

// ── Histograms (LL-gated observe()) ────────────────────────────────────────
export const answerAckLatencyMs = new client.Histogram({
  name: "answer_ack_latency_ms",
  help: "Server-measured answer-ack latency (ms). Observed only in low-latency mode.",
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [registry],
})

export const clockRttMs = new client.Histogram({
  name: "clock_rtt_ms",
  help: "Client-reported clock round-trip time (ms). Observed only in low-latency mode.",
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [registry],
})

// ── Gauges ─────────────────────────────────────────────────────────────────
export const activeGames = new client.Gauge({
  name: "active_games",
  help: "Number of currently-active games.",
  registers: [registry],
})

export const connectedSockets = new client.Gauge({
  name: "connected_sockets",
  help: "Number of connected sockets, by role.",
  labelNames: ["role"] as const,
  registers: [registry],
})

// Render the current registry as prom text-exposition. Awaitable so the
// /metrics handler and the smoke test share one code path.
export const renderMetrics = async (): Promise<string> => registry.metrics()
