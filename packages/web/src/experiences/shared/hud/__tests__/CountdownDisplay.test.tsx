// Unit tests for CountdownDisplay (experience kit HUD primitive, WP #908).
//
// Pure TSX — no jsdom (vitest `node` env), renderToStaticMarkup only.
// Critical coverage: 0s renders as "0"; NaN/undefined/negative never leak.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { CountdownDisplay } from "../CountdownDisplay"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

describe("CountdownDisplay (HUD primitive)", () => {
  it.each([10, 5, 1, 0])("%is renders the number as text", (seconds) => {
    const html = renderToStaticMarkup(<CountdownDisplay seconds={seconds} />)
    expect(html).toContain(`>${seconds}<`)
  })

  it("0s renders literally as 0 (not empty, not NaN)", () => {
    const html = renderToStaticMarkup(<CountdownDisplay seconds={0} />)
    expect(html).toContain(">0<")
    expect(html).not.toContain("NaN")
    expect(html).not.toContain("undefined")
  })

  it("NaN clamps to 0", () => {
    const html = renderToStaticMarkup(<CountdownDisplay seconds={Number.NaN} />)
    expect(html).toContain(">0<")
    expect(html).not.toContain("NaN")
  })

  it("undefined (runtime) clamps to 0", () => {
    const html = renderToStaticMarkup(
      <CountdownDisplay seconds={undefined as unknown as number} />,
    )
    expect(html).toContain(">0<")
    expect(html).not.toContain("undefined")
  })

  it("negative values clamp to 0", () => {
    const html = renderToStaticMarkup(<CountdownDisplay seconds={-7} />)
    expect(html).toContain(">0<")
  })

  it("fractional seconds floor to whole seconds", () => {
    const html = renderToStaticMarkup(<CountdownDisplay seconds={4.9} />)
    expect(html).toContain(">4<")
  })

  it("exposes role=timer with a localized aria-label", () => {
    const html = renderToStaticMarkup(<CountdownDisplay seconds={10} />)
    expect(html).toContain('role="timer"')
    expect(html).toContain('aria-label="countdown.ariaLabel"')
  })

  it("shows the default localized seconds label", () => {
    const html = renderToStaticMarkup(<CountdownDisplay seconds={10} />)
    expect(html).toContain("countdown.secondsLabel")
  })

  it("prefers an explicit label prop", () => {
    const html = renderToStaticMarkup(
      <CountdownDisplay seconds={10} label="Sek." />,
    )
    expect(html).toContain("Sek.")
  })

  it.each([
    ["default", "text-[var(--game-fg)]"],
    ["warning", "text-[var(--streak-color)]"],
    ["critical", "text-[var(--timer-urgent)]"],
  ] as const)("variant %s uses its token-mapped text class", (variant, cls) => {
    const html = renderToStaticMarkup(
      <CountdownDisplay seconds={5} variant={variant} />,
    )
    expect(html).toContain(cls)
  })
})
