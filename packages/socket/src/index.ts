import {
  WS_DEFAULT_PORT,
  WS_DEFLATE_THRESHOLD_BYTES,
  WS_MAX_HTTP_BUFFER_BYTES,
  WS_PING_INTERVAL_MS,
  WS_PING_TIMEOUT_MS,
} from "@razzoozle/common/constants"
import type { Server } from "@razzoozle/common/types/game/socket"
import { aiSocketHandlers } from "@razzoozle/socket/handlers/ai"
import { catalogSocketHandlers } from "@razzoozle/socket/handlers/catalog"
import { displaySocketHandlers } from "@razzoozle/socket/handlers/display"
import { gameSocketHandlers } from "@razzoozle/socket/handlers/game"
import { managerSocketHandlers } from "@razzoozle/socket/handlers/manager"
import { mediaSocketHandlers } from "@razzoozle/socket/handlers/media"
import { quizzSocketHandlers } from "@razzoozle/socket/handlers/quizz"
import { resultsSocketHandlers } from "@razzoozle/socket/handlers/results"
import { registerSubmitMediaHandlers } from "@razzoozle/socket/handlers/submitMedia"
import { themeRevisionSocketHandlers } from "@razzoozle/socket/handlers/theme-revision"
import { themeTemplateSocketHandlers } from "@razzoozle/socket/handlers/theme-template"
import type { SocketHandler } from "@razzoozle/socket/handlers/types"
import {
  assertSafeId,
  appendSoloResult,
  cleanupStaleAvatars,
  getMergedAchievements,
  getQuizzById,
  getSoloResults,
  initConfig,
} from "@razzoozle/socket/services/config"
import { mergeAchievementsConfig } from "@razzoozle/common/achievements"
import { evaluateAnswer } from "@razzoozle/socket/services/game/answer-eval"
import type { SoloCheckAnswerResponse } from "@razzoozle/common/types/game"
import {
  soloCheckAnswerRequestValidator,
  soloScoreSubmitValidator,
} from "@razzoozle/common/validators/solo"
import Registry from "@razzoozle/socket/services/registry"
import { createServer } from "http"
import { Server as ServerIO } from "socket.io"

const WS_PORT = Number(process.env.WS_PORT) || WS_DEFAULT_PORT

const io: Server = new ServerIO({
  path: "/ws",
  // Compress WS frames over 1KB (off by default) + cap inbound buffer.
  perMessageDeflate: { threshold: WS_DEFLATE_THRESHOLD_BYTES },
  maxHttpBufferSize: WS_MAX_HTTP_BUFFER_BYTES,
  // Detect a dead connection faster on flaky venue wifi (~18s vs ~45s default)
  // so the client reconnects sooner.
  pingInterval: WS_PING_INTERVAL_MS,
  pingTimeout: WS_PING_TIMEOUT_MS,
})
initConfig()

// ---- HTTP helpers -----------------------------------------------------------

