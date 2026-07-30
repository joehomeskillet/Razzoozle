// FlowerPlant — growth-stage skeleton (node env, renderToStaticMarkup).

import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

let mockReducedMotion: boolean | null = false

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { defaultValue?: string; count?: number; stage?: number },
    ) => options?.defaultValue ?? key,
  }),
}))

vi.mock("motion/react", () => ({
  useReducedMotion: () => mockReducedMotion,
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
  },
}))

import { FlowerPlant } from "./FlowerPlant"
import {
  buildFlowerPlantAriaLabel,
  clampGrowthStage,
  FLOWER_HEAD_PARTS,
  GROWTH_STAGES,
  PLANT_ANCHOR_IDS,
} from "./flower-plant.constants"

afterEach(() => {
  mockReducedMotion = false
})

const renderPlant = (
  growthStage?: number,
  variant: "round" | "tulip" | "sun" | "bell" = "round",
) =>
  renderToStaticMarkup(
    <FlowerPlant growthStage={growthStage} variant={variant} />,
  )

describe("FlowerPlant", () => {
  it("renders all 11 growth stages without error", () => {
    for (let stage = 0; stage <= 10; stage += 1) {
      const html = renderPlant(stage)
      expect(html).toContain(`data-growth-stage="${stage}"`)
      expect(html).toContain(`flower-plant-stage-${stage}`)
      expect(html).toContain('id="plant-skeleton"')
      expect(html).toContain('id="status-anchor"')
    }
  })

  it("keeps the same anchor ids across stages", () => {
    const anchors = [
      "stem-lower",
      "leaf-left-1",
      "leaf-right-1",
      "stem-upper",
      "leaf-left-2",
      "leaf-right-2",
      "bud",
      "petals",
      "face",
      "status-anchor",
    ]

    for (const stage of [0, 5, 10]) {
      const html = renderPlant(stage)
      for (const anchor of anchors) {
        expect(html).toContain(`id="${anchor}"`)
      }
    }
  })

  it("renders all four variants with flower-petals and flower-face ids", () => {
    const variants = ["round", "tulip", "sun", "bell"] as const

    for (const variant of variants) {
      const html = renderPlant(10, variant)
      expect(html).toContain('id="flower-petals"')
      expect(html).toContain('id="flower-face"')
      expect(html).toContain(`data-variant="${variant}"`)
      expect(FLOWER_HEAD_PARTS[variant].petals).toContain('id="flower-petals"')
      expect(FLOWER_HEAD_PARTS[variant].face).toContain('id="flower-face"')
    }
  })

  describe("clampGrowthStage", () => {
    it.each([
      [-5, 0],
      [0, 0],
      [5, 5],
      [10, 10],
      [15, 10],
    ])("clamps %i to %i", (input, expected) => {
      expect(clampGrowthStage(input)).toBe(expected)
    })

    it("falls back to stage 0 for undefined and invalid values", () => {
      expect(clampGrowthStage(undefined)).toBe(0)
      expect(clampGrowthStage(Number.NaN)).toBe(0)
    })
  })

  it("clamps growthStage prop in rendered markup", () => {
    expect(renderPlant(-5)).toContain('data-growth-stage="0"')
    expect(renderPlant(15)).toContain('data-growth-stage="10"')
    expect(renderPlant(undefined)).toContain('data-growth-stage="0"')
  })

  it("reveals petals at stage 9 and face at stage 10", () => {
    const stage9 = renderPlant(9)
    expect(stage9).toContain('id="petals"')
    expect(stage9).toContain('data-part-scale="0.92"')
    expect(stage9).toContain('id="face"')
    expect(stage9).toContain('data-part-opacity="0"')

    const stage10 = renderPlant(10)
    expect(stage10).toMatch(/id="face"[^>]*data-part-opacity="1"/)
  })

  it("hides stem at stage 0", () => {
    const html = renderPlant(0)
    expect(html).toContain('id="stem-lower"')
    expect(html).toContain('data-part-opacity="0"')
  })

  it("uses team token colours when teamColor is provided", () => {
    const html = renderToStaticMarkup(
      <FlowerPlant growthStage={5} variant="round" teamColor="red" />,
    )
    expect(html).toContain("var(--team-red)")
  })

  it("uses neutral sage fallback without teamColor", () => {
    const html = renderPlant(5)
    expect(html).toContain("var(--status-online-text)")
    expect(html).toContain("var(--team-green-ring)")
  })
})

describe("buildFlowerPlantAriaLabel — reduced motion", () => {
  const t = (
    _key: string,
    options?: { defaultValue?: string },
  ) => options?.defaultValue ?? _key

  it("includes growth delta when reduced motion and stage increased", () => {
    const label = buildFlowerPlantAriaLabel(8, 5, true, t)
    expect(label).toContain("+3 Wachstum")
    expect(label).toContain("Stufe 8")
  })

  it("omits growth note when motion is not reduced", () => {
    const label = buildFlowerPlantAriaLabel(8, 5, false, t)
    expect(label).toBe("Blütenpflanze Stufe 8")
    expect(label).not.toContain("Wachstum")
  })
})

describe("GROWTH_STAGES constants", () => {
  it("defines 11 stages with identical anchor choreography", () => {
    expect(GROWTH_STAGES).toHaveLength(11)
    expect(GROWTH_STAGES[0]?.stage).toBe(0)
    expect(GROWTH_STAGES[10]?.stage).toBe(10)
    expect(PLANT_ANCHOR_IDS).toContain("soil-anchor")
    expect(PLANT_ANCHOR_IDS).toContain("petals")
    expect(PLANT_ANCHOR_IDS).toContain("face")
  })
})
