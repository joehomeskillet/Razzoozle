import {
  createElement,
  type ComponentProps,
  type ComponentPropsWithoutRef,
  type PropsWithChildren,
} from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import CreateUserDialog from "./CreateUserDialog"
import ResetPasswordDialog from "./ResetPasswordDialog"

const radixState = vi.hoisted(() => ({
  onOpenChange: undefined as ((open: boolean) => void) | undefined,
}))

vi.mock("@radix-ui/react-dialog", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  const Root = ({
    children,
    open,
    onOpenChange,
  }: PropsWithChildren<{
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }>) => {
    radixState.onOpenChange = onOpenChange
    return open ? children : null
  }

  const Portal = ({ children }: PropsWithChildren) => children
  const Overlay = (props: ComponentPropsWithoutRef<"div">) =>
    React.createElement("div", { "data-radix-overlay": "", ...props })
  const Content = (props: ComponentPropsWithoutRef<"section">) =>
    React.createElement("section", { role: "dialog", ...props })
  const Title = (props: ComponentPropsWithoutRef<"h2">) =>
    React.createElement("h2", props)
  const Close = ({ children }: PropsWithChildren<{ asChild?: boolean }>) =>
    children

  return { Close, Content, Overlay, Portal, Root, Title }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const noop = () => undefined

const createUserDefaults: ComponentProps<typeof CreateUserDialog> = {
  isOpen: true,
  onClose: noop,
  username: "alice",
  onUsernameChange: noop,
  password: "secret-passphrase",
  onPasswordChange: noop,
  role: "user",
  onRoleChange: noop,
  creating: false,
  copySourceId: null,
  onSubmit: noop,
}

const resetPasswordDefaults: ComponentProps<typeof ResetPasswordDialog> = {
  user: {
    id: 7,
    username: "alice",
    role: "user",
    active: true,
    created_at: "2026-08-01T00:00:00Z",
  },
  isOpen: true,
  onClose: noop,
  newPassword: "new-secret-passphrase",
  onPasswordChange: noop,
  resetting: false,
  onSubmit: noop,
}

const renderCreateUserDialog = (
  overrides: Partial<ComponentProps<typeof CreateUserDialog>> = {},
) =>
  renderToStaticMarkup(
    createElement(CreateUserDialog, { ...createUserDefaults, ...overrides }),
  )

const renderResetPasswordDialog = (
  overrides: Partial<ComponentProps<typeof ResetPasswordDialog>> = {},
) =>
  renderToStaticMarkup(
    createElement(ResetPasswordDialog, {
      ...resetPasswordDefaults,
      ...overrides,
    }),
  )

const expectOpaqueDialogChrome = (
  markup: string,
  titleId: string,
  iconClass: string,
) => {
  const dialogTag = /<section[^>]*role="dialog"[^>]*>/.exec(markup)?.[0]
  const overlayTag = /<div[^>]*data-radix-overlay=""[^>]*>/.exec(markup)?.[0]

  expect(dialogTag).toBeDefined()
  expect(dialogTag).toContain(`aria-labelledby="${titleId}"`)
  expect(dialogTag).toContain("bg-[var(--surface)]")
  expect(overlayTag).toContain("bg-black/40")
  expect(markup).not.toContain("backdrop-blur")
  expect(markup).toContain(`id="${titleId}"`)
  expect(markup).toContain(iconClass)
  expect(markup).toContain('aria-hidden="true"')
  expect(markup).toContain('aria-label="common:close"')
}

describe("manager user dialog chrome", () => {
  it("renders Create User on the shared opaque surface", () => {
    const markup = renderCreateUserDialog()

    expectOpaqueDialogChrome(
      markup,
      "create-user-dialog-title",
      "lucide-user-plus",
    )
    expect(markup).toContain("manager:users.createTitle")
  })

  it("renders Reset Password on the shared opaque surface", () => {
    const markup = renderResetPasswordDialog()

    expectOpaqueDialogChrome(
      markup,
      "reset-user-password-dialog-title",
      "lucide-key",
    )
    expect(markup).toContain("manager:users.resetPasswordTitle")
  })

  it("keeps Create User labels, autocomplete, role options and form actions", () => {
    const markup = renderCreateUserDialog()

    expect(markup).toContain('for="create-user-username"')
    expect(markup).toContain('id="create-user-username"')
    expect(markup).toContain('autoComplete="username"')
    expect(markup).toContain('for="create-user-password"')
    expect(markup).toContain('id="create-user-password"')
    expect(markup).toContain('autoComplete="new-password"')
    expect(markup).toContain('for="create-user-role"')
    expect(markup).toContain('id="create-user-role"')
    expect(markup).toContain('<option value="user"')
    expect(markup).toContain('<option value="lehrkraft"')
    expect(markup).toContain('<option value="admin"')
    expect(markup).toMatch(/<button[^>]*type="button"/)
    expect(markup).toMatch(/<button[^>]*type="submit"/)
  })

  it("keeps Reset Password labelled, autocomplete-safe and disabled without input", () => {
    const markup = renderResetPasswordDialog({ newPassword: "" })

    expect(markup).toContain('for="reset-user-password"')
    expect(markup).toContain('id="reset-user-password"')
    expect(markup).toContain('autoComplete="new-password"')
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/)
  })

  it.each([
    ["Create User", renderCreateUserDialog],
    ["Reset Password", renderResetPasswordDialog],
  ] as const)("forwards Radix dismissal for %s", (_, renderDialog) => {
    const onClose = vi.fn()
    renderDialog({ onClose })

    radixState.onOpenChange?.(true)
    expect(onClose).not.toHaveBeenCalled()

    radixState.onOpenChange?.(false)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("does not render Reset Password without a selected user", () => {
    expect(renderResetPasswordDialog({ user: null })).toBe("")
  })
})
