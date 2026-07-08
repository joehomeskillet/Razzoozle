import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzoozle/common/types/game/status"
import type {
  PlayerManager,
} from "@razzoozle/socket/services/game/player-manager"
import type { RoundManager } from "@razzoozle/socket/services/game/round-manager"
import type { Server } from "@razzoozle/common/types/game/socket"

/**
 * Serialize the STABLE, durable game state for an at-rest snapshot.
 * Pure read — touches nothing about a running game, so normal gameplay is unchanged.
 * GameSnapshot type is imported from the caller (index.ts) to avoid circular deps.
 */
export function toSnapshotImpl(
  gameId: string,
  inviteCode: string,
  started: boolean,
  managerClientId: string,
  quizz: any,
  round: RoundManager,
  playerManager: PlayerManager,
): any {
  const roundSnapshot = round.toSnapshot()

  return {
    gameId,
    inviteCode,
    started,
    managerClientId,
    autoMode: roundSnapshot.autoMode,
    quizz,
    round: roundSnapshot,
    players: playerManager.toSnapshot(),
  }
}

/**
 * Helper to build a Game instance from snapshot state and set lastBroadcastStatus.
 */
export function prepareFromSnapshotImpl(
  snap: any,
): {
  lastBroadcastStatus: {
    name: Status
    data: StatusDataMap[Status]
  }
} {
  // Prime the resume view: reconnecting clients (manager + players) get the
  // leaderboard as their "current" status via the existing reconnect flow,
  // which falls back to lastBroadcastStatus.
  const leaderboard = snap.round.leaderboard
    .slice(0, 5)
    .map((p: any) => ({ ...p }))
  const lastBroadcastStatus = {
    name: STATUS.SHOW_LEADERBOARD,
    data: { oldLeaderboard: leaderboard, leaderboard },
  }

  return { lastBroadcastStatus }
}
