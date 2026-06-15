// Rate limiting for the public, unauthenticated /submit path (question
// submission + GPU-expensive AI image generation).
//
// ── Keying ────────────────────────────────────────────────────────────────────
// Keyed by a DURABLE identity (the handshake clientId, see getClientId in
// services/manager.ts) rather than socket.id. socket.id changes on every
// reconnect, so a socket.id-keyed limit was trivially reset by disconnecting and
// reconnecting — letting an attacker flood the moderation queue / abuse the GPU.
// A durable key survives reconnect, so the window is NOT reset.
//
// ── Garbage collection ────────────────────────────────────────────────────────
// Entries are NOT cleared on disconnect (that was the bypass). Instead each
// store self-expires: a window/cooldown that has elapsed is overwritten on the
// next access, and a lazy sweep drops fully-expired entries so the Maps cannot
// grow unbounded across many distinct clients. No per-socket leak.
//
// ── Fail-safe ─────────────────────────────────────────────────────────────────
// Submission limits prefer allow-on-uncertainty: a counter bug must never lock
// out a legitimate user. Hard stops (the pending-queue cap) live in the handler,
// not here.
interface RateState {
  count: number
  windowStart: number
}

const WINDOW_MS = 60_000 // 60 seconds
const MAX_COUNT = 3 // max 3 submissions per 60 s per durable client

const store = new Map<string, RateState>()

// Lazy sweep: drop entries whose window already expired. Cheap and bounded — the
// store only holds one entry per active client within the last WINDOW_MS.
const sweep = (now: number): void => {
  for (const [key, state] of store) {
    if (now - state.windowStart > WINDOW_MS) {
      store.delete(key)
    }
  }
}

// Per-durable-client submission throttle: MAX_COUNT per WINDOW_MS. Returns true
// when the call is allowed.
export const checkRateLimit = (key: string): boolean => {
  const now = Date.now()
  const state = store.get(key)

  if (!state || now - state.windowStart > WINDOW_MS) {
    sweep(now)
    store.set(key, { count: 1, windowStart: now })

    return true
  }

  if (state.count >= MAX_COUNT) {
    return false
  }

  state.count += 1

  return true
}

// Retained for back-compat / explicit eviction in tests. NOT called on
// disconnect anymore (that reset was the reconnect-bypass). Safe to keep.
export const clearRateLimit = (key: string): void => {
  store.delete(key)
}

// ── Global server-wide submission rate (defense-in-depth) ─────────────────────
// A coarse server-wide ceiling so a botnet of distinct clientIds cannot each
// stay just under the per-client limit and still flood the queue in aggregate.
// Fixed-window counter; resets every GLOBAL_WINDOW_MS.
const GLOBAL_WINDOW_MS = 60_000 // 60 seconds
const GLOBAL_MAX_COUNT = 60 // max 60 submissions/min server-wide

const globalState: RateState = { count: 0, windowStart: 0 }

export const checkGlobalSubmissionRate = (): boolean => {
  const now = Date.now()

  if (now - globalState.windowStart > GLOBAL_WINDOW_MS) {
    globalState.windowStart = now
    globalState.count = 1

    return true
  }

  if (globalState.count >= GLOBAL_MAX_COUNT) {
    return false
  }

  globalState.count += 1

  return true
}

// ── Durable per-client hourly cap for AI image generation (GPU is expensive) ──
// In addition to the short cooldown enforced in the handler, each durable client
// gets at most IMAGE_GEN_MAX_PER_HOUR generations per rolling hour. Survives
// reconnect; self-expires after the hour.
const IMAGE_GEN_HOUR_MS = 3_600_000 // 1 hour
const IMAGE_GEN_MAX_PER_HOUR = 10

const imageGenHourStore = new Map<string, RateState>()

const sweepImageGenHour = (now: number): void => {
  for (const [key, state] of imageGenHourStore) {
    if (now - state.windowStart > IMAGE_GEN_HOUR_MS) {
      imageGenHourStore.delete(key)
    }
  }
}

export const checkImageGenHourlyLimit = (key: string): boolean => {
  const now = Date.now()
  const state = imageGenHourStore.get(key)

  if (!state || now - state.windowStart > IMAGE_GEN_HOUR_MS) {
    sweepImageGenHour(now)
    imageGenHourStore.set(key, { count: 1, windowStart: now })

    return true
  }

  if (state.count >= IMAGE_GEN_MAX_PER_HOUR) {
    return false
  }

  state.count += 1

  return true
}

// Pending-moderation-queue cap (hard stop). The handler reads the live pending
// count from config and rejects above this ceiling before persisting.
export const PENDING_QUEUE_CAP = 200
