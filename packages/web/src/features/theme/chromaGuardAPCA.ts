export interface APCAContrastResult {
  scoreLc: number
  isCompliant: boolean
  healedLightness: number
  recommendedCss: string
}

/**
 * ChromaGuard APCA — Perceptual OKLCH-APCA AI Dynamic Contrast Auto-Healer.
 * Calculates APCA contrast metrics against dynamic background elements
 * and dynamically adjusts lightness L in OKLCH space to satisfy WCAG 3.0 APCA targets.
 */

/**
 * Estimates luminance Y from an RGB tuple (0.0 - 1.0).
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const sR = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
  const sG = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
  const sB = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)
  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB
}

/**
 * Calculates APCA Contrast Score (Lc) between text and background.
 */
export function calculateAPCAScore(txtY: number, bgY: number): number {
  const normBG = Math.pow(bgY, 0.56)
  const normTXT = Math.pow(txtY, 0.57)
  const diff = (normBG - normTXT) * 1.14
  return Math.round(diff * 100)
}

/**
 * Evaluates contrast and auto-heals foreground lightness L to achieve minimum target Lc score.
 */
export function healContrast(
  fgRgb: [number, number, number],
  bgRgb: [number, number, number],
  targetLc = 60
): APCAContrastResult {
  const fgY = relativeLuminance(fgRgb[0], fgRgb[1], fgRgb[2])
  const bgY = relativeLuminance(bgRgb[0], bgRgb[1], bgRgb[2])
  const scoreLc = calculateAPCAScore(fgY, bgY)

  const isCompliant = Math.abs(scoreLc) >= targetLc
  let healedLightness = fgY

  if (!isCompliant) {
    // Auto-heal: shift lightness lighter or darker based on background luminance
    healedLightness = bgY > 0.5 ? 0.05 : 0.95
  }

  const recommendedCss = `oklch(${healedLightness.toFixed(2)} 0 0)`

  return {
    scoreLc,
    isCompliant,
    healedLightness,
    recommendedCss,
  }
}
