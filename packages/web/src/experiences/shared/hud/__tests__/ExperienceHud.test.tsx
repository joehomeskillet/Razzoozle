// Unit tests for ExperienceHud (experience kit HUD composition root, WP #908).
//
// Pure TSX — no jsdom (vitest `node` env), renderToStaticMarkup only.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ExperienceHud } from "../ExperienceHud"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

describe("ExperienceHud (composition root)", () => {
  it("composes all 5 primitives from their prop objects", () => {
    const html = renderToStaticMarkup(
      <ExperienceHud
        roundProgress={{ value: 60 }}
        answerCounter={{ answered: 3, total: 5 }}
        phaseIndicator={{ current: 1, total: 5 }}
        countdown={{ seconds: 12 }}
        statusBanner={{ type: "info", message: "Runde gestartet" }}
      />,
    )
    expect(html).toContain('data-testid="hud-round-progress"')
    expect(html).toContain('data-testid="hud-answer-counter"')
    expect(html).toContain('data-testid="hud-phase-indicator"')
    expect(html).toContain('data-testid="hud-countdown-display"')
    expect(html).toContain('data-testid="hud-status-banner"')
  })

  it("forwards primitive props verbatim (values land in the markup)", () => {
    const html = renderToStaticMarkup(
      <ExperienceHud
        roundProgress={{ value: 60 }}
        answerCounter={{ answered: 3, total: 5 }}
        phaseIndicator={{ current: 1, total: 5 }}
        countdown={{ seconds: 12 }}
        statusBanner={{ type: "success", message: "Alle Antworten da" }}
      />,
    )
    expect(html).toContain('aria-valuenow="60"')
    expect(html).toContain("3/5")
    expect(html).toContain("1 phaseIndicator.of 5")
    expect(html).toContain(">12<")
    expect(html).toContain("Alle Antworten da")
  })

  it("is an accessible region with a localized label", () => {
    const html = renderToStaticMarkup(<ExperienceHud />)
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="hud.regionLabel"')
  })

  it("renders only the primitives whose props are provided", () => {
    const html = renderToStaticMarkup(
      <ExperienceHud countdown={{ seconds: 3 }} />,
    )
    expect(html).toContain('data-testid="hud-countdown-display"')
    expect(html).not.toContain('data-testid="hud-round-progress"')
    expect(html).not.toContain('data-testid="hud-answer-counter"')
    expect(html).not.toContain('data-testid="hud-phase-indicator"')
    expect(html).not.toContain('data-testid="hud-status-banner"')
  })

  it("renders empty (region only) without any primitive props", () => {
    const html = renderToStaticMarkup(<ExperienceHud />)
    expect(html).toContain('data-testid="experience-hud"')
    expect(html).not.toContain("hud-round-progress")
  })
})
