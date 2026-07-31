// WP-946-C3 / #982 — player party route: conditional Flower HUD from typed
// store, stable contentTransitionKey, classic chrome preserved when store null.
//
// renderToStaticMarkup + store/socket/router mocks (vitest node env). No jsdom.
// Player store is mocked (zustand useSyncExternalStore is opaque under SSR
// static markup — getState mutations would not surface through the hook).

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { FlowerBattlePlayerStatus as FlowerBattlePlayerStatusData } from "@razzoozle/common/types/game/socket"
import type { Status } from "@razzoozle/common/types/game/status"
import { STATUS } from "@razzoozle/common/types/game/status"

// --- Controllable player store mock ----------------------------------------

type MockGameStatus = {
  name: Status
  data: unknown
}

type PlayerStoreSlice = {
  status: MockGameStatus | null
  flowerBattlePlayerStatus: FlowerBattlePlayerStatusData | null
  player: { username?: string; points?: number } | null
  setPlayer: ReturnType<typeof vi.fn>
  setGameId: ReturnType<typeof vi.fn>
  setStatus: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  hydrateFlowerBattlePlayerStatus: ReturnType<typeof vi.fn>
  receiveFlowerBattlePlayerStatus: ReturnType<typeof vi.fn>
  clearFlowerBattlePlayerStatus: ReturnType<typeof vi.fn>
}

const playerStore: PlayerStoreSlice = {
  status: null,
  flowerBattlePlayerStatus: null,
  player: { username: "Ada", points: 0 },
  setPlayer: vi.fn(),
  setGameId: vi.fn(),
  setStatus: vi.fn(),
  reset: vi.fn(),
  hydrateFlowerBattlePlayerStatus: vi.fn(),
  receiveFlowerBattlePlayerStatus: vi.fn(),
  clearFlowerBattlePlayerStatus: vi.fn(),
}

vi.mock("@razzoozle/web/features/game/stores/player", () => ({
  usePlayerStore: Object.assign(() => playerStore, {
    getState: () => playerStore,
  }),
}))

// --- Other mocks -----------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: { defaultValue?: string; [param: string]: unknown },
    ) => {
      if (!options?.defaultValue) return _key
      return Object.entries(options).reduce(
        (str, [k, v]) =>
          k === "defaultValue" ? str : str.replaceAll(`{{${k}}}`, String(v)),
        options.defaultValue,
      )
    },
  }),
}))

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({
      children,
      className,
      ...rest
    }: {
      children?: React.ReactNode
      className?: string
      [key: string]: unknown
    }) => (
      <div className={className} {...rest}>
        {children}
      </div>
    ),
    g: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode
      [key: string]: unknown
    }) => <g {...rest}>{children}</g>,
  },
  useReducedMotion: () => false,
  useMotionValue: (initial: number) => {
    let current = initial
    return {
      get: () => current,
      set: (value: number) => {
        current = value
      },
    }
  },
  animate: vi.fn(() => Promise.resolve()),
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: unknown }) => opts,
  useNavigate: () => vi.fn(),
  useParams: () => ({ gameId: "game-a" }),
}))

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  socketClient: { emit: vi.fn() },
  useSocket: () => ({ isConnected: true, socket: { emit: vi.fn() } }),
  useEvent: vi.fn(),
  useClockSync: vi.fn(),
}))

vi.mock("@razzoozle/web/features/game/stores/answer", () => ({
  useAnswerStore: (
    sel?: (s: { setAlreadyAnswered: () => void }) => unknown,
  ) => {
    const store = { setAlreadyAnswered: vi.fn() }
    return typeof sel === "function" ? sel(store) : store
  },
}))

vi.mock("@razzoozle/web/features/game/stores/lowLatency", () => ({
  useLowLatencyStore: (sel?: (s: { setActive: () => void }) => unknown) => {
    const store = { setActive: vi.fn() }
    return typeof sel === "function" ? sel(store) : store
  },
}))

vi.mock("@razzoozle/web/features/game/stores/question", () => ({
  useQuestionStore: () => ({
    questionStates: null,
    setQuestionStates: vi.fn(),
    setDisplayOrder: vi.fn(),
  }),
}))

vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({ reduced: true }),
  DURATION: { fast: 0.12, base: 0.24, instant: 0 },
  EASE: { out: [0.22, 1, 0.36, 1] },
}))

vi.mock("@razzoozle/web/features/game/utils/lowLatencyPref", () => ({
  getLowLatencyPref: () => false,
}))

