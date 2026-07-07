// ---- AI settings (config/ai-settings.json) --------------------------------
// Never carries any secret (those live in ai-secrets.json). On a missing/corrupt
// file we SEED from the constants presets so the KI tab is populated out of the
// box; the active text provider defaults to "off" (generation disabled).
// Extracted verbatim from services/config.ts (SRP split).
import {
  AI_PROVIDER_OFF,
  AI_TEXT_PROVIDER_PRESETS,
} from "@razzoozle/common/constants"
import type {
  AIProviderPublic,
  AISettings,
  AISettingsPublic,
} from "@razzoozle/common/types/ai"
import { aiSettingsValidator } from "@razzoozle/common/validators/ai"
import { hasKey } from "@razzoozle/socket/services/ai-secrets"
import fs from "fs"
import { getPath } from "@razzoozle/socket/services/config/shared"

const seedAISettings = (): AISettings => {
  const localOverride = process.env.RAHOOT_AI_LOCAL_URL

  return {
    text: {
      activeProvider: AI_PROVIDER_OFF,
      providers: AI_TEXT_PROVIDER_PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        kind: p.kind,
        // The "local" provider's baseUrl is overridable server-side so an
        // operator can point Ollama elsewhere without editing the file.
        baseUrl:
          p.id === "local" && localOverride
            ? localOverride
            : "baseUrl" in p
              ? p.baseUrl
              : undefined,
        model: p.model,
      })),
    },
    image: {
      activeProvider: "comfyui",
      providers: [{ id: "comfyui", label: "ComfyUI / Z-Image" }],
    },
  }
}

export const getAISettings = (): AISettings => {
  const filePath = getPath("ai-settings.json")

  if (!fs.existsSync(filePath)) {
    return seedAISettings()
  }

  // Mirror getGameConfig: never throw on a malformed file — fall back to the
  // seed so the server keeps booting and the KI tab stays usable.
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = aiSettingsValidator.safeParse(JSON.parse(raw))

    if (result.success) {
      return result.data
    }

    console.warn("Invalid ai-settings.json, using seed:", result.error.issues)
  } catch (error) {
    console.error("Failed to read ai settings:", error)
  }

  return seedAISettings()
}

export const setAISettings = (payload: unknown): AISettings => {
  const result = aiSettingsValidator.safeParse(payload)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  fs.writeFileSync(
    getPath("ai-settings.json"),
    JSON.stringify(result.data, null, 2),
  )

  return result.data
}

// Map persisted settings to the wire shape: each text provider gains a
// `keyConfigured` boolean (derived from ai-secrets) and NEVER carries the key
// itself. Image providers are unchanged (no secrets).
export const toPublicAISettings = (s: AISettings): AISettingsPublic => ({
  text: {
    activeProvider: s.text.activeProvider,
    providers: s.text.providers.map(
      (p): AIProviderPublic => ({ ...p, keyConfigured: hasKey(p.id) }),
    ),
  },
  image: s.image,
})
