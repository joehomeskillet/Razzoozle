// Tests for services/ai-provider.ts — the standardized AI text-generation
// interface. global.fetch is mocked so no real network op runs; getAISettings
// (provider config) and getKey (secret lookup) are mocked so each test can pin
// the active provider + key state. We assert transport routing (chat/completions
// vs /messages), the key policy (off → notConfigured, remote-no-key → noKey),
// and that generateQuestion validates its output (invalidOutput on bad JSON).

import type { AISettings } from "@razzia/common/types/ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mutable holders the mocked modules read from, set per test.
let activeSettings: AISettings
const keyStore = new Map<string, string>()

vi.mock("@razzia/socket/services/config", () => ({
  getAISettings: () => activeSettings,
}))

vi.mock("@razzia/socket/services/ai-secrets", () => ({
  getKey: (id: string) => keyStore.get(id),
}))

type AIProviderModule = typeof import("@razzia/socket/services/ai-provider")
let ai: AIProviderModule

// vi.mock factories survive vi.resetModules(); re-import the SUT so it binds to
// the mocked deps fresh per test.
const loadAi = async (): Promise<void> => {
  vi.resetModules()
  ai = await import("@razzia/socket/services/ai-provider")
}

// Provider seeds.
const localProvider = {
  id: "local",
  label: "Lokal (Ollama)",
  kind: "openai-compatible" as const,
  baseUrl: "http://host.docker.internal:11434/v1",
  model: "llama3.2:3b",
}
const openaiProvider = {
  id: "openai",
  label: "OpenAI",
  kind: "openai-compatible" as const,
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
}
const claudeProvider = {
  id: "claude",
  label: "Claude",
  kind: "anthropic" as const,
  model: "claude-haiku-4-5-20251001",
}

const settingsWith = (
  activeProvider: string,
  providers = [localProvider, openaiProvider, claudeProvider],
): AISettings => ({
  text: { activeProvider, providers },
  image: {
    activeProvider: "comfyui",
    providers: [{ id: "comfyui", label: "ComfyUI / Z-Image" }],
  },
})

// Build a fake fetch Response.
const jsonResponse = (body: unknown, ok = true): Response =>
  ({
    ok,
    json: async () => body,
  }) as unknown as Response

// OpenAI-compatible chat/completions reply.
const openAIReply = (content: string) => ({
  choices: [{ message: { content } }],
})
// Anthropic messages reply.
const anthropicReply = (text: string) => ({ content: [{ text }] })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  keyStore.clear()
  activeSettings = settingsWith("off")
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  await loadAi()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── generateText routing + key policy ────────────────────────────────────────

