import { EVENTS } from "@razzia/common/constants"
import type { QuestionMediaType } from "@razzia/common/types/game"
import { questionMediaValidator } from "@razzia/common/validators/quizz"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import Input from "@razzia/web/components/Input"
import Loader from "@razzia/web/components/Loader"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { Image, ImageOff, Music, Sparkles, Video } from "lucide-react"
import { useState, type ChangeEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QuestionEditorMedia = () => {
  const { updateQuestion, currentIndex, currentQuestion } = useQuizzEditor()
  const { socket } = useSocket()
  const questionMedia = currentQuestion.media
  const { t } = useTranslation()
  const [aiPrompt, setAiPrompt] = useState("")
  const [generating, setGenerating] = useState(false)

  useEvent(EVENTS.MANAGER.IMAGE_GENERATED, ({ url }) => {
    updateQuestion(currentIndex, { media: { type: "image", url } })
    setGenerating(false)
    setAiPrompt("")
  })

  useEvent(EVENTS.MANAGER.IMAGE_ERROR, (message) => {
    toast.error(t(message))
    setGenerating(false)
  })

  const hadnleChangeMediaType = (type: QuestionMediaType) => () => {
    const result = questionMediaValidator.safeParse({
      type,
      url: questionMedia?.url,
    })

    if (!result.success) {
      toast.error(t(result.error.issues[0].message))

      return
    }

    updateQuestion(currentIndex, { media: result.data })
  }

  const handleRemoveMedia = () => {
    if (!questionMedia) {
      return
    }

    updateQuestion(currentIndex, { media: undefined })
  }

  const handleChangeMedia = (e: ChangeEvent<HTMLInputElement>) => {
    updateQuestion(currentIndex, {
      media: { url: e.target.value },
    })
  }

  const handleGenerate = () => {
    const prompt = aiPrompt.trim()

    if (!prompt || generating) {
      return
    }

    setGenerating(true)
    socket.emit(EVENTS.MANAGER.GENERATE_IMAGE, { prompt })
  }

  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <QuestionMedia media={currentQuestion.media} alt="Question Media" />

      {!questionMedia?.type && (
        <Card className="my-auto flex max-h-100 w-full max-w-xl flex-1 flex-col items-center justify-center gap-2 bg-white">
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
            <Input
              variant="sm"
              className="w-full"
              placeholder={t("quizz:question.media.aiPromptPlaceholder")}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              disabled={generating}
            />
            <Button
              size="sm"
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
        </Card>
      )}

      {questionMedia?.type && (
        <div className="mt-2 flex justify-center">
          <Button variant="secondary" onClick={handleRemoveMedia}>
            {t("common:delete")}
          </Button>
        </div>
      )}
    </div>
  )
}

export default QuestionEditorMedia
