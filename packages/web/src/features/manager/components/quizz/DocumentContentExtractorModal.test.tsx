import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { DocumentContentExtractorModal } from "./DocumentContentExtractorModal"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

describe("DocumentContentExtractorModal Component (Issue #481 / SDD #481)", () => {
  it("renders modal header and dropzone initial state", () => {
    const html = renderToStaticMarkup(
      <DocumentContentExtractorModal />
    )

    expect(html).toContain("KI Dokument-Extraktor")
    expect(html).toContain("PDF oder PowerPoint hochladen &amp; automatisch Quiz erstellen")
    expect(html).toContain('data-testid="extractor-dropzone"')
    expect(html).toContain('data-testid="extractor-file-input"')
  })

  it("supports testIdPrefix prop for custom isolation", () => {
    const html = renderToStaticMarkup(
      <DocumentContentExtractorModal testIdPrefix="console-" />
    )

    expect(html).toContain('data-testid="console-document-extractor-modal"')
    expect(html).toContain('data-testid="console-extractor-dropzone"')
  })

  it("disables dropzone and file input when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <DocumentContentExtractorModal disabled={true} />
    )

    expect(html).toContain("disabled")
    expect(html).toContain("cursor-not-allowed")
  })

  it("accepts pdf and pptx file extensions in file input", () => {
    const html = renderToStaticMarkup(
      <DocumentContentExtractorModal />
    )

    expect(html).toContain('accept=".pdf,.pptx,.ppt"')
  })

  it("renders sparkling icon in header", () => {
    const html = renderToStaticMarkup(
      <DocumentContentExtractorModal />
    )

    expect(html).toContain("lucide-sparkles")
  })

  it("exports DocumentContentExtractorModal function component", () => {
    expect(typeof DocumentContentExtractorModal).toBe("function")
  })
})
