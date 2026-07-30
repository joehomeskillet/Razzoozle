// Unit tests for ExperienceLayer (experience kit stage layer).
//
// Pure TS/TSX — no jsdom, no Testing Library (the web package runs vitest
// under the `node` env, see vitest.config.ts). Assertions use React's
// server renderer (renderToStaticMarkup), no fireEvent.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ExperienceLayer } from "./ExperienceLayer"
import type { ExperienceLayerName } from "./z-index"

describe("ExperienceLayer", () => {
  it("renders all 5 layer types correctly", () => {
    const layers: ExperienceLayerName[] = [
      "background",
      "actors",
      "effects",
      "hud",
      "overlay",
    ]

    layers.forEach((layerName) => {
      const html = renderToStaticMarkup(
        <ExperienceLayer name={layerName}>Content</ExperienceLayer>,
      )
      expect(html).toContain(`aria-label="${layerName} layer"`)
    })
  })

  it("effects layer has pointer-events-none", () => {
    const html = renderToStaticMarkup(
      <ExperienceLayer name="effects">Effects</ExperienceLayer>,
    )
    expect(html).toContain("pointer-events-none")
  })

  it("applies correct z-index values from z-index.ts", () => {
    const backgrounds = renderToStaticMarkup(
      <ExperienceLayer name="background">Bg</ExperienceLayer>,
    )
    expect(backgrounds).toContain('style="z-index:1"')

    const overlay = renderToStaticMarkup(
      <ExperienceLayer name="overlay">Overlay</ExperienceLayer>,
    )
    expect(overlay).toContain('style="z-index:5"')
  })
})
