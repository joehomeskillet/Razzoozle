import { EVENTS, MEDIA_UPLOAD_MAX_BYTES } from "@razzia/common/constants"
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
import MediaPickerModal from "@razzia/web/features/quizz/components/MediaPickerModal"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import {
  Image,
  ImageOff,
  Library,
  Music,
  Pencil,
  Sparkles,
  Upload,
  Video,
  Wand2,
} from "lucide-react"
import { useRef, useState, type ChangeEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QuestionEditorMedia = () => {
  const { updateQuestion, currentIndex, currentQuestion, isManager } =
    useQuizzEditor()
  const { socket } = useSocket()
  const questionMedia = currentQuestion.media
  const { t } = useTranslation()
  const [aiPrompt, setAiPrompt] = useState("")
  const [generating, setGenerating] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // #23 public upload (no auth, byte-capped client-side then server-side).
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // #23 prompt-enhance preview: server rewrites the rough idea via the active
  // text provider; the A/B block lets the author see what will be generated.
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null)
  const [enhancing, setEnhancing] = useState(false)

  // #23 img2img edit: only available once the question already holds an image
  // that lives under /media (a server URL the backend can resolve to bytes).
  const [editPrompt, setEditPrompt] = useState("")
  const [editing, setEditing] = useState(false)

  const handleSelectFromLibrary = (url: string) => {
    updateQuestion(currentIndex, { media: { type: "image", url } })
  }

  // IMAGE_GENERATED is shared by AI-generate AND img2img-edit (same {url}
  // contract), so clear both spinners here. The callback closes over the latest
  // `currentIndex` because useEvent re-binds on every callback identity change.
  useEvent(EVENTS.MANAGER.IMAGE_GENERATED, ({ url }) => {
    updateQuestion(currentIndex, { media: { type: "image", url } })
    setGenerating(false)
    setEditing(false)
    setEditPrompt("")
    setAiPrompt("")
    setEnhancedPrompt(null)
  })

  // IMAGE_ERROR is the shared error channel for AI-generate, img2img-edit,
  // public upload AND the enhance preview (all four signal failure here), so it
  // must clear every spinner — otherwise an upload/enhance error leaves its
  // spinner stuck (the success events reset uploading/enhancing, but errors
  // never reach them).
  useEvent(EVENTS.MANAGER.IMAGE_ERROR, (message) => {
    toast.error(t(message))
    setGenerating(false)
    setEditing(false)
    setUploading(false)
    setEnhancing(false)
  })

  // #23 upload success carries its own {url}; distinct event keeps the upload
  // spinner state separate from the GPU-bound generate/edit spinners.
  useEvent(EVENTS.MANAGER.UPLOAD_IMAGE_SUCCESS, ({ url }) => {
    updateQuestion(currentIndex, { media: { type: "image", url } })
    setUploading(false)
  })

  // #23 enhance preview: server always returns a usable prompt (enhanced, or
  // the raw input on graceful provider-skip), so this never errors the path.
  useEvent(EVENTS.MANAGER.PROMPT_ENHANCED, ({ prompt }) => {
    setEnhancedPrompt(prompt)
    setEnhancing(false)
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

  // #23 upload: read the file as a data URL, pre-check the decoded size against
  // the same cap the server enforces (fail fast, no wasted emit), then emit the
  // public upload event. The server re-checks the byte cap + deep MIME allowlist
  // and stores a server-generated WebP name, so this client guard is advisory.
  const handleUploadClick = () => {
    if (uploading) {
      return
    }

    fileInputRef.current?.click()
  }

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    // Allow re-selecting the same file later by clearing the input value.
    e.target.value = ""

    if (!file) {
      return
    }

    if (file.size >= MEDIA_UPLOAD_MAX_BYTES) {
      toast.error(
        t("errors:media.tooLarge", {
          defaultValue: "Das Bild ist zu groß. Maximal 8 MB.",
        }),
      )

      return
    }

    try {
      setUploading(true)
      const reader = new FileReader()

      reader.onload = () => {
        const result = reader.result

        if (typeof result === "string") {
          socket.emit(EVENTS.MANAGER.SUBMIT_UPLOAD_IMAGE, {
            filename: file.name,
            dataUrl: result,
          })
        } else {
          setUploading(false)
        }
      }

      reader.onerror = () => {
        setUploading(false)
      }

      reader.readAsDataURL(file)
    } catch {
      setUploading(false)
    }
  }

  // #23 enhance preview: ask the server to rewrite the current AI prompt. Rides
  // its own throttle server-side; never blocks generation.
  const handleEnhance = () => {
    const prompt = aiPrompt.trim()

    if (!prompt || enhancing) {
      return
    }

    setEnhancing(true)
    socket.emit(EVENTS.MANAGER.ENHANCE_PROMPT, { prompt })
  }

  // #23 img2img: only sensible when the current media is an image served from
  // /media (the backend resolves baseUrl to bytes via the path-traversal stack).
  const handleEdit = () => {
    const prompt = editPrompt.trim()
    const baseUrl = questionMedia?.url

    if (!prompt || !baseUrl || editing) {
      return
    }

    setEditing(true)
    socket.emit(EVENTS.MANAGER.EDIT_IMAGE, { baseUrl, prompt })
  }

  // img2img edit only works on locally-hosted media: EDIT_IMAGE resolves the
  // base image by disk-read of a "/media/..." path (the server rejects any other
  // baseUrl as errors:media.invalidUrl), so don't offer the affordance for
  // external https:// image URLs that would only fail server-side.
  const canEditImage =
    questionMedia?.type === "image" &&
    !!questionMedia.url &&
    questionMedia.url.startsWith("/media/")

  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <QuestionMedia media={currentQuestion.media} alt="Question Media" />

      {/* Hidden, public file input shared by the upload button below. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {!questionMedia?.type && (
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
      )}

      {questionMedia?.type && (
        <div className="mt-2 flex w-full max-w-xl flex-col items-center gap-3">
          {/*
            img2img edit — only when the current media is an image with a /media
            URL the server can resolve. The base bytes are read server-side from
            disk (the client only sends the relative URL), so no client canvas
            editing happens here.
          */}
          {canEditImage && (
            <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white/70 p-3">
              <Input
                variant="sm"
                className="w-full"
                placeholder={t("quizz:question.media.editPromptPlaceholder", {
                  defaultValue: "Beschreibe die Änderung am Bild",
                })}
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                disabled={editing}
              />
              <Button
                size="sm"
                className="min-h-11"
                onClick={handleEdit}
                disabled={editing || !editPrompt.trim()}
                classNameContent="gap-1.5"
              >
                {editing ? (
                  <Loader className="size-5 text-white" />
                ) : (
                  <Pencil className="size-5" />
                )}
                <p>
                  {editing
                    ? t("quizz:question.media.editing", {
                        defaultValue: "Wird bearbeitet",
                      })
                    : t("quizz:question.media.editButton", {
                        defaultValue: "Bild per Text ändern",
                      })}
                </p>
              </Button>
            </div>
          )}

          <Button variant="secondary" onClick={handleRemoveMedia}>
            {t("common:delete")}
          </Button>
        </div>
      )}

      {isManager && (
        <MediaPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleSelectFromLibrary}
        />
      )}
    </div>
  )
}

export default QuestionEditorMedia
