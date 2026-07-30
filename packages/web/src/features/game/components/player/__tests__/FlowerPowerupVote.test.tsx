import { EVENTS } from "@razzoozle/common/constants"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { act, createElement, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  FlowerPowerupVote,
  FlowerPowerupVoteCards,
  type FlowerPowerupVoteCardsProps,
} from "../FlowerPowerupVote"
import { parsePowerupOptions, type PowerupOfferView } from "../flower-battle.types"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

const { emitMock, cardsElementRef } = vi.hoisted(() => ({
  emitMock: vi.fn(),
  // The Content mock stashes the <FlowerPowerupVoteCards …/> element so the
  // emit tests can drive the real component's onSelect/onSubmit handlers.
  cardsElementRef: {
    current: null as { props: FlowerPowerupVoteCardsProps } | null,
  },
}))

// The default socket-context value creates a real io() client on module
// import; stub useSocket with a shared emitMock so the suite never opens a
// real connection and the live emit path is assertable.
vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: emitMock } }),
}))

// Portal-free pass-through: Content captures its Cards child element instead
// of rendering it, so the whole mounted tree produces no DOM nodes (vitest
// env is node) while the handlers stay reachable via the element's props.
vi.mock("@radix-ui/react-alert-dialog", () => ({
  Root: ({ children }: { children?: ReactNode }) => children,
  Portal: ({ children }: { children?: ReactNode }) => children,
  Overlay: () => null,
  Content: ({ children }: { children?: ReactNode }) => {
    cardsElementRef.current = children as {
      props: FlowerPowerupVoteCardsProps
    }
    return null
  },
}))

const futureOffer = (offerType: string): PowerupOfferView => ({
  id: "offer-1",
  offerType,
  expiresAt: Date.now() + 10_000,
})

// FlowerPowerupVoteCards is the portal-free presentational half of
// FlowerPowerupVote (see the component's docstring): Radix's Portal only
// materialises its children once mounted via useLayoutEffect, which never
// fires during renderToStaticMarkup, so content living inside
// RadixAlertDialog.Portal is structurally unreachable from a static-markup
// test. Exercising Cards directly is how the actual vote markup gets real
// (non-attrappen) coverage.
const noop = () => {}
const renderCards = (
  options: ReturnType<typeof parsePowerupOptions>,
  overrides: Partial<Parameters<typeof FlowerPowerupVoteCards>[0]> = {},
) =>
  renderToStaticMarkup(
    <FlowerPowerupVoteCards
      options={options}
      selected={null}
      cardsDisabled={false}
      locked={false}
      statusMessage=""
      cooldownSec={10}
      totalSec={10}
      onSelect={noop}
      onSubmit={noop}
      {...overrides}
    />,
  )

describe("parsePowerupOptions (WP-FLB-16 wire parsing)", () => {
  it("parses exactly 3 options from a comma-joined offerType (hard literal)", () => {
    expect(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield")).toEqual([
      "fertilizer",
      "sunbeam",
      "umbrella_shield",
    ])
  })

  it("drops unknown/garbled ids and never returns more than 3", () => {
    expect(
      parsePowerupOptions("fertilizer, sunbeam ,bogus,umbrella_shield,acid_rain"),
    ).toEqual(["fertilizer", "sunbeam", "umbrella_shield"])
  })
})

describe("FlowerPowerupVoteCards (Player Client, WP-FLB-16)", () => {
  it("renders exactly 3 cards parsed from the comma-joined offerType wire field", () => {
    const html = renderCards(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield"))

    expect(html).toContain('data-testid="powerup-option-fertilizer"')
    expect(html).toContain('data-testid="powerup-option-sunbeam"')
    expect(html).toContain('data-testid="powerup-option-umbrella_shield"')
    expect(html).not.toContain('data-testid="powerup-option-acid_rain"')
    // Exactly 3 radio cards, never a 4th.
    expect(html.match(/role="radio"/g)?.length).toBe(3)
  })

  it("renders name and effect copy keys for all 4 possible power-up options", () => {
    const comboA = renderCards(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield"))
    const comboB = renderCards(parsePowerupOptions("sunbeam,umbrella_shield,acid_rain"))
    const combined = comboA + comboB

    for (const id of ["fertilizer", "sunbeam", "umbrella_shield", "acid_rain"]) {
      expect(combined).toContain(`flowerBattle.powerupVote.options.${id}.name`)
      expect(combined).toContain(`flowerBattle.powerupVote.options.${id}.effect`)
    }
  })

  it("renders locked/disabled cards once the offer has expired", () => {
    const html = renderCards(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield"), {
      cardsDisabled: true,
      locked: true,
      cooldownSec: 0,
    })

    // All 3 option cards (not the submit button) carry the native `disabled`
    // attribute on their own opening tag — no late tap possible.
    const cardTags = html.match(/<button[^>]*data-testid="powerup-option-[^"]+"[^>]*>/g)
    expect(cardTags?.length).toBe(3)
    for (const tag of cardTags ?? []) {
      expect(tag).toContain("disabled")
    }
  })

  it("marks the selected card via aria-checked and exposes the required aria attributes", () => {
    const html = renderCards(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield"), {
      selected: "sunbeam",
    })

    expect(html).toContain('role="radiogroup"')
    expect(html.match(/role="radio"/g)?.length).toBe(3)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')

    const sunbeamCard = html.slice(html.indexOf('data-testid="powerup-option-sunbeam"') - 200)
    expect(sunbeamCard.slice(0, 260)).toContain('aria-checked="true"')
  })
})

