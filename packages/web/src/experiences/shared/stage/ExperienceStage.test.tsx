// Unit tests for ExperienceStage (experience kit stage layer).
//
// Pure TS/TSX — no jsdom, no Testing Library (the web package runs vitest
// under the `node` env, see vitest.config.ts). Assertions use React's
// server renderer (renderToStaticMarkup), no fireEvent.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ExperienceStage } from "./ExperienceStage"

describe("ExperienceStage", () => {
  it("renders without error", () => {
    const html = renderToStaticMarkup(<ExperienceStage>Test</ExperienceStage>)
    expect(html).toBeTruthy()
  })

  it("has aspect-video class for stable aspect ratio", () => {
    const html = renderToStaticMarkup(<ExperienceStage>Test</ExperienceStage>)
    expect(html).toContain("aspect-video")
  })

  it("has overflow-x-hidden to prevent horizontal scroll", () => {
    const html = renderToStaticMarkup(<ExperienceStage>Test</ExperienceStage>)
    expect(html).toContain("overflow-x-hidden")
  })

  it("has a dvh-based max-height ceiling so an indefinite ancestor can never let aspect-video overflow the viewport (WP-958D)", () => {
    const html = renderToStaticMarkup(<ExperienceStage>Test</ExperienceStage>)
    expect(html).toMatch(/max-h-\[\d+dvh\]/)
  })

  it("renders children", () => {
    const html = renderToStaticMarkup(
      <ExperienceStage>
        <div>Child content</div>
      </ExperienceStage>,
    )
    expect(html).toContain("Child content")
  })
})
