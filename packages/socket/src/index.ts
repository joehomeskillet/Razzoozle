import {
  EVENTS,
  WS_DEFAULT_PORT,
  WS_DEFLATE_THRESHOLD_BYTES,
  WS_MAX_HTTP_BUFFER_BYTES,
  WS_PING_INTERVAL_MS,
  WS_PING_TIMEOUT_MS,
} from "@razzoozle/common/constants"
import type { Server } from "@razzoozle/common/types/game/socket"
import type { Theme } from "@razzoozle/common/types/theme"
import type { InstalledPlugin } from "@razzoozle/common/validators/plugin"
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
import {
  dispatchHttp,
  registerPluginBroadcaster,
  registerThemeBroadcaster,
} from "@razzoozle/socket/services/http-routes"
import {
  attachPluginsToSocket,
  loadEnabledPlugins,
  setPluginIo,
} from "@razzoozle/socket/services/plugin-runtime"
import { logger, socketLogger } from "@razzoozle/socket/services/logger"
import { connectedSockets } from "@razzoozle/socket/services/prom"
import { hydrateConfigFromPg } from "@razzoozle/socket/services/storage/hydrate-pg"
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

// Materialize Postgres state to config/ files on boot (pg/pg-only modes).
// Non-blocking: errors are logged per-category, boot continues.
void hydrateConfigFromPg().catch((error: unknown) => {
  logger.error({ err: error }, "hydrateConfigFromPg failed")
})

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

// Hand the plugin runtime the live socket.io Server so it can hot-bind plugin
// event handlers onto connected sockets + broadcast on plugin namespaces. Set
// BEFORE any plugin loads or any socket connects. The runtime keeps it as the
// untyped raw Server (plugin "plugin:<id>:<event>" names are not in the strict
// typed event map).
setPluginIo(io)

// Wire the skeleton-import HTTP route (services/http-routes.ts) to broadcast the
// new theme to every connected client, mirroring the MANAGER.SET_THEME socket
// path so an uploaded skeleton applies live without a reload.
registerThemeBroadcaster((theme) => {
  io.emit(EVENTS.MANAGER.THEME, theme as Theme)
})

// Wire the plugin-import HTTP route to broadcast the fresh InstalledPlugin[] to
// every connected client (mirrors the skeleton/theme broadcaster), so an HTTP
// install/remove reflects live in every open manager without a reload.
registerPluginBroadcaster((plugins) => {
  io.emit(EVENTS.MANAGER.PLUGIN_CONFIG, plugins as InstalledPlugin[])
})

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

// Load every enabled plugin that declares a server hook (manifest hooks.server
// + the SERVER_HANDLER capability). Fully crash-isolated per plugin — a broken
// server.js is caught + logged inside the runtime and never blocks boot.
void loadEnabledPlugins().catch((error: unknown) => {
  logger.error({ err: error }, "loadEnabledPlugins failed")
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

  // After the builtin handlers, attach any currently-registered plugin handlers
  // so a plugin loaded before this client connected receives its namespaced
  // events. loadPlugin() handles the inverse (hot-bind onto existing sockets).
  attachPluginsToSocket(socket)
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
