import type { ManagerConfig } from "@razzoozle/common/types/manager"
import type { QuizzMeta } from "@razzoozle/common/types/game"
import { renderToStaticMarkup } from "react-dom/server"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import ConfigSelectQuizz, {
  ExperienceModeSection,
  getPlayActionDisabledReasons,
} from "./ConfigSelectQuizz"

// Node-env SSR render (no jsdom — see vitest.config.ts). Same convention as
// ParticipantCapSetting.test.tsx: i18next mocked to return the raw key (or
// `defaultValue` when given).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

// Render the compact footer inline so SSR can verify its accessibility contract.
vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
  motion: {
    div: ({
      children,
      className,
    }: {
      children: ReactNode
      className?: string
    }) => <div className={className}>{children}</div>,
  },
}))

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
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
  "@razzoozle/web/features/manager/components/configurations/klassen/useClassManager",
  () => ({
    useClassManager: () => ({
      classes: [{ id: 7, name: "Klasse 7a", active: true }],
    }),
  }),
)

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

const ALL_UNLOCKED = new Set([
  "classic",
  "pyramidclimb",
  "deepseaescape",
  "flowerbattle",
])

describe("ExperienceModeSection — visibility gate (WP-EXP-05)", () => {
  it("renders nothing when no mode is unlocked", () => {
    const html = renderToStaticMarkup(
      <ExperienceModeSection
        unlockedExperienceModes={new Set()}
        experienceMode="classic"
        onExperienceModeChange={vi.fn()}
      />,
    )

    expect(html).toBe("")
  })

  it("renders the fieldset once at least one mode is unlocked", () => {
    const html = renderToStaticMarkup(
      <ExperienceModeSection
        unlockedExperienceModes={new Set(["classic"])}
        experienceMode="classic"
        onExperienceModeChange={vi.fn()}
      />,
    )

    expect(html).toContain('data-testid="experience-mode-group"')
  })
})

describe("ExperienceModeSection — exactly 4 options (WP-EXP-05, extended WP-FLB-18)", () => {
  it("always renders all 4 catalog options, never more, never fewer", () => {
    const html = renderToStaticMarkup(
      <ExperienceModeSection
        unlockedExperienceModes={ALL_UNLOCKED}
        experienceMode="classic"
        onExperienceModeChange={vi.fn()}
      />,
    )

    expect(html.match(/type="radio"/g)).toHaveLength(4)
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.classic.name",
    )
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.pyramid_climb.name",
    )
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.deep_sea_escape.name",
    )
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.flower_battle.name",
    )
  })

  it("still renders all 4 radios when only one mode is unlocked, disabling the rest", () => {
    const html = renderToStaticMarkup(
      <ExperienceModeSection
        unlockedExperienceModes={new Set(["classic"])}
        experienceMode="classic"
        onExperienceModeChange={vi.fn()}
      />,
    )

    expect(html.match(/type="radio"/g)).toHaveLength(4)
    // 3 of the 4 radios must carry the real disabled="" attribute (pyramid_climb,
    // deep_sea_escape, flower_battle) — every option's static className also
    // contains the literal substring "disabled:" (Tailwind variant prefix), so
    // a bare /disabled/ match would count that too; disabled="" is unambiguous.
    expect(html.match(/disabled=""/g)?.length).toBe(3)
  })

  it("flower_battle is unlockable independently and renders enabled once its token is present", () => {
    const html = renderToStaticMarkup(
      <ExperienceModeSection
        unlockedExperienceModes={new Set(["classic", "flowerbattle"])}
        experienceMode="classic"
        onExperienceModeChange={vi.fn()}
      />,
    )

    const inputTags = html.match(/<input[^/]*\/>/g) ?? []
    const flowerBattleInput = inputTags.find((tag) =>
      tag.includes('value="flower_battle"'),
    )
    expect(flowerBattleInput).toBeDefined()
    expect(flowerBattleInput).not.toContain('disabled=""')
  })

  it("marks the currently selected mode as checked", () => {
    const html = renderToStaticMarkup(
      <ExperienceModeSection
        unlockedExperienceModes={ALL_UNLOCKED}
        experienceMode="pyramid_climb"
        onExperienceModeChange={vi.fn()}
      />,
    )

    // Attribute order in the SSR output isn't guaranteed, so match the whole
    // <input> tag and check both attributes are present in it (any order).
    const inputTags = html.match(/<input[^/]*\/>/g) ?? []
    const pyramidInput = inputTags.find((tag) =>
      tag.includes('value="pyramid_climb"'),
    )
    expect(pyramidInput).toContain("checked")
  })

  it("shows the devices-only hint and an accessible preview placeholder slot", () => {
    const html = renderToStaticMarkup(
      <ExperienceModeSection
        unlockedExperienceModes={ALL_UNLOCKED}
        experienceMode="classic"
        onExperienceModeChange={vi.fn()}
      />,
    )

    expect(html).toContain("manager:selectQuizz.experienceMode.devicesOnlyHint")
    const previewMatch =
      /<div\s+[^>]*data-testid="experience-mode-preview"[^>]*>/.exec(html)
    expect(previewMatch).not.toBeNull()
    expect(previewMatch?.[0]).toContain(
      'aria-label="manager:selectQuizz.experienceMode.previewPlaceholder"',
    )
  })
})

const QUIZZ: QuizzMeta = {
  id: "q-1",
  subject: "Geography Bee",
  questionCount: 12,
}

