// Canonical join URL for a game invite. No slash before the query string:
// Room.tsx historically omits it while GameWrapper.tsx adds one — we
// standardize on the no-slash form. The base is resolved by resolveJoinBase()
// (host override -> window.location.origin) so a desktop/relay host can point
// players at the public join host without DOM-patching. See HOST_INTEGRATION.md.

function normalizeOverride(candidate: string | undefined | null): string | undefined {
  if (!candidate) return undefined
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return undefined
  }
  const host = url.hostname
  const isLoopbackOrPrivate =
    /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  // Overrides must be https, or http only for loopback/private (LAN/dev hosting).
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackOrPrivate)) {
    return undefined
  }
  // Normalize to origin only — drop any path/query/hash.
  return url.origin
}

// Resolve the player-facing join base. Precedence (first hit wins):
//   1. window.__RAZZ_HOST.joinBase   (canonical, versioned host object)
//   2. window.__RAZZ_JOIN_BASE       (legacy global)
//   3. #root (or <html>) [data-join-base]  (declarative fallback)
//   4. window.location.origin        (standalone default — unchanged)
// SSR/non-browser returns "". Override candidates (1-3) are validated+normalized;
// the window.location.origin fallback is never restricted (today's behavior).
export function resolveJoinBase(): string {
  if (typeof window === "undefined") return ""
  const fromHost = normalizeOverride(window.__RAZZ_HOST?.joinBase)
  if (fromHost) return fromHost
  const fromLegacy = normalizeOverride(window.__RAZZ_JOIN_BASE)
  if (fromLegacy) return fromLegacy
  if (typeof document !== "undefined") {
    const el = document.getElementById("root") ?? document.documentElement
    const fromAttr = normalizeOverride(el?.getAttribute("data-join-base"))
    if (fromAttr) return fromAttr
  }
  return window.location.origin
}

export function buildJoinUrl(
  inviteCode: string | undefined,
  origin?: string,
): string {
  return `${origin ?? resolveJoinBase()}?pin=${inviteCode ?? ""}`
}
