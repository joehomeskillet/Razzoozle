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
