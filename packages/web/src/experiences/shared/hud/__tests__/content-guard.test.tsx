// Negative tests for the HUD content guard (WP #908, constraint 1).
//
// HUD primitives must NEVER receive Frageinhalte, Antworttexte oder
// Player-Daten. The prop types declare these keys as `never`, so TypeScript
// rejects them at compile time — the `@ts-expect-error` directives below are
// verified by `tsc -b --noEmit` (tsconfig.app.json covers all of src/): if a
// forbidden prop ever became assignable, tsc would fail on the unused
// directive. At runtime the components simply ignore unknown props, which the
// smoke assertions below prove (rendering must not crash).

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AnswerCounter } from "../AnswerCounter"
import { CountdownDisplay } from "../CountdownDisplay"
import { ExperienceHud } from "../ExperienceHud"
import { PhaseIndicator } from "../PhaseIndicator"
import { RoundProgress } from "../RoundProgress"
import { StatusBanner } from "../StatusBanner"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

describe("HUD content guard (no question content / no player data)", () => {
  it("RoundProgress rejects question content structurally", () => {
    const jsx = (
      <RoundProgress
        value={50}
        // @ts-expect-error — Frageinhalte sind auf HUD-Primitiven strukturell verboten
        question="Wie heißt die Hauptstadt von Frankreich?"
      />
    )
    expect(renderToStaticMarkup(jsx)).toContain('role="progressbar"')
  })

  it("AnswerCounter rejects answer texts structurally", () => {
    const jsx = (
      // @ts-expect-error — Antworttexte sind auf HUD-Primitiven strukturell verboten
      <AnswerCounter answered={1} total={4} answers={["Paris", "Lyon"]} />
    )
    expect(renderToStaticMarkup(jsx)).toContain("1/4")
  })

  it("PhaseIndicator rejects player data structurally", () => {
    const jsx = (
      // @ts-expect-error — Player-Daten sind auf HUD-Primitiven strukturell verboten
      <PhaseIndicator current={1} total={5} players={[{ name: "Alice" }]} />
    )
    expect(renderToStaticMarkup(jsx)).toContain("1 phaseIndicator.of 5")
  })

  it("CountdownDisplay rejects player payloads structurally", () => {
    const jsx = (
      // @ts-expect-error — Player-Daten sind auf HUD-Primitiven strukturell verboten
      <CountdownDisplay seconds={5} playerData={{ id: "p1", score: 900 }} />
    )
    expect(renderToStaticMarkup(jsx)).toContain(">5<")
  })

  it("StatusBanner rejects question content structurally", () => {
    const jsx = (
      // @ts-expect-error — Frageinhalte sind auf HUD-Primitiven strukturell verboten
      <StatusBanner type="info" message="m" questions={["q1"]} />
    )
    expect(renderToStaticMarkup(jsx)).toContain('role="status"')
  })

  it("ExperienceHud rejects player data structurally", () => {
    const jsx = (
      // @ts-expect-error — Player-Daten sind auf dem HUD-Root strukturell verboten
      <ExperienceHud player={{ name: "Bob", score: 42 }} />
    )
    expect(renderToStaticMarkup(jsx)).toContain('data-testid="experience-hud"')
  })
})
