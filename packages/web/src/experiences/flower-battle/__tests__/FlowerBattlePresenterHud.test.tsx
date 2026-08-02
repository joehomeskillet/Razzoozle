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
    expect(html).toContain('data-testid="flower-battle-team-meters"')
    expect(html).toContain('data-testid="flower-battle-timer-slot"')
    expect(html).toContain('data-testid="flower-battle-answer-counter-slot"')
    expect(html).toContain('data-testid="flower-battle-team-hud-0"')
    expect(html).toContain('data-testid="flower-battle-team-hud-1"')
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

  it("overlay variant fills the stage and places team meters absolutely", () => {
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
    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain("3/10")
  })

  it("renders the bottom-hud grid with three explicit slots", () => {
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
    expect(bottomHudMatch![1]).toContain(
      "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
    )

    expect(html).toContain('data-testid="flower-battle-timer-slot"')
    expect(html).toContain('data-testid="hud-countdown-display"')
    expect(html).toContain("30")
    expect(html).toContain("countdown.secondsLabel")
    expect(html).toContain('data-testid="flower-battle-answer-counter-slot"')
    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain("1/4")
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

  it("renders active powerup status icons (WP-938.2 wiring) via FlowerPowerupStatusIcons", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
      />,
    )

    // FlowerPowerupStatusIcons mounts the icon container
    expect(html).toContain('data-testid="flower-powerup-status-icons"')
    // sunbeam and umbrella_shield effects are rendered with their status text
    expect(html).toContain('data-testid="flower-powerup-status-sunbeam"')
    expect(html).toContain(
      'data-testid="flower-powerup-status-umbrella-shield"',
    )
  })

  it("renders icon + text label pairs (no icon-only per a11y)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={baseTeams}
        sunPoints={{ red: 2, blue: 1 }}
      />,
    )

    // Verify text labels are present (Icon + Text together)
    expect(html).toContain("Schutz aktiv")
    expect(html).toContain("Nächstes Wachstum +1")
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

  it("renders no status icons when team has no active effects", () => {
    const noEffectsTeams = [makeTeam("Grün", 0, [])]
    const html = renderToStaticMarkup(
      <FlowerBattlePresenterHud
        teams={noEffectsTeams}
        sunPoints={{ green: 0 }}
      />,
    )

    // FlowerPowerupStatusIcons returns null when activeEffects is empty
    expect(html).not.toContain('data-testid="flower-powerup-status-icons"')
  })
})