vi.mock("@razzoozle/web/features/game/utils/firstCorrectSound", () => ({
  preloadFirstCorrectSound: vi.fn(),
}))

vi.mock("@razzoozle/web/components/Button", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/Loader", () => ({
  default: () => <div data-testid="loader" />,
}))

vi.mock("@razzoozle/web/features/manager/components/DisplayControl", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/features/manager/components/DisplayStatusCard", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/features/manager/components/SimControl", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/features/game/components/LowLatencyHealth", () => ({
  default: () => null,
}))
vi.mock(
  "@razzoozle/web/features/game/components/GameWrapper/AvToggles",
  () => ({ default: () => null }),
)
vi.mock(
  "@razzoozle/web/features/game/components/GameWrapper/RejoinQrDialog",
  () => ({ default: () => null }),
)
vi.mock(
  "@razzoozle/web/features/game/components/GameWrapper/GameControlPanel",
  () => ({ default: () => null }),
)

vi.mock("@razzoozle/web/features/game/utils/constants", async () => {
  const actual = await vi.importActual<
    typeof import("@razzoozle/web/features/game/utils/constants")
  >("@razzoozle/web/features/game/utils/constants")
  const Stub = ({ label }: { label: string }) => (
    <div data-testid={`state-${label}`}>{label}</div>
  )
  return {
    ...actual,
    GAME_STATE_COMPONENTS: {
      [STATUS.SELECT_ANSWER]: () => <Stub label="SELECT_ANSWER" />,
      [STATUS.SHOW_QUESTION]: () => <Stub label="SHOW_QUESTION" />,
      [STATUS.WAIT]: () => <Stub label="WAIT" />,
      [STATUS.SHOW_START]: () => <Stub label="SHOW_START" />,
      [STATUS.SHOW_RESULT]: () => <Stub label="SHOW_RESULT" />,
      [STATUS.SHOW_PREPARED]: () => <Stub label="SHOW_PREPARED" />,
      [STATUS.FINISHED]: () => <Stub label="FINISHED" />,
      [STATUS.PAUSED]: () => <Stub label="PAUSED" />,
    },
  }
})

vi.mock("@razzoozle/web/features/game/components/PluginRenderSlot", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/features/game/components/states/Ended", () => ({
  default: () => <div data-testid="state-ENDED">ended</div>,
}))

vi.mock("@razzoozle/web/features/game/components/states/Result", () => ({
  default: () => <div data-testid="state-SHOW_RESULT">result</div>,
}))

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: () => ({ gameId: null, inviteCode: null }),
}))

import { PlayerGamePage, isFlowerBattleGameplay } from "../$gameId"

const makeFlowerStatus = (
  overrides: Partial<FlowerBattlePlayerStatusData> = {},
): FlowerBattlePlayerStatusData => ({
  gameId: "game-a",
  revision: "1",
  questionIndex: 1,
  teamId: "blue",
  growthStage: 3,
  maxGrowthStage: 10,
  sunPoints: 1,
  activeEffects: [],
  victoryResolved: false,
  winnerTeamIds: [],
  isWinner: false,
  ...overrides,
})

const contentKeyOf = (html: string) => {
  const match = html.match(/data-content-transition-key="([^"]*)"/)
  expect(match).not.toBeNull()
  return match![1]
}

const setGameStatus = (name: Status, data: unknown = {}) => {
  playerStore.status = { name, data }
}

