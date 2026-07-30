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
  animate: vi.fn(() => Promise.resolve()),
  motion: {
    g: ({
      children,
      id,
      transform,
      dangerouslySetInnerHTML,
    }: {
      children?: React.ReactNode
      id?: string
      transform?: string
      dangerouslySetInnerHTML?: { __html: string }
    }) => (
      <g id={id} transform={transform}>
        {dangerouslySetInnerHTML ? (
          <g dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
        ) : null}
        {children}
      </g>
    ),
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
})
