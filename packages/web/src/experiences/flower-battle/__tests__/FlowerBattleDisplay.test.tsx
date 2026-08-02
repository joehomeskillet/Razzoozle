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
    // FB-HUD4: per-team cards live in the scene (static fallback) or in the
    // canvas (Pixi host), NOT as a global bottom HUD.
    expect(html).not.toContain('data-testid="flower-battle-team-hud-0"')
    expect(html).not.toContain('data-testid="flower-battle-team-hud-1"')
    expect(html).not.toContain('data-testid="flower-battle-team-meters"')
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

  it("threads phaseDurationMs into the presenter HUD countdown timer", () => {
    const html = renderToStaticMarkup(<FlowerBattleDisplay data={flowerBattleEnvelope()} />)

    expect(html).toContain('data-testid="flower-battle-timer-slot"')
    expect(html).toContain('data-testid="hud-countdown-display"')
    expect(html).toContain("20")
  })

  it("hides the presenter countdown during flower-battle start/greeting phases", () => {
    const envelope = flowerBattleEnvelope({ phaseDurationMs: 45_000 })
    if (envelope.payload?.data?.state) {
      envelope.payload.data.state.phase = "start"
    }

    const html = renderToStaticMarkup(
      <FlowerBattleDisplay data={envelope} />,
    )

    expect(html).toContain("data-testid=\"flower-battle-presenter-hud\"")
    expect(html).not.toContain("hud-countdown-display")
  })

  // WP-B (fb-hud5): keep the central timer visible through transient invalid
  // wire payloads. The audience must see the clock tick from 20 down to 0
  // even if the server briefly sends a 10s-boundary glitch.
  it("keeps the presenter countdown visible when phaseDurationMs is undefined during question play", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ phaseDurationMs: undefined })}
      />,
    )

    expect(html).toContain('data-testid="flower-battle-timer-slot"')
    expect(html).toContain('data-testid="hud-countdown-display"')
    // Safe default is 0 (clamped), never empty.
    expect(html).toContain(">0<")
  })

  it("keeps the presenter countdown visible when phaseDurationMs is 0", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ phaseDurationMs: 0 })}
      />,
    )

    expect(html).toContain('data-testid="hud-countdown-display"')
    expect(html).toContain(">0<")
  })

  it("keeps the presenter countdown visible when phaseDurationMs is NaN", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ phaseDurationMs: Number.NaN })}
      />,
    )

    expect(html).toContain('data-testid="hud-countdown-display"')
    expect(html).toContain(">0<")
  })

  it("keeps the presenter countdown visible when phaseDurationMs is negative", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ phaseDurationMs: -5_000 })}
      />,
    )

    expect(html).toContain('data-testid="hud-countdown-display"')
    expect(html).toContain(">0<")
  })

  it("keeps the answer counter visible when answered is undefined", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ answered: undefined, total: 8 })}
      />,
    )

    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain("0/8")
  })

  it("keeps the answer counter visible when total is undefined", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ answered: 4, total: undefined })}
      />,
    )

    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain("4/0")
  })

  it("keeps the answer counter visible when answered and total are both 0", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ answered: 0, total: 0 })}
      />,
    )

    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain("0/0")
  })

  it("keeps the answer counter visible when answered and total are both undefined", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ answered: undefined, total: undefined })}
      />,
    )

    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain("0/0")
  })

  it("keeps both timer and answer counter visible for a near-end-of-round payload (phaseDurationMs=500)", () => {
    const html = renderToStaticMarkup(
      <FlowerBattleDisplay
        data={flowerBattleEnvelope({ phaseDurationMs: 500 })}
      />,
    )

    expect(html).toContain('data-testid="hud-countdown-display"')
    expect(html).toContain(">1<")
    expect(html).toContain('data-testid="hud-answer-counter"')
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

    // WP-G: full-bleed canvas behind the toolbar — the display root is
    // absolute inset-0 of its closest positioned ancestor (the content area,
    // which fills the section when `fullBleedCanvas` removes the toolbar-h
    // padding) so the Pixi canvas paints behind the floating flow toolbar
    // (no body cream / page bg strip behind it). Previously `relative h-full
    // w-full` sized the root to the area below the 4rem padding and left the
    // toolbar's vertical band empty.
    const rootMatch =
      /data-testid="flower-battle-display"[^>]*class="([^"]*)"/.exec(html)
    expect(rootMatch).not.toBeNull()
    expect(rootMatch![1]).toContain("absolute")
    expect(rootMatch![1]).toContain("inset-0")
    expect(rootMatch![1]).not.toContain("relative")
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

    // Overlay HUD variant exposes timer + answer counter.
    expect(html).toContain('data-hud-variant="overlay"')
    // FB-HUD4: no global team-meters / team-hud testids in the presenter HUD.
    expect(html).not.toContain('data-testid="flower-battle-team-meters"')
    expect(html).not.toContain('data-testid="flower-battle-team-hud-0"')
    expect(html).toContain('data-testid="hud-answer-counter"')
  })
})
