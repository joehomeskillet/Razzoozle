/**
 * Event banner — transient PixiJS scene-graph bubble for power-up events
 * (WP-PRESENTER-5). Mirrors the DOM FlowerEventBubble contract: queue,
 * priority + dedup, 3-second hold, fade in / out, and prefers-reduced-motion
 * opacity-only mode.
 *
 * Lives in the `layer-event-banner` Container. Always below the presenter
 * shell (HUD zone 0–16 %) and above the flower-teams layer, so the bubble
 * sits at ≈ 18–22 % of the logical viewport height. Never overlaps plant
 * meters or blocks the four plot anchors.
 */

import { Container, Graphics, Text } from "pixi.js"
import type { TextStyleOptions } from "pixi.js"

import { getThemeTokenCssVar } from "@razzoozle/common/theme-tokens"

import { resolveThemeTokenColor, type ThemeColorResolver } from "./resolveThemeColor"
import { GARDEN_LOGICAL_HEIGHT, GARDEN_LOGICAL_WIDTH } from "./gardenViewport"

const BANNER_WIDTH = 520
const BANNER_HEIGHT = 84
const BANNER_CORNER = 18
const BANNER_TAIL_HEIGHT = 18
const BANNER_OUTLINE_WIDTH = 2.5

const FADE_IN_MS = 220
const HOLD_MS = 3_000
const FADE_OUT_MS = 280

export const REDUCED_FADE_IN_MS = 120
export const REDUCED_FADE_OUT_MS = 120

export { FADE_IN_MS, FADE_OUT_MS, HOLD_MS }

/** Per-token CssTokenName list. Re-used by the resolver + by tests. */
export const EVENT_BANNER_TOKENS = {
  bubbleFill: "--color-field-cream",
  bubbleOutline: "--surface-muted",
  bubbleText: "--color-field-ink",
  bubbleAccent: "--color-accent",
} as const

export interface EventBannerPalette {
  bubbleFill: number
  bubbleOutline: number
  bubbleText: number
  bubbleAccent: number
}

export function resolveEventBannerPalette(
  resolveColor: ThemeColorResolver = resolveThemeTokenColor,
): EventBannerPalette {
  return {
    bubbleFill: resolveColor(EVENT_BANNER_TOKENS.bubbleFill),
    bubbleOutline: resolveColor(EVENT_BANNER_TOKENS.bubbleOutline),
    bubbleText: resolveColor(EVENT_BANNER_TOKENS.bubbleText),
    bubbleAccent: resolveColor(EVENT_BANNER_TOKENS.bubbleAccent),
  }
}

export type EventBannerKind = "fertilizer" | "sunbeam" | "umbrella_shield" | "acid_rain"

export interface EventBannerInput {
  /** Unique key — duplicates are dropped by the queue. */
  id: string
  /** Display weight; higher = shown first when deduping. */
  priority: number
  /** Resolved display strings (host has already translated). */
  teamName: string
  powerupName: string
  /** Inline accent color (team color). Falls back to bubbleAccent. */
  accentColor: number
  kind: EventBannerKind
}

/** Queued event with a monotonic index for tie-breaking. */
interface QueuedEvent extends EventBannerInput {
  enqueuedAt: number
}

/**
 * Priority + dedup queue. Same id pushed twice within one banner cycle
 * collapses to a single emission; priority lifts an event above older ones.
 * Pure data — no Pixi dependency so it can be tested in isolation.
 */
export class EventBannerQueue {
  private entries: QueuedEvent[] = []
  private monotonic = 0
  /** Event currently displayed (or null). */
  private active: QueuedEvent | null = null

  push(input: EventBannerInput): void {
    if (this.active && this.active.id === input.id) {
      // Already showing — refresh priority / accent but keep the active slot.
      this.active = { ...this.active, ...input }
      return
    }
    // Drop pending duplicates of the same id (dedup before display).
    this.entries = this.entries.filter((entry) => entry.id !== input.id)
    this.entries.push({ ...input, enqueuedAt: this.monotonic })
    this.monotonic += 1
    this.entries.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return a.enqueuedAt - b.enqueuedAt
    })
  }

  /** Pick the next event to show; null when queue is empty. */
  next(): QueuedEvent | null {
    if (this.active) return this.active
    return this.entries.shift() ?? null
  }

  setActive(event: QueuedEvent | null): void {
    this.active = event
  }

  clear(): void {
    this.entries = []
    this.active = null
  }

  get pending(): readonly QueuedEvent[] {
    return this.entries
  }
}

export interface EventBannerControllerOptions {
  palette: EventBannerPalette
  /** Ticker delta-time callback (host injects; tests pass a stub). */
  onAdvance: (deltaMs: number) => void
  /** When true, opacity-only fade (no scale/translate). */
  prefersReducedMotion?: boolean
}

