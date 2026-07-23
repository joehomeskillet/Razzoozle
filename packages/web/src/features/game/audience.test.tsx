// Unit tests for audience.ts: the manager/controls -> GameAudience mapping
// and the context hook it backs.
//
// Pure TS/TSX — no jsdom, no Testing Library (the web package runs vitest
// under the `node` env, see vitest.config.ts). `useGameAudience` is still
// exercised (not just skipped) via react-dom/server's renderToStaticMarkup,
// which needs no DOM: it's a direct dependency of @razzoozle/web already and
// server-renders a tiny probe component to a string.
//
// Mirrors the existing web vitest conventions (describe/it/expect, 2-space
// indent, no semicolons).

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import {
  GameAudienceContext,
  audienceFromWrapperProps,
  useGameAudience,
} from "./audience"

describe("audienceFromWrapperProps", () => {
  it("manager + controls undefined -> presenter", () => {
    expect(audienceFromWrapperProps(true, undefined)).toBe("presenter")
  })

  it("manager + controls true -> presenter", () => {
    expect(audienceFromWrapperProps(true, true)).toBe("presenter")
  })

  it("manager + controls false -> display", () => {
    expect(audienceFromWrapperProps(true, false)).toBe("display")
  })

  it("manager false + controls undefined -> player", () => {
    expect(audienceFromWrapperProps(false, undefined)).toBe("player")
  })

  it("manager undefined + controls undefined -> player", () => {
    expect(audienceFromWrapperProps(undefined, undefined)).toBe("player")
  })

  it("manager undefined + controls true -> player (controls ignored without manager)", () => {
    expect(audienceFromWrapperProps(undefined, true)).toBe("player")
  })

  it("manager undefined + controls false -> player (controls ignored without manager)", () => {
    expect(audienceFromWrapperProps(undefined, false)).toBe("player")
  })

  it("manager false + controls true -> player", () => {
    expect(audienceFromWrapperProps(false, true)).toBe("player")
  })

  it("manager false + controls false -> player", () => {
    expect(audienceFromWrapperProps(false, false)).toBe("player")
  })
})

describe("useGameAudience", () => {
  function Probe() {
    const audience = useGameAudience()
    return <>{audience}</>
  }

  it("defaults to player outside any GameAudienceContext.Provider", () => {
    expect(renderToStaticMarkup(<Probe />)).toBe("player")
  })

  it("reads the value provided by GameAudienceContext.Provider", () => {
    const markup = renderToStaticMarkup(
      <GameAudienceContext.Provider value="presenter">
        <Probe />
      </GameAudienceContext.Provider>,
    )
    expect(markup).toBe("presenter")
  })

  it("re-renders with a display value from the provider", () => {
    const markup = renderToStaticMarkup(
      <GameAudienceContext.Provider value="display">
        <Probe />
      </GameAudienceContext.Provider>,
    )
    expect(markup).toBe("display")
  })
})
