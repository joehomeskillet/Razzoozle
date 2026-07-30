import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; teamName?: string; powerUp?: string }) => {
      if (options?.defaultValue) {
        return options.defaultValue
          .replace("{{teamName}}", options.teamName ?? "")
          .replace("{{powerUp}}", options.powerUp ?? "")
      }
      return key
    },
  }),
}))

import { FlowerBattlePresenterHud } from "../FlowerBattlePresenterHud"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const makeTeam = (
  name: string,
  sunPoints: number,
  effects: FlowerBattleTeamState["effects"] = [],
): FlowerBattleTeamState => ({
  name,
  members: [],
  hp: 0,
  shield: 0,
  effects,
  sunPoints,
})

const baseTeams: FlowerBattleTeamState[] = [
  makeTeam("Rot", 2, ["sunbeam"]),
  makeTeam("Blau", 1, ["umbrella_shield"]),
]

describe("FlowerBattlePresenterHud", () => {
  it("renders presenter HUD root and team meter grid", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
      />,
    )

    expect(html).toContain('data-testid="flower-battle-presenter-hud"')
    expect(html).toContain('data-testid="experience-hud"')
    expect(html).toContain('data-testid="flower-battle-team-meters"')
    expect(html).toContain('data-testid="flower-battle-team-hud-0"')
    expect(html).toContain('data-testid="flower-battle-team-hud-1"')
  })

  it("shows sun-point meters via RoundProgress primitives", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
      />,
    )

    expect(html).toContain('data-testid="hud-round-progress"')
    expect(html).toContain('aria-valuenow="67"')
    expect(html).toContain('aria-valuenow="33"')
  })

  it("renders power-up effect icons with visible labels", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
      />,
    )

    expect(html).toContain('data-testid="flower-battle-effect-sunbeam-0"')
    expect(html).toContain('data-testid="flower-battle-effect-umbrella_shield-1"')
    expect(html).toContain("sunbeam")
    expect(html).toContain("umbrella_shield")
  })

  it("announces an active power-up choice via StatusBanner", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
        powerUpChoiceMessage="Team Rot wählt Sonnenstrahl"
      />,
    )

    expect(html).toContain('data-testid="hud-status-banner"')
    expect(html).toContain("Team Rot wählt Sonnenstrahl")
  })

  it("does not render question-text testid (content-free presenter HUD)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
        powerUp={{ type: "sunbeam", teamName: "Rot" }}
        powerUpChoiceMessage="Team Rot wählt Sonnenstrahl"
      />,
    )

    expect(html).not.toContain('data-testid="question-text"')
  })
})
