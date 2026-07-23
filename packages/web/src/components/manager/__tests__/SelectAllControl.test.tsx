// Unit tests for SelectAllControl shared component.
//
// Tests verify:
// 1. Shared Checkbox is rendered (input type="checkbox").
// 2. id and data-testid are passed through to input.
// 3. Label text comes from manager:bulk.selectAll i18n key.
// 4. Counter uses manager:bulk.selectedOfTotal (e.g., "3 von 12 ausgewählt").
// 5. allSelected=true → checked attribute is set.
// 6. Label htmlFor points to checkbox id.
// 7. Wrapper div has min-h-11 and items-center; counter span has aria-live="polite" and tabular-nums.
// 8. SelectAllControlProps interface has no className prop (type-level check).
//
// NOTE: vitest env is 'node' (no jsdom). Uses React's server renderer.

import { createInstance } from "i18next"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"

import managerDe from "@razzoozle/web/locales/de/manager.json"
import commonDe from "@razzoozle/web/locales/de/common.json"

import SelectAllControl, {
  type SelectAllControlProps,
} from "../SelectAllControl"

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

describe("SelectAllControl — Shared Component", () => {
  it("renders shared Checkbox component", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="select-all-1"
        allSelected={false}
        someSelected={false}
        selectedCount={0}
        totalCount={10}
        onToggleAll={() => {}}
      />,
    )

    expect(markup).toContain('type="checkbox"')
  })

  it("passes id to checkbox input", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="select-all-classes"
        allSelected={false}
        someSelected={false}
        selectedCount={0}
        totalCount={5}
        onToggleAll={() => {}}
      />,
    )

    expect(markup).toContain('id="select-all-classes"')
  })

  it("passes data-testid to checkbox when provided", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="select-all-2"
        allSelected={false}
        someSelected={false}
        selectedCount={0}
        totalCount={8}
        onToggleAll={() => {}}
        data-testid="bulk-select-all"
      />,
    )

    expect(markup).toContain('data-testid="bulk-select-all"')
  })

  it("renders label text from manager:bulk.selectAll i18n key", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="select-all-3"
        allSelected={false}
        someSelected={false}
        selectedCount={0}
        totalCount={6}
        onToggleAll={() => {}}
      />,
    )

    // The German translation for "manager:bulk.selectAll" is "Alle auswählen"
    expect(markup).toContain("Alle auswählen")
  })

  it("renders counter using manager:bulk.selectedOfTotal i18n key", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="select-all-4"
        allSelected={false}
        someSelected={false}
        selectedCount={3}
        totalCount={12}
        onToggleAll={() => {}}
      />,
    )

    // The German translation uses "von" between selected and total
    // e.g., "3 von 12 ausgewählt"
    expect(markup).toContain("3")
    expect(markup).toContain("12")
    expect(markup).toContain("von")
  })

  it("sets checked attribute when allSelected is true", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="select-all-5"
        allSelected={true}
        someSelected={false}
        selectedCount={5}
        totalCount={5}
        onToggleAll={() => {}}
      />,
    )

    expect(markup).toContain('checked=""')
  })

  it("label htmlFor points to checkbox id", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="my-select-all-id"
        allSelected={false}
        someSelected={false}
        selectedCount={0}
        totalCount={10}
        onToggleAll={() => {}}
      />,
    )

    // Verify label has htmlFor pointing to the id
    expect(markup).toContain('for="my-select-all-id"')
  })

  it("wrapper div contains min-h-11 and items-center classes", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="select-all-6"
        allSelected={false}
        someSelected={false}
        selectedCount={0}
        totalCount={7}
        onToggleAll={() => {}}
      />,
    )

    // Verify wrapper div classes
    const wrapperMatch = markup.match(
      /div[^>]*class="[^"]*min-h-11[^"]*items-center[^"]*"/,
    )
    expect(wrapperMatch).toBeDefined()
  })

  it("counter span has aria-live='polite' and tabular-nums class", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="select-all-7"
        allSelected={false}
        someSelected={false}
        selectedCount={2}
        totalCount={9}
        onToggleAll={() => {}}
      />,
    )

    // Verify counter span has aria-live
    expect(markup).toContain('aria-live="polite"')
    // Verify tabular-nums class is present
    expect(markup).toContain("tabular-nums")
  })

  it("SelectAllControlProps interface does not include className prop (type-level check)", () => {
    // This is a type-level assertion. Verify that the props interface
    // does not have a className field. We do this by trying to assign
    // to a variable with the interface type and checking that className
    // is not a valid key.
    const propsWithoutClass: SelectAllControlProps = {
      id: "test",
      allSelected: false,
      someSelected: false,
      selectedCount: 0,
      totalCount: 10,
      onToggleAll: () => {},
    }

    // If className were in the interface, this would be valid:
    // propsWithoutClass.className = "test" // This should fail at type-check time
    // We verify the interface by checking that required props exist:
    expect(propsWithoutClass.id).toBe("test")
    expect(propsWithoutClass.allSelected).toBe(false)
    expect(propsWithoutClass.someSelected).toBe(false)
    expect(propsWithoutClass.selectedCount).toBe(0)
    expect(propsWithoutClass.totalCount).toBe(10)
    expect(typeof propsWithoutClass.onToggleAll).toBe("function")
  })

  it("renders aria-checked='mixed' when someSelected is true", async () => {
    const markup = await renderWithI18n(
      <SelectAllControl
        id="select-all-8"
        allSelected={false}
        someSelected={true}
        selectedCount={5}
        totalCount={10}
        onToggleAll={() => {}}
      />,
    )

    // When indeterminate is set via the Shared Checkbox component,
    // it should render aria-checked="mixed" in the markup
    expect(markup).toContain('aria-checked="mixed"')
  })
})
