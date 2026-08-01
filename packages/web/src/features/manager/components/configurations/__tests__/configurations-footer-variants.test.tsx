// AF-compact WP-0 — proof of production callsite wiring without modal side effects.

import { renderToStaticMarkup } from "react-dom/server"
import type { ReactNode } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import type { ManagerConfig } from "@razzoozle/common/types/manager"

let activeTab = "users"
interface CapturedShellProps {
  children?: ReactNode
  footerPolicy?: string
  variant?: string
}

let shellProps: CapturedShellProps = {}
let Configurations: typeof import("../index").default

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ tab: activeTab }),
  useNavigate: () => vi.fn(),
}))

vi.mock(
  "@razzoozle/web/features/manager/components/console/ConsoleShell",
  () => ({
    default: (props: CapturedShellProps) => {
      shellProps = props
      return (
        <div data-testid="console-shell-mock">
          <div data-testid="console-shell-children">{props.children}</div>
        </div>
      )
    },
  }),
)

const data: ManagerConfig = {
  quizz: [],
  submissions: [],
  results: [],
}

vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigUsers",
  () => ({
    default: () => <div data-testid="users-view" />,
  }),
)

vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigSelectQuizz",
  () => ({
    default: () => <div data-testid="play-view" />,
  }),
)

vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigCatalog",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigAchievements",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigAI",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigDev",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigGameMode",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigManageQuizz",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigMedia",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigProfile",
  () => ({
    default: () => <div />,
  }),
)
vi.mock("@razzoozle/web/components/LanguageSwitcher", () => ({
  default: () => <div />,
}))

vi.mock(
  "@razzoozle/web/features/manager/components/console/RunningGamesSection",
  () => ({
    default: () => <div />,
  }),
)
vi.mock("@razzoozle/web/features/game/stores/manager", async () => {
  const actual = await vi.importActual<
    typeof import("@razzoozle/web/features/game/stores/manager")
  >("@razzoozle/web/features/game/stores/manager")
  return {
    ...actual,
    useManagerStore: () => ({
      role: "admin",
      username: "admin",
      logout: vi.fn(),
    }),
  }
})

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
}))

vi.mock("@razzoozle/web/features/manager/contexts/config-context", () => ({
  ConfigProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useConfig: () => ({ submissions: [], devMode: false, klassenEnabled: false }),
}))

vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigResults",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigSubmissions",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigTheme",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigKlassen",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/ConfigSchueler",
  () => ({
    default: () => <div />,
  }),
)
vi.mock(
  "@razzoozle/web/features/manager/components/configurations/labels/ConfigLabels",
  () => ({
    default: () => <div />,
  }),
)
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeAll(async () => {
  ;({ default: Configurations } = await import("../index"))
})

const renderConfigs = (tab: string) => {
  shellProps = {}
  activeTab = tab
  const markup = renderToStaticMarkup(<Configurations data={data} />)
  return markup
}

describe("configurations footer variants", () => {
  it("registers users tab as compact and render-users view", () => {
    const html = renderConfigs("users")
    expect(html).toContain('data-testid="users-view"')
    expect(shellProps.variant).toBe("compact")
    expect(shellProps.footerPolicy).toBe("required")
  })

  it("keeps play on default footer mode and keeps play list view", () => {
    const html = renderConfigs("play")
    expect(html).toContain('data-testid="play-view"')
    expect(shellProps.variant).toBeUndefined()
  })
})
