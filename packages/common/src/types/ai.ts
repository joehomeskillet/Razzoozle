import type { AIProviderKind } from "@razzia/common/constants"

// A configured text provider (no secret — see ai-secrets server-side).
export interface AIProviderConfig {
  id: string
  label: string
  kind: AIProviderKind
  baseUrl?: string
  model: string
}

export interface AIImageProviderConfig {
  id: string
  label: string
  baseUrl?: string
  workflow?: string
}

// Persisted on the server (config/ai-settings.json). Never carries keys.
export interface AISettings {
  text: { activeProvider: string; providers: AIProviderConfig[] }
  image: { activeProvider: string; providers: AIImageProviderConfig[] }
}

// What the server emits to the client: every text provider gains a
// `keyConfigured` flag in place of any secret.
export interface AIProviderPublic extends AIProviderConfig {
  keyConfigured: boolean
}

export interface AISettingsPublic {
  text: { activeProvider: string; providers: AIProviderPublic[] }
  image: { activeProvider: string; providers: AIImageProviderConfig[] }
}

export interface AITestResult {
  ok: boolean
  // i18n key or short provider-supplied message.
  message: string
}
