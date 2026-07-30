// Unit tests for ExperienceDisplay component.

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// WP-939C: mode=flowerBattle now renders FlowerBattleDisplay, which pulls in
// FlowerGardenScene (motion/react for FlowerPlant) + FlowerBattlePresenterHud
// (react-i18next). Mocked here the same way FlowerGardenScene.test.tsx /
// FlowerBattleDisplay.test.tsx do, so the flowerBattle-branch test below can
// render without a real i18next/motion setup.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

vi.mock("motion/react", () => ({
  useReducedMotion: () => true,
  useMotionValue: (initial: number) => {
    let current = initial
    return {
      get: () => current,
      set: (value: number) => {
        current = value
      },
    }
  },
  animate: vi.fn(() => ({ stop: vi.fn(), then: (fn: () => void) => Promise.resolve().then(fn) })),
  motion: {
    g: ({
      children,
      id,
      transform,
      dangerouslySetInnerHTML,
      ...rest
    }: {
      children?: React.ReactNode
      id?: string
      transform?: string
      dangerouslySetInnerHTML?: { __html: string }
      [key: string]: unknown
    }) => (
      <g id={id} transform={transform} {...rest}>
        {dangerouslySetInnerHTML ? (
          <g dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
        ) : null}
        {children}
      </g>
    ),
    circle: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode
      [key: string]: unknown
    }) => <circle {...rest}>{children}</circle>,
  },
}))

import { ExperienceDisplay } from "../ExperienceDisplay"

describe("ExperienceDisplay — Content-Free Display", () => {
  it("renders phase name", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay data={{ mode: "pyramidClimb", phase: "question" }} />,
    )
    expect(markup).toContain("question")
  })

  it("renders answered and total counts", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay data={{ mode: "pyramidClimb", phase: "question", answered: 7, total: 12 }} />,
    )
    expect(markup).toContain(">7<")
    expect(markup).toContain(" / 12")
  })

  it("calculates progress percentage", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay
        data={{ mode: "pyramidClimb", phase: "question", answered: 5, total: 10 }}
      />,
    )
    expect(markup).toContain("50%")
  })

  it("does not render question-text testid (content-free)", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay data={{ mode: "deepSeaEscape", phase: "answers_locked", answered: 3, total: 10 }} />,
    )
    expect(markup).not.toContain('data-testid="question-text"')
  })

  it("defaults answered and total to 0 when absent", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay data={{ mode: "classic", phase: "intro" }} />,
    )
    expect(markup).toContain(">0<")
    expect(markup).toContain("0%")
  })

  it("mode=flowerBattle delegates to FlowerBattleDisplay instead of the generic placeholder (WP-939C)", () => {
    const markup = renderToStaticMarkup(
      <ExperienceDisplay
        data={{
          mode: "flowerBattle",
          phase: "question",
          answered: 2,
          total: 5,
          payload: {
            mode: "flowerBattle",
            data: {
              state: {
                phase: "round1",
                teams: [],
                background: { seed: "1", recipeVersion: 1 },
                powerups: [],
              },
            },
          },
        }}
      />,
    )

    expect(markup).toContain('data-testid="flower-battle-display"')
    expect(markup).toContain('data-testid="flower-garden-scene"')
    expect(markup).not.toContain('data-testid="question-text"')
  })
})
