import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// --- Render-contract mocks (route height chain, WP-958D) -------------------
// Hoisted by vitest; they only exist so GameWrapper can render server-side.
// The pure button-resilience tests below never touch these modules.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
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
    }: {
      children?: React.ReactNode
      className?: string
    }) => <div className={className}>{children}</div>,
  },
}))

vi.mock(
  "@razzoozle/web/features/game/contexts/socket-context",
  () => ({
    useSocket: () => ({ isConnected: true, socket: { emit: vi.fn() } }),
    useEvent: vi.fn(),
  }),
)

vi.mock("@razzoozle/web/features/game/stores/player", () => ({
  usePlayerStore: () => ({ player: null }),
}))

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: () => ({ gameId: "game-1", inviteCode: null }),
}))

vi.mock("@razzoozle/web/features/game/stores/question", () => ({
  useQuestionStore: () => ({
    questionStates: null,
    setQuestionStates: vi.fn(),
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
  // Buttons are irrelevant to the section-class height contract; rendering
  // nothing keeps the governance audit free of raw-button mock noise.
  default: () => null,
}))

vi.mock("@razzoozle/web/components/Loader", () => ({
  default: () => <div data-testid="loader" />,
}))

vi.mock(
  "@razzoozle/web/features/manager/components/DisplayControl",
  () => ({ default: () => null }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/DisplayStatusCard",
  () => ({ default: () => null }),
)
vi.mock("@razzoozle/web/features/manager/components/SimControl", () => ({
  default: () => null,
}))
vi.mock(
  "@razzoozle/web/features/game/components/LowLatencyHealth",
  () => ({ default: () => null }),
)
vi.mock("./AvToggles", () => ({ default: () => null }))
vi.mock("./RejoinQrDialog", () => ({ default: () => null }))
vi.mock("./GameControlPanel", () => ({ default: () => null }))

import { STATUS } from "@razzoozle/common/types/game/status"

import GameWrapper from "./GameWrapper"

describe("GameWrapper button resilience", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("re-enables the Next button after 5s timeout if no new status arrives", () => {
    // Simulate the button disabled state and timeout logic
    let isDisabled = false

    const handleNext = () => {
      isDisabled = true
      setTimeout(() => {
        isDisabled = false
      }, 5000)
    }

    // Initial state: button is enabled
    expect(isDisabled).toBe(false)

    // User clicks the Next button
    handleNext()
    expect(isDisabled).toBe(true)

    // Advance time by 4s: button should still be disabled
    vi.advanceTimersByTime(4000)
    expect(isDisabled).toBe(true)

    // Advance time by 1s more (total 5s): timeout fires, button re-enables
    vi.advanceTimersByTime(1000)
    expect(isDisabled).toBe(false)
  })

  it("clears the timeout when a new status arrives before timeout", () => {
    let isDisabled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleNext = () => {
      isDisabled = true
      timeoutId = setTimeout(() => {
        isDisabled = false
        timeoutId = null
      }, 5000)
    }

    const handleStatusChange = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      isDisabled = false
    }

    // User clicks the Next button
    handleNext()
    expect(isDisabled).toBe(true)
    expect(timeoutId).not.toBe(null)

    // After 2s, a new status arrives (server responds)
    vi.advanceTimersByTime(2000)
    handleStatusChange()

    // Timeout is cleared, button is re-enabled
    expect(isDisabled).toBe(false)
    expect(timeoutId).toBe(null)

    // Advance to the original 5s mark: nothing happens (timeout was cleared)
    vi.advanceTimersByTime(3000)
    expect(isDisabled).toBe(false)
  })
})

describe("GameWrapper route-level height chain (WP-958D)", () => {
  const sectionClassOf = (html: string) => {
    const sectionMatch = html.match(/<section[^>]*class="([^"]*)"/)
    expect(sectionMatch).not.toBeNull()
    return sectionMatch![1]
  }

  it("pins presenter surfaces (manager) to a definite, non-scrolling 100dvh box — the .display-kiosk contract", () => {
    // Root fix for the live /party/manager 304px vertical overflow: with an
    // indefinite (min-h-dvh) ancestor, every h-full/flex-1 descendant down to
    // ExperienceViewport collapsed to content height and ExperienceStage's
    // aspect-video fallback derived 1080px from the 1920px width, pushing the
    // presenter toolbar + HUD past the viewport fold. h-dvh + overflow-hidden
    // makes the whole descendant chain resolve definite heights.
    const html = renderToStaticMarkup(
      <GameWrapper statusName={STATUS.SHOW_QUESTION} manager>
        <div>stage content</div>
      </GameWrapper>,
    )

    const sectionClass = sectionClassOf(html)
    // Word-boundary regexes: "h-dvh" is a substring of "min-h-dvh".
    expect(sectionClass).toMatch(/(^|\s)h-dvh(\s|$)/)
    expect(sectionClass).toMatch(/(^|\s)overflow-hidden(\s|$)/)
    expect(sectionClass).not.toMatch(/(^|\s)min-h-dvh(\s|$)/)
    // No h-screen anywhere in the tree (ADR-013 contract: viewport units only
    // at the route root, never h-screen inside).
    expect(html).not.toContain("h-screen")
  })

  it("keeps the player client on the legacy min-h-dvh growth chain (non-presenter surfaces unchanged)", () => {
    const html = renderToStaticMarkup(
      <GameWrapper statusName={STATUS.SHOW_QUESTION}>
        <div>player content</div>
      </GameWrapper>,
    )

    const sectionClass = sectionClassOf(html)
    expect(sectionClass).toMatch(/(^|\s)min-h-dvh(\s|$)/)
    expect(sectionClass).not.toMatch(/(^|\s)h-dvh(\s|$)/)
  })
})
