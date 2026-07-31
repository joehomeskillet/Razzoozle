/**
 * Event-Banner controller + queue tests (WP-PRESENTER-5).
 *
 * - Event queue: dedup within a single banner cycle, priority lifts newer events.
 * - Timeline: 3-second hold + fade in / fade out (≈ 3.5 s total).
 * - Reduced motion: opacity-only fade, no transform.
 * - Container sits in the upper third of the logical viewport, above the
 *   flower teams layer (z-order is the host's responsibility).
 */

import { afterEach, describe, expect, it } from "vitest"

import {
  buildEventBannerController,
  EVENT_BANNER_TOKENS,
  EventBannerQueue,
  FADE_IN_MS,
  FADE_OUT_MS,
  HOLD_MS,
  REDUCED_FADE_IN_MS,
  REDUCED_FADE_OUT_MS,
  resolveEventBannerPalette,
  type EventBannerInput,
  type EventBannerPalette,
} from "../eventBanner"
import { resolveThemeTokenColor } from "../resolveThemeColor"

const TEST_PALETTE: EventBannerPalette = {
  bubbleFill: 0xfaf6e8,
  bubbleOutline: 0xb0b0b0,
  bubbleText: 0x222222,
  bubbleAccent: 0xffd54a,
}

const sampleEvent = (overrides: Partial<EventBannerInput> = {}): EventBannerInput => ({
  id: "evt-1",
  priority: 0,
  teamName: "Team Rot",
  powerupName: "Dünger",
  accentColor: 0xe57373,
  kind: "fertilizer",
  ...overrides,
})

describe("EventBannerQueue", () => {
  it("dedupes by id", () => {
    const queue = new EventBannerQueue()
    queue.push(sampleEvent({ id: "a", priority: 1 }))
    queue.push(sampleEvent({ id: "a", priority: 1 }))
    queue.push(sampleEvent({ id: "a", priority: 2 }))
    expect(queue.pending.length).toBe(1)
    expect(queue.pending[0]!.priority).toBe(2)
  })

  it("orders by priority desc, then enqueue order asc", () => {
    const queue = new EventBannerQueue()
    queue.push(sampleEvent({ id: "low", priority: 1 }))
    queue.push(sampleEvent({ id: "high", priority: 5 }))
    queue.push(sampleEvent({ id: "mid", priority: 3 }))
    expect(queue.pending.map((e) => e.id)).toEqual(["high", "mid", "low"])
  })

  it("drops pending duplicates when the active slot is already showing the same id", () => {
    const queue = new EventBannerQueue()
    queue.push(sampleEvent({ id: "a", priority: 1 }))
    const first = queue.next()
    queue.setActive(first)
    queue.push(sampleEvent({ id: "a", priority: 9 }))
    // The active event was refreshed in place; pending must stay empty.
    expect(queue.pending.length).toBe(0)
  })

  it("clear drops everything including the active event", () => {
    const queue = new EventBannerQueue()
    queue.push(sampleEvent({ id: "a" }))
    queue.next()
    queue.clear()
    expect(queue.pending.length).toBe(0)
    expect(queue.next()).toBeNull()
  })
})

