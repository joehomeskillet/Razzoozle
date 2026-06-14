import { AI, AI_PROVIDER_OFF, EVENTS } from "@razzia/common/constants"
import type {
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
  Field,
  SectionCard,
  SubGroup,
} from "@razzia/web/features/manager/components/console"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import {
  CheckCircle2,
  ImagePlus,
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

const ConfigAI = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AISettingsPublic | null>(null)
  const [keyInput, setKeyInput] = useState("")
  const [testing, setTesting] = useState(false)
  const [lastTest, setLastTest] = useState<"ok" | "failed" | null>(null)
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
        if (result.ok) {
          toast.success(t(result.message))
        } else {
          toast.error(t(result.message))
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
    updates: Partial<Pick<AIProviderPublic, "baseUrl" | "model">>,
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

  const saveSettings = () => {
    if (!settings) {
      return
    }

    const payload: AISettings = {
      text: {
        activeProvider: settings.text.activeProvider,
        providers: settings.text.providers.map(
          ({ id, label, kind, baseUrl, model }) => ({
            id,
            label,
            kind,
            baseUrl,
            model,
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
    toast.success(t("manager:ai.keySaved"))
  }

  const clearKey = (providerId: string) => {
    socket.emit(EVENTS.AI.SET_KEY, { providerId, key: "" })
    setKeyInput("")
    toast.success(t("manager:ai.keyCleared"))
  }

  const testProvider = () => {
    setLastTest(null)
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

  const textConfigured = Boolean(selectedProvider?.keyConfigured)

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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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
        <Field label={t("manager:ai.provider")}>
          <select
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
        </Field>

        {selectedProvider && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("manager:ai.model")}>
              <Input
                value={selectedProvider.model}
                placeholder={t("manager:ai.modelPlaceholder")}
                onChange={(event) =>
                  updateTextProvider(selectedProvider.id, {
                    model: event.target.value,
                  })
                }
                className="w-full"
              />
            </Field>

            {selectedProvider.kind === "openai-compatible" && (
              <Field label={t("manager:ai.baseUrl")}>
                <Input
                  value={selectedProvider.baseUrl ?? ""}
                  placeholder={t("manager:ai.baseUrlPlaceholder")}
                  onChange={(event) =>
                    updateTextProvider(selectedProvider.id, {
                      baseUrl: event.target.value,
                    })
                  }
                  className="w-full"
                />
              </Field>
            )}

            <SubGroup className="space-y-2 md:col-span-2">
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
              <Field label={t("manager:ai.apiKey")}>
                <Input
                  type="password"
                  value={keyInput}
                  placeholder={t("manager:ai.apiKeyPlaceholder")}
                  onChange={(event) => setKeyInput(event.target.value)}
                  className="w-full"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
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
          </div>
        )}

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
            <Button type="button" onClick={saveSettings}>
              {t("manager:ai.save")}
            </Button>
          </div>
          <div aria-live="polite" className="min-h-5">
            {testing && (
              <p className="text-sm text-gray-500">{t("manager:ai.testing")}</p>
            )}
            {!testing && lastTest === "ok" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                <CheckCircle2 className="size-3.5" aria-hidden />
                {t("manager:ai.testOk")}
              </span>
            )}
            {!testing && lastTest === "failed" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                <XCircle className="size-3.5" aria-hidden />
                {t("manager:ai.testFailed")}
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={<ImagePlus className="size-5" aria-hidden />}
        title={t("manager:ai.image.title")}
        description={t("manager:ai.image.description")}
      >
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
              </div>
            ))}
          </div>
        </SubGroup>
      </SectionCard>

      <SectionCard
        icon={<Sparkles className="size-5" aria-hidden />}
        title={t("manager:ai.generate.quizTitle")}
      >
        <div className="grid gap-3 md:grid-cols-[1fr_8rem]">
          <Field label={t("manager:ai.generate.topic")}>
            <Input
              value={topic}
              maxLength={AI.TOPIC_MAX_LEN}
              placeholder={t("manager:ai.generate.topicPlaceholder")}
              onChange={(event) => setTopic(event.target.value)}
              className="w-full"
            />
          </Field>
          <Field label={t("manager:ai.generate.count")}>
            <Input
              type="number"
              min={AI.QUIZ_MIN_QUESTIONS}
              max={AI.QUIZ_MAX_QUESTIONS}
              value={count}
              onChange={(event) =>
                setCount(clampQuizCount(Number(event.target.value)))
              }
              className="w-full"
            />
          </Field>
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
  )
}

export default ConfigAI
