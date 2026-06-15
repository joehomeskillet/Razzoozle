// AI image generation via the local ComfyUI instance — a direct port of
// packages/socket/src/services/comfyui.ts (+ webp.ts) so the MCP server produces
// byte-identical /media/gen-*.webp assets. Load the workflow template, set node
// 6's prompt, randomize node 3's seed, POST /prompt, poll /history for node 9's
// SaveImage output, fetch the PNG over HTTP from /view, transcode to WebP via
// cwebp, and persist into config/media. Server-controlled paths only (env
// overrides with safe defaults); the prompt is the sole input.
import { spawn } from "node:child_process"
import fs from "node:fs"
import { saveGeneratedImageBytes } from "./config-store.js"
import { v4 as uuidv4 } from "uuid"

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188"
const COMFYUI_WORKFLOW =
  process.env.COMFYUI_WORKFLOW ??
  "./workflows/txt2img-zimage-turbo.json"

// Node ids in the workflow graph (see txt2img-zimage-turbo.json).
const PROMPT_NODE = "6" // CLIPTextEncode (positive) — .inputs.text is the prompt
const SAMPLER_NODE = "3" // KSampler — randomize .inputs.seed for variety
const SAVE_NODE = "9" // SaveImage — history output carries images[0].filename

const POLL_INTERVAL_MS = 1000
// ComfyUI may cold-load the Z-Image model (~30-40s) before the ~8-step render;
// ceiling generously so a legit slow render isn't reported as a timeout.
const POLL_TIMEOUT_MS = 180_000
const PROMPT_MAX_LEN = 300

// Reject prompts that look like leaked secrets (best-effort), mirroring the
// socket GENERATE_IMAGE handler's guard.
const SECRET_PATTERNS = [/sk-/iu, /AKIA/u, /BEGIN PRIVATE KEY/iu]

interface QueueResponse {
  prompt_id: string
}

interface HistoryImage {
  filename: string
  subfolder?: string
  type?: string
}

interface HistoryEntry {
  outputs?: Record<string, { images?: HistoryImage[] }>
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms))

// Transcode image bytes to WebP via cwebp (stdin -> stdout), q82. Port of
// @razzoozle/socket/services/webp.ts.
const toWebp = (input: Buffer): Promise<Buffer> =>
  new Promise((resolvePromise, reject) => {
    const proc = spawn("cwebp", ["-quiet", "-q", "82", "-o", "-", "--", "-"])
    const chunks: Buffer[] = []
    proc.stdout.on("data", (c: Buffer) => chunks.push(c))
    proc.on("error", reject)
    proc.on("close", (code) =>
      code === 0
        ? resolvePromise(Buffer.concat(chunks))
        : reject(new Error("cwebp failed (is it installed?)")),
    )
    proc.stdin.on("error", () => {})
    proc.stdin.write(input)
    proc.stdin.end()
  })

// Generate an image for `prompt`, returning its public "/media/gen-<id>.webp"
// URL (attach this as a question's `media.url`). Throws a human-readable error
// on invalid prompt / timeout / failure.
export const generateImage = async (prompt: string): Promise<string> => {
  if (typeof prompt !== "string" || prompt.length < 1) {
    throw new Error("prompt must be a non-empty string")
  }

  if (prompt.length > PROMPT_MAX_LEN) {
    throw new Error(`prompt too long (max ${PROMPT_MAX_LEN} chars)`)
  }

  if (SECRET_PATTERNS.some((re) => re.test(prompt))) {
    throw new Error("prompt rejected (looks like a secret)")
  }

  let workflow: Record<string, { inputs?: Record<string, unknown> }>

  try {
    // Deep-clone via JSON round-trip so the on-disk template is never mutated.
    workflow = JSON.parse(fs.readFileSync(COMFYUI_WORKFLOW, "utf-8"))
  } catch {
    throw new Error(`could not read ComfyUI workflow at ${COMFYUI_WORKFLOW}`)
  }

  const promptNode = workflow[PROMPT_NODE]

  if (!promptNode?.inputs) {
    throw new Error("ComfyUI workflow missing prompt node 6")
  }

  promptNode.inputs.text = prompt

  const samplerNode = workflow[SAMPLER_NODE]

  if (samplerNode?.inputs) {
    samplerNode.inputs.seed = Math.floor(Math.random() * 1_000_000_000)
  }

  let promptId: string

  try {
    const res = await fetch(`${COMFYUI_URL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    })

    if (!res.ok) {
      throw new Error(`ComfyUI /prompt returned ${res.status}`)
    }

    const data = (await res.json()) as QueueResponse
    promptId = data.prompt_id

    if (!promptId) {
      throw new Error("ComfyUI /prompt returned no prompt_id")
    }
  } catch (error) {
    throw new Error(
      `ComfyUI queue failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    try {
      const res = await fetch(`${COMFYUI_URL}/history/${promptId}`)

      if (!res.ok) {
        continue
      }

      const history = (await res.json()) as Record<string, HistoryEntry>
      const img = history[promptId]?.outputs?.[SAVE_NODE]?.images?.[0]

      if (img?.filename) {
        const params = new URLSearchParams({
          filename: img.filename,
          subfolder: img.subfolder ?? "",
          type: img.type ?? "output",
        })
        const viewRes = await fetch(`${COMFYUI_URL}/view?${params.toString()}`)

        if (!viewRes.ok) {
          throw new Error(`ComfyUI /view returned ${viewRes.status}`)
        }

        const buffer = Buffer.from(await viewRes.arrayBuffer())
        const webp = await toWebp(buffer)
        const stem = uuidv4().replace(/-/gu, "").slice(0, 8)

        return saveGeneratedImageBytes(webp, `gen-${stem}.webp`)
      }
    } catch {
      // Transient fetch/parse error — keep polling until the deadline.
      continue
    }
  }

  throw new Error("ComfyUI image generation timed out")
}
