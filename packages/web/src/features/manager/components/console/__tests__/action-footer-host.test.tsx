// AF03 #1009 — ActionFooter shell host registry + slot contract.
// Vitest env is node (no jsdom): pure registry tests + renderToStaticMarkup for slot.

import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import {
  ActionFooterHostProvider,
  ActionFooterHostSlot,
  createActionFooterRegistry,
  setRequiredFooterEnforcement,
  REQUIRED_FOOTER_ENFORCEMENT,
} from "@razzoozle/web/features/manager/contexts/action-footer-host-context"

describe("createActionFooterRegistry", () => {
  it("register returns cleanup and tracks count", () => {
    const reg = createActionFooterRegistry({ strict: true })
    expect(reg.count).toBe(0)
    const unregister = reg.register("play-footer")
    expect(reg.count).toBe(1)
    unregister()
    expect(reg.count).toBe(0)
  })

  it("allows re-register of the same instanceId", () => {
    const reg = createActionFooterRegistry({ strict: true })
    reg.register("same")
    // second register same id — count stays 1 (Set)
    const cleanup = reg.register("same")
    expect(reg.count).toBe(1)
    cleanup()
    expect(reg.count).toBe(0)
  })

  it("throws on duplicate distinct instanceIds when strict", () => {
    const reg = createActionFooterRegistry({ strict: true })
    reg.register("a")
    expect(() => reg.register("b")).toThrow(/only one footer/)
  })

  it("reports duplicate via onError when not strict", () => {
    const onError = vi.fn()
    const reg = createActionFooterRegistry({ strict: false, onError })
    reg.register("a")
    reg.register("b")
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/only one footer/))
  })

  it("assertPolicy none + registered throws when strict", () => {
    const reg = createActionFooterRegistry({ strict: true })
    reg.register("x")
    expect(() => reg.assertPolicy("none")).toThrow(/policy "none"/)
  })

  it("assertPolicy required + empty warns by default (migration bridge)", () => {
    const onError = vi.fn()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const prev = REQUIRED_FOOTER_ENFORCEMENT
    setRequiredFooterEnforcement("warn")
    const reg = createActionFooterRegistry({ strict: true, onError })
    expect(() => reg.assertPolicy("required")).not.toThrow()
    expect(onError).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    setRequiredFooterEnforcement(prev)
    warn.mockRestore()
  })

  it("assertPolicy required + empty throws when enforcement is error", () => {
    const prev = REQUIRED_FOOTER_ENFORCEMENT
    setRequiredFooterEnforcement("error")
    const reg = createActionFooterRegistry({ strict: true })
    expect(() => reg.assertPolicy("required")).toThrow(/policy "required"/)
    setRequiredFooterEnforcement(prev)
  })

  it("subscribe notifies on register/unregister", () => {
    const reg = createActionFooterRegistry({ strict: true })
    const listener = vi.fn()
    const unsub = reg.subscribe(listener)
    reg.register("z")
    expect(listener).toHaveBeenCalled()
    unsub()
  })
})

describe("ActionFooterHostSlot (SSR markup)", () => {
  it("renders host footer with data-testid inside provider", () => {
    // registrationCount starts at 0 → hidden attribute present
    const html = renderToStaticMarkup(
      <ActionFooterHostProvider activeKey="play" footerPolicy="optional" strict={false}>
        <div className="console-shell">
          <ActionFooterHostSlot />
        </div>
      </ActionFooterHostProvider>,
    )
    expect(html).toContain('data-testid="console-action-footer-host"')
    expect(html).toContain("h-0")  // collapsed empty host (no HTML hidden attr)
    expect(html).toContain('data-registered="0"')
  })

  it("host is a footer landmark with accessible name", () => {
    const html = renderToStaticMarkup(
      <ActionFooterHostProvider activeKey="play" strict={false}>
        <ActionFooterHostSlot />
      </ActionFooterHostProvider>,
    )
    expect(html).toMatch(/<footer[^>]*aria-label=/)
  })
})
