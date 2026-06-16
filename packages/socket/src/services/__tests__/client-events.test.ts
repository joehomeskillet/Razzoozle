import { describe, it, expect } from "vitest"
import { clientEventValidator } from "@razzoozle/common/validators/client-events"

describe("client-events validator", () => {
  it("round-trips every valid discriminated-union member", () => {
    const cases: unknown[] = [
      { type: "client-error", clientId: "c1", message: "boom" },
      { type: "join-failure", clientId: "c2", reason: "room-not-found" },
      { type: "socket-reconnect", clientId: "c3", attempts: 2 },
      { type: "answer-latency", clientId: "c4", latencyMs: 120 },
    ]
    for (const c of cases) {
      const r = clientEventValidator.safeParse(c)
      expect(r.success).toBe(true)
    }
  })

  it("rejects a missing type", () => {
    const r = clientEventValidator.safeParse({ clientId: "c1", message: "x" })
    expect(r.success).toBe(false)
  })

  it("rejects an unknown discriminant value", () => {
    const r = clientEventValidator.safeParse({ type: "nope", clientId: "c1" })
    expect(r.success).toBe(false)
  })

  it("strict-strips a smuggled secret/solution field (correct/solutions dropped)", () => {
    const r = clientEventValidator.safeParse({
      type: "client-error",
      clientId: "c1",
      message: "x",
      correct: true,
      solutions: [1, 2, 3],
      apiKey: "sk-leak",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect("correct" in r.data).toBe(false)
      expect("solutions" in r.data).toBe(false)
      expect("apiKey" in r.data).toBe(false)
    }
  })

  it("rejects a missing required field for a known type", () => {
    // answer-latency requires latencyMs
    const r = clientEventValidator.safeParse({
      type: "answer-latency",
      clientId: "c1",
    })
    expect(r.success).toBe(false)
  })
})
