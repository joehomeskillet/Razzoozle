// AF07 — ActionFooterCompact a11y + integration (node env, SSR markup).
//
// Like the primitives test, `@testing-library/react` is NOT installed and the
// packages/web vitest env is `node` (no jsdom). `createPortal` would otherwise
// throw without a DOM — we mock it to render its child inline, which lets
// `renderToStaticMarkup` capture the portal child markup as if it were inline.
// Without a host target the component returns null (empty-string branch); the
// dedicated no-host test uses `vi.resetModules` + dynamic import so the file-
// level `useActionFooterHostOptional` mock does not shadow it.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ActionFooterCompact } from "../ActionFooter.compact"
import type { CompactIconBarAction } from "../ActionFooter.compact.types"

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom")
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

vi.mock(
  "@razzoozle/web/features/manager/contexts/action-footer-host-context",
  () => ({
    useActionFooterHostOptional: () => ({
      // createPortal is mocked above, so this stub target is never touched.
      target: {} as HTMLElement,
      register: vi.fn(() => () => undefined),
      registrationCount: 1,
      setTarget: vi.fn(),
      variant: "compact",
    }),
  }),
)

const render = (node: React.ReactNode) => renderToStaticMarkup(node)

const baseAction: CompactIconBarAction = {
  key: "auto",
  iconName: "Play",
  label: "Auto-Modus",
  onClick: () => {},
}

describe("ActionFooterCompact a11y & integration", () => {
  it("returns null when no host target is mounted", async () => {
    vi.resetModules()
    vi.doMock(
      "@razzoozle/web/features/manager/contexts/action-footer-host-context",
      () => ({
        useActionFooterHostOptional: () => null,
      }),
    )
    const { ActionFooterCompact: NoHost } =
      await import("../ActionFooter.compact")
    const html = render(<NoHost actions={[baseAction]} instanceId="tab-0" />)
    expect(html).toBe("")
  })

  it("leaves toolbar semantics to the labelled icon group", () => {
    const html = render(
      <ActionFooterCompact actions={[baseAction]} instanceId="tab-1" />,
    )
    expect(html).not.toContain('role="toolbar"')
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Page actions"/)
    expect(html).toContain('data-testid="action-footer-compact"')
  })

  it("does not add duplicate safe-area chrome inside the compact bar", () => {
    const html = render(
      <ActionFooterCompact actions={[baseAction]} instanceId="tab-2" />,
    )
    expect(html).not.toContain("safe-area-inset-bottom")
  })

  it("renders one button per action in DOM order", () => {
    const html = render(
      <ActionFooterCompact
        actions={[
          { key: "play", iconName: "Play", label: "Play", onClick: () => {} },
          {
            key: "pause",
            iconName: "Pause",
            label: "Pause",
            onClick: () => {},
          },
        ]}
        instanceId="tab-3"
      />,
    )
    const buttons = html.match(/data-testid="icon-bar-button-/g) ?? []
    expect(buttons).toHaveLength(2)
    expect(html.indexOf("icon-bar-button-play")).toBeLessThan(
      html.indexOf("icon-bar-button-pause"),
    )
  })

  it("renders aria-pressed=true on active toggle actions", () => {
    const html = render(
      <ActionFooterCompact
        actions={[{ ...baseAction, toggle: true, active: true }]}
        instanceId="tab-4"
      />,
    )
    expect(html).toContain('aria-pressed="true"')
  })

  it("disabled action stays focusable and exposes aria-disabled", () => {
    const html = render(
      <ActionFooterCompact
        actions={[{ ...baseAction, disabled: true }]}
        instanceId="tab-5"
      />,
    )
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toMatch(/\sdisabled(?:=|\s|>)/)
    expect(html).toContain("cursor-not-allowed")
  })

  it("ignores non-contract leading and trailing escape-hatch props", () => {
    const escapedProps = {
      actions: [baseAction],
      leading: <button data-testid="escaped-leading">Leading</button>,
      trailing: <button data-testid="escaped-trailing">Trailing</button>,
      instanceId: "tab-6",
    }
    const html = render(<ActionFooterCompact {...escapedProps} />)
    expect(html).not.toContain("escaped-leading")
    expect(html).not.toContain("escaped-trailing")
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it("merges custom className onto the footer", () => {
    const html = render(
      <ActionFooterCompact
        actions={[baseAction]}
        className="my-compact-bar"
        instanceId="tab-7"
      />,
    )
    expect(html).toContain("my-compact-bar")
  })
})
