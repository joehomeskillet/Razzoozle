// AF-compact catalog callsite — WP-044ccbe01f23.
//
// Goal: ConfigCatalog exposes one state-specific ActionFooterCompact action:
// Create normally, Delete during selection. Body toolbar keeps count + clear.

import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import ConfigCatalog from "../ConfigCatalog"

const mocks = vi.hoisted(() => ({
  openAddModal: vi.fn(),
  setBulkDeleteOpen: vi.fn(),
  selectionActive: false,
  selectionCount: 0,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({
    socket: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
  }),
  useEvent: () => undefined,
}))

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: (
    selector: (state: { config?: { klassenEnabled?: boolean } }) => unknown,
  ) => selector({ config: { klassenEnabled: false } }),
}))

vi.mock("../catalog/useCatalogManager", () => ({
  useCatalogManager: () => ({
    search: "",
    setSearch: vi.fn(),
    scope: "all" as const,
    setScope: vi.fn(),
    selectedLabelId: null,
    setSelectedLabelId: vi.fn(),
    klassenEnabled: false,
    modalMode: "add" as const,
    editingEntry: null,
    modalOpen: false,
    pendingDelete: null,
    setPendingDelete: vi.fn(),
    bulkDeleteOpen: false,
    setBulkDeleteOpen: mocks.setBulkDeleteOpen,
    selectionCount: mocks.selectionCount,
    selectionActive: mocks.selectionActive,
    entries: [],
    filteredEntries: [],
    openAddModal: mocks.openAddModal,
    openEditModal: vi.fn(),
    closeModal: vi.fn(),
    handleDelete: vi.fn(),
    selection: {
      selected: new Set<string>(),
      clear: vi.fn(),
      toggle: vi.fn(),
      toggleAll: vi.fn(),
      isSelected: () => false,
      allSelected: false,
      someSelected: false,
    },
    handleBulkDelete: vi.fn(),
    handleLabelAssign: vi.fn(),
    setPendingOp: vi.fn(),
  }),
}))

vi.mock("../catalog/CatalogQuestionModal", () => ({
  CatalogQuestionModal: () => null,
}))

vi.mock(
  "@razzoozle/web/features/manager/contexts/action-footer-host-context",
  () => ({
    useActionFooterHostOptional: () => ({
      target: {} as HTMLElement,
      register: vi.fn(() => () => undefined),
    }),
  }),
)

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom")
  return {
    ...actual,
    createPortal: (children: ReactNode) => children,
  }
})

vi.mock("@razzoozle/web/components/manager/PageHeader", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/manager/BulkActionToolbar", () => ({
  default: ({ count, children }: { count: number; children: ReactNode }) => (
    <div data-testid="catalog-bulk-toolbar" data-count={count}>
      {children}
      <button type="button" data-testid="catalog-clear-selection">
        Clear
      </button>
    </div>
  ),
}))

vi.mock("@razzoozle/web/components/manager/SelectAllControl", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/manager/RowSelectionControl", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/manager/FilterGroup", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/manager/FilterPill", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/labels/LabelFilterPills", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/labels/LabelChip", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/AlertDialog", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/Input", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/Button", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <button type="button" data-testid="catalog-body-action">
      {children}
    </button>
  ),
}))

vi.mock("@razzoozle/web/components/manager/Badge", () => ({
  default: () => null,
  assignTriggerClass: "",
}))

vi.mock("@razzoozle/web/components/manager/popover", () => ({
  popoverContentClass: "",
  popoverItemClass: "",
}))

vi.mock("@razzoozle/web/features/manager/components/console", () => ({
  EmptyState: ({
    action,
  }: {
    action?: { label: string; onClick: () => void }
  }) =>
    action ? (
      <button type="button" data-testid="catalog-empty-action">
        {action.label}
      </button>
    ) : null,
  ListRow: () => null,
}))

vi.mock(
  "@razzoozle/web/features/manager/components/console/listMotion",
  () => ({
    listContainerMotion: () => ({}),
    listItemMotion: () => ({}),
  }),
)

vi.mock(
  "@razzoozle/web/features/manager/components/configurations/labels/useLabelManager",
  () => ({
    useLabelManager: () => ({ labels: [] }),
  }),
)

const render = (node: ReactNode) => renderToStaticMarkup(node)

describe("ConfigCatalog compact footer", () => {
  it("renders one rounded 44x44 primary Create action in normal state", () => {
    mocks.selectionActive = false
    mocks.selectionCount = 0
    const html = render(<ConfigCatalog />)
    expect(html.match(/data-testid="catalog-create-btn"/g)).toHaveLength(1)
    expect(html).toContain('data-action-key="create"')
    expect(html).toContain('aria-label="manager:catalog.addManual"')
    expect(html).toContain('title="manager:catalog.addManual"')
    expect(html).toContain("h-11")
    expect(html).toContain("w-11")
    expect(html).toContain("rounded-lg")
    expect(html).toContain("bg-[var(--color-primary)]")
    expect(html).not.toContain("catalog-bulk-delete-btn")
  })

  it("does not duplicate Create in the empty state", () => {
    mocks.selectionActive = false
    const html = render(<ConfigCatalog />)
    expect(html).not.toContain('data-testid="catalog-empty-action"')
    expect(html.match(/data-testid="catalog-create-btn"/g)).toHaveLength(1)
  })

  it("shows only danger Delete in footer while body toolbar keeps count and clear", () => {
    mocks.selectionActive = true
    mocks.selectionCount = 2
    const html = render(<ConfigCatalog />)

    expect(html).toContain('data-testid="catalog-bulk-toolbar"')
    expect(html).toContain('data-count="2"')
    expect(html).toContain('data-testid="catalog-clear-selection"')
    expect(html).not.toContain('data-testid="catalog-body-action"')
    expect(html).toContain('data-testid="catalog-bulk-delete-btn"')
    expect(html).toContain('data-action-key="delete"')
    expect(html).toContain("text-[var(--state-wrong)]")
    expect(html).not.toContain('data-testid="catalog-create-btn"')
  })

  it("uses labelled group semantics without legacy footer zones", () => {
    mocks.selectionActive = false
    const html = render(<ConfigCatalog />)
    expect(html).not.toContain('role="toolbar"')
    expect(html).toContain('role="group"')
    expect(html).not.toContain("<footer")
    expect(html).not.toContain('data-testid="action-footer-primary"')
    expect(html).not.toContain('data-testid="action-footer-secondary"')
    expect(html).not.toContain('data-testid="action-footer-controls"')
    expect(html).not.toContain('data-testid="action-footer-summary"')
    expect(html).not.toContain("pb-20")
    expect(html.match(/<button/g)).toHaveLength(1)
  })
})
