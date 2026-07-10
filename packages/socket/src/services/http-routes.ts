// HTTP route table + dispatcher for the raw node `http` server. The SAME table
// feeds the OpenAPI generator (single source of truth) and the request
// dispatcher, so a route can never be served without being documented (or vice
// versa) — the route-parity test asserts the path-set equality.
//
// Matching stays regex-based (the proven legacy approach). Helpers (jsonOk /
// jsonError / readBody, 64 KB cap, 413 precheck) are reused verbatim. The 5
// legacy routes keep their exact behavior. New /api/v1/* routes are DEV-gated
// fail-closed (absent → handled as 404 when RAZZOOLE_DEV is unset).

import type { IncomingMessage, ServerResponse } from "http"
import { z } from "zod"
import {
  buildOpenApiDoc,
  soloResponseSchema,
  type RouteDoc,
} from "@razzoozle/common/openapi/doc"
import { buildEventCatalog } from "@razzoozle/common/openapi/events-catalog"
import {
  clientEventValidator,
} from "@razzoozle/common/validators/client-events"
import { httpRequestsTotal, renderMetrics } from "@razzoozle/socket/services/prom"
import {
  clientLogLines,
  serverLogLines,
} from "@razzoozle/socket/services/log-buffer"

// ── Imports for route table ────────────────────────────────────────────────

import { getMergedAchievements } from "@razzoozle/socket/services/config"
import { handleClientEvents } from "./http/client-events"
import { handleSoloGet, handleCheckAnswer, handleSoloScore } from "./http/solo"
import { handleSkeletonExport, handleSkeletonImport, handlePluginImport, handlePluginExport, handlePluginAsset } from "./http/skeleton-plugin-io"
import { handleResultOg } from "./http/result-og"
import { handleCreateAssignment, handleGetAssignment, handleGetAssignmentResults } from "./http/assignments"
import { jsonOk, jsonError } from "./http/respond"
import { textAttachment } from "./http/respond"
import { authorizeDevRequest } from "./http/broadcasters/manager-auth"

// ── Route table definition ─────────────────────────────────────────────────

interface Route extends RouteDoc {
  match: RegExp
  dev?: boolean
  // dev routes that expose operational data (the log downloads) MUST fail
  // closed even within dev mode: when no DEV_API_KEY is configured they are
  // denied (401) rather than served, so an unauthenticated client can never
  // pull operational logs off a live dev instance.
  requireKey?: boolean
  handle: (
    req: IncomingMessage,
    res: ServerResponse,
    id: string | undefined,
    rest: string | undefined,
  ) => void
}

const clientEventSchemaJson = () =>
  z.toJSONSchema(clientEventValidator, {
    target: "draft-2020-12",
    unrepresentable: "any",
  })

