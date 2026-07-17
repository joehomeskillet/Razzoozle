import { describe, it, expect } from "vitest"
import { themeValidator } from "./theme"
import { DEFAULT_THEME } from "../types/theme"

describe("themeValidator", () => {
  it("validates a complete valid theme", () => {
    const result = themeValidator.safeParse(DEFAULT_THEME)
    expect(result.success).toBe(true)
  })

  it("back-compat: accepts old persisted theme with style:glass field and strips it", () => {
    const oldThemeWithGlass = {
      ...DEFAULT_THEME,
      style: "glass",
    }
    const result = themeValidator.safeParse(oldThemeWithGlass)
    expect(result.success).toBe(true)
    expect("style" in result.data).toBe(false)
  })

  it("back-compat: parsed old theme with style:glass has no style property", () => {
    const oldThemeWithGlass = {
      ...DEFAULT_THEME,
      style: "glass",
    }
    const result = themeValidator.safeParse(oldThemeWithGlass)
    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty("style")
  })

  it("rejects invalid color values", () => {
    const invalidTheme = {
      ...DEFAULT_THEME,
      colorPrimary: "not-a-color",
    }
    const result = themeValidator.safeParse(invalidTheme)
    expect(result.success).toBe(false)
  })

  it("accepts minimal valid theme with only required fields", () => {
    const minimalTheme = {
      colorPrimary: "#7c3aed",
      colorSecondary: "#2e1065",
      answerColors: ["#E69F00", "#56B4E9", "#3DBFA0", "#CC79A7"],
    }
    const result = themeValidator.safeParse(minimalTheme)
    expect(result.success).toBe(true)
  })

  it("fills in defaults for optional fields", () => {
    const minimalTheme = {
      colorPrimary: "#7c3aed",
      colorSecondary: "#2e1065",
      answerColors: ["#E69F00", "#56B4E9", "#3DBFA0", "#CC79A7"],
    }
    const result = themeValidator.safeParse(minimalTheme)
    expect(result.success).toBe(true)
    expect(result.data.colorText).toBe("#ffffff")
    expect(result.data.radius).toBe(16)
    expect(result.data.scrim).toBe(0)
  })
})
