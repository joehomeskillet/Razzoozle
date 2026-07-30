// Unit tests for SliderValueDisplay component.
//
// Tests verify:
// 1. Renders correct answer label and value
// 2. Includes unit when provided
// 3. Renders average guess when provided
// 4. No output when averageGuess is null/undefined (visibility gate test)
// 5. Applies correct styling classes for motion and typography
//
// NOTE: vitest env is 'node' (no jsdom). Uses React's server renderer.

import { createInstance } from "i18next"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"

import gameDe from "@razzoozle/web/locales/de/game.json"

import { SliderValueDisplay } from "./SliderValueDisplay"

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

describe("SliderValueDisplay — Value Display Component", () => {
  it("renders correct answer without unit", async () => {
    const markup = await renderWithI18n(
      <SliderValueDisplay correct={42} />,
    )

    expect(markup).toContain("42")
    expect(markup).toContain("Richtige Antwort")
  })

  it("renders correct answer with unit", async () => {
    const markup = await renderWithI18n(
      <SliderValueDisplay correct={42} unit="cm" />,
    )

    expect(markup).toContain("42 cm")
  })

  it("renders average guess when provided", async () => {
    const markup = await renderWithI18n(
      <SliderValueDisplay correct={42} unit="cm" averageGuess={35.5} />,
    )

    expect(markup).toContain("42 cm")
    expect(markup).toContain("Schnitt der Schätzungen")
    expect(markup).toContain("35.5")
  })

  it("does not render average guess when averageGuess is null", async () => {
    const markup = await renderWithI18n(
      <SliderValueDisplay correct={42} averageGuess={null} />,
    )

    expect(markup).toContain("42")
    expect(markup).not.toContain("Schnitt der Schätzungen")
  })

  it("does not render average guess when averageGuess is undefined", async () => {
    const markup = await renderWithI18n(
      <SliderValueDisplay correct={42} />,
    )

    expect(markup).toContain("42")
    expect(markup).not.toContain("Schnitt der Schätzungen")
  })

  it("applies motion and flex classes to container", async () => {
    const markup = await renderWithI18n(
      <SliderValueDisplay correct={42} />,
    )

    expect(markup).toContain("flex")
    expect(markup).toContain("flex-col")
    expect(markup).toContain("items-center")
  })

  it("applies correct text styling classes", async () => {
    const markup = await renderWithI18n(
      <SliderValueDisplay correct={42} />,
    )

    expect(markup).toContain("text-6xl")
    expect(markup).toContain("font-bold")
  })
})
