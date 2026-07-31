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
  getComputedStyleFn?: (elt: Element) => {
    getPropertyValue: (prop: string) => string
  }
}

/** Clamp a 0–255 channel after rounding. */
function clampByte(n: number): number {
  return Math.round(Math.min(255, Math.max(0, n)))
}

const CSS_NUMBER_PATTERN = /^[+-]?(?:[0-9]*\.[0-9]+|[0-9]+)(?:e[+-]?[0-9]+)?$/i

/**
 * CSS Color 4 `color(srgb …)` channel: unitless number in 0–1, or percentage.
 * Out-of-range values are clamped (browser-serialised mixes can slightly overflow).
 */
function parseSrgbChannel(raw: string): number | null {
  const token = raw.trim()
  if (!token) return null
  const isPercentage = token.endsWith("%")
  const numberToken = isPercentage ? token.slice(0, -1) : token
  if (!CSS_NUMBER_PATTERN.test(numberToken)) return null

  const value = Number(numberToken)
  if (!Number.isFinite(value)) return null
  return clampByte((isPercentage ? value / 100 : value) * 255)
}

function parseCssColorToRgb(
  raw: string,
): { r: number; g: number; b: number } | null {
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

  const rgbMatch =
    /^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)/.exec(value)
  if (rgbMatch) {
    const r = Number(rgbMatch[1])
    const g = Number(rgbMatch[2])
    const b = Number(rgbMatch[3])
    if (![r, g, b].every((n) => Number.isFinite(n))) return null
    return {
      r: clampByte(r),
      g: clampByte(g),
      b: clampByte(b),
    }
  }

  // Chromium serialises resolved color-mix() as color(srgb R G B [/ A]).
  // Only srgb is accepted — other color spaces stay invalid (no silent convert).
  const srgbMatch =
    /^color\(\s*srgb\s+([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)(?:\s*\/\s*[^)]+)?\s*\)$/.exec(
      value,
    )
  if (srgbMatch) {
    const r = parseSrgbChannel(srgbMatch[1]!)
    const g = parseSrgbChannel(srgbMatch[2]!)
    const b = parseSrgbChannel(srgbMatch[3]!)
    if (r === null || g === null || b === null) return null
    return { r, g, b }
  }

  return null
}

/**
 * Force used-value resolution for var()/color-mix() custom properties.
 * Mounts a temporary probe under documentElement, reads computed `color`,
 * and always removes the probe (no DOM leak).
 */
function normalizeCssColorViaBrowser(
  cssValue: string,
  element: Element,
  getStyle: (elt: Element) => { getPropertyValue: (prop: string) => string },
): string | null {
  const doc =
    element.ownerDocument ?? (typeof document !== "undefined" ? document : null)
  if (!doc || typeof doc.createElement !== "function") return null

  const probe = doc.createElement("span")
  const styled = probe as HTMLElement
  if (!styled.style || typeof styled.style.setProperty !== "function") {
    return null
  }
  styled.style.setProperty("color", cssValue)
  if (!styled.style.color) return null
  if (typeof probe.setAttribute === "function") {
    probe.setAttribute("data-theme-color-probe", "")
  }

  const mount =
    typeof element.appendChild === "function"
      ? element
      : (doc.documentElement ??
        (typeof document !== "undefined" ? document.documentElement : null))
  if (mount && typeof mount.appendChild === "function") {
    mount.appendChild(probe)
  }

  try {
    const used = getStyle(probe).getPropertyValue("color").trim()
    return used || null
  } finally {
    if (typeof probe.remove === "function") {
      probe.remove()
    } else if (
      probe.parentNode &&
      typeof probe.parentNode.removeChild === "function"
    ) {
      probe.parentNode.removeChild(probe)
    }
  }
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
    throw new ThemeTokenColorError(
      token,
      "no element to read CSS variables from",
    )
  }

  const raw = getStyle(element).getPropertyValue(property).trim()
  if (!raw) {
    throw new ThemeTokenColorError(token, "empty computed value")
  }

  let pixi = cssColorToPixiNumber(raw)
  if (pixi === null) {
    // Validate the computed token text directly before accepting its used value.
    // Reconstructing var(--token) can turn invalid token text into inherited black.
    const normalised = normalizeCssColorViaBrowser(raw, element, getStyle)
    if (normalised) {
      pixi = cssColorToPixiNumber(normalised)
    }
  }
  if (pixi === null) {
    throw new ThemeTokenColorError(token, `invalid color "${raw}"`)
  }
  return pixi
}
