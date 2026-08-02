/**
 * Node-env tests for the DOM-level §16.2 layout diagnostics collector.
 * jsdom/happy-dom are not installed in this repo — the collector is exercised
 * against structural fakes (same pattern as the attach lifecycle tests).
 */

import { describe, expect, it } from "vitest"

import {
  collectGardenExperienceLayoutDiagnostics,
  type GardenExperienceLayoutDiagnostics,
} from "../experienceLayoutDiagnostics"

interface FakeRect {
  x: number
  y: number
  width: number
  height: number
}

const rect = (x: number, y: number, width: number, height: number): FakeRect => ({
  x,
  y,
  width,
  height,
})

interface FakeElement {
  tagName: string
  rectValue: FakeRect
  display: string
  visibility: string
  scrollHeight: number
  ownerDocument: FakeDocument | null
  parent: FakeElement | null
  childrenRef: FakeElement[]
  getAttribute(name: string): string | null
  getBoundingClientRect(): FakeRect
  appendChild(child: FakeElement): void
  matches(selector: string): boolean
  closest(selector: string): FakeElement | null
  querySelector(selector: string): FakeElement | null
}

interface FakeDocument {
  documentElement: FakeElement
  defaultView: FakeWindow | null
  register(el: FakeElement): void
  registerTree(el: FakeElement): void
  querySelector(selector: string): FakeElement | null
}

interface FakeWindow {
  innerWidth: number
  innerHeight: number
  getComputedStyle(el: FakeElement): {
    display: string
    visibility: string
    getPropertyValue(name: string): string
  }
}

function createFakeElement(
  options: {
    attrs?: Record<string, string>
    classes?: string[]
    rect?: FakeRect
  } = {},
): FakeElement {
  const attrs = new Map(Object.entries(options.attrs ?? {}))
  const classes = options.classes ?? []
  const children: FakeElement[] = []

  const el: FakeElement = {
    tagName: "DIV",
    rectValue: options.rect ?? rect(0, 0, 0, 0),
    display: "block",
    visibility: "visible",
    scrollHeight: 0,
    ownerDocument: null,
    parent: null,
    childrenRef: children,
    getAttribute: (name) => attrs.get(name) ?? null,
    getBoundingClientRect: () => el.rectValue,
    appendChild: (child) => {
      child.parent = el
      child.ownerDocument = el.ownerDocument
      children.push(child)
    },
    matches: (selector) => {
      const attrMatch = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector)
      if (attrMatch) {
        const [, name, value] = attrMatch
        const attrName = `data-${name}`
        if (value === undefined) return attrs.has(attrName)
        return attrs.get(attrName) === value
      }
      const classMatch = /^\.([a-z-]+)$/.exec(selector)
      if (classMatch) {
        return classes.includes(classMatch[1]!)
      }
      return false
    },
    closest: (selector) => {
      let node: FakeElement | null = el
      while (node) {
        if (node.matches(selector)) return node
        node = node.parent
      }
      return null
    },
    querySelector: (selector) => {
      for (const child of children) {
        if (child.matches(selector)) return child
        const deep = child.querySelector(selector)
        if (deep) return deep
      }
      return null
    },
  }
  return el
}

function createFakeDocument(): FakeDocument {
  const roots: FakeElement[] = []
  const doc: FakeDocument = {
    documentElement: createFakeElement(),
    defaultView: null,
    register: (el) => {
      el.ownerDocument = doc
      roots.push(el)
    },
    registerTree: (el) => {
      doc.register(el)
      const walk = (node: FakeElement): void => {
        for (const child of node.childrenRef) {
          child.ownerDocument = doc
          walk(child)
        }
      }
      walk(el)
    },
    querySelector: (selector) => {
      for (const rootEl of roots) {
        if (rootEl.matches(selector)) return rootEl
        const deep = rootEl.querySelector(selector)
        if (deep) return deep
      }
      return null
    },
  }
  return doc
}

function createFakeWindow(): FakeWindow {
  return {
    innerWidth: 1600,
    innerHeight: 900,
    getComputedStyle: (el) => ({
      display: el.display,
      visibility: el.visibility,
      getPropertyValue: (name: string) => {
        const insets: Record<string, string> = {
          "--experience-safe-top": "76px",
          "--experience-safe-right": "12px",
          "--experience-safe-bottom": "120px",
          "--experience-safe-left": "12px",
        }
        return insets[name] ?? ""
      },
    }),
  }
}

