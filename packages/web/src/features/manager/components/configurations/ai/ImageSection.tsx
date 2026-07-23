import { AI_PROVIDER_OFF, IMAGE_RESOLUTION_DEFAULT, IMAGE_RESOLUTIONS } from "@razzoozle/common/constants"
import type {
  AIImageProviderConfig,
  AISettingsPublic,
} from "@razzoozle/common/types/ai"
import {
  SectionCard,
} from "@razzoozle/web/features/manager/components/console"
import { LabelRow } from "@razzoozle/web/components/ui"
import Badge from "@razzoozle/web/components/manager/Badge"
import Select from "@razzoozle/web/components/Select"
import { ImagePlus } from "lucide-react"
import clsx from "clsx"
import type { TFunction } from "i18next"

interface ImageSectionProps {
  t: TFunction
  settings: AISettingsPublic
  updateImageProvider: (
    providerId: string,
    updates: Partial<Pick<AIImageProviderConfig, "resolution">>,
  ) => void
}

const ImageSection = ({
  t,
  settings,
  updateImageProvider,
}: ImageSectionProps) => {
  // Determine image provider status: ready if activeProvider is configured, off otherwise
  const imageConfigured =
    settings.image.activeProvider !== AI_PROVIDER_OFF &&
    settings.image.providers.length > 0

  const imageStatus: "off" | "ready" = imageConfigured ? "ready" : "off"

  const imageStatusBadge = {
    off: {
      label: t("manager:ai.status.off"),
      pill: "bg-[var(--surface-3)] text-[var(--ink-medium)]",
      dot: "bg-[var(--ink-faint)]",
    },
    ready: {
      label: t("manager:ai.status.ready"),
      pill: "bg-[var(--status-online-bg)] text-[var(--status-online-text)]",
      dot: "bg-[var(--state-correct)]",
    },
  }[imageStatus]

  return (
    <SectionCard
      icon={<ImagePlus className="size-5" aria-hidden />}
      title={t("manager:ai.image.title")}
      description={t("manager:ai.image.description")}
      actions={
        <Badge className={clsx("gap-1.5 py-1", imageStatusBadge.pill)}>
          <span
            className={clsx("size-2 rounded-full", imageStatusBadge.dot)}
            aria-hidden
          />
          {imageStatusBadge.label}
        </Badge>
      }
    >
      <div className="space-y-6">
        {settings.image.providers.map((provider) => (
          <div key={provider.id}>
            <p className="font-semibold text-[var(--ink)]">{provider.label}</p>
            {provider.baseUrl && (
              <p className="break-all text-sm text-[var(--ink-subtle)]">
                {provider.baseUrl}
              </p>
            )}
            <div className="mt-3">
              <LabelRow
                label={t("manager:ai.resolution.label")}
                htmlFor={`ai-resolution-${provider.id}`}
                description={t("manager:ai.resolution.help")}
              >
                <Select
                  id={`ai-resolution-${provider.id}`}
                  value={provider.resolution ?? IMAGE_RESOLUTION_DEFAULT}
                  onChange={(event) =>
                    updateImageProvider(provider.id, {
                      resolution: Number(event.target.value),
                    })
                  }
                >
                  {IMAGE_RESOLUTIONS.map((size) => (
                    <option key={size} value={size}>
                      {t("manager:ai.resolution.option", { size })}
                    </option>
                  ))}
                </Select>
              </LabelRow>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

export default ImageSection
