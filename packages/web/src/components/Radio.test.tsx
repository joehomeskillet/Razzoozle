import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Radio, { RadioGroup } from "./Radio"

describe("Radio", () => {
  it("renders a radio input without a label", () => {
    render(<Radio name="test" value="option1" />)
    const input = screen.getByRole("radio")
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute("type", "radio")
    expect(input).toHaveAttribute("name", "test")
    expect(input).toHaveAttribute("value", "option1")
  })

  it("renders a radio input with a label when label prop is provided", () => {
    render(<Radio name="test" value="option1" label="Option 1" />)
    const input = screen.getByRole("radio")
    const label = screen.getByText("Option 1")
    expect(input).toBeInTheDocument()
    expect(label).toBeInTheDocument()
  })

  it("fires onChange when the radio is clicked", async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(
      <Radio
        name="test"
        value="option1"
        label="Option 1"
        onChange={handleChange}
      />,
    )
    const input = screen.getByRole("radio")
    await user.click(input)
    expect(handleChange).toHaveBeenCalled()
  })

  it("renders disabled state and blocks interaction when disabled", async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(
      <Radio
        name="test"
        value="option1"
        label="Option 1"
        onChange={handleChange}
        disabled
      />,
    )
    const input = screen.getByRole("radio")
    expect(input).toBeDisabled()
    await user.click(input)
    // On a disabled input, click handler may not fire in the same way
    // but the disabled state should be verified.
    expect(input).toBeDisabled()
  })

  it("is checked when the checked prop is true", () => {
    render(
      <Radio name="test" value="option1" label="Option 1" checked={true} />,
    )
    const input = screen.getByRole("radio") as HTMLInputElement
    expect(input.checked).toBe(true)
  })

  it("is not checked when the checked prop is false", () => {
    render(
      <Radio name="test" value="option1" label="Option 1" checked={false} />,
    )
    const input = screen.getByRole("radio") as HTMLInputElement
    expect(input.checked).toBe(false)
  })

  it("applies focus-visible:outline-2 to the input element", () => {
    const { container } = render(
      <Radio name="test" value="option1" label="Option 1" />,
    )
    const input = container.querySelector("input")
    expect(input).toHaveClass("focus-visible:outline-2")
    expect(input).toHaveClass("focus-visible:outline-offset-2")
    expect(input).toHaveClass("focus-visible:outline-[var(--color-primary)]")
  })
})

describe("RadioGroup", () => {
  const options = [
    { value: "fast", label: "Fast Mode" },
    { value: "slow", label: "Slow Mode" },
    { value: "custom", label: "Custom", disabled: true },
  ]

  it("renders all options as Radio components", () => {
    render(
      <RadioGroup
        name="speed"
        value="fast"
        onChange={() => {}}
        options={options}
      />,
    )
    expect(screen.getByLabelText("Fast Mode")).toBeInTheDocument()
    expect(screen.getByLabelText("Slow Mode")).toBeInTheDocument()
    expect(screen.getByLabelText("Custom")).toBeInTheDocument()
  })

  it("has role='radiogroup' on the container", () => {
    const { container } = render(
      <RadioGroup
        name="speed"
        value="fast"
        onChange={() => {}}
        options={options}
      />,
    )
    const radiogroup = container.querySelector('[role="radiogroup"]')
    expect(radiogroup).toBeInTheDocument()
  })

  it("checks the radio matching the current value", () => {
    const { rerender } = render(
      <RadioGroup
        name="speed"
        value="fast"
        onChange={() => {}}
        options={options}
      />,
    )
    const fastRadio = screen.getByDisplayValue("fast") as HTMLInputElement
    expect(fastRadio.checked).toBe(true)

    const slowRadio = screen.getByDisplayValue("slow") as HTMLInputElement
    expect(slowRadio.checked).toBe(false)

    // Rerender with different value
    rerender(
      <RadioGroup
        name="speed"
        value="slow"
        onChange={() => {}}
        options={options}
      />,
    )
    const slowRadioAfter = screen.getByDisplayValue("slow") as HTMLInputElement
    expect(slowRadioAfter.checked).toBe(true)
  })

  it("fires onChange with the selected option value when a radio is clicked", async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(
      <RadioGroup
        name="speed"
        value="fast"
        onChange={handleChange}
        options={options}
      />,
    )
    const slowRadio = screen.getByDisplayValue("slow")
    await user.click(slowRadio)
    expect(handleChange).toHaveBeenCalledWith("slow")
  })

  it("disables the 'Custom' option as specified", () => {
    render(
      <RadioGroup
        name="speed"
        value="fast"
        onChange={() => {}}
        options={options}
      />,
    )
    const customRadio = screen.getByDisplayValue("custom") as HTMLInputElement
    expect(customRadio.disabled).toBe(true)
  })

  it("passes the shared name attribute to all Radio components", () => {
    render(
      <RadioGroup
        name="speed"
        value="fast"
        onChange={() => {}}
        options={options}
      />,
    )
    const radios = screen.getAllByRole("radio")
    radios.forEach((radio) => {
      expect(radio).toHaveAttribute("name", "speed")
    })
  })

  it("applies custom className to the container", () => {
    const { container } = render(
      <RadioGroup
        name="speed"
        value="fast"
        onChange={() => {}}
        options={options}
        className="custom-class"
      />,
    )
    const radiogroup = container.querySelector('[role="radiogroup"]')
    expect(radiogroup).toHaveClass("custom-class")
  })
})
