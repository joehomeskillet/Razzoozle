// Unit tests for BulkActionToolbar shared component.
//
// Tests verify:
// 1. role="toolbar" attribute is set with aria-label from props.
// 2. Selected count text appears in markup from manager:bulk.selected i18n key.
// 3. Children elements are rendered inside the toolbar.
// 4. data-testid is passed through to container div.
// 5. Clear-selection button is rendered (X icon + "Auswahl aufheben" text).
//    NOTE: onClick handler cannot be tested in SSR; structure only.
// 6. Container has shared classes: bg-[var(--surface-2)], rounded-lg.
//
// NOTE: vitest env is 'node' (no jsdom). Uses React's server renderer.

import { createInstance } from "i18next"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"

import managerDe from "@razzoozle/web/locales/de/manager.json"
import commonDe from "@razzoozle/web/locales/de/common.json"

import BulkActionToolbar, {
  type BulkActionToolbarProps,
} from "../BulkActionToolbar"

const renderWithI18n = async (component: React.ReactNode) => {
  const i18n = createInstance()
  await i18n.init({
    lng: "de",
    fallbackLng: false,
    ns: ["manager", "common"],
    resources: {
      de: {
        manager: managerDe,
        common: commonDe,
      },
    },
  })

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{component}</I18nextProvider>,
  )
}

describe("BulkActionToolbar — Shared Component", () => {
  it("renders role='toolbar' with aria-label", async () => {
    const markup = await renderWithI18n(
      <BulkActionToolbar
        count={3}
        label="Active items"
        onClear={() => {}}
      />,
    )

    expect(markup).toContain('role="toolbar"')
    expect(markup).toContain('aria-label="Active items"')
  })

  it("renders selected count from manager:bulk.selected i18n key", async () => {
    const markup = await renderWithI18n(
      <BulkActionToolbar
        count={5}
        label="Bulk actions"
        onClear={() => {}}
      />,
    )

    // German translation for manager:bulk.selected is "{{count}} ausgewählt"
    // e.g., "5 ausgewählt"
    expect(markup).toContain("5")
    expect(markup).toContain("ausgewählt")
  })

  it("renders children elements", async () => {
    const markup = await renderWithI18n(
      <BulkActionToolbar
        count={2}
        label="Selection toolbar"
        onClear={() => {}}
      >
        <button>Test Action</button>
      </BulkActionToolbar>,
    )

    expect(markup).toContain("Test Action")
  })

  it("passes data-testid to container div", async () => {
    const markup = await renderWithI18n(
      <BulkActionToolbar
        count={1}
        label="Items selected"
        onClear={() => {}}
        data-testid="bulk-action-toolbar"
      />,
    )

    expect(markup).toContain('data-testid="bulk-action-toolbar"')
  })

  it("renders clear-selection button with icon and text", async () => {
    const markup = await renderWithI18n(
      <BulkActionToolbar
        count={4}
        label="Toolbar"
        onClear={() => {}}
      />,
    )

    // Verify button element exists
    expect(markup).toContain("<button")
    // Verify clear-selection text from i18n
    expect(markup).toContain("Auswahl aufheben")
    // NOTE: onClear callback cannot be tested in SSR; the markup
    // only confirms the button structure is present.
  })

  it("container div has shared classes (bg-[var(--surface-2)], rounded-lg)", async () => {
    const markup = await renderWithI18n(
      <BulkActionToolbar
        count={2}
        label="Selection"
        onClear={() => {}}
      />,
    )

    // Verify shared container classes
    expect(markup).toContain("bg-[var(--surface-2)]")
    expect(markup).toContain("rounded-lg")
  })
})
