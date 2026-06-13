// AI image generation via a local ComfyUI instance. Server-controlled paths
// only (env overrides with safe defaults) — the prompt is the sole user input
// and is validated/throttled by the GENERATE_IMAGE handler before it reaches
// here. Output is copied into config/media via saveGeneratedImage and served by
// nginx from the config volume at /media/<file> (mirrors the /theme/ alias).
import { saveGeneratedImage } from "@razzia/socket/services/config"
import fs from "fs"
import { nanoid } from "nanoid"

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188"
const COMFYUI_WORKFLOW =
  process.env.COMFYUI_WORKFLOW ??
  "/nvmetank1/AI/comfyui/workflows/txt2img-zimage-turbo.json"

// Node ids in the workflow graph (see txt2img-zimage-turbo.json).
const PROMPT_NODE = "6" // CLIPTextEncode (positive) — its .inputs.text is the prompt
const SAMPLER_NODE = "3" // KSampler — randomize .inputs.seed for variety
const SAVE_NODE = "9" // SaveImage — its history output carries images[0].filename

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 60_000

interface QueueResponse {
  prompt_id: string
}

interface HistoryImage {
  filename: string
}

interface HistoryEntry {
  outputs?: Record<string, { images?: HistoryImage[] }>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Generate an image for `prompt`, returning its public "/media/gen-<id>.png"
// URL. Throws an `errors:submission.*` message on timeout/failure so the
// handler can surface a safe, i18n-keyed error to the client.
export const generateImage = async (prompt: string): Promise<string> => {
  let workflow: Record<string, { inputs?: Record<string, unknown> }>

  try {
    const raw = fs.readFileSync(COMFYUI_WORKFLOW, "utf-8")
    // Deep-clone via JSON round-trip so the on-disk template is never mutated.
    workflow = JSON.parse(raw)
  } catch {
    throw new Error("errors:submission.imageGenFailed")
  }

  const promptNode = workflow[PROMPT_NODE]

  if (!promptNode?.inputs) {
    throw new Error("errors:submission.imageGenFailed")
  }

  promptNode.inputs.text = prompt

  // Randomize the seed so repeated prompts don't return an identical image.
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
      throw new Error("errors:submission.imageGenFailed")
    }

    const data = (await res.json()) as QueueResponse
    promptId = data.prompt_id

    if (!promptId) {
      throw new Error("errors:submission.imageGenFailed")
    }
  } catch {
    throw new Error("errors:submission.imageGenFailed")
  }

  // Poll the history endpoint until the SaveImage node reports an output file
  // (or we time out). ~1 s interval, 60 s ceiling.
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    try {
      const res = await fetch(`${COMFYUI_URL}/history/${promptId}`)

      if (!res.ok) {
        continue
      }

      const history = (await res.json()) as Record<string, HistoryEntry>
      const entry = history[promptId]
      const filename = entry?.outputs?.[SAVE_NODE]?.images?.[0]?.filename

      if (filename) {
        // Copy the generated PNG into config/media and return its public URL.
        return saveGeneratedImage(filename, `gen-${nanoid(8)}.png`)
      }
    } catch {
      // Transient fetch/parse error — keep polling until the deadline.
      continue
    }
  }

  throw new Error("errors:submission.imageGenTimeout")
}
