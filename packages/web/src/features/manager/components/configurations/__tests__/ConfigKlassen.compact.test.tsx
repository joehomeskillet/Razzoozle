// AF07 — compact footer migration for the Classes tab. Mirrors the
// ConfigSelectQuizz / ConfigUsers compact-footer test contract: keep the
// 44×44 action button, surface the popup trigger id, and verify that
// closing the create dialog returns focus to the trigger.

import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import ConfigKlassen from "../klassen/ConfigKlassen"

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

const capturedDialogs: Record<string, Record<string, unknown>> = {}

vi.mock("@radix-ui/react-dialog", () => {
  const Root = ({ children }: { children: React.ReactNode }) => <>{children}</>
  const Portal = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  )
  const Overlay = ({
    className,
    children,
    ...props
  }: {
    className?: string
    children?: React.ReactNode
    [key: string]: unknown
  }) => (
    <div className={className} {...props}>
      {children}
    </div>
  )
  const Content = ({
    children,
    className,
    ...props
  }: {
    children: React.ReactNode
    className?: string
    [key: string]: unknown
  }) => {
    const id =
      typeof props.id === "string" ? (props.id as string) : "default"
    capturedDialogs[id] = props
    return (
      <div className={className} {...props}>
        {children}
      </div>
    )
  }
  const Title = ({
    children,
    ...props
  }: {
    children: React.ReactNode
    [key: string]: unknown
  }) => <h2 {...props}>{children}</h2>
  const Close = ({
    asChild,
    children,
    ...props
  }: {
    asChild?: boolean
    children: React.ReactNode
    [key: string]: unknown
  }) => {
    if (asChild) {
      return (
        <button type="button" {...props}>
          {children}
        </button>
      )
    }

    return <button {...props}>{children}</button>
  }

  return { Root, Portal, Overlay, Content, Title, Close }
})

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
}))

vi.mock("../klassen/useClassManager", () => ({
  useClassManager: () => ({
    classes: [],
    allStudents: [],
    search: "",
    setSearch: vi.fn(),
    pendingDeleteClass: null,
    setPendingDeleteClass: vi.fn(),
    pendingDeleteStudent: null,
    setPendingDeleteStudent: vi.fn(),
    handleCreateClass: vi.fn(),
    handleUpdateClass: vi.fn(),
    handleDeleteClass: vi.fn(),
    handleMoveStudent: vi.fn(),
    handleDeleteStudent: vi.fn(),
    handleUpdateStudent: vi.fn(),
    handleFetchStudents: vi.fn(),
    handleAssignLabels: vi.fn(),
  }),
}))

vi.mock("@razzoozle/web/features/manager/hooks/useEntitySelection", () => ({
  useEntitySelection: () => ({
    selected: new Set<number>(),
    selectionActive: false,
    allSelected: false,
    someSelected: false,
    clear: vi.fn(),
    toggle: vi.fn(),
    toggleAll: vi.fn(),
  }),
}))

vi.mock("@razzoozle/web/components/manager/BulkActionToolbar", () => ({
  default: () => null,
}))
vi.mock("@razzoozle/web/components/manager/SelectAllControl", () => ({
  default: () => null,
}))
vi.mock("../klassen/ClassList", () => ({ default: () => null }))
vi.mock("../klassen/StudentPicker", () => ({ default: () => null }))

const renderKlassen = () => {
  for (const key of Object.keys(capturedDialogs)) {
    delete capturedDialogs[key]
  }
  return renderToStaticMarkup(<ConfigKlassen />)
}

describe("ConfigKlassen — compact footer migration (wp-b-2)", () => {
  it("registers one ActionFooterCompact action with instanceId=classes", () => {
    const html = renderKlassen()

    expect(html).toContain('data-testid="action-footer-compact"')
    expect(html).not.toContain('role="toolbar"')
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Page actions"/)

    expect(html).toContain('data-testid="klassen-create-btn"')
    expect(html).toContain('data-action-key="classes-create"')
  })

  it("renders the create action as a 44x44 icon-only button with a popup contract", () => {
    const html = renderKlassen()

    const createButton =
      /<button[^>]*data-testid="klassen-create-btn"[^>]*>/.exec(html)?.[0]
    expect(createButton).toBeTruthy()
    expect(createButton).toContain('id="create-class-dialog-trigger"')
    expect(createButton).toContain('aria-haspopup="dialog"')
    expect(createButton).toContain('aria-controls="create-class-dialog"')
    expect(createButton).toContain('aria-expanded="false"')
    expect(createButton).toContain('aria-label="manager:classes.create"')
    expect(createButton).toContain('title="manager:classes.create"')
    expect(createButton).toContain("h-11")
    expect(createButton).toContain("w-11")
    expect(createButton).toContain("bg-[var(--color-primary)]")
  })

  it("does not render the legacy ActionFooter wrapper or the wide primary button", () => {
    const html = renderKlassen()

    expect(html).not.toContain('data-testid="action-footer"')
    expect(html).not.toContain("<footer")
    expect(html).not.toMatch(/<button[^>]*class="[^"]*rounded-\[var\(--radius-theme\)\][^"]*sm:w-auto"/)
  })

  it("exposes the create dialog as a labelled ARIA dialog with aria-describedby=undefined", () => {
    renderKlassen()

    const createDialog = capturedDialogs["create-class-dialog"]
    expect(createDialog).toBeDefined()
    expect(createDialog?.["aria-describedby"]).toBeUndefined()
    expect(createDialog?.["aria-labelledby"]).toBe(
      "create-class-dialog-title",
    )
    expect(createDialog?.id).toBe("create-class-dialog")
  })

  it("returns focus to the create trigger on dialog close (X / Escape)", () => {
    const originalDocument = (globalThis as Record<string, unknown>).document
    const focusTarget = { focus: vi.fn() }
    const getElementById = vi.fn().mockReturnValue(focusTarget)
    ;(globalThis as Record<string, unknown>).document = { getElementById }

    renderKlassen()

    const createDialog = capturedDialogs["create-class-dialog"]
    const onCloseAutoFocus = createDialog?.onCloseAutoFocus as
      | ((event: { preventDefault: () => void }) => void)
      | undefined

    expect(onCloseAutoFocus).toBeTypeOf("function")

    const preventDefault = vi.fn()
    onCloseAutoFocus?.({ preventDefault })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(getElementById).toHaveBeenCalledWith("create-class-dialog-trigger")
    expect(focusTarget.focus).toHaveBeenCalledTimes(1)

    ;(globalThis as Record<string, unknown>).document = originalDocument
  })

  it("keeps keyboard tab order: the create action is the only focusable footer control", () => {
    const html = renderKlassen()

    const footerIndex = html.indexOf('data-testid="action-footer-compact"')
    expect(footerIndex).toBeGreaterThan(-1)
    const footerMarkup = html.slice(footerIndex)
    const focusableButtons = footerMarkup.match(/<button/g) ?? []

    expect(focusableButtons).toHaveLength(1)
    expect(footerMarkup).toContain('data-action-key="classes-create"')
    // Primary intent renders the token-only primary background, which is
    // the visual + a11y signal that Enter advances the user to the create
    // dialog (no other footer action preempts the focus order).
    expect(footerMarkup).toContain("bg-[var(--color-primary)]")
  })
})
