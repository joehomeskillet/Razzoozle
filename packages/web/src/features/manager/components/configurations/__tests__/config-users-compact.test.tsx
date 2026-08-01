import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import ConfigUsers from "../ConfigUsers"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock(
  "@razzoozle/web/features/manager/contexts/action-footer-host-context",
  () => ({
    useActionFooterHostOptional: () => ({
      target: {},
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

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: (selector: (state: { username: string }) => unknown) =>
    selector({ username: "admin" }),
}))

vi.mock(
  "@razzoozle/web/features/manager/components/configurations/users/userManagementApi",
  () => ({
    bulkUserActionApi: vi.fn(),
    createUserApi: vi.fn(),
    deleteUserApi: vi.fn(),
    fetchUsers: vi.fn(async () => []),
    parseErrorMessage: vi.fn(),
    resetUserPasswordApi: vi.fn(),
    toggleUserActiveApi: vi.fn(),
  }),
)

vi.mock("@razzoozle/web/components/AlertDialog", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/components/manager/BulkActionToolbar", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/components/manager/PageHeader", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/components/manager/SelectAllControl", () => ({
  default: () => null,
}))
vi.mock("../users/UserFilterPanel", () => ({ default: () => null }))
vi.mock("../users/UserManagementList", () => ({ default: () => null }))
vi.mock("../users/CreateUserDialog", () => ({ default: () => null }))
vi.mock("../users/ResetPasswordDialog", () => ({ default: () => null }))
vi.mock("@razzoozle/web/features/manager/hooks/useEntitySelection", () => ({
  useEntitySelection: () => ({
    selected: new Set<number>(),
    selectionActive: false,
    allSelected: false,
    someSelected: false,
    clear: vi.fn(),
    toggleAll: vi.fn(),
  }),
}))

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

const render = (node: ReactNode) => renderToStaticMarkup(node)

describe("ConfigUsers compact footer", () => {
  it("keeps one accessible 44x44 create action with the legacy selector", () => {
    const html = render(<ConfigUsers />)
    expect(html.match(/data-testid="users-create-btn"/g)).toHaveLength(1)
    expect(html).toContain('data-action-key="create"')
    expect(html).toContain('aria-label="manager:users.create"')
    expect(html).toContain('title="manager:users.create"')
    expect(html).toContain("h-11")
    expect(html).toContain("w-11")
    expect(html).toContain("bg-[var(--color-primary)]")
  })

  it("uses the action dock without a nested footer landmark", () => {
    const html = render(<ConfigUsers />)
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('role="group"')
    expect(html).not.toContain("<footer")
    expect(html.match(/<button/g)).toHaveLength(1)
  })
})
