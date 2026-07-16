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
  patchQuizzLabels: (_quizzId: string, _labelIds: number[]) => void
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
    // Check sessionStorage first
    let stored = window.sessionStorage.getItem(AUTH_STORAGE_KEY)

    // Migration: if not in sessionStorage but exists in localStorage, move it
    if (!stored) {
      const oldStored = window.localStorage.getItem(AUTH_STORAGE_KEY)
      if (oldStored) {
        window.sessionStorage.setItem(AUTH_STORAGE_KEY, oldStored)
        window.localStorage.removeItem(AUTH_STORAGE_KEY)
        stored = oldStored
      }
    }

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
      window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
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

    // #145: patch a single quiz's labelIds in place (label:assigned ack) so the
    // UI reflects an assign/remove immediately, without waiting for the next
    // full CONFIG refresh — and without a component-local copy of server state
    // that a refresh (or a remount racing ahead of it) can silently undo.
    // Server persistence already succeeded by the time this ack arrives; this
    // only keeps the client's own copy of config.quizz in sync with it.
    patchQuizzLabels: (quizzId, labelIds) =>
      set((state) =>
        state.config
          ? {
              config: {
                ...state.config,
                quizz: state.config.quizz.map((q) =>
                  q.id === quizzId ? { ...q, labelIds } : q,
                ),
              },
            }
          : {},
      ),

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
      // Reset game state only; preserve auth (token/role/username).
      // Only logout() should clear auth. This prevents accidental logout when
      // ending a game.
      const current = loadAuthState()
      set({
        config: initialState.config,
        gameId: initialState.gameId,
        inviteCode: initialState.inviteCode,
        status: initialState.status,
        players: initialState.players,
        password: initialState.password,
      })
      persistAuthState(current)
    },
  }
})
