import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ExperienceModeSection } from "./ConfigSelectQuizz"

// Node-env SSR render (no jsdom — see vitest.config.ts). Same convention as
// ParticipantCapSetting.test.tsx: i18next mocked to return the raw key (or
// `defaultValue` when given).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

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
    const previewMatch = /<div\s+[^>]*data-testid="experience-mode-preview"[^>]*>/.exec(
      html,
    )
    expect(previewMatch).not.toBeNull()
    expect(previewMatch?.[0]).toContain(
      'aria-label="manager:selectQuizz.experienceMode.previewPlaceholder"',
    )
  })
})
