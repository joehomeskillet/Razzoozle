// Unit tests for RoundProgress (experience kit HUD primitive, WP #908).
//
// Pure TSX — no jsdom, no Testing Library (web runs vitest under the `node`
// env, see vitest.config.ts). Assertions use renderToStaticMarkup; the
// react-i18next mock returns keys/defaultValues so tests stay structural.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { RoundProgress } from "../RoundProgress"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

describe("RoundProgress (HUD primitive)", () => {
  it("renders role=progressbar with aria min/max", () => {
    const html = renderToStaticMarkup(<RoundProgress value={50} />)
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="100"')
  })

  it("0% -> aria-valuenow=0 and numeric text 0", () => {
    const html = renderToStaticMarkup(<RoundProgress value={0} />)
    expect(html).toContain('aria-valuenow="0"')
    expect(html).toContain("0 roundProgress.unit")
  })

  it("50% -> aria-valuenow=50 and numeric text 50", () => {
    const html = renderToStaticMarkup(<RoundProgress value={50} />)
    expect(html).toContain('aria-valuenow="50"')
    expect(html).toContain("50 roundProgress.unit")
  })

  it("100% -> aria-valuenow=100 and numeric text 100", () => {
    const html = renderToStaticMarkup(<RoundProgress value={100} />)
    expect(html).toContain('aria-valuenow="100"')
    expect(html).toContain("100 roundProgress.unit")
  })

  it("clamps out-of-range values instead of breaking aria", () => {
    const html = renderToStaticMarkup(<RoundProgress value={250} />)
    expect(html).toContain('aria-valuenow="100"')
  })

  it("clamps non-finite values to 0 (never NaN)", () => {
    const html = renderToStaticMarkup(<RoundProgress value={Number.NaN} />)
    expect(html).toContain('aria-valuenow="0"')
    expect(html).not.toContain("NaN")
  })

  it("always shows the numeric value as text (never bar-only)", () => {
    const html = renderToStaticMarkup(<RoundProgress value={42} />)
    expect(html).toContain("42")
    expect(html).toContain("roundProgress.unit")
  })

  it("uses the default localized label when no label prop is given", () => {
    const html = renderToStaticMarkup(<RoundProgress value={10} />)
    expect(html).toContain("roundProgress.label")
    expect(html).toContain('aria-label="roundProgress.label"')
  })

  it("prefers an explicit label prop for text and aria-label", () => {
    const html = renderToStaticMarkup(
      <RoundProgress value={10} label="Rundenfortschritt" />,
    )
    expect(html).toContain("Rundenfortschritt")
    expect(html).toContain('aria-label="Rundenfortschritt"')
  })

  it.each([
    ["default", "bg-primary"],
    ["success", "bg-state-correct"],
    ["warning", "bg-accent"],
  ] as const)(
    "variant %s uses its token-mapped fill class",
    (variant, fill) => {
      const html = renderToStaticMarkup(
        <RoundProgress value={50} variant={variant} />,
      )
      expect(html).toContain(fill)
    },
  )
})
