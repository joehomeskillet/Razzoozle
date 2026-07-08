import type { IncomingMessage } from "http"
import { timingSafeEqual } from "crypto"
import manager from "@razzoozle/socket/services/manager"
import { devApiKey, isDevMode } from "@razzoozle/socket/services/config"

export const authorizeManagerRequest = (req: IncomingMessage): boolean => {
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

// DEV-route access decision for a dev-flagged route. Fail-closed contract:
// dev off -> "notfound" (404, do not reveal); dev on + a DEV_API_KEY
// configured -> require the token from the X-Manager-Token header OR the
// ?token= query, constant-time compared -> "unauthorized" on mismatch; dev on
// with no key -> "ok" (dev-gate only) for ordinary dev routes, BUT
// "unauthorized" for `requireKey` routes (log downloads) so operational logs
// are never served unauthenticated — those routes fail CLOSED.
export const authorizeDevRequest = (
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
