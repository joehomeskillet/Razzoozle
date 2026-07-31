/**
 * Theme-token → Pixi color resolution (WP-PIX-05A).
 * Palette colors MUST flow through getThemeTokenCssVar + getComputedStyle.
 * Missing or invalid tokens raise a controlled error so the host can fall
 * back to the static DOM garden scene.
 *
 * SDD #992: color-mix() theme resolution must never force the Pixi garden
 * into its DOM fallback. When the browser lacks CSS-Color-4 `color-mix()`
 * support, we extract the base `var(--token)` reference and resolve it
 * recursively so the host stays on the procedural Pixi path.
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
 * Recursion depth guard for the color-mix → base-token fallback. Two is enough
 * to flatten `color-mix(in srgb, var(--a), color-mix(in srgb, var(--b), ...))`
 * without risking infinite cycles on deliberately malformed input.
 */
const COLOR_MIX_FALLBACK_DEPTH = 2

let cachedColorMixSupport: boolean | null = null

/**
 * Feature-detect CSS Color 4 `color-mix()` support. Returns false in SSR /
 * jsdom / older browsers where `CSS.supports` is unavailable or the function
 * itself is unimplemented. Cached because `CSS.supports` is cheap but called
 * per token resolution.
 */
export function detectColorMixSupport(): boolean {
  if (cachedColorMixSupport !== null) return cachedColorMixSupport
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    cachedColorMixSupport = false
    return false
  }
  try {
    cachedColorMixSupport = CSS.supports(
      "color",
      "color-mix(in srgb, white, black)",
    )
  } catch {
    cachedColorMixSupport = false
  }
  return cachedColorMixSupport
}

/** Test helper: reset the cached feature-detect result between specs. */
export function _resetColorMixSupportCache(): void {
  cachedColorMixSupport = null
}

/**
 * Try to extract the first argument of a `color-mix(in <space>, A, B, …)`
 * expression. Returns null on malformed input; caller decides whether the
 * fragment is usable (e.g. `var(--token)`).
 */
function parseColorMixFirstArg(value: string): string | null {
  const head = /^color-mix\s*\(\s*in\s+[a-z0-9-]+\s*,/i.exec(value.trim())
  if (!head) return null
  const rest = value.slice(head[0].length)
  // Walk the rest, depth-tracking, until we hit the first comma at depth 1.
  let depth = 1
  for (let i = 0; i < rest.length; i += 1) {
    const ch = rest[i]
    if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1
    else if (ch === "," && depth === 1) {
      return rest.slice(0, i).trim()
    }
  }
  return null
}

/**
 * Map the first argument of a `color-mix(...)` expression to a CSS custom
 * property name when it is a `var(--token)` reference. Returns null when the
 * first arg is a literal color (hex, rgb, named) — those cannot be resolved
 * by re-entering the resolver, so the caller throws the controlled error.
 */
function extractColorMixBaseToken(value: string): string | null {
  const first = parseColorMixFirstArg(value)
  if (!first) return null
  const varMatch = /^var\(\s*(--[a-zA-Z0-9_-]+)\s*\)$/.exec(first)
  return varMatch ? varMatch[1]! : null
}

/**
 * Cheap shape check: does the trimmed value look like a CSS color literal
 * that should have parsed? Used to decide whether to log a warning before
 * throwing the controlled error.
 */
function looksLikeColorLiteral(value: string): boolean {
  const v = value.trim()
  return (
    v.startsWith("#") ||
    /^rgba?\(/i.test(v) ||
    /^color\(/i.test(v) ||
    /^color-mix\(/i.test(v)
  )
}

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
 * Internal entry point that lets the color-mix → base-token fallback recurse
 * with a bounded depth. Public callers go through `resolveThemeTokenColor`
 * (depth = 0).
 */
function resolveThemeTokenColorInternal(
  token: CssTokenName,
  options: ResolveThemeColorOptions,
  depth: number,
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
    // SDD #992: when the browser doesn't understand color-mix(), the computed
    // value leaks through as raw `color-mix(in srgb, var(--base), …)` text.
    // Recurse on the base var(--token) instead of forcing the DOM fallback.
    if (
      raw.includes("color-mix(") &&
      !detectColorMixSupport() &&
      depth < COLOR_MIX_FALLBACK_DEPTH
    ) {
      const baseToken = extractColorMixBaseToken(raw)
      if (baseToken) {
        return resolveThemeTokenColorInternal(
          baseToken as CssTokenName,
          options,
          depth + 1,
        )
      }
    }
    // Validate the computed token text directly before accepting its used value.
    // Reconstructing var(--token) can turn invalid token text into inherited black.
    const normalised = normalizeCssColorViaBrowser(raw, element, getStyle)
    if (normalised) {
      pixi = cssColorToPixiNumber(normalised)
    }
  }
  if (pixi === null) {
    if (looksLikeColorLiteral(raw)) {
      // SDD #992: malformed colour literal — log once so the theme author sees
      // the rejected value rather than chasing the silent controlled error.
      // eslint-disable-next-line no-console
      console.warn(
        `[resolveThemeTokenColor] rejected malformed value for ${token}: ${raw}`,
      )
    }
    throw new ThemeTokenColorError(token, `invalid color "${raw}"`)
  }
  return pixi
}

/**
 * Resolve one design token to a Pixi-compatible 0xRRGGBB integer.
 * Never invents a production fallback color.
 */
export function resolveThemeTokenColor(
  token: CssTokenName,
  options: ResolveThemeColorOptions = {},
): number {
  return resolveThemeTokenColorInternal(token, options, 0)
}