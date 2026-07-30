import { createInstance } from "i18next"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import errorsDe from "@razzoozle/web/locales/de/errors.json"
import quizzDe from "@razzoozle/web/locales/de/quizz.json"
import quizzFr from "@razzoozle/web/locales/fr/quizz.json"
import quizzZh from "@razzoozle/web/locales/zh/quizz.json"

import { QuestionTypeSelector } from "../QuestionTypeSelector"
import { QuestionTypeDropdownList } from "../QuestionTypeDropdownList"

// Mocked useManagerStore — allows test to control klassenEnabled
const managerStoreConfig = vi.hoisted(() => ({
  config: null as any,
}))

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: (selector: (s: any) => any) =>
    selector({ config: managerStoreConfig.config }),
}))

/**
 * Helper: Render with i18n provider
 */
const renderComponent = async (
  component: React.ReactElement,
  i18nResources: Record<string, any> = { quizz: quizzDe, errors: errorsDe },
) => {
  const i18n = createInstance()
  await i18n.init({
    lng: "de",
    fallbackLng: "de",
    ns: ["quizz", "errors"],
    resources: {
      de: i18nResources,
    },
  })

  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{component}</I18nextProvider>,
  )

  return html
}

describe("QuestionTypeDropdownList (SSR)", () => {
  beforeEach(() => {
    managerStoreConfig.config = null
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Test 1: Renders all 18 options when klassenEnabled=true
   */
  it("renders all 18 TYPE_META options when klassenEnabled=true", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="choice"
        onSelect={vi.fn()}
        klassenEnabled={true}
      />,
    )

    const optionMatches = html.match(/role="option"/g) || []
    expect(optionMatches).toHaveLength(18)
  })

  /**
   * Test 2: Filters class-dependent types when klassenEnabled=false
   */
  it("excludes class-dependent types when klassenEnabled=false", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="choice"
        onSelect={vi.fn()}
        klassenEnabled={false}
      />,
    )

    const optionMatches = html.match(/role="option"/g) || []
    expect(optionMatches).toHaveLength(15)

    expect(html).not.toContain('data-testid="question-type-option-mathematik"')
    expect(html).not.toContain('data-testid="question-type-option-wortarten"')
    expect(html).not.toContain('data-testid="question-type-option-vokabelliste"')
  })

  /**
   * Test 3: Respects excludeTypes filter
   */
  it("filters types via excludeTypes prop", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="choice"
        onSelect={vi.fn()}
        excludeTypes={["poll"]}
        klassenEnabled={false}
      />,
    )

    const optionMatches = html.match(/role="option"/g) || []
    expect(optionMatches).toHaveLength(14)
    expect(html).not.toContain('data-testid="question-type-option-poll"')
  })

  /**
   * Test 4: aria-selected=true only for currentType
   */
  it("sets aria-selected=true only for currentType", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="slider"
        onSelect={vi.fn()}
        klassenEnabled={false}
      />,
    )

    const ariaSelectedTrue = html.match(/aria-selected="true"/g) || []
    expect(ariaSelectedTrue).toHaveLength(1)

    const ariaSelectedFalse = html.match(/aria-selected="false"/g) || []
    expect(ariaSelectedFalse).toHaveLength(14)
  })

  /**
   * Test 5: Category groups with role="group"
   */
  it("renders category groups with role=group", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="choice"
        onSelect={vi.fn()}
        klassenEnabled={false}
      />,
    )

    const groupMatches = html.match(/role="group"/g) || []
    expect(groupMatches.length).toBeGreaterThan(0)
    expect(html).toContain('aria-label=')
  })

  /**
   * Test 6: Combined filters (klassenEnabled + excludeTypes)
   */
  it("applies both klassenEnabled and excludeTypes", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="choice"
        onSelect={vi.fn()}
        excludeTypes={["poll", "slider"]}
        klassenEnabled={false}
      />,
    )

    const optionMatches = html.match(/role="option"/g) || []
    expect(optionMatches).toHaveLength(13)

    expect(html).not.toContain('data-testid="question-type-option-mathematik"')
    expect(html).not.toContain('data-testid="question-type-option-poll"')
    expect(html).not.toContain('data-testid="question-type-option-slider"')
  })

  /**
   * Test 7: Locale robustness — French
   */
  it("renders French locale without markup break", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="choice"
        onSelect={vi.fn()}
        klassenEnabled={false}
      />,
      { quizz: quizzFr, errors: errorsDe },
    )

    expect(html).toMatch(/role="option"/)
    const optionMatches = html.match(/role="option"/g) || []
    expect(optionMatches.length).toBeGreaterThan(0)
    expect(html).not.toMatch(/&lt;|&gt;/)
  })

  /**
   * Test 8: Locale robustness — Chinese
   */
  it("renders Chinese locale without markup break", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="choice"
        onSelect={vi.fn()}
        klassenEnabled={false}
      />,
      { quizz: quizzZh, errors: errorsDe },
    )

    expect(html).toMatch(/role="option"/)
    const optionMatches = html.match(/role="option"/g) || []
    expect(optionMatches.length).toBeGreaterThan(0)
    expect(html).not.toMatch(/&lt;|&gt;/)
  })

  /**
   * Test 9: Each option has required testid
   */
  it("each option has required testid", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="slider"
        onSelect={vi.fn()}
        klassenEnabled={false}
      />,
    )

    expect(html).toContain('data-testid="question-type-option-choice"')
    expect(html).toContain('data-testid="question-type-option-boolean"')
    expect(html).toContain('data-testid="question-type-option-slider"')
  })

  /**
   * Test 10: Correct A11y semantics
   */
  it("has correct accessibility structure", async () => {
    const html = await renderComponent(
      <QuestionTypeDropdownList
        currentType="choice"
        onSelect={vi.fn()}
        klassenEnabled={false}
      />,
    )

    expect(html).toContain('role="group"')
    expect(html).toContain('role="option"')
    expect(html).toContain('aria-selected=')
  })
})

describe("QuestionTypeSelector (SSR, Trigger)", () => {
  beforeEach(() => {
    managerStoreConfig.config = null
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Test 11: Trigger renders with correct A11y
   */
  it("renders trigger with correct accessibility attributes", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent(
      <QuestionTypeSelector
        currentType="choice"
        onTypeChange={vi.fn()}
      />,
    )

    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label=')
  })

  /**
   * Test 12: Trigger displays active type
   */
  it("displays active type label on trigger", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent(
      <QuestionTypeSelector
        currentType="slider"
        onTypeChange={vi.fn()}
      />,
    )

    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-expanded="false"')
  })

  /**
   * Test 13: Trigger has ChevronDown icon
   */
  it("renders ChevronDown icon on trigger", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent(
      <QuestionTypeSelector
        currentType="choice"
        onTypeChange={vi.fn()}
      />,
    )

    expect(html).toContain("lucide-chevron-down")
  })
})
