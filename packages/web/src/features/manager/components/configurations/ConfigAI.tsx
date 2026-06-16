import {
  AI,
  AI_PROVIDER_OFF,
  EVENTS,
  IMAGE_RESOLUTION_DEFAULT,
  IMAGE_RESOLUTIONS,
} from "@razzia/common/constants"
import type {
  AIImageProviderConfig,
  AIProviderPublic,
  AISettings,
  AISettingsPublic,
  AITestResult,
} from "@razzia/common/types/ai"
import type { Quizz } from "@razzia/common/types/game"
import clsx from "clsx"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  EmptyState,
  SectionCard,
  SubGroup,
} from "@razzia/web/features/manager/components/console"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import {
  ActionFooter,
  FormSection,
  LabelRow,
} from "@razzia/web/components/ui"
import {
  CheckCircle2,
  ImagePlus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const clampQuizCount = (value: number) =>
  Math.min(AI.QUIZ_MAX_QUESTIONS, Math.max(AI.QUIZ_MIN_QUESTIONS, value))

const providerStatusClass = (configured: boolean) =>
  configured
    ? "rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700"
    : "rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600"

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

const providerPrivacy = (id: string) =>
  PROVIDER_PRIVACY[id] ?? {
    key: "manager:ai.privacy.external",
    defaultValue:
      "Sendet deine Themen und Fragetexte an einen externen Dienst. Prüfe dessen Datenschutzbestimmungen.",
    external: true,
  }

const ConfigAI = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AISettingsPublic | null>(null)
  const [keyInput, setKeyInput] = useState("")
  const [testing, setTesting] = useState(false)
  const [lastTest, setLastTest] = useState<"ok" | "failed" | null>(null)
  const [lastTestMessage, setLastTestMessage] = useState<string | null>(null)
  const [topic, setTopic] = useState("")
  const [count, setCount] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    socket.emit(EVENTS.AI.GET_SETTINGS)
  }, [socket])

  useEffect(() => {
    setKeyInput("")
    setLastTest(null)
    setLastTestMessage(null)
  }, [settings?.text.activeProvider])

  useEvent(
    EVENTS.AI.SETTINGS,
    useCallback((s: AISettingsPublic) => setSettings(s), []),
  )

  useEvent(
    EVENTS.AI.TEST_RESULT,
    useCallback(
      (result: AITestResult) => {
        setTesting(false)
        setLastTest(result.ok ? "ok" : "failed")
        setLastTestMessage(t(result.message, { defaultValue: result.message }))
        if (result.ok) {
          toast.success(t(result.message, { defaultValue: result.message }))
        } else {
          toast.error(t(result.message, { defaultValue: result.message }))
        }
      },
      [t],
    ),
  )

  useEvent(
    EVENTS.AI.SET_SETTINGS_SUCCESS,
    useCallback(() => {
      toast.success(t("manager:ai.saved"))
    }, [t]),
  )

  useEvent(
    EVENTS.AI.QUIZ_GENERATED,
    useCallback(
      ({ quizz }: { quizz: Quizz }) => {
        socket.emit(EVENTS.QUIZZ.SAVE, quizz)
        setGenerating(false)
        setGenerated(true)
        toast.success(t("manager:ai.generate.quizCreated"))
      },
      [socket, t],
    ),
  )

  useEvent(
    EVENTS.AI.ERROR,
    useCallback(
      (message: string) => {
        setTesting(false)
        setGenerating(false)
        toast.error(t(message))
      },
      [t],
    ),
  )

  const setActiveProvider = (activeProvider: string) => {
    setSettings((current) =>
      current
        ? { ...current, text: { ...current.text, activeProvider } }
        : current,
    )
  }

  const updateTextProvider = (
    providerId: string,
    updates: Partial<Pick<AIProviderPublic, "baseUrl" | "model" | "temperature">>,
  ) => {
    setSettings((current) =>
      current
        ? {
            ...current,
            text: {
              ...current.text,
              providers: current.text.providers.map((provider) =>
                provider.id === providerId
                  ? { ...provider, ...updates }
                  : provider,
              ),
            },
          }
        : current,
    )
  }

  const updateImageProvider = (
    providerId: string,
    updates: Partial<Pick<AIImageProviderConfig, "resolution">>,
  ) => {
    setSettings((current) =>
      current
        ? {
            ...current,
            image: {
              ...current.image,
              providers: current.image.providers.map((provider) =>
                provider.id === providerId
                  ? { ...provider, ...updates }
                  : provider,
              ),
            },
          }
        : current,
    )
  }

  const saveSettings = () => {
    if (!settings) {
      return
    }

    const payload: AISettings = {
      text: {
        activeProvider: settings.text.activeProvider,
        providers: settings.text.providers.map(
          ({ id, label, kind, baseUrl, model, temperature }) => ({
            id,
            label,
            kind,
            baseUrl,
            model,
            // WP-10 — carry the per-provider temperature, else the slider
            // appears to work but never persists.
            temperature,
          }),
        ),
      },
      image: settings.image,
    }

    socket.emit(EVENTS.AI.SET_SETTINGS, payload)
  }

  const saveKey = (providerId: string) => {
    socket.emit(EVENTS.AI.SET_KEY, { providerId, key: keyInput })
    setKeyInput("")
    // ponytail: no server ack for key save
    toast.success(t("manager:ai.keySaved"))
  }

  const clearKey = (providerId: string) => {
    socket.emit(EVENTS.AI.SET_KEY, { providerId, key: "" })
    setKeyInput("")
    // ponytail: no server ack for key save
    toast.success(t("manager:ai.keyCleared"))
  }

  const testProvider = () => {
    setLastTest(null)
    setLastTestMessage(null)
    setTesting(true)
    socket.emit(EVENTS.AI.TEST_PROVIDER, {})
  }

  const generateQuiz = () => {
    const trimmedTopic = topic.trim()

    if (!trimmedTopic) {
      return
    }

    setGenerated(false)
    setGenerating(true)
    socket.emit(EVENTS.AI.GENERATE_QUIZ, {
      topic: trimmedTopic,
      count,
    })
  }

  if (settings === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <EmptyState
          icon={Sparkles}
          headline={t("manager:ai.title")}
          hint={t("manager:ai.intro")}
        />
      </div>
    )
  }

  const selectedProvider =
    settings.text.activeProvider === AI_PROVIDER_OFF
      ? undefined
      : settings.text.providers.find(
          (provider) => provider.id === settings.text.activeProvider,
        )

  // A provider needs no API key only when it targets a local host — mirror the
  // server's isLocalBaseUrl rule (localhost / 127.0.0.1 / host.docker.internal)
  // rather than matching the provider id, so the badge + hint stay in sync with
  // server behavior even if the 'local' provider is repointed at a remote host.
  const isLocalProvider =
    selectedProvider?.kind === "openai-compatible" &&
    (() => {
      try {
        return ["localhost", "127.0.0.1", "host.docker.internal"].includes(
          new URL(selectedProvider.baseUrl ?? "").hostname,
        )
      } catch {
        return false
      }
    })()
  const textConfigured = Boolean(
    selectedProvider && (selectedProvider.keyConfigured || isLocalProvider),
  )

  const textStatus: "off" | "ready" | "error" = !selectedProvider
    ? "off"
    : lastTest === "failed"
      ? "error"
      : textConfigured || lastTest === "ok"
        ? "ready"
        : "off"

  const textStatusBadge = {
    off: {
      label: t("manager:ai.status.off", { defaultValue: "Aus" }),
      pill: "bg-gray-100 text-gray-600",
      dot: "bg-gray-400",
    },
    ready: {
      label: t("manager:ai.status.ready", { defaultValue: "Bereit" }),
      pill: "bg-green-100 text-green-700",
      dot: "bg-green-500",
    },
    error: {
      label: t("manager:ai.status.error", { defaultValue: "Fehler" }),
      pill: "bg-red-100 text-red-700",
      dot: "bg-red-500",
    },
  }[textStatus]

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 pb-20">
      {/* ── Text-Provider ───────────────────────────────────────── */}
      <SectionCard
        icon={<Wand2 className="size-5" aria-hidden />}
        title={t("manager:ai.text.title")}
        description={t("manager:ai.text.description")}
        actions={
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              textStatusBadge.pill,
            )}
            aria-label={textStatusBadge.label}
          >
            <span
              className={clsx("size-2 rounded-full", textStatusBadge.dot)}
              aria-hidden
            />
            {textStatusBadge.label}
          </span>
        }
      >
        {/* Group: Provider-Auswahl */}
        <FormSection title={t("manager:ai.provider")}>
          <LabelRow label={t("manager:ai.provider")} htmlFor="ai-text-provider">
            <select
              id="ai-text-provider"
              value={settings.text.activeProvider}
              onChange={(event) => setActiveProvider(event.target.value)}
              className="min-h-11 w-full rounded-lg border-2 border-gray-300 p-2 font-semibold focus-visible:border-primary focus-visible:outline-none"
            >
              <option value={AI_PROVIDER_OFF}>{t("manager:ai.off")}</option>
              {settings.text.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </LabelRow>
        </FormSection>

        {selectedProvider &&
          (() => {
            const privacy = providerPrivacy(selectedProvider.id)
            const temperature = selectedProvider.temperature ?? AI.TEMP_DEFAULT
            return (
              <>
                {/* Privacy notice */}
                <div
                  className={clsx(
                    "flex items-start gap-2 rounded-lg p-3 text-sm",
                    privacy.external
                      ? "bg-amber-50 text-amber-800 outline-1 -outline-offset-1 outline-amber-200"
                      : "bg-green-50 text-green-800 outline-1 -outline-offset-1 outline-green-200",
                  )}
                >
                  {privacy.external ? (
                    <ShieldAlert
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <ShieldCheck
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                  )}
                  <p>{t(privacy.key, { defaultValue: privacy.defaultValue })}</p>
                </div>

                {/* Group: Modell-Einstellungen */}
                <FormSection
                  title={t("manager:ai.model")}
                  className="mb-0"
                >
                  <LabelRow
                    label={t("manager:ai.model")}
                    htmlFor="ai-model-input"
                  >
                    <Input
                      id="ai-model-input"
                      value={selectedProvider.model}
                      placeholder={t("manager:ai.modelPlaceholder")}
                      onChange={(event) =>
                        updateTextProvider(selectedProvider.id, {
                          model: event.target.value,
                        })
                      }
                      className="w-full"
                    />
                  </LabelRow>

                  <LabelRow
                    label={t("manager:ai.temperature.label", {
                      defaultValue: "Temperatur",
                    })}
                    htmlFor="ai-temperature"
                    description={t("manager:ai.temperature.help", {
                      defaultValue: "Höher = kreativer, niedriger = präziser",
                    })}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        id="ai-temperature"
                        type="range"
                        aria-describedby="ai-temperature-hint"
                        min={AI.TEMP_MIN}
                        max={AI.TEMP_MAX}
                        step={0.1}
                        value={temperature}
                        aria-valuetext={t("manager:ai.temperature.value", {
                          defaultValue: "{{value}}",
                          value: temperature.toFixed(1),
                        })}
                        onChange={(event) =>
                          updateTextProvider(selectedProvider.id, {
                            temperature: Number(event.target.value),
                          })
                        }
                        className="h-11 w-full cursor-pointer accent-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                      />
                      <span className="w-10 shrink-0 text-right text-lg font-bold tabular-nums text-gray-800">
                        {temperature.toFixed(1)}
                      </span>
                    </div>
                  </LabelRow>

                  {selectedProvider.kind === "openai-compatible" && (
                    <LabelRow
                      label={t("manager:ai.baseUrl")}
                      htmlFor="ai-base-url"
                    >
                      <Input
                        id="ai-base-url"
                        value={selectedProvider.baseUrl ?? ""}
                        placeholder={t("manager:ai.baseUrlPlaceholder")}
                        onChange={(event) =>
                          updateTextProvider(selectedProvider.id, {
                            baseUrl: event.target.value,
                          })
                        }
                        className="w-full"
                      />
                    </LabelRow>
                  )}
                </FormSection>

                {/* Group: API-Schlüssel */}
                <FormSection
                  title={t("manager:ai.apiKey")}
                  className="mb-0"
                >
                  <SubGroup className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={providerStatusClass(
                          selectedProvider.keyConfigured,
                        )}
                      >
                        {selectedProvider.keyConfigured
                          ? t("manager:ai.keyConfigured")
                          : t("manager:ai.keyNotConfigured")}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                        {t(`manager:ai.kind.${selectedProvider.kind}`)}
                      </span>
                    </div>
                    <LabelRow
                      label={t("manager:ai.apiKey")}
                      htmlFor="ai-api-key"
                    >
                      <Input
                        id="ai-api-key"
                        type="password"
                        value={keyInput}
                        placeholder={t("manager:ai.apiKeyPlaceholder")}
                        onChange={(event) => setKeyInput(event.target.value)}
                        className="w-full"
                      />
                    </LabelRow>
                    <div className="flex flex-wrap gap-2 sm:pl-44">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveKey(selectedProvider.id)}
                        disabled={!keyInput.trim()}
                      >
                        {t("manager:ai.saveKey")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => clearKey(selectedProvider.id)}
                      >
                        {t("manager:ai.clearKey")}
                      </Button>
                    </div>
                  </SubGroup>
                </FormSection>
              </>
            )
          })()}

        {/* Test result feedback */}
        <div className="space-y-2 border-t border-gray-200 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={testProvider}
              disabled={testing}
            >
              {testing ? t("manager:ai.testing") : t("manager:ai.test")}
            </Button>
          </div>
          <div aria-live="polite" className="min-h-5">
            {testing && (
              <p className="text-sm text-gray-500">{t("manager:ai.testing")}</p>
            )}
            {!testing && lastTest === "ok" && (
              <div className="flex items-start gap-2 rounded-lg bg-green-50 p-3 outline-1 -outline-offset-1 outline-green-200">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-green-600"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    {t("manager:ai.testOk")}
                  </p>
                  {lastTestMessage && (
                    <p className="text-sm text-green-700">{lastTestMessage}</p>
                  )}
                </div>
              </div>
            )}
            {!testing && lastTest === "failed" && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-red-50 p-3 outline-1 -outline-offset-1 outline-red-200"
              >
                <XCircle
                  className="mt-0.5 size-5 shrink-0 text-red-600"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    {t("manager:ai.testFailed")}
                  </p>
                  {lastTestMessage && (
                    <p className="text-sm text-red-700">{lastTestMessage}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Bild-Generierung ────────────────────────────────────── */}
      <SectionCard
        icon={<ImagePlus className="size-5" aria-hidden />}
        title={t("manager:ai.image.title")}
        description={t("manager:ai.image.description")}
      >
        <div className="space-y-4">
          <SubGroup>
            <div className="grid gap-2 md:grid-cols-2">
              {settings.image.providers.map((provider) => (
                <div
                  key={provider.id}
                  className="rounded-lg bg-white p-3 outline-1 -outline-offset-1 outline-gray-200"
                >
                  <p className="font-semibold text-gray-800">{provider.label}</p>
                  {provider.baseUrl && (
                    <p className="break-all text-sm text-gray-500">
                      {provider.baseUrl}
                    </p>
                  )}
                  <div className="mt-3">
                    <LabelRow
                      label={t("manager:ai.resolution.label", {
                        defaultValue: "Bildauflösung",
                      })}
                      htmlFor={`ai-resolution-${provider.id}`}
                      description={t("manager:ai.resolution.help", {
                        defaultValue: "Kantenlänge des generierten Bildes",
                      })}
                    >
                      <select
                        id={`ai-resolution-${provider.id}`}
                        value={provider.resolution ?? IMAGE_RESOLUTION_DEFAULT}
                        onChange={(event) =>
                          updateImageProvider(provider.id, {
                            resolution: Number(event.target.value),
                          })
                        }
                        className="min-h-11 w-full rounded-lg border-2 border-gray-300 p-2 font-semibold focus-visible:border-primary focus-visible:outline-none"
                      >
                        {IMAGE_RESOLUTIONS.map((size) => (
                          <option key={size} value={size}>
                            {t("manager:ai.resolution.option", {
                              defaultValue: "{{size}} × {{size}}",
                              size,
                            })}
                          </option>
                        ))}
                      </select>
                    </LabelRow>
                  </div>
                </div>
              ))}
            </div>
          </SubGroup>
        </div>
      </SectionCard>

      {/* ── Quiz-Generierung ────────────────────────────────────── */}
      <SectionCard
        icon={<Sparkles className="size-5" aria-hidden />}
        title={t("manager:ai.generate.quizTitle")}
      >
        <div className="space-y-4">
          <LabelRow
            label={t("manager:ai.generate.topic")}
            htmlFor="ai-quiz-topic"
          >
            <Input
              id="ai-quiz-topic"
              value={topic}
              maxLength={AI.TOPIC_MAX_LEN}
              placeholder={t("manager:ai.generate.topicPlaceholder")}
              onChange={(event) => setTopic(event.target.value)}
              className="w-full"
            />
          </LabelRow>

          <LabelRow
            label={t("manager:ai.generate.countValue", {
              defaultValue: "Fragen: {{count}}",
              count,
            })}
            htmlFor="ai-quiz-count"
          >
            <div className="flex items-center gap-3">
              <input
                id="ai-quiz-count"
                type="range"
                min={AI.QUIZ_MIN_QUESTIONS}
                max={AI.QUIZ_MAX_QUESTIONS}
                step={1}
                value={count}
                aria-valuetext={t("manager:ai.generate.countValue", {
                  defaultValue: "Fragen: {{count}}",
                  count,
                })}
                onChange={(event) =>
                  setCount(clampQuizCount(Number(event.target.value)))
                }
                className="h-11 w-full cursor-pointer accent-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              />
              <span className="w-8 shrink-0 text-right text-lg font-bold tabular-nums text-gray-800">
                {count}
              </span>
            </div>
          </LabelRow>
        </div>

        <Button
          type="button"
          onClick={generateQuiz}
          disabled={!topic.trim() || generating}
        >
          {generating
            ? t("manager:ai.generate.generating")
            : t("manager:ai.generate.quiz")}
        </Button>

        <div aria-live="polite" className="min-h-5">
          {generating && (
            <p className="text-sm text-gray-500">
              {t("manager:ai.generate.generating")}
            </p>
          )}
          {!generating && !textConfigured && (
            <p className="text-sm text-gray-500">
              {t("manager:ai.generate.notConfigured")}
            </p>
          )}
          {!generating && generated && (
            <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {t("manager:ai.generate.generated")}
              <span className="font-medium text-green-800/80">
                {t("manager:ai.generate.openInEditor")}
              </span>
            </span>
          )}
        </div>
      </SectionCard>

      </div>

      {/* ── Sticky save footer ──────────────────────────────────── */}
      <ActionFooter>
        <Button
          variant="primary"
          type="button"
          className="flex-1 rounded-xl sm:flex-none"
          onClick={saveSettings}
        >
          {t("manager:ai.save")}
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigAI
