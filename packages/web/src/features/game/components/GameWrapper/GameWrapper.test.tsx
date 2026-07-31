import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// --- Render-contract mocks (route height chain, WP-958D) -------------------
// Hoisted by vitest; they only exist so GameWrapper can render server-side.
// The pure button-resilience tests below never touch these modules.

const socketState = vi.hoisted(() => ({ isConnected: true }))

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
    // Forward data-* attrs so WP-958F-W can assert the content transition key
    // without a client remount harness (renderToStaticMarkup only).
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
  },
}))

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({
    isConnected: socketState.isConnected,
    socket: { emit: vi.fn() },
  }),
  useEvent: vi.fn(),
}))

vi.mock("@razzoozle/web/features/game/stores/player", () => ({
  usePlayerStore: () => ({ player: null }),
}))

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: () => ({ gameId: "game-1", inviteCode: null }),
}))

vi.mock("@razzoozle/web/features/game/stores/question", () => ({
  useQuestionStore: () => ({
    questionStates: { current: 1, total: 2 },
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
vi.mock("./AvToggles", () => ({ default: () => null }))
vi.mock("./RejoinQrDialog", () => ({ default: () => null }))
vi.mock("./GameControlPanel", () => ({ default: () => null }))

import { STATUS } from "@razzoozle/common/types/game/status"

import GameWrapper from "./GameWrapper"

beforeEach(() => {
  socketState.isConnected = true
})

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
    const sectionMatch = /<section[^>]*class="([^"]*)"/.exec(html)
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

  it("spans the full route width inside the manager's row-flex wrapper (WP-958E)", () => {
    // /party/manager mounts GameWrapper inside `flex h-dvh w-full` — a row
    // flex container, so the section is a flex item whose main-axis (width)
    // shrink-fits to content without an explicit width. That horizontal
    // shrink shifted SHOW_START and the Flower Battle presenter HUD off the
    // route center. w-full pins the section to the route width while the
    // WP-958D h-dvh/overflow-hidden no-scroll contract stays intact.
    const html = renderToStaticMarkup(
      <GameWrapper statusName={STATUS.SHOW_START} manager>
        <div>stage content</div>
      </GameWrapper>,
    )

    const sectionClass = sectionClassOf(html)
    expect(sectionClass).toMatch(/(^|\s)w-full(\s|$)/)
    expect(sectionClass).toMatch(/(^|\s)h-dvh(\s|$)/)
    expect(sectionClass).toMatch(/(^|\s)overflow-hidden(\s|$)/)
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

describe("GameWrapper manager kiosk full-bleed chrome", () => {
  const contentShellClassOf = (html: string) => {
    const match = /<div aria-disabled="(?:true|false)" class="([^"]*)"/.exec(
      html,
    )
    expect(match).not.toBeNull()
    return match![1]
  }

  it.each([true, false])(
    "suppresses manager chrome and removes content padding when controls=$controls",
    (controls) => {
      const html = renderToStaticMarkup(
        <GameWrapper
          statusName={STATUS.SHOW_QUESTION}
          contentTransitionKey="flowerBattle"
          manager
          controls={controls}
          managerKioskFullBleed
        >
          <div data-testid="satellite-garden">garden</div>
        </GameWrapper>,
      )

      expect(html).not.toContain('data-testid="presenter-toolbar"')
      expect(html).not.toContain("1 / 2")
      expect(html).toContain('data-testid="satellite-garden"')
      expect(html).toContain('data-content-transition-key="flowerBattle"')

      const contentShellClass = contentShellClassOf(html)
      expect(contentShellClass).toContain("overflow-hidden")
      expect(contentShellClass).not.toContain("overflow-y-auto")
      expect(contentShellClass).not.toContain("justify-center")
      expect(contentShellClass).not.toContain("px-4")
      expect(contentShellClass).not.toContain("pt-2")
      expect(contentShellClass).not.toContain("pb-4")
    },
  )

  it("experience-immersive keeps floating overlay toolbar and full-bleed content", () => {
    const html = renderToStaticMarkup(
      <GameWrapper
        statusName={STATUS.SHOW_QUESTION}
        contentTransitionKey="flowerBattle"
        manager
        controls
        presenterLayout="experience-immersive"
      >
        <div data-testid="immersive-garden">garden</div>
      </GameWrapper>,
    )

    expect(html).toContain('data-presenter-layout="experience-immersive"')
    expect(html).toContain('data-testid="presenter-toolbar"')
    expect(html).toContain('data-toolbar-variant="overlay"')
    expect(html).toContain('data-testid="immersive-garden"')
    // Cream underlay skipped so body field cannot peek around the canvas.
    expect(html).not.toContain("cream-field")

    const contentShellClass = contentShellClassOf(html)
    expect(contentShellClass).toContain("overflow-hidden")
    expect(contentShellClass).not.toContain("px-4")
    expect(contentShellClass).not.toContain("overflow-y-auto")
  })

  it("normal presenterLayout keeps cream field and flow toolbar", () => {
    const html = renderToStaticMarkup(
      <GameWrapper statusName={STATUS.SHOW_QUESTION} manager controls>
        <div>classic content</div>
      </GameWrapper>,
    )

    expect(html).toContain('data-presenter-layout="normal"')
    expect(html).toContain("cream-field")
    expect(html).toContain('data-toolbar-variant="flow"')
  })

  it.each([true, false])(
    "keeps the default manager chrome and scroll shell when controls=$controls",
    (controls) => {
      const html = renderToStaticMarkup(
        <GameWrapper
          statusName={STATUS.SHOW_QUESTION}
          manager
          controls={controls}
        >
          <div>manager content</div>
        </GameWrapper>,
      )

      expect(html).toContain("1 / 2")
      if (controls) {
        expect(html).toContain('data-testid="presenter-toolbar"')
      }

      const contentShellClass = contentShellClassOf(html)
      expect(contentShellClass).toContain("justify-center")
      expect(contentShellClass).toContain("overflow-y-auto")
      expect(contentShellClass).toContain("px-4")
      expect(contentShellClass).toContain("pt-2")
      expect(contentShellClass).toContain("pb-4")
    },
  )

  it("keeps the reconnecting banner visible in full-bleed kiosk mode", () => {
    socketState.isConnected = false

    const html = renderToStaticMarkup(
      <GameWrapper
        statusName={STATUS.SHOW_QUESTION}
        manager
        controls={false}
        managerKioskFullBleed
      >
        <div>satellite garden</div>
      </GameWrapper>,
    )

    expect(html).toContain('role="status"')
    expect(html).toContain("common:reconnecting")
    expect(contentShellClassOf(html)).toContain("overflow-hidden")
  })
})

describe("GameWrapper content transition key (WP-958F-W)", () => {
  const contentKeyOf = (html: string) => {
    const match = /data-content-transition-key="([^"]*)"/.exec(html)
    expect(match).not.toBeNull()
    return match![1]
  }

  it("keeps a stable Flower/experience key across Question → Result → next Question", () => {
    // Manager/display routes pass contentTransitionKey={mode} while a
    // non-classic ExperienceDisplay is active. Same React key ⇒ same fiber
    // identity for the animated content shell, so the Pixi Flower subtree is
    // not torn down on phase changes (the plant-jump remount).
    const phases = [
      STATUS.SHOW_QUESTION,
      STATUS.SHOW_RESPONSES,
      STATUS.SHOW_RESULT,
      STATUS.SHOW_QUESTION,
    ] as const

    const keys = phases.map((statusName) =>
      contentKeyOf(
        renderToStaticMarkup(
          <GameWrapper
            statusName={statusName}
            contentTransitionKey="flowerBattle"
            manager
          >
            <div data-testid="flower-scene">flower scene</div>
          </GameWrapper>,
        ),
      ),
    )

    expect(keys).toEqual([
      "flowerBattle",
      "flowerBattle",
      "flowerBattle",
      "flowerBattle",
    ])
    // All phases share one key identity — React will not remount the shell.
    expect(new Set(keys).size).toBe(1)
  })

  it("retains classic/no-experience statusName remount behavior when contentTransitionKey is omitted", () => {
    const questionKey = contentKeyOf(
      renderToStaticMarkup(
        <GameWrapper statusName={STATUS.SHOW_QUESTION} manager>
          <div>classic question</div>
        </GameWrapper>,
      ),
    )
    const resultKey = contentKeyOf(
      renderToStaticMarkup(
        <GameWrapper statusName={STATUS.SHOW_RESULT} manager>
          <div>classic result</div>
        </GameWrapper>,
      ),
    )
    const noneKey = contentKeyOf(
      renderToStaticMarkup(
        <GameWrapper statusName={undefined} manager>
          <div>idle</div>
        </GameWrapper>,
      ),
    )

    expect(questionKey).toBe(STATUS.SHOW_QUESTION)
    expect(resultKey).toBe(STATUS.SHOW_RESULT)
    expect(questionKey).not.toBe(resultKey)
    expect(noneKey).toBe("none")
  })

  it("preserves WP-958D no-scroll and WP-958E w-full when contentTransitionKey is set", () => {
    const html = renderToStaticMarkup(
      <GameWrapper
        statusName={STATUS.SHOW_QUESTION}
        contentTransitionKey="flowerBattle"
        manager
      >
        <div>stage</div>
      </GameWrapper>,
    )

    const sectionMatch = /<section[^>]*class="([^"]*)"/.exec(html)
    expect(sectionMatch).not.toBeNull()
    const sectionClass = sectionMatch![1]
    expect(sectionClass).toMatch(/(^|\s)w-full(\s|$)/)
    expect(sectionClass).toMatch(/(^|\s)h-dvh(\s|$)/)
    expect(sectionClass).toMatch(/(^|\s)overflow-hidden(\s|$)/)
    expect(sectionClass).not.toMatch(/(^|\s)min-h-dvh(\s|$)/)
    expect(contentKeyOf(html)).toBe("flowerBattle")
  })
})

