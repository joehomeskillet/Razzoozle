import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import type { ExperienceTimelineInput } from "./types"
import { useExperienceTimeline } from "./useExperienceTimeline"

const monoNowMock = vi.fn<() => number>()
const offsetMsRef = { current: 0 }

vi.mock("@razzoozle/web/features/game/utils/monoNow", () => ({
  monoNow: () => monoNowMock(),
}))

vi.mock("@razzoozle/web/features/game/stores/lowLatency", () => ({
  useLowLatencyStore: (
    selector: (state: { offsetMs: number }) => unknown,
  ) => selector({ offsetMs: offsetMsRef.current }),
}))

type Harness = {
  result: ReturnType<typeof useExperienceTimeline>
  rerender: (input: ExperienceTimelineInput | null) => void
  unmount: () => void
}

type DomElement = {
  nodeType: number
  nodeName: string
  tagName: string
  parentNode: DomElement | null
  ownerDocument: DomDocument
  children: unknown[]
  appendChild: (child: unknown) => unknown
  removeChild: (child: unknown) => unknown
  addEventListener: (event: string, listener: () => void) => void
  removeEventListener: (event: string, listener: () => void) => void
  remove: () => void
}

type DomDocument = {
  visibilityState: string
  activeElement: DomElement | null
  body: DomElement
  defaultView: DomWindow
  createElement: (tag: string) => DomElement
  addEventListener: (event: string, listener: () => void) => void
  removeEventListener: (event: string, listener: () => void) => void
}

type DomWindow = {
  document: DomDocument
  HTMLIFrameElement: new () => object
  addEventListener: (event: string, listener: () => void) => void
  removeEventListener: (event: string, listener: () => void) => void
}

let domDocument: DomDocument
let visibilityListeners: Array<() => void>

