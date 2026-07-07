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
import fs from "fs"
import { timingSafeEqual } from "crypto"
import { z } from "zod"
import {
  buildOpenApiDoc,
  soloResponseSchema,
  type RouteDoc,
} from "@razzoozle/common/openapi/doc"
import { buildEventCatalog } from "@razzoozle/common/openapi/events-catalog"
import {
  soloCheckAnswerRequestValidator,
  soloScoreSubmitValidator,
} from "@razzoozle/common/validators/solo"
import {
  ALWAYS_KEEP_TYPES,
  clientEventValidator,
} from "@razzoozle/common/validators/client-events"
import type { SoloCheckAnswerResponse } from "@razzoozle/common/types/game"
import type { Assignment } from "@razzoozle/common/validators/assignment"
import { assignmentValidator } from "@razzoozle/common/validators/assignment"
import { mergeAchievementsConfig } from "@razzoozle/common/achievements"
import { shuffleChunksWithGuard } from "@razzoozle/common/utils/chunks"
import { evaluateAnswer } from "@razzoozle/socket/services/game/answer-eval"
import manager from "@razzoozle/socket/services/manager"
import {
  appendSoloResult,
  assertSafeId,
  buildPluginZip,
  buildSkeletonZip,
  devApiKey,
  getMergedAchievements,
  getResultById,
  getQuizzById,
  getAssignment,
  saveAssignment,
  getSoloResults,
  importPluginZip,
  importSkeletonZip,
  isDevMode,
  readPlugins,
  resolvePluginAsset,
} from "@razzoozle/socket/services/config"
import { nanoid } from "nanoid"
import { createLogger, requestLogger } from "@razzoozle/socket/services/logger"
import { checkGlobalSoloRate } from "@razzoozle/socket/services/submissionRateLimit"
import {
  clientLogLines,
  pushClientLog,
  serverLogLines,
} from "@razzoozle/socket/services/log-buffer"
import type pino from "pino"
import {
  clientEventsTotal,
  httpRequestsTotal,
  renderMetrics,
} from "@razzoozle/socket/services/prom"

// ── HTTP helpers (reused verbatim from the legacy router) ───────────────────
export const jsonOk = (res: ServerResponse, data: unknown): void => {
  const body = JSON.stringify(data)
  res.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

export const jsonError = (
  res: ServerResponse,
  status: number,
  message: string,
): void => {
  const body = JSON.stringify({ error: message })
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

// Plain-text attachment response (used by the log-download endpoints). The
// Content-Disposition makes the browser save the body instead of rendering it.
const textAttachment = (
  res: ServerResponse,
  filename: string,
  body: string,
): void => {
  const buf = Buffer.from(body, "utf-8")
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "content-disposition": `attachment; filename="${filename}"`,
    "content-length": buf.byteLength,
  })
  res.end(buf)
}

const BODY_LIMIT_BYTES = 64 * 1024 // 64 KB — enough for any valid payload
const SKELETON_IMPORT_MAX = 16 * 1024 * 1024

export const readBody = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const tooLarge = () =>
      reject(Object.assign(new Error("Payload Too Large"), { status: 413 }))

    // Content-Length pre-check: reject WITHOUT destroying the socket (no body
    // bytes consumed yet) so the handler's catch can still write a real 413
    // response. Pause the stream so the (unread) body never accumulates.
    const contentLength = Number(req.headers["content-length"] ?? 0)
    if (contentLength > BODY_LIMIT_BYTES) {
      req.pause()
      tooLarge()
      return
    }

    const chunks: Buffer[] = []
    let accumulated = 0
    let aborted = false

    req.on("data", (chunk: Buffer) => {
      if (aborted) {
        return
      }
      accumulated += chunk.byteLength
      if (accumulated > BODY_LIMIT_BYTES) {
        // Chunked overflow (no/under-stated Content-Length): stop reading and
        // reject — the handler writes a 413 response, then the connection
        // closes cleanly once the response is flushed.
        aborted = true
        req.pause()
        tooLarge()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (aborted) {
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")))
      } catch {
        reject(new Error("Invalid JSON"))
      }
    })
    req.on("error", reject)
  })

