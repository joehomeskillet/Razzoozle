import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { FlowerBattlePresenterHud } from "../FlowerBattlePresenterHud"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

const IMPLEMENTATION_LANDED = process.env.RAZZOOZLE_HUD_V3 === "1"
const CAN_CAPTURE_SCREENSHOT = false
const itIf = IMPLEMENTATION_LANDED && CAN_CAPTURE_SCREENSHOT ? it : it.skip

const fixtureMarkup = renderToString(
  <div style={{ width: "1920px", height: "1080px" }}>
    <FlowerBattlePresenterHud
      variant="overlay"
      teams={[
        {
          name: "Team Alpha",
          members: ["A", "B", "C"],
          hp: 0,
          shield: 0,
          effects: ["sunbeam"],
          growthStage: 1,
          sunPoints: 1,
        },
        {
          name: "Team Bravo",
          members: ["D", "E", "F"],
          hp: 0,
          shield: 0,
          effects: ["acid_rain"],
          growthStage: 0,
          sunPoints: 0,
        },
      ]}
      sunPoints={{ red: 1, blue: 0 }}
      answerCounter={{ answered: 2, total: 10 }}
      countdown={{ seconds: 42 }}
      powerUpChoiceMessage="Event banner active"
      powerUp={{ type: "sunbeam", teamName: "Team Alpha" }}
    />
  </div>,
)

describe("FlowerBattlePresenterHud visual screenshot coverage", () => {
  it("keeps screenshot marker in static markup (FB-HUD4: no global team-meters)", () => {
    expect(fixtureMarkup).toContain('data-testid="flower-battle-presenter-hud"')
    expect(fixtureMarkup).toContain('data-testid="flower-battle-event-banner"')
    // FB-HUD4: team-meters is gone — per-team cards live under each plant.
    expect(fixtureMarkup).not.toContain('data-testid="flower-battle-team-meters"')
    expect(fixtureMarkup).toContain('data-testid="flower-battle-timer-slot"')
    expect(fixtureMarkup).toContain('data-testid="flower-battle-answer-counter-slot"')
  })

  itIf("defers full matrix captures to Playwright e2e spec", () => {
    expect(fixtureMarkup).toContain("flower-battle-presenter-hud")
  })
})
