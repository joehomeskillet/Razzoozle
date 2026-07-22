import { EVENTS } from "@razzoozle/common/constants"
import type { AIProviderConfig } from "@razzoozle/common/types/ai"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import Loader from "@razzoozle/web/components/Loader"
import { fetchWithAuth } from "@razzoozle/web/lib/api"
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
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import { CheckCircle2, KeyRound, Lock, Trash2, XCircle } from "lucide-react"
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

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)

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
      t("manager:profile.aiKeys.saved"),
    )
  }

  const removeKey = (providerId: string) => {
    socket.emit(EVENTS.USER.DELETE_AI_KEY, { providerId })
    setKeyStatus((current) => ({ ...current, [providerId]: false }))
    toast.success(
      t("manager:profile.aiKeys.removed"),
    )
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(
        t("manager:profile.changePassword.allFieldsRequired"),
      )
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error(
        t("manager:profile.changePassword.mismatch"),
      )
      return
    }

    setIsChangingPassword(true)
    try {
      const response = await fetchWithAuth("/api/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      if (!response.ok) {
        if (response.status === 403) {
          toast.error(
            t("manager:profile.changePassword.wrongCurrent"),
          )
        } else {
          toast.error(
            t("manager:profile.changePassword.failed"),
          )
        }
        return
      }

      toast.success(
        t("manager:profile.changePassword.success"),
      )
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      toast.error(
        t("manager:profile.changePassword.networkError"),
      )
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        title={`${t("manager:profile.welcome")}${username ? `, ${username}` : ""}`}
        subtitle={t("manager:profile.intro")}
      />

      <SectionCard
        icon={<Lock className="size-5" aria-hidden />}
        title={t("manager:profile.changePassword.title")}
        description={t("manager:profile.changePassword.description")}
      >
        <div className="space-y-3">
          <div>
            <label
              htmlFor="current-password"
              className="block text-sm font-medium text-[var(--ink-muted)]"
            >
              {t("manager:profile.changePassword.current")}
            </label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              variant="sm"
              value={currentPassword}
              placeholder={t("manager:passwordPlaceholder")}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label
              htmlFor="new-password"
              className="block text-sm font-medium text-[var(--ink-muted)]"
            >
              {t("manager:profile.changePassword.new")}
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              variant="sm"
              value={newPassword}
              placeholder={t("manager:passwordPlaceholder")}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-[var(--ink-muted)]"
            >
              {t("manager:profile.changePassword.confirm")}
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              variant="sm"
              value={confirmPassword}
              placeholder={t("manager:passwordPlaceholder")}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1"
            />
          </div>

          <Button
            type="button"
            onClick={handleChangePassword}
            disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="mt-4"
          >
            {isChangingPassword ? (
              <Loader className="h-4" />
            ) : (
              t("manager:profile.changePassword.submit")
            )}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        icon={<KeyRound className="size-5" aria-hidden />}
        title={t("manager:profile.aiKeys.title")}
        description={t("manager:profile.aiKeys.description")}
      >
        {providers === null ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <Loader className="h-16" />
          </div>
        ) : providers.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            headline={t("manager:profile.aiKeys.emptyHeadline")}
            hint={t("manager:profile.aiKeys.empty")}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {providers.map((provider) => {
              const configured = keyStatus[provider.id] ?? false

              return (
                <SubGroup key={provider.id} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--ink)]">
                      {provider.label}
                    </span>
                    <span
                      className={providerStatusClass(configured)}
                      aria-label={
                        configured
                          ? t("manager:profile.aiKeys.configured")
                          : t("manager:profile.aiKeys.notConfigured")
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {configured ? (
                          <CheckCircle2 className="size-3.5" aria-hidden />
                        ) : (
                          <XCircle className="size-3.5" aria-hidden />
                        )}
                        {configured
                          ? t("manager:profile.aiKeys.configured")
                          : t("manager:profile.aiKeys.notConfigured")}
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor={`profile-ai-key-${provider.id}`}
                      className="sr-only"
                    >
                      {t("manager:profile.aiKeys.inputLabel", { label: provider.label })}
                    </label>
                    <Input
                      id={`profile-ai-key-${provider.id}`}
                      type="password"
                      autoComplete="off"
                      variant="sm"
                      value={keyInputs[provider.id] ?? ""}
                      placeholder={t("manager:ai.apiKeyPlaceholder")}
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
                      {t("manager:ai.saveKey")}
                    </Button>
                    {configured && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => removeKey(provider.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        {t("manager:profile.aiKeys.remove")}
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