function buildImmersiveDom(options: { withCreamField: boolean }) {
  const doc = createFakeDocument()
  const win = createFakeWindow()
  doc.defaultView = win
  doc.documentElement.scrollHeight = 900

  const display = createFakeElement({
    attrs: {
      "data-testid": "flower-battle-display",
      "data-presenter-layout": "experience-immersive",
    },
    rect: rect(0, 0, 1600, 900),
  })
  const canvas = createFakeElement({ rect: rect(0, 0, 1600, 900) })
  const answerCounter = createFakeElement({
    attrs: { "data-testid": "hud-answer-counter" },
    rect: rect(1440, 800, 148, 80),
  })
  display.appendChild(canvas)
  display.appendChild(answerCounter)
  doc.registerTree(display)

  if (options.withCreamField) {
    const cream = createFakeElement({
      classes: ["cream-field"],
      rect: rect(0, 0, 1600, 900),
    })
    doc.register(cream)
  }

  return { doc, win, canvas }
}

const asCanvas = (el: FakeElement): HTMLCanvasElement =>
  el as unknown as HTMLCanvasElement

describe("collectGardenExperienceLayoutDiagnostics", () => {
  it("reports the immersive happy path (no cream field, no overflow)", () => {
    const { canvas } = buildImmersiveDom({ withCreamField: false })
    const diag: GardenExperienceLayoutDiagnostics =
      collectGardenExperienceLayoutDiagnostics(asCanvas(canvas))

    expect(diag.presenterLayout).toBe("experience-immersive")
    expect(diag.viewport).toEqual({ width: 1600, height: 900 })
    expect(diag.canvasRect).toEqual({ x: 0, y: 0, width: 1600, height: 900 })
    expect(diag.experienceRootRect).toEqual({
      x: 0,
      y: 0,
      width: 1600,
      height: 900,
    })
    expect(diag.canvasCoversExperienceRoot).toBe(true)
    expect(diag.safeInsets).toEqual({
      top: 76,
      right: 12,
      bottom: 120,
      left: 12,
    })
    // FB-HUD4: no global team-meters rect. The first per-plant card-wrap
    // is the new probe target.
    expect(diag.hudRects.teamMeters).toBeUndefined()
    expect(diag.hudRects.answerCounter).toEqual({
      x: 1440,
      y: 800,
      width: 148,
      height: 80,
    })
    expect(diag.genericBackgroundVisible).toBe(false)
    expect(diag.verticalOverflow).toBe(0)
  })

  it("flags a visible generic cream background (normal mode regression)", () => {
    const { canvas } = buildImmersiveDom({ withCreamField: true })
    const diag = collectGardenExperienceLayoutDiagnostics(asCanvas(canvas))
    expect(diag.genericBackgroundVisible).toBe(true)
  })

  it("flags vertical overflow when the document scrolls", () => {
    const { doc, canvas } = buildImmersiveDom({ withCreamField: false })
    doc.documentElement.scrollHeight = 1200
    const diag = collectGardenExperienceLayoutDiagnostics(asCanvas(canvas))
    expect(diag.verticalOverflow).toBe(300)
  })

  it("reports canvas not covering the root when it is smaller", () => {
    const { canvas } = buildImmersiveDom({ withCreamField: false })
    // Shrink the fake canvas rect — the collector must flag the gap.
    canvas.rectValue = rect(0, 0, 800, 450)
    const diag = collectGardenExperienceLayoutDiagnostics(asCanvas(canvas))
    expect(diag.canvasCoversExperienceRoot).toBe(false)
  })

  it("degrades to unknown layout without a presenter-layout ancestor", () => {
    const doc = createFakeDocument()
    doc.defaultView = createFakeWindow()
    const canvas = createFakeElement({ rect: rect(0, 0, 100, 100) })
    doc.register(canvas)
    const diag = collectGardenExperienceLayoutDiagnostics(asCanvas(canvas))
    expect(diag.presenterLayout).toBe("unknown")
    expect(diag.experienceRootRect).toBeNull()
    expect(diag.canvasCoversExperienceRoot).toBe(false)
    expect(diag.hudRects).toEqual({})
  })
})
