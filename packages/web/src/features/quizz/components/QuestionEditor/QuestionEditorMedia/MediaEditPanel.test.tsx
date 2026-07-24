// Regression tests for MediaEditPanel existing-media upload/replace affordance.
//
// Vitest runs under the `node` env (no jsdom, no Testing Library) — see
// vitest.config.ts. Uses renderToStaticMarkup + real I18nextProvider, matching
// checkbox-in-listrow.test.tsx. Button is the only mocked primitive so we can
// invoke captured onClick handlers without a DOM runtime.
//
// Expected production gap (Razzoozle issue 425): MediaEditPanel must expose a
// manual upload/replace control for existing media, wired to handleUploadClick,
// with a disabled loading state while uploading=true. Edit + delete must remain.

import type { ReactNode } from "react"
import { createInstance } from "i18next"
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

const { capturedButtons, resetCapturedButtons } = vi.hoisted(() => {
  const capturedButtons: CapturedButton[] = []
  return {
    capturedButtons,
    resetCapturedButtons: () => {
      capturedButtons.length = 0
    },
  }
})

const extractText = (node: ReactNode): string => {
  if (typeof node === "string") {
    return node
  }
  if (typeof node === "number") {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("")
  }
  if (node && typeof node === "object" && "props" in node) {
    const children = (node as { props: { children?: ReactNode } }).props.children
    return extractText(children)
  }

  return ""
}

vi.mock("@razzoozle/web/components/Button", () => ({
  default: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => {
    const label = extractText(children).trim()
    capturedButtons.push({ label, onClick, disabled })

    return (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    )
  },
}))

type MediaEditPanelTestProps = React.ComponentProps<typeof MediaEditPanel> & {
  uploading: boolean
  handleUploadClick: () => void
}

const UPLOAD_LABEL = quizzDe.question.media.uploadButton
const UPLOADING_LABEL = quizzDe.question.media.uploading
const EDIT_LABEL = quizzDe.question.media.editButton
const DELETE_LABEL = commonDe.delete

const renderWithI18n = async (component: ReactNode) => {
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
    <I18nextProvider i18n={i18n}>{component}</I18nextProvider>,
  )
}

const baseProps = (): MediaEditPanelTestProps => ({
  canEditImage: true,
  editPrompt: "mach den Himmel blau",
  setEditPrompt: vi.fn(),
  editing: false,
  handleEdit: vi.fn(),
  handleRemoveMedia: vi.fn(),
  uploading: false,
  handleUploadClick: vi.fn(),
})

const findButtonByLabel = (label: string) =>
  capturedButtons.find((button) => button.label.includes(label))

describe("MediaEditPanel — existing media upload/replace", () => {
  afterEach(() => {
    resetCapturedButtons()
    vi.clearAllMocks()
  })

  it("exposes an accessible upload/replace button with the localized upload label", async () => {
    const markup = await renderWithI18n(<MediaEditPanel {...baseProps()} />)

    expect(markup).toContain(UPLOAD_LABEL)
    expect(findButtonByLabel(UPLOAD_LABEL)).toBeDefined()
  })

  it("delegates upload button activation to handleUploadClick exactly once", async () => {
    const handleUploadClick = vi.fn()

    await renderWithI18n(
      <MediaEditPanel {...baseProps()} handleUploadClick={handleUploadClick} />,
    )

    const uploadButton = findButtonByLabel(UPLOAD_LABEL)
    expect(uploadButton).toBeDefined()
    uploadButton?.onClick?.()
    expect(handleUploadClick).toHaveBeenCalledTimes(1)
  })

  it("shows a disabled loading state when uploading=true", async () => {
    const markup = await renderWithI18n(
      <MediaEditPanel {...baseProps()} uploading={true} />,
    )

    expect(markup).toContain(UPLOADING_LABEL)
    const uploadButton = findButtonByLabel(UPLOADING_LABEL)
    expect(uploadButton).toBeDefined()
    expect(uploadButton?.disabled).toBe(true)
  })

  it("keeps edit and delete actions present alongside upload/replace", async () => {
    const markup = await renderWithI18n(<MediaEditPanel {...baseProps()} />)

    expect(markup).toContain(EDIT_LABEL)
    expect(markup).toContain(DELETE_LABEL)
    expect(findButtonByLabel(EDIT_LABEL)).toBeDefined()
    expect(findButtonByLabel(DELETE_LABEL)).toBeDefined()
  })
})