const fullConfig: ManagerConfig = {
  quizz: [QUIZZ],
  results: [],
  submissions: [],
  scoringMode: "speed",
  teamMode: true,
  klassenEnabled: true,
  endScreenModes: "full,top3,private",
  experienceModesEnabled: "classic,pyramidclimb,deepseaescape,flowerbattle",
}

const renderPlay = (config: ManagerConfig = fullConfig) => {
  mockedEmit.mockClear()
  currentUseConfig.mockReset()
  currentUseConfig.mockReturnValue(config)
  return renderToStaticMarkup(<ConfigSelectQuizz />)
}

describe("ConfigSelectQuizz — compact footer migration (WP wp-ea1a389d5d03)", () => {
  it("keeps start options single-column until the viewport can fit both label rows", () => {
    const html = renderPlay()

    expect(html).toContain(
      'class="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4"',
    )
    expect(html).not.toContain("sm:grid-cols-2")
  })

  it("renders all six start-option control families in page content, not the old footer zones", () => {
    const html = renderPlay()

    // Scoring, experience, team mode, class mode, endscreen, participant cap.
    expect(html).toContain('data-testid="play-scoring-mode"')
    expect(html).toContain('data-testid="experience-mode-select"')
    expect(html).toContain('data-testid="play-team-mode"')
    expect(html).toContain('data-testid="play-klassen-mode"')
    expect(html).toContain('id="endscreen-select"')
    expect(html).toContain('data-testid="select-quizz-participant-cap-setting"')

    expect(html).not.toContain('data-testid="action-footer-controls"')
    expect(html).not.toContain('data-testid="action-footer-summary"')
    expect(html).not.toContain('data-testid="action-footer-actions"')
    expect(html).not.toContain('data-testid="action-footer-options-disclosure"')
    expect(html).not.toContain('data-testid="action-footer-options-changed"')
  })

  it("registers a compact ActionFooterCompact bar with instanceId=play and exactly two icon actions", () => {
    const html = renderPlay()

    expect(html).toContain('data-testid="action-footer-compact"')
    expect(html).not.toContain('role="toolbar"')
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Page actions"/)

    expect(html).toContain('data-testid="play-copy-btn"')
    expect(html).toContain('data-testid="quizz-start-btn"')
    expect(html.indexOf("play-copy-btn")).toBeGreaterThan(-1)
    expect(html.indexOf("quizz-start-btn")).toBeGreaterThan(-1)
    expect(html.indexOf("play-copy-btn")).toBeLessThan(
      html.indexOf("quizz-start-btn"),
    )
  })

  it("keeps quizz-start-btn test id and the canonical copy/start action keys (one primary, one secondary)", () => {
    const html = renderPlay()

    expect(html).toContain('data-testid="quizz-start-btn"')
    expect(html).toContain('data-action-key="play-copy"')
    expect(html).toContain('data-action-key="play-start"')
    expect(html).toContain('data-testid="play-copy-btn"')
    expect(html).toContain('data-testid="quizz-start-btn"')
  })

  it("disables both compact actions when no quiz is selected and surfaces a translated disabled reason", () => {
    currentUseConfig.mockReset()
    currentUseConfig.mockReturnValue(fullConfig)
    mockedEmit.mockClear()

    const html = renderToStaticMarkup(<ConfigSelectQuizz key="empty" />)

    const copyMatch = /<button[^>]*data-action-key="play-copy"[^>]*>/.exec(html)
    const startMatch = /<button[^>]*data-action-key="play-start"[^>]*>/.exec(
      html,
    )
    expect(copyMatch).toBeTruthy()
    expect(startMatch).toBeTruthy()
    expect(copyMatch?.[0]).toContain('aria-disabled="true"')
    expect(startMatch?.[0]).toContain('aria-disabled="true"')
    expect(copyMatch?.[0]).not.toMatch(/\sdisabled(?:=|\s|>)/)
    expect(startMatch?.[0]).not.toMatch(/\sdisabled(?:=|\s|>)/)

    const copyDescriptionId = /aria-describedby="([^"]+)"/.exec(
      copyMatch?.[0] ?? "",
    )?.[1]
    const startDescriptionId = /aria-describedby="([^"]+)"/.exec(
      startMatch?.[0] ?? "",
    )?.[1]
    expect(copyDescriptionId).toBeTruthy()
    expect(startDescriptionId).toBeTruthy()
    expect(html).toContain(`id="${copyDescriptionId}"`)
    expect(html).toContain(`id="${startDescriptionId}"`)
    expect(html).toContain("manager:quizz.pleaseSelect")

    expect(copyMatch?.[0]).toMatch(/aria-label="[^"]+"/)
    expect(startMatch?.[0]).toMatch(/aria-label="[^"]+"/)
  })

  it("uses the class-required reason only when a selected quiz lacks a class", () => {
    const reasons = {
      selectQuiz: "select a quiz",
      selectClass: "select a class",
    }

    expect(getPlayActionDisabledReasons(null, true, "", reasons)).toEqual({
      copy: "select a quiz",
      start: "select a quiz",
    })
    expect(getPlayActionDisabledReasons(QUIZZ.id, true, "", reasons)).toEqual({
      copy: undefined,
      start: "select a class",
    })
    expect(getPlayActionDisabledReasons(QUIZZ.id, true, "7", reasons)).toEqual({
      copy: undefined,
      start: undefined,
    })
  })
})
