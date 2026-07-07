import { EVENTS, MEDIA_UPLOAD_MAX_BYTES } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useRef, useState, type ChangeEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

export const useMediaGeneration = () => {
  const { updateQuestion, currentIndex, currentQuestion } = useQuizzEditor()
  const { socket } = useSocket()
  const questionMedia = currentQuestion.media
  const { t } = useTranslation()
  const [aiPrompt, setAiPrompt] = useState("")
  const [generating, setGenerating] = useState(false)

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

  return {
    fileInputRef,
    aiPrompt,
    setAiPrompt,
    generating,
    uploading,
    enhancedPrompt,
    enhancing,
    editPrompt,
    setEditPrompt,
    editing,
    canEditImage,
    handleGenerate,
    handleUploadClick,
    handleFile,
    handleEnhance,
    handleEdit,
  }
}
