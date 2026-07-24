import type { StatusDataMap } from "@razzoozle/common/types/game/status"
import type { RosterEntry } from "@razzoozle/common/types/game/socket"
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

  reset: () => void
}

const initialState = {
  gameId: null as string | null,
  player: null as PlayerState | null,
  status: null as Status<StatusDataMap> | null,
  pendingRoom: null as PendingRoom | null,
}

export const usePlayerStore = create<PlayerStore<StatusDataMap>>((set) => ({
  ...initialState,

  setGameId: (gameId) => set({ gameId }),

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

  reset: () => set(initialState),
}))