describe("FlowerPowerupVote (Player Client, WP-FLB-16) — mode/offer gating", () => {
  it("renders nothing outside FlowerBattle mode, even with an active offer", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupVote
        mode="classic"
        offer={futureOffer("fertilizer,sunbeam,umbrella_shield")}
      />,
    )

    expect(html).toBe("")
  })

  it("renders nothing in FlowerBattle mode when there is no active offer", () => {
    const html = renderToStaticMarkup(<FlowerPowerupVote mode="flowerBattle" offer={null} />)

    expect(html).toBe("")
  })
})

// --- Minimal DOM shim for createRoot in the node env (same proven pattern as
// features/experience/timeline/useExperienceTimeline.test.ts) ----------------

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
      const listeners = eventListeners.get(event) ?? new Set<() => void>()
      listeners.add(listener)
      eventListeners.set(event, listeners)
    },
    removeEventListener(event: string, listener: () => void) {
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

describe("FlowerPowerupVote (Player Client) — live vote emit", () => {
  const getItemMock = vi.fn<(_key: string) => string | null>()
  let domDocument: DomDocument

  const mountVote = () => {
    const container = domDocument.createElement("div")
    domDocument.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    act(() => {
      root.render(
        createElement(FlowerPowerupVote, {
          mode: "flowerBattle",
          offer: futureOffer("fertilizer,sunbeam,umbrella_shield"),
        }),
      )
    })
    return {
      cards: (): FlowerPowerupVoteCardsProps => {
        const element = cardsElementRef.current
        if (!element) throw new Error("Cards element was not captured")
        return element.props
      },
      unmount: () => {
        act(() => {
          root.unmount()
        })
        container.remove()
      },
    }
  }

  beforeEach(() => {
    domDocument = createDomDocument()
    vi.stubGlobal("document", domDocument)
    vi.stubGlobal("window", domDocument.defaultView)
    vi.stubGlobal("HTMLElement", class HTMLElement { readonly tagName = "HTMLElement" })
    vi.stubGlobal("HTMLDivElement", class HTMLDivElement { readonly tagName = "DIV" })
    vi.stubGlobal("Node", class Node { readonly nodeType = 1 })
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    getItemMock.mockReturnValue("tok-abc")
    vi.stubGlobal("localStorage", { getItem: getItemMock })
    usePlayerStore.getState().reset()
    usePlayerStore.setState({ gameId: "game-1" })
    cardsElementRef.current = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("emits exactly one SUBMIT_POWERUP_VOTE with { gameId, optionIndex, playerToken }", () => {
    const mounted = mountVote()

    act(() => mounted.cards().onSelect("sunbeam"))
    act(() => mounted.cards().onSubmit())
    // Exactly-once: a second submit for the same offer is a guarded no-op.
    act(() => mounted.cards().onSubmit())

    expect(emitMock).toHaveBeenCalledTimes(1)
    expect(emitMock).toHaveBeenCalledWith(EVENTS.FLOWER_BATTLE.SUBMIT_POWERUP_VOTE, {
      gameId: "game-1",
      optionIndex: 1,
      playerToken: "tok-abc",
    })
    expect(mounted.cards().locked).toBe(true)
    mounted.unmount()
  })

  it("emits nothing without a stored playerToken (SEC-01) and stays unlocked", () => {
    getItemMock.mockReturnValue(null)
    const mounted = mountVote()

    act(() => mounted.cards().onSelect("sunbeam"))
    act(() => mounted.cards().onSubmit())

    expect(emitMock).not.toHaveBeenCalled()
    expect(mounted.cards().locked).toBe(false)
    mounted.unmount()
  })
})
