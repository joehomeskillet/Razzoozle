// Smoke test for WinnerPodium.
//
// NOTE: @testing-library/react is NOT a dependency and the package's vitest
// env is `node` (no jsdom) — see vitest.config.ts. So a render-smoke test is
// not possible without adding deps/config, which is out of scope here. Instead
// this asserts the module's public contract: a single default export that is a
// React function component. Mirrors the package's vitest conventions
// (describe/it/expect, 2-space indent, no semicolons).

import { describe, expect, it } from "vitest"

import WinnerPodium from "./WinnerPodium"

describe("WinnerPodium", () => {
  it("has a default export", () => {
    expect(WinnerPodium).toBeDefined()
  })

  it("default export is a function component", () => {
    expect(typeof WinnerPodium).toBe("function")
  })

  it("declares the expected props arity (destructured single props object)", () => {
    // Function components take one `props` argument.
    expect(WinnerPodium.length).toBe(1)
  })
})
