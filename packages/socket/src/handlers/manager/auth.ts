import { DEFAULT_MANAGER_PASSWORD, EVENTS } from "@razzoozle/common/constants"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  getAISettings,
  getManagerPasswordFromStorage,
  toPublicAISettings,
} from "@razzoozle/socket/services/config"
import manager, { emitConfig } from "@razzoozle/socket/services/manager"
import {
  isAuthThrottled,
  recordAuthFailure,
} from "@razzoozle/socket/services/submissionRateLimit"
import { timingSafeEqual } from "crypto"

export const registerAuthHandlers = ({ socket }: SocketContext) => {
  // NB: rate-limit / image-gen state is deliberately NOT cleared on disconnect.
  // Clearing it on disconnect was the reconnect-bypass (disconnect+reconnect
  // reset every quota). State is keyed by the durable clientId and self-expires
  // by time window (see services/submissionRateLimit + sweepImageGenStore), so
  // there is no per-socket leak and the quota survives a reconnect.

  socket.on(EVENTS.MANAGER.LOGOUT, () => {
    manager.logout(socket)
  })

  socket.on(EVENTS.MANAGER.AUTH, async (password) => {
    try {
      // PHASE 1: Read manager password through the storage repository.
      // When DATABASE_MODE is unset (default), this delegates to FileSystemRepository
      // which reads from game.json (preserving existing behavior).
      // When DATABASE_MODE='pg', this reads from Postgres.
      const managerPassword = await getManagerPasswordFromStorage()

      if (managerPassword === DEFAULT_MANAGER_PASSWORD) {
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:manager.passwordNotConfigured",
        )

        return
      }

      // Server-wide brute-force throttle: once too many failed auths land inside
      // the window, reject every attempt with the SAME invalidPassword key (do
      // not reveal the throttle). The window self-expires by time.
      if (isAuthThrottled()) {
        socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, "errors:manager.invalidPassword")

        return
      }

      // Constant-time compare to avoid leaking the password via response timing.
      // timingSafeEqual throws on unequal-length buffers, so a length mismatch is
      // itself a rejection (checked first, short-circuiting the compare).
      const presented = Buffer.from(typeof password === "string" ? password : "")
      const expected = Buffer.from(managerPassword)

      if (
        presented.length !== expected.length ||
        !timingSafeEqual(presented, expected)
      ) {
        recordAuthFailure()
        socket.emit(
          EVENTS.MANAGER.ERROR_MESSAGE,
          "errors:manager.invalidPassword",
        )

        return
      }

      manager.login(socket)
      emitConfig(socket)
      // Re-push AI settings on every successful auth (login + reconnect re-auth)
      // so the open KI tab repopulates after a server restart without the client
      // racing a withAuth GET_SETTINGS against re-auth. Public shape — no keys.
      socket.emit(EVENTS.AI.SETTINGS, toPublicAISettings(getAISettings()))
    } catch (error) {
      console.error("Failed to read game config:", error)
      socket.emit(
        EVENTS.MANAGER.ERROR_MESSAGE,
        "errors:manager.failedToReadConfig",
      )
    }
  })
}
