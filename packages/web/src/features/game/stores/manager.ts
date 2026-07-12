import type { Player } from "@razzoozle/common/types/game"
import type { StatusDataMap } from "@razzoozle/common/types/game/status"
import type { ManagerConfig } from "@razzoozle/common/types/manager"
import {
  createStatus,
  type Status,
} from "@razzoozle/web/features/game/utils/createStatus"
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

  // Auth token, role, and username from login
  token: string | null
  role: "admin" | "user" | null
  username: string | null

  setConfig: (_config: ManagerConfig) => void
  setGameId: (_gameId: string | null) => void
  setInviteCode: (_inviteCode: string | null) => void
  setStatus: <K extends keyof T>(_name: K, _data: T[K]) => void
  resetStatus: () => void
  setPlayers: (_players: Player[]) => void
  setPassword: (_password: string) => void

  setToken: (_token: string) => void
  setRole: (_role: "admin" | "user") => void
  setUsername: (_username: string) => void
  logout: () => void

  reset: () => void
}

const initialState = {
  config: null,
  gameId: null,
  inviteCode: null,
  status: null,
  players: [],
  password: null,
  token: null,
  role: null,
  username: null,
}

const AUTH_STORAGE_KEY = "razzoozle_auth_state"

interface StoredAuthState {
  token: string | null
  role: "admin" | "user" | null
  username: string | null
}

const loadAuthState = (): StoredAuthState => {
  try {
    if (typeof window === "undefined") {
      return { token: null, role: null, username: null }
    }
    const stored = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) {
      return { token: null, role: null, username: null }
    }
    const parsed = JSON.parse(stored)
    return {
      token: parsed.token ?? null,
      role: parsed.role ?? null,
      username: parsed.username ?? null,
    }
  } catch {
    return { token: null, role: null, username: null }
  }
}

const persistAuthState = (state: StoredAuthState) => {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
    }
  } catch {
    // Ignore storage errors (private mode / quota)
  }
}

export const useManagerStore = create<ManagerStore<StatusDataMap>>((set) => {
  const authState = loadAuthState()

  return {
    ...initialState,
    ...authState,

    setConfig: (config) => set({ config }),

    setGameId: (gameId) => set({ gameId }),

    setInviteCode: (inviteCode) => set({ inviteCode }),

    setStatus: (name, data) => set({ status: createStatus(name, data) }),
    resetStatus: () => set({ status: null }),

    setPlayers: (players) => set({ players }),
    setPassword: (password) => set({ password }),

    setToken: (token) => {
      set({ token })
      persistAuthState({ token, role: null, username: null })
    },

    setRole: (role) => {
      set({ role })
      const current = loadAuthState()
      persistAuthState({ token: current.token, role, username: current.username })
    },

    setUsername: (username) => {
      set({ username })
      const current = loadAuthState()
      persistAuthState({ token: current.token, role: current.role, username })
    },

    logout: () => {
      set({ token: null, role: null, username: null })
      persistAuthState({ token: null, role: null, username: null })
    },

    reset: () => {
      set(initialState)
      persistAuthState({ token: null, role: null, username: null })
    },
  }
})
