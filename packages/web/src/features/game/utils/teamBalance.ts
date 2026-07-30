import { TEAMS } from "@razzoozle/common/constants"
import type { Player } from "@razzoozle/common/types/game"

/**
 * Lobby team imbalance (WP #952):
 * among non-empty teams, (max − min) ≥ 2 when ≥ 6 connected players have a team.
 */
export function isTeamsUnbalanced(players: Player[]): boolean {
  const active = players.filter((p) => p.connected)
  if (active.length < 6) {
    return false
  }

  const counts = TEAMS.map(
    (team) => active.filter((p) => p.teamId === team).length,
  ).filter((n) => n > 0)

  if (counts.length < 2) {
    return false
  }

  const max = Math.max(...counts)
  const min = Math.min(...counts)
  return max - min >= 2
}
