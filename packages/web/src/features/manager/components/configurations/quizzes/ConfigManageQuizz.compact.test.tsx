// AF-compact Quiz callsite (wp-b-1) — replicates the canonical pattern from
// PR #1045 (play/catalog/users) for the Quiz manager tab. Verifies the
// icon-only 44x44 footer exposes Create (primary), Import (secondary) and
// Open Template (secondary), preserves the legacy test ids so the rest of
// the suite keeps selecting, and uses the IconBarDock role="group" landmark
// instead of the legacy text-footer `<footer>`.

import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  fileInputClick: vi.fn(),
  setTemplatePickerOpen: vi.fn(),
  setBulkDeleteOpen: vi.fn(),
  selection: {
    selected: new Set<string>(),
    selectionActive: false,
    allSelected: false,
    someSelected: false,
    clear: vi.fn(),
    toggle: vi.fn(),
    toggleAll: vi.fn(),
  },
  handleBulkDelete: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock("@razzoozle/web/features/manager/contexts/config-context", () => ({
  useConfig: () => ({ quizz: [], klassenEnabled: false }),
}))

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } }),
  useEvent: () => undefined,
}))

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: (
    selector: (state: { config?: { klassenEnabled?: boolean } }) => unknown,
  ) => selector({ config: { klassenEnabled: false } }),
}))

vi.mock(
  "@razzoozle/web/features/manager/components/configurations/labels/useLabelManager",
  () => ({
    useLabelManager: () => ({ labels: [] }),
  }),
)

const clickableFileInput = (
  <input
    type="file"
    data-testid="quizz-file-input"
    ref={(node: HTMLInputElement | null) => {
      if (node) {
        node.click = () => mocks.fileInputClick()
      }
    }}
  />
)

vi.mock(
  "@razzoozle/web/features/manager/components/configurations/TemplatePickerDialog",
  () => ({
    default: (props: { open: boolean; onOpenChange: (o: boolean) => void }) => {
      if (props.open) mocks.setTemplatePickerOpen(true)
      return <div data-testid="template-picker-mock" />
    },
  }),
)

vi.mock(
  "@razzoozle/web/features/manager/components/configurations/TemplateMetaDialog",
  () => ({
    default: () => null,
  }),
)

vi.mock("../quizzes/useQuizzManager", () => ({
  useQuizzManager: () => ({
    quizz: [],
    navigate: mocks.navigate,
    fileInputRef: { current: null },
    showArchived: false,
    setShowArchived: vi.fn(),
    search: "",
    setSearch: vi.fn(),
    sortKey: "name-asc",
    setSortKey: vi.fn(),
    pendingDelete: null,
    setPendingDelete: vi.fn(),
    pendingDuplicate: null,
    setPendingDuplicate: vi.fn(),
    bulkDeleteOpen: false,
    setBulkDeleteOpen: mocks.setBulkDeleteOpen,
    activeQuizz: [],
    archivedQuizz: [],
    hasMatches: false,
    handleExport: vi.fn(),
    handleBulkDelete: mocks.handleBulkDelete,
    handleDelete: vi.fn(),
    handleDuplicate: vi.fn(),
    handleArchived: vi.fn(),
    handleImport: vi.fn(),
  }),
}))

vi.mock("@razzoozle/web/features/manager/hooks/useEntitySelection", () => ({
  useEntitySelection: () => ({
    selected: mocks.selection.selected,
    selectionActive: mocks.selection.selectionActive,
    allSelected: mocks.selection.allSelected,
    someSelected: mocks.selection.someSelected,
    clear: mocks.selection.clear,
    toggle: mocks.selection.toggle,
    toggleAll: mocks.selection.toggleAll,
  }),
}))

vi.mock("../quizzes/QuizzList", () => ({
  default: () => null,
}))

vi.mock("../quizzes/QuizzDialogs", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/Button", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <button type="button" data-testid="quizz-body-action">
      {children}
    </button>
  ),
}))

vi.mock("@razzoozle/web/components/Input", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/Select", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/manager/PageHeader", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/manager/FilterGroup", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/manager/BulkActionToolbar", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/manager/SelectAllControl", () => ({
  default: () => null,
}))

vi.mock("@razzoozle/web/components/labels/LabelFilterPills", () => ({
  default: () => null,
}))

vi.mock(
  "@razzoozle/web/features/manager/contexts/action-footer-host-context",
  () => ({
    useActionFooterHostOptional: () => ({
      target: {} as HTMLElement,
      register: vi.fn(() => () => undefined),
      registrationCount: 1,
      setTarget: vi.fn(),
      variant: "compact",
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

import ConfigManageQuizz from "../quizzes/ConfigManageQuizz"

const render = () => renderToStaticMarkup(<ConfigManageQuizz />)

beforeEach(() => {
  mocks.fileInputClick.mockClear()
  mocks.navigate.mockClear()
  mocks.setTemplatePickerOpen.mockClear()
  mocks.setBulkDeleteOpen.mockClear()
  mocks.handleBulkDelete.mockClear()
  mocks.selection = {
    selected: new Set<string>(),
    selectionActive: false,
    allSelected: false,
    someSelected: false,
    clear: vi.fn(),
    toggle: vi.fn(),
    toggleAll: vi.fn(),
  }
  clickableFileInput
})

describe("ConfigManageQuizz — compact ActionFooter (wp-b-1)", () => {
  it("renders three 44x44 icon actions with the legacy test ids and a single group landmark", () => {
    const html = render()

    expect(html.match(/data-testid="quizz-create-btn"/g)).toHaveLength(1)
    expect(html.match(/data-testid="quizz-import-btn"/g)).toHaveLength(1)
    expect(html.match(/data-testid="quizz-template-btn"/g)).toHaveLength(1)
    expect(html).toContain('data-action-key="quizz-create"')
    expect(html).toContain('data-action-key="quizz-import"')
    expect(html).toContain('data-action-key="quizz-template"')
    expect(html).toContain('aria-label="manager:quizz.create"')
    expect(html).toContain('aria-label="manager:quizz.import"')
    expect(html).toContain('aria-label="manager:templates.open"')
    expect(html).toContain("h-11")
    expect(html).toContain("w-11")
    expect(html).toContain("rounded-lg")
  })

  it("uses IconBarDock role=group semantics and drops the legacy footer chrome", () => {
    const html = render()

    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="aria.actionFooter"')
    expect(html).not.toContain('role="toolbar"')
    expect(html).not.toContain("<footer")
    expect(html).not.toContain('data-testid="action-footer-primary"')
    expect(html).not.toContain('data-testid="action-footer-secondary"')
    expect(html).not.toContain('data-testid="action-footer-controls"')
    expect(html).not.toContain('data-testid="action-footer-summary"')
    expect(html).not.toContain("pb-20")
  })

  it("places the primary Create action last so keyboard tab order is Create -> Import -> Template visually mirrored", () => {
    const html = render()

    const create = html.indexOf('data-testid="quizz-create-btn"')
    const importBtn = html.indexOf('data-testid="quizz-import-btn"')
    const template = html.indexOf('data-testid="quizz-template-btn"')
    expect(create).toBeGreaterThan(importBtn)
    expect(importBtn).toBeGreaterThan(template)
  })

  it("wires the file input to the Import icon button", () => {
    const html = render()

    expect(html).toContain('data-testid="quizz-file-input"')
    expect(html).toContain('data-action-key="quizz-import"')
    expect(html).toContain('data-action-key="quizz-create"')
  })
})
