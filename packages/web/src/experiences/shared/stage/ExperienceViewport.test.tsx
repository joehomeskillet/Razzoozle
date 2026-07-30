// Unit tests for ExperienceViewport (experience kit stage layer).
//
// Pure TS/TSX — no jsdom, no Testing Library (the web package runs vitest
// under the `node` env, see vitest.config.ts). Assertions use React's
// server renderer (renderToStaticMarkup), no fireEvent.
//
// jsdom performs no real CSS layout, so a rendered scrollHeight/clientHeight
// comparison is not meaningful here — the regression this test guards
// against (WP-958B: `h-screen` overflowing a smaller ancestor box, causing
// the display route to scroll) is pinned structurally instead: the rendered
// className must resolve height via `h-full` (parent-relative), never
// `h-screen` (viewport-relative, ADR-013). Real pixel/overflow verification
// is e2e-deferred.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ExperienceViewport } from "./ExperienceViewport"

describe("ExperienceViewport", () => {
  it("renders without error", () => {
    const html = renderToStaticMarkup(<ExperienceViewport>Test</ExperienceViewport>)
    expect(html).toBeTruthy()
  })

  it("sizes to the parent box via h-full, never h-screen (WP-958B)", () => {
    const html = renderToStaticMarkup(<ExperienceViewport>Test</ExperienceViewport>)
    expect(html).toContain("h-full")
    expect(html).not.toContain("h-screen")
  })

  it("keeps the @container query for responsive child scaling", () => {
    const html = renderToStaticMarkup(<ExperienceViewport>Test</ExperienceViewport>)
    expect(html).toContain("@container")
  })

  it("merges a caller className alongside the base classes", () => {
    const html = renderToStaticMarkup(
      <ExperienceViewport className="custom-class">Test</ExperienceViewport>,
    )
    expect(html).toContain("custom-class")
    expect(html).toContain("h-full")
  })

  it("renders children", () => {
    const html = renderToStaticMarkup(
      <ExperienceViewport>
        <div>Child content</div>
      </ExperienceViewport>,
    )
    expect(html).toContain("Child content")
  })
})
