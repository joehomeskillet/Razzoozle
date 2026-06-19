// Unit tests for fetchTheme (apply.ts). fetchTheme NEVER rejects: every failure
// path — non-2xx response, malformed/non-object JSON, validator rejection, or a
// network throw — resolves to the bundled DEFAULT_THEME. Only the happy path
// returns a validated, default-backfilled theme. We exercise this by stubbing
// the global `fetch` per case (vi.stubGlobal), so no real network or DOM is
// touched; the file runs under the package's default `node` vitest env.
//
// DEFAULT_THEME is imported from the SAME module apply.ts pulls it from
// (@razzoozle/common/types/theme, see apply.ts line 1) so the success
// round-trip asserts against the exact object the implementation falls back to.
// Mirrors the package's vitest conventions (describe/it/expect, 2-space indent,
// no semicolons).

import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_THEME } from "@razzoozle/common/types/theme"
import { fetchTheme } from "./apply"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchTheme", () => {
  it("falls back to DEFAULT_THEME on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    await expect(fetchTheme()).resolves.toEqual(DEFAULT_THEME)
  })

  it("falls back to DEFAULT_THEME when the JSON body is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => null }),
    )

    await expect(fetchTheme()).resolves.toEqual(DEFAULT_THEME)
  })

  it("falls back to DEFAULT_THEME when the JSON body is an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [1, 2] }),
    )

    await expect(fetchTheme()).resolves.toEqual(DEFAULT_THEME)
  })

  it("never rejects on a network error and resolves to DEFAULT_THEME", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")))

    await expect(fetchTheme()).resolves.toEqual(DEFAULT_THEME)
  })

  it("validates and returns the parsed theme on a success round-trip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => DEFAULT_THEME }),
    )

    // Deep-equal (not identity) — the value flows through the merge + zod
    // validator, proving the success path ran rather than a fallback return.
    await expect(fetchTheme()).resolves.toEqual(DEFAULT_THEME)
  })
})