export interface EventBannerController {
  readonly container: Container
  readonly queue: EventBannerQueue
  /** Push a new event onto the queue. Dedup is automatic. */
  push(event: EventBannerInput): void
  /** Advance the banner timeline. */
  tick(deltaMs: number): void
  /** Drop everything; banner hides immediately. */
  clear(): void
  /** Active event (visible or fading) — null when idle. */
  getActive(): EventBannerInput | null
}

function drawBubble(
  graphics: Graphics,
  palette: EventBannerPalette,
  accent: number,
): void {
  graphics.clear()
  graphics.roundRect(
    -BANNER_WIDTH / 2,
    -BANNER_HEIGHT / 2 - BANNER_TAIL_HEIGHT,
    BANNER_WIDTH,
    BANNER_HEIGHT,
    BANNER_CORNER,
  )
  graphics.fill({ color: palette.bubbleFill })
  graphics.stroke({ color: palette.bubbleOutline, width: BANNER_OUTLINE_WIDTH })
  // Tail
  graphics.moveTo(-22, BANNER_HEIGHT / 2 - BANNER_TAIL_HEIGHT)
  graphics.lineTo(0, BANNER_HEIGHT / 2)
  graphics.lineTo(22, BANNER_HEIGHT / 2 - BANNER_TAIL_HEIGHT)
  graphics.closePath()
  graphics.fill({ color: palette.bubbleFill })
  graphics.stroke({ color: palette.bubbleOutline, width: BANNER_OUTLINE_WIDTH })
  // Accent burst (small accent diamond in the corner)
  graphics.circle(-BANNER_WIDTH / 2 + 28, -BANNER_HEIGHT / 2 - BANNER_TAIL_HEIGHT + 18, 9)
  graphics.fill({ color: accent })
}

/** Build the persistent event-banner container wired to a queue. */
export function buildEventBannerController(
  options: EventBannerControllerOptions,
): EventBannerController {
  const { palette, prefersReducedMotion = false } = options
  const container = new Container()
  container.label = "event-banner"
  container.position.set(GARDEN_LOGICAL_WIDTH / 2, GARDEN_LOGICAL_HEIGHT * 0.2)
  container.alpha = 0

  const bubbleGraphics = new Graphics()
  bubbleGraphics.label = "event-banner-bubble"
  container.addChild(bubbleGraphics)

  const text = new Text({
    text: "",
    style: {
      fontFamily: "inherit",
      fontSize: 22,
      fontWeight: "600",
      fill: palette.bubbleText,
      align: "center",
    } satisfies TextStyleOptions,
  })
  text.anchor.set(0.5, 0.5)
  text.position.set(0, -BANNER_TAIL_HEIGHT / 2 - 4)
  text.label = "event-banner-text"
  container.addChild(text)

  const queue = new EventBannerQueue()
  let active: QueuedEvent | null = null
  /** Total banner duration adjusted for the active phase. */
  let elapsedMs = 0

  function paint(event: QueuedEvent | null): void {
    if (!event) {
      container.alpha = 0
      text.text = ""
      return
    }
    drawBubble(bubbleGraphics, palette, event.accentColor)
    text.text = `${event.teamName} — ${event.powerupName}`
    text.style.fill = palette.bubbleText
  }

  function applyFade(elapsedMsLocal: number): void {
    const fadeIn = prefersReducedMotion ? REDUCED_FADE_IN_MS : FADE_IN_MS
    const fadeOut = prefersReducedMotion ? REDUCED_FADE_OUT_MS : FADE_OUT_MS
    const total = fadeIn + HOLD_MS + fadeOut

    if (elapsedMsLocal < fadeIn) {
      container.alpha = elapsedMsLocal / fadeIn
    } else if (elapsedMsLocal < fadeIn + HOLD_MS) {
      container.alpha = 1
    } else if (elapsedMsLocal < total) {
      const remaining = total - elapsedMsLocal
      container.alpha = remaining / fadeOut
    } else {
      active = null
      queue.setActive(null)
      container.alpha = 0
    }
  }

  function tick(deltaMs: number): void {
    if (!active) {
      const next = queue.next()
      if (!next) {
        container.alpha = 0
        return
      }
      active = next
      queue.setActive(next)
      paint(active)
      // Seed the timeline with the current frame's delta so the same tick
      // already shows the banner fading in (matches the DOM bubble contract).
      elapsedMs = deltaMs
      applyFade(elapsedMs)
      return
    }

    elapsedMs += deltaMs
    applyFade(elapsedMs)
  }

  const controller: EventBannerController = {
    container,
    queue,
    tick(deltaMs: number) {
      tick(deltaMs)
      options.onAdvance(deltaMs)
    },
    push(event) {
      queue.push(event)
    },
    clear() {
      queue.clear()
      active = null
      container.alpha = 0
      text.text = ""
    },
    getActive() {
      return active
    },
  }
  return controller
}

/** Convenience: CSS `var()` lookup for an event-banner token. */
export function getEventBannerTokenCssVar(
  token: keyof typeof EVENT_BANNER_TOKENS,
): string {
  return getThemeTokenCssVar(EVENT_BANNER_TOKENS[token])
}
