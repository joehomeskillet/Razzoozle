// AI image generation via a local ComfyUI instance. Server-controlled paths
// only (env overrides with safe defaults) — the prompt is the sole user input
// and is validated/throttled by the GENERATE_IMAGE handler before it reaches
// here. The generated PNG bytes are fetched over HTTP from ComfyUI's /view
// endpoint and persisted into config/media via saveGeneratedImageBytes, then
// served by nginx from the config volume at /media/<file> (mirrors /theme/).
import { saveGeneratedImageBytes } from "@razzia/socket/services/config"
import { toWebp } from "@razzia/socket/services/webp"
import fs from "fs"
import { nanoid } from "nanoid"

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188"
const COMFYUI_WORKFLOW =
  process.env.COMFYUI_WORKFLOW ??
  "/nvmetank1/AI/comfyui/workflows/txt2img-zimage-turbo.json"

// img2img (Z-Image Omni reference-conditioning) blueprint. Bundled into the
// image (see Dockerfile) so the socket has no host-filesystem dependency; the
// host path is only a dev fallback.
const COMFYUI_IMG2IMG_WORKFLOW =
  process.env.COMFYUI_IMG2IMG_WORKFLOW ??
  "/nvmetank1/AI/comfyui/workflows/sketch2img-zimage-turbo.json"

// Node ids in the txt2img workflow graph (see txt2img-zimage-turbo.json).
const PROMPT_NODE = "6" // CLIPTextEncode (positive) — its .inputs.text is the prompt
const SAMPLER_NODE = "3" // KSampler — randomize .inputs.seed for variety
const SAVE_NODE = "9" // SaveImage — its history output carries images[0].filename

// Node ids in the img2img workflow graph (see comfy-img2img-workflow.json).
// NOTE: distinct from the txt2img ids above — node 6 here is TextEncodeZImageOmni
// whose prompt field is `.inputs.prompt` (NOT `.inputs.text` like the txt2img
// CLIPTextEncode). A shared generic hardcoding `.inputs.text` would silently
// fail to set the img2img prompt — keep these as separate constants.
const IMG2IMG_PROMPT_NODE = "6" // TextEncodeZImageOmni — set .inputs.prompt
const IMG2IMG_LOADIMAGE_NODE = "12" // LoadImage — set .inputs.image = uploaded name
const IMG2IMG_SAMPLER_NODE = "3" // KSampler — randomize .inputs.seed; keep denoise 1.0
const IMG2IMG_SAVE_NODE = "9" // SaveImage — history output carries images[0].filename

const POLL_INTERVAL_MS = 1000
// ComfyUI reloads the Z-Image model into VRAM on a cold run (~30-40s observed)
// before the ~8-step render; with any queue ahead a single gen can exceed a
// minute. Ceiling generously so a legit slow render isn't reported as a timeout.
const POLL_TIMEOUT_MS = 180_000

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
  status?: { status_str?: string; completed?: boolean }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Queue a prepared workflow on ComfyUI and block until the SaveImage node at
// `saveNode` reports an output file, then fetch its bytes over HTTP, transcode
// to WebP and persist as gen-<id>.webp → public "/media/generated/<file>" URL.
// Shared by both generateImage (txt2img) and generateImageFromBase (img2img) —
// the only difference between the two paths is how the workflow is prepared.
// Throws an `errors:submission.*` message on timeout/failure so the handler can
// surface a safe, i18n-keyed error to the client.
const queueAndCollect = async (
  workflow: Record<string, { inputs?: Record<string, unknown> }>,
  saveNode: string,
): Promise<string> => {
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
  // (or we time out). ~1 s interval, 180 s ceiling.
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    let entry: HistoryEntry | undefined

    try {
      const res = await fetch(`${COMFYUI_URL}/history/${promptId}`)

      if (!res.ok) {
        continue
      }

      const history = (await res.json()) as Record<string, HistoryEntry>
      entry = history[promptId]
    } catch {
      // Transient fetch/parse error — keep polling until the deadline.
      continue
    }

    // A node failed mid-execution (e.g. LoadImage on a corrupt/undecodable base
    // image, the img2img-specific failure mode): ComfyUI records status_str
    // "error" with no outputs. Bail fast instead of polling the full ~180 s
    // ceiling — that hang would hold the handler open and waste the GPU credit
    // the caller already consumed.
    if (entry?.status?.status_str === "error") {
      throw new Error("errors:submission.imageGenFailed")
    }

    const img = entry?.outputs?.[saveNode]?.images?.[0]

    if (!img?.filename) {
      continue
    }

    try {
      // Fetch the generated PNG bytes over HTTP (the socket runs in a container
      // that can't read ComfyUI's output dir), then persist them into
      // config/media and return the public URL.
      const params = new URLSearchParams({
        filename: img.filename,
        subfolder: img.subfolder ?? "",
        type: img.type ?? "output",
      })
      const viewRes = await fetch(`${COMFYUI_URL}/view?${params.toString()}`)

      if (!viewRes.ok) {
        throw new Error("errors:submission.imageGenFailed")
      }

      const buffer = Buffer.from(await viewRes.arrayBuffer())
      const webp = await toWebp(buffer)

      return saveGeneratedImageBytes(webp, `gen-${nanoid(8)}.webp`)
    } catch {
      // Transient fetch/parse error after the image was ready — keep polling.
      continue
    }
  }

  throw new Error("errors:submission.imageGenTimeout")
}

