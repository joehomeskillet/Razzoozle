import { afterEach, describe, expect, it, vi } from "vitest"
import { safeSwCall } from "./safeSwCall"

describe("safeSwCall", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("resolved promise completes silently", async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    safeSwCall(fn)
    await vi.waitFor(() => {
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  it("rejected promise does not throw", () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"))
    expect(() => safeSwCall(fn)).not.toThrow()
  })

  it("synchronous throw does not escape", () => {
    const fn = vi.fn(() => {
      throw new Error("sync boom")
    })
    expect(() => safeSwCall(fn)).not.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("async rejection does not surface as unhandledRejection after microtask flush", async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on("unhandledRejection", onUnhandled)
    try {
      safeSwCall(() => Promise.reject(new Error("async boom")))
      // Flush microtasks so a leaked rejection would have fired by now.
      await Promise.resolve()
      await Promise.resolve()
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(unhandled).toEqual([])
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })

  it("sync throw path also leaves no unhandledRejection after microtask flush", async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on("unhandledRejection", onUnhandled)
    try {
      safeSwCall(() => {
        throw new Error("sync boom for rejection observer")
      })
      await Promise.resolve()
      await Promise.resolve()
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(unhandled).toEqual([])
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })
})
