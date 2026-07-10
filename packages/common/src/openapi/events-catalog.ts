import { EVENTS } from "@razzoozle/common/constants"

// Static socket.io event catalog derived from the EVENTS map. AsyncAPI tooling
// was deliberately cut (no socket.io binding exists); this flat JSON is the
// substitute served at GET /api/v1/observability/events.
//
// `role` groups by the EVENTS namespace; `direction` is a best-effort heuristic
// from the event-name suffix (the wire names are stable string constants, so a
// simple suffix rule is enough for a docs surface — never a control path).

interface EventCatalogEntry {
  name: string // wire event string, e.g. "manager:auth"
  role: string // EVENTS namespace key, e.g. "MANAGER"
  key: string // the constant key, e.g. "AUTH"
  direction: "c2s" | "s2c" | "bidirectional"
}

// Suffix/keyword heuristics → likely direction. Server→client events tend to be
// data/result/error/status broadcasts; client→server events are the verbs.
const S2C_HINTS = [
  "data",
  "success",
  "error",
  "status",
  "result",
  "generated",
  "uploaded",
  "enhanced",
  "kicked",
  "unauthorized",
  "config",
  "health",
  "pong",
  "registered",
  "reconnected",
  "created",
  "leaderboard",
  "cooldown",
  "question",
  "players",
  "room",
  "join",
  "reset",
]

const directionFor = (key: string): EventCatalogEntry["direction"] => {
  const lower = key.toLowerCase()
  return S2C_HINTS.some((h) => lower.includes(h)) ? "s2c" : "c2s"
}

export const buildEventCatalog = (): EventCatalogEntry[] => {
  const entries: EventCatalogEntry[] = []

  for (const [role, group] of Object.entries(EVENTS)) {
    for (const [key, name] of Object.entries(group as Record<string, string>)) {
      entries.push({ name, role, key, direction: directionFor(key) })
    }
  }

  return entries
}
