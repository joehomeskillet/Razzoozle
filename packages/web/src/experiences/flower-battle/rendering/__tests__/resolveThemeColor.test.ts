import { describe, expect, it } from "vitest"

import type { CssTokenName } from "@razzoozle/common/theme-tokens"

import {
  cssColorToPixiNumber,
  resolveThemeTokenColor,
  ThemeTokenColorError,
  THEME_TOKEN_COLOR_ERROR,
} from "../resolveThemeColor"

describe("cssColorToPixiNumber", () => {
  it("parses hex and rgb", () => {
    expect(cssColorToPixiNumber("#ff00aa")).toBe(0xff00aa)
    expect(cssColorToPixiNumber("#f0a")).toBe(0xff00aa)
    expect(cssColorToPixiNumber("rgb(255, 0, 170)")).toBe(0xff00aa)
  })

  it("rejects invalid input", () => {
    expect(cssColorToPixiNumber("")).toBeNull()
    expect(cssColorToPixiNumber("not-a-color")).toBeNull()
  })
})

describe("resolveThemeTokenColor", () => {
  const token = "--surface-2" as CssTokenName

  it("resolves via getThemeTokenCssVar + getComputedStyle", () => {
    const element = {} as Element
    const color = resolveThemeTokenColor(token, {
      element,
      getComputedStyleFn: () => ({
        getPropertyValue: (prop: string) => {
          expect(prop).toBe("--surface-2")
          return "#aabbcc"
        },
      }),
    })
    expect(color).toBe(0xaabbcc)
  })

  it("throws controlled error on empty token value", () => {
    expect(() =>
      resolveThemeTokenColor(token, {
        element: {} as Element,
        getComputedStyleFn: () => ({
          getPropertyValue: () => "   ",
        }),
      }),
    ).toThrow(ThemeTokenColorError)

    try {
      resolveThemeTokenColor(token, {
        element: {} as Element,
        getComputedStyleFn: () => ({ getPropertyValue: () => "" }),
      })
      expect.unreachable("should throw")
    } catch (err) {
      expect(err).toBeInstanceOf(ThemeTokenColorError)
      const e = err as ThemeTokenColorError
      expect(e.code).toBe(THEME_TOKEN_COLOR_ERROR)
      expect(e.token).toBe(token)
    }
  })

  it("throws controlled error on invalid color text", () => {
    expect(() =>
      resolveThemeTokenColor(token, {
        element: {} as Element,
        getComputedStyleFn: () => ({
          getPropertyValue: () => "purple-ish",
        }),
      }),
    ).toThrow(/invalid color/)
  })
})
