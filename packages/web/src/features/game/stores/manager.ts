import type { Player } from "@razzia/common/types/game"
import type { StatusDataMap } from "@razzia/common/types/game/status"
import type { ManagerConfig } from "@razzia/common/types/manager"
import {
  createStatus,
  type Status,
} from "@razzia/web/features/game/utils/createStatus"
import { create } from "zustand"

interface ManagerStore<T> {
  config: ManagerConfig | null

  gameId: string | null
  inviteCode: string | null
  status: Status<T> | null
  players: Player[]
  // Kept in-memory only (never persisted) so the satellite-display pairing UI
  // can authenticate the pairing without re-prompting.
  password: string | null

  setConfig: (_config: ManagerConfig) => void
  setGameId: (_gameId: string | null) => void
  setInviteCode: (_inviteCode: string | null) => void
  setStatus: <K extends keyof T>(_name: K, _data: T[K]) => void
  resetStatus: () => void
  setPlayers: (_players: Player[]) => void
  setPassword: (_password: string) => void

  reset: () => void
}

const initialState = {
  config: null,
  gameId: null,
  inviteCode: null,
  status: null,
  players: [],
  password: null,
}

export const useManagerStore = create<ManagerStore<StatusDataMap>>((set) => ({
  ...initialState,

  setConfig: (config) => set({ config }),

  setGameId: (gameId) => set({ gameId }),

  setInviteCode: (inviteCode) => set({ inviteCode }),

  setStatus: (name, data) => set({ status: createStatus(name, data) }),
  resetStatus: () => set({ status: null }),

  setPlayers: (players) => set({ players }),
  setPassword: (password) => set({ password }),

  reset: () => set(initialState),
}))
