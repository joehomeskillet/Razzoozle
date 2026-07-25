import { createInstance } from "i18next"
import { isValidElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import commonDe from "@razzoozle/web/locales/de/common.json"
import quizzDe from "@razzoozle/web/locales/de/quizz.json"

import MediaEditPanel from "./MediaEditPanel"

type CapturedButton = {
  label: string
  onClick?: () => void
  disabled?: boolean
}

type ButtonProps = Omit<CapturedButton, "label"> & { children?: ReactNode }

const capturedButtons = vi.hoisted(() => [] as CapturedButton[])

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

type PanelProps = React.ComponentProps<typeof MediaEditPanel>

const UPLOAD_LABEL = quizzDe.question.media.uploadButton
const UPLOADING_LABEL = quizzDe.question.media.uploading
const EDIT_LABEL = quizzDe.question.media.editButton
const EDITING_LABEL = quizzDe.question.media.editing
const DELETE_LABEL = commonDe.delete

const baseProps = (): PanelProps => ({
  canEditImage: true,
  editPrompt: "mach den Himmel blau",
  setEditPrompt: vi.fn(),
  editing: false,
  handleEdit: vi.fn(),
  handleRemoveMedia: vi.fn(),
  uploading: false,
  handleUploadClick: vi.fn(),
})

const renderPanel = async (overrides: Partial<PanelProps> = {}) => {
  const i18n = createInstance()
  await i18n.init({
    lng: "de",
    fallbackLng: false,
    ns: ["quizz", "common"],
    resources: {
      de: {
        quizz: quizzDe,
        common: commonDe,
      },
    },
  })

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MediaEditPanel {...baseProps()} {...overrides} />
    </I18nextProvider>,
  )
}

const buttonByLabel = (label: string) => {
  const button = capturedButtons.find((item) => item.label.includes(label))
  if (!button) throw new Error(`Missing button: ${label}`)
  return button
}

describe("MediaEditPanel — existing media upload/replace", () => {
  afterEach(() => {
    capturedButtons.length = 0
    vi.clearAllMocks()
  })

  it("renders an enabled upload button and delegates activation once", async () => {
    const handleUploadClick = vi.fn()
    const markup = await renderPanel({ handleUploadClick })
    const uploadButton = buttonByLabel(UPLOAD_LABEL)

    expect(markup).toContain(UPLOAD_LABEL)
    expect(uploadButton.disabled).not.toBe(true)
    uploadButton.onClick?.()
    expect(handleUploadClick).toHaveBeenCalledTimes(1)
  })

  it("keeps edit and delete callbacks wired exactly once", async () => {
    const handleEdit = vi.fn()
    const handleRemoveMedia = vi.fn()
    await renderPanel({ handleEdit, handleRemoveMedia })

    buttonByLabel(EDIT_LABEL).onClick?.()
    buttonByLabel(DELETE_LABEL).onClick?.()
    expect(handleEdit).toHaveBeenCalledTimes(1)
    expect(handleRemoveMedia).toHaveBeenCalledTimes(1)
  })

  it("disables every media action while uploading", async () => {
    const markup = await renderPanel({ uploading: true })

    expect(markup).toContain(UPLOADING_LABEL)
    for (const label of [UPLOADING_LABEL, EDIT_LABEL, DELETE_LABEL])
      expect(buttonByLabel(label).disabled).toBe(true)
  })

  it("disables every media action while editing", async () => {
    const markup = await renderPanel({ editing: true })

    expect(markup).toContain(EDITING_LABEL)
    for (const label of [EDITING_LABEL, UPLOAD_LABEL, DELETE_LABEL])
      expect(buttonByLabel(label).disabled).toBe(true)
  })
})
