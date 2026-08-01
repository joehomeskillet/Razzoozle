import type { EffectCallback, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ActionFooterCompact } from "../ActionFooter.compact"

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  effectCleanup: undefined as (() => void) | undefined,
  register: vi.fn(),
}))

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react")
  return {
    ...actual,
    useLayoutEffect: (effect: EffectCallback) => {
      const cleanup = effect()
      mocks.effectCleanup = typeof cleanup === "function" ? cleanup : undefined
    },
  }
})

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom")
  return {
    ...actual,
    createPortal: (children: ReactNode) => children,
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock(
  "@razzoozle/web/features/manager/contexts/action-footer-host-context",
  () => ({
    useActionFooterHostOptional: () => ({
      target: {},
      register: mocks.register,
    }),
  }),
)

const renderCompact = (instanceId: string) =>
  renderToStaticMarkup(
    <ActionFooterCompact actions={[]} instanceId={instanceId} />,
  )

describe("ActionFooterCompact registration lifecycle", () => {
  beforeEach(() => {
    mocks.cleanup.mockReset()
    mocks.register.mockReset().mockReturnValue(mocks.cleanup)
    mocks.effectCleanup = undefined
  })

  it("returns the host registration cleanup", () => {
    renderCompact("users")

    expect(mocks.register).toHaveBeenCalledOnce()
    expect(mocks.register).toHaveBeenCalledWith("users")
    expect(mocks.effectCleanup).toBeTypeOf("function")

    mocks.effectCleanup?.()
    expect(mocks.cleanup).toHaveBeenCalledOnce()
  })

  it("registers the current instance id on each component lifecycle", () => {
    renderCompact("users")
    mocks.effectCleanup?.()
    renderCompact("play")

    expect(mocks.register).toHaveBeenNthCalledWith(1, "users")
    expect(mocks.register).toHaveBeenNthCalledWith(2, "play")
    expect(mocks.cleanup).toHaveBeenCalledOnce()
  })
})
