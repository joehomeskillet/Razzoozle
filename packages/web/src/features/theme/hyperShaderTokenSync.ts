import { getThemeTokenCssVar, type CssTokenName } from "@razzoozle/common/theme-tokens"

export interface ShaderTokenColor {
  r: number
  g: number
  b: number
  a: number
  floatArray: Float32Array
}

/**
 * HyperShader Token Sync — GPU-Accelerated WebGL/Canvas Token Synchronizer.
 * Reads active CSS custom properties and converts them into Float32Array UBO buffers
 * and RGBA tuples for 60 FPS Canvas, WebGL, and dynamic confetti/particle rendering.
 */

function parseHexOrRgb(colorStr: string): { r: number; g: number; b: number; a: number } {
  const trimmed = colorStr.trim()
  if (trimmed.startsWith("#")) {
    let hex = trimmed.slice(1)
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("")
    }
    const num = parseInt(hex, 16)
    return {
      r: ((num >> 16) & 255) / 255,
      g: ((num >> 8) & 255) / 255,
      b: (num & 255) / 255,
      a: 1.0,
    }
  }
  return { r: 0.48, g: 0.22, b: 0.93, a: 1.0 } // fallback violet
}

/**
 * Retrieves a type-safe token color as a Float32Array suitable for WebGL UBO buffer subData.
 */
export function getTokenFloat32Buffer(token: CssTokenName): Float32Array {
  const varExpr = getThemeTokenCssVar(token)
  const rawVal =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue(varExpr.slice(4, -1)).trim()
      : "#7c3aed"

  const { r, g, b, a } = parseHexOrRgb(rawVal || "#7c3aed")
  return new Float32Array([r, g, b, a])
}

/**
 * Returns a Canvas 2D/Confetti compatible RGBA string for a design token.
 */
export function getTokenCanvasRgba(token: CssTokenName, alpha = 1.0): string {
  const buf = getTokenFloat32Buffer(token)
  const r = Math.round(buf[0] * 255)
  const g = Math.round(buf[1] * 255)
  const b = Math.round(buf[2] * 255)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
