import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { ManagerConfig } from "@razzoozle/common/types/manager"
import { ConfigProvider } from "@razzoozle/web/features/manager/contexts/config-context"

import ConfigGameMode from "./ConfigGameMode"

// Node-env SSR render (no jsdom — see vitest.config.ts). Same convention as
// ParticipantCapSetting.test.tsx: i18next mocked to return the raw key (or
// `defaultValue` when given), so assertions target stable key strings
// instead of locale copy that can change independently of this test.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; count?: number }) =>
      options?.defaultValue ?? key,
  }),
}))

const baseConfig: ManagerConfig = {
  quizz: [],
  results: [],
  submissions: [],
}

function renderGameMode(config: ManagerConfig): string {
  return renderToStaticMarkup(
    <ConfigProvider data={config}>
      <ConfigGameMode />
    </ConfigProvider>,
  )
}

/** Extracts the aria-checked value of the toggle button that follows a given id. */
function toggleStateAfter(html: string, id: string): string | null {
  const marker = `id="${id}"`
  const start = html.indexOf(marker)
  if (start === -1) {
    return null
  }
  const match = /aria-checked="(true|false)"/.exec(html.slice(start))
  return match ? match[1] : null
}

describe("ConfigGameMode — experience-modes availability toggle (WP-EXP-05)", () => {
  it("renders the toggle unchecked and hides mode badges when no mode is unlocked", () => {
    const html = renderGameMode({
      ...baseConfig,
      experienceModesEnabled: "",
    })

    expect(html).toContain('id="setting-experience-modes"')
    expect(toggleStateAfter(html, "setting-experience-modes")).toBe("false")
    expect(html).not.toContain(
      "manager:selectQuizz.experienceMode.options.classic.name",
    )
  })

  it("renders the toggle unchecked when the field is absent (back-compat default)", () => {
    const html = renderGameMode(baseConfig)

    expect(toggleStateAfter(html, "setting-experience-modes")).toBe("false")
  })

  it("renders the toggle checked and shows one badge per unlocked mode", () => {
    const html = renderGameMode({
      ...baseConfig,
      experienceModesEnabled: "classic,pyramidclimb,deepseaescape",
    })

    expect(toggleStateAfter(html, "setting-experience-modes")).toBe("true")
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.classic.name",
    )
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.pyramid_climb.name",
    )
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.deep_sea_escape.name",
    )
  })

  it("shows only the unlocked subset when the CSV allow-list is partial", () => {
    const html = renderGameMode({
      ...baseConfig,
      experienceModesEnabled: "classic",
    })

    expect(toggleStateAfter(html, "setting-experience-modes")).toBe("true")
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.classic.name",
    )
    expect(html).not.toContain(
      "manager:selectQuizz.experienceMode.options.pyramid_climb.name",
    )
    expect(html).not.toContain(
      "manager:selectQuizz.experienceMode.options.deep_sea_escape.name",
    )
  })

  it("ignores an unknown CSV token without crashing and without a stray badge", () => {
    const html = renderGameMode({
      ...baseConfig,
      experienceModesEnabled: "classic,flowerbattle,not-a-real-mode",
    })

    expect(toggleStateAfter(html, "setting-experience-modes")).toBe("true")
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.classic.name",
    )
    // flowerbattle is deliberately not manager-toggleable yet — no badge map
    // entry exists for it, so it must render nothing rather than throw.
    expect(html).not.toContain("flowerbattle")
  })
})
