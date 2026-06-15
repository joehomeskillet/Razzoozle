// WP-10 — tests that generateImage (txt2img) threads the active image provider's
// configured `resolution` onto the EmptyLatentImage node ("5") width/height, and
// falls back to IMAGE_RESOLUTION_DEFAULT when unset. fs (workflow read), config
// (getAISettings + saveGeneratedImageBytes) and webp (toWebp) are mocked so no
// disk/network/GPU op runs; global.fetch is mocked to drive the queue→history→view
// happy path. We assert ONLY the latent-node dims threaded into the queued
// workflow (the rest of the queueAndCollect path is exercised elsewhere).

import {
  IMAGE_RESOLUTION_DEFAULT,
  type ImageResolution,
} from "@razzia/common/constants"
import type { AISettings } from "@razzia/common/types/ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mutable holder the mocked config reads from, set per test.
let activeSettings: AISettings

vi.mock("@razzia/socket/services/config", () => ({
  getAISettings: () => activeSettings,
  // queueAndCollect persists via this; return a stable public URL.
  saveGeneratedImageBytes: () => "/media/generated/gen-test.webp",
}))

vi.mock("@razzia/socket/services/webp", () => ({
  toWebp: async (b: Buffer) => b,
}))

// A representative txt2img workflow with the nodes generateImage touches.
const workflowJson = JSON.stringify({
  "3": { class_type: "KSampler", inputs: { seed: 0, denoise: 1.0 } },
  "5": {
    class_type: "EmptyLatentImage",
    inputs: { width: 1024, height: 1024, batch_size: 1 },
  },
  "6": { class_type: "CLIPTextEncode", inputs: { text: "" } },
  "9": { class_type: "SaveImage", inputs: {} },
})

vi.mock("fs", () => ({
  default: { readFileSync: () => workflowJson },
  readFileSync: () => workflowJson,
}))

type ComfyModule = typeof import("@razzia/socket/services/comfyui")
let comfy: ComfyModule

const loadComfy = async (): Promise<void> => {
  vi.resetModules()
  comfy = await import("@razzia/socket/services/comfyui")
}

const settingsWith = (resolution?: ImageResolution): AISettings => ({
  text: { activeProvider: "off", providers: [] },
  image: {
    activeProvider: "comfyui",
    providers: [
      {
        id: "comfyui",
        label: "ComfyUI / Z-Image",
        ...(resolution !== undefined ? { resolution } : {}),
      },
    ],
  },
})

const jsonResponse = (body: unknown, ok = true): Response =>
  ({
    ok,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(8),
  }) as unknown as Response

let fetchMock: ReturnType<typeof vi.fn>

// Drive a full happy path: POST /prompt → poll /history (ready) → GET /view.
const mockHappyPath = (): void => {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/prompt")) {
      return Promise.resolve(jsonResponse({ prompt_id: "pid-1" }))
    }
    if (url.includes("/history/")) {
      return Promise.resolve(
        jsonResponse({
          "pid-1": {
            status: { status_str: "success", completed: true },
            outputs: { "9": { images: [{ filename: "out.png" }] } },
          },
        }),
      )
    }
    // /view
    return Promise.resolve(jsonResponse({}))
  })
}

// Read node "5" dims off the workflow POSTed to /prompt.
const queuedLatentDims = (): { width: unknown; height: unknown } => {
  const promptCall = fetchMock.mock.calls.find((c) =>
    (c[0] as string).endsWith("/prompt"),
  )!
  const body = JSON.parse((promptCall[1] as RequestInit).body as string) as {
    prompt: Record<string, { inputs?: Record<string, unknown> }>
  }
  const inputs = body.prompt["5"]?.inputs ?? {}
  return { width: inputs.width, height: inputs.height }
}

beforeEach(async () => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  await loadComfy()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("generateImage resolution (WP-10)", () => {
  it("threads the configured provider resolution onto latent node 5", async () => {
    activeSettings = settingsWith(512)
    mockHappyPath()

    const p = comfy.generateImage("a cat")
    await vi.runAllTimersAsync()
    await p

    expect(queuedLatentDims()).toEqual({ width: 512, height: 512 })
  })

  it("defaults to IMAGE_RESOLUTION_DEFAULT when resolution is unset", async () => {
    activeSettings = settingsWith() // no resolution on the provider
    mockHappyPath()

    const p = comfy.generateImage("a dog")
    await vi.runAllTimersAsync()
    await p

    expect(queuedLatentDims()).toEqual({
      width: IMAGE_RESOLUTION_DEFAULT,
      height: IMAGE_RESOLUTION_DEFAULT,
    })
  })
})
