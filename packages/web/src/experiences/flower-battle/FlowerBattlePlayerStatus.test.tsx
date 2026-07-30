// Unit tests for FlowerBattlePlayerStatus (WP940 / WP-FLB-15).
//
// Pure TSX — no jsdom (vitest `node` env), renderToStaticMarkup only. Hard
// literals throughout (matches the header/effect-line copy exactly) rather
// than asserting on i18n key names, so a translation edit that changes the
// actual rendered copy is caught here too.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  FlowerBattlePlayerStatus,
  type FlowerBattleActiveEffect,
} from "./FlowerBattlePlayerStatus"

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

const baseProps = {
  mode: "flowerBattle",
  team: "red",
  teamName: "Rot",
  growthStage: 4,
  maxGrowthStage: 10,
  sunPoints: 2,
  activeEffects: [] as FlowerBattleActiveEffect[],
}

describe("FlowerBattlePlayerStatus", () => {
  it("composes the header with team, growth stage, and sun points", () => {
    const html = renderToStaticMarkup(<FlowerBattlePlayerStatus {...baseProps} />)
    expect(html).toContain("Team Rot · Blüte 4/10 · ☀ 2/3")
  })

  it("renders the umbrella_shield status line with icon + text label", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePlayerStatus {...baseProps} activeEffects={["umbrella_shield"]} />,
    )
    expect(html).toContain("☂ Schutz aktiv")
    expect(html).toContain('data-testid="flower-battle-effect-umbrella-shield"')
  })

  it("renders the acid_rain status line with icon + text label", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePlayerStatus {...baseProps} activeEffects={["acid_rain"]} />,
    )
    expect(html).toContain("☁ Nächstes Wachstum −1")
    expect(html).toContain('data-testid="flower-battle-effect-acid-rain"')
  })

  it("renders the sunbeam status line with icon + text label", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePlayerStatus {...baseProps} activeEffects={["sunbeam"]} />,
    )
    expect(html).toContain("☀ Nächstes Wachstum +1")
    expect(html).toContain('data-testid="flower-battle-effect-sunbeam"')
  })

  it("renders no status line when no effect is active", () => {
    const html = renderToStaticMarkup(<FlowerBattlePlayerStatus {...baseProps} />)
    expect(html).not.toContain("flower-battle-effect-")
    expect(html).not.toContain("Schutz aktiv")
    expect(html).not.toContain("Wachstum")
  })

  it("renders multiple simultaneously active effect lines", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePlayerStatus
        {...baseProps}
        activeEffects={["umbrella_shield", "sunbeam"]}
      />,
    )
    expect(html).toContain("☂ Schutz aktiv")
    expect(html).toContain("☀ Nächstes Wachstum +1")
    expect(html).not.toContain("Nächstes Wachstum −1")
  })

  it("renders null for a foreign experience mode", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePlayerStatus {...baseProps} mode="pyramidClimb" />,
    )
    expect(html).toBe("")
  })

  it("renders null for classic (no experience mode)", () => {
    const html = renderToStaticMarkup(<FlowerBattlePlayerStatus {...baseProps} mode="classic" />)
    expect(html).toBe("")
  })

  it("clamps sun points display at the max threshold", () => {
    const html = renderToStaticMarkup(
      <FlowerBattlePlayerStatus {...baseProps} sunPoints={99} />,
    )
    expect(html).toContain("☀ 3/3")
  })
})