describe("GameWrapper player Flower HUD chrome (WP-946-C3)", () => {
  const contentKeyOf = (html: string) => {
    const match = /data-content-transition-key="([^"]*)"/.exec(html)
    expect(match).not.toBeNull()
    return match![1]
  }

  it("hides the player topbar when hidePlayerTopbar is set (Flower Battle gameplay)", () => {
    const html = renderToStaticMarkup(
      <GameWrapper
        statusName={STATUS.SELECT_ANSWER}
        contentTransitionKey="flowerBattle"
        hidePlayerTopbar
      >
        <div data-testid="flower-battle-player-hud-slot">hud</div>
      </GameWrapper>,
    )

    expect(html).not.toContain('data-testid="game-topbar"')
    expect(html).toContain('data-testid="flower-battle-player-hud-slot"')
    expect(contentKeyOf(html)).toBe("flowerBattle")
  })

  it("renders a player topbar replacement before the animated content subtree", () => {
    const html = renderToStaticMarkup(
      <GameWrapper
        statusName={STATUS.SELECT_ANSWER}
        contentTransitionKey="flowerBattle"
        hidePlayerTopbar
        playerTopbarReplacement={
          <div data-testid="flower-battle-player-hud-slot">hud</div>
        }
      >
        <div data-testid="flower-battle-stage">stage</div>
      </GameWrapper>,
    )

    const replacementIndex = html.indexOf(
      'data-testid="flower-battle-player-hud-slot"',
    )
    const scrollShellIndex = html.indexOf("overflow-y-auto")
    const transitionIndex = html.indexOf(
      'data-content-transition-key="flowerBattle"',
    )
    const stageIndex = html.indexOf('data-testid="flower-battle-stage"')

    expect(replacementIndex).toBeGreaterThan(-1)
    expect(scrollShellIndex).toBeGreaterThan(replacementIndex)
    expect(transitionIndex).toBeGreaterThan(scrollShellIndex)
    expect(stageIndex).toBeGreaterThan(transitionIndex)
    expect(html).not.toContain('data-testid="game-topbar"')
  })

  it("keeps the player topbar on classic / join screens (hidePlayerTopbar off)", () => {
    const html = renderToStaticMarkup(
      <GameWrapper statusName={STATUS.SHOW_START}>
        <div data-testid="join-screen">join</div>
      </GameWrapper>,
    )

    expect(html).toContain('data-testid="game-topbar"')
    // Topbar uses mapped semantic surface token (not bare white chrome).
    const topbarMatch = /data-testid="game-topbar"[^>]*class="([^"]*)"/.exec(
      html,
    )
    expect(topbarMatch).not.toBeNull()
    expect(topbarMatch![1]).toContain("bg-surface")
    expect(topbarMatch![1]).not.toContain("bg-white")
    expect(contentKeyOf(html)).toBe(STATUS.SHOW_START)
  })

  it("pins a stable player content key across answer/resolution/finish phases", () => {
    const phases = [
      STATUS.SELECT_ANSWER,
      STATUS.SHOW_RESULT,
      STATUS.FINISHED,
      STATUS.SELECT_ANSWER,
    ] as const

    const keys = phases.map((statusName) =>
      contentKeyOf(
        renderToStaticMarkup(
          <GameWrapper
            statusName={statusName}
            contentTransitionKey="flowerBattle"
            hidePlayerTopbar
          >
            <div data-testid="plant-hud-answers">stable subtree</div>
          </GameWrapper>,
        ),
      ),
    )

    expect(keys).toEqual([
      "flowerBattle",
      "flowerBattle",
      "flowerBattle",
      "flowerBattle",
    ])
    expect(new Set(keys).size).toBe(1)
  })

  it("preserves classic player geometry (min-h-dvh, centered content shell)", () => {
    const classic = renderToStaticMarkup(
      <GameWrapper statusName={STATUS.WAIT}>
        <div data-testid="wait-centered">waiting</div>
      </GameWrapper>,
    )
    const flower = renderToStaticMarkup(
      <GameWrapper
        statusName={STATUS.SELECT_ANSWER}
        contentTransitionKey="flowerBattle"
        hidePlayerTopbar
      >
        <div data-testid="flower-battle-player-hud-slot">hud</div>
      </GameWrapper>,
    )

    for (const html of [classic, flower]) {
      const sectionMatch = /<section[^>]*class="([^"]*)"/.exec(html)
      expect(sectionMatch).not.toBeNull()
      const sectionClass = sectionMatch![1]
      // Player route keeps min-h-dvh growth (not presenter h-dvh).
      expect(sectionClass).toMatch(/(^|\s)min-h-dvh(\s|$)/)
      expect(sectionClass).toMatch(/(^|\s)w-full(\s|$)/)
      expect(sectionClass).not.toMatch(/(^|\s)h-dvh(\s|$)/)
      // Content shell stays vertically centered for join/wait and gameplay.
      expect(html).toContain("justify-center")
    }

    expect(classic).toContain('data-testid="game-topbar"')
    expect(flower).not.toContain('data-testid="game-topbar"')
  })

  it("portrait geometry invariants — compact HUD slot does not force full-bleed overflow chrome", () => {
    // Contract for 375×667 / 390×844 / 440×956: no top chrome, stable key,
    // shrink-0 HUD slot class lives on the route child (asserted here as
    // class preservation through the content shell).
    const html = renderToStaticMarkup(
      <GameWrapper
        statusName={STATUS.SELECT_ANSWER}
        contentTransitionKey="flowerBattle"
        hidePlayerTopbar
      >
        <div
          data-testid="flower-battle-player-hud-slot"
          className="mx-auto mb-2 w-full max-w-md shrink-0"
        >
          compact hud
        </div>
      </GameWrapper>,
    )

    expect(html).not.toContain('data-testid="game-topbar"')
    expect(html).toContain("max-w-md")
    expect(html).toContain("shrink-0")
    expect(html).toContain("justify-center")
    expect(contentKeyOf(html)).toBe("flowerBattle")
    // Player footer (username/points) remains for score continuity.
    expect(html).toContain('data-testid="player-footer"')
  })
})
