// Convert image bytes (PNG/JPEG/WebP) to WebP via cwebp (reads stdin, writes
// stdout). Quality 82 is a good size/quality balance for quiz media. Rejects on
// non-zero exit. Shared by the AI-gen path (comfyui) and theme background
// uploads (config) so every asset we host is served as WebP.
import { spawn } from "child_process"

export const toWebp = (input: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const proc = spawn("cwebp", ["-quiet", "-q", "82", "-o", "-", "--", "-"])
    const chunks: Buffer[] = []
    proc.stdout.on("data", (c) => chunks.push(c))
    proc.on("error", reject)
    proc.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error("errors:submission.imageGenFailed")),
    )
    proc.stdin.on("error", () => {})
    proc.stdin.write(input)
    proc.stdin.end()
  })

// WP-6 — pure-JS WebP dimension probe. No subprocess (`identify`/`magick` are NOT
// in the alpine runner) and no new dependency. Parses the RIFF/WebP container and
// handles all three cwebp output chunk types (VP8 lossy, VP8L lossless, VP8X
// extended). Every read is length-guarded; returns null on any short/unrecognized
// buffer so the caller can simply omit width/height.
export const webpDimensions = (
  buf: Buffer,
): { width: number; height: number } | null => {
  // Need at least the RIFF header (0-3 "RIFF", 8-11 "WEBP", 12-15 fourCC).
  if (buf.length < 16) {
    return null
  }

  if (
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null
  }

  const fourCC = buf.toString("ascii", 12, 16)

  // VP8 (lossy): 14-bit width @ 26, 14-bit height @ 28.
  if (fourCC === "VP8 ") {
    if (buf.length < 30) {
      return null
    }

    const width = buf.readUInt16LE(26) & 0x3fff
    const height = buf.readUInt16LE(28) & 0x3fff

    return { width, height }
  }

  // VP8L (lossless): 14-bit width and height packed into a 32-bit LE word @ 21.
  if (fourCC === "VP8L") {
    if (buf.length < 25) {
      return null
    }

    const bits = buf.readUInt32LE(21)
    const width = (bits & 0x3fff) + 1
    const height = ((bits >> 14) & 0x3fff) + 1

    return { width, height }
  }

  // VP8X (extended/alpha): 24-bit LE canvas size minus one @ 24 (w) and 27 (h).
  if (fourCC === "VP8X") {
    if (buf.length < 30) {
      return null
    }

    const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1
    const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1

    return { width, height }
  }

  return null
}
