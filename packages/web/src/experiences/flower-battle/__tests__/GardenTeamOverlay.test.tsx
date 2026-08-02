import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  GardenPixiHookValue,
  GardenScene,
} from "../garden-pixi.types"
import type { LetterboxTransform } from "../rendering/gardenViewport"
import type { PlotAnchor } from "../rendering/plotAnchors"

const { useGardenPixiApplication } = vi.hoisted(() => ({
  useGardenPixiApplication: vi.fn<() => GardenPixiHookValue>(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

vi.mock("../GardenBattleCanvasHost", () => ({
  useGardenPixiApplication,
}))

import { GardenTeamOverlay } from "../GardenTeamOverlay"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const teams: FlowerBattleTeamState[] = [
  {
    name: "Red",
    members: [],
    hp: 0,
    shield: 0,
    effects: [],
    growthStage: 1,
    sunPoints: 1,
  },
  {
    name: "Blue",
    members: [],
    hp: 0,
    shield: 0,
    effects: [],
    growthStage: 2,
    sunPoints: 2,
  },
]

const readSlotStyle = (html: string, index: number): string => {
  const match = html.match(
    new RegExp(`data-testid="garden-team-overlay-slot-${index}"[^>]*style="([^"]+)"`),
  )
  expect(match?.[1]).toBeDefined()
  return match?.[1] ?? ""
}

const readStyleValue = (style: string, property: string): number => {
  const match = style.match(new RegExp(`${property}:([\\d.]+)%`))
  expect(match?.[1]).toBeDefined()
  return Number(match?.[1])
}

describe("GardenTeamOverlay", () => {
  beforeEach(() => {
    useGardenPixiApplication.mockReset()
  })

  it("positions cards from live plot anchors projected through the scene letterbox", () => {
    const scene: GardenScene & {
      getPlotAnchors(): readonly PlotAnchor[]
      getLetterbox(): LetterboxTransform
    } = {
      updateLayout: vi.fn(),
      destroy: vi.fn(),
      getPlotAnchors: () => [
        { index: 0, x: 240, y: 600 },
        { index: 1, x: 760, y: 600 },
      ],
      getLetterbox: () => ({
        scale: 0.5,
        offsetX: 20,
        offsetY: 100,
        screen: { width: 1000, height: 500 },
        logical: { width: 1920, height: 1080 },
      }),
    }
    useGardenPixiApplication.mockReturnValue({
      app: null,
      isReady: true,
      error: null,
      scene,
    })

    const html = renderToStaticMarkup(
      <GardenTeamOverlay teams={teams} viewport={{ width: 1000, height: 500 }} />,
    )

    expect(readStyleValue(readSlotStyle(html, 0), "left")).toBeCloseTo(7)
    expect(readStyleValue(readSlotStyle(html, 0), "top")).toBeCloseTo(80)
    expect(readStyleValue(readSlotStyle(html, 1), "left")).toBeCloseTo(33)
    expect(readStyleValue(readSlotStyle(html, 1), "top")).toBeCloseTo(80)
  })

  it("keeps the overlay below presenter HUD chrome", () => {
    useGardenPixiApplication.mockReturnValue({
      app: null,
      isReady: false,
      error: null,
      scene: null,
    })

    const html = renderToStaticMarkup(
      <GardenTeamOverlay teams={teams} viewport={{ width: 1000, height: 500 }} />,
    )

    expect(html).toContain(
      'class="pointer-events-none absolute inset-0 z-10"',
    )
    expect(html).not.toContain("z-30")
  })
})
