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
import { describe, expect, it, vi } from "vitest"

import {
  ActionFooterControls,
  ActionFooterField,
  IconBarButton,
  IconBarDock,
} from "../ActionFooter.primitives"
import type { CompactIconBarAction } from "../ActionFooter.compact.types"

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react")
  return {
    ...actual,
    useId: () => "icon-bar-test",
  }
})

const render = (node: React.ReactNode) => renderToStaticMarkup(node)

const baseAction: CompactIconBarAction = {
  key: "auto",
  iconName: "Play",
  label: "Auto-Modus",
  onClick: () => {},
}

const expectCanonicalFocus = (html: string) => {
  expect(html).toContain("focus-visible:outline-2")
  expect(html).toContain("focus-visible:outline-offset-2")
  expect(html).toContain("focus-visible:outline-[var(--color-primary)]")
  expect(html).not.toContain("focus-visible:ring-")
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

  it("keeps a disabled action focusable with aria-disabled", () => {
    const html = render(
      <IconBarButton action={{ ...baseAction, disabled: true }} />,
    )
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toMatch(/\sdisabled(?:=|\s|>)/)
    expect(html).not.toContain('tabindex="-1"')
    expect(html).toContain("cursor-not-allowed")
    expect(html).toContain("opacity-50")
    expectCanonicalFocus(html)
  })

  it("suppresses the click handler when aria-disabled", () => {
    const onClick = vi.fn()
    const enabled = IconBarButton({
      action: { ...baseAction, onClick },
    }) as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>
    const disabled = IconBarButton({
      action: { ...baseAction, onClick, disabled: true },
    }) as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>

    expect(enabled.props.onClick).toBe(onClick)
    expect(disabled.props.onClick).toBeUndefined()
  })

  it("data-testid uses action.key (icon-bar-button-<key>)", () => {
    const html = render(<IconBarButton action={baseAction} />)
    expect(html).toContain('data-testid="icon-bar-button-auto"')
  })

  it("accepts a stable explicit test id", () => {
    const html = render(
      <IconBarButton action={{ ...baseAction, testId: "play-primary" }} />,
    )
    expect(html).toContain('data-testid="play-primary"')
    expect(html).toContain('data-action-key="auto"')
  })

  it("keeps the legacy Users action styling when intent is omitted", () => {
    const html = render(<IconBarButton action={baseAction} />)
    expect(html).toContain("h-11")
    expect(html).toContain("w-11")
    expect(html).toContain("hover:bg-accent-tint")
    expect(html).toContain("focus-visible:bg-accent-tint")
    expect(html).toContain("text-[var(--ink)]")
    expectCanonicalFocus(html)
  })

  it.each([
    ["primary", "bg-[var(--color-primary)]", "text-[var(--surface)]"],
    ["secondary", "bg-[var(--surface)]", "border-[var(--border-hairline)]"],
    ["danger", "bg-transparent", "text-[var(--state-wrong)]"],
    ["ghost", "hover:bg-accent-tint", "text-[var(--ink)]"],
  ] as const)(
    "renders %s intent with canonical token classes",
    (intent, expectedSurface, expectedForeground) => {
      const html = render(<IconBarButton action={{ ...baseAction, intent }} />)
      expect(html).toContain(expectedSurface)
      expect(html).toContain(expectedForeground)
      expectCanonicalFocus(html)
    },
  )

  it("renders danger as soft destructive intent without a filled white treatment", () => {
    const html = render(
      <IconBarButton action={{ ...baseAction, intent: "danger" }} />,
    )

    expect(html).toContain("hover:bg-[var(--state-wrong-soft)]")
    expect(html).toContain("active:bg-[var(--state-wrong-soft)]")
    expect(html).not.toContain("bg-[var(--danger-bg)]")
    expect(html).not.toContain("text-[var(--surface)]")
  })

  it("uses contrast-correct white text and canonical focus for active toggles", () => {
    const html = render(
      <IconBarButton action={{ ...baseAction, toggle: true, active: true }} />,
    )

    expect(html).toContain("bg-[var(--accent-contrast)]")
    expect(html).toContain("text-[var(--surface)]")
    expect(html).not.toContain("text-[var(--accent-contrast-text)]")
    expectCanonicalFocus(html)
  })

  it("links an accessible disabled reason without relying on title", () => {
    const html = render(
      <IconBarButton
        action={{
          ...baseAction,
          disabled: true,
          disabledReason: "Zuerst ein Quiz auswählen",
        }}
      />,
    )
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1]

    expect(describedBy).toBeTruthy()
    expect(html).toContain(`id="${describedBy}"`)
    expect(html).toContain("sr-only")
    expect(html).toContain("Zuerst ein Quiz auswählen")
    expect(html).toContain('aria-label="Auto-Modus"')
    expect(html).toContain('title="Zuerst ein Quiz auswählen"')
  })

  it("does not add aria-describedby without a disabled reason", () => {
    const html = render(
      <IconBarButton action={{ ...baseAction, disabled: true }} />,
    )

    expect(html).not.toContain("aria-describedby")
  })

  it.each([
    "Play",
    "Pause",
    "SkipForward",
    "Eye",
    "Minus",
    "Plus",
    "Copy",
    "Create",
    "Save",
    "Upload",
    "Reset",
    "Import",
    "Template",
    "Delete",
    "Overflow",
  ] as const)("renders supported %s icon without losing a11y", (iconName) => {
    const html = render(<IconBarButton action={{ ...baseAction, iconName }} />)
    expect(html).toContain('aria-label="Auto-Modus"')
    expect(html).toContain('title="Auto-Modus"')
    expect(html).toContain('aria-hidden="true"')
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

  it("accepts an accessible label without adding toolbar semantics", () => {
    const html = render(
      <IconBarDock actions={[baseAction]} ariaLabel="Page actions" />,
    )

    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Page actions"/)
    expect(html).not.toContain('role="toolbar"')
  })

  it("rejects more than one primary action", () => {
    expect(() =>
      render(
        <IconBarDock
          actions={[
            { ...baseAction, key: "start", intent: "primary" },
            { ...baseAction, key: "save", intent: "primary" },
          ]}
        />,
      ),
    ).toThrow(/at most one primary action/i)
  })

  it("accepts exactly one primary action", () => {
    const html = render(
      <IconBarDock
        actions={[
          { ...baseAction, key: "copy", iconName: "Copy" },
          { ...baseAction, key: "start", intent: "primary" },
        ]}
      />,
    )

    expect(html).toContain('data-action-key="copy"')
    expect(html).toContain('data-action-key="start"')
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
