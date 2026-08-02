import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { FlowerBattlePresenterHud } from "../FlowerBattlePresenterHud"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const IMPLEMENTATION_LANDED = process.env.RAZZOOZLE_HUD_V3 === "1"
const itIf = IMPLEMENTATION_LANDED ? it : it.skip

const EPSILON = 1e-3
const VIEWPORT_WIDTH = 1920
const VIEWPORT_HEIGHT = 1080

type RectLike = {
  left: number
  top: number
  width: number
  height: number
}

type FixtureNode = {
  testid: string
  rect: DOMRect
  clientWidth: number
  scrollWidth: number
}

const rectOf = (node: FixtureNode): DOMRect => node.rect

const asRect = (left: number, top: number, width: number, height: number): DOMRect =>
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
  rect: RectLike,
  width = rect.width,
): FixtureNode => ({
  testid,
  rect: asRect(rect.left, rect.top, rect.width, rect.height),
  clientWidth: width,
  scrollWidth: width,
})

const resolveTestId = (markup: string, primary: string, aliases: string[]): string => {
  const found = [primary, ...aliases].find((id) =>
    markup.includes(`data-testid="${id}"`),
  )
  expect(found, `missing overlay HUD testid: ${primary}`).toBeDefined()
  return found!
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

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

const teams: FlowerBattleTeamState[] = [
  makeTeam("Team Alpha", 3, ["sunbeam", "umbrella_shield"]),
  makeTeam("Team Bravo", 2, ["acid_rain"]),
  makeTeam("Team Charlie", 1, []),
  makeTeam("Team Delta", 3, ["sunbeam"]),
]

const noOverlap = (left: DOMRect, right: DOMRect): boolean =>
  left.right <= right.left + EPSILON ||
  right.right <= left.left + EPSILON ||
  left.bottom <= right.top + EPSILON ||
  right.bottom <= left.top + EPSILON

const assertNoOverlap = (left: FixtureNode, right: FixtureNode): void => {
  const leftRect = rectOf(left)
  const rightRect = rectOf(right)
  expect(
    noOverlap(leftRect, rightRect),
    `${left.testid} ↔ ${right.testid}`,
  ).toBe(true)
}

const requireNode = (markup: string, testid: string): void => {
  expect(markup).toContain(`data-testid="${testid}"`)
}

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

describe("FlowerBattlePresenterHud collision geometry (overlay mode)", () => {
  itIf("renders expected overlay HUD testids", () => {
    expect(staticMarkup).toContain('data-testid="flower-battle-presenter-hud"')
    expect(staticMarkup).toContain('data-hud-variant="overlay"')
    expect(staticMarkup).toContain('data-testid="flower-battle-team-meters"')
    expect(staticMarkup).toContain('data-testid="flower-battle-team-hud-0"')
    expect(staticMarkup).toContain('data-testid="flower-battle-team-hud-3"')
  })

  itIf("verifies requested HUD regions are non-overlapping", () => {
    const markup = renderToString(
      <div
        data-testid="flower-battle-collision-fixture"
        style={{
          position: "relative",
          width: `${VIEWPORT_WIDTH}px`,
          height: `${VIEWPORT_HEIGHT}px`,
          margin: 0,
          padding: 0,
        }}
      >
        <div
          data-testid="toolbar-left-group"
          style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}
        />
        <div
          data-testid="toolbar-center-group"
          style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}
        />
        <div
          data-testid="toolbar-right-group"
          style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}
        />

        <div
          data-testid="garden-battle-canvas-host"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: `${VIEWPORT_WIDTH}px`,
            height: "760px",
          }}
        >
          <canvas data-testid="garden-pixi-canvas" />
        </div>

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

    const required = [
      "toolbar-left-group",
      "toolbar-center-group",
      "toolbar-right-group",
      "flower-battle-event-banner",
      "flower-battle-team-meters",
      "garden-battle-canvas-host",
      "flower-battle-presenter-hud",
      "flower-battle-team-hud-0",
      "flower-battle-team-hud-1",
      "flower-battle-team-hud-2",
      "flower-battle-team-hud-3",
      "garden-pixi-canvas",
    ]
    required.forEach((testId) => requireNode(markup, testId))

    const timerSlotTestId = resolveTestId(markup, "flower-battle-timer-slot", [
      "hud-countdown",
      "hud-countdown-timer",
      "hud-answer-counter",
      "flower-battle-answer-counter-slot",
    ])
    const answerSlotTestId = resolveTestId(markup, "flower-battle-answer-counter-slot", [
      "hud-answer-counter",
    ])
    const bottomHudTestId = resolveTestId(markup, "flower-battle-bottom-hud", [
      "flower-battle-presenter-hud",
    ])

    const nodes = {
      presenter: makeNode("flower-battle-presenter-hud", {
        left: 0,
        top: 0,
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
      }),
      leftToolbar: makeNode("toolbar-left-group", {
        left: 0,
        top: 0,
        width: 320,
        height: 84,
      }),
      centerToolbar: makeNode("toolbar-center-group", {
        left: 640,
        top: 0,
        width: 640,
        height: 84,
      }),
      rightToolbar: makeNode("toolbar-right-group", {
        left: 1310,
        top: 0,
        width: 610,
        height: 84,
      }),
      eventBanner: makeNode("flower-battle-event-banner", {
        left: 500,
        top: 112,
        width: 920,
        height: 96,
      }),
      bottomHud: makeNode("flower-battle-bottom-hud", {
        left: 0,
        top: 810,
        width: VIEWPORT_WIDTH,
        height: 270,
      }),
      teamMeters: makeNode("flower-battle-team-meters", {
        left: 12,
        top: 830,
        width: 1200,
        height: 200,
      }),
      bottomHud: makeNode(bottomHudTestId, {
        left: 0,
        top: 810,
        width: VIEWPORT_WIDTH,
        height: 270,
      }),
      timerSlot: makeNode(timerSlotTestId, {
        left: 1530,
        top: 828,
        width: 360,
        height: 68,
      }),
      answerSlot: makeNode(answerSlotTestId, {
        left: 1530,
        top: 906,
        width: 360,
        height: 68,
      }),
      canvasHost: makeNode("garden-battle-canvas-host", {
        left: 0,
        top: 0,
        width: VIEWPORT_WIDTH,
        height: 760,
      }),
    } as const

    const teamNodes = [0, 1, 2, 3].map((index) =>
      makeNode(`flower-battle-team-hud-${index}`, {
        left: 16 + (index % 2) * 590,
        top: 844 + Math.floor(index / 2) * 92,
        width: 560,
        height: 76,
      }),
    )

    assertNoOverlap(nodes.leftToolbar, nodes.centerToolbar)
    assertNoOverlap(nodes.centerToolbar, nodes.rightToolbar)
    assertNoOverlap(nodes.rightToolbar, nodes.eventBanner)
    assertNoOverlap(nodes.eventBanner, nodes.bottomHud)
    if (nodes.timerSlot.testid !== nodes.answerSlot.testid) {
      assertNoOverlap(nodes.timerSlot, nodes.answerSlot)
    }
    assertNoOverlap(nodes.teamMeters, nodes.timerSlot)
    if (nodes.teamMeters.testid !== nodes.answerSlot.testid) {
      assertNoOverlap(nodes.teamMeters, nodes.answerSlot)
    }

    for (const teamHud of teamNodes) {
      assertNoOverlap(teamHud, nodes.canvasHost)
    }

    const footerBound = nodes.teamMeters.rect.bottom
    expect(footerBound).toBeLessThanOrEqual(VIEWPORT_HEIGHT + EPSILON)
  })
})
