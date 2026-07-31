// Focused unit tests for Flower Battle player-status store wiring (WP-946-C1).
import { afterEach, describe, expect, it } from "vitest"
import type { FlowerBattlePlayerStatus } from "@razzoozle/common/types/game/socket"
import { usePlayerStore } from "./player"

const GAME_A = "game-a"
const GAME_B = "game-b"

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

afterEach(() => {
  usePlayerStore.getState().reset()
})

describe("usePlayerStore flowerBattlePlayerStatus (WP-946-C1)", () => {
  it("accepts a matching live payload (route + store gameId)", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)

    const payload = makeStatus({ questionIndex: 1, sunPoints: 4 })
    store.receiveFlowerBattlePlayerStatus(payload, GAME_A)

    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(payload)
  })

  it("ignores a foreign gameId payload (route or store mismatch)", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(makeStatus({ questionIndex: 3 }))

    // Payload for another game while route still claims GAME_A.
    store.receiveFlowerBattlePlayerStatus(
      makeStatus({ gameId: GAME_B, questionIndex: 9, sunPoints: 99 }),
      GAME_A,
    )
    expect(usePlayerStore.getState().flowerBattlePlayerStatus?.questionIndex).toBe(
      3,
    )

    // Payload matches store but route expected id differs.
    store.receiveFlowerBattlePlayerStatus(
      makeStatus({ gameId: GAME_A, questionIndex: 9, sunPoints: 99 }),
      GAME_B,
    )
    expect(usePlayerStore.getState().flowerBattlePlayerStatus?.questionIndex).toBe(
      3,
    )
    expect(usePlayerStore.getState().flowerBattlePlayerStatus?.sunPoints).toBe(1)
  })

  it("ignores older and equal live revisions within the same game", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(
      makeStatus({ revision: "9", questionIndex: 5, sunPoints: 7 }),
    )

    store.receiveFlowerBattlePlayerStatus(
      makeStatus({ revision: "8", questionIndex: 6, sunPoints: 0 }),
      GAME_A,
    )
    store.receiveFlowerBattlePlayerStatus(
      makeStatus({ revision: "9", questionIndex: 6, sunPoints: 0 }),
      GAME_A,
    )

    const current = usePlayerStore.getState().flowerBattlePlayerStatus
    expect(current?.questionIndex).toBe(5)
    expect(current?.sunPoints).toBe(7)
  })

  it("accepts a higher revision at the same questionIndex to refresh activeEffects", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(
      makeStatus({
        revision: "10",
        questionIndex: 2,
        activeEffects: [],
      }),
    )

    const refreshed = makeStatus({
      revision: "11",
      questionIndex: 2,
      activeEffects: [{ kind: "sunbeam", expiresAfterQuestionId: 4 }],
      sunPoints: 3,
    })
    store.receiveFlowerBattlePlayerStatus(refreshed, GAME_A)

    const current = usePlayerStore.getState().flowerBattlePlayerStatus
    expect(current?.questionIndex).toBe(2)
    expect(current?.activeEffects).toEqual([
      { kind: "sunbeam", expiresAfterQuestionId: 4 },
    ])
    expect(current?.sunPoints).toBe(3)
  })

  it("uses revision rather than questionIndex to order matching live state", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(
      makeStatus({ revision: "9", questionIndex: 5, sunPoints: 1 }),
    )

    const newer = makeStatus({
      revision: "10",
      questionIndex: 4,
      sunPoints: 6,
    })
    store.receiveFlowerBattlePlayerStatus(newer, GAME_A)

    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(newer)
  })

  it("orders decimal revisions exactly beyond Number.MAX_SAFE_INTEGER", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(
      makeStatus({
        revision: "9007199254740992",
        questionIndex: 5,
        sunPoints: 1,
      }),
    )

    const newer = makeStatus({
      revision: "9007199254740993",
      questionIndex: 4,
      sunPoints: 6,
    })
    store.receiveFlowerBattlePlayerStatus(newer, GAME_A)

    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(newer)
  })

  it("rejects a non-canonical incoming revision without throwing", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    const current = makeStatus({ revision: "7", sunPoints: 4 })
    store.setFlowerBattlePlayerStatus(current)

    expect(() =>
      store.receiveFlowerBattlePlayerStatus(
        makeStatus({ revision: "07", sunPoints: 0 }),
        GAME_A,
      ),
    ).not.toThrow()
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(current)
  })

  it("hydrate sets the status on a full gameId match (payload ↔ expected ↔ store)", () => {
    // SUCCESS_RECONNECT carrying a Flower payload for the current game.
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)

    const payload = makeStatus({ questionIndex: 4, sunPoints: 2 })
    store.hydrateFlowerBattlePlayerStatus(payload, GAME_A)

    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(payload)
  })

  it("hydrate ignores a delayed reconnect snapshot after newer same-question live state", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)

    const staleReconnect = makeStatus({
      revision: "20",
      questionIndex: 2,
      sunPoints: 1,
      activeEffects: [],
      victoryResolved: false,
      winnerTeamIds: [],
      isWinner: false,
    })
    const newerLive = makeStatus({
      revision: "21",
      questionIndex: 2,
      sunPoints: 5,
      activeEffects: [{ kind: "sunbeam", expiresAfterQuestionId: 4 }],
      victoryResolved: true,
      winnerTeamIds: ["blue"],
      isWinner: true,
    })

    store.receiveFlowerBattlePlayerStatus(newerLive, GAME_A)
    store.hydrateFlowerBattlePlayerStatus(staleReconnect, GAME_A)

    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(
      newerLive,
    )

    store.hydrateFlowerBattlePlayerStatus(
      makeStatus({
        revision: "21",
        questionIndex: 2,
        sunPoints: 0,
        victoryResolved: false,
      }),
      GAME_A,
    )
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toEqual(
      newerLive,
    )
  })

  it("hydrate clears when the reconnect payload omits the field (Classic)", () => {
    // SUCCESS_RECONNECT without flowerBattlePlayerStatus → clear, so a prior
    // Flower session cannot leak into Classic.
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(makeStatus({ questionIndex: 4 }))
    store.receiveFlowerBattlePowerupOffered(
      {
        gameId: GAME_A,
        teamId: "blue",
        offer: {
          id: "offer-1",
          offerType: "fertilizer,umbrella_shield,acid_rain,sunbeam",
          expiresAt: 123,
        },
      },
      GAME_A,
    )
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).not.toBeNull()
    expect(usePlayerStore.getState().flowerBattlePowerup.offer).not.toBeNull()

    store.hydrateFlowerBattlePlayerStatus(undefined, GAME_A)
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toBeNull()
    expect(usePlayerStore.getState().flowerBattlePowerup.offer).toBeNull()
    expect(usePlayerStore.getState().flowerBattlePowerup.selection).toBeNull()
  })

  it("hydrate clears on gameId mismatch (payload vs expected or store)", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(makeStatus({ questionIndex: 4 }))

    // Payload belongs to a foreign game → cleared, not applied.
    store.hydrateFlowerBattlePlayerStatus(makeStatus({ gameId: GAME_B }), GAME_A)
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toBeNull()

    // Payload matches the store but not the expected (reconnect) gameId.
    store.setFlowerBattlePlayerStatus(makeStatus({ questionIndex: 4 }))
    store.hydrateFlowerBattlePlayerStatus(makeStatus(), GAME_B)
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toBeNull()
  })

  it("setGameId clears Flower status when the game id changes", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(makeStatus({ questionIndex: 3 }))
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).not.toBeNull()

    // Same id → status survives (reconnect keeps state until hydrate runs).
    store.setGameId(GAME_A)
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).not.toBeNull()

    // Different id → cleared so the new game cannot inherit Flower state.
    store.setGameId(GAME_B)
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toBeNull()
  })

  it("clears Flower status on join (new game) and reset", () => {
    const store = usePlayerStore.getState()
    store.setGameId(GAME_A)
    store.setFlowerBattlePlayerStatus(makeStatus({ questionIndex: 6 }))
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).not.toBeNull()

    store.join(GAME_B)
    expect(usePlayerStore.getState().gameId).toBe(GAME_B)
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toBeNull()

    // Re-seed then full reset (GAME.RESET / leave teardown).
    store.setFlowerBattlePlayerStatus(makeStatus({ gameId: GAME_B }))
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).not.toBeNull()

    store.reset()
    expect(usePlayerStore.getState().flowerBattlePlayerStatus).toBeNull()
    expect(usePlayerStore.getState().gameId).toBeNull()
  })
})
