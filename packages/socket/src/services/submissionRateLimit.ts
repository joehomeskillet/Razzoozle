// Per-socket throttle for the public SUBMIT_QUESTION handler. Per-socket (not
// per-IP) because the venue is behind shared NAT — each browser tab is one
// socket.id, so this caps a single person without IP-aware middleware. The Map
// is garbage-collected on socket disconnect (see handlers/manager.ts).
interface RateState {
  count: number
  windowStart: number
}

const WINDOW_MS = 60_000 // 60 seconds
const MAX_COUNT = 3 // max 3 submissions per 60 s per socket connection

const store = new Map<string, RateState>()

export const checkRateLimit = (socketId: string): boolean => {
  const now = Date.now()
  const state = store.get(socketId)

  if (!state || now - state.windowStart > WINDOW_MS) {
    store.set(socketId, { count: 1, windowStart: now })

    return true
  }

  if (state.count >= MAX_COUNT) {
    return false
  }

  state.count += 1

  return true
}

export const clearRateLimit = (socketId: string): void => {
  store.delete(socketId)
}
