// Standardized AI text-generation interface. Two transport shapes cover every
// supported backend (see AI_PROVIDER_KINDS in @razzia/common/constants):
//   - "openai-compatible": local Ollama/LM Studio, OpenAI, OpenRouter, ...
//     (POST {baseUrl}/chat/completions)
//   - "anthropic": Claude (POST {ANTHROPIC_BASE_URL}/messages)
//
// SECURITY: the API key is fetched from ai-secrets ONLY at call time, attached
// to the outbound request header, and never returned, emitted or logged. Every
// model-produced string is secret-scanned (same patterns as the image handler)
// before it leaves this module — a model that echoes a key-shaped string is
// rejected as invalid output rather than surfaced to the client.
import { AI, AI_PROVIDER_OFF } from "@razzia/common/constants"
import type {
  AIProviderConfig,
  AISettings,
} from "@razzia/common/types/ai"
import type { Question, Quizz } from "@razzia/common/types/game"
import {
  questionValidator,
  quizzValidator,
} from "@razzia/common/validators/quizz"
import { getKey } from "@razzia/socket/services/ai-secrets"
import { getAISettings } from "@razzia/socket/services/config"

// Best-effort leaked-secret guard, identical to the set used in handlers/manager.ts
// for image prompts. Applied to every model-produced string.
const SECRET_PATTERNS = [/sk-/i, /AKIA/, /BEGIN PRIVATE KEY/i]

const REQUEST_TIMEOUT_MS = 60_000

const containsSecret = (s: string): boolean =>
  SECRET_PATTERNS.some((re) => re.test(s))

const assertNoSecret = (s: string): void => {
  if (containsSecret(s)) {
    throw new Error("errors:ai.invalidOutput")
  }
}

// "openai-compatible" providers may run locally (Ollama/LM Studio) where no API
// key is required. Only these hosts are treated as keyless.
const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "host.docker.internal",
])

const isLocalBaseUrl = (baseUrl: string | undefined): boolean => {
  if (!baseUrl) {
    return false
  }

  try {
    return LOCAL_HOSTS.has(new URL(baseUrl).hostname)
  } catch {
    return false
  }
}

interface GenerateTextOptions {
  system?: string
  prompt: string
  json?: boolean
  maxTokens?: number
}

interface OpenAIMessage {
  role: "system" | "user"
  content: string
}

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const callOpenAICompatible = async (
  provider: AIProviderConfig,
  key: string | undefined,
  messages: OpenAIMessage[],
  json: boolean,
): Promise<string> => {
  const baseUrl = provider.baseUrl

  if (!baseUrl) {
    throw new Error("errors:ai.notConfigured")
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  }

  if (key) {
    headers.Authorization = `Bearer ${key}`
  }

  // OpenRouter attribution headers (harmless on other providers).
  headers["HTTP-Referer"] = "https://rahoot.local"
  headers["X-Title"] = "Rahoot"

  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.7,
      response_format: json ? { type: "json_object" } : undefined,
    }),
  })

  if (!res.ok) {
    throw new Error("errors:ai.providerError")
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content

  if (typeof content !== "string") {
    throw new Error("errors:ai.providerError")
  }

  return content
}

