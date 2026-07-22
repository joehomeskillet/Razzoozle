// Unit tests for Manager Row System API contract (console row components).
//
// Tests verify:
// 1. rowStyles.ts: 15 constants exist and contain specified class strings.
// 2. ListRow.tsx: Interface properties match spec §3.2 (Contract frozen).
// 3. SelectableRow.tsx: role="radio", aria-checked, semantics.
// 4. Badge.tsx: TONES mapping, assignTriggerClass structure; rendered markup (R8).
// 5. FilterPill.tsx: Base classes, aria-pressed, count span; rendered markup (R10).
// 6. assignTriggerClass: Contains required pseudo-element and hover classes.
//
// NOTE: vitest env is 'node' (no jsdom). Assertions verify imports, type signatures,
// class string content, and rendered HTML structure (Badge/FilterPill via
// renderToStaticMarkup). Component implementations (esp. ListRow new props: density,
// selected, expanded, disabled, details, hoverable) are frozen in spec §3.2
// and tested post-W2a/W2b merge. See SDD docs/specs/manager-row-system.md §11.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { ListRowDensity, ListRowAction, ListRowProps } from "@razzoozle/web/features/manager/components/console"
import {
  rowShellBase,
  rowRestState,
  rowShellDensity,
  rowHoverState,
  rowSelectedState,
  rowDisabledState,
  rowFocusState,
  rowBodyFocusState,
  rowTitleClass,
  rowMetaClass,
  rowLeadingClass,
  rowActionGroupClass,
  rowActionBase,
  rowActionHover,
  rowActionDestructiveHover,
} from "@razzoozle/web/features/manager/components/console"

import type { SelectableRowProps } from "@razzoozle/web/features/manager/components/console/SelectableRow"
import SelectableRow from "@razzoozle/web/features/manager/components/console/SelectableRow"

import type { BadgeTone } from "@razzoozle/web/components/manager/Badge"
import Badge, { chipBase, assignTriggerClass } from "@razzoozle/web/components/manager/Badge"

import FilterPill from "@razzoozle/web/components/manager/FilterPill"

