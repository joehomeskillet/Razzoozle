import {
  IMAGE_RESOLUTION_DEFAULT,
  IMAGE_RESOLUTIONS,
} from "@razzoozle/common/constants"
import type {
  AIImageProviderConfig,
  AISettingsPublic,
} from "@razzoozle/common/types/ai"
import {
  SectionCard,
  SubGroup,
} from "@razzoozle/web/features/manager/components/console"
import { LabelRow } from "@razzoozle/web/components/ui"
import { ImagePlus } from "lucide-react"
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
  return (
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
                      className="min-h-11 w-full rounded-lg border-2 border-[var(--border-hairline)] p-2 font-semibold focus-visible:border-primary focus-visible:outline-none"
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
  )
}

export default ImageSection
