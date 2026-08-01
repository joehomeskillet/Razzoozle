// AF04 #1010 — ActionFooter portal / no-sticky contract (node env, no jsdom).

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import ActionFooter from "./ActionFooter"

describe("ActionFooter AF04 portal-compat", () => {
  it("fallback markup has no sticky or negative-margin hacks", () => {
    const html = renderToStaticMarkup(
      <ActionFooter>
        <button type="button">Save</button>
      </ActionFooter>,
    )
    expect(html).toContain('data-testid="action-footer-fallback"')
    expect(html).not.toMatch(/sticky/)
    expect(html).not.toMatch(/-bottom-4|-mx-4|-mb-4|-bottom-6|-mx-6|-mb-6/)
    expect(html).toContain("Save")
  })

  it("dirty renders polite status without opacity-75", () => {
    const html = renderToStaticMarkup(
      <ActionFooter dirty>
        <button type="button">Save</button>
      </ActionFooter>,
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain("opacity-75")
  })

  it("marks portaled=false outside shell host", () => {
    // Without provider, only fallback is used (no data-portaled on fallback wrapper).
    const html = renderToStaticMarkup(
      <ActionFooter>
        <span>Go</span>
      </ActionFooter>,
    )
    expect(html).toContain("action-footer-fallback")
    expect(html).not.toContain('data-portaled="true"')
  })
})
