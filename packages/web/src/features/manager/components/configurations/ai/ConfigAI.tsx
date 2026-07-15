import { AI_PROVIDER_OFF, EVENTS } from "@razzoozle/common/constants"
import type {
  AIImageProviderConfig,
  AIProviderPublic,
  AISettings,
  AISettingsPublic,
  AITestResult,
} from "@razzoozle/common/types/ai"
import type { Quizz } from "@razzoozle/common/types/game"
import Button from "@razzoozle/web/components/Button"
import { EmptyState } from "@razzoozle/web/features/manager/components/console"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { ActionFooter } from "@razzoozle/web/components/ui"
import { Sparkles } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import TextProviderSection from "./TextProviderSection"
import ImageSection from "./ImageSection"
import QuizGenSection from "./QuizGenSection"

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
      pill: "bg-[var(--surface-3)] text-[var(--ink-medium)]",
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
        <TextProviderSection
          t={t}
          settings={settings}
          selectedProvider={selectedProvider}
          textStatusBadge={textStatusBadge}
          keyInput={keyInput}
          testing={testing}
          lastTest={lastTest}
          lastTestMessage={lastTestMessage}
          setActiveProvider={setActiveProvider}
          updateTextProvider={updateTextProvider}
          setKeyInput={setKeyInput}
          saveKey={saveKey}
          clearKey={clearKey}
          testProvider={testProvider}
        />

        {/* ── Bild-Generierung ────────────────────────────────────── */}
        <ImageSection
          t={t}
          settings={settings}
          updateImageProvider={updateImageProvider}
        />

        {/* ── Quiz-Generierung ────────────────────────────────────── */}
        <QuizGenSection
          t={t}
          topic={topic}
          count={count}
          generating={generating}
          generated={generated}
          textConfigured={textConfigured}
          setTopic={setTopic}
          setCount={setCount}
          generateQuiz={generateQuiz}
        />
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
