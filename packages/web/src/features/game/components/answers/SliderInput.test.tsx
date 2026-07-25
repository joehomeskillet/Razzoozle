import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import SliderInput from "./SliderInput"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      if (key === "game:slider.submitted") return "Submitted"
      if (key === "game:slider.submit") return "Submit Answer"
      return options?.defaultValue ?? key
    },
  }),
}))

describe("SliderInput Characterization & Parity Tests", () => {
  const defaultProps = {
    value: 50,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    disabled: false,
    min: 0,
    max: 100,
    step: 1,
    unit: "kg",
  }

  it("renders native range input with value, min, max, and step", () => {
    const html = renderToStaticMarkup(<SliderInput {...defaultProps} />)
    expect(html).toContain('type="range"')
    expect(html).toContain('min="0"')
    expect(html).toContain('max="100"')
    expect(html).toContain('step="1"')
    expect(html).toContain('value="50"')
  })

  it("renders value display with current value and unit label", () => {
    const html = renderToStaticMarkup(<SliderInput {...defaultProps} />)
    expect(html).toContain("50")
    expect(html).toContain("kg")
  })

  it("characterizes RED failure: missing data-testid='slider-value-display'", () => {
    const html = renderToStaticMarkup(<SliderInput {...defaultProps} />)
    expect(html).toContain('data-testid="slider-value-display"')
  })

  it("characterizes RED failure: missing aria-valuemin, aria-valuemax, and aria-valuenow", () => {
    const html = renderToStaticMarkup(<SliderInput {...defaultProps} />)
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="100"')
    expect(html).toContain('aria-valuenow="50"')
  })

  it("characterizes RED failure: missing midpoint tick mark rendering", () => {
    const html = renderToStaticMarkup(<SliderInput {...defaultProps} />)
    expect(html).toContain("<span>50</span>")
  })

  it("renders disabled state on input and submit button", () => {
    const html = renderToStaticMarkup(<SliderInput {...defaultProps} disabled={true} />)
    expect(html).toContain("disabled")
  })
})
