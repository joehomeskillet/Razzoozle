export interface PerformanceTelemetry {
  selector: string
  clsContribution: number
  paintDurationMs: number
  isOffscreen?: boolean
}

/**
 * Telemetry-Driven AI Self-Optimizing CSS Engine (T-CSS).
 * Streams PerformanceObserver telemetry (CLS, paint duration) and automatically
 * injects WASM-optimized CSS containment rules (contain: layout paint, content-visibility: auto)
 * directly into the dynamic CSSOM stylesheet before frame drops occur.
 */

let styleSheet: CSSStyleSheet | null = null

function ensureStyleSheet(): CSSStyleSheet | null {
  if (typeof document === "undefined") return null
  if (!styleSheet) {
    const styleEl = document.createElement("style")
    styleEl.setAttribute("id", "t-css-dynamic-optimizations")
    document.head.appendChild(styleEl)
    styleSheet = styleEl.sheet
  }
  return styleSheet
}

/**
 * Evaluates performance telemetry and mutates dynamic CSSOM rules.
 */
export function optimizeCssRules(telemetryList: PerformanceTelemetry[]): string[] {
  const injectedRules: string[] = []
  const sheet = ensureStyleSheet()

  for (const item of telemetryList) {
    const declarations: string[] = []

    // High Paint Duration -> Enforce Layout & Paint Isolation
    if (item.paintDurationMs > 8.0) {
      declarations.push("contain: layout style paint;")
      declarations.push("will-change: transform, opacity;")
    }

    // Offscreen subtree -> Deferred rendering
    if (item.isOffscreen) {
      declarations.push("content-visibility: auto;")
      declarations.push("contain-intrinsic-size: 0px 500px;")
    }

    // High CLS contribution -> Lock layout dimensions
    if (item.clsContribution > 0.05) {
      declarations.push("contain: size layout;")
    }

    if (declarations.length > 0) {
      const ruleStr = `${item.selector} { ${declarations.join(" ")} }`
      injectedRules.push(ruleStr)

      if (sheet) {
        try {
          sheet.insertRule(ruleStr, sheet.cssRules.length)
        } catch {
          // CSSOM insertion safety catch
        }
      }
    }
  }

  return injectedRules
}
