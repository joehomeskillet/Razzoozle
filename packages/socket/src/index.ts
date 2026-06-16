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
import { cleanupStaleAvatars, initConfig } from "@razzoozle/socket/services/config"
import Registry from "@razzoozle/socket/services/registry"
import { dispatchHttp } from "@razzoozle/socket/services/http-routes"
import { logger, socketLogger } from "@razzoozle/socket/services/logger"
import { connectedSockets } from "@razzoozle/socket/services/prom"
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

// Explicit HTTP server so we can serve a tiny health endpoint alongside the
// socket.io upgrade path. socket.io owns its own `/ws` path (handled before
// this fires); only non-`/ws` plain HTTP requests reach this handler, so the
// `/healthz` check never interferes with WS traffic.
//
// The route table + dispatcher (services/http-routes.ts) handle every /api/*
// and /metrics route — the SAME table feeds the OpenAPI generator. `/healthz`
// stays inline + FROZEN: nginx, the Dockerfile healthcheck and deploy.sh all
// grep for its exact text/plain "ok" response, so it must never move into the
// table or change shape.
const httpServer = createServer((req, res) => {
  const url = req.url ?? ""

  // ── GET /healthz (FROZEN — text/plain "ok") ───────────────────────────────
  if (url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" })
    res.end("ok")

    return
  }

  // Route table dispatch (legacy /api routes verbatim + new DEV-gated routes).
  if (dispatchHttp(req, res)) {
    return
  }

  res.writeHead(404)
  res.end()
})

io.attach(httpServer)

// FROZEN BOOT LOG (P0-2): deploy.sh greps `grep -qF "Socket server running on
// port <PORT>"`; the prefix AND interpolated port must stay on stdout, emitted
// BEFORE listen. pino writes structured JSON, so the boot line is emitted as a
// plain stdout write to preserve the exact literal string deploy.sh expects.
process.stdout.write(`Socket server running on port ${WS_PORT}\n`)
httpServer.listen(WS_PORT)

const registry = Registry.getInstance()

// Crash recovery: restore any games persisted before the last shutdown, THEN
// start the periodic snapshot (so the first save can't overwrite the snapshot
// before restore has read it). Both steps are fully crash-guarded internally —
// a missing/corrupt snapshot is a no-op and never blocks boot.
void registry
  .loadSnapshot(io)
  .catch((error: unknown) => {
    logger.error({ err: error }, "loadSnapshot failed")
  })
  .finally(() => {
    try {
      cleanupStaleAvatars(registry.getAllGames().map((game) => game.gameId))
    } catch (error) {
      logger.error({ err: error }, "cleanupStaleAvatars failed")
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
  const clientId =
    typeof socket.handshake.auth.clientId === "string"
      ? socket.handshake.auth.clientId
      : undefined
  // Per-socket correlation child. clientId is truncated for the bind so a raw
  // full-length id never lands on a log line (spec §7 DENY list).
  const log = socketLogger({
    socketId: socket.id,
    clientId: clientId ? clientId.slice(0, 8) : undefined,
  })
  log.info("socket connected")

  connectedSockets.inc({ role: "unknown" })
  socket.on("disconnect", () => {
    connectedSockets.dec({ role: "unknown" })
  })

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
