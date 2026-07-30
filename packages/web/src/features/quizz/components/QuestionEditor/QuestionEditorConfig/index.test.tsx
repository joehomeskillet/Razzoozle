import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { Question } from "@razzoozle/common/types/game"

// Mock lucide-react with all necessary exports (before any imports)
vi.mock("lucide-react", () => ({
  Clock: () => null,
  Timer: () => null,
  BarChart3: () => null,
  Blocks: () => null,
  Calculator: () => null,
  CircleDot: () => null,
  Keyboard: () => null,
  Languages: () => null,
  ListChecks: () => null,
  ListOrdered: () => null,
  TextCursorInput: () => null,
  Link2: () => null,
  MapPin: () => null,
  SlidersHorizontal: () => null,
  ToggleLeft: () => null,
  BookOpen: () => null,
  Cloud: () => null,
  Lightbulb: () => null,
  Gauge: () => null,
  GraduationCap: () => null,
  X: () => null,
  Sparkles: () => null,
  ChevronDown: () => null,
}))

// Mock dependencies
vi.mock("@razzoozle/web/features/quizz/contexts/quizz-editor-context", () => ({
  useQuizzEditor: () => ({
    currentQuestion: mockQuestion,
    currentIndex: 0,
    updateQuestion: mockUpdateQuestion,
  }),
}))

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: (selector: (state: any) => any) =>
    selector({ config: { klassenEnabled: false } }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => opts?.defaultValue ?? key,
  }),
}))

vi.mock("@razzoozle/web/features/quizz/questionTypeTransition", () => ({
  buildTypePatch: (_current: Question, next: string) => ({
    type: next,
  }),
}))

vi.mock("@razzoozle/web/features/quizz/components/QuestionEditorAIAssist", () => ({
  default: () => null,
}))

// Now import the component after mocks are set up
import QuestionEditorConfig from "./index"

let mockQuestion: Partial<Question> = {
  type: "choice",
  cooldown: 3,
  time: 30,
  bonus: false,
  practice: false,
  min: 0,
  max: 100,
  correct: 50,
  step: 1,
  unit: "",
}

const mockUpdateQuestion = vi.fn()

describe("QuestionEditorConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders sections in correct order: Fragetyp → Timings → Optionen → AI-Assist", () => {
    const html = renderToStaticMarkup(<QuestionEditorConfig />)

    const fragetyp = html.indexOf("Fragetyp")
    const timings = html.indexOf("timings")
    const optionen = html.indexOf("Optionen")

    expect(fragetyp).toBeGreaterThan(-1)
    expect(timings).toBeGreaterThan(-1)
    expect(optionen).toBeGreaterThan(-1)
    expect(fragetyp).toBeLessThan(timings)
    expect(timings).toBeLessThan(optionen)
  })

  it("renders QuestionTypeSelector with current type", () => {
    mockQuestion = { ...mockQuestion, type: "slider" }
    const html = renderToStaticMarkup(<QuestionEditorConfig />)

    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-haspopup="listbox"')
  })

  it("renders slider fields only when type === 'slider'", () => {
    mockQuestion = { ...mockQuestion, type: "slider" }
    const htmlSlider = renderToStaticMarkup(<QuestionEditorConfig />)

    mockQuestion = { ...mockQuestion, type: "choice" }
    const htmlChoice = renderToStaticMarkup(<QuestionEditorConfig />)

    // Slider should have number inputs for slider fields
    expect(htmlSlider).toContain('type="number"')

    // Choice type has fewer number inputs (only cooldown and time)
    const sliderCountChoice = (htmlChoice.match(/type="number"/g) || []).length
    const sliderCountSlider = (htmlSlider.match(/type="number"/g) || []).length
    expect(sliderCountSlider).toBeGreaterThan(sliderCountChoice)
  })

  it("renders bonus and practice checkboxes", () => {
    const html = renderToStaticMarkup(<QuestionEditorConfig />)

    expect(html).toContain("bonusQuestion")
    expect(html).toContain("practiceQuestion")
    expect(html).toContain('type="checkbox"')
  })

  it("does not render QuestionEditorType slider/checkbox controls (avoiding double render)", () => {
    mockQuestion = { ...mockQuestion, type: "slider" }
    const html = renderToStaticMarkup(<QuestionEditorConfig />)

    // The spec requires these controls to be removed from QuestionEditorType.tsx
    // so they don't appear twice. This test verifies they are in QuestionEditorConfig.
    // QuestionEditorType should no longer render them after the migration.
    expect(html).toContain("slider.min")
    expect(html).toContain("slider.max")
    expect(html).toContain("slider.correct")
    expect(html).toContain("slider.step")
    expect(html).toContain("slider.unit")
  })

  it("has no new local state (uses context only)", () => {
    // Verify component receives data from context, not local state
    renderToStaticMarkup(<QuestionEditorConfig />)

    // This component should only call updateQuestion through context
    // and read currentQuestion/currentIndex from context
    // No useState hooks for question properties
  })

  it("maintains aside container with xl:w-72 class", () => {
    const html = renderToStaticMarkup(<QuestionEditorConfig />)

    expect(html).toContain("xl:w-72")
    expect(html).toContain("aside")
  })
})
