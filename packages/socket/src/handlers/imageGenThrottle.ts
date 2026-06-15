// Shared throttle stack for the public, unauthenticated GPU image ops
// (GENERATE_IMAGE in handlers/manager.ts + EDIT_IMAGE in handlers/submitMedia.edit.ts).
//
// Extracted from handlers/manager.ts so the EDIT_IMAGE handler can SHARE the
// SAME `imageGenStore` Map without re-editing manager.ts (#23 §3). Sharing the
// store is MANDATORY: it stops a client from getting 5 text2img + 5 img2img +
// 10+10 hourly credits by using different event names. The cooldown / lifetime /
// hourly numbers and ordering are kept byte-identical to the original
// GENERATE_IMAGE logic — see tryConsumeImageGenCredit below.
import type { SocketContext } from "@razzia/socket/handlers/types"
import { checkImageGenHourlyLimit } from "@razzia/socket/services/submissionRateLimit"

// The durable client identity from the handshake — same value manager auth keys
// on (see services/manager.ts#getClientId). Falls back to socket.id when absent
// so a client that never sends a clientId is still throttled (fail-safe: a
// missing id must never mean "unlimited").
export const getClientId = (socket: SocketContext["socket"]): string =>
  (socket.handshake.auth.clientId as string | undefined) ?? socket.id

// AI-gen is a public, unauthenticated GPU op (venue submit). Guards: a short
// cooldown (1 / 30 s) AND a per-client lifetime cap, PLUS a durable hourly cap
// (services/submissionRateLimit#checkImageGenHourlyLimit). State is keyed by the
// DURABLE clientId (not socket.id) so a reconnect does NOT reset the cooldown,
// and entries self-expire by time window rather than on disconnect.
interface ImageGenState {
  last: number
  total: number
}

const imageGenStore = new Map<string, ImageGenState>()
const IMAGE_GEN_COOLDOWN_MS = 30_000
const IMAGE_GEN_MAX_PER_SOCKET = 5

// Lazy GC for the per-client cooldown/lifetime store: drop entries whose last
// activity is older than the hourly window so the Map cannot grow unbounded
// across many distinct clients (no per-socket leak, no disconnect cleanup).
const IMAGE_GEN_GC_MS = 3_600_000
const sweepImageGenStore = (now: number): void => {
  for (const [key, state] of imageGenStore) {
    if (now - state.last > IMAGE_GEN_GC_MS) {
      imageGenStore.delete(key)
    }
  }
}

// Reject prompts that look like leaked secrets (best-effort, intentionally
// simple — the real guard is that prompts never touch secret stores).
export const SECRET_PATTERNS = [/sk-/i, /AKIA/, /BEGIN PRIVATE KEY/i]

// Result of a throttle check. On `ok: false`, `errorKey` is the i18n string key
// the caller should emit via IMAGE_ERROR.
export interface ImageGenCreditResult {
  ok: boolean
  errorKey?: string
}

// Cooldown + per-client lifetime + durable hourly check, consuming a credit on
// the dispatch path. Behaviour is byte-identical to the original inline
// GENERATE_IMAGE logic (handlers/manager.ts), just relocated so EDIT_IMAGE can
// share the SAME store:
//   1. sweep stale entries.
//   2. cooldown (30s) + lifetime cap (5) FIRST — these reject WITHOUT touching
//      the hourly counter (burning hourly credits inside the cooldown let a
//      spamming client self-lock the 10/h cap with zero successful gens).
//   3. durable hourly cap (10/h) — consumed ONLY on the dispatch path.
//   4. increment last/total on the shared store, THEN return ok.
export const tryConsumeImageGenCredit = (
  clientId: string,
): ImageGenCreditResult => {
  const now = Date.now()
  sweepImageGenStore(now)
  const state = imageGenStore.get(clientId)

  // Cooldown + per-client lifetime cap FIRST (these reject WITHOUT touching the
  // hourly counter).
  if (state) {
    if (now - state.last < IMAGE_GEN_COOLDOWN_MS) {
      return { ok: false, errorKey: "errors:submission.imageRateLimited" }
    }

    if (state.total >= IMAGE_GEN_MAX_PER_SOCKET) {
      return { ok: false, errorKey: "errors:submission.imageLimitReached" }
    }
  }

  // Durable hourly cap (GPU is expensive): keyed by clientId, survives reconnect,
  // self-expires after the hour. Consumed only here, on the path that will
  // actually dispatch, so a cooldown-rejected request never spends an hourly
  // credit.
  if (!checkImageGenHourlyLimit(clientId)) {
    return { ok: false, errorKey: "errors:submission.imageLimitReached" }
  }

  if (state) {
    state.last = now
    state.total += 1
  } else {
    imageGenStore.set(clientId, { last: now, total: 1 })
  }

  return { ok: true }
}
