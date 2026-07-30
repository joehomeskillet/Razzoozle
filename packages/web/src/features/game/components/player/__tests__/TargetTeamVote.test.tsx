import { EVENTS } from "@razzoozle/common/constants"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TargetTeamVote, TargetTeamChips } from "../TargetTeamVote"
import {
  useTargetTeamVote,
  type UseTargetTeamVoteResult,
} from "../hooks/useTargetTeamVote"
import { filterVoteCandidates, type FlowerTeamView, type TargetVoteSelection } from "../flower-battle.types"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }))

// The default socket-context value creates a real io() client on module
// import; stub useSocket with a shared emitMock so the suite never opens a
// real connection and the live emit path is assertable.
vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: emitMock } }),
}))

const team = (
  name: string,
  overrides: Partial<FlowerTeamView> = {},
): FlowerTeamView => ({
  name,
  effects: [],
  previousAttackerTeamId: null,
  ...overrides,
})

const activeSelection = (): TargetVoteSelection => ({
  offerId: "offer-1",
  optionId: "acid_rain",
  selectedAtServerMs: Date.now() + 10_000, // future anchor -> fresh 5s window
})

// TargetTeamChips is the portal-free presentational half of TargetTeamVote
// (see the component's docstring): Radix's Portal only materialises its
// children once mounted via useLayoutEffect, which never fires during
// renderToStaticMarkup, so content living inside RadixAlertDialog.Portal is
// structurally unreachable from a static-markup test. Exercising Chips
// directly is how the actual vote markup gets real (non-attrappen) coverage.
const noop = () => {}
const renderChips = (
  candidates: FlowerTeamView[],
  overrides: Partial<Parameters<typeof TargetTeamChips>[0]> = {},
) =>
  renderToStaticMarkup(
    <TargetTeamChips
      candidates={candidates}
      selectedTeam={null}
      statusMessage=""
      cooldownSec={5}
      totalSec={5}
      isTeamShielded={() => false}
      isTeamAntiRepeat={() => false}
      isTeamDisabled={() => false}
      onSelect={noop}
      onSubmit={noop}
      {...overrides}
    />,
  )

describe("filterVoteCandidates (WP-FLB-17 wire filtering)", () => {
  it("excludes the voter's own team from the candidate list (hard literal)", () => {
    const teams = [team("red"), team("blue"), team("green"), team("yellow")]

    const result = filterVoteCandidates(teams, "blue")

    expect(result.map((t) => t.name)).toEqual(["red", "green", "yellow"])
  })

  it("never returns the own team even if it appears multiple times", () => {
    const teams = [team("red"), team("blue"), team("red")]

    const result = filterVoteCandidates(teams, "red")

    expect(result.map((t) => t.name)).toEqual(["blue"])
  })
})

describe("TargetTeamChips (Player Client, WP-FLB-17)", () => {
  it("renders chips only for the pre-filtered candidate teams (own team excluded upstream)", () => {
    const candidates = filterVoteCandidates(
      [team("red"), team("blue"), team("green"), team("yellow")],
      "blue",
    )
    const html = renderChips(candidates)

    expect(html).toContain('data-testid="target-team-red"')
    expect(html).toContain('data-testid="target-team-green"')
    expect(html).toContain('data-testid="target-team-yellow"')
    expect(html).not.toContain('data-testid="target-team-blue"')
    expect(html.match(/role="radio"/g)?.length).toBe(3)
  })

  it("marks a shielded team visibly but keeps it selectable (not disabled)", () => {
    const candidates = [team("red"), team("green")]
    const html = renderChips(candidates, {
      isTeamShielded: (t) => t.name === "green",
      isTeamDisabled: () => false,
    })

    expect(html).toContain('data-testid="target-team-green-shield"')
    expect(html).not.toContain('data-testid="target-team-red-shield"')

    // The className legitimately contains the Tailwind variant prefix
    // "disabled:cursor-not-allowed" even when NOT disabled — assert on the
    // real HTML attribute (`disabled=""`), not the bare substring.
    const greenTag = /<button[^>]*data-testid="target-team-green"[^>]*>/.exec(html)?.[0]
    expect(greenTag).toBeDefined()
    expect(greenTag).not.toContain('disabled=""')
  })

  it("disables the anti-repeat team and shows its reason text", () => {
    const candidates = [team("red"), team("green")]
    const html = renderChips(candidates, {
      isTeamAntiRepeat: (t) => t.name === "green",
      isTeamDisabled: (t) => t.name === "green",
    })

    const greenTag = /<button[^>]*data-testid="target-team-green"[^>]*>/.exec(html)?.[0]
    expect(greenTag).toContain('disabled=""')
    expect(html).toContain('data-testid="target-team-green-reason"')

    const redTag = /<button[^>]*data-testid="target-team-red"[^>]*>/.exec(html)?.[0]
    expect(redTag).not.toContain('disabled=""')
    expect(html).not.toContain('data-testid="target-team-red-reason"')
  })

  it("locks every chip once voting is closed (submitted or expired)", () => {
    const candidates = [team("red"), team("green"), team("yellow")]
    const html = renderChips(candidates, { isTeamDisabled: () => true })

    const tags = html.match(/<button[^>]*data-testid="target-team-[^"]+"[^>]*>/g)
    expect(tags?.length).toBe(3)
    for (const tag of tags ?? []) {
      expect(tag).toContain("disabled")
    }
  })

  it("exposes the required aria attributes", () => {
    const html = renderChips([team("red"), team("green")])

    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain("aria-checked")
  })
})

