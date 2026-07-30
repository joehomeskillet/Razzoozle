// FlowerPowerupEffects — node env, renderToStaticMarkup (WP #938.2).

import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AcidCloudTiming,
  UmbrellaTiming,
} from "./flower-battle-motion"

let mockReducedMotion: boolean | null = false

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: { defaultValue?: string; [param: string]: unknown },
    ) => {
      if (!options?.defaultValue) return _key
      return Object.entries(options).reduce(
        (str, [k, v]) =>
          k === "defaultValue" ? str : str.replaceAll(`{{${k}}}`, String(v)),
        options.defaultValue,
      )
    },
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
  animate: vi.fn(() => ({ stop: vi.fn() })),
  motion: {
    g: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode
      [key: string]: unknown
    }) => <g {...rest}>{children}</g>,
    circle: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode
      [key: string]: unknown
    }) => <circle {...rest}>{children}</circle>,
  },
}))

import { FlowerPowerupEffects } from "./FlowerPowerupEffects"
import { ANCHOR_POSITIONS } from "./flower-plant.constants"

afterEach(() => {
  mockReducedMotion = false
})

const countAttr = (html: string, testId: string): number =>
  (html.match(new RegExp(`data-testid="${testId}"`, "g")) ?? []).length

describe("FlowerPowerupEffects", () => {
  it("returns null when no effects and no fertilizer play", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={[]} />,
    )
    expect(html).toBe("")
  })

  it("docks at status-anchor / ANCHOR_POSITIONS.status", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={["sunbeam"]} />,
    )
    expect(html).toContain('data-anchor="status-anchor"')
    expect(html).toContain(
      `translate(${ANCHOR_POSITIONS.status.x} ${ANCHOR_POSITIONS.status.y})`,
    )
  })

  it("renders umbrella status with icon + text (never icon-only)", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={["umbrella_shield"]} />,
    )
    expect(html).toContain("☂ Schutz aktiv")
    expect(html).toContain('data-testid="flower-powerup-effects-status-umbrella-shield"')
    expect(html).toContain('data-testid="flower-powerup-umbrella-effect"')
    expect(html).toContain("sr-only")
  })

  it("renders acid_rain status with icon + text", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={["acid_rain"]} />,
    )
    expect(html).toContain("☁ Nächstes Wachstum −1")
    expect(html).toContain('data-testid="flower-powerup-effects-status-acid-rain"')
  })

  it("renders sunbeam status with icon + text", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={["sunbeam"]} />,
    )
    expect(html).toContain("☀ Nächstes Wachstum +1")
    expect(html).toContain('data-testid="flower-powerup-effects-status-sunbeam"')
  })

  it("does not render a fertilizer status line for persistent effects", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects
        activeEffects={["umbrella_shield", "acid_rain", "sunbeam"]}
      />,
    )
    expect(html).not.toContain("flower-powerup-effects-status-fertilizer")
    expect(html).not.toContain("Dünger")
  })

  it("renders at most 12 fertilizer grains when fertilizer plays", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={[]} fertilizerPlayKey={1} />,
    )
    const grains = countAttr(html, "flower-powerup-fertilizer-grain")
    expect(grains).toBeGreaterThan(0)
    expect(grains).toBeLessThanOrEqual(12)
    expect(html).toContain('data-testid="flower-powerup-fertilizer-effect"')
    // Transient label only in sr-only aria, not as a persistent status line
    expect(html).toContain("🌱 Dünger")
    expect(html).not.toContain("flower-powerup-effects-status-fertilizer")
  })

  it("renders exactly UmbrellaTiming.dropletCount umbrella droplets", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={["umbrella_shield"]} />,
    )
    expect(countAttr(html, "flower-powerup-umbrella-droplet")).toBe(
      UmbrellaTiming.dropletCount,
    )
    expect(UmbrellaTiming.dropletCount).toBe(3)
  })

  it("renders exactly AcidCloudTiming.dropletCount acid droplets (5–7)", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={["acid_rain"]} />,
    )
    const n = countAttr(html, "flower-powerup-acid-droplet")
    expect(n).toBe(AcidCloudTiming.dropletCount)
    expect(n).toBeGreaterThanOrEqual(5)
    expect(n).toBeLessThanOrEqual(7)
  })

  it("renders 3–5 sunbeam ray markers", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={["sunbeam"]} />,
    )
    const n = countAttr(html, "flower-powerup-sunbeam-ray")
    expect(n).toBeGreaterThanOrEqual(3)
    expect(n).toBeLessThanOrEqual(5)
  })

  it("reduced motion: text + icon without particle animations", () => {
    mockReducedMotion = true
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects
        activeEffects={["umbrella_shield", "acid_rain", "sunbeam"]}
        fertilizerPlayKey={1}
      />,
    )
    expect(html).toContain('data-reduced-motion="true"')
    // Status labels always present
    expect(html).toContain("☂ Schutz aktiv")
    expect(html).toContain("☁ Nächstes Wachstum −1")
    expect(html).toContain("☀ Nächstes Wachstum +1")
    expect(html).toContain("sr-only")
    // No particle / droplet / grain circles when reduced
    expect(countAttr(html, "flower-powerup-fertilizer-grain")).toBe(0)
    expect(countAttr(html, "flower-powerup-umbrella-droplet")).toBe(0)
    expect(countAttr(html, "flower-powerup-acid-droplet")).toBe(0)
    // Effect shells still mount (icon path)
    expect(html).toContain('data-testid="flower-powerup-umbrella-effect"')
    expect(html).toContain('data-testid="flower-powerup-sunbeam-effect"')
    expect(html).toContain('data-testid="flower-powerup-acid-rain-effect"')
    expect(html).toContain('data-testid="flower-powerup-fertilizer-effect"')
  })

  it("screenreader label is never empty when effects are active", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupEffects activeEffects={["sunbeam"]} />,
    )
    expect(html).toMatch(/class="sr-only"[^>]*>[^<]+/)
    expect(html).toContain('role="img"')
    expect(html).toContain("aria-labelledby")
  })
})
