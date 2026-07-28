import type { QuestionWithId } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { createInstance } from "i18next"
import { isValidElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import errorsDe from "@razzoozle/web/locales/de/errors.json"
import quizzDe from "@razzoozle/web/locales/de/quizz.json"

import QuestionEditorMedia from "./QuestionEditorMedia"

type CapturedButton = {
  label: string
  onClick?: () => void
  disabled?: boolean
}

type ButtonProps = Omit<CapturedButton, "label"> & { children?: ReactNode }

const capturedButtons = vi.hoisted(() => [] as CapturedButton[])
const updateQuestion = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

const extractText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractText).join("")
  if (isValidElement<{ children?: ReactNode }>(node))
    return extractText(node.props.children)
  return ""
}

vi.mock("@razzoozle/web/components/Button", () => ({
  default: ({ children, onClick, disabled }: ButtonProps) => {
    const label = extractText(children).trim()
    capturedButtons.push({ label, onClick, disabled })

    return (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    )
  },
}))

// react-hot-toast is only used here to surface the validation failure — mock
// it so the test can assert on the exact string handed to the user.
vi.mock("react-hot-toast", () => ({
  default: { error: toastError },
}))

// The editor context and media-generation hook pull in the socket connection
// and a lot of unrelated state; stub both to isolate hadnleChangeMediaType,
// the function this regression (issue tracker: media-type-switch-raw-error) is
// actually about.
const currentQuestion = (media?: QuestionWithId["media"]): QuestionWithId => ({
  id: "q1",
  question: "Wie heißt die Hauptstadt von Frankreich?",
  cooldown: 5,
  time: 20,
  media,
})

let mockCurrentQuestion: QuestionWithId = currentQuestion()

vi.mock("@razzoozle/web/features/quizz/contexts/quizz-editor-context", () => ({
  useQuizzEditor: () => ({
    updateQuestion,
    currentIndex: 0,
    currentQuestion: mockCurrentQuestion,
    isManager: false,
  }),
}))

vi.mock(
  "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorMedia/useMediaGeneration",
  () => ({
    useMediaGeneration: () => ({
      fileInputRef: { current: null },
      aiPrompt: "",
      setAiPrompt: vi.fn(),
      generating: false,
      uploading: false,
      enhancedPrompt: null,
      enhancing: false,
      editPrompt: "",
      setEditPrompt: vi.fn(),
      editing: false,
      canEditImage: false,
      handleGenerate: vi.fn(),
      handleUploadClick: vi.fn(),
      handleFile: vi.fn(),
      handleEnhance: vi.fn(),
      handleEdit: vi.fn(),
    }),
  }),
)

const IMAGE_LABEL = quizzDe.question.media.image
const INVALID_MEDIA_URL_MESSAGE = errorsDe.quizz.invalidMediaUrl

const renderComponent = async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: "de",
    fallbackLng: false,
    ns: ["quizz", "errors"],
    resources: {
      de: {
        quizz: quizzDe,
        errors: errorsDe,
      },
    },
  })

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <QuestionEditorMedia />
    </I18nextProvider>,
  )
}

const buttonByLabel = (label: string) => {
  const button = capturedButtons.find((item) => item.label === label)
  if (!button) throw new Error(`Missing button: ${label}`)
  return button
}

describe("QuestionEditorMedia — media type switch without a URL", () => {
  afterEach(() => {
    capturedButtons.length = 0
    vi.clearAllMocks()
    mockCurrentQuestion = currentQuestion()
  })

  it("shows the translated invalidMediaUrl message, not raw zod text, and does not apply the type", async () => {
    mockCurrentQuestion = currentQuestion(undefined)
    await renderComponent()

    buttonByLabel(IMAGE_LABEL).onClick?.()

    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith(INVALID_MEDIA_URL_MESSAGE)
    expect(toastError.mock.calls[0][0]).not.toMatch(/invalid input|expected string/i)
    expect(updateQuestion).not.toHaveBeenCalled()
  })

  it("still applies the type once a valid URL is already present", async () => {
    mockCurrentQuestion = currentQuestion({ url: "/media/sample.webp" })
    await renderComponent()

    buttonByLabel(IMAGE_LABEL).onClick?.()

    expect(toastError).not.toHaveBeenCalled()
    expect(updateQuestion).toHaveBeenCalledWith(0, {
      media: { type: "image", url: "/media/sample.webp" },
    })
  })
})
