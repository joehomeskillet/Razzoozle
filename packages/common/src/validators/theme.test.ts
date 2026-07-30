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
    if (!result.success) return
    expect("style" in result.data).toBe(false)
  })

  it("back-compat: parsed old theme with style:glass has no style property", () => {
    const oldThemeWithGlass = {
      ...DEFAULT_THEME,
      style: "glass",
    }
    const result = themeValidator.safeParse(oldThemeWithGlass)
    expect(result.success).toBe(true)
    if (!result.success) return
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
})

  it("accepts new flower-battle sound slots in theme.sounds", () => {
    const themeWithFlowerSounds = {
      ...DEFAULT_THEME,
      sounds: {
        ...DEFAULT_THEME.sounds,
        flowerFertilizer: null,
        flowerSunbeam: null,
        flowerAcidRain: null,
      },
    }
    const result = themeValidator.safeParse(themeWithFlowerSounds)
    expect(result.success).toBe(true)
  })

  it("validates new flower-battle sound slots with asset refs", () => {
    const themeWithFlowerAssets = {
      ...DEFAULT_THEME,
      sounds: {
        ...DEFAULT_THEME.sounds,
        flowerFertilizer: "/theme/flower-custom-1.mp3",
        flowerSunbeam: "/media/audio/sunbeam.mp3",
        flowerAcidRain: null,
      },
    }
    const result = themeValidator.safeParse(themeWithFlowerAssets)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.sounds.flowerFertilizer).toBe("/theme/flower-custom-1.mp3")
    expect(result.data.sounds.flowerSunbeam).toBe("/media/audio/sunbeam.mp3")
    expect(result.data.sounds.flowerAcidRain).toBeNull()
  })
