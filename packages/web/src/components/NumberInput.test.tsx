import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import NumberInput from "./NumberInput"

describe("NumberInput", () => {
  it("renders as type=number input", () => {
    render(<NumberInput data-testid="number-input" />)
    const input = screen.getByTestId("number-input") as HTMLInputElement
    expect(input.type).toBe("number")
  })

  it("forwards min, max, step props", () => {
    render(
      <NumberInput
        data-testid="number-input"
        min={0}
        max={100}
        step={5}
      />
    )
    const input = screen.getByTestId("number-input") as HTMLInputElement
    expect(input.min).toBe("0")
    expect(input.max).toBe("100")
    expect(input.step).toBe("5")
  })

  it("forwards value prop", () => {
    render(<NumberInput data-testid="number-input" value={42} readOnly />)
    const input = screen.getByTestId("number-input") as HTMLInputElement
    expect(input.value).toBe("42")
  })

  it("fires onChange when value changes", async () => {
    const handleChange = vi.fn()
    const user = userEvent.setup()
    render(
      <NumberInput
        data-testid="number-input"
        onChange={handleChange}
      />
    )
    const input = screen.getByTestId("number-input")
    await user.type(input, "25")
    expect(handleChange).toHaveBeenCalled()
  })

  it("respects disabled prop", () => {
    render(<NumberInput data-testid="number-input" disabled />)
    const input = screen.getByTestId("number-input") as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it("applies custom className via twMerge", () => {
    render(<NumberInput data-testid="number-input" className="custom-class" />)
    const input = screen.getByTestId("number-input")
    expect(input).toHaveClass("custom-class")
  })

  it("applies focus-visible outline styles", () => {
    render(<NumberInput data-testid="number-input" />)
    const input = screen.getByTestId("number-input")
    const className = input.className
    expect(className).toContain("focus-visible:outline-2")
    expect(className).toContain("focus-visible:outline-offset-2")
    expect(className).toContain("focus-visible:outline-[var(--color-primary)]")
  })

  it("applies disabled opacity and cursor-not-allowed", () => {
    render(<NumberInput data-testid="number-input" disabled />)
    const input = screen.getByTestId("number-input")
    const className = input.className
    expect(className).toContain("disabled:cursor-not-allowed")
    expect(className).toContain("disabled:opacity-60")
  })
})
