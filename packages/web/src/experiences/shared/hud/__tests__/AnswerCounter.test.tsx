// Unit tests for AnswerCounter (experience kit HUD primitive, WP #908).
//
// Pure TSX — no jsdom (vitest `node` env), renderToStaticMarkup only.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AnswerCounter } from "../AnswerCounter"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

describe("AnswerCounter (HUD primitive)", () => {
  it("renders answered/total as visible text (3/5)", () => {
    const html = renderToStaticMarkup(<AnswerCounter answered={3} total={5} />)
    expect(html).toContain("3/5")
    expect(html).toContain("answerCounter.suffix")
  })

  it("0/0 renders without breaking", () => {
    const html = renderToStaticMarkup(<AnswerCounter answered={0} total={0} />)
    expect(html).toContain("0/0")
  })

  it("clamps non-finite and negative values to 0", () => {
    const html = renderToStaticMarkup(
      <AnswerCounter answered={Number.NaN} total={-2} />,
    )
    expect(html).toContain("0/0")
    expect(html).not.toContain("NaN")
  })

  it("marks the variant dot aria-hidden (info never color-only)", () => {
    const html = renderToStaticMarkup(
      <AnswerCounter answered={5} total={5} variant="success" />,
    )
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain("bg-state-correct")
    expect(html).toContain("5/5")
  })
})