describe("TargetTeamVote (Player Client, WP-FLB-17) — mode/selection gating", () => {
  it("renders nothing outside FlowerBattle mode, even with an active acid_rain selection", () => {
    const html = renderToStaticMarkup(
      <TargetTeamVote
        mode="classic"
        selection={activeSelection()}
        teams={[team("red"), team("blue")]}
        ownTeamName="blue"
      />,
    )

    expect(html).toBe("")
  })

  it("renders nothing when there is no active selection", () => {
    const html = renderToStaticMarkup(
      <TargetTeamVote
        mode="flowerBattle"
        selection={null}
        teams={[team("red"), team("blue")]}
        ownTeamName="blue"
      />,
    )

    expect(html).toBe("")
  })

  it("renders nothing when the selected power-up isn't acid_rain", () => {
    const html = renderToStaticMarkup(
      <TargetTeamVote
        mode="flowerBattle"
        selection={{ ...activeSelection(), optionId: "fertilizer" }}
        teams={[team("red"), team("blue")]}
        ownTeamName="blue"
      />,
    )

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

describe("useTargetTeamVote (Player Client) — live vote emit", () => {
  const getItemMock = vi.fn<(_key: string) => string | null>()
  let domDocument: DomDocument

  // Probe harness: same pattern as FlowerPowerupVote's mountVote — a headless
  // component that calls the hook and stashes its result on a ref, so
  // selectTeam/submit are reachable from the test body.
  const mountHook = () => {
    const container = domDocument.createElement("div")
    domDocument.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const resultRef: { current: UseTargetTeamVoteResult | null } = { current: null }

    function Probe() {
      resultRef.current = useTargetTeamVote({
        mode: "flowerBattle",
        selection: activeSelection(),
        teams: [team("red"), team("blue")],
        ownTeamName: "blue",
      })
      return null
    }

    act(() => {
      root.render(createElement(Probe))
    })

    return {
      hook: (): UseTargetTeamVoteResult => {
        if (!resultRef.current) throw new Error("Hook result was not captured")
        return resultRef.current
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
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("emits exactly one SUBMIT_POWERUP_TARGET_VOTE with { gameId, targetTeamId, playerToken }", () => {
    const mounted = mountHook()

    act(() => mounted.hook().selectTeam("red"))
    act(() => mounted.hook().submit())
    // Exactly-once: a second submit for the same selection is a guarded no-op.
    act(() => mounted.hook().submit())

    expect(emitMock).toHaveBeenCalledTimes(1)
    expect(emitMock).toHaveBeenCalledWith(EVENTS.FLOWER_BATTLE.SUBMIT_POWERUP_TARGET_VOTE, {
      gameId: "game-1",
      targetTeamId: "red",
      playerToken: "tok-abc",
    })
    expect(mounted.hook().locked).toBe(true)
    mounted.unmount()
  })

  it("emits nothing without a stored playerToken (SEC-01) and stays unlocked", () => {
    getItemMock.mockReturnValue(null)
    const mounted = mountHook()

    act(() => mounted.hook().selectTeam("red"))
    act(() => mounted.hook().submit())

    expect(emitMock).not.toHaveBeenCalled()
    expect(mounted.hook().locked).toBe(false)
    mounted.unmount()
  })
})
