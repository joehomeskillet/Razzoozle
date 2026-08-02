import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import ConfigSchueler from "./ConfigSchueler"

// WP-b-3 — AF-compact migration for the Students (Schueler) tab.
// Replicates the Play-options PR #1045 pattern with the existing
// `schueler.create` i18n key (no manager.json edits) — file-scoped to this tab.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } }),
}))

vi.mock("../schueler/useSchuelerManager", () => ({
  useSchuelerManager: () => ({
    filteredStudents: [],
    hasStudents: false,
    search: "",
    setSearch: vi.fn(),
    statusFilter: null,
    setStatusFilter: vi.fn(),
    classes: [],
    pinView: null,
    clearPinView: vi.fn(),
    pendingDeleteStudent: null,
    setPendingDeleteStudent: vi.fn(),
    pendingRemoveFromClass: null,
    setPendingRemoveFromClass: vi.fn(),
    pendingRegenPin: null,
    setPendingRegenPin: vi.fn(),
    handleCreateStudent: vi.fn(),
    handleShowPin: vi.fn(),
    handleRegenPin: vi.fn(),
    handleDeleteStudent: vi.fn(),
    handleRemoveFromClass: vi.fn(),
    handleAddToClass: vi.fn(),
    handleSetStudentActive: vi.fn(),
    handleBulkSetStudentActive: vi.fn(),
    handleBulkDeleteStudents: vi.fn(),
    handleBulkAssignStudents: vi.fn(),
    handleBulkRemoveStudents: vi.fn(),
  }),
}))

vi.mock("@razzoozle/web/features/manager/hooks/useEntitySelection", () => ({
  useEntitySelection: () => ({
    selected: new Set<string>(),
    allSelected: false,
    someSelected: false,
    selectedIds: [],
    clear: vi.fn(),
    toggle: vi.fn(),
    toggleAll: vi.fn(),
  }),
}))

vi.mock("@razzoozle/web/components/manager/PageHeader", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/components/manager/BulkActionToolbar", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/components/manager/SelectAllControl", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/components/manager/FilterPill", () => ({
  default: () => null,
}))
vi.mock("../schueler/CreateStudentDialog", () => ({
  default: () => null,
}))
vi.mock("../schueler/PinDialog", () => ({
  default: () => null,
}))
vi.mock("../schueler/PrintCredentialsTrigger", () => ({
  default: () => null,
}))
vi.mock("../schueler/StudentList", () => ({
  default: () => null,
}))

const render = (node: ReactNode) => renderToStaticMarkup(node)

describe("ConfigSchueler compact footer (WP wp-b-3)", () => {
  it("renders one 44x44 primary Create action with the existing schueler.create i18n key", () => {
    const html = render(<ConfigSchueler />)

    expect(html.match(/data-testid="schueler-create-btn"/g)).toHaveLength(1)
    expect(html).toContain('data-action-key="schueler-create"')
    expect(html).toContain('aria-label="manager:schueler.create"')
    expect(html).toContain('title="manager:schueler.create"')
    expect(html).toContain("h-11")
    expect(html).toContain("w-11")
    expect(html).toContain("bg-[var(--color-primary)]")
  })

  it("projects aria-haspopup + aria-controls pointing at the create dialog title", () => {
    const html = render(<ConfigSchueler />)

    const buttonMatch =
      /<button[^>]*data-testid="schueler-create-btn"[^>]*>/.exec(html)?.[0]
    expect(buttonMatch).toBeTruthy()
    expect(buttonMatch).toContain('aria-haspopup="dialog"')
    expect(buttonMatch).toContain(
      'aria-controls="create-student-dialog-title"',
    )
    expect(buttonMatch).toContain('id="create-student-dialog-title-trigger"')
    expect(buttonMatch).toContain('aria-expanded="false"')
  })

  it("uses the compact action dock without a nested footer landmark", () => {
    const html = render(<ConfigSchueler />)

    expect(html).toContain('data-testid="action-footer-compact"')
    expect(html).toContain('role="group" aria-label="aria.actionFooter"')
    expect(html).not.toContain("<footer")
    expect(html).not.toContain('data-testid="action-footer-primary"')
    expect(html).not.toContain('data-testid="action-footer-secondary"')
    expect(html).not.toContain('data-testid="action-footer-summary"')
    expect(html).not.toContain("pb-20")
  })

  it("keeps the footer order stable: Create is the sole primary action", () => {
    const html = render(<ConfigSchueler />)

    const buttonMatch =
      /<button[^>]*data-action-key="schueler-create"[^>]*>/.exec(html)?.[0]
    expect(buttonMatch).toBeTruthy()
    expect(buttonMatch).toContain('aria-label="manager:schueler.create"')
    expect(buttonMatch).toContain('title="manager:schueler.create"')
    // AF-06: exactly one primary intent visible.
    expect(html.match(/data-action-key=/g)).toHaveLength(1)
  })
})