const readRawBody = (
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const tooLarge = () =>
      reject(Object.assign(new Error("Payload Too Large"), { status: 413 }))

    const contentLength = Number(req.headers["content-length"] ?? 0)
    if (contentLength > maxBytes) {
      req.pause()
      tooLarge()
      return
    }

    const chunks: Buffer[] = []
    let accumulated = 0
    let aborted = false

    req.on("data", (chunk: Buffer) => {
      if (aborted) {
        return
      }
      accumulated += chunk.byteLength
      if (accumulated > maxBytes) {
        aborted = true
        req.pause()
        tooLarge()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (aborted) {
        return
      }
      resolve(Buffer.concat(chunks))
    })
    req.on("error", reject)
  })

const statusFrom413 = (err: unknown, fallback: number): number =>
  err instanceof Error &&
  (err as NodeJS.ErrnoException & { status?: number }).status === 413
    ? 413
    : fallback

const authorizeManagerRequest = (req: IncomingMessage): boolean => {
  const headerToken = req.headers["x-manager-token"]
  const presented = typeof headerToken === "string" ? headerToken : ""

  if (!presented) {
    return false
  }

  // Primary: a logged-in manager session, keyed by the durable clientId the
  // socket handshake already uses (manager.login on MANAGER.AUTH success). This
  // is reload-safe and never puts the manager password on an HTTP header.
  if (manager.isLoggedClientId(presented)) {
    return true
  }

  // Dev fallback: the dev API key in dev mode (matches authorizeDevRequest).
  if (isDevMode()) {
    const devKey = devApiKey()
    if (devKey) {
      const a = Buffer.from(presented)
      const b = Buffer.from(devKey)
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return true
      }
    }
  }

  return false
}

let themeBroadcaster: ((theme: unknown) => void) | null = null

export const registerThemeBroadcaster = (
  fn: (theme: unknown) => void,
): void => {
  themeBroadcaster = fn
}

// Broadcast the installed-plugin list (InstalledPlugin[]) after an HTTP import.
// Mirrors registerThemeBroadcaster: index.ts wires it to io.emit(PLUGIN_CONFIG).
let pluginBroadcaster: ((plugins: unknown) => void) | null = null

export const registerPluginBroadcaster = (
  fn: (plugins: unknown) => void,
): void => {
  pluginBroadcaster = fn
}

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

// ── new-route handlers ──────────────────────────────────────────────────────