// Generate an image for `prompt`, returning its public "/media/generated/<id>.webp"
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

  return queueAndCollect(workflow, SAVE_NODE)
}

// img2img: re-generate from a base image conditioned on `prompt` (Z-Image Omni
// reference-conditioning — the base is VAE-encoded into reference_latents on the
// positive conditioning; KSampler.denoise STAYS 1.0, identity preservation comes
// from the Omni node, NOT a low-denoise init — do NOT change denoise). Returns
// the public "/media/generated/<id>.webp" URL. The base bytes are resolved
// server-side (NOT supplied by the client) by the EDIT_IMAGE handler and passed
// in here as a WebP buffer.
//
// Transport (the container cannot write ComfyUI's input dir): POST the base
// bytes to ComfyUI's HTTP /upload/image, then point LoadImage at the name the
// endpoint RETURNS (never the name we sent — the endpoint may dedup-rename).
// Throws an `errors:submission.*` message on failure so the handler can surface
// a safe, i18n-keyed error.
export const generateImageFromBase = async (
  baseBytes: Buffer,
  prompt: string,
): Promise<string> => {
  let workflow: Record<string, { inputs?: Record<string, unknown> }>

  try {
    const raw = fs.readFileSync(COMFYUI_IMG2IMG_WORKFLOW, "utf-8")
    // Deep-clone via JSON round-trip so the on-disk template is never mutated.
    workflow = JSON.parse(raw)
  } catch {
    throw new Error("errors:submission.imageGenFailed")
  }

  const promptNode = workflow[IMG2IMG_PROMPT_NODE]
  const loadImageNode = workflow[IMG2IMG_LOADIMAGE_NODE]

  if (!promptNode?.inputs || !loadImageNode?.inputs) {
    throw new Error("errors:submission.imageGenFailed")
  }

  // Upload the base image to ComfyUI's input dir over HTTP. Use a unique
  // server-generated filename so a dedup-rename can't surprise us, but ALWAYS
  // use the `name` the endpoint returns when wiring LoadImage.
  let uploadedName: string

  try {
    const form = new FormData()
    const blob = new Blob([new Uint8Array(baseBytes)], { type: "image/webp" })
    form.append("image", blob, `edit-${nanoid(8)}.webp`)
    form.append("overwrite", "true")

    const uploadRes = await fetch(`${COMFYUI_URL}/upload/image`, {
      method: "POST",
      body: form,
    })

    if (!uploadRes.ok) {
      throw new Error("errors:submission.imageGenFailed")
    }

    const uploaded = (await uploadRes.json()) as { name?: string }

    if (!uploaded.name) {
      throw new Error("errors:submission.imageGenFailed")
    }

    uploadedName = uploaded.name
  } catch {
    throw new Error("errors:submission.imageGenFailed")
  }

  // TextEncodeZImageOmni positive prompt — NOTE `.inputs.prompt`, NOT `.text`.
  promptNode.inputs.prompt = prompt
  // LoadImage points at the endpoint-RETURNED name (never the sent name).
  loadImageNode.inputs.image = uploadedName

  // Randomize the seed so a repeated edit doesn't return an identical image.
  const samplerNode = workflow[IMG2IMG_SAMPLER_NODE]

  if (samplerNode?.inputs) {
    samplerNode.inputs.seed = Math.floor(Math.random() * 1_000_000_000)
  }

  return queueAndCollect(workflow, IMG2IMG_SAVE_NODE)
}
