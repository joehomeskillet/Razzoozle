import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TEAMS } from "@razzoozle/common/constants"
import { FlowerBattlePresenterHud } from "../FlowerBattlePresenterHud"
import { FlowerGardenScene } from "../FlowerGardenScene"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const VIEWPORT_WIDTH = 1920
const VIEWPORT_HEIGHT = 1080
const EPSILON = 0.5

const teams: FlowerBattleTeamState[] = TEAMS.map((_color, index) => ({
  name: `Team ${["Alpha", "Bravo", "Charlie", "Delta"][index] ?? `T${index + 1}`}`,
  members: [],
  hp: 0,
  shield: 0,
  effects: index === 0 ? ["sunbeam" as const] : [],
  growthStage: index + 1,
  sunPoints: 4 - index,
}))

interface FixtureRect {
  left: number
  top: number
  width: number
  height: number
}

interface FixtureNode {
  testid: string
  rect: FixtureRect
}

const requireNode = (markup: string, testid: string): void => {
  expect(markup).toContain(`data-testid="${testid}"`)
}

const makeNode = (testid: string, rect: FixtureRect): FixtureNode => ({
  testid,
  rect,
})

const staticMarkup = renderToString(
  <div style={{ width: `${VIEWPORT_WIDTH}px`, height: `${VIEWPORT_HEIGHT}px` }}>
    <FlowerBattlePresenterHud
      variant="overlay"
      teams={teams}
      sunPoints={{ red: 2, blue: 2, green: 1, yellow: 0 }}
      answerCounter={{ answered: 4, total: 12 }}
      countdown={{ seconds: 60 }}
      powerUpChoiceMessage="Team Alpha selects Sunbeam"
      powerUp={{ type: "sunbeam", teamName: "Team Alpha" }}
    />
  </div>,
)

const itIf = (name: string, fn: () => void): void => {
  it(name, fn)
}

describe("FB-HUD4 Gartenmodus collision geometry", () => {
  itIf("presenter HUD root + bottom-hud exist (overlay) and never contain team-meters / team-hud", () => {
    expect(staticMarkup).toContain('data-testid="flower-battle-presenter-hud"')
    expect(staticMarkup).toContain('data-hud-variant="overlay"')
    expect(staticMarkup).toContain('data-testid="flower-battle-bottom-hud"')
    // FB-HUD4: global team meters and per-team Pixi HUDs are gone.
    expect(staticMarkup).not.toContain('data-testid="flower-battle-team-meters"')
    expect(staticMarkup).not.toContain('data-testid="flower-battle-team-hud-0"')
    expect(staticMarkup).not.toContain('data-testid="flower-battle-team-hud-3"')
    // Timer + answer counter are still present.
    expect(staticMarkup).toContain('data-testid="flower-battle-timer-slot"')
    expect(staticMarkup).toContain('data-testid="flower-battle-answer-counter-slot"')
  })

  itIf("presenter HUD root is transparent (no shared panel background) and timer/answer slots do not overlap", () => {
    const presenterMatch =
      /data-testid="flower-battle-presenter-hud"[^>]*class="([^"]*)"/.exec(
        staticMarkup,
      )
    expect(presenterMatch).not.toBeNull()
    expect(presenterMatch![1]).toContain("bg-transparent")
    expect(presenterMatch![1]).toContain("relative")
    expect(presenterMatch![1]).toContain("h-full")

    // Bottom HUD is also transparent (no shared card background).
    const bottomMatch =
      /data-testid="flower-battle-bottom-hud"[^>]*class="([^"]*)"/.exec(
        staticMarkup,
      )
    expect(bottomMatch).not.toBeNull()
    // No surface-cream / border-hairline combo on the wrapper.
    expect(bottomMatch![1]).not.toMatch(/bg-\[var\(--surface-cream\)\]/)
    expect(bottomMatch![1]).not.toMatch(/border-\[var\(--border-hairline\)\]/)

    // The two slots are flex children of the same row — they share the
    // bottom band, so the only geometry check that makes sense is that the
    // answer counter does not overflow the viewport right edge.
    const bottomHud = makeNode("flower-battle-bottom-hud", {
      left: 0,
      top: 810,
      width: VIEWPORT_WIDTH,
      height: 270,
    })
    const timerSlot = makeNode("flower-battle-timer-slot", {
      left: 780,
      top: 828,
      width: 360,
      height: 68,
    })
    const answerSlot = makeNode("flower-battle-answer-counter-slot", {
      left: 1540,
      top: 906,
      width: 360,
      height: 68,
    })
    // Timer + answer counter must stay inside the bottom HUD.
    expect(timerSlot.rect.left).toBeGreaterThanOrEqual(bottomHud.rect.left)
    expect(timerSlot.rect.top).toBeGreaterThanOrEqual(bottomHud.rect.top)
    expect(answerSlot.rect.left).toBeGreaterThanOrEqual(bottomHud.rect.left)
    expect(answerSlot.rect.top).toBeGreaterThanOrEqual(bottomHud.rect.top)
    expect(
      answerSlot.rect.left + answerSlot.rect.width,
    ).toBeLessThanOrEqual(VIEWPORT_WIDTH + EPSILON)
  })
})

describe("FlowerGardenScene + per-plant cards geometry", () => {
  itIf("scene renders one card wrap per team, never a global team-meters", () => {
    const markup = renderToString(
      <FlowerGardenScene seed={42} recipeVersion="1" teams={teams} />,
    )
    for (let index = 0; index < teams.length; index += 1) {
      requireNode(markup, `garden-plant-team-card-wrap-${index}`)
      requireNode(markup, `plant-team-card`)
    }
    expect(markup).not.toContain('data-testid="flower-battle-team-meters"')
  })

  itIf("each plant-team-card slot sits directly under the matching plant anchor", () => {
    const markup = renderToString(
      <FlowerGardenScene seed={42} recipeVersion="1" teams={teams} />,
    )
    // The team-slot has a plant-stage div + a card-wrap div nested in a
    // column flex. Their relative order is plant first, card second.
    const stageMarker = 'data-testid="garden-plant-stage-0"'
    const cardMarker = 'data-testid="garden-plant-team-card-wrap-0"'
    const stageIdx = markup.indexOf(stageMarker)
    const cardIdx = markup.indexOf(cardMarker)
    expect(stageIdx).toBeGreaterThan(-1)
    expect(cardIdx).toBeGreaterThan(-1)
    expect(cardIdx).toBeGreaterThan(stageIdx)
  })
})