const callAnthropic = async (
  provider: AIProviderConfig,
  key: string,
  system: string | undefined,
  prompt: string,
  json: boolean,
  maxTokens: number | undefined,
): Promise<string> => {
  const res = await fetchWithTimeout(`${AI.ANTHROPIC_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": AI.ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: maxTokens ?? 1024,
      system,
      messages: [
        {
          role: "user",
          content: json
            ? `${prompt}\n\nRespond ONLY with valid JSON.`
            : prompt,
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error("errors:ai.providerError")
  }

  const data = (await res.json()) as {
    content?: Array<{ text?: string }>
  }
  const text = data.content?.[0]?.text

  if (typeof text !== "string") {
    throw new Error("errors:ai.providerError")
  }

  return text
}

// Resolve the active text provider from settings (throwing if none/off), then
// dispatch to the right transport adapter. Returns the raw model string, which
// is secret-scanned before being returned to any caller.
export const generateText = async ({
  system,
  prompt,
  json,
  maxTokens,
}: GenerateTextOptions): Promise<string> => {
  const settings: AISettings = getAISettings()
  const activeId = settings.text.activeProvider

  if (activeId === AI_PROVIDER_OFF) {
    throw new Error("errors:ai.notConfigured")
  }

  const provider = settings.text.providers.find((p) => p.id === activeId)

  if (!provider) {
    throw new Error("errors:ai.notConfigured")
  }

  const key = getKey(provider.id)

  let raw: string

  if (provider.kind === "anthropic") {
    // Anthropic ALWAYS requires a key.
    if (!key) {
      throw new Error("errors:ai.noKey")
    }

    raw = await callAnthropic(
      provider,
      key,
      system,
      prompt,
      !!json,
      maxTokens,
    )
  } else {
    // openai-compatible: a key is required UNLESS the baseUrl is a local host
    // (local Ollama / LM Studio needs none).
    if (!key && !isLocalBaseUrl(provider.baseUrl)) {
      throw new Error("errors:ai.noKey")
    }

    const messages: OpenAIMessage[] = []

    if (system) {
      messages.push({ role: "system", content: system })
    }

    messages.push({
      role: "user",
      content: json
        ? `${prompt}\n\nRespond ONLY with valid JSON.`
        : prompt,
    })

    raw = await callOpenAICompatible(provider, key, messages, !!json)
  }

  assertNoSecret(raw)

  return raw
}

// Strip a ```json ... ``` (or bare ```) fence some models wrap JSON in, so
// JSON.parse succeeds on otherwise-valid output.
const stripCodeFence = (s: string): string => {
  const trimmed = s.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed)

  return fence ? fence[1].trim() : trimmed
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(stripCodeFence(raw))
  } catch {
    throw new Error("errors:ai.invalidOutput")
  }
}

// ---- High-level generation helpers ----------------------------------------
// Each returns a VALIDATED object. On JSON.parse OR validator failure they throw
// "errors:ai.invalidOutput". Every produced string is secret-scanned.

export const generateQuestion = async (
  topic: string,
  type: "choice" | "boolean" | "multiple-select" | "type-answer" = "choice",
  language = "de",
): Promise<Question> => {
  const system =
    "You are a quiz author. Produce a single high-quality quiz question. " +
    "Output strict JSON only, no prose."

  const shapeHint =
    type === "choice"
      ? 'JSON shape: {"question": string, "answers": [4 strings], "correctIndex": number 0-3}.'
      : type === "boolean"
        ? 'JSON shape: {"question": string, "answer": boolean} where answer is true if the statement is correct.'
        : type === "multiple-select"
          ? 'JSON shape: {"question": string, "answers": [2-4 strings], "correctIndexes": [>=2 distinct indices]}.'
          : 'JSON shape: {"question": string, "acceptedAnswers": [1-5 short accepted strings]}.'

  const prompt =
    `Write ONE quiz question of kind "${type}" about: "${topic}". ` +
    `Language: ${language}. ${shapeHint}`

  const raw = await generateText({ system, prompt, json: true, maxTokens: 800 })
  const parsed = parseJson(raw) as Record<string, unknown>

  const built: Record<string, unknown> = {
    question: parsed.question,
    time: 20,
    cooldown: 5,
  }

  if (type === "choice") {
    const answers = Array.isArray(parsed.answers)
      ? (parsed.answers as unknown[]).map((a) => String(a)).slice(0, 4)
      : []
    const idx =
      typeof parsed.correctIndex === "number" ? parsed.correctIndex : 0

    built.answers = answers
    built.solutions = [idx]
  } else if (type === "boolean") {
    built.type = "boolean"
    built.answers =
      language.startsWith("de") ? ["Richtig", "Falsch"] : ["True", "False"]
    built.solutions = [parsed.answer === true ? 0 : 1]
  } else if (type === "multiple-select") {
    built.type = "multiple-select"
    built.answers = Array.isArray(parsed.answers)
      ? (parsed.answers as unknown[]).map((a) => String(a)).slice(0, 4)
      : []
    built.solutions = Array.isArray(parsed.correctIndexes)
      ? (parsed.correctIndexes as unknown[])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0)
      : []
  } else {
    built.type = "type-answer"
    built.acceptedAnswers = Array.isArray(parsed.acceptedAnswers)
      ? (parsed.acceptedAnswers as unknown[])
          .map((a) => String(a))
          .filter((a) => a.length > 0)
          .slice(0, 20)
      : []
    built.matchMode = "normalized"
  }

  const result = questionValidator.safeParse(built)

  if (!result.success) {
    throw new Error("errors:ai.invalidOutput")
  }

  // Secret-scan the assembled, serialized question (belt-and-braces: covers
  // model output that landed in answers/acceptedAnswers, not just the raw text).
  assertNoSecret(JSON.stringify(result.data))

  return result.data as Question
}

