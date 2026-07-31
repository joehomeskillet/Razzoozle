/**
 * WP-D-2: FlowerEventBubble tests — SDD §20.5 presenter event bubble.
 * Covers: render basics, auto-dismiss timer (via exported schedule helper),
 * reduced-motion fallback, replacement (no stacking), and the
 * no-arbitrary-class gate.
 *
 * Pure render-to-markup tests where possible — matches the host test pattern
 * in GardenBattleCanvasHost.test.tsx so the suite stays node-fast. The
 * auto-dismiss timer is exercised through the exported `scheduleBubbleDismiss`
 * helper which mirrors the effect body exactly.
 */

import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("motion/react", () => ({
  useReducedMotion: () => true,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...rest
    }: {
      children?: React.ReactNode
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
      [key: string]: unknown
    }) => (
      <div {...rest}>{children}</div>
    ),
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { defaultValue?: string; teamName?: string; powerupName?: string },
    ) => {
      if (options?.defaultValue) {
        return options.defaultValue
          .replace("{{teamName}}", options.teamName ?? "")
          .replace("{{powerupName}}", options.powerupName ?? "")
      }
      return key
    },
  }),
}))

import { createElement } from "react"
import {
  EVENT_BUBBLE_VISIBLE_MS,
  FlowerEventBubble,
  scheduleBubbleDismiss,
  type FlowerEventBubbleEvent,
} from "../FlowerEventBubble"

const FIXED_NOW = 1_700_000_000_000

function makeEvent(
  overrides: Partial<FlowerEventBubbleEvent> = {},
): FlowerEventBubbleEvent {
  return {
    teamId: "red",
    powerupType: "fertilizer",
    issuedAtServerMs: FIXED_NOW,
    ...overrides,
  }
}

function renderBubble(props: {
  event: FlowerEventBubbleEvent | null
  onDismiss: () => void
}): string {
  return renderToStaticMarkup(createElement(FlowerEventBubble, props))
}

describe("FlowerEventBubble", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders nothing when event is null", () => {
    const html = renderBubble({ event: null, onDismiss: vi.fn() })
    expect(html).toBe("")
  })

  it("renders the team and powerup name from the event payload", () => {
    const html = renderBubble({
      event: makeEvent({ teamId: "blue", powerupType: "acid_rain" }),
      onDismiss: vi.fn(),
    })
    expect(html).toContain('data-testid="flower-event-bubble"')
    expect(html).toContain('data-team-id="blue"')
    expect(html).toContain('data-powerup-type="acid_rain"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('role="status"')
    expect(html).toContain("Team Blau")
    expect(html).toContain("Saurer Regen")
  })

  it("auto-dismisses after ~3 seconds via scheduleBubbleDismiss", () => {
    const onDismiss = vi.fn()
    let handle: ReturnType<typeof setTimeout> | null = null
    const cancel = scheduleBubbleDismiss(
      onDismiss,
      (h) => {
        handle = h
      },
      EVENT_BUBBLE_VISIBLE_MS,
    )
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(EVENT_BUBBLE_VISIBLE_MS - 1)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    // After firing, the dismiss handler clears the handle.
    expect(handle).toBeNull()
    cancel()
  })

  it("cancel clears the timer before it fires", () => {
    const onDismiss = vi.fn()
    let handle: ReturnType<typeof setTimeout> | null = null
    const cancel = scheduleBubbleDismiss(
      onDismiss,
      (h) => {
        handle = h
      },
      EVENT_BUBBLE_VISIBLE_MS,
    )
    cancel()
    expect(handle).toBeNull()
    vi.advanceTimersByTime(EVENT_BUBBLE_VISIBLE_MS + 100)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("marks reduced-motion and exposes no transform animation in markup", () => {
    const html = renderBubble({
      event: makeEvent(),
      onDismiss: vi.fn(),
    })
    expect(html).toContain('data-reduced-motion="true"')
    expect(html).not.toMatch(/style=[^>]*transform/i)
  })

  it("replaces the previous event instead of stacking (single bubble)", () => {
    const onDismiss = vi.fn()
    const first = renderBubble({
      event: makeEvent({ teamId: "red", powerupType: "fertilizer" }),
      onDismiss,
    })
    expect(first).toContain('data-powerup-type="fertilizer"')
    expect(first.match(/data-testid="flower-event-bubble"/g)).toHaveLength(1)

    // A second render with a new event replaces; the rendered tree never
    // stacks two bubbles (SDD §20.5).
    const second = renderBubble({
      event: makeEvent({ teamId: "green", powerupType: "sunbeam" }),
      onDismiss,
    })
    expect(second).toContain('data-team-id="green"')
    expect(second).toContain('data-powerup-type="sunbeam"')
    expect(second.match(/data-testid="flower-event-bubble"/g)).toHaveLength(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("uses no hardcoded hex or arbitrary Tailwind classes in the markup", () => {
    const html = renderBubble({
      event: makeEvent(),
      onDismiss: vi.fn(),
    })
    expect(html).not.toMatch(/bg-\[#[0-9a-fA-F]{3,8}\]/)
    expect(html).not.toMatch(/rounded-\[/)
    expect(html).not.toMatch(/shadow-\[/)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })
})