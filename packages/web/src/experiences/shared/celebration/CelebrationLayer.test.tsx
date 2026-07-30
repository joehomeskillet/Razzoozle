// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CelebrationLayer } from "./CelebrationLayer"

describe("CelebrationLayer", () => {
  it("renders an inert, pointer-transparent celebration container", () => {
    const html = renderToStaticMarkup(
      <CelebrationLayer className="celebration-test">
        <span>Fireworks</span>
      </CelebrationLayer>,
    )

    expect(html).toContain("<span>Fireworks</span>")
    expect(html).toContain('class="pointer-events-none celebration-test"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toMatch(/<(?:button|a)(?:\s|>)/i)
    expect(html).not.toMatch(/\s(?:role|tabindex|href|on[a-z]+)=/i)
  })
})
