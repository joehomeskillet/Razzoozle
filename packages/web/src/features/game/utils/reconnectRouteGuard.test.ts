// Regression tests for SUCCESS_RECONNECT route-boundary guard (#978).
import { afterEach, describe, expect, it } from "vitest"
import type { FlowerBattlePlayerStatus } from "@razzoozle/common/types/game/socket"
import { STATUS } from "@razzoozle/common/types/game/status"
import { usePlayerStore } from "../stores/player"
import { isReconnectForActiveRoute } from "./reconnectRouteGuard"

const GAME_A = "game-a"
const GAME_B = "game-b"

function makeStatus(
  overrides: Partial<FlowerBattlePlayerStatus> = {},
): FlowerBattlePlayerStatus {
  return {
    gameId: GAME_A,
    questionIndex: 2,
    teamId: "blue",
    growthStage: 3,
    maxGrowthStage: 10,
    sunPoints: 1,
    activeEffects: [],
    victoryResolved: false,
    winnerTeamIds: [],
    isWinner: false,
    ...overrides,
  }
}

afterEach(() => {
  usePlayerStore.getState().reset()
})

describe("isReconnectForActiveRoute (#978)", () => {
  it("accepts when reconnect gameId matches the active route", () => {
    expect(isReconnectForActiveRoute(GAME_B, GAME_B)).toBe(true)
  })

  it("rejects mismatch, missing route, and empty route id", () => {
    expect(isReconnectForActiveRoute(GAME_B, GAME_A)).toBe(false)
    expect(isReconnectForActiveRoute(undefined, GAME_A)).toBe(false)
    expect(isReconnectForActiveRoute("", GAME_A)).toBe(false)
  })
})

describe("SUCCESS_RECONNECT route apply sequence (#978)", () => {
  /**
   * Mirrors party/$gameId SUCCESS_RECONNECT control flow: guard first, then
   * timeout clear + store writes only on match. Hydrate uses gameIdParam.
   */
  function applySuccessReconnectLikeRoute(args: {
    routeGameId: string | undefined
    reconnectGameId: string
    flowerBattlePlayerStatus: FlowerBattlePlayerStatus | undefined
    player: { username: string; points: number }
    timeoutCleared: { value: boolean }
  }): boolean {
    const {
      routeGameId,
      reconnectGameId,
      flowerBattlePlayerStatus,
      player,
      timeoutCleared,
    } = args

    // Invariant: reject before clearing timeout and before ANY store writes.
    if (!isReconnectForActiveRoute(routeGameId, reconnectGameId)) {
      return false
    }

    timeoutCleared.value = true

    const store = usePlayerStore.getState()
    // After match, route id is authoritative (not the envelope field alone).
    store.setGameId(routeGameId!)
    store.setStatus(STATUS.SHOW_QUESTION, {
      currentQuestion: 1,
      question: { text: "q", answers: [] },
    } as never)
    store.setPlayer(player)
    store.hydrateFlowerBattlePlayerStatus(
      flowerBattlePlayerStatus,
      routeGameId!,
    )
    return true
  }

  it("active route/store B + SUCCESS_RECONNECT envelope A leaves B unchanged and never hydrates A", () => {
    const store = usePlayerStore.getState()
    const statusB = makeStatus({
      gameId: GAME_B,
      questionIndex: 5,
      sunPoints: 7,
      teamId: "red",
    })
    store.setGameId(GAME_B)
    store.setPlayer({ username: "bob", points: 42 })
    store.setStatus(STATUS.SHOW_QUESTION, {
      currentQuestion: 3,
      question: { text: "keep-me", answers: [] },
    } as never)
    store.setFlowerBattlePlayerStatus(statusB)

    const snapshotBefore = {
      gameId: usePlayerStore.getState().gameId,
      player: usePlayerStore.getState().player,
      flower: usePlayerStore.getState().flowerBattlePlayerStatus,
      statusName: usePlayerStore.getState().status?.name,
    }

    const timeoutCleared = { value: false }
    const statusA = makeStatus({
      gameId: GAME_A,
      questionIndex: 99,
      sunPoints: 99,
      teamId: "blue",
    })

    const applied = applySuccessReconnectLikeRoute({
      routeGameId: GAME_B,
      reconnectGameId: GAME_A,
      flowerBattlePlayerStatus: statusA,
      player: { username: "alice-from-a", points: 1 },
      timeoutCleared,
    })

    expect(applied).toBe(false)
    expect(timeoutCleared.value).toBe(false)

    const after = usePlayerStore.getState()
    expect(after.gameId).toBe(GAME_B)
    expect(after.player).toEqual(snapshotBefore.player)
    expect(after.flowerBattlePlayerStatus).toEqual(statusB)
    expect(after.flowerBattlePlayerStatus?.gameId).toBe(GAME_B)
    expect(after.flowerBattlePlayerStatus?.questionIndex).toBe(5)
    expect(after.status?.name).toBe(snapshotBefore.statusName)
    // Never hydrated A.
    expect(after.flowerBattlePlayerStatus?.sunPoints).not.toBe(99)
    expect(after.player?.username).not.toBe("alice-from-a")
  })

  it("matching SUCCESS_RECONNECT for active route B applies hydrate with gameIdParam", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_B)

    const statusB = makeStatus({
      gameId: GAME_B,
      questionIndex: 4,
      sunPoints: 2,
    })
    const timeoutCleared = { value: false }

    const applied = applySuccessReconnectLikeRoute({
      routeGameId: GAME_B,
      reconnectGameId: GAME_B,
      flowerBattlePlayerStatus: statusB,
      player: { username: "bob", points: 10 },
      timeoutCleared,
    })

    expect(applied).toBe(true)
    expect(timeoutCleared.value).toBe(true)
    expect(usePlayerStore.getState().gameId).toBe(GAME_B)
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(statusB)
    expect(usePlayerStore.getState().player?.username).toBe("bob")
  })
})
