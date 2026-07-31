import { afterEach, describe, expect, it, vi } from "vitest"

import type { CssTokenName } from "@razzoozle/common/theme-tokens"

import { GARDEN_PALETTE_TOKENS, resolveGardenPalette } from "../gardenPalette"
import {
  _resetColorMixSupportCache,
  cssColorToPixiNumber,
  detectColorMixSupport,
  resolveThemeTokenColor,
  ThemeTokenColorError,
  THEME_TOKEN_COLOR_ERROR,
} from "../resolveThemeColor"

/** Chromium getComputedStyle serialisation of --team-green-ring color-mix. */
const CHROMIUM_TEAM_GREEN_RING_SRGB = "color(srgb 0.0906667 0.525333 0.250667)"
/** Deterministic 0xRRGGBB for the Chromium sample above (round channels). */
const TEAM_GREEN_RING_PIXI = 0x178640
const CHROMIUM_SCOPED_RED_RING_SRGB = "color(srgb 0.639216 0.180392 0.180392)"
const SCOPED_RED_RING_PIXI = 0xa32e2e

describe("cssColorToPixiNumber", () => {
  it("parses hex and rgb", () => {
    expect(cssColorToPixiNumber("#ff00aa")).toBe(0xff00aa)
    expect(cssColorToPixiNumber("#f0a")).toBe(0xff00aa)
    expect(cssColorToPixiNumber("rgb(255, 0, 170)")).toBe(0xff00aa)
  })

  it("parses Chromium color(srgb ...) from color-mix resolution", () => {
    // Real Chrome headless: color-mix(in srgb, #22c55e, black 32%) → this form.
    expect(cssColorToPixiNumber(CHROMIUM_TEAM_GREEN_RING_SRGB)).toBe(
      TEAM_GREEN_RING_PIXI,
    )
  })

  it("parses color(srgb) channel bounds and rounding", () => {
    expect(cssColorToPixiNumber("color(srgb 0 0 0)")).toBe(0x000000)
    expect(cssColorToPixiNumber("color(srgb 1 1 1)")).toBe(0xffffff)
    // 0.5 * 255 = 127.5 → 128 (Math.round)
    expect(cssColorToPixiNumber("color(srgb 0.5 0.5 0.5)")).toBe(0x808080)
    // clamp out-of-range channels
    expect(cssColorToPixiNumber("color(srgb -0.2 1.5 0.25)")).toBe(0x00ff40)
    // alpha ignored for Pixi RGB
    expect(cssColorToPixiNumber("color(srgb 1 0 0 / 0.4)")).toBe(0xff0000)
    // percentage form
    expect(cssColorToPixiNumber("color(srgb 100% 0% 50%)")).toBe(0xff0080)
    // signed scientific notation remains valid for numbers and percentages
    expect(cssColorToPixiNumber("color(srgb 5e-1 1e0 -1e-3)")).toBe(0x80ff00)
    expect(cssColorToPixiNumber("color(srgb +5e1% 1e2% -1e1%)")).toBe(0x80ff00)
  })

  it("rejects invalid input", () => {
    expect(cssColorToPixiNumber("")).toBeNull()
    expect(cssColorToPixiNumber("not-a-color")).toBeNull()
    expect(
      cssColorToPixiNumber("color-mix(in srgb, #22c55e, black 32%)"),
    ).toBeNull()
    expect(cssColorToPixiNumber("color(display-p3 0.1 0.2 0.3)")).toBeNull()
    expect(cssColorToPixiNumber("color(srgb 0.1 0.2)")).toBeNull()
  })

  it.each([
    "color(srgb 0.5oops 0 0)",
    "color(srgb 50%junk 0 0)",
    "color(srgb NaN 0 0)",
    "color(srgb Infinity 0 0)",
    "color(srgb -Infinity 0 0)",
    "color(srgb 1e999 0 0)",
    "color(srgb 1e 0 0)",
    "color(srgb % 0 0)",
    "color(srgb 0 0)",
  ])("rejects malformed color(srgb) channels: %s", (value) => {
    expect(cssColorToPixiNumber(value)).toBeNull()
  })
})