function createDomDocument(): DomDocument {
  const eventListeners = new Map<string, Set<() => void>>()
  const win: DomWindow = {
    document: null as unknown as DomDocument,
    HTMLIFrameElement: class HTMLIFrameElement { readonly tagName = "IFRAME" },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const doc: DomDocument = {
    visibilityState: "visible",
    activeElement: null,
    body: null as unknown as DomElement,
    defaultView: win,
    createElement: (tag: string) => createDomElement(tag, doc),
    addEventListener(event: string, listener: () => void) {
      if (event === "visibilitychange") {
        visibilityListeners.push(listener)
      }
      const listeners = eventListeners.get(event) ?? new Set<() => void>()
      listeners.add(listener)
      eventListeners.set(event, listeners)
    },
    removeEventListener(event: string, listener: () => void) {
      if (event === "visibilitychange") {
        visibilityListeners = visibilityListeners.filter(
          (entry) => entry !== listener,
        )
      }
      eventListeners.get(event)?.delete(listener)
    },
  }
  win.document = doc
  doc.body = createDomElement("body", doc)
  return doc
}

function createDomElement(tag: string, ownerDocument: DomDocument): DomElement {
  const children: unknown[] = []
  const eventListeners = new Map<string, Set<() => void>>()
  const element: DomElement = {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    tagName: tag.toUpperCase(),
    parentNode: null,
    ownerDocument,
    children,
    appendChild(child: unknown) {
      if (
        child &&
        typeof child === "object" &&
        "parentNode" in child &&
        typeof child.parentNode !== "undefined"
      ) {
        ;(child as DomElement).parentNode = element
      }
      children.push(child)
      return child
    },
    removeChild(child: unknown) {
      const index = children.indexOf(child)
      if (index >= 0) {
        children.splice(index, 1)
      }
      return child
    },
    addEventListener(event: string, listener: () => void) {
      const listeners = eventListeners.get(event) ?? new Set<() => void>()
      listeners.add(listener)
      eventListeners.set(event, listeners)
    },
    removeEventListener(event: string, listener: () => void) {
      eventListeners.get(event)?.delete(listener)
    },
    remove() {
      const parent = element.parentNode as DomElement | null
      parent?.removeChild(element)
    },
  }
  return element
}

function mountHarness(initialInput: ExperienceTimelineInput | null): Harness {
  const container = domDocument.createElement("div")
  domDocument.body.appendChild(container)
  const root: Root = createRoot(container as unknown as HTMLElement)
  const inputRef = { current: initialInput }
  const captureRef: { current: ReturnType<typeof useExperienceTimeline> } = {
    current: null,
  }

  function Probe() {
    captureRef.current = useExperienceTimeline(inputRef.current)
    return null
  }

  act(() => {
    root.render(createElement(Probe))
  })

  return {
    get result() {
      return captureRef.current
    },
    rerender(input: ExperienceTimelineInput | null) {
      inputRef.current = input
      act(() => {
        root.render(createElement(Probe))
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

const PHASE_START_MS = 1_800_000_000_000

describe("useExperienceTimeline", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    visibilityListeners = []
    offsetMsRef.current = 0
    monoNowMock.mockReturnValue(PHASE_START_MS + 2_000)
    domDocument = createDomDocument()
    vi.stubGlobal("document", domDocument)
    vi.stubGlobal("window", domDocument.defaultView)
    vi.stubGlobal("HTMLElement", class HTMLElement { readonly tagName = "HTMLElement" })
    vi.stubGlobal("HTMLDivElement", class HTMLDivElement { readonly tagName = "DIV" })
    vi.stubGlobal("Node", class Node { readonly nodeType = 1 })
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)

    vi.stubGlobal("performance", {
      now: () => monoNowMock(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it.each([
    {
      name: "fresh phase snapshot",
      input: {
        revision: 1,
        phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
        phaseDurationMs: 10_000,
      },
      expected: {
        elapsedMs: 2_000,
        remainingMs: 8_000,
        normalizedProgress: 0.2,
        hasFinished: false,
        shouldSkipIntro: true,
      },
    },
    {
      name: "expired phase snapshot",
      input: {
        revision: 2,
        phaseStartedAt: new Date(PHASE_START_MS - 5_000).toISOString(),
        phaseDurationMs: 4_000,
      },
      expected: {
        elapsedMs: 7_000,
        remainingMs: 0,
        normalizedProgress: 1,
        hasFinished: true,
        shouldSkipIntro: true,
      },
    },
    {
      name: "null duration snapshot",
      input: {
        revision: 3,
        phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
        phaseDurationMs: null,
      },
      expected: {
        elapsedMs: 2_000,
        remainingMs: null,
        normalizedProgress: null,
        hasFinished: false,
        shouldSkipIntro: true,
      },
    },
  ])("$name", ({ input, expected }) => {
    const harness = mountHarness(input)
    expect(harness.result).toEqual(expected)
    harness.unmount()
  })

  it("ticks every 250ms using monoNow + clock offset", () => {
    offsetMsRef.current = 500
    monoNowMock.mockReturnValue(PHASE_START_MS)

    const harness = mountHarness({
      revision: 4,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 10_000,
    })

    expect(harness.result).toEqual({
      elapsedMs: 500,
      remainingMs: 9_500,
      normalizedProgress: 0.05,
      hasFinished: false,
      shouldSkipIntro: false,
    })

    monoNowMock.mockReturnValue(PHASE_START_MS + 1_000)
    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(harness.result).toEqual({
      elapsedMs: 1_500,
      remainingMs: 8_500,
      normalizedProgress: 0.15,
      hasFinished: false,
      shouldSkipIntro: true,
    })

    harness.unmount()
  })

  it("discards snapshots with stale revision", () => {
    const harness = mountHarness({
      revision: 10,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 10_000,
    })

    const accepted = harness.result
    expect(accepted?.elapsedMs).toBe(2_000)

    harness.rerender({
      revision: 9,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 10_000,
    })

    expect(harness.result).toEqual(accepted)

    harness.rerender({
      revision: 11,
      phaseStartedAt: new Date(PHASE_START_MS + 1_000).toISOString(),
      phaseDurationMs: 10_000,
    })

    expect(harness.result).toEqual({
      elapsedMs: 1_000,
      remainingMs: 9_000,
      normalizedProgress: 0.1,
      hasFinished: false,
      shouldSkipIntro: true,
    })

    harness.unmount()
  })

  it("resyncs immediately when tab becomes visible", () => {
    monoNowMock.mockReturnValue(PHASE_START_MS + 500)
    const harness = mountHarness({
      revision: 5,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 10_000,
    })

    expect(harness.result?.elapsedMs).toBe(500)

    monoNowMock.mockReturnValue(PHASE_START_MS + 3_300)
    domDocument.visibilityState = "visible"

    act(() => {
      for (const listener of visibilityListeners) {
        listener()
      }
    })

    expect(harness.result).toEqual({
      elapsedMs: 3_300,
      remainingMs: 6_700,
      normalizedProgress: 0.33,
      hasFinished: false,
      shouldSkipIntro: true,
    })

    harness.unmount()
  })

  it("uses serverNow when provided instead of monoNow offset", () => {
    offsetMsRef.current = 9_999
    monoNowMock.mockReturnValue(PHASE_START_MS)

    const harness = mountHarness({
      revision: 6,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 8_000,
      serverNow: new Date(PHASE_START_MS + 1_600).toISOString(),
    })

    expect(harness.result).toEqual({
      elapsedMs: 1_600,
      remainingMs: 6_400,
      normalizedProgress: 0.2,
      hasFinished: false,
      shouldSkipIntro: true,
    })

    harness.unmount()
  })
})
