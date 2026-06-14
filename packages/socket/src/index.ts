import {
  WS_DEFAULT_PORT,
  WS_DEFLATE_THRESHOLD_BYTES,
  WS_MAX_HTTP_BUFFER_BYTES,
  WS_PING_INTERVAL_MS,
  WS_PING_TIMEOUT_MS,
} from "@razzia/common/constants"
import type { Server } from "@razzia/common/types/game/socket"
import { aiSocketHandlers } from "@razzia/socket/handlers/ai"
import { catalogSocketHandlers } from "@razzia/socket/handlers/catalog"
import { displaySocketHandlers } from "@razzia/socket/handlers/display"
import { gameSocketHandlers } from "@razzia/socket/handlers/game"
import { managerSocketHandlers } from "@razzia/socket/handlers/manager"
import { mediaSocketHandlers } from "@razzia/socket/handlers/media"
import { quizzSocketHandlers } from "@razzia/socket/handlers/quizz"
import { resultsSocketHandlers } from "@razzia/socket/handlers/results"
import { themeTemplateSocketHandlers } from "@razzia/socket/handlers/theme-template"
import type { SocketHandler } from "@razzia/socket/handlers/types"
import {
  cleanupStaleAvatars,
  initConfig,
} from "@razzia/socket/services/config"
import Registry from "@razzia/socket/services/registry"
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
const httpServer = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" })
    res.end("ok")

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