const handleClientEvents = (
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

const handleSoloGet = (res: ServerResponse, id: string | undefined, assignmentId?: string): void => {
  if (!checkGlobalSoloRate()) {
    jsonError(res, 429, "rate limited")
    return
  }

  // Check assignment deadline if assignmentId provided (from query param or caller)
  if (assignmentId && !checkAssignmentDeadline(assignmentId)) {
    jsonError(res, 403, "assignment_closed")
    return
  }

  try {
    assertSafeId(id ?? "")
    const quiz = getQuizzById(id!)
    const questions = quiz.questions.map((question) => {
      // Strip secrets: solutions, correct, acceptedAnswers, chunks
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { solutions: _s, correct: _c, acceptedAnswers: _a, chunks: _ch, ...rest } = question
      // For sentence-builder, add shuffledChunks (a permutation of the correct chunks)
      if (question.type === "sentence-builder" && question.chunks?.length) {
        return {
          ...rest,
          shuffledChunks: shuffleChunksWithGuard(question.chunks),
        }
      }
      return rest
    })
    jsonOk(res, { subject: quiz.subject, questions })
  } catch (err) {
    jsonError(res, 404, err instanceof Error ? err.message : "Not found")
  }
}

const handleCheckAnswer = (
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  if (!checkGlobalSoloRate()) {
    jsonError(res, 429, "rate limited")
    return
  }
  void (async () => {
    try {
      assertSafeId(id ?? "")
      const body = await readBody(req)
      const parsed = soloCheckAnswerRequestValidator.safeParse(body)

      if (!parsed.success) {
        jsonError(res, 400, parsed.error.issues[0]!.message)
        return
      }

      const { questionIndex, answerId, answerIds, answerText } = parsed.data
      const quiz = getQuizzById(id!)

      if (questionIndex < 0 || questionIndex >= quiz.questions.length) {
        jsonError(res, 400, "Invalid questionIndex")
        return
      }

      const question = quiz.questions[questionIndex]!
      const { correct, base } = evaluateAnswer(question, {
        answerId,
        answerIds,
        answerText,
      })
      const points = correct ? Math.round(1000 * base) : 0
      const response: SoloCheckAnswerResponse = { correct, points }

      if (question.type === "slider") {
        response.accuracy = base
        const sharp = mergeAchievementsConfig({}).find(
          (a) => a.id === "sharpshooter",
        )
        const minPct = sharp?.threshold ?? 95
        if ((sharp?.enabled ?? true) && correct && base * 100 >= minPct) {
          response.achievements = ["sharpshooter"]
        }
      }

      jsonOk(res, response)
    } catch (err) {
      jsonError(
        res,
        statusFrom413(err, 404),
        err instanceof Error ? err.message : "Error",
      )
    }
  })()
}

const handleSoloScore = (
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  if (!checkGlobalSoloRate()) {
    jsonError(res, 429, "rate limited")
    return
  }
  void (async () => {
    try {
      assertSafeId(id ?? "")
      const body = await readBody(req)
      const parsed = soloScoreSubmitValidator.safeParse(body)

      if (!parsed.success) {
        jsonError(res, 400, parsed.error.issues[0]!.message)
        return
      }

      const { playerName, score: clientScore, answers: clientAnswers, assignmentId } = parsed.data

      // Check assignment deadline if provided
      if (assignmentId && !checkAssignmentDeadline(assignmentId)) {
        jsonError(res, 403, "assignment_closed")
        return
      }

      // Load quiz before persisting: 404 (not the outer 500) when missing
      let quiz
      try {
        quiz = getQuizzById(id!)
      } catch {
        jsonError(res, 404, `Quizz "${id}" not found`)
        return
      }
      if (!quiz) {
        jsonError(res, 404, `Quizz "${id}" not found`)
        return
      }

      // SERVER-SIDE VERIFICATION: Recompute score from submitted answers and cap
      // at theoretical maximum. Never persist raw client-submitted scores.
      //
      // Theoretical maximum: all questions answered correctly = 1000 points each.
      const theoreticalMax = quiz.questions.length * 1000

      // If answers array is provided, recompute score from claims. Since the
      // client doesn't send selections (answerId/answerIds/answerText), we trust
      // the answers array (which should match what was verified via
      // /check-answer) but cap the final score at theoretical max.
      let verifiedScore = clientScore
      if (Array.isArray(clientAnswers) && clientAnswers.length > 0) {
        verifiedScore = 0
        for (const answer of clientAnswers) {
          if (
            answer.questionIndex >= 0 &&
            answer.questionIndex < quiz.questions.length &&
            answer.correct === true
          ) {
            // Each correct answer contributes max 1000 points (simplified max,
            // avoiding per-question difficulty variance without selections).
            verifiedScore += 1000
          }
        }
      }

      // SAFETY CAP: Ensure final score never exceeds theoretical maximum.
      const finalScore = Math.min(verifiedScore, theoreticalMax)

      appendSoloResult(
        id!,
        {
          playerName,
          score: finalScore,
          answeredAt: new Date().toISOString(),
        },
        assignmentId,
      )

      const leaderboard = getSoloResults(id!).sort((a, b) => b.score - a.score)
      jsonOk(res, { leaderboard })
    } catch (err) {
      jsonError(
        res,
        statusFrom413(err, 500),
        err instanceof Error ? err.message : "Error",
      )
    }
  })()
}

const handleSkeletonExport = (
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      const buf = await buildSkeletonZip()
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="razzoozle-skeleton.zip"',
        "content-length": buf.byteLength,
      })
      res.end(buf)
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : "error")
    }
  })()
}

const handleSkeletonImport = (
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      const buf = await readRawBody(req, SKELETON_IMPORT_MAX)
      const theme = await importSkeletonZip(buf)
      if (themeBroadcaster) {
        themeBroadcaster(theme)
      }
      jsonOk(res, { ok: true, theme })
    } catch (err) {
      const status = statusFrom413(err, 400)
      jsonError(res, status, err instanceof Error ? err.message : "error")
    }
  })()
}

