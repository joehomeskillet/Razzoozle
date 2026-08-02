import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { defaultValue?: string; teamName?: string; powerUp?: string },
    ) => {
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
  growthStage: sunPoints,
  sunPoints,
})

const baseTeams: FlowerBattleTeamState[] = [
  makeTeam("Rot", 2, ["sunbeam"]),
  makeTeam("Blau", 1, ["umbrella_shield"]),
]

describe("FlowerBattlePresenterHud", () => {
  it("renders presenter HUD root and bottom-hud slots (overlay default)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
      />,
    )

    expect(html).toContain('data-testid="flower-battle-presenter-hud"')
    expect(html).toContain('data-hud-variant="overlay"')
    expect(html).toContain('data-testid="flower-battle-bottom-hud"')
    // Overlay composes primitives directly — no ExperienceHud shell.
    expect(html).not.toContain('data-testid="experience-hud"')
    // FB-HUD4: team cards live under each plant now; the bottom HUD owns
    // only the timer + answer counter. No team-meters / team-hud testids.
    expect(html).not.toContain('data-testid="flower-battle-team-meters"')
    expect(html).not.toContain('data-testid="flower-battle-team-hud-0"')
    expect(html).not.toContain('data-testid="flower-battle-team-hud-1"')
    expect(html).toContain('data-testid="flower-battle-timer-slot"')
    expect(html).toContain('data-testid="flower-battle-answer-counter-slot"')
    // WP-2 replaces nested phase chip with in-card dot/name header.
    expect(html).not.toContain('data-testid="hud-phase-indicator"')
  })

  it("flow variant keeps ExperienceHud shell and natural height (WP-994)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        variant="flow"
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
      />,
    )

    expect(html).toContain('data-hud-variant="flow"')
    expect(html).toContain('data-testid="experience-hud"')
    // Flow variant must not reintroduce a global team-meters grid.
    expect(html).not.toContain('data-testid="flower-battle-team-meters"')
    expect(html).not.toContain('data-testid="flower-battle-team-hud-0"')

    const rootMatch =
      /data-testid="flower-battle-presenter-hud"[^>]*class="([^"]*)"/.exec(html)
    expect(rootMatch).not.toBeNull()
    const rootClass = rootMatch![1]
    expect(rootClass).toContain("flex")
    expect(rootClass).toContain("flex-col")
    expect(rootClass).toContain("w-full")
    // Natural content height — do not claim 100% of the display stage.
    expect(rootClass.split(/\s+/)).not.toContain("h-full")
  })

  it("overlay variant fills the stage and places timer + answer counter absolutely", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
        answerCounter={{ answered: 3, total: 10 }}
      />,
    )

    const rootMatch =
      /data-testid="flower-battle-presenter-hud"[^>]*class="([^"]*)"/.exec(html)
    expect(rootMatch).not.toBeNull()
    expect(rootMatch![1]).toContain("relative")
    expect(rootMatch![1]).toContain("h-full")
    // FB-HUD4: the HUD root is transparent (no shared panel background).
    expect(rootMatch![1]).toContain("bg-transparent")
    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain("3/10")
  })

  it("renders the bottom-hud with timer slot centred and answer counter at the right", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
        countdown={{ seconds: 30 }}
        answerCounter={{ answered: 1, total: 4 }}
      />,
    )

    const bottomHudMatch =
      /data-testid="flower-battle-bottom-hud"[^>]*class="([^"]*)"/.exec(html)
    expect(bottomHudMatch).not.toBeNull()
    const bottomClass = bottomHudMatch![1]
    // FB-HUD4: bottom HUD is a simple flex row (no team-meter column).
    expect(bottomClass).toContain("flex")
    expect(bottomClass).toContain("items-end")
    expect(bottomClass).toContain("justify-between")

    expect(html).toContain('data-testid="flower-battle-timer-slot"')
    expect(html).toContain('data-testid="hud-countdown-display"')
    expect(html).toContain("30")
    expect(html).toContain("countdown.secondsLabel")
    expect(html).toContain('data-testid="flower-battle-answer-counter-slot"')
    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain("1/4")
  })

  it("does not render sun-point meters (FB-HUD4 moved them into PlantTeamCard)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
      />,
    )

    // RoundProgress primitive is no longer mounted by the presenter HUD.
    expect(html).not.toContain('data-testid="hud-round-progress"')
    // The aria-valuenow values that lived on the old meters are gone.
    expect(html).not.toContain('aria-valuenow="67"')
    expect(html).not.toContain('aria-valuenow="33"')
  })

  it("does not render powerup status icons in the global HUD (FB-HUD4 moved them to PlantTeamCard)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
      />,
    )

    // Powerup status effects live under the per-plant card now, not the
    // global HUD. The presenter HUD no longer mounts FlowerPowerupStatusIcons.
    expect(html).not.toContain('data-testid="flower-powerup-status-icons"')
    expect(html).not.toContain('data-testid="flower-powerup-status-sunbeam"')
    expect(html).not.toContain(
      'data-testid="flower-powerup-status-umbrella-shield"',
    )
    // And the a11y text they used to render is gone too.
    expect(html).not.toContain("Schutz aktiv")
    expect(html).not.toContain("Nächstes Wachstum +1")
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