const jsonOk = (res: import("http").ServerResponse, data: unknown): void => {
  const body = JSON.stringify(data)
  res.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

const jsonError = (
  res: import("http").ServerResponse,
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

const BODY_LIMIT_BYTES = 64 * 1024 // 64 KB — enough for any valid solo payload

const readBody = (req: import("http").IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    // Pre-check Content-Length header to reject oversized requests immediately.
    const contentLength = Number(req.headers["content-length"] ?? 0)
    if (contentLength > BODY_LIMIT_BYTES) {
      req.destroy()
      reject(Object.assign(new Error("Payload Too Large"), { status: 413 }))
      return
    }

    const chunks: Buffer[] = []
    let accumulated = 0

    req.on("data", (chunk: Buffer) => {
      accumulated += chunk.byteLength
      if (accumulated > BODY_LIMIT_BYTES) {
        req.destroy()
        reject(Object.assign(new Error("Payload Too Large"), { status: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")))
      } catch {
        reject(new Error("Invalid JSON"))
      }
    })
    req.on("error", reject)
  })

// Explicit HTTP server so we can serve a tiny health endpoint alongside the
// socket.io upgrade path. socket.io owns its own `/ws` path (handled before
// this fires); only non-`/ws` plain HTTP requests reach this handler, so the
// `/healthz` check never interferes with WS traffic.
const httpServer = createServer((req, res) => {
  const url = req.url ?? ""
  const method = req.method ?? "GET"

  // ── GET /healthz ──────────────────────────────────────────────────────────
  if (url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" })
    res.end("ok")

    return
  }

  // ── GET /api/achievements ─────────────────────────────────────────────────
  // Public merged achievements config (enabled + name/description overrides +
  // resolved thresholds) for the player client's popup / trophy gallery. Carries
  // no game state, so no auth and no body — a plain read of the merged config.
  if (url === "/api/achievements" && method === "GET") {
    jsonOk(res, { achievements: getMergedAchievements() })

    return
  }

  // ── GET /api/quizz/:id/solo ───────────────────────────────────────────────
  // Returns quiz subject + questions with solutions/correct/acceptedAnswers
  // stripped so the client cannot trivially cheat. 404 JSON when not found.
  const soloGetMatch = /^\/api\/quizz\/([^/]+)\/solo$/.exec(url)

  if (soloGetMatch && method === "GET") {
    const id = soloGetMatch[1]

    try {
      assertSafeId(id)
      const quiz = getQuizzById(id)

      // Strip solution/answer fields for each question.
      const questions = quiz.questions.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ solutions: _s, correct: _c, acceptedAnswers: _a, ...rest }) => rest,
      )

      jsonOk(res, { subject: quiz.subject, questions })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Not found"
      jsonError(res, 404, msg)
    }

    return
  }

  // ── POST /api/quizz/:id/check-answer ─────────────────────────────────────
  // Stateless: loads the quiz, evaluates the answer server-side via
  // evaluateAnswer, returns { correct, points }. No session / streak.
  const checkMatch = /^\/api\/quizz\/([^/]+)\/check-answer$/.exec(url)

  if (checkMatch && method === "POST") {
    const id = checkMatch[1]

    void (async () => {
      try {
        assertSafeId(id)
        const body = await readBody(req)
        const parsed = soloCheckAnswerRequestValidator.safeParse(body)

        if (!parsed.success) {
          jsonError(res, 400, parsed.error.issues[0].message)

          return
        }

        const { questionIndex, answerId, answerIds, answerText } = parsed.data
        const quiz = getQuizzById(id)

        if (questionIndex < 0 || questionIndex >= quiz.questions.length) {
          jsonError(res, 400, "Invalid questionIndex")

          return
        }

        const question = quiz.questions[questionIndex]
        const { correct, base } = evaluateAnswer(question, {
          answerId,
          answerIds,
          answerText,
        })
        const points = correct ? Math.round(1000 * base) : 0

        // BOUNDED solo badges — server side only contributes `sharpshooter`
        // (slider accuracy), the single honestly-computable, non-spoofable
        // badge on this stateless path. NO timing/streak/multiplayer badge is
        // computed here (no trustworthy time, no session). `base` for a slider
        // IS the accuracy fraction (0..1) — the SAME value round-manager uses
        // for its sharpshooter check (`base > minAccuracyPct/100`).
        //
        // Solo is offline/stateless and has NO manager config, so the enabled
        // gate + threshold come from the registry defaults
        // (mergeAchievementsConfig({})). Per-badge manager enable/threshold
        // overrides are deliberately ignored on the solo path.
        const response: SoloCheckAnswerResponse = { correct, points }

        if (question.type === "slider") {
          response.accuracy = base
          const sharp = mergeAchievementsConfig({}).find(
            (a) => a.id === "sharpshooter",
          )
          const minPct = sharp?.threshold ?? 95
          if (
            (sharp?.enabled ?? true) &&
            correct &&
            base * 100 >= minPct
          ) {
            response.achievements = ["sharpshooter"]
          }
        }

        jsonOk(res, response)
      } catch (err) {
        const status =
          err instanceof Error && (err as NodeJS.ErrnoException & { status?: number }).status === 413
            ? 413
            : 404
        const msg = err instanceof Error ? err.message : "Error"
        jsonError(res, status, msg)
      }
    })()

    return
  }

  // ── POST /api/quizz/:id/solo-score ───────────────────────────────────────
  // Persists a solo-play score entry. Appended to config/solo-results/:id.json
  // as a growing JSON array. Validated via soloScoreSubmitValidator.
  const scoreMatch = /^\/api\/quizz\/([^/]+)\/solo-score$/.exec(url)

  if (scoreMatch && method === "POST") {
    const id = scoreMatch[1]

    void (async () => {
      try {
        assertSafeId(id)
        const body = await readBody(req)
        const parsed = soloScoreSubmitValidator.safeParse(body)

        if (!parsed.success) {
          jsonError(res, 400, parsed.error.issues[0].message)

          return
        }

        const { playerName, score } = parsed.data
        appendSoloResult(id, {
          playerName,
          score,
          answeredAt: new Date().toISOString(),
        })

        const leaderboard = getSoloResults(id).sort((a, b) => b.score - a.score)
        jsonOk(res, { leaderboard })
      } catch (err) {
        const status =
          err instanceof Error && (err as NodeJS.ErrnoException & { status?: number }).status === 413
            ? 413
            : 500
        const msg = err instanceof Error ? err.message : "Error"
        jsonError(res, status, msg)
      }
    })()

    return
  }

  res.writeHead(404)
  res.end()
})

io.attach(httpServer)

console.log(`Socket server running on port ${WS_PORT}`)
httpServer.listen(WS_PORT)

const registry = Registry.getInstance()

// Crash recovery: restore any games persisted before the last shutdown, THEN
// start the periodic snapshot (so the first save can't overwrite the snapshot
// before restore has read it). Both steps are fully crash-guarded internally —
// a missing/corrupt snapshot is a no-op and never blocks boot.
void registry
  .loadSnapshot(io)
  .catch((error: unknown) => {
    console.error("loadSnapshot failed:", error)
  })
  .finally(() => {
    try {
      cleanupStaleAvatars(registry.getAllGames().map((game) => game.gameId))
    } catch (error) {
      console.error("cleanupStaleAvatars failed:", error)
    }

    registry.startSnapshotTask()
  })

const socketHandlers: SocketHandler[] = [
  managerSocketHandlers,
  quizzSocketHandlers,
  catalogSocketHandlers,
  mediaSocketHandlers,
  aiSocketHandlers,
  gameSocketHandlers,
  resultsSocketHandlers,
  displaySocketHandlers,
  themeTemplateSocketHandlers,
  themeRevisionSocketHandlers,
  // #23 public /submit media pipeline (enhance preview + upload + img2img edit).
  registerSubmitMediaHandlers,
]

io.on("connection", (socket) => {
  console.log(
    `A user connected: socketId: ${socket.id}, clientId: ${socket.handshake.auth.clientId}`,
  )

  socketHandlers.forEach((handler) => {
    handler({ io, socket })
  })
})

// On a graceful redeploy/shutdown, snapshot the LATEST state BEFORE cleanup so
// the next boot can restore in-flight games. saveSnapshot is crash-guarded.
process.on("SIGINT", () => {
  registry.saveSnapshot()
  registry.cleanup()
  process.exit(0)
})

process.on("SIGTERM", () => {
  registry.saveSnapshot()
  registry.cleanup()
  process.exit(0)
})
