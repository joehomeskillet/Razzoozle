// Unit tests for RowSelectionControl shared component.
//
// Tests verify:
// 1. Input type="checkbox" is rendered.
// 2. Label wrapper has size-11 class.
// 3. checked attribute is passed through to input.
// 4. disabled prop → cursor-not-allowed and opacity-60 on label.
// 5. indeterminate prop → aria-checked="mixed" on input.
// 6. aria-label is passed to input.
// 7. data-testid is passed through to input.
//
// NOTE: vitest env is 'node' (no jsdom). Uses React's server renderer.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import RowSelectionControl from "../RowSelectionControl"

const render = (component: React.ReactNode) => renderToStaticMarkup(component)

describe("RowSelectionControl — Shared Component", () => {
  it("renders checkbox input element", () => {
    const markup = render(
      <RowSelectionControl
        checked={false}
        onChange={() => {}}
        ariaLabel="Select row"
      />,
    )

    expect(markup).toContain('type="checkbox"')
  })

  it("label wrapper contains size-11 class", () => {
    const markup = render(
      <RowSelectionControl
        checked={false}
        onChange={() => {}}
        ariaLabel="Select row"
      />,
    )

    // Verify label has size-11 in its class list
    expect(markup).toContain("size-11")
  })

  it("passes checked attribute to input", () => {
    const markup = render(
      <RowSelectionControl
        checked={true}
        onChange={() => {}}
        ariaLabel="Select row"
      />,
    )

    expect(markup).toContain('checked=""')
  })

  it("disabled prop applies cursor-not-allowed and opacity-60 to label", () => {
    const markup = render(
      <RowSelectionControl
        checked={false}
        onChange={() => {}}
        ariaLabel="Select row"
        disabled={true}
      />,
    )

    expect(markup).toContain("cursor-not-allowed")
    expect(markup).toContain("opacity-60")
    expect(markup).toContain('disabled=""')
  })

  it("indeterminate prop renders aria-checked='mixed' on input", () => {
    const markup = render(
      <RowSelectionControl
        checked={false}
        onChange={() => {}}
        ariaLabel="Select row"
        indeterminate={true}
      />,
    )

    expect(markup).toContain('aria-checked="mixed"')
  })

  it("passes aria-label to input", () => {
    const markup = render(
      <RowSelectionControl
        checked={false}
        onChange={() => {}}
        ariaLabel="Select row 5"
      />,
    )

    expect(markup).toContain('aria-label="Select row 5"')
  })

  it("passes data-testid to input when provided", () => {
    const markup = render(
      <RowSelectionControl
        checked={false}
        onChange={() => {}}
        ariaLabel="Select row"
        data-testid="row-select-1"
      />,
    )

    expect(markup).toContain('data-testid="row-select-1"')
  })
})
