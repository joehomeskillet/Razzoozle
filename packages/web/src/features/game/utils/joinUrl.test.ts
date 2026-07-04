import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildJoinUrl, resolveJoinBase } from "./joinUrl"

// Runs under the project's default `node` vitest env (no jsdom dependency).
// Minimal window/document stubs let resolveJoinBase() execute.
const ORIGIN = "http://localhost:3000"

type Attrs = Record<string, string>
function makeEl(attrs: Attrs) {
  return {
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    setAttribute: (n: string, v: string) => {
      attrs[n] = v
    },
    removeAttribute: (n: string) => {
      delete attrs[n]
    },
    hasAttribute: (n: string) => n in attrs,
  }
}

let rootAttrs: Attrs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let win: any

beforeEach(() => {
  rootAttrs = {}
  const root = makeEl(rootAttrs)
  const documentElement = makeEl({})
  win = { location: { origin: ORIGIN } }
  vi.stubGlobal("window", win)
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "root" ? root : null),
    documentElement,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("joinUrl", () => {
  it("no-regression default: nothing set -> ORIGIN + ?pin=code", () => {
    expect(buildJoinUrl("123456")).toBe(`${ORIGIN}?pin=123456`)
  })

  it("empty code -> ORIGIN + ?pin=", () => {
    expect(buildJoinUrl(undefined)).toBe(`${ORIGIN}?pin=`)
  })

  it("explicit origin arg still honored", () => {
    expect(buildJoinUrl("1", "https://x.test")).toBe("https://x.test?pin=1")
  })

  it("__RAZZ_HOST.joinBase is used", () => {
    win.__RAZZ_HOST = { version: 1, joinBase: "https://play.razzoozle.xyz" }
    expect(resolveJoinBase()).toBe("https://play.razzoozle.xyz")
  })

  it("normalization: path/query/hash stripped to origin", () => {
    win.__RAZZ_HOST = {
      version: 1,
      joinBase: "https://play.razzoozle.xyz/foo?x=1#h",
    }
    expect(resolveJoinBase()).toBe("https://play.razzoozle.xyz")
  })

  it("legacy __RAZZ_JOIN_BASE used when __RAZZ_HOST absent", () => {
    win.__RAZZ_JOIN_BASE = "https://legacy.example"
    expect(resolveJoinBase()).toBe("https://legacy.example")
  })

  it("declarative data-join-base on #root used when globals absent", () => {
    rootAttrs["data-join-base"] = "https://attr.example"
    expect(resolveJoinBase()).toBe("https://attr.example")
  })

  it("precedence: __RAZZ_HOST > __RAZZ_JOIN_BASE > data-join-base", () => {
    win.__RAZZ_HOST = { version: 1, joinBase: "https://a.example" }
    win.__RAZZ_JOIN_BASE = "https://b.example"
    rootAttrs["data-join-base"] = "https://c.example"
    expect(resolveJoinBase()).toBe("https://a.example")
  })

  it("invalid overrides are rejected -> fall back to ORIGIN", () => {
    for (const bad of [
      // eslint-disable-next-line no-script-url -- asserts the sanitizer rejects it
      "javascript:alert(1)",
      "ftp://x.example",
      "not a url",
      "http://evil.example",
    ]) {
      win.__RAZZ_HOST = undefined
      win.__RAZZ_JOIN_BASE = bad
      expect(resolveJoinBase(), `override ${bad}`).toBe(ORIGIN)
    }
  })
})
