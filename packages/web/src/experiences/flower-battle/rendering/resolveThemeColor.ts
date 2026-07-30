/**
 * Theme-token → Pixi color resolution (WP-PIX-05A).
 * Palette colors MUST flow through getThemeTokenCssVar + getComputedStyle.
 * Missing or invalid tokens raise a controlled error so the host can fall
 * back to the static DOM garden scene.
 */

import {
  getThemeTokenCssVar,
  type CssTokenName,
} from "@razzoozle/common/theme-tokens"

export const THEME_TOKEN_COLOR_ERROR = "THEME_TOKEN_COLOR" as const

export class ThemeTokenColorError extends Error {
  readonly code = THEME_TOKEN_COLOR_ERROR
  readonly token: CssTokenName

  constructor(token: CssTokenName, detail: string) {
    super(`Theme token color unresolved for ${token}: ${detail}`)
    this.name = "ThemeTokenColorError"
    this.token = token
  }
}

export type ThemeColorResolver = (token: CssTokenName) => number

export interface ResolveThemeColorOptions {
  /** Defaults to document.documentElement when available. */
  element?: Element
  /** Defaults to global getComputedStyle when available. */
  getComputedStyleFn?: (elt: Element) => { getPropertyValue: (prop: string) => string }
}

function parseCssColorToRgb(raw: string): { r: number; g: number; b: number } | null {
  const value = raw.trim().toLowerCase()
  if (!value) return null

  if (value.startsWith("#")) {
    let hex = value.slice(1)
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("")
    }
    if (hex.length === 8) hex = hex.slice(0, 6)
    if (!/^[0-9a-f]{6}$/.test(hex)) return null
    const num = Number.parseInt(hex, 16)
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    }
  }

  const rgbMatch = value.match(
    /^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)/,
  )
  if (rgbMatch) {
    const r = Number(rgbMatch[1])
    const g = Number(rgbMatch[2])
    const b = Number(rgbMatch[3])
    if (![r, g, b].every((n) => Number.isFinite(n))) return null
    return {
      r: Math.round(Math.min(255, Math.max(0, r))),
      g: Math.round(Math.min(255, Math.max(0, g))),
      b: Math.round(Math.min(255, Math.max(0, b))),
    }
  }

  return null
}

export function cssColorToPixiNumber(raw: string): number | null {
  const rgb = parseCssColorToRgb(raw)
  if (!rgb) return null
  return (rgb.r << 16) | (rgb.g << 8) | rgb.b
}

/**
 * Resolve one design token to a Pixi-compatible 0xRRGGBB integer.
 * Never invents a production fallback color.
 */
export function resolveThemeTokenColor(
  token: CssTokenName,
  options: ResolveThemeColorOptions = {},
): number {
  // Touch the type-safe accessor so tokens stay on the project theme surface.
  const cssVarExpr = getThemeTokenCssVar(token)
  const property = cssVarExpr.slice(4, -1) // "var(--x)" → "--x"

  const getStyle =
    options.getComputedStyleFn ??
    (typeof globalThis.getComputedStyle === "function"
      ? globalThis.getComputedStyle.bind(globalThis)
      : null)

  if (!getStyle) {
    throw new ThemeTokenColorError(token, "getComputedStyle unavailable")
  }

  const element =
    options.element ??
    (typeof document !== "undefined" ? document.documentElement : null)

  if (!element) {
    throw new ThemeTokenColorError(token, "no element to read CSS variables from")
  }

  const raw = getStyle(element).getPropertyValue(property).trim()
  if (!raw) {
    throw new ThemeTokenColorError(token, "empty computed value")
  }

  const pixi = cssColorToPixiNumber(raw)
  if (pixi === null) {
    throw new ThemeTokenColorError(token, `invalid color "${raw}"`)
  }
  return pixi
}
