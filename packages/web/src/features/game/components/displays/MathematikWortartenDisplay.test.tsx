// Unit tests for MathematikWortartenDisplay component.
//
// Tests verify:
// 1. Renders correct answer label and value as string
// 2. Renders correct answer label and value as number
// 3. Applies correct styling classes for motion and typography
// 4. Handles various content types (nominativ, numbers, etc.)
// 5. GUARD: Does not render when correctAnswer is missing (null → no output)
//
// NOTE: vitest env is 'node' (no jsdom). Uses React's server renderer.

import { createInstance } from "i18next"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"

import gameDe from "@razzoozle/web/locales/de/game.json"

import { MathematikWortartenDisplay } from "./MathematikWortartenDisplay"

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

describe("MathematikWortartenDisplay — Value Display Component", () => {
  it("renders correct answer as string", async () => {
    const markup = await renderWithI18n(
      <MathematikWortartenDisplay correctAnswer="Nominativ" />,
    )

    expect(markup).toContain("Nominativ")
    expect(markup).toContain("Richtige Antwort")
  })

  it("renders correct answer as number", async () => {
    const markup = await renderWithI18n(
      <MathematikWortartenDisplay correctAnswer={99} />,
    )

    expect(markup).toContain("99")
    expect(markup).toContain("Richtige Antwort")
  })

  it("applies motion and flex classes to container", async () => {
    const markup = await renderWithI18n(
      <MathematikWortartenDisplay correctAnswer="Test" />,
    )

    expect(markup).toContain("flex")
    expect(markup).toContain("flex-col")
    expect(markup).toContain("items-center")
  })

  it("applies correct text styling for answer", async () => {
    const markup = await renderWithI18n(
      <MathematikWortartenDisplay correctAnswer="TestAnswer" />,
    )

    expect(markup).toContain("text-6xl")
    expect(markup).toContain("font-bold")
  })

  it("applies correct text styling for label", async () => {
    const markup = await renderWithI18n(
      <MathematikWortartenDisplay correctAnswer="Test" />,
    )

    expect(markup).toContain("text-lg")
    expect(markup).toContain("font-semibold")
  })

  it("GUARD: does not render when correctAnswer is undefined", async () => {
    const markup = await renderWithI18n(
      <MathematikWortartenDisplay />,
    )

    expect(markup.trim()).toBe("")
  })

  it("GUARD: does not render when correctAnswer is null", async () => {
    const markup = await renderWithI18n(
      <MathematikWortartenDisplay correctAnswer={null as any} />,
    )

    expect(markup.trim()).toBe("")
  })

  it("GUARD: does not render when correctAnswer is empty string", async () => {
    const markup = await renderWithI18n(
      <MathematikWortartenDisplay correctAnswer="" />,
    )

    expect(markup.trim()).toBe("")
  })

  it("GUARD: does not render when correctAnswer is 0", async () => {
    const markup = await renderWithI18n(
      <MathematikWortartenDisplay correctAnswer={0} />,
    )

    expect(markup.trim()).toBe("")
  })
})
