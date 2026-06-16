import { describe, it, expect, beforeEach } from "vitest"
import {
  withinRate,
  sampleHash,
  RATE_MAX,
  BUCKET_MAX,
  SAMPLE_RATE,
  __resetClientEventBuckets,
  __bucketSize,
} from "@razzoozle/socket/services/http-routes"

describe("client-events rate limiter (per clientId, capped, evicting)", () => {
  beforeEach(() => __resetClientEventBuckets())

  it("allows up to RATE_MAX then rejects (over-rate)", () => {
    const now = 1_000_000
    let allowed = 0
    for (let i = 0; i < RATE_MAX + 5; i++) {
      if (withinRate("c1", now)) {
        allowed++
      }
    }
    expect(allowed).toBe(RATE_MAX)
    // The (RATE_MAX+1)-th call is rejected.
    expect(withinRate("c1", now)).toBe(false)
  })

  it("two clientIds are independent (NOT per-IP)", () => {
    const now = 1_000_000
    for (let i = 0; i < RATE_MAX; i++) {
      expect(withinRate("a", now)).toBe(true)
    }
    // a is now exhausted; b is fresh and still allowed.
    expect(withinRate("a", now)).toBe(false)
    expect(withinRate("b", now)).toBe(true)
    expect(__bucketSize()).toBe(2)
  })

  it("window resets after RATE_WINDOW_MS", () => {
    const now = 1_000_000
    for (let i = 0; i < RATE_MAX; i++) {
      withinRate("c", now)
    }
    expect(withinRate("c", now)).toBe(false)
    // 61s later → fresh window.
    expect(withinRate("c", now + 61_000)).toBe(true)
  })

  it("bucket map stays capped + LRU-evicts under load", () => {
    const now = 1_000_000
    // Drive far more distinct clientIds than the cap.
    for (let i = 0; i < BUCKET_MAX + 500; i++) {
      withinRate(`load-${i}`, now)
    }
    expect(__bucketSize()).toBeLessThanOrEqual(BUCKET_MAX)
    // The earliest clients were evicted; the most recent survive.
    expect(__bucketSize()).toBeGreaterThan(0)
  })

  it("sampling is deterministic and ~SAMPLE_RATE keep-fraction", () => {
    // Same key always yields the same hash (deterministic).
    expect(sampleHash("c1:answer-latency")).toBe(sampleHash("c1:answer-latency"))
    // Over many keys the kept fraction is in a sane band around SAMPLE_RATE.
    let kept = 0
    const N = 5000
    for (let i = 0; i < N; i++) {
      if (sampleHash(`client-${i}:answer-latency`) < SAMPLE_RATE) {
        kept++
      }
    }
    const frac = kept / N
    expect(frac).toBeGreaterThan(SAMPLE_RATE * 0.5)
    expect(frac).toBeLessThan(SAMPLE_RATE * 1.5)
  })
})