describe("resolveThemeTokenColor", () => {
  const token = "--surface-2" as CssTokenName
  const ringToken = "--team-green-ring" as CssTokenName

  it("resolves via getThemeTokenCssVar + getComputedStyle", () => {
    const element = {} as Element
    const color = resolveThemeTokenColor(token, {
      element,
      getComputedStyleFn: () => ({
        getPropertyValue: (prop: string) => {
          expect(prop).toBe("--surface-2")
          return "#aabbcc"
        },
      }),
    })
    expect(color).toBe(0xaabbcc)
  })

  it("resolves color(srgb ...) from DI computed style (browser-normalised form)", () => {
    const color = resolveThemeTokenColor(ringToken, {
      element: {} as Element,
      getComputedStyleFn: () => ({
        getPropertyValue: (prop: string) => {
          expect(prop).toBe("--team-green-ring")
          return CHROMIUM_TEAM_GREEN_RING_SRGB
        },
      }),
    })
    expect(color).toBe(TEAM_GREEN_RING_PIXI)
  })

  it("throws controlled error on empty token value", () => {
    expect(() =>
      resolveThemeTokenColor(token, {
        element: {} as Element,
        getComputedStyleFn: () => ({
          getPropertyValue: () => "   ",
        }),
      }),
    ).toThrow(ThemeTokenColorError)

    try {
      resolveThemeTokenColor(token, {
        element: {} as Element,
        getComputedStyleFn: () => ({ getPropertyValue: () => "" }),
      })
      expect.unreachable("should throw")
    } catch (err) {
      expect(err).toBeInstanceOf(ThemeTokenColorError)
      const e = err as ThemeTokenColorError
      expect(e.code).toBe(THEME_TOKEN_COLOR_ERROR)
      expect(e.token).toBe(token)
    }
  })

  it("throws controlled error on invalid color text", () => {
    expect(() =>
      resolveThemeTokenColor(token, {
        element: {} as Element,
        getComputedStyleFn: () => ({
          getPropertyValue: () => "purple-ish",
        }),
      }),
    ).toThrow(/invalid color/)
  })

  it("keeps ThemeTokenColorError for unresolved color-mix without browser probe", () => {
    // SSR / node: getPropertyValue may still return color-mix(...); without a
    // document probe the value must not invent a production fallback colour.
    expect(() =>
      resolveThemeTokenColor(ringToken, {
        element: {} as Element,
        getComputedStyleFn: () => ({
          getPropertyValue: () => "color-mix(in srgb, #22c55e, black 32%)",
        }),
      }),
    ).toThrow(ThemeTokenColorError)
  })
})

describe("detectColorMixSupport", () => {
  afterEach(() => {
    _resetColorMixSupportCache()
    vi.unstubAllGlobals()
  })

  it("returns false when CSS.supports is unavailable", () => {
    // vitest/jsdom provides CSS.supports; stub it off to simulate SSR.
    vi.stubGlobal("CSS", undefined)
    expect(detectColorMixSupport()).toBe(false)
  })

  it("caches the result so the second call does not hit CSS.supports again", () => {
    const supportsSpy = vi.fn().mockReturnValue(false)
    vi.stubGlobal("CSS", { supports: supportsSpy })
    expect(detectColorMixSupport()).toBe(false)
    expect(detectColorMixSupport()).toBe(false)
    expect(supportsSpy).toHaveBeenCalledTimes(1)
  })

  it("returns the CSS.supports verdict (true here: feature available)", () => {
    vi.stubGlobal("CSS", {
      supports: (_prop: string, _value: string) => true,
    })
    expect(detectColorMixSupport()).toBe(true)
  })
})

describe("SDD #992: color-mix unsupported → canonical base-token fallback", () => {
  afterEach(() => {
    _resetColorMixSupportCache()
    vi.unstubAllGlobals()
  })

  /** A trivial getComputedStyle fake that reads a token→value map. */
  function styleFromMap(
    map: Record<string, string>,
  ): (elt: Element) => { getPropertyValue: (prop: string) => string } {
    return () => ({
      getPropertyValue: (prop: string) => map[prop] ?? "",
    })
  }

  it("falls back from --team-green-ring to --team-green when color-mix unsupported", () => {
    // Simulate an older browser that does NOT support color-mix but exposes
    // raw color-mix() text from getPropertyValue. Resolver must NOT throw and
    // must NOT force the Pixi host into its DOM fallback.
    vi.stubGlobal("CSS", {
      supports: (_prop: string, _value: string) => false,
    })
    const map: Record<string, string> = {
      "--team-green-ring": "color-mix(in srgb, var(--team-green), black 32%)",
      "--team-green": "#22c55e",
    }
    const color = resolveThemeTokenColor("--team-green-ring" as CssTokenName, {
      element: {} as Element,
      getComputedStyleFn: styleFromMap(map),
    })
    expect(color).toBe(0x22c55e)
  })

  it("handles nested color-mix(var(--a), color-mix(var(--b), …)) up to depth 2", () => {
    vi.stubGlobal("CSS", {
      supports: (_prop: string, _value: string) => false,
    })
    const map: Record<string, string> = {
      "--a-ring":
        "color-mix(in srgb, var(--a), color-mix(in srgb, var(--b), black 20%))",
      "--a": "#112233",
    }
    // --a-ring → --a-ring wraps a nested color-mix whose first arg is var(--a).
    // We extract --a and resolve it directly.
    const color = resolveThemeTokenColor("--a-ring" as CssTokenName, {
      element: {} as Element,
      getComputedStyleFn: styleFromMap(map),
    })
    expect(color).toBe(0x112233)
  })

  it("still throws when color-mix base is a literal colour (no var() to recurse)", () => {
    vi.stubGlobal("CSS", {
      supports: (_prop: string, _value: string) => false,
    })
    const map: Record<string, string> = {
      "--team-green-ring": "color-mix(in srgb, #22c55e, black 32%)",
    }
    expect(() =>
      resolveThemeTokenColor("--team-green-ring" as CssTokenName, {
        element: {} as Element,
        getComputedStyleFn: styleFromMap(map),
      }),
    ).toThrow(ThemeTokenColorError)
  })

  it("does not recurse into color-mix when the browser supports color-mix (probe path)", () => {
    // Browser supports color-mix → getPropertyValue returns the resolved form.
    // The fallback extraction must NOT run; the existing colour(srgb) parser
    // handles it directly.
    vi.stubGlobal("CSS", {
      supports: (_prop: string, _value: string) => true,
    })
    const color = resolveThemeTokenColor(
      "--team-green-ring" as CssTokenName,
      {
        element: {} as Element,
        getComputedStyleFn: styleFromMap({
          "--team-green-ring": CHROMIUM_TEAM_GREEN_RING_SRGB,
        }),
      },
    )
    expect(color).toBe(TEAM_GREEN_RING_PIXI)
  })

  it("falls back to the scoped element's token (scoped theme) without DOM probe", () => {
    // P1 case 3: scoped theme tokens (defined on a non-document element) must
    // resolve via the passed-in `element`, not via the global document root.
    vi.stubGlobal("CSS", {
      supports: (_prop: string, _value: string) => false,
    })
    const map: Record<string, string> = {
      "--team-red-ring":
        "color-mix(in srgb, var(--team-red), black 32%)",
      "--team-red": "#dc2626",
    }
    const scoped = {} as Element
    const color = resolveThemeTokenColor(
      "--team-red-ring" as CssTokenName,
      {
        element: scoped,
        getComputedStyleFn: styleFromMap(map),
      },
    )
    expect(color).toBe(0xdc2626)
  })

  it("logs a console.warn for malformed channels (rgb(NaN, NaN, NaN)) before throwing", () => {
    vi.stubGlobal("CSS", {
      supports: (_prop: string, _value: string) => false,
    })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const map: Record<string, string> = {
      "--surface-2": "rgb(NaN, NaN, NaN)",
    }
    expect(() =>
      resolveThemeTokenColor("--surface-2" as CssTokenName, {
        element: {} as Element,
        getComputedStyleFn: styleFromMap(map),
      }),
    ).toThrow(/invalid color/)
    expect(warnSpy).toHaveBeenCalled()
    const message = String(warnSpy.mock.calls[0]?.[0] ?? "")
    expect(message).toMatch(/rejected malformed value/)
    expect(message).toContain("--surface-2")
    warnSpy.mockRestore()
  })

  it("does NOT log a console.warn for unparseable non-color text", () => {
    vi.stubGlobal("CSS", {
      supports: (_prop: string, _value: string) => false,
    })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect(() =>
      resolveThemeTokenColor("--surface-2" as CssTokenName, {
        element: {} as Element,
        getComputedStyleFn: styleFromMap({ "--surface-2": "purple-ish" }),
      }),
    ).toThrow(ThemeTokenColorError)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe("browser probe normalisation (DI document)", () => {
  type FakeNode = {
    style: { setProperty: (k: string, v: string) => void; color?: string }
    remove: () => void
    setAttribute: (k: string, v: string) => void
    parent: FakeNode | null
    appendChild?: (n: FakeNode) => FakeNode
  }

  let liveProbes: FakeNode[]

  afterEach(() => {
    // Ensure no prior test left a global document stub.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).document
  })

  function installProbeDocument(
    resolvedUsedColor: string,
    options: {
      tokenValue?: string
      scopedResolvedUsedColor?: string
      rejectedColorValue?: string
    } = {},
  ) {
    liveProbes = []
    const documentElement: FakeNode & {
      appendChild: (n: FakeNode) => FakeNode
      querySelectorAll: (sel: string) => FakeNode[]
    } = {
      style: { setProperty: () => undefined },
      remove: () => undefined,
      setAttribute: () => undefined,
      parent: null,
      appendChild(node: FakeNode) {
        node.parent = documentElement
        liveProbes.push(node)
        return node
      },
      querySelectorAll(sel: string) {
        if (sel.includes("data-theme-color-probe")) return [...liveProbes]
        return []
      },
    }
    const scopedElement: FakeNode & {
      appendChild: (n: FakeNode) => FakeNode
    } = {
      style: { setProperty: () => undefined },
      remove: () => undefined,
      setAttribute: () => undefined,
      parent: documentElement,
      appendChild(node: FakeNode) {
        node.parent = scopedElement
        liveProbes.push(node)
        return node
      },
    }

    const doc = {
      documentElement,
      createElement(_tag: string): FakeNode {
        const node: FakeNode = {
          style: {
            color: "",
            setProperty(k: string, v: string) {
              if (k === "color") {
                this.color = v === options.rejectedColorValue ? "" : v
              }
            },
          },
          parent: null,
          setAttribute() {
            /* marker for leak checks */
          },
          remove() {
            liveProbes = liveProbes.filter((p) => p !== node)
            node.parent = null
          },
        }
        return node
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).document = doc

    const getComputedStyleFn = (elt: Element) => ({
      getPropertyValue: (prop: string) => {
        if (prop === "--team-green-ring" || prop === "--surface-2") {
          // Specified custom property form (Chromium).
          return options.tokenValue ?? "color-mix(in srgb, #22c55e, black 32%)"
        }
        if (prop === "color") {
          // Used value after browser resolves var()/color-mix on the probe.
          const fake = elt as unknown as FakeNode
          if (fake.parent === scopedElement) {
            return options.scopedResolvedUsedColor ?? resolvedUsedColor
          }
          return resolvedUsedColor
        }
        return ""
      },
    })

    return {
      element: documentElement as unknown as Element,
      scopedElement: scopedElement as unknown as Element,
      getComputedStyleFn,
      liveCount: () => liveProbes.length,
    }
  }

  it("normalises color-mix custom props via probe to color(srgb) and cleans up", () => {
    const { element, getComputedStyleFn, liveCount } = installProbeDocument(
      CHROMIUM_TEAM_GREEN_RING_SRGB,
    )
    const color = resolveThemeTokenColor("--team-green-ring" as CssTokenName, {
      element,
      getComputedStyleFn,
    })
    expect(color).toBe(TEAM_GREEN_RING_PIXI)
    expect(liveCount()).toBe(0)
  })

  it("rejects an invalid custom-property color instead of inherited black", () => {
    const { element, getComputedStyleFn, liveCount } = installProbeDocument(
      "rgb(0, 0, 0)",
      {
        tokenValue: "not-a-color",
        rejectedColorValue: "not-a-color",
      },
    )

    expect(() =>
      resolveThemeTokenColor("--surface-2" as CssTokenName, {
        element,
        getComputedStyleFn,
      }),
    ).toThrow(ThemeTokenColorError)
    expect(liveCount()).toBe(0)
  })

  it("mounts the probe in the scoped theme element and cleans up", () => {
    const { scopedElement, getComputedStyleFn, liveCount } =
      installProbeDocument(CHROMIUM_TEAM_GREEN_RING_SRGB, {
        scopedResolvedUsedColor: CHROMIUM_SCOPED_RED_RING_SRGB,
      })

    const color = resolveThemeTokenColor("--team-green-ring" as CssTokenName, {
      element: scopedElement,
      getComputedStyleFn,
    })

    expect(color).toBe(SCOPED_RED_RING_PIXI)
    expect(liveCount()).toBe(0)
  })
})

describe("resolveGardenPalette with productive token values", () => {
  /**
   * Productive defaults from packages/web/src/index.css (:root / @theme).
   * Ring tokens use the Chromium-resolved color(srgb) form of color-mix.
   */
  const PRODUCTIVE: Record<string, string> = {
    "--surface-2": "#f9fafb",
    "--team-green": "#22c55e",
    "--state-correct": "#22c55e",
    "--surface": "#FFFFFF",
    "--team-green-ring": CHROMIUM_TEAM_GREEN_RING_SRGB,
    "--color-field-cream": "#F4F1EA",
    "--surface-muted": "#374151",
    "--surface-3": "#f3f4f6",
    "--status-online-text": "#166534",
    "--status-online-bg": "#dcfce7",
    "--color-accent": "#f59e0b",
    "--color-field-ink": "#1f2937",
  }

  it("resolves full garden palette including color-mix ring tokens", () => {
    const palette = resolveGardenPalette((token) =>
      resolveThemeTokenColor(token, {
        element: {} as Element,
        getComputedStyleFn: () => ({
          getPropertyValue: (prop: string) => PRODUCTIVE[prop] ?? "",
        }),
      }),
    )

    expect(palette.sky).toBe(cssColorToPixiNumber("#f9fafb"))
    expect(palette.hillsFar).toBe(cssColorToPixiNumber("#22c55e"))
    expect(palette.midground).toBe(TEAM_GREEN_RING_PIXI)
    expect(palette.plantLeaf).toBe(TEAM_GREEN_RING_PIXI)
    // Every token key from the production map is present and finite.
    for (const key of Object.keys(GARDEN_PALETTE_TOKENS) as Array<
      keyof typeof palette
    >) {
      expect(Number.isFinite(palette[key])).toBe(true)
      expect(palette[key]).toBeGreaterThanOrEqual(0)
      expect(palette[key]).toBeLessThanOrEqual(0xffffff)
    }
  })
})