import { AI } from "@razzoozle/common/constants"

export const clampQuizCount = (value: number) =>
  Math.min(AI.QUIZ_MAX_QUESTIONS, Math.max(AI.QUIZ_MIN_QUESTIONS, value))

export const providerStatusClass = (configured: boolean) =>
  configured
    ? "rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700"
    : "rounded-full bg-[var(--surface-3)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-medium)]"

// Static privacy/help copy per provider. Local stays on-host; the cloud
// providers transmit topic + question text to an external service. Custom
// openai-compatible providers fall back to a generic external-service notice.
const PROVIDER_PRIVACY: Record<
  string,
  { key: string; defaultValue: string; external: boolean }
> = {
  local: {
    key: "manager:ai.privacy.local",
    defaultValue:
      "Lokales Modell auf deinem Server. Deine Eingaben verlassen den Server nicht.",
    external: false,
  },
  claude: {
    key: "manager:ai.privacy.claude",
    defaultValue:
      "Sendet deine Themen und Fragetexte an Anthropic (Claude). Siehe deren Datenschutzerklärung: https://www.anthropic.com/legal/privacy",
    external: true,
  },
  openai: {
    key: "manager:ai.privacy.openai",
    defaultValue:
      "Sendet deine Themen und Fragetexte an OpenAI. Siehe deren Datenschutzerklärung: https://openai.com/policies/privacy-policy",
    external: true,
  },
  openrouter: {
    key: "manager:ai.privacy.openrouter",
    defaultValue:
      "Sendet deine Themen und Fragetexte an OpenRouter und das gewählte Modell. Siehe deren Datenschutzerklärung: https://openrouter.ai/privacy",
    external: true,
  },
}

export const providerPrivacy = (id: string) =>
  PROVIDER_PRIVACY[id] ?? {
    key: "manager:ai.privacy.external",
    defaultValue:
      "Sendet deine Themen und Fragetexte an einen externen Dienst. Prüfe dessen Datenschutzbestimmungen.",
    external: true,
  }
