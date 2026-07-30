import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Responses from "./Responses"

// SSR parity suite for MUI-02d — Responses.tsx now delegates its main
// content area to the questionTypeDisplays registry (resolveDisplay). One
// case per registered type, one for the Default fallback (a type without its
// own entry), and one per guard named in the WP. Reference for "same markup
// as before" is `git show 3469ed872:.../states/Responses.tsx` (the pre-
// registry inline JSX this file replaces byte-for-byte, minus the registry
// indirection) — each assertion below targets output that block produced.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.defaultValue === "string") {
        return opts.defaultValue as string
      }
      return key
    },
  }),
}))

vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    container: () => ({}),
    item: () => ({}),
    spring: {},
    reduced: false,
  }),
}))

vi.mock("use-sound", () => ({
  default: () => [vi.fn(), { stop: vi.fn() }],
}))

vi.mock("@razzoozle/web/features/game/stores/sound", () => ({
  useSoundStore: (selector: (s: { muted: boolean }) => unknown) =>
    selector({ muted: false }),
}))

vi.mock("@razzoozle/web/features/game/utils/sfx", () => ({
  useSoundUrl: () => "/sounds/mock.mp3",
}))

type ShowResponses = ManagerStatusDataMap["SHOW_RESPONSES"]

const base: ShowResponses = {
  question: "What is the answer?",
  responses: { 0: 3, 1: 1 },
  solutions: [0],
  answers: ["Option A", "Option B"],
}

const render = (data: Partial<ShowResponses>) =>
  renderToStaticMarkup(<Responses data={{ ...base, ...data }} />)

describe("Responses (registry wiring, MUI-02d)", () => {
  it("type-answer: renders accepted-answers legend + text responses, no bar-chart legend", () => {
    const html = render({
      type: "type-answer",
      textResponses: { Paris: 4, Berlin: 1 },
      acceptedAnswers: ["Paris"],
      matchMode: "normalized",
    })
    expect(html).toContain("Paris")
    expect(html).toContain("Berlin")
    // Accepted-answers legend marker (mb-4 flex flex-wrap gap-2 wrapper).
    expect(html).toContain("mb-4 flex flex-wrap gap-2")
    // Bar-chart AnswerButton legend must not render for type-answer (guard,
    // Z. 434-444 in the pre-registry file): "Option A"/"Option B" only ever
    // appear via that legend's <Markdown>{answer}</Markdown>.
    expect(html).not.toContain("Option A")
    expect(html).not.toContain("Option B")
  })

  it("sentence-builder: renders correctChunks reveal, NOT the accepted-answers legend (guard)", () => {
    const html = render({
      type: "sentence-builder",
      textResponses: { "the cat sat": 2 },
      acceptedAnswers: ["irrelevant for sentence-builder"],
      correctChunks: ["the", "cat", "sat"],
    })
    // Guard: accepted-answers legend is type-answer only.
    expect(html).not.toContain("mb-4 flex flex-wrap gap-2")
    expect(html).toContain("the")
    expect(html).toContain("cat")
    expect(html).toContain("sat")
  })

  it("brainstorm: renders ranked text responses", () => {
    const html = render({
      type: "brainstorm",
      textResponses: { Idea1: 5, Idea2: 2 },
    })
    expect(html).toContain("Idea1")
    expect(html).toContain("Idea2")
  })

  it("slider: renders correct value, unit and average guess", () => {
    const html = render({
      type: "slider",
      correct: 42,
      unit: "kg",
      averageGuess: 37,
    })
    expect(html).toContain("42")
    expect(html).toContain("kg")
  })

  it("mathematik guard: WITH correctAnswer renders the reveal block", () => {
    const html = render({ type: "mathematik", correctAnswer: "7" })
    expect(html).toContain("7")
  })

  it("mathematik guard: WITHOUT correctAnswer falls through to the bar chart (today's behaviour), not a crash", () => {
    const html = render({ type: "mathematik", correctAnswer: undefined })
    // Bar chart renders one bar per answer (grid-template-columns marker).
    expect(html).toContain("grid-template-columns:repeat(2, 1fr)")
  })

  it("wortarten: renders the reveal block when correctAnswer is present", () => {
    const html = render({ type: "wortarten", correctAnswer: "Nomen" })
    expect(html).toContain("Nomen")
  })

  it("fill-blank guard: WITH non-empty correctOptions renders the legend", () => {
    const html = render({
      type: "fill-blank",
      correctOptions: ["Katze", "Hund"],
    })
    expect(html).toContain("Katze")
    expect(html).toContain("Hund")
  })

  it("fill-blank guard: WITH empty correctOptions renders nothing for the reveal block", () => {
    const html = render({ type: "fill-blank", correctOptions: [] })
    expect(html).not.toContain("Katze")
  })

  it("matching guard: WITH non-empty correctMatches renders the legend", () => {
    const html = render({
      type: "matching",
      correctMatches: ["A-1", "B-2"],
    })
    expect(html).toContain("A-1")
    expect(html).toContain("B-2")
  })

  it("matching guard: WITH empty correctMatches renders nothing for the reveal block", () => {
    const html = render({ type: "matching", correctMatches: [] })
    expect(html).not.toContain("A-1")
  })

  it("drop-pin guard: WITH media/answer/hotspot renders the reveal block", () => {
    const html = render({
      type: "drop-pin",
      media: { url: "https://example.test/map.png" },
      correctAnswer: "Berlin",
      correctHotspotIndex: 2,
    })
    expect(html).toContain("https://example.test/map.png")
    expect(html).toContain("Berlin")
  })

  it("drop-pin guard: WITHOUT media/answer/hotspot renders nothing for the reveal block", () => {
    const html = render({
      type: "drop-pin",
      media: undefined,
      correctAnswer: undefined,
      correctHotspotIndex: undefined,
    })
    expect(html).not.toContain("<img")
  })

  it("word-cloud: renders submitted words", () => {
    const html = render({
      type: "word-cloud",
      textResponses: { Sonne: 3, Regen: 1 },
    })
    expect(html).toContain("Sonne")
    expect(html).toContain("Regen")
  })

  it.each(["choice", "boolean", "poll", "multiple-select"] as const)(
    "%s: renders the answer-distribution bar chart",
    (type) => {
      const html = render({ type })
      expect(html).toContain("grid-template-columns:repeat(2, 1fr)")
      // Response counts from `responses` are rendered per bar.
      expect(html).toContain(">3<")
      expect(html).toContain(">1<")
    },
  )

  it("default fallback: a type without its own registry entry (e.g. sequencing) renders the Vorgabe-Darstellung, not a crash or blank area", () => {
    const html = render({ type: "sequencing" })
    expect(html).toContain('data-testid="question-type-display-sequencing"')
    expect(html).toContain('data-testid="question-type-icon"')
  })

  it("AnswerButton legend renders for bar-chart types (choice) but not for slider", () => {
    const choiceHtml = render({ type: "choice" })
    const sliderHtml = render({ type: "slider", correct: 1 })
    expect(choiceHtml).toContain("Option A")
    expect(sliderHtml).not.toContain("Option A")
  })
})
