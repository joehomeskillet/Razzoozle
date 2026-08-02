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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import TextProviderSection from "./TextProviderSection"
import ImageSection from "./ImageSection"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import QuizGenSection from "./QuizGenSection"

// Serialize only the user-editable fields so the dirty snapshot excludes
// server-only state (e.g. `keyConfigured`) and provider ordering noise.
const savableForm = (s: AISettingsPublic) => ({
  text: {
    activeProvider: s.text.activeProvider,
    providers: s.text.providers.map((p) => ({
      id: p.id,
      label: p.label,
      kind: p.kind,
      baseUrl: p.baseUrl,
      model: p.model,
      temperature: p.temperature,
    })),
  },
  image: JSON.parse(JSON.stringify(s.image)),
})

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
  // JSON snapshot of the last server-confirmed savable form. Null until the
  // first SETTINGS event arrives — used to compute the Save button's dirty
  // state without coupling to React effect order.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

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
    useCallback((s: AISettingsPublic) => {
      setSettings(s)
      // Seed the dirty baseline on first load; a subsequent server push
      // treats the incoming state as the new truth (no in-flight edits).
      setSavedSnapshot((prev) => prev ?? JSON.stringify(savableForm(s)))
    }, []),
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
      // Pin the just-saved snapshot so the Save button disables until the
      // next edit. settingsRef reads the latest settings without making the
      // listener depend on `settings` (which would re-subscribe on every
      // keystroke).
      const current = settingsRef.current
      if (current) {
        setSavedSnapshot(JSON.stringify(savableForm(current)))
      }
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

  // Save button reflects a dirty diff against the last server-confirmed
  // snapshot. No snapshot yet → treat as clean (the initial GET_SETTINGS is
  // still in flight; Save stays disabled until the user actually edits).
  const isDirty = useMemo(() => {
    if (!settings || savedSnapshot === null) {
      return false
    }
    return JSON.stringify(savableForm(settings)) !== savedSnapshot
  }, [settings, savedSnapshot])

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
      label: t("manager:ai.status.off"),
      pill: "bg-[var(--surface-3)] text-[var(--ink-medium)]",
      dot: "bg-[var(--ink-faint)]",
    },
    ready: {
      label: t("manager:ai.status.ready"),
      pill: "bg-status-online-bg text-status-online-text",
      dot: "bg-[var(--state-correct)]",
    },
    error: {
      label: t("manager:ai.status.error"),
      pill: "bg-status-offline-bg text-status-offline-text",
      dot: "bg-[var(--state-wrong)]",
    },
  }[textStatus]

  return (
    <>
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <PageHeader
          title={t("manager:ai.title")}
          subtitle={t("manager:ai.intro")}
        />
      </div>

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
      <ActionFooter dirty={isDirty}>
        <Button
          variant="primary"
          type="button"
          className="flex-1 rounded-[var(--radius-theme)] sm:flex-none"
          onClick={saveSettings}
          disabled={!isDirty}
          data-testid="config-ai-save-btn"
        >
          {t("manager:ai.save")}
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigAI
