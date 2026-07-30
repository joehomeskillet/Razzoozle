// Unit tests for FillBlankDisplay component.
//
// Tests verify:
// 1. Renders correct options when provided
// 2. GUARD: Returns null (no output) when correctOptions is undefined or empty
// 3. Applies correct styling classes to options and container
// 4. Renders label with correct styling
// 5. Options arranged in flex wrap container with correct spacing
//
// NOTE: vitest env is 'node' (no jsdom). Uses React's server renderer.

import { createInstance } from "i18next"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"

import gameDe from "@razzoozle/web/locales/de/game.json"

import { FillBlankDisplay } from "./FillBlankDisplay"

const renderWithI18n = async (component: React.ReactNode) => {
  const i18n = createInstance()
  await i18n.init({
    lng: "de",
    fallbackLng: false,
    ns: ["game"],
    resources: {
      de: {
        game: gameDe,
      },
    },
  })

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{component}</I18nextProvider>,
  )
}

describe("FillBlankDisplay — Value Display Component", () => {
  it("renders correct options", async () => {
    const markup = await renderWithI18n(
      <FillBlankDisplay correctOptions={["apple", "orange", "banana"]} />,
    )

    expect(markup).toContain("Richtige Lösungen")
    expect(markup).toContain("apple")
    expect(markup).toContain("orange")
    expect(markup).toContain("banana")
  })

  it("renders single correct option", async () => {
    const markup = await renderWithI18n(
      <FillBlankDisplay correctOptions={["answer"]} />,
    )

    expect(markup).toContain("Richtige Lösungen")
    expect(markup).toContain("answer")
  })

  it("GUARD: returns no output when correctOptions is undefined", async () => {
    const markup = await renderWithI18n(
      <FillBlankDisplay />,
    )

    expect(markup.trim()).toBe("")
  })

  it("GUARD: returns no output when correctOptions is empty array", async () => {
    const markup = await renderWithI18n(
      <FillBlankDisplay correctOptions={[]} />,
    )

    expect(markup.trim()).toBe("")
  })

  it("applies correct styling classes to options", async () => {
    const markup = await renderWithI18n(
      <FillBlankDisplay correctOptions={["test"]} />,
    )

    expect(markup).toContain("text-answer-text")
    expect(markup).toContain("inline-flex")
    expect(markup).toContain("items-center")
    expect(markup).toContain("bg-[var(--state-correct)]")
  })

  it("applies correct styling to container", async () => {
    const markup = await renderWithI18n(
      <FillBlankDisplay correctOptions={["test"]} />,
    )

    expect(markup).toContain("w-full")
    expect(markup).toContain("bg-white")
    expect(markup).toContain("text-center")
  })

  it("renders label with correct styling", async () => {
    const markup = await renderWithI18n(
      <FillBlankDisplay correctOptions={["test"]} />,
    )

    expect(markup).toContain("Richtige Lösungen")
    expect(markup).toContain("text-sm")
    expect(markup).toContain("font-semibold")
  })

  it("renders options in flex wrap container", async () => {
    const markup = await renderWithI18n(
      <FillBlankDisplay correctOptions={["opt1", "opt2"]} />,
    )

    expect(markup).toContain("flex")
    expect(markup).toContain("flex-wrap")
    expect(markup).toContain("justify-center")
    expect(markup).toContain("gap-2")
  })
})