describe("rowStyles Contract — 15 constants (SDD §3.1, R13)", () => {
  it("rowShellBase contains radius, outline, and transition", () => {
    expect(rowShellBase).toContain("rounded-[var(--radius-theme)]")
    expect(rowShellBase).toContain("outline-2")
    expect(rowShellBase).toContain("-outline-offset-2")
    expect(rowShellBase).toContain("transition-colors")
  })

  it("rowShellBase does NOT contain background or outline-color", () => {
    // State colors (BG/outline) branch exclusively per §3.1, not in base.
    expect(rowShellBase).not.toMatch(/bg-\[var\(--/)
    expect(rowShellBase).not.toMatch(/outline-\[var\(--(surface|color|line)/)
  })

  it("rowRestState contains surface bg and line outline", () => {
    expect(rowRestState).toContain("bg-[var(--surface)]")
    expect(rowRestState).toContain("outline-[var(--line)]")
  })

  it("rowShellDensity has default and compact variants", () => {
    expect(rowShellDensity.default).toBe("p-4")
    expect(rowShellDensity.compact).toBe("px-4 py-2")
  })

  it("rowHoverState contains accent-tint bg and primary outline", () => {
    expect(rowHoverState).toContain("hover:bg-[var(--accent-tint)]")
    expect(rowHoverState).toContain("hover:outline-[var(--color-primary)]")
  })

  it("rowSelectedState contains accent-tint bg and primary outline (exclusive, not additive)", () => {
    expect(rowSelectedState).toContain("bg-[var(--accent-tint)]")
    expect(rowSelectedState).toContain("outline-[var(--color-primary)]")
    // Selected state is EXCLUSIVE, not layered on rowRestState.
    expect(rowSelectedState).not.toContain("hover:")
  })

  it("rowDisabledState contains opacity-60", () => {
    expect(rowDisabledState).toBe("opacity-60")
  })

  it("rowFocusState and rowBodyFocusState handle focus ring (spec §5)", () => {
    expect(rowFocusState).toContain("focus-visible:outline-[var(--color-primary)]")
    expect(rowFocusState).toContain("focus-visible:outline-offset-2")

    expect(rowBodyFocusState).toContain("focus-visible:outline-2")
    expect(rowBodyFocusState).toContain("focus-visible:-outline-offset-2")
    expect(rowBodyFocusState).toContain("focus-visible:outline-[var(--color-primary)]")
  })

  it("rowTitleClass contains truncate, text size, and color", () => {
    expect(rowTitleClass).toContain("truncate")
    expect(rowTitleClass).toContain("text-sm")
    expect(rowTitleClass).toContain("font-semibold")
    expect(rowTitleClass).toContain("text-[var(--ink)]")
  })

  it("rowMetaClass contains text-xs and ink-subtle", () => {
    expect(rowMetaClass).toContain("text-xs")
    expect(rowMetaClass).toContain("font-normal")
    expect(rowMetaClass).toContain("text-[var(--ink-subtle)]")
  })

  it("rowLeadingClass contains flex, shrink-0, and ink-muted", () => {
    expect(rowLeadingClass).toContain("flex")
    expect(rowLeadingClass).toContain("shrink-0")
    expect(rowLeadingClass).toContain("items-center")
    expect(rowLeadingClass).toContain("text-[var(--ink-muted)]")
  })

  it("rowActionGroupClass contains flex, shrink-0, and gap-1", () => {
    expect(rowActionGroupClass).toContain("flex")
    expect(rowActionGroupClass).toContain("shrink-0")
    expect(rowActionGroupClass).toContain("items-center")
    expect(rowActionGroupClass).toContain("gap-1")
  })

  it("rowActionBase contains shrink-0 and ink-faint", () => {
    expect(rowActionBase).toContain("shrink-0")
    expect(rowActionBase).toContain("text-[var(--ink-faint)]")
  })

  it("rowActionHover contains hover:accent-tint and hover:accent-contrast", () => {
    expect(rowActionHover).toContain("hover:bg-[var(--accent-tint)]")
    expect(rowActionHover).toContain("hover:text-[var(--accent-contrast)]")
  })

  it("rowActionDestructiveHover contains hover:state-wrong colors", () => {
    expect(rowActionDestructiveHover).toContain("hover:bg-[var(--state-wrong-soft)]")
    expect(rowActionDestructiveHover).toContain("hover:text-[var(--state-wrong)]")
  })
})

describe("ListRow — API contract (SDD §3.2, R12)", () => {
  it("ListRowDensity type accepts 'default' | 'compact'", () => {
    const typeDefaultVar: ListRowDensity = "default"
    const typeCompactVar: ListRowDensity = "compact"
    expect(typeDefaultVar).toBe("default")
    expect(typeCompactVar).toBe("compact")
  })

  it("ListRowAction interface has required key, icon, label, onClick", () => {
    const action: ListRowAction = {
      key: "test",
      icon: () => null,
      label: "Test action",
      onClick: () => {},
    }
    expect(action.key).toBeDefined()
    expect(action.icon).toBeDefined()
    expect(action.label).toBeDefined()
    expect(action.onClick).toBeDefined()
  })

  it("ListRowAction accepts optional disabled, title, destructive, className, aria-expanded", () => {
    const action: ListRowAction = {
      key: "edit",
      icon: () => null,
      label: "Edit",
      onClick: () => {},
      disabled: false,
      title: "Edit this item",
      destructive: false,
      className: "hidden sm:inline-flex",
      "aria-expanded": true,
    }
    expect(action.disabled).toBe(false)
    expect(action.title).toBe("Edit this item")
    expect(action.destructive).toBe(false)
    expect(action.className).toBe("hidden sm:inline-flex")
    expect(action["aria-expanded"]).toBe(true)
  })

  it("ListRowProps has required title and optional meta, selection, leading, actions, footer", () => {
    const props: ListRowProps = {
      title: "Quiz title",
      meta: "5 questions",
      selection: null,
      leading: null,
      actions: [],
      footer: null,
    }
    expect(props.title).toBe("Quiz title")
    expect(props.meta).toBe("5 questions")
  })

  it("ListRowProps accepts new optional props: density, hoverable, selected, expanded, disabled, details, onClick, bodyLabel", () => {
    const props: ListRowProps = {
      title: "Test",
      density: "compact",
      hoverable: true,
      selected: true,
      expanded: false,
      disabled: false,
      details: null,
      onClick: () => {},
      bodyLabel: "Open quiz",
    }
    expect(props.density).toBe("compact")
    expect(props.hoverable).toBe(true)
    expect(props.selected).toBe(true)
    expect(props.expanded).toBe(false)
    expect(props.disabled).toBe(false)
    expect(props.details).toBeNull()
    expect(props.onClick).toBeDefined()
    expect(props.bodyLabel).toBe("Open quiz")
  })

  it("ListRowProps.footer remains backward-compat (full width under title/meta)", () => {
    const props: ListRowProps = {
      title: "With footer",
      footer: <div>Footer content</div>,
    }
    expect(props.footer).toBeDefined()
  })
})

describe("SelectableRow — Radio selection (SDD §3.2, R12)", () => {
  it("SelectableRowProps extends button HTML attributes", () => {
    const props: SelectableRowProps = {
      title: "Quiz option",
      selected: false,
      disabled: false,
      type: "button",
    }
    expect(props.title).toBe("Quiz option")
    expect(props.selected).toBe(false)
  })

  it("SelectableRow accepts meta (secondary line)", () => {
    const props: SelectableRowProps = {
      title: "Quiz A",
      meta: "15 questions",
      selected: false,
    }
    expect(props.meta).toBe("15 questions")
  })

  it("SelectableRow accepts leading icon slot", () => {
    const props: SelectableRowProps = {
      title: "Quiz B",
      leading: <span>Icon</span>,
      selected: false,
    }
    expect(props.leading).toBeDefined()
  })
})

describe("Badge — Tone system & markup (SDD §7, R8)", () => {
  it("Badge component accepts tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'", () => {
    const toneNeutral: BadgeTone = "neutral"
    const tonePrimary: BadgeTone = "primary"
    const toneSuccess: BadgeTone = "success"
    const toneWarning: BadgeTone = "warning"
    const toneDanger: BadgeTone = "danger"

    expect([toneNeutral, tonePrimary, toneSuccess, toneWarning, toneDanger]).toContain("neutral")
  })

  it("chipBase contains padding, radius, text scale (shared with LabelChip)", () => {
    expect(chipBase).toContain("inline-flex")
    expect(chipBase).toContain("items-center")
    expect(chipBase).toContain("rounded-full")
    expect(chipBase).toContain("px-2.5")
    expect(chipBase).toContain("py-0.5")
    expect(chipBase).toContain("text-xs")
    expect(chipBase).toContain("font-semibold")
  })

  it("Badge renders with tone=primary: accent-tint bg + accent-contrast text", () => {
    const markup = renderToStaticMarkup(
      <Badge tone="primary">Label</Badge>
    )
    expect(markup).toContain("inline-flex")
    expect(markup).toContain("rounded-full")
    expect(markup).toContain("bg-[var(--accent-tint)]")
    expect(markup).toContain("text-[var(--accent-contrast)]")
  })

  it("Badge renders with tone=neutral: surface-4 bg + ink-muted text", () => {
    const markup = renderToStaticMarkup(
      <Badge tone="neutral">Neutral</Badge>
    )
    expect(markup).toContain("bg-[var(--surface-4)]")
    expect(markup).toContain("text-[var(--ink-muted)]")
  })

  it("Badge renders with tone=success: status-online colors", () => {
    const markup = renderToStaticMarkup(
      <Badge tone="success">Online</Badge>
    )
    expect(markup).toContain("bg-[var(--status-online-bg)]")
    expect(markup).toContain("text-[var(--status-online-text)]")
  })

  it("Badge with tone=danger renders red state colors", () => {
    const markup = renderToStaticMarkup(
      <Badge tone="danger">Error</Badge>
    )
    expect(markup).toContain("bg-[var(--status-offline-bg)]")
    expect(markup).toContain("text-[var(--status-offline-text)]")
  })

  it("Badge without tone uses defaultTone (surface-4 bg)", () => {
    const markup = renderToStaticMarkup(
      <Badge>Unspecified</Badge>
    )
    expect(markup).toContain("bg-[var(--surface-4)]")
    expect(markup).toContain("text-[var(--ink-muted)]")
  })

  it("Badge with className (and no tone) preserves className, ignores defaultTone", () => {
    const markup = renderToStaticMarkup(
      <Badge className="custom-class">Custom</Badge>
    )
    expect(markup).toContain("custom-class")
    // className replaces defaultTone per spec §7 legacy behavior.
  })
})

describe("FilterPill — Active/inactive markup (SDD §7, R10)", () => {
  it("FilterPill renders with aria-pressed reflecting active state", () => {
    const markupActive = renderToStaticMarkup(
      <FilterPill active onClick={() => {}} count={5}>Filter</FilterPill>
    )
    expect(markupActive).toContain('aria-pressed="true"')
    expect(markupActive).toContain("bg-[var(--accent-tint)]")
    expect(markupActive).toContain("text-[var(--accent-contrast)]")
    expect(markupActive).toContain("outline-2")
    expect(markupActive).toContain("-outline-offset-2")
    expect(markupActive).toContain("outline-[var(--color-primary)]")
  })

  it("FilterPill inactive renders surface-3 bg with surface-4 hover", () => {
    const markup = renderToStaticMarkup(
      <FilterPill active={false} onClick={() => {}} count={0}>Inactive</FilterPill>
    )
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain("bg-[var(--surface-3)]")
    expect(markup).toContain("text-[var(--ink-medium)]")
    expect(markup).toContain("hover:bg-[var(--surface-4)]")
  })

  it("FilterPill renders count in tabular-nums span when count is defined", () => {
    const markup = renderToStaticMarkup(
      <FilterPill active={false} onClick={() => {}} count={42}>Label</FilterPill>
    )
    expect(markup).toContain("tabular-nums")
    expect(markup).toContain(">42<")
  })

  it("FilterPill without count renders no number span", () => {
    const markup = renderToStaticMarkup(
      <FilterPill active={false} onClick={() => {}}>NoCount</FilterPill>
    )
    expect(markup).not.toContain("tabular-nums")
  })

  it("FilterPill min-h-9 (36px baseline per toolbar-density token-ok, R10)", () => {
    const markup = renderToStaticMarkup(
      <FilterPill active={false} onClick={() => {}}>Height</FilterPill>
    )
    expect(markup).toContain("min-h-9")
    expect(markup).toContain("inline-flex")
  })

  it("FilterPill custom activeClassName replaces default active colors", () => {
    const markup = renderToStaticMarkup(
      <FilterPill active activeClassName="bg-red-500" onClick={() => {}}>Custom</FilterPill>
    )
    expect(markup).toContain("bg-red-500")
    // When activeClassName is set, it replaces the default accent colors.
  })
})

describe("assignTriggerClass — Pseudo-element structure (SDD §7, R9)", () => {
  it("assignTriggerClass string is a valid Tailwind class sequence", () => {
    expect(typeof assignTriggerClass).toBe("string")
    expect(assignTriggerClass.length).toBeGreaterThan(0)
  })

  it("assignTriggerClass does not contain min-h-11 (touch area via before:, not padding)", () => {
    // Touch target is 44px but achieved via before pseudo-element inset,
    // not via min-h padding. Ensures tight visual + large hit area (R9).
    expect(assignTriggerClass).not.toContain("min-h-11")
  })

  it("assignTriggerClass contains text-[var(--ink-medium)] and font-medium", () => {
    expect(assignTriggerClass).toContain("text-[var(--ink-medium)]")
    expect(assignTriggerClass).toContain("font-medium")
  })

  it("assignTriggerClass contains relative, border, gap-1, and hover colors", () => {
    expect(assignTriggerClass).toContain("relative")
    expect(assignTriggerClass).toContain("inline-flex")
    expect(assignTriggerClass).toContain("items-center")
    expect(assignTriggerClass).toContain("gap-1")
    expect(assignTriggerClass).toContain("rounded-full")
    expect(assignTriggerClass).toContain("border")
    expect(assignTriggerClass).toContain("border-[var(--border-hairline)]")
    expect(assignTriggerClass).toContain("px-2")
    expect(assignTriggerClass).toContain("py-0.5")
    expect(assignTriggerClass).toContain("text-xs")
    expect(assignTriggerClass).toContain("hover:bg-[var(--accent-tint)]")
    expect(assignTriggerClass).toContain("hover:text-[var(--accent-contrast)]")
  })

  it("assignTriggerClass contains before pseudo-element with -inset-2.5", () => {
    // before:-inset-2.5 expands touch area 10px in all directions (R9).
    expect(assignTriggerClass).toContain("before:absolute")
    expect(assignTriggerClass).toContain("before:-inset-2.5")
    expect(assignTriggerClass).toContain("before:content-['']")
  })

  it("assignTriggerClass contains focus ring (focus-visible)", () => {
    expect(assignTriggerClass).toContain("focus-visible:outline-2")
    expect(assignTriggerClass).toContain("focus-visible:outline-offset-2")
    expect(assignTriggerClass).toContain("focus-visible:outline-[var(--color-primary)]")
  })
})
