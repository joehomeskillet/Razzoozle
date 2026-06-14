import { AI, AI_PROVIDER_OFF, EVENTS } from "@razzia/common/constants"
import type {
  AIProviderPublic,
  AISettings,
  AISettingsPublic,
  AITestResult,
} from "@razzia/common/types/ai"
import type { Quizz } from "@razzia/common/types/game"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { Sparkles } from "lucide-react"
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
  const [topic, setTopic] = useState("")
  const [count, setCount] = useState(5)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    socket.emit(EVENTS.AI.GET_SETTINGS)
  }, [socket])

  useEffect(() => {
    setKeyInput("")
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
    setTesting(true)
    socket.emit(EVENTS.AI.TEST_PROVIDER, {})
  }

  const generateQuiz = () => {
    const trimmedTopic = topic.trim()

    if (!trimmedTopic) {
      return
    }

    setGenerating(true)
    socket.emit(EVENTS.AI.GENERATE_QUIZ, {
      topic: trimmedTopic,
      count,
    })
  }

  if (settings === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="rounded-xl bg-white p-4 outline-2 -outline-offset-2 outline-gray-200">
          <p className="text-sm text-gray-500">{t("manager:ai.intro")}</p>
        </div>
      </div>
    )
  }

  const selectedProvider =
    settings.text.activeProvider === AI_PROVIDER_OFF
      ? undefined
      : settings.text.providers.find(
          (provider) => provider.id === settings.text.activeProvider,
        )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-gray-50 p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">
          {t("manager:ai.title")}
        </h2>
        <p className="text-sm text-gray-500">{t("manager:ai.intro")}</p>
      </header>

      <section className="space-y-3 rounded-xl bg-white p-4 outline-2 -outline-offset-2 outline-gray-200">
        <div>
          <h3 className="font-semibold text-gray-900">
            {t("manager:ai.text.title")}
          </h3>
          <p className="text-sm text-gray-500">
            {t("manager:ai.text.description")}
          </p>
        </div>

        <label className="block space-y-1 text-sm font-semibold text-gray-700">
          <span>{t("manager:ai.provider")}</span>
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
        </label>

        {selectedProvider && (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1 text-sm font-semibold text-gray-700">
              <span>{t("manager:ai.model")}</span>
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
            </label>

            {selectedProvider.kind === "openai-compatible" && (
              <label className="block space-y-1 text-sm font-semibold text-gray-700">
                <span>{t("manager:ai.baseUrl")}</span>
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
              </label>
            )}

            <div className="space-y-2 md:col-span-2">
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
              <label className="block space-y-1 text-sm font-semibold text-gray-700">
                <span>{t("manager:ai.apiKey")}</span>
                <Input
                  type="password"
                  value={keyInput}
                  placeholder={t("manager:ai.apiKeyPlaceholder")}
                  onChange={(event) => setKeyInput(event.target.value)}
                  className="w-full"
                />
              </label>
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
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-3">
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
      </section>

      <section className="space-y-3 rounded-xl bg-white p-4 outline-2 -outline-offset-2 outline-gray-200">
        <div>
          <h3 className="font-semibold text-gray-900">
            {t("manager:ai.image.title")}
          </h3>
          <p className="text-sm text-gray-500">
            {t("manager:ai.image.description")}
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {settings.image.providers.map((provider) => (
            <div
              key={provider.id}
              className="rounded-lg bg-gray-50 p-3 outline-1 -outline-offset-1 outline-gray-200"
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
      </section>

      <section className="space-y-3 rounded-xl bg-white p-4 outline-2 -outline-offset-2 outline-gray-200">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-gray-600" aria-hidden />
          <h3 className="font-semibold text-gray-900">
            {t("manager:ai.generate.quizTitle")}
          </h3>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_8rem]">
          <label className="block space-y-1 text-sm font-semibold text-gray-700">
            <span>{t("manager:ai.generate.topic")}</span>
            <Input
              value={topic}
              maxLength={AI.TOPIC_MAX_LEN}
              placeholder={t("manager:ai.generate.topicPlaceholder")}
              onChange={(event) => setTopic(event.target.value)}
              className="w-full"
            />
          </label>
          <label className="block space-y-1 text-sm font-semibold text-gray-700">
            <span>{t("manager:ai.generate.count")}</span>
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
          </label>
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
      </section>
    </div>
  )
}

export default ConfigAI