describe("PlayerGamePage Flower HUD integration (WP-946-C3)", () => {
  beforeEach(() => {
    playerStore.status = null
    playerStore.flowerBattlePlayerStatus = null
    playerStore.player = { username: "Ada", points: 0 }
  })

  it("renders FlowerBattlePlayerStatus only when the typed store has status", () => {
    setGameStatus(STATUS.SELECT_ANSWER)
    playerStore.flowerBattlePlayerStatus = makeFlowerStatus()

    const withStatus = renderToStaticMarkup(<PlayerGamePage />)
    expect(withStatus).toContain('data-testid="flower-battle-player-status"')
    expect(withStatus).toContain('data-testid="flower-battle-player-hud-slot"')
    // Human team label, not raw teamId.
    expect(withStatus).toContain("Team Blau")
    expect(withStatus).not.toContain("Team blue")
    expect(withStatus).not.toContain('data-testid="game-topbar"')

    playerStore.flowerBattlePlayerStatus = null
    const classic = renderToStaticMarkup(<PlayerGamePage />)
    expect(classic).not.toContain('data-testid="flower-battle-player-status"')
    expect(classic).not.toContain('data-testid="flower-battle-player-hud-slot"')
    expect(classic).toContain('data-testid="game-topbar"')
  })

  it("pins contentTransitionKey=flowerBattle across all gameplay phases", () => {
    playerStore.flowerBattlePlayerStatus = makeFlowerStatus()

    const phases = [
      STATUS.SHOW_QUESTION,
      STATUS.SELECT_ANSWER,
      STATUS.SHOW_RESULT,
      STATUS.PAUSED,
      STATUS.FINISHED,
    ] as const

    const keys = phases.map((name) => {
      setGameStatus(name)
      return contentKeyOf(renderToStaticMarkup(<PlayerGamePage />))
    })

    expect(keys).toEqual([
      "flowerBattle",
      "flowerBattle",
      "flowerBattle",
      "flowerBattle",
      "flowerBattle",
    ])
    expect(new Set(keys).size).toBe(1)

    setGameStatus(STATUS.SELECT_ANSWER)
    const html = renderToStaticMarkup(<PlayerGamePage />)
    expect(html).toContain('data-testid="flower-battle-player-hud-slot"')
    expect(html).toContain('data-testid="flower-battle-player-status"')
    expect(html).toContain('data-testid="state-SELECT_ANSWER"')
  })

  it("preserves centered non-game screen (WAIT / SHOW_START) without FLB HUD", () => {
    setGameStatus(STATUS.SHOW_START)
    expect(playerStore.flowerBattlePlayerStatus).toBeNull()

    const html = renderToStaticMarkup(<PlayerGamePage />)
    expect(html).toContain('data-testid="state-SHOW_START"')
    expect(html).toContain('data-testid="game-topbar"')
    expect(html).not.toContain('data-testid="flower-battle-player-status"')
    expect(contentKeyOf(html)).toBe(STATUS.SHOW_START)
    // Content shell remains vertically centered.
    expect(html).toContain("justify-center")

    setGameStatus(STATUS.WAIT, { text: "waiting", teamMode: false })
    const waitHtml = renderToStaticMarkup(<PlayerGamePage />)
    expect(waitHtml).toContain('data-testid="state-WAIT"')
    expect(waitHtml).toContain("justify-center")
    expect(contentKeyOf(waitHtml)).toBe(STATUS.WAIT)
  })

  it("classic route is unchanged when flowerBattlePlayerStatus is null", () => {
    setGameStatus(STATUS.SELECT_ANSWER)
    const html = renderToStaticMarkup(<PlayerGamePage />)

    expect(html).toContain('data-testid="game-topbar"')
    expect(html).not.toContain('data-testid="flower-battle-player-status"')
    expect(contentKeyOf(html)).toBe(STATUS.SELECT_ANSWER)

    const sectionMatch = html.match(/<section[^>]*class="([^"]*)"/)
    expect(sectionMatch).not.toBeNull()
    expect(sectionMatch![1]).toMatch(/(^|\s)min-h-dvh(\s|$)/)
    expect(sectionMatch![1]).toMatch(/(^|\s)w-full(\s|$)/)
    expect(sectionMatch![1]).not.toMatch(/(^|\s)h-dvh(\s|$)/)
  })

  it("portrait geometry invariants under Flower Battle gameplay HUD", () => {
    playerStore.flowerBattlePlayerStatus = makeFlowerStatus()
    setGameStatus(STATUS.SELECT_ANSWER)

    const html = renderToStaticMarkup(<PlayerGamePage />)
    const sectionMatch = html.match(/<section[^>]*class="([^"]*)"/)
    expect(sectionMatch).not.toBeNull()
    const sectionClass = sectionMatch![1]

    // Player (not presenter) geometry: min-h-dvh + full width, no h-dvh lock.
    expect(sectionClass).toMatch(/(^|\s)min-h-dvh(\s|$)/)
    expect(sectionClass).toMatch(/(^|\s)w-full(\s|$)/)
    expect(sectionClass).not.toMatch(/(^|\s)h-dvh(\s|$)/)

    // Compact HUD slot: constrained width, no grow, no top chrome.
    expect(html).toContain("max-w-md")
    expect(html).toContain("shrink-0")
    expect(html).not.toContain('data-testid="game-topbar"')
    expect(html).toContain("justify-center")
    expect(contentKeyOf(html)).toBe("flowerBattle")
    expect(html).toContain('data-testid="player-footer"')
  })

  // #982 / wp-b813aed8d3fc: the guarded reconnect hydrate (WP-946-C1-R1) can
  // fill the typed store BEFORE gameplay starts. Pre-game choreography phases
  // must keep classic chrome — centered screen, visible topbar, default
  // per-status transition key — despite the non-null flower status.
  describe("pre-gameplay phases with hydrated flower status (#982)", () => {
    const preGameplayPhases = [
      { name: STATUS.SHOW_START, data: { time: 5, subject: "Quiz" } },
      { name: STATUS.WAIT, data: { text: "waiting", teamMode: false } },
      {
        name: STATUS.SHOW_PREPARED,
        data: { totalAnswers: 4, questionNumber: 1 },
      },
    ] as const

    for (const phase of preGameplayPhases) {
      it(`keeps classic chrome on ${phase.name} despite non-null flower status`, () => {
        playerStore.flowerBattlePlayerStatus = makeFlowerStatus()
        setGameStatus(phase.name, phase.data)

        const html = renderToStaticMarkup(<PlayerGamePage />)

        // The pre-game screen itself renders, vertically centered.
        expect(html).toContain(`data-testid="state-${phase.name}"`)
        expect(html).toContain("justify-center")
        // Top chrome stays visible; the compact Flower HUD is NOT mounted.
        expect(html).toContain('data-testid="game-topbar"')
        expect(html).not.toContain(
          'data-testid="flower-battle-player-hud-slot"',
        )
        expect(html).not.toContain('data-testid="flower-battle-player-status"')
        // Default per-status transition key, not the pinned gameplay key.
        expect(contentKeyOf(html)).toBe(phase.name)
      })
    }

    it("flips to gameplay chrome only once a real gameplay phase arrives", () => {
      playerStore.flowerBattlePlayerStatus = makeFlowerStatus()

      setGameStatus(STATUS.SHOW_PREPARED, {
        totalAnswers: 4,
        questionNumber: 1,
      })
      const prepared = renderToStaticMarkup(<PlayerGamePage />)
      expect(prepared).toContain('data-testid="game-topbar"')
      expect(contentKeyOf(prepared)).toBe(STATUS.SHOW_PREPARED)

      setGameStatus(STATUS.SELECT_ANSWER)
      const gameplay = renderToStaticMarkup(<PlayerGamePage />)
      expect(gameplay).toContain('data-testid="flower-battle-player-hud-slot"')
      expect(gameplay).not.toContain('data-testid="game-topbar"')
      expect(contentKeyOf(gameplay)).toBe("flowerBattle")
    })
  })

  describe("isFlowerBattleGameplay predicate", () => {
    it("is false for SHOW_START / WAIT / SHOW_PREPARED even with non-null status", () => {
      for (const name of [
        STATUS.SHOW_START,
        STATUS.WAIT,
        STATUS.SHOW_PREPARED,
      ]) {
        expect(isFlowerBattleGameplay(name, makeFlowerStatus())).toBe(false)
      }
    })

    it("is true for gameplay phases when the typed store has status", () => {
      for (const name of [
        STATUS.SHOW_QUESTION,
        STATUS.SELECT_ANSWER,
        STATUS.SHOW_RESULT,
        STATUS.PAUSED,
        STATUS.FINISHED,
      ]) {
        expect(isFlowerBattleGameplay(name, makeFlowerStatus())).toBe(true)
      }
    })

    it("is false whenever the typed store or the phase is empty", () => {
      expect(isFlowerBattleGameplay(STATUS.SELECT_ANSWER, null)).toBe(false)
      expect(isFlowerBattleGameplay(null, makeFlowerStatus())).toBe(false)
      expect(isFlowerBattleGameplay(null, null)).toBe(false)
    })

    it("is false for SHOW_ROOM even with non-null flower status", () => {
      expect(isFlowerBattleGameplay(STATUS.SHOW_ROOM, makeFlowerStatus())).toBe(
        false,
      )
    })

    it("is false for unknown statuses even with non-null flower status", () => {
      expect(isFlowerBattleGameplay("SOME_UNKNOWN", makeFlowerStatus())).toBe(
        false,
      )
      expect(isFlowerBattleGameplay("SHOW_RESPONSES", makeFlowerStatus())).toBe(
        false,
      )
    })
  })
})
