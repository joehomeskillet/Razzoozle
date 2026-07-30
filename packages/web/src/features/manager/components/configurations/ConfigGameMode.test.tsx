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
      experienceModesEnabled: "classic,not-a-real-mode",
    })

    expect(toggleStateAfter(html, "setting-experience-modes")).toBe("true")
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.classic.name",
    )
    expect(html).not.toContain("not-a-real-mode")
  })
})

describe("ConfigGameMode — Blüten-Battle mode card (WP-FLB-18)", () => {
  it("badges flowerbattle alongside the other three when fully unlocked", () => {
    const html = renderGameMode({
      ...baseConfig,
      experienceModesEnabled: "classic,pyramidclimb,deepseaescape,flowerbattle",
    })

    expect(toggleStateAfter(html, "setting-experience-modes")).toBe("true")
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.options.flower_battle.name",
    )
  })

  it("renders the mode card unconditionally (independent of the availability toggle)", () => {
    const html = renderGameMode({
      ...baseConfig,
      experienceModesEnabled: "",
    })

    expect(html).toContain("manager:gameMode.flowerBattle.name")
    expect(html).toContain("manager:gameMode.flowerBattle.description")
    expect(html).toContain("manager:selectQuizz.experienceMode.devicesOnlyHint")
    expect(html).toContain(
      "manager:selectQuizz.experienceMode.teamsRequiredHint",
    )
    expect(html).toContain(
      "manager:gameMode.flowerBattle.recommendedParticipants",
    )
    expect(html).toContain("manager:gameMode.flowerBattle.backgroundHint")
    // No background/seed selector — only the explanatory hint text.
    expect(html).not.toContain('id="setting-flower-battle-background"')
  })

  it("renders exactly the 4 value-bounded target-level options, default 10 selected", () => {
    const html = renderGameMode(baseConfig)

    const select = /<select[^>]*id="flower-battle-target-level"[^>]*>[\s\S]*?<\/select>/.exec(
      html,
    )?.[0]
    expect(select).toBeDefined()
    const optionValues = [...(select ?? "").matchAll(/<option value="(\d+)"/g)].map(
      (m) => m[1],
    )
    expect(optionValues).toEqual(["5", "10", "15", "20"])
    expect(select).toContain('value="10" selected')
  })

  it("renders exactly the 5 value-bounded power-up threshold options, default 3 selected", () => {
    const html = renderGameMode(baseConfig)

    const select = /<select[^>]*id="flower-battle-powerup-threshold"[^>]*>[\s\S]*?<\/select>/.exec(
      html,
    )?.[0]
    expect(select).toBeDefined()
    const optionValues = [...(select ?? "").matchAll(/<option value="(\d+)"/g)].map(
      (m) => m[1],
    )
    expect(optionValues).toEqual(["1", "2", "3", "4", "5"])
    expect(select).toContain('value="3" selected')
  })

  it("power-ups and acid-rain toggles default to checked (on)", () => {
    const html = renderGameMode(baseConfig)

    expect(toggleStateAfter(html, "setting-flower-battle-powerups")).toBe(
      "true",
    )
    expect(toggleStateAfter(html, "setting-flower-battle-acid-rain")).toBe(
      "true",
    )
  })

  it("reflects a persisted config value instead of the default", () => {
    const html = renderGameMode({
      ...baseConfig,
      flowerBattleTargetLevel: 20,
      flowerBattlePowerupsEnabled: false,
      flowerBattleAcidRainEnabled: false,
      flowerBattlePowerupThreshold: 1,
    })

    const targetSelect = /<select[^>]*id="flower-battle-target-level"[^>]*>[\s\S]*?<\/select>/.exec(
      html,
    )?.[0]
    expect(targetSelect).toContain('value="20" selected')
    expect(toggleStateAfter(html, "setting-flower-battle-powerups")).toBe(
      "false",
    )
    expect(toggleStateAfter(html, "setting-flower-battle-acid-rain")).toBe(
      "false",
    )
    const thresholdSelect = /<select[^>]*id="flower-battle-powerup-threshold"[^>]*>[\s\S]*?<\/select>/.exec(
      html,
    )?.[0]
    expect(thresholdSelect).toContain('value="1" selected')
  })
})
