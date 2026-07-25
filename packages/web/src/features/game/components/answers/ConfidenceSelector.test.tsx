import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ConfidenceSelector } from "./ConfidenceSelector"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

describe("ConfidenceSelector Component (Issue #469 / SDD #469)", () => {
  it("renders prompt and all 3 confidence options", () => {
    const html = renderToStaticMarkup(
      <ConfidenceSelector onChange={vi.fn()} />
    )

    expect(html).toContain("Wie sicher bist du?")
    expect(html).toContain("100% Sicher")
    expect(html).toContain("Unsicher")
    expect(html).toContain("Geraten")
  })

  it("marks selected option with aria-checked true", () => {
    const html = renderToStaticMarkup(
      <ConfidenceSelector value="high" onChange={vi.fn()} />
    )

    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('data-testid="confidence-option-high"')
  })

  it("supports testIdPrefix prop for player/kiosk contexts", () => {
    const html = renderToStaticMarkup(
      <ConfidenceSelector onChange={vi.fn()} testIdPrefix="solo-" />
    )

    expect(html).toContain('data-testid="solo-confidence-container"')
    expect(html).toContain('data-testid="solo-confidence-option-high"')
  })

  it("applies disabled attributes when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <ConfidenceSelector onChange={vi.fn()} disabled={true} />
    )

    expect(html).toContain("disabled")
    expect(html).toContain("cursor-not-allowed")
  })

  it("renders radiogroup accessibility attributes", () => {
    const html = renderToStaticMarkup(
      <ConfidenceSelector onChange={vi.fn()} />
    )

    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('role="radio"')
  })

  it("exports ConfidenceSelector function component", () => {
    expect(typeof ConfidenceSelector).toBe("function")
  })
})
