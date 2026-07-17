import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Checkbox from "./Checkbox"

describe("Checkbox", () => {
  it("renders a checkbox input element", () => {
    render(<Checkbox />)
    const input = screen.getByRole("checkbox")
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute("type", "checkbox")
  })

  it("renders with label when label prop is provided", () => {
    render(<Checkbox label="Accept terms" />)
    const label = screen.getByText("Accept terms")
    expect(label).toBeInTheDocument()
  })

  it("passes through disabled state", () => {
    render(<Checkbox disabled />)
    const input = screen.getByRole("checkbox")
    expect(input).toBeDisabled()
  })

  it("applies disabled classes when disabled prop is true", () => {
    render(<Checkbox disabled />)
    const input = screen.getByRole("checkbox")
    expect(input.className).toContain("disabled:opacity-60")
  })

  it("fires onChange event on click", async () => {
    const user = userEvent.setup()
    let changeValue = false
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      changeValue = e.currentTarget.checked
    }
    render(<Checkbox onChange={handleChange} />)
    const input = screen.getByRole("checkbox")

    await user.click(input)
    expect(changeValue).toBe(true)
  })

  it("applies focus-visible outline class for keyboard navigation", () => {
    render(<Checkbox />)
    const input = screen.getByRole("checkbox")
    expect(input.className).toContain("focus-visible:outline-2")
    expect(input.className).toContain("focus-visible:outline-offset-2")
    expect(input.className).toContain("focus-visible:outline-[var(--color-primary)]")
  })

  it("accepts custom className and merges with base classes", () => {
    render(<Checkbox className="custom-class" />)
    const input = screen.getByRole("checkbox")
    expect(input.className).toContain("custom-class")
    expect(input.className).toContain("size-5")
  })

  it("forwards checked prop", () => {
    render(<Checkbox checked={true} onChange={() => {}} />)
    const input = screen.getByRole("checkbox") as HTMLInputElement
    expect(input.checked).toBe(true)
  })

  it("forwards id prop for label association", () => {
    render(<Checkbox id="my-checkbox" />)
    const input = screen.getByRole("checkbox")
    expect(input).toHaveAttribute("id", "my-checkbox")
  })

  it("applies accent color via CSS custom property", () => {
    render(<Checkbox />)
    const input = screen.getByRole("checkbox")
    expect(input.className).toContain("accent-[var(--color-primary)]")
  })
})
