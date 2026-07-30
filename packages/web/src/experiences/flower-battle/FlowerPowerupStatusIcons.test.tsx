// Unit tests for FlowerPowerupStatusIcons (WP947 / WP-FLB-13).
//
// Pure TSX — no jsdom (vitest `node` env), renderToStaticMarkup only. Hard
// literals throughout (matches the effect-line copy exactly) rather than
// asserting on i18n key names, so a translation edit that changes the actual
// rendered copy is caught here too.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { FlowerPowerupStatusIcons } from "./FlowerPowerupStatusIcons"

// Mock t() to return the defaultValue with {{placeholder}} interpolation —
// same behaviour real i18next would produce for these hard-literal assertions.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: { defaultValue?: string; [param: string]: unknown },
    ) => {
      if (!options?.defaultValue) {
        return _key
      }
      return Object.entries(options).reduce(
        (str, [k, v]) =>
          k === "defaultValue" ? str : str.replaceAll(`{{${k}}}`, String(v)),
        options.defaultValue,
      )
    },
  }),
}))

describe("FlowerPowerupStatusIcons", () => {
  it("returns null when activeEffects is empty", () => {
    const html = renderToStaticMarkup(<FlowerPowerupStatusIcons activeEffects={[]} />)
    expect(html).toBe("")
  })

  it("renders the umbrella_shield status line with icon + text label", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupStatusIcons activeEffects={["umbrella_shield"]} />,
    )
    expect(html).toContain("☂ Schutz aktiv")
    expect(html).toContain('data-testid="flower-powerup-status-umbrella-shield"')
  })

  it("renders the acid_rain status line with icon + text label", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupStatusIcons activeEffects={["acid_rain"]} />,
    )
    expect(html).toContain("☁ Nächstes Wachstum −1")
    expect(html).toContain('data-testid="flower-powerup-status-acid-rain"')
  })

  it("renders the sunbeam status line with icon + text label", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupStatusIcons activeEffects={["sunbeam"]} />,
    )
    expect(html).toContain("☀ Nächstes Wachstum +1")
    expect(html).toContain('data-testid="flower-powerup-status-sunbeam"')
  })

  it("renders multiple simultaneously active effect lines", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupStatusIcons activeEffects={["umbrella_shield", "sunbeam"]} />,
    )
    expect(html).toContain("☂ Schutz aktiv")
    expect(html).toContain("☀ Nächstes Wachstum +1")
    expect(html).not.toContain("Nächstes Wachstum −1")
    expect(html).toContain('data-testid="flower-powerup-status-umbrella-shield"')
    expect(html).toContain('data-testid="flower-powerup-status-sunbeam"')
  })

  it("does not render a fertilizer status line", () => {
    // Fertilizer is not part of FlowerBattleActiveEffect; ensure copy never appears
    // for the three status effects either as a false positive.
    const html = renderToStaticMarkup(
      <FlowerPowerupStatusIcons
        activeEffects={["umbrella_shield", "acid_rain", "sunbeam"]}
      />,
    )
    expect(html).not.toContain("fertilizer")
    expect(html).not.toContain("Dünger")
    expect(html).not.toContain("flower-powerup-status-fertilizer")
  })
})
