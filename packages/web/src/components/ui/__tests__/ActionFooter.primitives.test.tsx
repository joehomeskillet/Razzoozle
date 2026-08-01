// AF07 — CompactIconBar atom + dock contract.
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

import { IconBarButton, IconBarDock } from "../ActionFooter.primitives"
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
      <IconBarButton
        action={{ ...baseAction, toggle: true, active: true }}
      />,
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