export const generateDistractors = async (
  question: string,
  correct: string,
  count = 3,
  language = "de",
): Promise<string[]> => {
  const clamped = Math.max(1, Math.min(3, count))
  const system =
    "You produce plausible WRONG answers (distractors) for a quiz question. " +
    "Output strict JSON only, no prose."
  const prompt =
    `Question: "${question}". Correct answer: "${correct}". ` +
    `Return exactly ${clamped} plausible but WRONG short answers in ${language}, ` +
    `none equal to the correct answer. ` +
    'JSON shape: {"distractors": [strings]}.'

  const raw = await generateText({ system, prompt, json: true, maxTokens: 400 })
  const parsed = parseJson(raw) as Record<string, unknown>

  const distractors = Array.isArray(parsed.distractors)
    ? (parsed.distractors as unknown[])
        .map((d) => String(d))
        .filter(
          (d) =>
            d.length > 0 &&
            d.toLowerCase().trim() !== correct.toLowerCase().trim(),
        )
        .slice(0, 3)
    : []

  if (distractors.length === 0 || distractors.length > 3) {
    throw new Error("errors:ai.invalidOutput")
  }

  assertNoSecret(distractors.join("\n"))

  return distractors
}

export const generateQuiz = async (
  topic: string,
  count: number,
  language = "de",
): Promise<Quizz> => {
  const system =
    "You are a quiz author. Produce a full quiz of choice questions. " +
    "Output strict JSON only, no prose."
  const prompt =
    `Write a quiz about "${topic}" with exactly ${count} multiple-choice ` +
    `questions in ${language}. ` +
    'JSON shape: {"subject": string, "questions": ' +
    '[{"question": string, "answers": [4 strings], "correctIndex": 0-3}]}.'

  const raw = await generateText({
    system,
    prompt,
    json: true,
    maxTokens: 2400,
  })
  const parsed = parseJson(raw) as Record<string, unknown>

  const rawQuestions = Array.isArray(parsed.questions)
    ? (parsed.questions as Array<Record<string, unknown>>)
    : []

  const questions = rawQuestions.map((q) => {
    const answers = Array.isArray(q.answers)
      ? (q.answers as unknown[]).map((a) => String(a)).slice(0, 4)
      : []
    const idx = typeof q.correctIndex === "number" ? q.correctIndex : 0

    return {
      question: q.question,
      answers,
      solutions: [idx],
      time: 20,
      cooldown: 5,
    }
  })

  const result = quizzValidator.safeParse({
    subject: typeof parsed.subject === "string" ? parsed.subject : topic,
    questions,
  })

  if (!result.success) {
    throw new Error("errors:ai.invalidOutput")
  }

  assertNoSecret(JSON.stringify(result.data))

  return result.data as Quizz
}
