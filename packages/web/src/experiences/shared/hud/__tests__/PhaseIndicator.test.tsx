// Unit tests for PhaseIndicator (experience kit HUD primitive, WP #908).
//
// Pure TSX — no jsdom (vitest `node` env), renderToStaticMarkup only.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { PhaseIndicator } from "../PhaseIndicator"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

describe("PhaseIndicator (HUD primitive)", () => {
  it("renders current and total as visible text (Question 1 of 5)", () => {
    const html = renderToStaticMarkup(<PhaseIndicator current={1} total={5} />)
    expect(html).toContain("1 phaseIndicator.of 5")
    expect(html).toContain("phaseIndicator.defaultName")
  })

  it("uses the label prop as phase noun when given", () => {
    const html = renderToStaticMarkup(
      <PhaseIndicator current={2} total={4} label="Runde" />,
    )
    expect(html).toContain("Runde")
    expect(html).toContain("2 phaseIndicator.of 4")
  })

  it("clamps non-finite values to 0", () => {
    const html = renderToStaticMarkup(
      <PhaseIndicator current={Number.NaN} total={Number.POSITIVE_INFINITY} />,
    )
    expect(html).toContain("0 phaseIndicator.of 0")
    expect(html).not.toContain("NaN")
    expect(html).not.toContain("Infinity")
  })
})
