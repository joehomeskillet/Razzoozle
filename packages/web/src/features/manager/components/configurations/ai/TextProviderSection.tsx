import { AI, AI_PROVIDER_OFF } from "@razzoozle/common/constants"
import type {
  AIProviderPublic,
  AISettingsPublic,
} from "@razzoozle/common/types/ai"
import clsx from "clsx"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import Select from "@razzoozle/web/components/Select"
import Badge from "@razzoozle/web/components/manager/Badge"
import {
  SectionCard,
  SubGroup,
} from "@razzoozle/web/features/manager/components/console"
import { FormSection, LabelRow } from "@razzoozle/web/components/ui"
import {
  ShieldAlert,
  ShieldCheck,
  Wand2,
} from "lucide-react"
import type { TFunction } from "i18next"
import type { Dispatch, SetStateAction } from "react"
import { providerPrivacy, providerStatusClass } from "./helpers"

interface TextProviderSectionProps {
  t: TFunction
  settings: AISettingsPublic
  selectedProvider: AIProviderPublic | undefined
  textStatusBadge: { label: string; pill: string; dot: string }
  keyInput: string
  testing: boolean
  lastTest: "ok" | "failed" | null
  lastTestMessage: string | null
  setActiveProvider: (activeProvider: string) => void
  updateTextProvider: (
    providerId: string,
    updates: Partial<Pick<AIProviderPublic, "baseUrl" | "model" | "temperature">>,
  ) => void
  setKeyInput: Dispatch<SetStateAction<string>>
  saveKey: (providerId: string) => void
  clearKey: (providerId: string) => void
  testProvider: () => void
}

const TextProviderSection = ({
  t,
  settings,
  selectedProvider,
  textStatusBadge,
  keyInput,
  testing,
  lastTest,
  lastTestMessage,
  setActiveProvider,
  updateTextProvider,
  setKeyInput,
  saveKey,
  clearKey,
  testProvider,
}: TextProviderSectionProps) => {
  return (
    <SectionCard
      icon={<Wand2 className="size-5" aria-hidden />}
      title={t("manager:ai.text.title")}
      description={t("manager:ai.text.description")}
      actions={
        <Badge className={clsx("gap-1.5 py-1", textStatusBadge.pill)}>
          <span
            className={clsx("size-2 rounded-full", textStatusBadge.dot)}
            aria-hidden
          />
          {textStatusBadge.label}
        </Badge>
      }
    >
      {/* Group: Provider-Auswahl */}
      <FormSection title={t("manager:ai.provider")}>
        <LabelRow label={t("manager:ai.provider")} htmlFor="ai-text-provider">
          <Select
            id="ai-text-provider"
            value={settings.text.activeProvider}
            onChange={(event) => setActiveProvider(event.target.value)}
          >
            <option value={AI_PROVIDER_OFF}>{t("manager:ai.off")}</option>
            {settings.text.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </Select>
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
                    ? "bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] outline-1 -outline-offset-1 outline-[var(--status-pending-text)]"
                    : "bg-[var(--status-online-bg)] text-[var(--status-online-text)] outline-1 -outline-offset-1 outline-[var(--status-online-text)]",
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
                    <span className="w-10 shrink-0 text-right text-lg font-bold tabular-nums text-[var(--ink)]">
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

              {/* Group: API-Schlüssel mit Test-Status inline */}
              <FormSection
                title={t("manager:ai.apiKey")}
                className="mb-0"
              >
                <SubGroup className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={providerStatusClass(
                        selectedProvider.keyConfigured,
                      )}
                    >
                      {selectedProvider.keyConfigured
                        ? t("manager:ai.keyConfigured")
                        : t("manager:ai.keyNotConfigured")}
                    </Badge>
                    <Badge className="bg-[var(--surface-3)] text-[var(--ink-medium)]">
                      {t(`manager:ai.kind.${selectedProvider.kind}`)}
                    </Badge>
                  </div>
                  <LabelRow
                    label={t("manager:ai.apiKey")}
                    htmlFor="ai-api-key"
                    statusMessage={
                      testing
                        ? {
                            text: t("manager:ai.testing"),
                            tone: "pending",
                          }
                        : lastTest === "ok"
                          ? {
                              text: lastTestMessage || t("manager:ai.testOk"),
                              tone: "success",
                            }
                          : lastTest === "failed"
                            ? {
                                text: lastTestMessage || t("manager:ai.testFailed"),
                                tone: "error",
                              }
                            : undefined
                    }
                  >
                    <Input
                      id="ai-api-key"
                      type="password"
                      value={keyInput}
                      placeholder={t("manager:ai.apiKeyPlaceholder")}
                      onChange={(event) => setKeyInput(event.target.value)}
                      disabled={testing}
                      className="w-full"
                    />
                  </LabelRow>
                  <div className="flex flex-wrap gap-2 sm:pl-44">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => saveKey(selectedProvider.id)}
                      disabled={!keyInput.trim() || testing}
                    >
                      {t("manager:ai.saveKey")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => clearKey(selectedProvider.id)}
                      disabled={testing}
                    >
                      {t("manager:ai.clearKey")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={testProvider}
                      disabled={testing}
                    >
                      {testing ? t("manager:ai.testing") : t("manager:ai.test")}
                    </Button>
                  </div>
                </SubGroup>
              </FormSection>
            </>
          )
        })()}
    </SectionCard>
  )
}

export default TextProviderSection
