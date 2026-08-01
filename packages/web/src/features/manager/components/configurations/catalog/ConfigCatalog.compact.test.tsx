// AF-compact catalog callsite — WP-044ccbe01f23.
//
// Goal: ConfigCatalog exposes a single primary ActionFooterCompact action
// (`catalog-create`, icon `Create`, opens the add modal) and stops rendering
// the legacy full-width ActionFooter zones. Catalog search/filters/selection,
// bulk-delete, edit/delete, modal and EmptyState behaviour stay untouched.

import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import ConfigCatalog from "../ConfigCatalog"

const openAddModal = vi.fn()

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
    setBulkDeleteOpen: vi.fn(),
    selectionCount: 0,
    selectionActive: false,
    entries: [],
    filteredEntries: [],
    openAddModal,
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
  default: () => null,
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
  default: () => null,
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
  EmptyState: () => null,
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
  it("renders one 44x44 primary create action with the legacy selector", () => {
    const html = render(<ConfigCatalog />)
    expect(html.match(/data-testid="catalog-create-btn"/g)).toHaveLength(1)
    expect(html).toContain('data-action-key="catalog-create"')
    expect(html).toContain('aria-label="manager:catalog.addManual"')
    expect(html).toContain('title="manager:catalog.addManual"')
    expect(html).toContain("h-11")
    expect(html).toContain("w-11")
    expect(html).toContain("bg-[var(--color-primary)]")
  })

  it("uses the action dock without legacy footer zones", () => {
    const html = render(<ConfigCatalog />)
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('role="group"')
    expect(html).not.toContain("<footer")
    expect(html).not.toContain('data-testid="action-footer-primary"')
    expect(html).not.toContain('data-testid="action-footer-secondary"')
    expect(html).not.toContain('data-testid="action-footer-controls"')
    expect(html).not.toContain('data-testid="action-footer-summary"')
    // Exactly one icon button rendered by the compact bar.
    expect(html.match(/<button/g)).toHaveLength(1)
  })
})
