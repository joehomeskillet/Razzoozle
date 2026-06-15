import Background from "@razzoozle/web/components/Background"
import TrophyGallery from "@razzoozle/web/features/game/components/TrophyGallery"
import { createFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useTranslation } from "react-i18next"

const TrophiesPage = () => {
  const { t } = useTranslation()

  return (
    <Background>
      <div className="mx-auto w-full max-w-3xl px-4">
        <a
          href="/"
          className="text-primary focus-visible:ring-primary/40 mt-4 mb-2 inline-flex items-center gap-1 rounded text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
          aria-label={t("common:back", "Zurück")}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("common:back", "Zurück")}
        </a>
        <TrophyGallery />
      </div>
    </Background>
  )
}

export const Route = createFileRoute("/trophies/")({
  component: TrophiesPage,
})
