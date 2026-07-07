import type { Question, QuestionMediaType } from "@razzoozle/common/types/game"
import Button from "@razzoozle/web/components/Button"
import Card from "@razzoozle/web/components/Card"
import Input from "@razzoozle/web/components/Input"
import Loader from "@razzoozle/web/components/Loader"
import {
  Image,
  ImageOff,
  Library,
  Music,
  Sparkles,
  Upload,
  Video,
  Wand2,
} from "lucide-react"
import type { ChangeEvent, Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"

interface MediaEmptyCardProps {
  questionMedia: Question["media"]
  isManager: boolean
  uploading: boolean
  generating: boolean
  enhancing: boolean
  aiPrompt: string
  setAiPrompt: Dispatch<SetStateAction<string>>
  enhancedPrompt: string | null
  setPickerOpen: Dispatch<SetStateAction<boolean>>
  handleChangeMedia: (e: ChangeEvent<HTMLInputElement>) => void
  hadnleChangeMediaType: (type: QuestionMediaType) => () => void
  handleUploadClick: () => void
  handleEnhance: () => void
  handleGenerate: () => void
}

const MediaEmptyCard = ({
  questionMedia,
  isManager,
  uploading,
  generating,
  enhancing,
  aiPrompt,
  setAiPrompt,
  enhancedPrompt,
  setPickerOpen,
  handleChangeMedia,
  hadnleChangeMediaType,
  handleUploadClick,
  handleEnhance,
  handleGenerate,
}: MediaEmptyCardProps) => {
  const { t } = useTranslation()

  return (
    <Card className="my-auto flex max-h-150 w-full max-w-xl flex-1 flex-col items-center justify-center gap-2 overflow-y-auto bg-white">
      <ImageOff className="size-16 stroke-gray-600" />
      <p className="text-center text-sm text-gray-600">
        {t("quizz:question.addMediaHint")}
      </p>
      <Input
        variant="sm"
        className="w-full max-w-md"
        placeholder={t("quizz:question.mediaUrlPlaceholder")}
        value={questionMedia?.url ?? ""}
        onChange={handleChangeMedia}
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant="secondary"
          onClick={hadnleChangeMediaType("image")}
          classNameContent="gap-1.5"
        >
          <Image className="size-6" />
          <p>{t("quizz:question.media.image")}</p>
        </Button>
        <Button
          variant="secondary"
          onClick={hadnleChangeMediaType("video")}
          classNameContent="gap-1.5"
        >
          <Video className="size-6" />
          <p>{t("quizz:question.media.video")}</p>
        </Button>
        <Button
          variant="secondary"
          onClick={hadnleChangeMediaType("audio")}
          classNameContent="gap-1.5"
        >
          <Music className="size-6" />
          <p>{t("quizz:question.media.audio")}</p>
        </Button>
      </div>

      <div className="mt-2 flex w-full max-w-md flex-col items-center gap-2 border-t border-gray-200 pt-3">
        <div className="flex w-full flex-wrap justify-center gap-2">
          {/*
            The media-library picker is manager-only: it relies on the
            withAuth-gated MEDIA.LIST event, which never resolves on the
            public /submit page (isManager=false), so hide it entirely there.
          */}
          {isManager && (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              onClick={() => setPickerOpen(true)}
              classNameContent="gap-1.5"
            >
              <Library className="size-5" />
              <p>
                {t("manager:mediaPicker.openButton", {
                  defaultValue: "Aus Bibliothek",
                })}
              </p>
            </Button>
          )}
          {/* Public upload — available to everyone on /submit. */}
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={handleUploadClick}
            disabled={uploading}
            classNameContent="gap-1.5"
          >
            {uploading ? (
              <Loader className="size-5 text-gray-700" />
            ) : (
              <Upload className="size-5" />
            )}
            <p>
              {uploading
                ? t("quizz:question.media.uploading", {
                    defaultValue: "Wird hochgeladen",
                  })
                : t("quizz:question.media.uploadButton", {
                    defaultValue: "Bild hochladen",
                  })}
            </p>
          </Button>
        </div>

        <Input
          variant="sm"
          className="w-full"
          placeholder={t("quizz:question.media.aiPromptPlaceholder")}
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          disabled={generating}
        />

        {/* A/B preview block: raw input vs. the prompt the server will use. */}
        {enhancedPrompt !== null && (
          <div className="w-full rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-2 text-left">
            <p className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
              {t("quizz:question.media.rawLabel", {
                defaultValue: "Deine Eingabe",
              })}
            </p>
            <p className="mb-2 text-sm text-gray-700">{aiPrompt}</p>
            <p className="text-[11px] font-semibold tracking-wide text-[var(--color-primary)] uppercase">
              {t("quizz:question.media.enhancedLabel", {
                defaultValue: "So wird generiert",
              })}
            </p>
            <p className="text-sm text-gray-800">{enhancedPrompt}</p>
          </div>
        )}

        <div className="flex w-full flex-wrap justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={handleEnhance}
            disabled={enhancing || !aiPrompt.trim()}
            classNameContent="gap-1.5"
          >
            {enhancing ? (
              <Loader className="size-5 text-gray-700" />
            ) : (
              <Wand2 className="size-5" />
            )}
            <p>
              {enhancing
                ? t("quizz:question.media.enhancing", {
                    defaultValue: "Wird optimiert",
                  })
                : t("quizz:question.media.enhanceButton", {
                    defaultValue: "Vorschau verbessern",
                  })}
            </p>
          </Button>
          <Button
            size="sm"
            className="min-h-11"
            onClick={handleGenerate}
            disabled={generating || !aiPrompt.trim()}
          >
            <div className="flex items-center gap-1.5">
              {generating ? (
                <Loader className="size-5 text-white" />
              ) : (
                <Sparkles className="size-5" />
              )}
              <p>{t("quizz:question.media.aiGenerate")}</p>
            </div>
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default MediaEmptyCard
