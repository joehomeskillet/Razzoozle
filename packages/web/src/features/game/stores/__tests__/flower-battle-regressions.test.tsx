import type { FlowerBattlePlayerStatus } from "@razzoozle/common/types/game/socket"
import { afterEach, describe, expect, it } from "vitest"
import { usePlayerStore } from "../player"

const GAME_A = "flower-game-a"
const GAME_B = "flower-game-b"

function makeStatus(
  overrides: Partial<FlowerBattlePlayerStatus> = {},
): FlowerBattlePlayerStatus {
  return {
    gameId: GAME_A,
    revision: "1",
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

const offer = {
  id: "offer-regression",
  offerType: "fertilizer,umbrella_shield,acid_rain,sunbeam",
  expiresAt: 123,
}

afterEach(() => {
  usePlayerStore.getState().reset()
})

describe("Flower Battle regression gates", () => {
  it("drops a live player status when the game id mismatches", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    const current = makeStatus({ questionIndex: 4 })
    store.setFlowerBattlePlayerStatus(current)

    store.receiveFlowerBattlePlayerStatus(
      makeStatus({ gameId: GAME_B, questionIndex: 9 }),
      GAME_A,
    )

    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(current)
  })

  it("hydrates a matching reconnect payload", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    const payload = makeStatus({ questionIndex: 6, sunPoints: 2 })

    store.hydrateFlowerBattlePlayerStatus(payload, GAME_A)

    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(payload)
  })

  it("clears status and powerup state on a completed game envelope", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(makeStatus())
    store.receiveFlowerBattlePowerupOffered(
      { gameId: GAME_A, teamId: "blue", offer },
      GAME_A,
    )
    expect(usePlayerStore.getState().flowerBattlePowerup.offer).toEqual(offer)

    store.receiveFlowerBattlePowerupApplied({ gameId: GAME_A }, GAME_A)

    expect(usePlayerStore.getState().flowerBattlePowerup).toEqual({
      offer: null,
      selection: null,
    })
  })

  it("hydrates a reconnect snapshot without losing its powerup offer", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(makeStatus())
    store.receiveFlowerBattlePowerupOffered(
      { gameId: GAME_A, teamId: "blue", offer },
      GAME_A,
    )
    const payload = makeStatus({ revision: "2", questionIndex: 7 })

    store.hydrateFlowerBattlePlayerStatus(payload, GAME_A)

    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(payload)
    expect(usePlayerStore.getState().flowerBattlePowerup.offer).toEqual(offer)
  })

  it("does not hydrate a payload for a foreign expected game", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(makeStatus())

    store.hydrateFlowerBattlePlayerStatus(makeStatus(), GAME_B)

    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toBeNull()
  })

  it("marks an unresolved status as not victory-resolved for the gate", () => {
    const status = makeStatus({ victoryResolved: false })
    expect(status.victoryResolved).toBe(false)
  })
})
