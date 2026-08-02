/**
 * DOM-level layout diagnostics for the immersive experience presenter
 * (WP immersive §16.2). Read-only, query-guarded, canvas/component-local:
 * the collector is only reachable through the `?gardenE2EProbe=1` probe on
 * the garden canvas and never installs globals or listeners.
 *
 * Happy-path contract for the immersive presenter:
 *   presenterLayout === "experience-immersive"
 *   genericBackgroundVisible === false
 *   verticalOverflow === 0
 *   canvasRect covers the experience root
 *   all HUD rects inside the experience root
 */

export interface DOMRectLike {
  x: number
  y: number
  width: number
  height: number
}

export interface GardenExperienceLayoutDiagnostics {
  presenterLayout: "normal" | "experience-immersive" | "unknown"
  viewport: { width: number; height: number }
  canvasRect: DOMRectLike
  experienceRootRect: DOMRectLike | null
  canvasCoversExperienceRoot: boolean
  safeInsets: { top: number; right: number; bottom: number; left: number }
  hudRects: Record<string, DOMRectLike>
  genericBackgroundVisible: boolean
  /** document scrollHeight minus innerHeight, clamped at 0. */
  verticalOverflow: number
}

const toRectLike = (r: DOMRect): DOMRectLike => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
})

const NULL_RECT: DOMRectLike = { x: 0, y: 0, width: 0, height: 0 }

/** Structural defence: minimal/headless hosts may lack getBoundingClientRect. */
const readRect = (el: Element): DOMRectLike => {
  if (typeof el.getBoundingClientRect !== "function") return { ...NULL_RECT }
  return toRectLike(el.getBoundingClientRect())
}

const covers = (
  inner: DOMRectLike,
  outer: DOMRectLike,
  tolerance = 1,
): boolean =>
  inner.x <= outer.x + tolerance &&
  inner.y <= outer.y + tolerance &&
  inner.x + inner.width >= outer.x + outer.width - tolerance &&
  inner.y + inner.height >= outer.y + outer.height - tolerance

const parsePx = (value: string): number => {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

const readSafeInset = (
  style: CSSStyleDeclaration,
  name: string,
): number => parsePx(style.getPropertyValue(name))

const HUD_PROBES: Record<string, string> = {
  toolbar: '[data-testid="presenter-toolbar"]',
  // FB-HUD4: per-team cards live under each plant in PlantTeamCard
  // (DOM `plant-team-card`). The global `flower-battle-team-meters`
  // selector is gone. We probe the per-plant card-wrap count to surface
  // layout regressions for the new structure.
  plantTeamCard: '[data-testid="garden-plant-team-card-wrap-0"]',
  answerCounter: '[data-testid="hud-answer-counter"]',
  statusBanner: '[data-testid="flower-battle-event-banner"]',
}

/**
 * Collect the DOM half of the §16.2 layout diagnostics, starting from the
 * garden canvas. Pure read — safe to call at any time, returns `unknown`
 * layout values defensively (missing nodes degrade to null/false instead of
 * throwing, so a probe never breaks the scene).
 */
export function collectGardenExperienceLayoutDiagnostics(
  canvas: HTMLCanvasElement,
): GardenExperienceLayoutDiagnostics {
  const doc = canvas.ownerDocument
  const win = doc?.defaultView ?? null
  const canvasRect = readRect(canvas)

  // Structural defence: exotic/headless hosts may lack closest/querySelector
  // — the probe must never break the scene it observes.
  const closest =
    typeof canvas.closest === "function"
      ? (selector: string): Element | null => canvas.closest(selector)
      : (): null => null
  const docQuery =
    doc && typeof doc.querySelector === "function"
      ? (selector: string): Element | null => doc.querySelector(selector)
      : (): null => null

  const layoutHost = closest("[data-presenter-layout]")
  const presenterLayoutAttr = layoutHost?.getAttribute("data-presenter-layout")
  const presenterLayout: GardenExperienceLayoutDiagnostics["presenterLayout"] =
    presenterLayoutAttr === "experience-immersive" ||
    presenterLayoutAttr === "normal"
      ? presenterLayoutAttr
      : "unknown"

  const experienceRoot =
    closest('[data-testid="flower-battle-display"]') ?? layoutHost
  const experienceRootRect = experienceRoot ? readRect(experienceRoot) : null

  const rootStyle =
    win && experienceRoot && typeof win.getComputedStyle === "function"
      ? win.getComputedStyle(experienceRoot)
      : null
  const safeInsets = rootStyle
    ? {
        top: readSafeInset(rootStyle, "--experience-safe-top"),
        right: readSafeInset(rootStyle, "--experience-safe-right"),
        bottom: readSafeInset(rootStyle, "--experience-safe-bottom"),
        left: readSafeInset(rootStyle, "--experience-safe-left"),
      }
    : { top: 0, right: 0, bottom: 0, left: 0 }

  const hudRects: Record<string, DOMRectLike> = {}
  for (const [key, selector] of Object.entries(HUD_PROBES)) {
    // Toolbar lives in the GameWrapper shell (outside the display root);
    // the rest is inside. Fall back to document scope when not found.
    const rootQuery =
      experienceRoot && typeof experienceRoot.querySelector === "function"
        ? experienceRoot.querySelector(selector)
        : null
    const el = rootQuery ?? docQuery(selector)
    if (el) {
      hudRects[key] = readRect(el)
    }
  }

  // The generic Razzoozle cream field is the app background the immersive
  // mode must hide. It is only "visible" when actually laid out.
  const creamField = docQuery(".cream-field")
  const genericBackgroundVisible = (() => {
    if (!creamField || !win || typeof win.getComputedStyle !== "function") {
      return false
    }
    const style = win.getComputedStyle(creamField)
    if (style.display === "none" || style.visibility === "hidden") return false
    const rect = readRect(creamField)
    return rect.width > 0 && rect.height > 0
  })()

  const scrolling = doc?.documentElement ?? null
  const verticalOverflow =
    win && scrolling
      ? Math.max(0, scrolling.scrollHeight - win.innerHeight)
      : 0

  return {
    presenterLayout,
    viewport: win
      ? { width: win.innerWidth, height: win.innerHeight }
      : { width: 0, height: 0 },
    canvasRect,
    experienceRootRect,
    canvasCoversExperienceRoot: experienceRootRect
      ? covers(canvasRect, experienceRootRect)
      : false,
    safeInsets,
    hudRects,
    genericBackgroundVisible,
    verticalOverflow,
  }
}
