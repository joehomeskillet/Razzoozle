import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import DateInput from "./DateInput"

describe("DateInput", () => {
  it("renders an input with type='date'", () => {
    render(<DateInput data-testid="date-input" />)
    const input = screen.getByTestId("date-input") as HTMLInputElement
    expect(input).toHaveAttribute("type", "date")
  })

  it("applies token-bound classes to the input element", () => {
    render(<DateInput data-testid="date-input" />)
    const input = screen.getByTestId("date-input") as HTMLInputElement

    // Verify D7 focus classes are applied
    expect(input.className).toContain("focus-visible:outline-2")
    expect(input.className).toContain("focus-visible:outline-offset-2")
    expect(input.className).toContain("focus-visible:outline-[var(--color-primary)]")

    // Verify base styling is applied
    expect(input.className).toContain("w-full")
    expect(input.className).toContain("min-h-11")
    expect(input.className).toContain("px-4")
    expect(input.className).toContain("py-3")
    expect(input.className).toContain("rounded-[var(--radius-theme)]")
    expect(input.className).toContain("bg-[var(--surface)]")
    expect(input.className).toContain("text-[var(--ink)]")
    expect(input.className).toContain("border")
    expect(input.className).toContain("border-[var(--line)]")

    // Verify disabled state classes
    expect(input.className).toContain("disabled:cursor-not-allowed")
    expect(input.className).toContain("disabled:opacity-60")
  })

  it("merges custom className with base classes", () => {
    render(<DateInput data-testid="date-input" className="custom-class" />)
    const input = screen.getByTestId("date-input")
    expect(input.className).toContain("custom-class")
    expect(input.className).toContain("w-full")
  })

  it("fires onChange event when value changes", async () => {
    const handleChange = vi.fn()
    const { getByTestId } = render(
      <DateInput data-testid="date-input" onChange={handleChange} />,
    )

    const input = getByTestId("date-input") as HTMLInputElement
    const user = userEvent.setup()

    await user.type(input, "2026-07-17")

    expect(handleChange).toHaveBeenCalled()
    expect(handleChange).toHaveBeenCalledTimes(10) // one per character
  })

  it("respects disabled attribute", () => {
    render(<DateInput data-testid="date-input" disabled />)
    const input = screen.getByTestId("date-input") as HTMLInputElement
    expect(input).toBeDisabled()
  })

  it("forwards ref to input element", () => {
    const ref = { current: null as HTMLInputElement | null }
    render(<DateInput ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
    expect(ref.current?.type).toBe("date")
  })

  it("accepts native input props like placeholder and aria-label", () => {
    render(
      <DateInput
        data-testid="date-input"
        placeholder="Select a date"
        aria-label="Date picker"
      />,
    )
    const input = screen.getByTestId("date-input")
    expect(input).toHaveAttribute("placeholder", "Select a date")
    expect(input).toHaveAttribute("aria-label", "Date picker")
  })
})
