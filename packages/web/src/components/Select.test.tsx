import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import Select from "./Select"

describe("Select", () => {
  it("renders a select element with provided options", () => {
    render(
      <Select data-testid="select-element">
        <option value="">Select an option</option>
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </Select>,
    )

    const selectElement = screen.getByTestId("select-element")
    expect(selectElement).toBeInTheDocument()
    expect(selectElement.tagName).toBe("SELECT")

    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveValue("")
    expect(options[1]).toHaveValue("apple")
    expect(options[2]).toHaveValue("banana")
  })

  it("fires onChange with the selected value", async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(
      <Select value="" onChange={handleChange} data-testid="select-element">
        <option value="">Select</option>
        <option value="option-a">Option A</option>
        <option value="option-b">Option B</option>
      </Select>,
    )

    const selectElement = screen.getByTestId("select-element")
    await user.selectOptions(selectElement, "option-a")

    expect(handleChange).toHaveBeenCalled()
    expect(handleChange.mock.lastCall?.[0]?.target?.value).toBe("option-a")
  })

  it("respects the disabled attribute", () => {
    render(
      <Select disabled data-testid="select-element">
        <option value="a">Option A</option>
      </Select>,
    )

    const selectElement = screen.getByTestId(
      "select-element",
    ) as HTMLSelectElement
    expect(selectElement.disabled).toBe(true)
  })

  it("applies focus-visible outline classes for D7 keyboard navigation", () => {
    const { container } = render(
      <Select data-testid="select-element">
        <option value="a">Option A</option>
      </Select>,
    )

    const selectElement = container.querySelector(
      "[data-testid=select-element]",
    ) as HTMLSelectElement
    const classList = selectElement.className

    expect(classList).toContain("focus-visible:outline-2")
    expect(classList).toContain("focus-visible:outline-offset-2")
    expect(classList).toContain("focus-visible:outline-[var(--color-primary)]")
  })

  it("applies token-bound styling (no raw hex colors)", () => {
    const { container } = render(
      <Select data-testid="select-element">
        <option value="a">Option A</option>
      </Select>,
    )

    const selectElement = container.querySelector(
      "[data-testid=select-element]",
    ) as HTMLSelectElement
    const classList = selectElement.className

    expect(classList).toContain("bg-[var(--surface)]")
    expect(classList).toContain("text-[var(--ink)]")
    expect(classList).toContain("border-[var(--border-hairline)]")
    expect(classList).toContain("rounded-[var(--radius-theme)]")
    expect(classList).toContain("disabled:opacity-60")
  })

  it("forwards ref for direct DOM access", () => {
    const ref = { current: null }
    render(
      <Select ref={ref} data-testid="select-element">
        <option value="a">Option A</option>
      </Select>,
    )

    expect(ref.current).toBeInstanceOf(HTMLSelectElement)
    expect(ref.current?.tagName).toBe("SELECT")
  })

  it("accepts and merges custom className", () => {
    const { container } = render(
      <Select data-testid="select-element" className="custom-class">
        <option value="a">Option A</option>
      </Select>,
    )

    const selectElement = container.querySelector(
      "[data-testid=select-element]",
    ) as HTMLSelectElement
    expect(selectElement.className).toContain("custom-class")
    // Base classes should still be present and not overridden by custom class
    expect(selectElement.className).toContain("focus-visible:outline-2")
  })

  it("maintains 44px min-height touch target", () => {
    const { container } = render(
      <Select data-testid="select-element">
        <option value="a">Option A</option>
      </Select>,
    )

    const selectElement = container.querySelector(
      "[data-testid=select-element]",
    ) as HTMLSelectElement
    expect(selectElement.className).toContain("min-h-11")
  })
})
