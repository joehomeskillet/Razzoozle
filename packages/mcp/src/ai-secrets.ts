// AI provider API keys — read-only mirror of
// packages/socket/src/services/ai-secrets.ts. Keys live in
// config/ai-secrets.json (a flat Record<providerId, string>, file mode 0600).
// A key is fetched ONLY at call time, attached to the outbound request, and is
// NEVER returned through a tool result, logged, or echoed. We re-implement (not
// import) the socket module because @razzia/socket is not bundled; the path
// derivation + assertSafeId guard are identical. The MCP server is an authoring
// tool, so it only ever READS keys (key management stays in the live app).
import type {
  AIProviderPublic,
  AISettings,
  AISettingsPublic,
} from "@razzia/common/types/ai"
import { assertSafeId, getAISettings, getConfigDir } from "./config-store.js"
import fs from "node:fs"
import { resolve } from "node:path"

const SECRETS_FILE = "ai-secrets.json"

type SecretsRecord = Record<string, string>

const readSecrets = (): SecretsRecord => {
  const filePath = resolve(getConfigDir(), SECRETS_FILE)

  if (!fs.existsSync(filePath)) {
    return {}
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SecretsRecord
    }

    return {}
  } catch {
    // Never throw on a malformed secrets file — treat it as "no keys".
    return {}
  }
}

export const getKey = (id: string): string | undefined => {
  assertSafeId(id)

  const key = readSecrets()[id]

  return typeof key === "string" && key.length > 0 ? key : undefined
}

export const hasKey = (id: string): boolean => {
  assertSafeId(id)

  return getKey(id) !== undefined
}

// Map persisted settings to the wire shape: each text provider gains a
// `keyConfigured` boolean (derived from ai-secrets) and NEVER carries the key
// itself. Image providers are unchanged (no secrets). Mirrors socket
// toPublicAISettings.
export const toPublicAISettings = (
  s: AISettings = getAISettings(),
): AISettingsPublic => ({
  text: {
    activeProvider: s.text.activeProvider,
    providers: s.text.providers.map(
      (p): AIProviderPublic => ({ ...p, keyConfigured: hasKey(p.id) }),
    ),
  },
  image: s.image,
})
