// Unit tests for StatusBanner (experience kit HUD primitive, WP #908).
//
// Pure TSX — no jsdom (vitest `node` env), renderToStaticMarkup only.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { StatusBanner, type StatusBannerType } from "../StatusBanner"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

const ALL_TYPES: readonly StatusBannerType[] = [
  "info",
  "success",
  "warning",
  "error",
]

describe("StatusBanner (HUD primitive)", () => {
  it.each(ALL_TYPES)(
    "type %s renders role=status + aria-live=polite + message",
    (type) => {
      const html = renderToStaticMarkup(
        <StatusBanner type={type} message="Runde gestartet" />,
      )
      expect(html).toContain('role="status"')
      expect(html).toContain('aria-live="polite"')
      expect(html).toContain("Runde gestartet")
      expect(html).toContain(`statusBanner.type.${type}`)
    },
  )

  it("maps every type to a stage-token accent border", () => {
    const expected: Record<StatusBannerType, string> = {
      info: "border-l-primary",
      success: "border-l-state-correct",
      warning: "border-l-accent",
      error: "border-l-state-wrong",
    }
    for (const type of ALL_TYPES) {
      const html = renderToStaticMarkup(
        <StatusBanner type={type} message="m" />,
      )
      expect(html).toContain(expected[type])
    }
  })

  it("renders nothing for an empty message", () => {
    const html = renderToStaticMarkup(<StatusBanner type="info" message="" />)
    expect(html).toBe("")
  })

  it("never steals focus (no tabindex / autofocus / interactive role)", () => {
    const html = renderToStaticMarkup(
      <StatusBanner type="error" message="Verbindung verloren" />,
    )
    expect(html).not.toContain("tabindex")
    expect(html).not.toContain("autofocus")
    expect(html).not.toContain('role="alert"')
  })
})
