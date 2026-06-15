// WP-6 — tests for services/webp.ts `webpDimensions`, the pure-JS WebP dimension
// probe that backs the W×H label in ConfigMedia (computed server-side from the
// post-toWebp OUTPUT buffer, never by shelling out to identify/magick which are
// absent from the alpine runner).
//
// The fixtures below are REAL 1×1 WebP buffers produced by the project's own
// `cwebp -q 82` (lossy → "VP8 ") and `cwebp -lossless` (→ "VP8L"), captured as
// base64 so the suite has no subprocess/binary dependency. Asserting 1×1 on both
// proves the parser end-to-end against the two chunk types cwebp emits in
// practice. A short/garbage buffer must return null so the caller (createMediaMeta
// via saveMediaFile) simply omits width/height — the backward-compat contract.

import { webpDimensions } from "@razzia/socket/services/webp"
import { describe, expect, it } from "vitest"

// Real `cwebp -q 82 -- 1x1.png` output → RIFF/WEBP "VP8 " (lossy) chunk.
const ONE_PX_LOSSY = Buffer.from(
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAiJaACdLoB+AADsAD+899n/n5nduL+q3/7DP+vMvrzL/sFgAA=",
  "base64",
)

// Real `cwebp -lossless -- 1x1.png` output → RIFF/WEBP "VP8L" (lossless) chunk.
const ONE_PX_LOSSLESS = Buffer.from(
  "UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA",
  "base64",
)

describe("webpDimensions", () => {
  it("reads 1×1 from a real lossy (VP8 ) 1px fixture", () => {
    expect(ONE_PX_LOSSY.toString("ascii", 12, 16)).toBe("VP8 ")
    expect(webpDimensions(ONE_PX_LOSSY)).toEqual({ width: 1, height: 1 })
  })

  it("reads 1×1 from a real lossless (VP8L) 1px fixture", () => {
    expect(ONE_PX_LOSSLESS.toString("ascii", 12, 16)).toBe("VP8L")
    expect(webpDimensions(ONE_PX_LOSSLESS)).toEqual({ width: 1, height: 1 })
  })

  it("reads canvas size from a VP8X (extended) chunk", () => {
    // Synthetic VP8X: 24-bit LE (canvas - 1) at offsets 24 (w) and 27 (h).
    // 1×1 → both fields zero. Proves the third chunk branch.
    const buf = Buffer.alloc(30, 0)
    buf.write("RIFF", 0, "ascii")
    buf.write("WEBP", 8, "ascii")
    buf.write("VP8X", 12, "ascii")
    expect(webpDimensions(buf)).toEqual({ width: 1, height: 1 })
  })

  it("returns null on a short buffer", () => {
    expect(webpDimensions(Buffer.from("RIFF"))).toBeNull()
    expect(webpDimensions(Buffer.alloc(0))).toBeNull()
  })

  it("returns null on a non-WebP buffer (wrong magic)", () => {
    // 16+ bytes but not a RIFF/WEBP container → unrecognized, omit dims.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(webpDimensions(Buffer.concat([png, Buffer.alloc(16)]))).toBeNull()
  })

  it("returns null on a truncated VP8L chunk (header but no dims word)", () => {
    // Valid RIFF/WEBP + "VP8L" fourCC but < 25 bytes → guarded read returns null.
    const buf = Buffer.alloc(20, 0)
    buf.write("RIFF", 0, "ascii")
    buf.write("WEBP", 8, "ascii")
    buf.write("VP8L", 12, "ascii")
    expect(webpDimensions(buf)).toBeNull()
  })
})
