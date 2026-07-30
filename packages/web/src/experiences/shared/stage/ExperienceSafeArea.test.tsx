// Unit tests for ExperienceSafeArea (experience kit stage layer).
//
// Pure TS/TSX — no jsdom, no Testing Library (the web package runs vitest
// under the `node` env, see vitest.config.ts). Assertions use React's
// server renderer (renderToStaticMarkup), no fireEvent.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ExperienceSafeArea } from "./ExperienceSafeArea"

describe("ExperienceSafeArea", () => {
  it("renders without error", () => {
    const html = renderToStaticMarkup(
      <ExperienceSafeArea>Content</ExperienceSafeArea>,
    )
    expect(html).toBeTruthy()
  })

  it("includes safe-area-inset CSS env variables in className", () => {
    const html = renderToStaticMarkup(
      <ExperienceSafeArea>Content</ExperienceSafeArea>,
    )
    expect(html).toContain("safe-area-inset")
  })

  it("renders children", () => {
    const html = renderToStaticMarkup(
      <ExperienceSafeArea>
        <span>Safe area content</span>
      </ExperienceSafeArea>,
    )
    expect(html).toContain("Safe area content")
  })
})
