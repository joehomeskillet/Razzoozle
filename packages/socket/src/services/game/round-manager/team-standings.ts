// Teams — selectTeam + computeTeamStandings extracted verbatim from
// RoundManager (round-manager.ts, Modul 6 of the SRP split).
//
// Neither function touches RoundManager round state: both only read the
// game-creation `teamMode` snapshot and the live PlayerManager (passed by
// reference), so no setter callbacks are needed — `player.teamId = teamId`
// mutates the SAME player object the manager's roster holds.
import { TEAMS } from "@razzoozle/common/constants"
import type { Player, TeamStanding } from "@razzoozle/common/types/game"
import type { PlayerManager } from "@razzoozle/socket/services/game/player-manager"

// Assign a player to one of the fixed teams. No-op when team mode is off or the
// teamId is not a valid TEAMS member (anti-tamper). Re-broadcasts the player so
// the host roster + lobby reflect the choice. Returns the updated player (or
// undefined when nothing changed) so the caller can decide whether to emit.
export function selectTeam(
  ctx: { teamMode: boolean | undefined; players: PlayerManager },
  clientId: string,
  teamId: string,
): Player | undefined {
  if (!ctx.teamMode) {
    return undefined
  }

  if (!(TEAMS as readonly string[]).includes(teamId)) {
    return undefined
  }

  const player = ctx.players.findByClientId(clientId)

  if (!player) {
    return undefined
  }

  player.teamId = teamId

  return player
}

// Aggregate team points = SUM of member `points`, with member counts, sorted by
// points desc. Returns undefined when team mode is off (so the optional payload
// field stays absent in normal mode). Only players WITH a teamId contribute —
// bots never have one, so they are naturally excluded.
export function computeTeamStandings(ctx: {
  teamMode: boolean | undefined
  players: PlayerManager
}): TeamStanding[] | undefined {
  if (!ctx.teamMode) {
    return undefined
  }

  const byTeam = new Map<string, { points: number; playerCount: number }>()

  for (const player of ctx.players.getAll()) {
    const teamId = player.teamId

    if (!teamId || !(TEAMS as readonly string[]).includes(teamId)) {
      continue
    }

    const entry = byTeam.get(teamId) ?? { points: 0, playerCount: 0 }
    entry.points += player.points
    entry.playerCount += 1
    byTeam.set(teamId, entry)
  }

  return [...byTeam.entries()]
    .map(([teamId, { points, playerCount }]) => ({
      teamId,
      points,
      playerCount,
    }))
    .sort((a, b) => b.points - a.points)
}
