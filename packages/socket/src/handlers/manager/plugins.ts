import { EVENTS } from "@razzoozle/common/constants"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  importPluginZip,
  readPlugins,
  removePlugin,
  setPluginConfig,
} from "@razzoozle/socket/services/config"
import manager from "@razzoozle/socket/services/manager"
import {
  loadPlugin,
  unloadPlugin,
} from "@razzoozle/socket/services/plugin-runtime"

// Pre-decode cap for the socket PLUGIN_INSTALL base64 ZIP, mirroring the 16 MB
// raw-byte limit the HTTP /api/plugins/import path enforces before decoding.
// base64 encodes 3 bytes per 4 chars, so the char limit = ceil(bytes / 3) * 4.
const PLUGIN_ZIP_MAX_BYTES = 16 * 1024 * 1024
const PLUGIN_ZIP_MAX_B64_LEN = Math.ceil(PLUGIN_ZIP_MAX_BYTES / 3) * 4

export const registerPluginHandlers = ({ socket }: SocketContext) => {
  // ── Plugin system (WP2): install / remove / set-config ────────────────────
  // All manager-auth-gated. INSTALL takes a base64 ZIP (mirrors UPLOAD_BACKGROUND
  // shape) → importPluginZip stores+extracts (NO server.js execution — WP3). Each
  // mutation broadcasts the fresh InstalledPlugin[] to every client and to the
  // requester (socket.broadcast excludes the sender, so emit to self too).
  const broadcastPlugins = (): void => {
    const plugins = readPlugins()
    socket.broadcast.emit(EVENTS.MANAGER.PLUGIN_CONFIG, plugins)
    socket.emit(EVENTS.MANAGER.PLUGIN_CONFIG, plugins)
  }

  socket.on(
    EVENTS.MANAGER.PLUGIN_INSTALL,
    manager.withAuth(socket, (payload: { zipBase64?: string }) => {
      void (async () => {
        try {
          if (typeof payload?.zipBase64 !== "string") {
            throw new Error("errors:plugin.invalidPayload")
          }

          // Pre-decode size cap: reject before allocating the decoded Buffer so a
          // huge base64 string can't trigger a memory-amplification DoS. Mirrors
          // the 16 MB raw-byte limit the HTTP /api/plugins/import path enforces
          // (readRawBody) — base64 inflates ~4/3, so cap the string length at the
          // char-count that decodes to at most PLUGIN_ZIP_MAX_BYTES.
          if (payload.zipBase64.length > PLUGIN_ZIP_MAX_B64_LEN) {
            throw new Error("errors:plugin.tooLarge")
          }

          const buf = Buffer.from(payload.zipBase64, "base64")
          const installed = await importPluginZip(buf)
          // WP3: run the plugin's server hook if it declares one (install =
          // enabled). The runtime capability-gates + crash-isolates the load,
          // so a broken server.js never fails the install.
          await loadPlugin(installed)
          broadcastPlugins()
        } catch (error) {
          socket.emit(
            EVENTS.MANAGER.ERROR_MESSAGE,
            error instanceof Error ? error.message : "errors:plugin.installFailed",
          )
        }
      })()
    }),
  )

  socket.on(
    EVENTS.MANAGER.PLUGIN_REMOVE,
    manager.withAuth(socket, (payload: { id?: string }) => {
      try {
        if (typeof payload?.id !== "string") {
          throw new Error("errors:plugin.invalidPayload")
        }

        // WP3: tear down the server hook (handlers + teardown) BEFORE the
        // files are deleted.
        unloadPlugin(payload.id)
        removePlugin(payload.id)
        broadcastPlugins()
      } catch (error) {
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          error instanceof Error ? error.message : "errors:plugin.removeFailed",
        )
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.PLUGIN_SET_CONFIG,
    manager.withAuth(
      socket,
      (payload: { id?: string; config?: Record<string, unknown> }) => {
        try {
          if (
            typeof payload?.id !== "string" ||
            typeof payload?.config !== "object" ||
            payload.config === null
          ) {
            throw new Error("errors:plugin.invalidPayload")
          }

          setPluginConfig(payload.id, payload.config)
          broadcastPlugins()
        } catch (error) {
          socket.emit(
            EVENTS.MANAGER.ERROR_MESSAGE,
            error instanceof Error ? error.message : "errors:plugin.configFailed",
          )
        }
      },
    ),
  )
}
