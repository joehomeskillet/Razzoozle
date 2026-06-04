// Canonical join URL for a game invite. No slash before the query string:
// Room.tsx historically omits it while GameWrapper.tsx adds one — we
// standardize on the no-slash form. `origin` defaults to the current
// window.location.origin, falling back to "" in non-browser contexts (SSR).
export function buildJoinUrl(inviteCode: string, origin?: string): string {
  return `${origin ?? (typeof window !== "undefined" ? window.location.origin : "")}?pin=${inviteCode}`
}