export const routes: Route[] = [
  // ── 5 legacy routes (verbatim behavior) ───────────────────────────────────
  {
    method: "GET",
    path: "/api/achievements",
    summary: "Public merged achievements config for the player client.",
    match: /^\/api\/achievements$/,
    handle: (_req, res) =>
      jsonOk(res, { achievements: getMergedAchievements() }),
  },
  {
    method: "GET",
    path: "/api/quizz/:id/solo",
    summary: "Quiz questions for solo play, with solutions stripped.",
    description:
      "Returns subject + questions with solutions/correct/acceptedAnswers " +
      "removed so a solo client cannot trivially cheat.",
    responseSchema: soloResponseSchema,
    match: /^\/api\/quizz\/([^/]+)\/solo$/,
    handle: (_req, res, id) => handleSoloGet(res, id),
  },
  {
    method: "POST",
    path: "/api/quizz/:id/check-answer",
    summary: "Stateless server-side answer check for solo play.",
    requestSchema: soloCheckAnswerRequestValidator,
    match: /^\/api\/quizz\/([^/]+)\/check-answer$/,
    handle: (req, res, id) => handleCheckAnswer(req, res, id),
  },
  {
    method: "POST",
    path: "/api/quizz/:id/solo-score",
    summary: "Persist a solo-play score and return the leaderboard.",
    requestSchema: soloScoreSubmitValidator,
    match: /^\/api\/quizz\/([^/]+)\/solo-score$/,
    handle: (req, res, id) => handleSoloScore(req, res, id),
  },
  // ── new routes ────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/v1/health",
    summary: "Additive JSON health (the text/plain /healthz probe is frozen).",
    match: /^\/api\/v1\/health$/,
    handle: (_req, res) =>
      jsonOk(res, { status: "ok", ts: new Date().toISOString() }),
  },
  {
    method: "GET",
    path: "/api/skeleton/export",
    summary: "Export the active theme + assets as a skeleton ZIP (manager-gated).",
    match: /^\/api\/skeleton\/export$/,
    handle: (req, res) => handleSkeletonExport(req, res),
  },
  {
    method: "POST",
    path: "/api/skeleton/import",
    summary:
      "Import a skeleton ZIP and apply it as the active theme (manager-gated).",
    match: /^\/api\/skeleton\/import$/,
    handle: (req, res) => handleSkeletonImport(req, res),
  },
  {
    method: "POST",
    path: "/api/plugins/import",
    summary: "Install a plugin from a ZIP (manager-gated, stores+extracts only).",
    match: /^\/api\/plugins\/import$/,
    handle: (req, res) => handlePluginImport(req, res),
  },
  {
    method: "GET",
    path: "/api/plugins/:id/export",
    summary: "Export an installed plugin's files as a ZIP (manager-gated).",
    match: /^\/api\/plugins\/([^/]+)\/export$/,
    handle: (req, res, id) => handlePluginExport(req, res, id),
  },
  {
    method: "GET",
    path: "/plugins/:id/:path",
    summary: "Serve an installed plugin's static files (ui.js, assets) — public.",
    // hidden: a wildcard static surface, not part of the JSON API contract.
    hidden: true,
    match: /^\/plugins\/([^/]+)\/(.+)$/,
    handle: (req, res, id, rest) => handlePluginAsset(req, res, id, rest),
  },
  {
    method: "GET",
    path: "/r/:id",
    summary:
      "Per-result Open Graph unfurl: serves the SPA shell with " +
      "result-specific og:* meta for crawlers.",
    match: /^\/r\/([^/]+)$/,
    handle: (req, res, id) => handleResultOg(req, res, id),
  },
  {
    method: "POST",
    path: "/api/v1/client-events",
    summary: "Ingest client telemetry (errors, join failures, reconnects).",
    description:
      "Sampled (0.1, errors/join-failures always kept), redacted, " +
      "rate-limited per clientId (never per-IP). Over-limit → silent 204.",
    requestSchema: clientEventValidator,
    match: /^\/api\/v1\/client-events$/,
    handle: (req, res) => handleClientEvents(req, res),
  },
  {
    method: "GET",
    path: "/api/v1/observability/events",
    summary: "Static socket.io event catalog (role + direction).",
    dev: true,
    match: /^\/api\/v1\/observability\/events$/,
    handle: (_req, res) => jsonOk(res, { events: buildEventCatalog() }),
  },
  {
    method: "GET",
    path: "/api/v1/observability/schema",
    summary: "JSON Schema for the client-events payload.",
    dev: true,
    match: /^\/api\/v1\/observability\/schema$/,
    handle: (_req, res) => jsonOk(res, clientEventSchemaJson()),
  },
  {
    method: "GET",
    path: "/api/v1/observability/logs/server",
    summary: "Download recent redacted SERVER log lines (NDJSON).",
    dev: true,
    requireKey: true,
    match: /^\/api\/v1\/observability\/logs\/server$/,
    handle: (_req, res) =>
      textAttachment(res, "server-logs.ndjson", serverLogLines().join("\n")),
  },
  {
    method: "GET",
    path: "/api/v1/observability/logs/client",
    summary: "Download recent redacted CLIENT-EVENT log lines (NDJSON).",
    dev: true,
    requireKey: true,
    match: /^\/api\/v1\/observability\/logs\/client$/,
    handle: (_req, res) =>
      textAttachment(res, "client-logs.ndjson", clientLogLines().join("\n")),
  },
  {
    method: "GET",
    path: "/api/openapi.json",
    summary: "OpenAPI 3.1 document for this HTTP edge.",
    dev: true,
    match: /^\/api\/openapi\.json$/,
    handle: (_req, res) => jsonOk(res, openApiDoc),
  },
  {
    method: "GET",
    path: "/metrics",
    summary: "Prometheus metrics (localhost-only via nginx, DEV-gated).",
    // hidden: kept out of the public OpenAPI contract (it is prom text, not JSON).
    hidden: true,
    dev: true,
    match: /^\/metrics$/,
    handle: (_req, res) => {
      void (async () => {
        try {
          const body = await renderMetrics()
          res.writeHead(200, {
            "content-type": "text/plain; version=0.0.4; charset=utf-8",
          })
          res.end(body)
        } catch {
          jsonError(res, 500, "metrics error")
        }
      })()
    },
  },
  {
    method: "POST",
    path: "/api/assignment",
    summary: "Create a new assignment (manager-gated).",
    match: /^\/api\/assignment$/,
    handle: (req, res) => handleCreateAssignment(req, res),
  },
  {
    method: "GET",
    path: "/api/assignment/:id",
    summary: "Get assignment metadata (public read).",
    match: /^\/api\/assignment\/([^/]+)$/,
    handle: (_req, res, id) => handleGetAssignment(_req, res, id),
  },
  {
    method: "GET",
    path: "/api/assignment/:id/results",
    summary: "Get solo results filtered by assignmentId (manager-gated).",
    match: /^\/api\/assignment\/([^/]+)\/results$/,
    handle: (req, res, id) => handleGetAssignmentResults(req, res, id),
  },
]

// Build the OpenAPI doc once from the SAME table (excludes hidden routes).
export const openApiDoc = buildOpenApiDoc(routes)

// Dispatch a request against the table. Returns true if a route handled it
// (including DEV-gated 404). Returns false if no route matched at all (caller
// emits the generic 404), so /healthz and the socket.io upgrade are untouched.
export const dispatchHttp = (
  req: IncomingMessage,
  res: ServerResponse,
): boolean => {
  const url = (req.url ?? "").split("?")[0] ?? ""
  const method = req.method ?? "GET"
  // Full URL (with query) for the dev-route token check; matching still uses
  // the path-only `url` above (unchanged).
  const parsedUrl = new URL(req.url ?? "/", "http://localhost")

  for (const route of routes) {
    if (route.method !== method) {
      continue
    }
    const m = route.match.exec(url)
    if (!m) {
      continue
    }

    // DEV-gated routes: fail-closed 404 when dev off, 401 when a DEV_API_KEY
    // is configured and the presented token is absent/wrong, else serve.
    // `requireKey` routes (log downloads) additionally 401 when NO key is set.
    if (route.dev) {
      const decision = authorizeDevRequest(req, parsedUrl, route.requireKey ?? false)

      if (decision === "notfound") {
        return false
      }

      if (decision === "unauthorized") {
        httpRequestsTotal.inc({ route: route.path, status: "401" })
        jsonError(res, 401, "unauthorized")
        return true
      }
    }

    httpRequestsTotal.inc({ route: route.path, status: "200" })
    route.handle(req, res, m[1], m[2])
    return true
  }

  return false
}
