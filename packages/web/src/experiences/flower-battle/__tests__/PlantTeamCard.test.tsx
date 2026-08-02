import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { defaultValue?: string },
    ) => options?.defaultValue ?? key,
  }),
}))

import {
  PlantTeamCard,
  plantTeamCardPropsFromTeam,
  PLANT_TEAM_CARD_MAX_GROWTH,
  PLANT_TEAM_CARD_MAX_SUN,
} from "../PlantTeamCard"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const makeTeam = (
  name: string,
  growthStage: number,
  sunPoints: number,
): FlowerBattleTeamState => ({
  name,
  members: [],
  hp: 0,
  shield: 0,
  effects: [],
  growthStage,
  sunPoints,
})

describe("PlantTeamCard", () => {
  it("renders team dot, name, progress x/y, sun points label + percent and a linear bar", () => {
    const html = renderToStaticMarkup(
      <PlantTeamCard
        teamName="Team Blau"
        teamKey="blue"
        growthStage={2}
        sunPoints={2}
      />,
    )

    expect(html).toContain('data-testid="plant-team-card"')
    expect(html).toContain('data-testid="plant-team-card-dot"')
    expect(html).toContain('data-team-name="Team Blau"')
    expect(html).toContain('data-team-key="blue"')
    // progress x/y
    expect(html).toContain(
      `2/${PLANT_TEAM_CARD_MAX_GROWTH}`,
    )
    // sun points label
    expect(html).toContain("Sonnenpunkte")
    // percent (2/3 → 67)
    expect(html).toContain("67 %")
    // linear progress bar
    expect(html).toContain('data-testid="plant-team-card-progress"')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="2"')
    expect(html).toContain(`aria-valuemax="${PLANT_TEAM_CARD_MAX_GROWTH}"`)
  })

  it("shows 0 % when sun points are zero and 100 % when maxed", () => {
    const zero = renderToStaticMarkup(
      <PlantTeamCard
        teamName="A"
        teamKey="red"
        growthStage={0}
        sunPoints={0}
      />,
    )
    expect(zero).toContain("0 %")

    const full = renderToStaticMarkup(
      <PlantTeamCard
        teamName="A"
        teamKey="red"
        growthStage={PLANT_TEAM_CARD_MAX_GROWTH}
        sunPoints={PLANT_TEAM_CARD_MAX_SUN}
      />,
    )
    expect(full).toContain("100 %")
  })

  it("clamps invalid values without crashing", () => {
    const html = renderToStaticMarkup(
      <PlantTeamCard
        teamName="A"
        teamKey="red"
        // Negative + NaN-y values must not produce NaN or layout break.
        growthStage={-50}
        sunPoints={Number.NaN}
      />,
    )
    expect(html).toContain('data-testid="plant-team-card"')
    expect(html).toContain("0 %")
    // growth stage clamps to 0
    expect(html).toContain(`0/${PLANT_TEAM_CARD_MAX_GROWTH}`)
  })

  it("falls back to a known team color when given an unknown key", () => {
    const html = renderToStaticMarkup(
      <PlantTeamCard
        teamName="A"
        teamKey="not-a-real-team"
        growthStage={1}
        sunPoints={1}
      />,
    )
    // Falls back to TEAMS[0] (red) — no throw, dot still rendered.
    expect(html).toContain('data-team-key="red"')
    expect(html).toContain('data-testid="plant-team-card-dot"')
  })

  it("renders no layout-breaking markup for very long team names (CSS truncate handles it)", () => {
    const long = "Lorem ipsum dolor sit amet ".repeat(10)
    const html = renderToStaticMarkup(
      <PlantTeamCard teamName={long} teamKey="green" growthStage={1} sunPoints={1} />,
    )
    expect(html).toContain('data-testid="plant-team-card"')
    // The title attribute exposes the full name for screen readers / tooltips.
    expect(html).toContain(`title="${long.trim()}"`)
  })
})

describe("plantTeamCardPropsFromTeam", () => {
  it("maps a FlowerBattleTeamState into PlantTeamCardProps", () => {
    const team = makeTeam("Blau", 3, 1)
    const props = plantTeamCardPropsFromTeam(team, 1)
    expect(props).toEqual({
      teamName: "Blau",
      teamKey: "blue",
      growthStage: 3,
      sunPoints: 1,
    })
  })

  it("uses TEAMS[0] for unknown / out-of-range indices without throwing", () => {
    const props = plantTeamCardPropsFromTeam(makeTeam("X", 0, 0), 99)
    expect(props.teamKey).toBe("red")
  })
})
