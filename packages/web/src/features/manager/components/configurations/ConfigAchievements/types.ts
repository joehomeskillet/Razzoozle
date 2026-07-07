import { type AchievementId } from "@razzoozle/common/achievements"

// ---------------------------------------------------------------------------
// Local state types
// ---------------------------------------------------------------------------

interface RowState {
  enabled: boolean
  name: string
  description: string
  threshold: number | null
  // Bonus points awarded when this badge unlocks. Always present (every badge
  // can carry a bonus, unlike the optional threshold).
  bonus: number
}

type LocalState = Record<AchievementId, RowState>

// Fallback used when a registry id has no entry in local state yet (e.g. a
// freshly added achievement that the persisted config hasn't caught up to).
const EMPTY_ROW: RowState = {
  enabled: true,
  name: "",
  description: "",
  threshold: null,
  bonus: 0,
}

// German fallback explanations of what each threshold value controls — keyed by
// the registry threshold key. Overridable per locale via
// manager:achievementsConfig.thresholdHint.<key>.
const THRESHOLD_HINTS: Record<string, string> = {
  lastPercent: "Richtig in den letzten X % des Zeitfensters",
  maxMs: "Maximale Antwortzeit in Millisekunden",
  streak: "Anzahl richtiger Antworten in Folge",
  minAccuracyPct: "Mindest-Genauigkeit beim Schieberegler (%)",
  minRanksUp: "Plätze, die man in der Rangliste hochklettern muss",
  minPointsAhead: "Punktevorsprung der überholten Person",
}

export type { LocalState, RowState }
export { EMPTY_ROW, THRESHOLD_HINTS }
