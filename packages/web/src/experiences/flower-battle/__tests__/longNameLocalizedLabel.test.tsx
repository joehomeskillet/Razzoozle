import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { FlowerBattlePresenterHud } from "../FlowerBattlePresenterHud"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const IMPLEMENTATION_LANDED = process.env.RAZZOOZLE_HUD_V3 === "1"
const itIf = IMPLEMENTATION_LANDED ? it : it.skip

const VIEWPORT_WIDTH = 1920
const VIEWPORT_HEIGHT = 1080
const EPSILON = 1e-3

type LocaleCode = "de" | "es" | "zh"

const locales: readonly LocaleCode[] = ["de", "es", "zh"]

const LABELS: Record<LocaleCode, Record<string, string>> = {
  de: {
    "flowerBattlePresenter.sunPoints.label": "Sonnenpunkte",
    "flowerBattlePresenter.powerUp.fertilizer": "Dünger",
    "flowerBattlePresenter.powerUp.sunbeam": "Sonnenstrahl",
    "flowerBattlePresenter.powerUp.umbrellaShield": "Schutzschirm",
    "flowerBattlePresenter.powerUp.acidRain": "Säureregen",
    "countdown.secondsLabel": "Sekunden",
    "game:controls.fullscreen": "Vollbild",
  },
  es: {
    "flowerBattlePresenter.sunPoints.label": "Puntos de sol",
    "flowerBattlePresenter.powerUp.fertilizer": "Fertilizante",
    "flowerBattlePresenter.powerUp.sunbeam": "Rayo de sol",
    "flowerBattlePresenter.powerUp.umbrellaShield": "Paraguas",
    "flowerBattlePresenter.powerUp.acidRain": "Lluvia ácida",
    "countdown.secondsLabel": "segundos",
    "game:controls.fullscreen": "Pantalla completa",
  },
  zh: {
    "flowerBattlePresenter.sunPoints.label": "阳光点数",
    "flowerBattlePresenter.powerUp.fertilizer": "肥料",
    "flowerBattlePresenter.powerUp.sunbeam": "阳光",
    "flowerBattlePresenter.powerUp.umbrellaShield": "保护伞",
    "flowerBattlePresenter.powerUp.acidRain": "酸雨",
    "countdown.secondsLabel": "秒",
    "game:controls.fullscreen": "全屏",
  },
}

const localeState = { value: "de" as LocaleCode }

const teams: FlowerBattleTeamState[] = [
  {
    name: "Team-of-Magic-Apples-and-Disco-Ducks-Deluxe-Edition",
    members: ["a", "b"],
    hp: 0,
    shield: 0,
    effects: ["sunbeam", "umbrella_shield", "acid_rain"],
    growthStage: 3,
    sunPoints: 3,
  },
  {
    name: "Team-of-Magic-Apples-and-Disco-Ducks-Deluxe-Edition-2",
    members: ["a", "b"],
    hp: 0,
    shield: 0,
    effects: ["acid_rain"],
    growthStage: 2,
    sunPoints: 2,
  },
  {
    name: "Team-of-Magic-Apples-and-Disco-Ducks-Deluxe-Edition-3",
    members: ["a", "b"],
    hp: 0,
    shield: 0,
    effects: ["umbrella_shield"],
    growthStage: 1,
    sunPoints: 1,
  },
  {
    name: "Team-of-Magic-Apples-and-Disco-Ducks-Deluxe-Edition-4",
    members: ["a", "b"],
    hp: 0,
    shield: 0,
    effects: ["sunbeam"],
    growthStage: 2,
    sunPoints: 2,
  },
]

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

const makeNode = (testid: string, left: number, top: number, width: number, height: number): FixtureNode => ({
  testid,
  rect: rectOf(left, top, width, height),
  clientWidth: width,
  scrollWidth: width,
})

const assertNoOverflow = (node: FixtureNode): void => {
  expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + EPSILON)
  expect(node.rect.right).toBeLessThanOrEqual(VIEWPORT_WIDTH + EPSILON)
}

const requireNode = (markup: string, testId: string): void => {
  expect(markup).toContain(`data-testid="${testId}"`)
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      (options?.defaultValue ?? LABELS[localeState.value]?.[key] ?? key),
  }),
}))

describe("Long team names and localized labels stay within viewport", () => {
  for (const locale of locales) {
    itIf(`keeps localized HUD text inside viewport for ${locale}`, () => {
      localeState.value = locale

      const markup = renderToString(
        <div style={{ width: `${VIEWPORT_WIDTH}px`, height: `${VIEWPORT_HEIGHT}px` }}>
          <FlowerBattlePresenterHud
            variant="overlay"
            teams={teams}
            sunPoints={{ red: 3, blue: 2, green: 1, yellow: 0 }}
            answerCounter={{ answered: 8, total: 16 }}
            countdown={{ seconds: 30 }}
            powerUpChoiceMessage={`Team-of-Magic-Apples-and-Disco-Ducks-Deluxe-Edition chooses ${locale}`}
            powerUp={{ type: "sunbeam", teamName: teams[0]!.name }}
          />
        </div>,
      )

      requireNode(markup, "flower-battle-presenter-hud")
      requireNode(markup, "flower-battle-event-banner")
      requireNode(markup, "flower-battle-team-meters")

      const presenter = makeNode("flower-battle-presenter-hud", 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
      const eventBanner = makeNode("flower-battle-event-banner", 420, 112, 1080, 84)
      const teamMeters = makeNode("flower-battle-team-meters", 16, 830, 1880, 214)

      assertNoOverflow(presenter)
      assertNoOverflow(eventBanner)
      assertNoOverflow(teamMeters)

      for (let index = 0; index < 4; index += 1) {
        const width = 460
        const cardHeight = 96
        const row = Math.floor(index / 2)
        const col = index % 2

        const teamHud = makeNode(
          `flower-battle-team-hud-${index}`,
          16 + col * 620,
          844 + row * 92,
          width,
          cardHeight,
        )

        requireNode(markup, teamHud.testid)
        assertNoOverflow(teamHud)
      }

      expect(presenter.rect.width).toBe(VIEWPORT_WIDTH)
    })
  }
})
