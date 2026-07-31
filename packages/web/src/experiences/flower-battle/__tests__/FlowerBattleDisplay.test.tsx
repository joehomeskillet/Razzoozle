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
  animate: vi.fn(() => ({
    stop: vi.fn(),
    then: (fn: () => void) => Promise.resolve().then(fn),
  })),
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
import { GardenBattleCanvasHost } from "../GardenBattleCanvasHost"
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
  it("renders GardenBattleCanvasHost and presenter HUD from a real payload (WP-PIX-05B)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={flowerBattleEnvelope()} />,
    )

    expect(html).toContain('data-testid="flower-battle-display"')
    expect(html).toContain('data-testid="garden-battle-canvas-host"')
    expect(html).toContain('data-testid="garden-pixi-canvas"')
    expect(html).toContain('data-testid="flower-battle-presenter-hud"')
    expect(html).toContain('data-testid="flower-battle-team-hud-0"')
    expect(html).toContain('data-testid="flower-battle-team-hud-1"')
    // Default quality path is canvas, not the DOM garden scene.
    expect(html).not.toContain('data-testid="flower-garden-scene"')
  })

  it("binds the wire seed and recipeVersion onto the canvas host", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={flowerBattleEnvelope()} />,
    )

    expect(html).toContain('data-seed="424242"')
    expect(html).toContain('data-recipe-version="1"')
  })

  it("threads answered/total into the presenter HUD answer counter", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ answered: 4, total: 8 })}
      />,
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

  it("renders the canvas host when the payload has no teams yet", () => {
    const envelope = flowerBattleEnvelope()
    envelope.payload!.data!.state!.teams = []

    const html = renderToStaticMarkup(<FlowerBattleDisplay data={envelope} />)

    expect(html).toContain('data-testid="garden-battle-canvas-host"')
    expect(html).toContain('data-testid="garden-pixi-canvas"')
    expect(html).toContain('data-testid="flower-battle-presenter-hud"')
  })

  it("renders safely when the envelope has no flowerBattle payload at all (defensive)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={{ mode: "flowerBattle", phase: "intro" }} />,
    )

    expect(html).toContain('data-testid="flower-battle-display"')
    expect(html).toContain('data-testid="garden-battle-canvas-host"')
    expect(html).toContain('data-testid="flower-battle-presenter-hud"')
  })

  it("retains deterministic FlowerGardenScene static fallback contract via host", () => {
    // Display always mounts GardenBattleCanvasHost; static/error path inside
    // the host still renders FlowerGardenScene (seed/recipe/teams).
    const html = renderToStaticMarkup(
      <GardenBattleCanvasHost
        teams={flowerBattleEnvelope().payload!.data!.state!.teams}
        quality="static"
        seed="424242"
        recipeVersion={1}
      />,
    )
    expect(html).toContain('data-testid="garden-static-fallback"')
    expect(html).toContain('data-testid="flower-garden-scene"')
    expect(html).toContain('data-seed="424242"')
    expect(html).toContain('data-recipe-version="1"')
  })

  it("clips its own box so an oversized child can never leak into a page scrollbar (WP-958B)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={flowerBattleEnvelope()} />,
    )
    const rootMatch =
      /data-testid="flower-battle-display"[^>]*class="([^"]*)"/.exec(html)
    expect(rootMatch).not.toBeNull()
    expect(rootMatch![1]).toContain("overflow-hidden")
  })

  it("never renders an h-screen viewport that could exceed its parent's box (ADR-013)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={flowerBattleEnvelope()} />,
    )
    expect(html).not.toContain("h-screen")
  })

  it("uses full-bleed canvas + absolute HUD overlays for experience-immersive stage", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={flowerBattleEnvelope()} />,
    )

    // Immersive stage: relative box, full height, clipped — canvas is the
    // background of the whole presenter surface, HUD floats on top.
    const rootMatch =
      /data-testid="flower-battle-display"[^>]*class="([^"]*)"/.exec(html)
    expect(rootMatch).not.toBeNull()
    expect(rootMatch![1]).toContain("relative")
    expect(rootMatch![1]).toContain("h-full")
    expect(rootMatch![1]).toContain("overflow-hidden")
    expect(html).toContain('data-presenter-layout="experience-immersive"')

    // Canvas host is absolute inset-0 (not a flex-1 flow sibling under HUD).
    const hostMatch =
      /data-testid="garden-battle-canvas-host"[^>]*class="([^"]*)"/.exec(html)
    expect(hostMatch).not.toBeNull()
    expect(hostMatch![1]).toContain("absolute")
    expect(hostMatch![1]).toContain("inset-0")

    // HUD shell is absolute overlay with pointer-events-none (chips re-enable).
    const hudMatch =
      /data-testid="flower-battle-display-hud"[^>]*class="([^"]*)"/.exec(html)
    expect(hudMatch).not.toBeNull()
    expect(hudMatch![1]).toContain("absolute")
    expect(hudMatch![1]).toContain("inset-0")
    expect(hudMatch![1]).toContain("pointer-events-none")

    // Overlay HUD variant exposes team meters + answer counter.
    expect(html).toContain('data-hud-variant="overlay"')
    expect(html).toContain('data-testid="flower-battle-team-meters"')
    expect(html).toContain('data-testid="hud-answer-counter"')
  })
})
