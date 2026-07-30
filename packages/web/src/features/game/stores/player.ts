import type { StatusDataMap } from "@razzoozle/common/types/game/status"
import type {
  FlowerBattlePlayerStatus,
  RosterEntry,
} from "@razzoozle/common/types/game/socket"
import {
  createStatus,
  type Status,
} from "@razzoozle/web/features/game/utils/createStatus"
import { create } from "zustand"

interface PlayerState {
  username?: string
  points?: number
  avatar?: string
}

/** Snapshot of SUCCESS_ROOM so Username can apply klassen/roster after Room unmounts. */
export interface PendingRoom {
  gameId: string
  klassen: boolean
  roster: RosterEntry[]
  requireIdentifier: boolean
}

interface PlayerStore<T> {
  gameId: string | null
  player: PlayerState | null
  status: Status<T> | null
  /** Last SUCCESS_ROOM payload (consumed by Username on mount). */
  pendingRoom: PendingRoom | null
  /**
   * Personalized FlowerBattle status for this player socket (WP-946-C1).
   * Null outside Flower Battle or after clear/reset/join/route leave.
   */
  flowerBattlePlayerStatus: FlowerBattlePlayerStatus | null

  /** Changing the game id also drops Flower status (no cross-game leak). */
  setGameId: (_gameId: string | null) => void

  setPlayer: (_state: PlayerState) => void
  login: (_username: string) => void
  /**
   * Called when SUCCESS_ROOM arrives. Sets gameId + player shell so the auth
   * page swaps Room → Username, and stashes room flags for Username to read
   * (SUCCESS_ROOM is not re-emitted after the swap).
   */
  join: (_gameId: string, _room?: Partial<PendingRoom> | null) => void
  clearPendingRoom: () => void
  updatePoints: (_points: number) => void
  setAvatar: (_avatar: string) => void

  setStatus: <K extends keyof T>(_name: K, _data: T[K]) => void

  /** Unconditional write. Guarded paths prefer hydrate/receive. */
  setFlowerBattlePlayerStatus: (_status: FlowerBattlePlayerStatus) => void
  /** Drop Flower status so Classic/next game cannot retain it. */
  clearFlowerBattlePlayerStatus: () => void
  /**
   * Reconnect hydrate (WP-946-C1-R1). Sets only when the payload's gameId
   * matches both expectedGameId and the store gameId; clears on absent or
   * mismatch so a Classic reconnect or foreign payload cannot retain/leak
   * Flower state. Same-game non-increasing revisions are ignored.
   */
  hydrateFlowerBattlePlayerStatus: (
    _status: FlowerBattlePlayerStatus | undefined,
    _expectedGameId: string,
  ) => void
  /**
   * Live `game:flowerBattle:playerStatus` path.
   * Accepts only when payload.gameId equals both routeGameId and store gameId.
   * Same-game non-increasing revisions are ignored.
   */
  receiveFlowerBattlePlayerStatus: (
    _status: FlowerBattlePlayerStatus,
    _routeGameId: string,
  ) => void

  reset: () => void
}

const initialState = {
  gameId: null as string | null,
  player: null as PlayerState | null,
  status: null as Status<StatusDataMap> | null,
  pendingRoom: null as PendingRoom | null,
  flowerBattlePlayerStatus: null as FlowerBattlePlayerStatus | null,
}

const CANONICAL_REVISION = /^(0|[1-9]\d*)$/

function parseRevision(revision: string): bigint | null {
  if (
    typeof revision !== "string" ||
    !CANONICAL_REVISION.test(revision)
  ) {
    return null
  }
  return BigInt(revision)
}

function shouldIgnoreRevision(
  current: FlowerBattlePlayerStatus | null,
  incoming: FlowerBattlePlayerStatus,
): boolean {
  const incomingRevision = parseRevision(incoming.revision)
  if (incomingRevision === null) {
    return true
  }
  if (!current || current.gameId !== incoming.gameId) {
    return false
  }

  const currentRevision = parseRevision(current.revision)
  return currentRevision !== null && incomingRevision <= currentRevision
}

export const usePlayerStore = create<PlayerStore<StatusDataMap>>((set) => ({
  ...initialState,

  setGameId: (gameId) =>
    set((state) =>
      // A different game must not inherit Flower status from the prior one.
      state.gameId === gameId
        ? { gameId }
        : { gameId, flowerBattlePlayerStatus: null },
    ),

  setPlayer: (player: PlayerState) => set({ player }),
  login: (username) =>
    set((state) => ({
      player: { ...state.player, username },
    })),

  join: (gameId, room) => {
    const pendingRoom: PendingRoom | null = room
      ? {
          gameId,
          klassen: Boolean(room.klassen),
          roster: Array.isArray(room.roster) ? room.roster : [],
          requireIdentifier: Boolean(room.requireIdentifier),
        }
      : null
    set((state) => ({
      gameId,
      player: { ...state.player, points: 0 },
      pendingRoom,
      // New game must not inherit Flower status from a prior session.
      flowerBattlePlayerStatus: null,
    }))
  },

  clearPendingRoom: () => set({ pendingRoom: null }),

  updatePoints: (points) =>
    set((state) => ({
      player: { ...state.player, points },
    })),

  setAvatar: (avatar) =>
    set((state) => ({
      player: { ...state.player, avatar },
    })),

  setStatus: (name, data) => set({ status: createStatus(name, data) }),

  setFlowerBattlePlayerStatus: (status) =>
    set({ flowerBattlePlayerStatus: status }),

  clearFlowerBattlePlayerStatus: () =>
    set({ flowerBattlePlayerStatus: null }),

  hydrateFlowerBattlePlayerStatus: (status, expectedGameId) =>
    set((state) => {
      // Set only on a full match (payload ↔ expected ↔ store); otherwise
      // clear so absent (Classic) or mismatched state cannot survive.
      if (
        !status ||
        status.gameId !== expectedGameId ||
        status.gameId !== state.gameId
      ) {
        return { flowerBattlePlayerStatus: null }
      }

      if (shouldIgnoreRevision(state.flowerBattlePlayerStatus, status)) {
        return state
      }

      return { flowerBattlePlayerStatus: status }
    }),

  receiveFlowerBattlePlayerStatus: (status, routeGameId) =>
    set((state) => {
      // Live path: payload must match both the active route and store gameId.
      if (status.gameId !== routeGameId || status.gameId !== state.gameId) {
        return state
      }

      if (shouldIgnoreRevision(state.flowerBattlePlayerStatus, status)) {
        return state
      }

      return { flowerBattlePlayerStatus: status }
    }),

  reset: () => set(initialState),
}))
