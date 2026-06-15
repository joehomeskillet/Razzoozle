/**
 * WCAG 2.x contrast helpers (spec §A1) — pure TS, no deps, no React.
 *
 * Parses 3- and 6-digit hex (with or without a leading `#`) and computes the
 * relative luminance / contrast ratio per the WCAG 2.x definitions, then maps a
 * ratio onto the AAA / AA / fail bands.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * Parse a hex colour into 0..255 channels. Accepts `#abc`, `abc`, `#aabbcc`,
 * `aabbcc`. Returns `null` for anything that is not a valid 3/6-digit hex.
 */
export const hexToRgb = (hex: string): Rgb | null => {
  if (typeof hex !== "string") return null
  let value = hex.trim()
  if (value.startsWith("#")) value = value.slice(1)

  if (value.length === 3) {
    value = value
      .split("")
      .map((ch) => ch + ch)
      .join("")
  }

  if (value.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(value)) return null

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

/**
 * Relative luminance of an sRGB colour per WCAG 2.x (range 0..1).
 */
export const relativeLuminance = ({ r, g, b }: Rgb): number => {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Contrast ratio between two hex colours per WCAG 2.x (range 1..21).
 * Unparseable input yields the worst-case ratio of 1.
 */
export const contrastRatio = (fgHex: string, bgHex: string): number => {
  const fg = hexToRgb(fgHex)
  const bg = hexToRgb(bgHex)
  if (!fg || !bg) return 1

  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export type WcagLevel = "AAA" | "AA" | "fail"

/**
 * Map a contrast ratio onto the WCAG normal-text bands: ≥7 AAA, ≥4.5 AA,
 * otherwise fail.
 */
export const wcagLevel = (ratio: number): WcagLevel => {
  if (ratio >= 7) return "AAA"
  if (ratio >= 4.5) return "AA"
  return "fail"
}
