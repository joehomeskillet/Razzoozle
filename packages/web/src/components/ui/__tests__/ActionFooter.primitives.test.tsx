// AF07 — CompactIconBar atom + dock contract.
// AF11 / AF-compact — ActionFooterField density contract (stacked default,
// inline compact).
//
// LIMITATION: @testing-library/react is NOT a dep and packages/web's vitest
// env is `node` (no jsdom) — see packages/web/vitest.config.ts. So a full
// render + user.click() path is out of scope without adding deps. Instead we
// pin the contract via renderToStaticMarkup (same approach as
// ActionFooter.zones.test.tsx and RowSelectionControl.test.tsx). The "click
// invokes onClick" test is implemented as: the rendered button has
// type="button" — that is what makes React's onClick fire on a real click —
// and the IconBarDock wires the action.key into data-testid so a real
// user-event test would target the right node.
//
// Mirrors the package's vitest conventions (describe/it/expect, 2-space
// indent, no semicolons).

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  ActionFooterControls,
  ActionFooterField,
  IconBarButton,
  IconBarDock,
} from "../ActionFooter.primitives"
import type { CompactIconBarAction } from "../ActionFooter.compact.types"

const render = (node: React.ReactNode) => renderToStaticMarkup(node)

const baseAction: CompactIconBarAction = {
  key: "auto",
  iconName: "Play",
  label: "Auto-Modus",
  onClick: () => {},
}

describe("IconBarButton", () => {
  it("renders aria-label and title from action.label", () => {
    const html = render(<IconBarButton action={baseAction} />)
    expect(html).toContain('aria-label="Auto-Modus"')
    expect(html).toContain('title="Auto-Modus"')
  })

  it("renders type=button so onClick fires on real click", () => {
    // type="button" is the prerequisite for the rendered onClick to fire on a
    // user click (without it, the button would submit a form ancestor). The
    // user-event handler is wired by React when type="button" + onClick.
    const html = render(<IconBarButton action={baseAction} />)
    expect(html).toMatch(/<button[^>]*type="button"/)
  })

  it("renders aria-pressed=true for active toggle actions", () => {
    const html = render(
      <IconBarButton action={{ ...baseAction, toggle: true, active: true }} />,
    )
    expect(html).toContain('aria-pressed="true"')
  })

  it("disabled action renders disabled + cursor-not-allowed + opacity-50", () => {
    const html = render(
      <IconBarButton action={{ ...baseAction, disabled: true }} />,
    )
    expect(html).toContain('disabled=""')
    expect(html).toContain("cursor-not-allowed")
    expect(html).toContain("opacity-50")
  })

  it("data-testid uses action.key (icon-bar-button-<key>)", () => {
    const html = render(<IconBarButton action={baseAction} />)
    expect(html).toContain('data-testid="icon-bar-button-auto"')
  })
})

describe("IconBarDock", () => {
  it("renders role=group with one button per action", () => {
    const html = render(
      <IconBarDock
        actions={[
          { key: "a", iconName: "Play", label: "A", onClick: () => {} },
          { key: "b", iconName: "Eye", label: "B", onClick: () => {} },
        ]}
      />,
    )
    expect(html).toMatch(/<div[^>]*role="group"/)
    const buttonMatches = html.match(/<button/g) ?? []
    expect(buttonMatches).toHaveLength(2)
    expect(html).toContain('data-testid="icon-bar-button-a"')
    expect(html).toContain('data-testid="icon-bar-button-b"')
  })
})

describe("ActionFooterField density (AF11 / AF-compact)", () => {
  it("default stacked layout keeps flex-col gap-1 wrapper and labelled group", () => {
    const html = render(
      <ActionFooterField label="Mode" htmlFor="mode-stacked">
        <select id="mode-stacked">
          <option>A</option>
        </select>
      </ActionFooterField>,
    )
    expect(html).toContain('data-testid="action-footer-field"')
    const stackedMatch =
      /<div[^>]*data-testid="action-footer-field"[^>]*class="([^"]+)"/.exec(
        html,
      )
    expect(stackedMatch).not.toBeNull()
    const cls = stackedMatch![1].split(/\s+/)
    // Default (stacked) is behaviorally unchanged from the prior AF05 contract.
    expect(cls).toContain("flex")
    expect(cls).toContain("flex-col")
    expect(cls).toContain("gap-1")
    expect(cls).toContain("min-w-0")
    expect(html).toContain('for="mode-stacked"')
    expect(html).toContain("Mode")
    expect(html).toMatch(/role="group"/)
    // No 44px row alignment on the default stack.
    expect(html).not.toContain("items-center")
  })

  it("density=inline renders label visible and linked by htmlFor", () => {
    const html = render(
      <ActionFooterField density="inline" label="Mode" htmlFor="mode-inline">
        <select id="mode-inline">
          <option>A</option>
        </select>
      </ActionFooterField>,
    )
    // AF11 — visible label, no sr-only.
    expect(html).toContain('for="mode-inline"')
    expect(html).not.toContain("sr-only")
    expect(html).toContain("Mode")
    // The control group keeps its landmark + link role stable.
    expect(html).toMatch(/role="group"/)
  })

  it("density=inline aligns items on a 44px-aligned row with min-w-0", () => {
    const html = render(
      <ActionFooterField density="inline" label="Cap" htmlFor="cap-inline">
        <select id="cap-inline">
          <option>25</option>
        </select>
      </ActionFooterField>,
    )
    // Wrapping container: flex row, items-center, 44px row, min-w-0 safety.
    const inlineMatch =
      /<div[^>]*data-testid="action-footer-field"[^>]*class="([^"]+)"/.exec(
        html,
      )
    expect(inlineMatch).not.toBeNull()
    const cls = inlineMatch![1].split(/\s+/)
    expect(cls).toContain("flex")
    expect(cls).toContain("items-center")
    expect(cls).toContain("gap-2")
    expect(cls).toContain("min-h-11")
    expect(cls).toContain("min-w-0")
    expect(cls).not.toContain("flex-col")
  })

  it("density=inline does not change other primitives (IconBarDock unchanged)", () => {
    const inlineFieldHtml = render(
      <ActionFooterField density="inline" label="Mode" htmlFor="m">
        <select id="m">
          <option>A</option>
        </select>
      </ActionFooterField>,
    )
    const controlsHtml = render(
      <ActionFooterControls>
        <ActionFooterField label="Mode" htmlFor="m2">
          <select id="m2">
            <option>A</option>
          </select>
        </ActionFooterField>
      </ActionFooterControls>,
    )
    const dockHtml = render(
      <IconBarDock
        actions={[
          { key: "a", iconName: "Play", label: "A", onClick: () => {} },
        ]}
      />,
    )
    // Inline form must not leak any icon-bar markup.
    expect(inlineFieldHtml).not.toContain("icon-bar-button")
    expect(controlsHtml).not.toContain("icon-bar-button")
    // IconBarDock contract is unchanged.
    expect(dockHtml).toContain('data-testid="icon-bar-button-a"')
    expect(dockHtml).toMatch(/role="group"/)
  })
})
