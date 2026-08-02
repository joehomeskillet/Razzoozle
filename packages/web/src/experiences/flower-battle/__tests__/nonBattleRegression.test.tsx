import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { STATUS } from "@razzoozle/common/types/game/status"

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
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className, ...rest }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
      <div className={className} {...(rest as Record<string, unknown>)}>
        {children}
      </div>
    ),
  },
}))

vi.mock("@razzoozle/web/components/Button", () => ({
  default: ({
    children,
    "data-testid": dataTestId,
    ...props
  }: {
    children?: unknown
    "data-testid"?: string
    [key: string]: unknown
  }) => (
    <button data-testid={dataTestId} {...(props as Record<string, unknown>)}>
      {children}
    </button>
  ),
}))

vi.mock("@razzoozle/web/components/Loader", () => ({
  default: () => <div data-testid="loader" />,
}))

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ isConnected: true, socket: { emit: vi.fn() } }),
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
vi.mock("@razzoozle/web/features/game/components/GameWrapper/AvToggles", () => ({
  default: () => <div data-testid="av-toggles-button" />,
}))
vi.mock("@razzoozle/web/features/game/components/GameWrapper/RejoinQrDialog", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/features/game/components/GameWrapper/GameControlPanel", () => ({
  default: () => null,
}))

import GameWrapper from "../../../features/game/components/GameWrapper/GameWrapper"

describe("GameWrapper classic presenter regression", () => {
  it("keeps flow toolbar controls in classic normal presenter layout", () => {
    const html = renderToStaticMarkup(
      <GameWrapper
        statusName={STATUS.SHOW_RESPONSES}
        manager
        controls
        presenterLayout="normal"
        onBack={() => null}
      >
        <div data-testid="classic-question-content">Classic content</div>
      </GameWrapper>,
    )

    expect(html).toContain('data-testid="presenter-toolbar"')
    expect(html).toContain('data-toolbar-variant="flow"')
    expect(html).toContain("1 / 2")
    expect(html).toContain("game:controls.autoMode")
    expect(html).toContain("game:controls.fullscreen")
    expect(html).toContain('data-testid="av-toggles-button"')
    expect(html).toContain('data-testid="next-btn"')
    expect(html).toContain("common:exit")
  })
})
