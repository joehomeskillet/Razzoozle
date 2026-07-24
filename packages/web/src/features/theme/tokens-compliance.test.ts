import { describe, expect, it } from "vitest"
import { THEME_TOKENS, getThemeTokenCssVar } from "@razzoozle/common/theme-tokens"
import type { CssTokenName } from "@razzoozle/common/theme-tokens"

describe("Design Tokens Compliance Guard", () => {
  it("formats token CSS variables correctly via getThemeTokenCssVar", () => {
    const token: CssTokenName = "--color-primary"
    expect(getThemeTokenCssVar(token)).toBe("var(--color-primary)")

    const answerToken: CssTokenName = "--answer-1"
    expect(getThemeTokenCssVar(answerToken)).toBe("var(--answer-1)")
  })

  it("ensures all THEME_TOKENS have valid cssVar names starting with --", () => {
    expect(THEME_TOKENS.length).toBeGreaterThan(0)
    for (const tok of THEME_TOKENS) {
      expect(tok.cssVar).toMatch(/^--[a-z0-9-]+$/)
    }
  })
})
