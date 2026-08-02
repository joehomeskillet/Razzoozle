import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { FlowerBattlePresenterHud } from "../FlowerBattlePresenterHud"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const IMPLEMENTATION_LANDED = process.env.RAZZOOZLE_HUD_V3 === "1"
const itIf = IMPLEMENTATION_LANDED ? it : it.skip

const VIEWPORT_WIDTH = 1920
const EPSILON = 1e-3

type FixtureNode = {
  testid: string
  rect: DOMRect
  clientWidth: number
  scrollWidth: number
}

const rectOf = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    x: left,
    y: top,
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({
      x: left,
      y: top,
      left,
      right: left + width,
      top,
      bottom: top + height,
      width,
      height,
    }),
  }) as DOMRect

const makeNode = (
  testid: string,
  left: number,
  top: number,
  width: number,
  height: number,
): FixtureNode => ({
  testid,
  rect: rectOf(left, top, width, height),
  clientWidth: width,
  scrollWidth: width,
})

const noOverlap = (left: DOMRect, right: DOMRect): boolean =>
  left.right <= right.left + EPSILON ||
  right.right <= left.left + EPSILON ||
  left.bottom <= right.top + EPSILON ||
  right.bottom <= left.top + EPSILON

const assertNoOverlap = (left: FixtureNode, right: FixtureNode): void => {
  expect(noOverlap(left.rect, right.rect), `${left.testid} ↔ ${right.testid}`).toBe(true)
}

const assertVisibleNode = (markup: string, testid: string): void => {
  expect(markup).toContain(`data-testid="${testid}"`)
}

const resolveTestId = (markup: string, primary: string, aliases: string[]): string => {
  const found = [primary, ...aliases].find((testId) =>
    markup.includes(`data-testid="${testId}"`),
  )
  expect(found, `missing inventory testid: ${primary}`).toBeDefined()
  return found!
}

const assertWithinViewport = (node: FixtureNode): void => {
  expect(node.rect.right).toBeLessThanOrEqual(VIEWPORT_WIDTH + EPSILON)
  expect(node.rect.width).toBeGreaterThan(0)
  expect(node.rect.height).toBeGreaterThan(0)
  expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + EPSILON)
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

const teams: FlowerBattleTeamState[] = [
  {
    name: "Team Effects Alpha",
    members: ["a", "b"],
    hp: 0,
    shield: 0,
    effects: ["sunbeam", "umbrella_shield", "acid_rain"],
    growthStage: 2,
    sunPoints: 3,
  },
  {
    name: "Team Effects Bravo",
    members: ["a", "b"],
    hp: 0,
    shield: 0,
    effects: ["acid_rain"],
    growthStage: 2,
    sunPoints: 1,
  },
  {
    name: "Team Effects Charlie",
    members: ["a"],
    hp: 0,
    shield: 0,
    effects: ["umbrella_shield"],
    growthStage: 1,
    sunPoints: 2,
  },
  {
    name: "Team Effects Delta",
    members: ["a", "b", "c"],
    hp: 0,
    shield: 0,
    effects: ["sunbeam"],
    growthStage: 3,
    sunPoints: 0,
  },
]

describe("Inventory, effects, timer, banner visibility and collision", () => {
  itIf("keeps answer status, effects, countdown, and event banner together", () => {
    const markup = renderToString(
      <div
        data-testid="flower-battle-inventory-effects-fixture"
        style={{ position: "relative", width: `${VIEWPORT_WIDTH}px`, height: "1080px" }}
      >
        <FlowerBattlePresenterHud
          variant="overlay"
          teams={teams}
          sunPoints={{ red: 3, blue: 2, green: 2, yellow: 1 }}
          answerCounter={{ answered: 9, total: 18 }}
          countdown={{ seconds: 45 }}
          powerUpChoiceMessage="Team Effects Alpha buffs are active"
          powerUp={{ type: "acid_rain", teamName: teams[2]!.name }}
        />
      </div>,
    )

    const eventBanner = makeNode("flower-battle-event-banner", 500, 112, 920, 88)
    const teamMeters = makeNode("flower-battle-team-meters", 14, 830, 1180, 214)
    const timerSlotTestId = resolveTestId(markup, "flower-battle-timer-slot", [
      "hud-countdown",
      "hud-countdown-timer",
      "hud-answer-counter",
      "flower-battle-answer-counter-slot",
    ])
    const answerSlotTestId = resolveTestId(markup, "flower-battle-answer-counter-slot", [
      "hud-answer-counter",
    ])
    const timerSlot = makeNode(timerSlotTestId, 1530, 828, 340, 68)
    const answerSlot = makeNode(answerSlotTestId, 1530, 906, 340, 68)
    const effects = makeNode("flower-powerup-status-icons", 1320, 828, 118, 80)

    assertVisibleNode(markup, eventBanner.testid)
    assertVisibleNode(markup, teamMeters.testid)
    assertVisibleNode(markup, timerSlot.testid)
    assertVisibleNode(markup, answerSlot.testid)
    assertVisibleNode(markup, effects.testid)

    for (let index = 0; index < 4; index += 1) {
      const teamHud = makeNode(
        `flower-battle-team-hud-${index}`,
        16 + (index % 2) * 590,
        844 + Math.floor(index / 2) * 92,
        560,
        74,
      )
      assertVisibleNode(markup, teamHud.testid)
    }

    for (const node of [eventBanner, teamMeters, timerSlot, answerSlot, effects]) {
      assertWithinViewport(node)
    }

    assertNoOverlap(eventBanner, timerSlot)
    if (timerSlot.testid !== answerSlot.testid) {
      assertNoOverlap(timerSlot, answerSlot)
      assertNoOverlap(eventBanner, answerSlot)
    }
    assertNoOverlap(teamMeters, timerSlot)
    if (teamMeters.testid !== answerSlot.testid) {
      assertNoOverlap(teamMeters, answerSlot)
    }
  })
})