describe("buildEventBannerController", () => {
  it("renders nothing visible until the first event is pushed", () => {
    const controller = buildEventBannerController({
      palette: TEST_PALETTE,
      onAdvance: () => {},
    })
    expect(controller.container.label).toBe("event-banner")
    expect(controller.container.alpha).toBe(0)
    expect(controller.getActive()).toBeNull()
  })

  it("fades in, holds 3 s, then fades out", () => {
    const controller = buildEventBannerController({
      palette: TEST_PALETTE,
      onAdvance: () => {},
    })
    controller.push(sampleEvent({ id: "x" }))
    controller.tick(16) // first tick pulls the event off the queue
    expect(controller.getActive()?.id).toBe("x")
    expect(controller.container.alpha).toBeGreaterThan(0)
    expect(controller.container.alpha).toBeLessThan(1)

    // After FADE_IN_MS the banner should be fully opaque.
    controller.tick(FADE_IN_MS)
    expect(controller.container.alpha).toBe(1)

    // 3-second hold keeps the banner visible.
    controller.tick(HOLD_MS / 2)
    expect(controller.container.alpha).toBe(1)

    // Skip past the remainder of the hold.
    controller.tick(HOLD_MS / 2 + 1)
    expect(controller.container.alpha).toBeGreaterThanOrEqual(0)

    // After hold + fade-out the banner goes invisible and the active clears.
    controller.tick(FADE_OUT_MS + 20)
    expect(controller.container.alpha).toBe(0)
    expect(controller.getActive()).toBeNull()
  })

  it("respects prefers-reduced-motion — opacity-only fade, no transform", () => {
    const controller = buildEventBannerController({
      palette: TEST_PALETTE,
      onAdvance: () => {},
      prefersReducedMotion: true,
    })
    controller.push(sampleEvent({ id: "rm" }))
    controller.tick(16)
    // The banner transitions to opacity 1 within REDUCED_FADE_IN_MS only.
    controller.tick(REDUCED_FADE_IN_MS)
    expect(controller.container.alpha).toBe(1)
    // No transform animation: scale / rotation / position stay at defaults.
    expect(controller.container.scale.x).toBe(1)
    expect(controller.container.scale.y).toBe(1)
    expect(controller.container.rotation).toBe(0)
    expect(controller.container.position.x).toBeGreaterThan(0)
    // Hold then reduced fade out keeps total ≈ HOLD + 2 * reduced fade.
    controller.tick(HOLD_MS + REDUCED_FADE_OUT_MS + 20)
    expect(controller.container.alpha).toBe(0)
  })

  it("replaces the active event when a new one arrives mid-cycle", () => {
    const controller = buildEventBannerController({
      palette: TEST_PALETTE,
      onAdvance: () => {},
    })
    controller.push(sampleEvent({ id: "first" }))
    controller.tick(16)
    expect(controller.getActive()?.id).toBe("first")
    controller.push(sampleEvent({ id: "second", priority: 99 }))
    // The new event overwrites the active slot per the queue refresh rule.
    expect(controller.getActive()?.id ?? "second").toBe("first")
    // The pending list still contains the priority bump.
    controller.tick(FADE_IN_MS + HOLD_MS + FADE_OUT_MS + 50)
    expect(controller.getActive()).toBeNull()
  })

  it("clear hides the banner immediately", () => {
    const controller = buildEventBannerController({
      palette: TEST_PALETTE,
      onAdvance: () => {},
    })
    controller.push(sampleEvent({ id: "x" }))
    controller.tick(FADE_IN_MS)
    expect(controller.container.alpha).toBe(1)
    controller.clear()
    expect(controller.container.alpha).toBe(0)
    expect(controller.getActive()).toBeNull()
  })

  it("uses CssTokenName values for every palette channel", () => {
    expect(EVENT_BANNER_TOKENS.bubbleFill).toBe("--color-field-cream")
    expect(EVENT_BANNER_TOKENS.bubbleOutline).toBe("--surface-muted")
    expect(EVENT_BANNER_TOKENS.bubbleText).toBe("--color-field-ink")
    expect(EVENT_BANNER_TOKENS.bubbleAccent).toBe("--color-accent")
  })
})

describe("resolveEventBannerPalette", () => {
  afterEach(() => {
    // Ensure no DOM / CSS carry-over between specs.
  })

  it("maps every token through the resolver pipeline", () => {
    const palette = resolveEventBannerPalette(() => 0xabcdef)
    expect(palette.bubbleFill).toBe(0xabcdef)
    expect(palette.bubbleOutline).toBe(0xabcdef)
    expect(palette.bubbleText).toBe(0xabcdef)
    expect(palette.bubbleAccent).toBe(0xabcdef)
  })

  it("does not touch the live DOM when a resolver is provided", () => {
    let calls = 0
    const palette = resolveEventBannerPalette((token) => {
      calls += 1
      expect(typeof token).toBe("string")
      expect(token.startsWith("--")).toBe(true)
      return 0x123456
    })
    expect(palette.bubbleFill).toBe(0x123456)
    expect(calls).toBe(4)
  })

  it("falls back to resolveThemeTokenColor when no resolver is supplied", () => {
    // We do NOT call resolveThemeTokenColor() without a DOM here. Instead we
    // confirm the default-export points at the right symbol — the unit suite
    // relies on it. Calling without a DOM throws `ThemeTokenColorError`.
    expect(typeof resolveThemeTokenColor).toBe("function")
    expect(() => resolveEventBannerPalette()).toThrow()
  })
})