// POST /api/plugins/import — body = raw ZIP bytes. Manager-gated, mirrors
// handleSkeletonImport. Stores+extracts only (NO server.js execution — WP3).
const handlePluginImport = (
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      const buf = await readRawBody(req, SKELETON_IMPORT_MAX)
      const plugin = await importPluginZip(buf)
      if (pluginBroadcaster) {
        pluginBroadcaster(readPlugins())
      }
      jsonOk(res, { ok: true, plugin })
    } catch (err) {
      const status = statusFrom413(err, 400)
      jsonError(res, status, err instanceof Error ? err.message : "error")
    }
  })()
}

// GET /api/plugins/:id/export — repack config/plugins/<id>/ as a ZIP. Manager-
// gated, mirrors handleSkeletonExport.
const handlePluginExport = (
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      assertSafeId(id ?? "")
      const buf = await buildPluginZip(id!)
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="plugin-${id}.zip"`,
        "content-length": buf.byteLength,
      })
      res.end(buf)
    } catch (err) {
      jsonError(res, 400, err instanceof Error ? err.message : "error")
    }
  })()
}

// GET /plugins/:id/* — serve an installed plugin's static files (ui.js, assets)
// directly from config/plugins/<id>/. PUBLIC (the client loads ui.js without a
// manager session); resolvePluginAsset enforces assertSafeId + path-traversal +
// ext-allowlist and returns null → 404 for anything else. No code is executed —
// the file is streamed as bytes with a content-type by extension.
const handlePluginAsset = (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
  rest: string | undefined,
): void => {
  const resolved = resolvePluginAsset(id ?? "", rest ?? "")

  if (!resolved) {
    jsonError(res, 404, "not found")
    return
  }

  // A plugin's files live at a STABLE url (/plugins/<id>/ui.js) and a same-id
  // reinstall keeps that url, so `immutable` would defeat the cache-bust — the
  // browser would never re-fetch the new bytes. Serve cacheable but always
  // revalidated (max-age=0, must-revalidate) so a reinstall is picked up while
  // an unchanged file still 304s.
  res.writeHead(200, {
    "content-type": resolved.contentType,
    "content-length": resolved.buffer.byteLength,
    "cache-control": "public, max-age=0, must-revalidate",
  })
  res.end(resolved.buffer)
}

// ── per-result Open Graph unfurl (/r/:id) ───────────────────────────────────
// Crawlers fetch /r/:id and read the og:* meta tags. Without this every share
// link previews identically (the static SPA shell). We serve the SAME built
// index.html (so humans get a working app) but rewrite og:title/og:description/
// <title> with this result's winner. Best-effort: a missing result or an
// unreadable file MUST NOT break the page — we always end up serving valid SPA
// HTML (or a 302 to / only when the shell itself is unreadable).
const OG_INDEX_HTML = "/app/web/index.html" // nginx root in the prod image (Dockerfile: COPY web/dist -> /app/web)

const escHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const injectOg = (html: string, title: string, desc: string): string =>
  html
    .replace(
      /(<meta property="og:title" content=")[^"]*(")/i,
      `$1${escHtml(title)}$2`,
    )
    .replace(
      /(<meta property="og:description" content=")[^"]*(")/i,
      `$1${escHtml(desc)}$2`,
    )
    .replace(/(<title>)[^<]*(<\/title>)/i, `$1${escHtml(title)}$2`)

const handleResultOg = (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  let html: string
  try {
    html = fs.readFileSync(OG_INDEX_HTML, "utf-8")
  } catch {
    // The SPA shell itself is unreadable (misconfigured image): bounce to /.
    res.writeHead(302, { Location: "/" })
    res.end()
    return
  }

  try {
    const result = getResultById(id ?? "")
    const winner = result.players?.[0]
    const subject = result.subject || "Razzoozle"
    const title = winner ? `${subject} — ${winner.username} gewinnt!` : subject
    const desc = winner
      ? `${winner.username} gewinnt mit ${winner.points} Punkten. Spiel selbst auf Razzoozle.`
      : "Endstand auf Razzoozle — spiel selbst mit."
    html = injectOg(html, title, desc)
  } catch {
    // Unknown/corrupt id: serve the SPA shell unchanged (renders not-found) with
    // its default og tags. Never throws past here.
  }

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  })
  res.end(html)
}

// ── Route table (single source of truth) ────────────────────────────────────
// Each entry carries a regex matcher with one optional capture group (the id),
// the doc metadata, and the handler. `dev` routes are fail-closed.


const handleCreateAssignment = (
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      const body = await readBody(req) as Record<string, unknown>
      const { quizzId, deadline, maxAttempts, requireIdentifier, showCorrectAnswers } = body

      if (typeof quizzId !== "string") {
        jsonError(res, 400, "quizzId required")
        return
      }

      // Validate quizzId exists
      try {
        getQuizzById(quizzId)
      } catch {
        jsonError(res, 404, `Quizz "${quizzId}" not found`)
        return
      }

      const id = nanoid()
      const assignment: Assignment = {
        id,
        quizzId,
        createdAt: Date.now(),
        deadline: deadline ? Number(deadline) : undefined,
        maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
        requireIdentifier: requireIdentifier === true,
        showCorrectAnswers: showCorrectAnswers === true,
      }

      const result = assignmentValidator.safeParse(assignment)
      if (!result.success) {
        jsonError(res, 400, result.error.issues[0]!.message)
        return
      }

      saveAssignment(result.data)
      jsonOk(res, { id })
    } catch (err) {
      const status = statusFrom413(err, 400)
      jsonError(res, status, err instanceof Error ? err.message : "Error")
    }
  })()
}

const handleGetAssignment = (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  try {
    assertSafeId(id ?? "")
    const assignment = getAssignment(id!)

    if (!assignment) {
      jsonError(res, 404, "Assignment not found")
      return
    }

    jsonOk(res, assignment)
  } catch (err) {
    jsonError(res, 404, err instanceof Error ? err.message : "Not found")
  }
}

const handleGetAssignmentResults = (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  if (!authorizeManagerRequest(_req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  try {
    assertSafeId(id ?? "")
    const assignment = getAssignment(id!)

    if (!assignment) {
      jsonError(res, 404, "Assignment not found")
      return
    }

    // Get solo results and filter by assignmentId
    const results = getSoloResults(assignment.quizzId).filter(
      (r) => (r as unknown as Record<string, unknown>).assignmentId === id,
    )

    jsonOk(res, { results })
  } catch (err) {
    jsonError(res, 404, err instanceof Error ? err.message : "Not found")
  }
}

// Helper to check assignment deadline
const checkAssignmentDeadline = (assignmentId?: string): boolean => {
  if (!assignmentId) return true

  const assignment = getAssignment(assignmentId)
  if (!assignment) return true

  if (assignment.deadline && Date.now() > assignment.deadline) {
    return false
  }

  // I2: maxAttempts needs identifier to track per-player attempt count (not implemented in MVP)

  return true
}

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

// DEV-route access decision for a dev-flagged route. Fail-closed contract:
// dev off -> "notfound" (404, do not reveal); dev on + a DEV_API_KEY
// configured -> require the token from the X-Manager-Token header OR the
// ?token= query, constant-time compared -> "unauthorized" on mismatch; dev on
// with no key -> "ok" (dev-gate only) for ordinary dev routes, BUT
// "unauthorized" for `requireKey` routes (log downloads) so operational logs
// are never served unauthenticated — those routes fail CLOSED.
const authorizeDevRequest = (
  req: IncomingMessage,
  url: URL,
  requireKey: boolean,
): "ok" | "notfound" | "unauthorized" => {
  if (!isDevMode()) {
    return "notfound"
  }

  const expected = devApiKey()

  if (!expected) {
    // No key configured: ordinary dev routes are dev-gate-only (open), but a
    // `requireKey` route (log download) must DENY rather than leak logs.
    return requireKey ? "unauthorized" : "ok"
  }

  const headerToken = req.headers["x-manager-token"]
  const presented =
    (typeof headerToken === "string" ? headerToken : undefined) ??
    url.searchParams.get("token") ??
    ""

  // Constant-time compare only when the lengths match (timingSafeEqual throws
  // on unequal-length buffers); a length mismatch is itself a rejection.
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return "unauthorized"
  }

  return "ok"
}

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
