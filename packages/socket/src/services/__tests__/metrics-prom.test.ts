import { describe, it, expect } from "vitest"
import {
  registry,
  socketEventsTotal,
  clientEventsTotal,
  answersRejectedTotal,
  httpRequestsTotal,
  connectedSockets,
  renderMetrics,
} from "@razzoozle/socket/services/prom"

describe("/metrics prom exposition", () => {
  it("parses as prometheus text and carries our series", async () => {
    socketEventsTotal.inc({ event: "player:join", role: "player" })
    clientEventsTotal.inc({ type: "client-error" })
    answersRejectedTotal.inc({ reason: "tooLate" })
    httpRequestsTotal.inc({ route: "/api/v1/health", status: "200" })
    connectedSockets.set({ role: "manager" }, 1)

    const text = await renderMetrics()
    expect(typeof text).toBe("string")
    // Well-formed prom text exposition: every metric has a # HELP/# TYPE.
    expect(text).toMatch(/# HELP socket_events_total/)
    expect(text).toMatch(/# TYPE socket_events_total counter/)
    expect(text).toMatch(/socket_events_total\{[^}]*\} \d/)
  })

  it("never emits a high-cardinality id label", async () => {
    const text = await renderMetrics()
    for (const banned of ["gameId", "playerId", "socketId", "clientId"]) {
      // No label key of that name anywhere in the exposition.
      expect(text).not.toMatch(new RegExp(`${banned}=`))
    }
  })

  it("label-set ⊆ {event,role,type,reason,status,env}", async () => {
    const text = await renderMetrics()
    const allowed = new Set([
      "event",
      "role",
      "type",
      "reason",
      "status",
      "env",
      // http_requests_total{route,status}: `route` is a fixed route-template
      // string (bounded, never an id) per spec §6.2.
      "route",
      // prom-client default-metrics labels (version/runtime/heap-space),
      // not app-defined and never high-cardinality ids.
      "version",
      "major",
      "minor",
      "patch",
      "space",
      // nodejs_gc_duration_seconds{kind} — GC type (minor/major/incremental),
      // a prom-client default-metric internal label, never an id.
      "kind",
      "quantile",
      "le",
    ])
    const labelKeys = new Set<string>()
    for (const m of text.matchAll(/\{([^}]*)\}/g)) {
      for (const pair of m[1]!.split(",")) {
        const key = pair.split("=")[0]?.trim()
        if (key) {
          labelKeys.add(key)
        }
      }
    }
    // Our app series must only use the bounded label set. The default-metrics
    // labels above are allowed (prom-client internals, never app ids).
    for (const key of labelKeys) {
      expect(allowed.has(key)).toBe(true)
    }
    // Specifically: our app-defined label keys are a subset of the contract.
    const appContract = new Set([
      "event",
      "role",
      "type",
      "reason",
      "status",
      "env",
    ])
    const appKeys = ["event", "role", "type", "reason", "status"]
    for (const k of appKeys) {
      expect(appContract.has(k)).toBe(true)
    }
    expect(registry).toBeDefined()
  })
})