describe("generateText routing", () => {
  it("routes an openai-compatible provider to /chat/completions", async () => {
    activeSettings = settingsWith("local")
    fetchMock.mockResolvedValueOnce(jsonResponse(openAIReply("pong")))

    const out = await ai.generateText({ prompt: "ping", maxTokens: 5 })

    expect(out).toBe("pong")
    expect(fetchMock).toHaveBeenCalledOnce()
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toBe("http://host.docker.internal:11434/v1/chat/completions")
  })

  it("routes an anthropic provider to /messages with the right headers", async () => {
    activeSettings = settingsWith("claude")
    keyStore.set("claude", "sk-ant-test-key")
    fetchMock.mockResolvedValueOnce(jsonResponse(anthropicReply("pong")))

    const out = await ai.generateText({ prompt: "ping", maxTokens: 5 })

    expect(out).toBe("pong")
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.anthropic.com/v1/messages")
    const headers = init.headers as Record<string, string>
    expect(headers["x-api-key"]).toBe("sk-ant-test-key")
    expect(headers["anthropic-version"]).toBe("2023-06-01")
  })

  it("sends Authorization Bearer for a keyed openai-compatible provider", async () => {
    activeSettings = settingsWith("openai")
    keyStore.set("openai", "sk-openai-test")
    fetchMock.mockResolvedValueOnce(jsonResponse(openAIReply("pong")))

    await ai.generateText({ prompt: "ping" })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer sk-openai-test")
  })

  it('"off" → throws notConfigured and never calls fetch', async () => {
    activeSettings = settingsWith("off")

    await expect(ai.generateText({ prompt: "ping" })).rejects.toThrow(
      "errors:ai.notConfigured",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("active provider id not in the list → notConfigured", async () => {
    activeSettings = settingsWith("ghost")

    await expect(ai.generateText({ prompt: "ping" })).rejects.toThrow(
      "errors:ai.notConfigured",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("remote openai-compatible with NO key → noKey, no fetch", async () => {
    activeSettings = settingsWith("openai") // api.openai.com, not local
    // no key set

    await expect(ai.generateText({ prompt: "ping" })).rejects.toThrow(
      "errors:ai.noKey",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("LOCAL openai-compatible with NO key → allowed (keyless Ollama)", async () => {
    activeSettings = settingsWith("local")
    fetchMock.mockResolvedValueOnce(jsonResponse(openAIReply("pong")))

    const out = await ai.generateText({ prompt: "ping" })
    expect(out).toBe("pong")
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it("anthropic with NO key → noKey, no fetch", async () => {
    activeSettings = settingsWith("claude")

    await expect(ai.generateText({ prompt: "ping" })).rejects.toThrow(
      "errors:ai.noKey",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("non-2xx provider response → providerError", async () => {
    activeSettings = settingsWith("local")
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false))

    await expect(ai.generateText({ prompt: "ping" })).rejects.toThrow(
      "errors:ai.providerError",
    )
  })

  it("secret-shaped model output → invalidOutput", async () => {
    activeSettings = settingsWith("local")
    fetchMock.mockResolvedValueOnce(
      jsonResponse(openAIReply("here is a key sk-LEAKED12345")),
    )

    await expect(ai.generateText({ prompt: "ping" })).rejects.toThrow(
      "errors:ai.invalidOutput",
    )
  })
})

// ── generateQuestion validation ──────────────────────────────────────────────

describe("generateQuestion", () => {
  beforeEach(() => {
    activeSettings = settingsWith("local")
  })

  it("maps a well-formed choice model JSON to a questionValidator-valid object", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        openAIReply(
          JSON.stringify({
            question: "What is the capital of France?",
            answers: ["Paris", "London", "Berlin", "Madrid"],
            correctIndex: 0,
          }),
        ),
      ),
    )

    const q = await ai.generateQuestion("France", "choice", "de")

    expect(q.question).toBe("What is the capital of France?")
    expect(q.answers).toEqual(["Paris", "London", "Berlin", "Madrid"])
    expect(q.solutions).toEqual([0])
    // Defaults applied.
    expect(q.time).toBe(20)
    expect(q.cooldown).toBe(5)
  })

  it("maps a boolean question (localized answers + solution index)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        openAIReply(
          JSON.stringify({ question: "Is the sky blue?", answer: true }),
        ),
      ),
    )

    const q = await ai.generateQuestion("sky", "boolean", "de")
    expect(q.type).toBe("boolean")
    expect(q.answers).toEqual(["Richtig", "Falsch"])
    expect(q.solutions).toEqual([0])
  })

  it("maps a type-answer question (acceptedAnswers + matchMode)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        openAIReply(
          JSON.stringify({
            question: "Name a primary color.",
            acceptedAnswers: ["red", "blue", "yellow"],
          }),
        ),
      ),
    )

    const q = await ai.generateQuestion("colors", "type-answer", "de")
    expect(q.type).toBe("type-answer")
    expect(q.acceptedAnswers).toEqual(["red", "blue", "yellow"])
    expect(q.matchMode).toBe("normalized")
  })

  it("strips a ```json fence before parsing", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        openAIReply(
          '```json\n' +
            JSON.stringify({
              question: "What is 2+2?",
              answers: ["3", "4", "5", "6"],
              correctIndex: 1,
            }) +
            '\n```',
        ),
      ),
    )

    const q = await ai.generateQuestion("math", "choice", "de")
    expect(q.question).toBe("What is 2+2?")
    expect(q.solutions).toEqual([1])
  })

  it("throws invalidOutput on malformed (non-JSON) model output", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(openAIReply("not json at all, sorry")),
    )

    await expect(
      ai.generateQuestion("anything", "choice", "de"),
    ).rejects.toThrow("errors:ai.invalidOutput")
  })

  it("throws invalidOutput when the mapped question fails the validator (too few answers)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        openAIReply(
          JSON.stringify({
            question: "Bad question",
            answers: ["only one"],
            correctIndex: 0,
          }),
        ),
      ),
    )

    await expect(
      ai.generateQuestion("anything", "choice", "de"),
    ).rejects.toThrow("errors:ai.invalidOutput")
  })
})

// ── generateDistractors ──────────────────────────────────────────────────────

describe("generateDistractors", () => {
  beforeEach(() => {
    activeSettings = settingsWith("local")
  })

  it("returns up to `count` wrong answers, excluding the correct one", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        openAIReply(
          JSON.stringify({ distractors: ["London", "Berlin", "Paris"] }),
        ),
      ),
    )

    const out = await ai.generateDistractors(
      "Capital of France?",
      "Paris",
      3,
      "de",
    )
    // "Paris" (the correct answer) is filtered out.
    expect(out).toEqual(["London", "Berlin"])
  })

  it("throws invalidOutput when the model returns no usable distractors", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(openAIReply(JSON.stringify({ distractors: [] }))),
    )

    await expect(
      ai.generateDistractors("Q?", "answer", 3, "de"),
    ).rejects.toThrow("errors:ai.invalidOutput")
  })
})
