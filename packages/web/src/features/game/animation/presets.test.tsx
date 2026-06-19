// Unit test for the shared in-game animation hook's reduced-motion behaviour
// (presets.ts → useReveal).
//
// Pure TS — no jsdom, no Testing Library (the web package runs vitest under the
// `node` env, see vitest.config.ts). useReveal's only two dependencies are the
// `useReducedMotion` hook from motion/react and the `useThemeStore` selector;
// both are mocked here with plain functions, so calling useReveal() executes no
// real React hook machinery and can run outside a renderer. We drive the
// reduced-motion flag through the mocked useReducedMotion and assert that the
// hook collapses stagger, drops the `y` rise, and falls back to instant tweens.
//
// Mirrors the existing web/socket vitest conventions (describe/it/expect,
// 2-space indent, no semicolons).

import { afterEach, describe, expect, it, vi } from "vitest"
import type { Transition, Variants } from "motion/react"

// Mutable flag the mocked useReducedMotion reads — flip it per test.
let mockReducedMotion: boolean | null = false

vi.mock("motion/react", () => ({
  useReducedMotion: () => mockReducedMotion,
}))

// Mock the theme store: it's a selector hook `useThemeStore(s => s.theme.animation)`.
// Returning `undefined` animation tokens exercises the FALLBACK_TOKENS path, so the
// non-reduced spring uses the known fallback stiffness/damping.
vi.mock("@razzoozle/web/features/theme/store", () => ({
  useThemeStore: <T,>(selector: (s: { theme: { animation: undefined } }) => T): T =>
    selector({ theme: { animation: undefined } }),
}))

import { useReveal } from "./presets"

// motion's variant `visible` value can be an object or keyframe array; narrow it.
const asObject = (value: unknown): Record<string, unknown> => {
  expect(typeof value).toBe("object")
  expect(value).not.toBeNull()
  return value as Record<string, unknown>
}

afterEach(() => {
  mockReducedMotion = false
})

describe("useReveal — reduced motion ON", () => {
  it("collapses stagger, drops rise, and falls back to instant tweens", () => {
    mockReducedMotion = true
    const reveal = useReveal()

    expect(reveal.reduced).toBe(true)

    // container: staggerChildren collapses to 0.
    const container: Variants = reveal.container(0.1, 0.5)
    const visible = asObject(container.visible)
    const transition = asObject(visible.transition)
    expect(transition.staggerChildren).toBe(0)
    expect(transition.delayChildren).toBe(0)

    // item(): opacity-only — no `y` offset in the hidden state.
    const item: Variants = reveal.item()
    const itemHidden = asObject(item.hidden)
    expect(itemHidden.opacity).toBe(0)
    expect("y" in itemHidden).toBe(false)
    expect(asObject(item.visible).opacity).toBe(1)

    // pop(): opacity-only too — no scale keyframes.
    const pop: Variants = reveal.pop()
    const popHidden = asObject(pop.hidden)
    expect(popHidden.opacity).toBe(0)
    expect("scale" in popHidden).toBe(false)
    expect("scale" in asObject(pop.visible)).toBe(false)

    // spring / snap / tween: instant duration fallback — no spring type.
    const spring: Transition = reveal.spring
    expect("type" in spring).toBe(false)
    expect((spring as { duration?: number }).duration).toBeGreaterThan(0)
    expect("type" in reveal.snap).toBe(false)

    const tween: Transition = reveal.tween()
    expect("type" in tween).toBe(false)
    expect("ease" in tween).toBe(false)
    expect((tween as { duration?: number }).duration).toBeGreaterThan(0)
  })
})

describe("useReveal — reduced motion OFF", () => {
  it("uses real springs, staggered children, and a rise offset", () => {
    mockReducedMotion = false
    const reveal = useReveal()

    expect(reveal.reduced).toBe(false)

    // spring is a genuine spring transition.
    expect((reveal.spring as { type?: string }).type).toBe("spring")
    expect((reveal.snap as { type?: string }).type).toBe("spring")

    // container: stagger preserved (fallback staggerScale === 1).
    const visible = asObject(reveal.container(0.1, 0.5).visible)
    const transition = asObject(visible.transition)
    expect(transition.staggerChildren).toBe(0.1)
    expect(transition.delayChildren).toBe(0.5)

    // item(): fade + rise — hidden carries a positive `y` offset.
    const itemHidden = asObject(reveal.item().hidden)
    expect(itemHidden.opacity).toBe(0)
    expect(itemHidden.y).toBeGreaterThan(0)

    // tween: a duration/ease tween, not a spring.
    const tween: Transition = reveal.tween()
    expect("type" in tween).toBe(false)
    expect((tween as { ease?: unknown }).ease).toBeDefined()
  })

  it("honours useReducedMotion returning null as not-reduced", () => {
    mockReducedMotion = null
    const reveal = useReveal()
    expect(reveal.reduced).toBe(false)
    expect((reveal.spring as { type?: string }).type).toBe("spring")
  })
})
