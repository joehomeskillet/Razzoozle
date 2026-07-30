import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

vi.mock("motion/react", () => ({
  useReducedMotion: () => true,
  useMotionValue: (initial: number) => {
    let current = initial
    return {
      get: () => current,
      set: (value: number) => {
        current = value
      },
    }
  },
  animate: vi.fn(() => ({ stop: vi.fn(), then: (fn: () => void) => Promise.resolve().then(fn) })),
  motion: {
    g: ({
      children,
      id,
      transform,
      dangerouslySetInnerHTML,
      ...rest
    }: {
      children?: React.ReactNode
      id?: string
      transform?: string
      dangerouslySetInnerHTML?: { __html: string }
      [key: string]: unknown
    }) => (
      <g id={id} transform={transform} {...rest}>
        {dangerouslySetInnerHTML ? (
          <g dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
        ) : null}
        {children}
      </g>
    ),
    circle: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode
      [key: string]: unknown
    }) => <circle {...rest}>{children}</circle>,
  },
}))

import { FlowerBattleDisplay } from "../FlowerBattleDisplay"
import type { ExperienceTransition } from "@razzoozle/common/types/game/experience"

const flowerBattleEnvelope = (
  overrides: Partial<ExperienceTransition> = {},
): ExperienceTransition => ({
  mode: "flowerBattle",
  phase: "question",
  answered: 3,
  total: 10,
  phaseDurationMs: 20_000,
  payload: {
    mode: "flowerBattle",
    data: {
      state: {
        phase: "round1",
        teams: [
          {
            name: "Rot",
            members: ["p1", "p2"],
            hp: 3,
            shield: 0,
            effects: ["sunbeam"],
            growthStage: 3,
            sunPoints: 2,
          },
          {
            name: "Blau",
            members: ["p3"],
            hp: 1,
            shield: 1,
            effects: [],
            growthStage: 1,
            sunPoints: 1,
          },
        ],
        background: { seed: "424242", recipeVersion: 1 },
        powerups: [],
      },
    },
  },
  ...overrides,
})

describe("FlowerBattleDisplay", () => {
  it("renders the garden scene and presenter HUD from a real payload", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={flowerBattleEnvelope()} />,
    )

    expect(html).toContain('data-testid="flower-battle-display"')
    expect(html).toContain('data-testid="flower-garden-scene"')
    expect(html).toContain('data-testid="flower-battle-presenter-hud"')
    expect(html).toContain('data-testid="garden-team-slot-0"')
    expect(html).toContain('data-testid="garden-team-slot-1"')
    expect(html).toContain('data-testid="flower-battle-team-hud-0"')
    expect(html).toContain('data-testid="flower-battle-team-hud-1"')
  })

  it("binds the wire seed and recipeVersion onto the garden scene", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={flowerBattleEnvelope()} />,
    )

    expect(html).toContain('data-seed="424242"')
    expect(html).toContain('data-recipe-version="1"')
  })

  it("feeds FlowerPlant from team.growthStage, not sunPoints", () => {
    // growthStage=9 but sunPoints=0 — only the wire growthStage field may
    // reach FlowerPlant; a sunPoints-derived value would render stage 0.
    const envelope = flowerBattleEnvelope()
    envelope.payload!.data!.state!.teams[0]!.growthStage = 9
    envelope.payload!.data!.state!.teams[0]!.sunPoints = 0

    const html = renderToStaticMarkup(<FlowerBattleDisplay data={envelope} />)

    expect(html).toContain('data-growth-stage="9"')
  })

  it("threads answered/total into the presenter HUD answer counter", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={flowerBattleEnvelope({ answered: 4, total: 8 })} />,
    )

    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain("4/8")
  })

  it("exposes phase + phaseDurationMs as data attributes, never question text", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={flowerBattleEnvelope()} />,
    )

    expect(html).toContain('data-phase="question"')
    expect(html).toContain('data-flower-battle-phase="round1"')
    expect(html).toContain('data-phase-duration-ms="20000"')
    expect(html).not.toContain('data-testid="question-text"')
  })

  it("renders an empty garden when the payload has no teams yet", () => {
    const envelope = flowerBattleEnvelope()
    envelope.payload!.data!.state!.teams = []

    const html = renderToStaticMarkup(<FlowerBattleDisplay data={envelope} />)

    expect(html).toContain('data-testid="flower-garden-scene"')
    expect(html).not.toContain('data-testid="garden-team-slot-0"')
  })

  it("renders safely when the envelope has no flowerBattle payload at all (defensive)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={{ mode: "flowerBattle", phase: "intro" }} />,
    )

    expect(html).toContain('data-testid="flower-battle-display"')
    expect(html).toContain('data-testid="flower-garden-scene"')
  })
})
