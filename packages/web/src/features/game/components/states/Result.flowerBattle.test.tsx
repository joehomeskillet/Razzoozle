import type { FlowerBattlePlayerStatus } from "@razzoozle/common/types/game/socket"
import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import Result from "./Result"

const playerStore: {
  flowerBattlePlayerStatus: FlowerBattlePlayerStatus | null
  updatePoints: ReturnType<typeof vi.fn>
} = {
  flowerBattlePlayerStatus: null,
  updatePoints: vi.fn(),
}

vi.mock("@razzoozle/web/features/game/stores/player", () => ({
  usePlayerStore: () => playerStore,
}))

vi.mock("@razzoozle/web/features/game/stores/answer", () => ({
  useAnswerStore: (
    selector: (state: {
      submittedText?: string
      submittedNumber?: number
      submittedSlotIndices?: number[]
      submittedChunks?: string[]
    }) => unknown,
  ) => selector({}),
}))

vi.mock("@razzoozle/web/features/game/stores/sound", () => ({
  useSoundStore: (selector: (state: { muted: boolean }) => unknown) =>
    selector({ muted: true }),
}))

vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    pop: () => ({}),
    reduced: true,
    snap: {},
  }),
}))

vi.mock("@razzoozle/web/features/game/utils/sfx", () => ({
  useSoundUrl: () => "/sounds/mock.mp3",
}))

vi.mock("@razzoozle/web/features/game/utils/firstCorrectSound", () => ({
  playFirstCorrectSound: vi.fn(),
}))

vi.mock("@razzoozle/web/features/game/utils/haptics", () => ({
  hapticAchievement: vi.fn(),
  hapticError: vi.fn(),
  hapticSuccess: vi.fn(),
  hapticWin: vi.fn(),
}))

vi.mock("@razzoozle/web/features/game/utils/achievementsStore", () => ({
  persistAchievements: vi.fn(),
}))

vi.mock("@razzoozle/web/features/game/utils/confetti", () => ({
  fireTierConfetti: vi.fn(),
}))

vi.mock("@razzoozle/web/features/game/components/icons/CricleCheck", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/features/game/components/icons/CricleXmark", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/features/game/components/RewardStack", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/features/game/recap/RoundRecapStrip", () => ({
  default: () => null,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { rank?: number }) =>
      key.startsWith("game:rank.") ? `rank:${options?.rank}` : key,
  }),
}))

vi.mock("use-sound", () => ({
  default: () => [vi.fn()],
}))

type ShowResult = CommonStatusDataMap["SHOW_RESULT"]
type Audience = "player" | "manager" | undefined

const baseResult: ShowResult = {
  correct: true,
  message: "Correct",
  points: 100,
  myPoints: 100,
  rank: 2,
  aheadOfMe: null,
  playerCount: 3,
}

function makeFlowerStatus(victoryResolved: boolean): FlowerBattlePlayerStatus {
  return {
    gameId: "game-a",
    revision: "1",
    questionIndex: 2,
    teamId: "blue",
    growthStage: 3,
    maxGrowthStage: 10,
    sunPoints: 1,
    activeEffects: [],
    victoryResolved,
    winnerTeamIds: victoryResolved ? ["blue"] : [],
    isWinner: victoryResolved,
  }
}

function render(audience: Audience): string {
  return renderToStaticMarkup(<Result audience={audience} data={baseResult} />)
}

describe("Result Flower Battle rank visibility", () => {
  beforeEach(() => {
    playerStore.flowerBattlePlayerStatus = null
    playerStore.updatePoints.mockClear()
  })

  it.each([
    {
      label: "hides a mid-game Flower Battle rank from the player",
      audiences: ["player"] satisfies Audience[],
      flowerStatus: makeFlowerStatus(false),
      showsRank: false,
    },
    {
      label: "keeps the classic player rank when Flower Battle status is null",
      audiences: ["player"] satisfies Audience[],
      flowerStatus: null,
      showsRank: true,
    },
    {
      label: "shows the terminal Flower Battle rank after victory resolves",
      audiences: ["player"] satisfies Audience[],
      flowerStatus: makeFlowerStatus(true),
      showsRank: true,
    },
    {
      label: "leaves manager and presenter rank visibility unchanged",
      audiences: ["manager", undefined] satisfies Audience[],
      flowerStatus: makeFlowerStatus(false),
      showsRank: true,
    },
  ])("$label", ({ audiences, flowerStatus, showsRank }) => {
    playerStore.flowerBattlePlayerStatus = flowerStatus

    for (const audience of audiences) {
      expect(render(audience).includes("rank:2")).toBe(showsRank)
    }
  })
})
