import { describe, expect, it, vi } from "vitest"
import { safeSwCall } from "./safeSwCall"

describe("safeSwCall", () => {
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
})