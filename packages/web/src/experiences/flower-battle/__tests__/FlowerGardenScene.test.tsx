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

import { FlowerGardenScene } from "../FlowerGardenScene"
import type { FlowerBattleTeamState } from "../flower-battle-scene.types"

const makeTeam = (name: string, sunPoints = 0): FlowerBattleTeamState => ({
  name,
  members: [],
  hp: 0,
  shield: 0,
  effects: [],
  growthStage: sunPoints,
  sunPoints,
})

const renderScene = (teamCount: number, seed = 42) => {
  const teams = Array.from({ length: teamCount }, (_, index) =>
    makeTeam(`Team ${index + 1}`, index),
  )
  return renderToStaticMarkup(
    <FlowerGardenScene seed={seed} recipeVersion="1" teams={teams} />,
  )
}

describe("FlowerGardenScene", () => {
  it("composes hud, background and actors layer regions", () => {
    const html = renderScene(2)

    expect(html).toContain('data-testid="flower-garden-scene"')
    expect(html).toContain('data-testid="garden-zone-hud"')
    expect(html).toContain('data-testid="garden-zone-background"')
    expect(html).toContain('data-testid="garden-zone-actors"')
    expect(html).toContain('aria-label="hud layer"')
    expect(html).toContain('aria-label="background layer"')
    expect(html).toContain('aria-label="actors layer"')
  })

  it("renders a deterministic background for the same seed", () => {
    const first = renderScene(2, 9001)
    const second = renderScene(2, 9001)

    expect(first).toBe(second)
  })

  it("changes background markup when the seed changes", () => {
    const first = renderScene(2, 1)
    const second = renderScene(2, 2)

    expect(first).not.toBe(second)
  })

  it.each([2, 3, 4])("renders %i team plant slots", (teamCount) => {
    const html = renderScene(teamCount)

    for (let index = 0; index < teamCount; index += 1) {
      expect(html).toContain(`data-testid="garden-team-slot-${index}"`)
      expect(html).toContain('data-layer="garden-bed"')
      expect(html).toContain('data-layer="garden-ground"')
    }
  })

  it("caps teams at four slots", () => {
    const html = renderScene(6)
    expect(html).toContain('data-team-count="4"')
    expect(html).not.toContain('data-testid="garden-team-slot-4"')
  })

  it("renders zero team slots for an empty team list (no lower bound, live 958D report)", () => {
    const html = renderScene(0)
    expect(html).toContain('data-team-count="0"')
    expect(html).not.toContain('data-testid="garden-team-slot-0"')
  })

  it("renders exactly one team slot for a single-team game (live 958D report)", () => {
    const html = renderScene(1)
    expect(html).toContain('data-team-count="1"')
    expect(html).toContain('data-testid="garden-team-slot-0"')
    expect(html).not.toContain('data-testid="garden-team-slot-1"')
  })

  it("caps every team slot's width so 1–2 teams never dwarf the scene (WP-958D)", () => {
    for (const teamCount of [1, 2, 3, 4]) {
      const html = renderScene(teamCount)
      for (let index = 0; index < teamCount; index += 1) {
        const slotMatch = html.match(
          new RegExp(`data-testid="garden-team-slot-${index}"[^>]*class="([^"]*)"`),
        )
        expect(slotMatch).not.toBeNull()
        expect(slotMatch![1]).toMatch(/max-w-\[/)
      }
    }
  })

  it("renders a single opaque full-scene backdrop behind hud/background/actors so app icons never show through (WP-958D)", () => {
    const html = renderScene(1)
    const backdropMatch = html.match(
      /data-testid="garden-scene-backdrop"[^>]*class="([^"]*)"/,
    )
    expect(backdropMatch).not.toBeNull()
    expect(backdropMatch![1]).toMatch(/\binset-0\b/)
    expect(backdropMatch![1]).not.toMatch(/bg-\S+\/\d+/)
    expect(backdropMatch![1]).toMatch(/\bbg-\S+/)

    // The backdrop must render before (i.e. behind) the safe-area zones.
    const backdropIndex = html.indexOf('data-testid="garden-scene-backdrop"')
    const hudZoneIndex = html.indexOf('aria-label="hud layer"')
    expect(backdropIndex).toBeGreaterThan(-1)
    expect(backdropIndex).toBeLessThan(hudZoneIndex)
  })
})
