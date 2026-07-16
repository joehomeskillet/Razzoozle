import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useManagerStore } from "./manager"

describe("useManagerStore", () => {
  let sessionStorageData: Map<string, string>

  beforeEach(() => {
    // Set up sessionStorage mock
    sessionStorageData = new Map<string, string>()

    // Stub global window.sessionStorage for the test
    const sessionStorageMock = {
      getItem: (key: string) => sessionStorageData.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStorageData.set(key, value)
      },
      removeItem: (key: string) => sessionStorageData.delete(key),
      clear: () => sessionStorageData.clear(),
      length: 0,
      key: (_index: number) => null,
    }

    vi.stubGlobal("window", {
      ...global.window,
      sessionStorage: sessionStorageMock,
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    })

    // Reset store state
    useManagerStore.setState({
      config: null,
      gameId: null,
      inviteCode: null,
      status: null,
      players: [],
      password: null,
      token: null,
      role: null,
      username: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("reset()", () => {
    it("resets game state while preserving auth", () => {
      const store = useManagerStore.getState()

      // Set auth state
      store.setToken("test-token")
      store.setRole("admin")
      store.setUsername("testuser")

      // Set game state
      store.setGameId("game-123")
      store.setInviteCode("invite-456")
      store.setPlayers([{ id: "p1", name: "Player 1" } as any])
      store.setPassword("game-password")

      // Verify initial state is set
      const stateBeforeReset = useManagerStore.getState()
      expect(stateBeforeReset.token).toBe("test-token")
      expect(stateBeforeReset.role).toBe("admin")
      expect(stateBeforeReset.username).toBe("testuser")
      expect(stateBeforeReset.gameId).toBe("game-123")
      expect(stateBeforeReset.inviteCode).toBe("invite-456")
      expect(stateBeforeReset.players).toHaveLength(1)
      expect(stateBeforeReset.password).toBe("game-password")

      // Call reset()
      store.reset()

      // Verify game state is reset
      const stateAfterReset = useManagerStore.getState()
      expect(stateAfterReset.config).toBeNull()
      expect(stateAfterReset.gameId).toBeNull()
      expect(stateAfterReset.inviteCode).toBeNull()
      expect(stateAfterReset.status).toBeNull()
      expect(stateAfterReset.players).toEqual([])
      expect(stateAfterReset.password).toBeNull()

      // Verify auth state is preserved
      expect(stateAfterReset.token).toBe("test-token")
      expect(stateAfterReset.role).toBe("admin")
      expect(stateAfterReset.username).toBe("testuser")

      // Verify auth state is persisted correctly
      const stored = sessionStorageData.get("razzoozle_auth_state")
      expect(stored).toBeDefined()
      const parsed = JSON.parse(stored!)
      expect(parsed.token).toBe("test-token")
      expect(parsed.role).toBe("admin")
      expect(parsed.username).toBe("testuser")
    })

    it("preserves auth even when called without prior auth", () => {
      const store = useManagerStore.getState()

      // Set only game state (no auth)
      store.setGameId("game-123")
      store.setPlayers([{ id: "p1", name: "Player 1" } as any])

      // Call reset()
      store.reset()

      // Verify game state is reset
      const stateAfterReset = useManagerStore.getState()
      expect(stateAfterReset.gameId).toBeNull()
      expect(stateAfterReset.players).toEqual([])

      // Verify auth state is still null (preserved from initial state)
      expect(stateAfterReset.token).toBeNull()
      expect(stateAfterReset.role).toBeNull()
      expect(stateAfterReset.username).toBeNull()
    })
  })

  describe("patchQuizzLabels()", () => {
    it("updates labelIds for the matching quiz only, leaving others untouched", () => {
      const store = useManagerStore.getState()

      store.setConfig({
        quizz: [
          { id: "q1", subject: "Quiz 1", labelIds: [1] },
          { id: "q2", subject: "Quiz 2", labelIds: [2] },
        ],
        results: [],
        submissions: [],
      })

      store.patchQuizzLabels("q1", [1, 3])

      const { config } = useManagerStore.getState()
      expect(config?.quizz.find((q) => q.id === "q1")?.labelIds).toEqual([1, 3])
      expect(config?.quizz.find((q) => q.id === "q2")?.labelIds).toEqual([2])
    })

    it("is a no-op when config is not yet loaded", () => {
      const store = useManagerStore.getState()

      expect(useManagerStore.getState().config).toBeNull()
      expect(() => store.patchQuizzLabels("q1", [1])).not.toThrow()
      expect(useManagerStore.getState().config).toBeNull()
    })
  })

  describe("logout()", () => {
    it("clears all auth state", () => {
      const store = useManagerStore.getState()

      // Set auth state
      store.setToken("test-token")
      store.setRole("admin")
      store.setUsername("testuser")

      // Verify auth is set
      let state = useManagerStore.getState()
      expect(state.token).toBe("test-token")
      expect(state.role).toBe("admin")
      expect(state.username).toBe("testuser")

      // Call logout()
      store.logout()

      // Verify auth is cleared
      state = useManagerStore.getState()
      expect(state.token).toBeNull()
      expect(state.role).toBeNull()
      expect(state.username).toBeNull()

      // Verify persisted auth is also cleared
      const stored = sessionStorageData.get("razzoozle_auth_state")
      expect(stored).toBeDefined()
      const parsed = JSON.parse(stored!)
      expect(parsed.token).toBeNull()
      expect(parsed.role).toBeNull()
      expect(parsed.username).toBeNull()
    })

    it("clears auth without affecting logout-specific behavior", () => {
      const store = useManagerStore.getState()

      // Set both auth and game state
      store.setToken("test-token")
      store.setRole("admin")
      store.setUsername("testuser")
      store.setGameId("game-123")
      store.setPlayers([{ id: "p1", name: "Player 1" } as any])

      // Call logout()
      store.logout()

      // Verify only auth is cleared
      const state = useManagerStore.getState()
      expect(state.token).toBeNull()
      expect(state.role).toBeNull()
      expect(state.username).toBeNull()
    })
  })
})
