import { renderToStaticMarkup } from "react-dom/server"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import ConfigAchievements from "./ConfigAchievements"

// Node-env SSR render (no jsdom — see vitest.config.ts). Same convention as
// ConfigSelectQuizz.test.tsx: i18next mocked to return the raw key (or
// `defaultValue` when given).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

const mockedEmit = vi.fn()
vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mockedEmit } }),
}))

const currentUseConfig = vi.fn()
vi.mock("@razzoozle/web/features/manager/contexts/config-context", () => ({
  useConfig: () => currentUseConfig(),
}))

vi.mock(
  "@razzoozle/web/features/manager/contexts/action-footer-host-context",
  () => ({
    useActionFooterHostOptional: () => ({
      target: {} as HTMLElement,
      register: vi.fn(() => () => undefined),
      registrationCount: 1,
      setTarget: vi.fn(),
      variant: "compact",
    }),
  }),
)

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom")
  return {
    ...actual,
    createPortal: (children: ReactNode) => children,
  }
})

// Strip children-heavy badge rows so SSR stays deterministic; the compact
// footer assertions below only depend on the footer markup itself.
vi.mock("../ConfigAchievements/BadgeRow", () => ({
  default: () => <div data-testid="badge-row-stub" />,
}))

vi.mock("../ConfigAchievements/TierHeader", () => ({
  default: () => <div data-testid="tier-header-stub" />,
}))

const baseConfig = {
  achievements: [
    {
      id: "first_win" as const,
      enabled: true,
      name: "First Win",
      description: "Win your first game",
      threshold: null,
      bonus: 50,
    },
  ],
}

const renderAchievements = () => {
  mockedEmit.mockClear()
  currentUseConfig.mockReset()
  currentUseConfig.mockReturnValue(baseConfig)
  return renderToStaticMarkup(<ConfigAchievements />)
}

describe("ConfigAchievements — compact footer migration (wp-b-5)", () => {
  it("registers a compact ActionFooterCompact bar with instanceId=achievements", () => {
    const html = renderAchievements()

    expect(html).toContain('data-testid="action-footer-compact"')
    expect(html).not.toContain('role="toolbar"')
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Page actions"/)
  })

  it("renders two icon actions (reset, save) in DOM order matching tab order", () => {
    const html = renderAchievements()

    expect(html).toContain('data-testid="achievements-reset-btn"')
    expect(html).toContain('data-testid="achievements-save-btn"')
    expect(html).toContain('data-action-key="achievements-reset"')
    expect(html).toContain('data-action-key="achievements-save"')

    const resetIdx = html.indexOf("achievements-reset-btn")
    const saveIdx = html.indexOf("achievements-save-btn")
    expect(resetIdx).toBeGreaterThan(-1)
    expect(saveIdx).toBeGreaterThan(-1)
    expect(resetIdx).toBeLessThan(saveIdx)
  })

  it("exposes stable 44x44 touch targets on each icon action", () => {
    const html = renderAchievements()

    const resetMatch =
      /<button[^>]*data-testid="achievements-reset-btn"[^>]*>/.exec(html)?.[0]
    const saveMatch =
      /<button[^>]*data-testid="achievements-save-btn"[^>]*>/.exec(html)?.[0]

    expect(resetMatch).toBeTruthy()
    expect(saveMatch).toBeTruthy()
    expect(resetMatch).toContain("h-11")
    expect(resetMatch).toContain("w-11")
    expect(saveMatch).toContain("h-11")
    expect(saveMatch).toContain("w-11")
  })

  it("uses the existing achievementsConfig.reset/save i18n keys verbatim", () => {
    const html = renderAchievements()

    const resetButton =
      /<button[^>]*data-testid="achievements-reset-btn"[^>]*>/.exec(html)?.[0]
    const saveButton =
      /<button[^>]*data-testid="achievements-save-btn"[^>]*>/.exec(html)?.[0]

    expect(resetButton).toContain(
      'aria-label="manager:achievementsConfig.reset"',
    )
    expect(saveButton).toContain(
      'aria-label="manager:achievementsConfig.save"',
    )
  })

  it("disables the save action via aria-disabled when nothing is dirty", () => {
    const html = renderAchievements()

    const saveButton =
      /<button[^>]*data-testid="achievements-save-btn"[^>]*>/.exec(html)?.[0]

    expect(saveButton).toBeTruthy()
    expect(saveButton).toContain('aria-disabled="true"')
    expect(saveButton).not.toMatch(/\sdisabled(?:=|\s|>)/)
    expect(saveButton).toContain("cursor-not-allowed")
  })

  it("keeps the disabled save button focusable and exposes the disabled reason", () => {
    const html = renderAchievements()

    const saveButton =
      /<button[^>]*data-testid="achievements-save-btn"[^>]*>/.exec(html)?.[0]

    expect(saveButton).toBeTruthy()
    expect(saveButton).toContain('aria-describedby=')
    // The sr-only description span lives as the next sibling inside the
    // IconBarButton wrapper; check the slice after the button so we capture
    // both the aria-describedby id and the resolved defaultValue ("Saved").
    const saveSection = html.slice(html.indexOf("achievements-save-btn"))
    expect(saveSection).toMatch(/<span id="[^"]+" class="sr-only">Saved<\/span>/)
  })
})