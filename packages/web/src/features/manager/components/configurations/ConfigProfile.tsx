import { EVENTS } from "@razzoozle/common/constants"
import type { AIProviderConfig } from "@razzoozle/common/types/ai"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import Loader from "@razzoozle/web/components/Loader"
import { providerStatusClass } from "@razzoozle/web/features/manager/components/configurations/ai/helpers"
import {
  EmptyState,
  SectionCard,
  SubGroup,
} from "@razzoozle/web/features/manager/components/console"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { CheckCircle2, KeyRound, Trash2, XCircle } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// The user's OWN external AI provider keys (never the instance-wide admin
// config — see ConfigAI for that). require_user server-side: a user can only
// ever read/set/delete their own keys. The server NEVER echoes a stored key
// back — status is a plain boolean per provider.
const ConfigProfile = () => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const { username } = useManagerStore()

  const [providers, setProviders] = useState<AIProviderConfig[] | null>(null)
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({})
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})

  useEffect(() => {
    socket.emit(EVENTS.USER.LIST_EXTERNAL_PROVIDERS)
    socket.emit(EVENTS.USER.GET_AI_KEY_STATUS)
  }, [socket])

  useEvent(
    EVENTS.USER.EXTERNAL_PROVIDERS,
    useCallback(
      (data: { providers: AIProviderConfig[] }) =>
        setProviders(data.providers),
      [],
    ),
  )

  useEvent(
    EVENTS.USER.AI_KEY_STATUS,
    useCallback((status: Record<string, boolean>) => setKeyStatus(status), []),
  )

  useEvent(
    EVENTS.AI.ERROR,
    useCallback(
      (message: string) => toast.error(t(message, { defaultValue: message })),
      [t],
    ),
  )

  const saveKey = (providerId: string) => {
    const key = (keyInputs[providerId] ?? "").trim()
    if (!key) {
      return
    }

    socket.emit(EVENTS.USER.SET_AI_KEY, { providerId, key })
    setKeyInputs((current) => ({ ...current, [providerId]: "" }))
    // No dedicated server ack for this action (mirrors the admin ConfigAI
    // save-key flow) — optimistic update, corrected by the next status fetch.
    setKeyStatus((current) => ({ ...current, [providerId]: true }))
    toast.success(
      t("manager:profile.aiKeys.saved", { defaultValue: "Schlüssel gespeichert" }),
    )
  }

  const removeKey = (providerId: string) => {
    socket.emit(EVENTS.USER.DELETE_AI_KEY, { providerId })
    setKeyStatus((current) => ({ ...current, [providerId]: false }))
    toast.success(
      t("manager:profile.aiKeys.removed", { defaultValue: "Schlüssel entfernt" }),
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          {t("manager:profile.welcome", { defaultValue: "Willkommen" })}
          {username && `, ${username}`}
        </h2>
        <p className="mt-1 text-sm leading-6 text-gray-500">
          {t("manager:profile.intro", {
            defaultValue: "Dein Profil und deine persönlichen Einstellungen.",
          })}
        </p>
      </div>

      <SectionCard
        icon={<KeyRound className="size-5" aria-hidden />}
        title={t("manager:profile.aiKeys.title", {
          defaultValue: "Eigene KI-Anbieter",
        })}
        description={t("manager:profile.aiKeys.description", {
          defaultValue:
            "Hinterlege deinen eigenen API-Schlüssel für die KI-Generierung. Ohne eigenen Schlüssel wird — falls vorhanden — der Standard der Instanz verwendet. Ein gespeicherter Schlüssel wird nie wieder angezeigt.",
        })}
      >
        {providers === null ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <Loader className="h-16" />
          </div>
        ) : providers.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            headline={t("manager:profile.aiKeys.emptyHeadline", {
              defaultValue: "Keine externen Anbieter",
            })}
            hint={t("manager:profile.aiKeys.empty", {
              defaultValue:
                "Der Administrator hat noch keine externen KI-Anbieter eingerichtet.",
            })}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {providers.map((provider) => {
              const configured = keyStatus[provider.id] ?? false

              return (
                <SubGroup key={provider.id} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">
                      {provider.label}
                    </span>
                    <span
                      className={providerStatusClass(configured)}
                      aria-label={
                        configured
                          ? t("manager:profile.aiKeys.configured", {
                              defaultValue: "Eigener Schlüssel hinterlegt",
                            })
                          : t("manager:profile.aiKeys.notConfigured", {
                              defaultValue: "Kein eigener Schlüssel",
                            })
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {configured ? (
                          <CheckCircle2 className="size-3.5" aria-hidden />
                        ) : (
                          <XCircle className="size-3.5" aria-hidden />
                        )}
                        {configured
                          ? t("manager:profile.aiKeys.configured", {
                              defaultValue: "Eigener Schlüssel hinterlegt",
                            })
                          : t("manager:profile.aiKeys.notConfigured", {
                              defaultValue: "Kein eigener Schlüssel",
                            })}
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor={`profile-ai-key-${provider.id}`}
                      className="sr-only"
                    >
                      {t("manager:profile.aiKeys.inputLabel", {
                        defaultValue: "API-Schlüssel für {{label}}",
                        label: provider.label,
                      })}
                    </label>
                    <Input
                      id={`profile-ai-key-${provider.id}`}
                      type="password"
                      autoComplete="off"
                      variant="sm"
                      value={keyInputs[provider.id] ?? ""}
                      placeholder={t("manager:ai.apiKeyPlaceholder", {
                        defaultValue: "Schlüssel eingeben…",
                      })}
                      onChange={(event) =>
                        setKeyInputs((current) => ({
                          ...current,
                          [provider.id]: event.target.value,
                        }))
                      }
                      className="min-w-40 flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => saveKey(provider.id)}
                      disabled={!(keyInputs[provider.id] ?? "").trim()}
                    >
                      {t("manager:ai.saveKey", { defaultValue: "Schlüssel speichern" })}
                    </Button>
                    {configured && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => removeKey(provider.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        {t("manager:profile.aiKeys.remove", {
                          defaultValue: "Entfernen",
                        })}
                      </Button>
                    )}
                  </div>
                </SubGroup>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default ConfigProfile
