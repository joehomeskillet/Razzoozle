import type { IncomingMessage, ServerResponse } from "http"
import {
  ALWAYS_KEEP_TYPES,
  clientEventValidator,
} from "@razzoozle/common/validators/client-events"
import type pino from "pino"
import { createLogger, requestLogger } from "@razzoozle/socket/services/logger"
import {
  clientEventsTotal,
  httpRequestsTotal,
} from "@razzoozle/socket/services/prom"
import {
  pushClientLog,
} from "@razzoozle/socket/services/log-buffer"
import { jsonError } from "./respond"
import { readBody, statusFrom413 } from "./body"

// ── client-events token bucket (per clientId, NEVER per-IP) ─────────────────
// Venues share a NAT IP, so a per-IP limiter would throttle a whole room. The
// bucket Map is CAPPED + LRU-evicted (≤10k) so an unauthenticated public
// endpoint can never OOM the single process (G11).
const RATE_WINDOW_MS = 60_000
export const RATE_MAX = 20 // ~20 events / minute / clientId
export const BUCKET_MAX = 10_000 // LRU cap (mirrors metrics.ts MAX_SAMPLES intent)
export const SAMPLE_RATE = 0.1 // keep 10% of non-error/non-join-failure events

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Returns true if the event is WITHIN the rate limit (allowed). Evicts the
// oldest entry (insertion order — Map preserves it) once the cap is reached.
export const withinRate = (clientId: string, now: number): boolean => {
  let b = buckets.get(clientId)

  if (!b || now >= b.resetAt) {
    if (buckets.size >= BUCKET_MAX && !buckets.has(clientId)) {
      const oldest = buckets.keys().next().value
      if (oldest !== undefined) {
        buckets.delete(oldest)
      }
    }
    b = { count: 0, resetAt: now + RATE_WINDOW_MS }
    // Re-insert at the tail so LRU eviction drops genuinely-stale clients.
    buckets.delete(clientId)
    buckets.set(clientId, b)
  }

  if (b.count >= RATE_MAX) {
    return false
  }

  b.count += 1
  return true
}

// Deterministic 0..1 hash of a clientId+type so sampling is stable per client
// (a given client's answer-latency events are consistently kept or dropped
// within a window) and testable without Math.random.
export const sampleHash = (key: string): number => {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Map to [0,1)
  return (h >>> 0) / 4294967296
}

// Test seam: reset bucket state between cases.
export const __resetClientEventBuckets = (): void => buckets.clear()
export const __bucketSize = (): number => buckets.size

// Dedicated client-event logger whose destination is the CLIENT ring. It reuses
// createLogger (SAME redact config as production), so the line written into the
// client ring is redacted by the same serializer — no second un-redacted sink.
const clientRingSink: pino.DestinationStream = {
  write(chunk: string): void {
    for (const line of chunk.split("\n")) {
      if (line.trim()) {
        pushClientLog(line)
      }
    }
  },
}
const clientEventLogger = createLogger(clientRingSink, "info")

// Client-events handler
export const handleClientEvents = (
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  const log = requestLogger("/api/v1/client-events")

  void (async () => {
    try {
      const body = await readBody(req)
      const parsed = clientEventValidator.safeParse(body)

      if (!parsed.success) {
        jsonError(res, 400, parsed.error.issues[0]!.message)
        httpRequestsTotal.inc({ route: "/api/v1/client-events", status: "400" })
        return
      }

      const event = parsed.data
      const now = Date.now()

      // Per-clientId rate limit (NEVER per-IP). Over-limit → silent 204.
      if (!withinRate(event.clientId, now)) {
        res.writeHead(204)
        res.end()
        httpRequestsTotal.inc({ route: "/api/v1/client-events", status: "204" })
        return
      }

      // Sampling: always keep errors + join-failures; sample the rest at 0.1
      // (deterministic so tests are stable). Dropped → silent 204.
      const keep =
        ALWAYS_KEEP_TYPES.has(event.type) ||
        sampleHash(`${event.clientId}:${event.type}`) < SAMPLE_RATE

      clientEventsTotal.inc({ type: event.type })

      if (keep) {
        // Logged through the redacting child logger. zod already stripped any
        // smuggled secret/solution field; the logger redacts the rest. The
        // dedicated clientEventLogger writes the SAME redacted line into the
        // CLIENT ring for the DEV-gated download endpoint.
        log.info({ clientEvent: event }, "client-event")
        clientEventLogger.info({ clientEvent: event }, "client-event")
      }

      res.writeHead(204)
      res.end()
      httpRequestsTotal.inc({ route: "/api/v1/client-events", status: "204" })
    } catch (err) {
      const status = statusFrom413(err, 400)
      jsonError(res, status, err instanceof Error ? err.message : "Error")
      httpRequestsTotal.inc({
        route: "/api/v1/client-events",
        status: String(status),
      })
    }
  })()
}
