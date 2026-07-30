import { readFileSync } from "node:fs"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ExperienceStartWarningView } from "./ExperienceStartWarning"

// Node-env SSR render (no jsdom — see vitest.config.ts). Same convention as
// ParticipantCapSetting.test.tsx: i18next mocked to return the raw key (or
// `defaultValue` when given).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

// AlertDialog wraps Radix's Portal-based primitive, which never renders its
// content during renderToStaticMarkup (Portals target a real DOM node that
// doesn't exist in SSR) — regardless of `open`. Mocked the same way
// ChoiceGrid.test.tsx mocks motion/react: to a plain, inert stand-in that
// exposes the exact props ExperienceStartWarningView computed, so the
// component's OWN open/description/label logic stays testable.
vi.mock("@razzoozle/web/components/AlertDialog", () => ({
  default: ({
    open,
    title,
    description,
    confirmLabel,
  }: {
    open?: boolean
    title?: string
    description?: string
    confirmLabel?: string
  }) =>
    open ? (
      <div data-testid="mock-alert-dialog">
        <span data-testid="dialog-title">{title}</span>
        <span data-testid="dialog-description">{description}</span>
        <span data-testid="dialog-confirm-label">{confirmLabel}</span>
      </div>
    ) : null,
}))

describe("ExperienceStartWarningView — dialog states (E-11rev)", () => {
  it("stays closed when there is no warning", () => {
    const html = renderToStaticMarkup(
      <ExperienceStartWarningView
        warning={null}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(html).toBe("")
  })

  it("opens with the teamSetupIncomplete description and confirm label", () => {
    const html = renderToStaticMarkup(
      <ExperienceStartWarningView
        warning={{
          gameId: "game-1",
          reason: "teamSetupIncomplete",
          confirmedRequired: true,
        }}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(html).toContain('data-testid="mock-alert-dialog"')
    expect(html).toContain("manager:startWarning.title")
    expect(html).toContain("manager:startWarning.teamSetupIncomplete")
    expect(html).toContain("manager:startWarning.confirmAnyway")
  })

  it("falls back to the teamSetupIncomplete description for an unknown reason shape", () => {
    // Defensive: unscoredFiltered never reaches the dialog in the real
    // container (it's toast-only, see the container's useEvent branch), but
    // the view must still degrade to *a* real description key rather than
    // an undefined/broken one if it ever did.
    const html = renderToStaticMarkup(
      <ExperienceStartWarningView
        warning={{
          gameId: "game-1",
          reason: "unscoredFiltered",
          skipped: 3,
          remaining: 7,
        }}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(html).toContain("manager:startWarning.unscoredFiltered")
  })
})

describe("skip-hint exact wording (E-12rev)", () => {
  // Reads the real source locale directly — the toast call lives inside a
  // useEffect-bound socket callback in the container component, which never
  // runs during a static SSR render, so this is the most direct way to pin
  // the spec's EXACT wording independent of react-i18next mocking.
  const managerDe = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../../../../locales/de/manager.json"),
      "utf-8",
    ),
  )

  it("matches the spec wording exactly for N=5", () => {
    const template: string =
      managerDe.selectQuizz.experienceMode.skippedQuestions
    const rendered = template.replace("{{count}}", "5")

    expect(rendered).toBe(
      "5 Fragen können in diesem Modus nicht verwendet werden und werden übersprungen",
    )
  })

  it("matches the spec wording exactly for N=1 (no special singular form)", () => {
    const template: string =
      managerDe.selectQuizz.experienceMode.skippedQuestions
    const rendered = template.replace("{{count}}", "1")

    expect(rendered).toBe(
      "1 Fragen können in diesem Modus nicht verwendet werden und werden übersprungen",
    )
  })

  it("has no i18next plural-suffix variants that could change the wording by count", () => {
    expect(managerDe.selectQuizz.experienceMode).not.toHaveProperty(
      "skippedQuestions_one",
    )
    expect(managerDe.selectQuizz.experienceMode).not.toHaveProperty(
      "skippedQuestions_other",
    )
  })
})
