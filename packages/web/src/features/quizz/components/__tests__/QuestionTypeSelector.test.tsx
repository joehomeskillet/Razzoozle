import { createInstance } from "i18next"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import errorsDe from "@razzoozle/web/locales/de/errors.json"
import quizzDe from "@razzoozle/web/locales/de/quizz.json"
import quizzFr from "@razzoozle/web/locales/fr/quizz.json"
import quizzZh from "@razzoozle/web/locales/zh/quizz.json"

import { QuestionTypeSelector } from "../QuestionTypeSelector"
import { TYPE_META, TYPE_CATEGORIES } from "@razzoozle/web/lib/questionTypeMeta"

// Mocked useManagerStore — allows test to control klassenEnabled
const managerStoreConfig = vi.hoisted(
  () => ({ klassenEnabled: false, config: null }),
)

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: (selector: (s: any) => any) =>
    selector({ config: managerStoreConfig.config }),
}))

/**
 * Helper: Render QuestionTypeSelector with i18n provider
 */
const renderComponent = async (
  currentType: string,
  onTypeChange = vi.fn(),
  excludeTypes?: string[],
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
    <I18nextProvider i18n={i18n}>
      <QuestionTypeSelector
        currentType={currentType as any}
        onTypeChange={onTypeChange}
        excludeTypes={excludeTypes}
      />
    </I18nextProvider>,
  )

  return html
}

describe("QuestionTypeSelector (SSR)", () => {
  beforeEach(() => {
    managerStoreConfig.config = null
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Test 1: All TYPE_META entries rendered with correct count
   * Expects 18 role="radio" when no filter and klassenEnabled=false
   */
  it("renders all 18 TYPE_META entries as radio options", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const html = await renderComponent("choice")

    const radioMatches = html.match(/role="radio"/g) || []
    // 18 entries in TYPE_META (17 from QUESTION_TYPES + vokabelliste)
    expect(radioMatches).toHaveLength(18)
  })

  /**
   * Test 2: klassenEnabled=false filters out class-dependent types
   * Expects 15 radio options (18 - 3 klassen-dependent types)
   * Missing: mathematik, wortarten, vokabelliste
   */
  it("excludes class-dependent types when klassenEnabled=false", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const html = await renderComponent("choice")

    const radioMatches = html.match(/role="radio"/g) || []
    expect(radioMatches).toHaveLength(15)

    // Verify the three types are not in testids
    expect(html).not.toContain('data-testid="question-type-option-mathematik"')
    expect(html).not.toContain('data-testid="question-type-option-wortarten"')
    expect(html).not.toContain('data-testid="question-type-option-vokabelliste"')
  })

  /**
   * Test 3: klassenEnabled=true includes all types
   * Expects 18 radio options
   */
  it("includes all types when klassenEnabled=true", async () => {
    managerStoreConfig.config = { klassenEnabled: true }
    const html = await renderComponent("choice")

    const radioMatches = html.match(/role="radio"/g) || []
    expect(radioMatches).toHaveLength(18)

    // Verify the three klassen-dependent types are present
    expect(html).toContain('data-testid="question-type-option-mathematik"')
    expect(html).toContain('data-testid="question-type-option-wortarten"')
    expect(html).toContain('data-testid="question-type-option-vokabelliste"')
  })

  /**
   * Test 4: excludeTypes prop filters specified types
   * When excluding vokabelliste, expect 14 radio options (15 - 1)
   */
  it("filters types via excludeTypes prop", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const html = await renderComponent("choice", vi.fn(), ["poll"])

    const radioMatches = html.match(/role="radio"/g) || []
    // 15 (after klassenEnabled filter) - 1 (excluded) = 14
    expect(radioMatches).toHaveLength(14)
    expect(html).not.toContain('data-testid="question-type-option-poll"')
  })

  /**
   * Test 5: aria-checked set to true only for currentType
   * aria-checked="true" appears exactly once, aria-checked="false" for all others
   */
  it("sets aria-checked=true only for currentType", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const currentType = "slider"
    const html = await renderComponent(currentType)

    // Exactly one aria-checked="true"
    const ariaCheckedTrue = html.match(/aria-checked="true"/g) || []
    expect(ariaCheckedTrue).toHaveLength(1)

    // Verify it's on the slider option
    expect(html).toContain('data-testid="question-type-option-slider"')

    // Count aria-checked="false" (should be 14 for klassenEnabled=false, all others)
    const ariaCheckedFalse = html.match(/aria-checked="false"/g) || []
    expect(ariaCheckedFalse).toHaveLength(14)
  })

  /**
   * Test 6: Category headers appear in correct order
   * Order: basic → survey → numeric → text → arrangement
   */
  it("renders category headers in fixed order", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const html = await renderComponent("choice")

    // Category label keys from TYPE_CATEGORIES
    const categoryLabels = TYPE_CATEGORIES.map((c) => c.labelKey)
    // Expected i18n keys: quizz:typeCategory.basic, .survey, .numeric, .text, .arrangement

    // Verify labels are rendered (via i18n)
    // In DE locale, these translate to: Basis-Auswahl, Umfrage & Feedback, Numerisch, Text-Eingabe, Anordnung
    expect(html).toContain("Basis-Auswahl")
    expect(html).toContain("Umfrage &amp; Feedback") // & is HTML-escaped
    expect(html).toContain("Numerisch")
    expect(html).toContain("Text-Eingabe")
    expect(html).toContain("Anordnung")

    // Order check: find index of each header and verify order
    const basicIdx = html.indexOf("Basis-Auswahl")
    const surveyIdx = html.indexOf("Umfrage &amp; Feedback")
    const numericIdx = html.indexOf("Numerisch")
    const textIdx = html.indexOf("Text-Eingabe")
    const arrangementIdx = html.indexOf("Anordnung")

    expect(basicIdx < surveyIdx).toBe(true)
    expect(surveyIdx < numericIdx).toBe(true)
    expect(numericIdx < textIdx).toBe(true)
    expect(textIdx < arrangementIdx).toBe(true)
  })

  /**
   * Test 7: Container has correct A11y attributes
   * - role="radiogroup"
   * - aria-label
   * - data-testid="question-type-list"
   */
  it("has correct container accessibility attributes", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const html = await renderComponent("choice")

    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-label="Fragetyp wählen"')
    expect(html).toContain('data-testid="question-type-list"')
  })

  /**
   * Test 8: Each option has data-testid and correct role/tabIndex
   * Every option: role="radio", data-testid="question-type-option-<id>"
   */
  it("each option has required testid and accessibility attributes", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const html = await renderComponent("slider")

    // Verify each non-klassen-dependent type has testid and role
    const nonKlassenTypes = TYPE_META.filter((t) => !t.requiresKlassen)
    for (const type of nonKlassenTypes) {
      expect(html).toContain(`data-testid="question-type-option-${type.id}"`)
    }

    // Verify role="radio" appears
    expect(html).toContain('role="radio"')
  })

  /**
   * Test 9: Roving tabIndex — exactly one element has tabIndex=0
   * All other options have tabIndex=-1
   */
  it("roving tabIndex: one selected element with tabIndex=0, others -1", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const currentType = "matching"
    const html = await renderComponent(currentType)

    // Count tabIndex="0" in the rendered HTML string
    const tabIndex0Matches = (html.match(/tabIndex="0"/g) || []).length
    expect(tabIndex0Matches).toBe(1)

    // Count tabIndex="-1" (should be 14 for all other options)
    const tabIndexNeg1Matches = (html.match(/tabIndex="-1"/g) || []).length
    expect(tabIndexNeg1Matches).toBe(14) // 15 total - 1 selected
  })

  /**
   * Test 10: Locale robustness — French locale renders without markup break
   * Verify that long/different French labels render cleanly
   */
  it("renders French locale labels without markup break", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const html = await renderComponent(
      "choice",
      vi.fn(),
      [],
      { quizz: quizzFr },
    )

    // Verify radiogroup and options are present
    expect(html).toMatch(/role="radiogroup"/)
    const radioMatches = html.match(/role="radio"/g) || []
    expect(radioMatches).toHaveLength(15)

    // No escaped angle brackets in the middle of content
    expect(html).not.toMatch(/&lt;|&gt;/)
  })

  /**
   * Test 11: Locale robustness — Chinese locale renders without markup break
   */
  it("renders Chinese locale labels without markup break", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    const html = await renderComponent(
      "choice",
      vi.fn(),
      [],
      { quizz: quizzZh },
    )

    // Verify radiogroup and options are present
    expect(html).toMatch(/role="radiogroup"/)
    const radioMatches = html.match(/role="radio"/g) || []
    expect(radioMatches).toHaveLength(15)

    // No truncated or malformed HTML
    expect(html).not.toMatch(/&lt;|&gt;/)
  })

  /**
   * Test 12: Filtered and excluded types combined
   * klassenEnabled=false + excludeTypes includes both filters
   */
  it("applies both klassenEnabled and excludeTypes filters", async () => {
    managerStoreConfig.config = { klassenEnabled: false }
    // klassenEnabled=false removes 3 types (mathematik, wortarten, vokabelliste)
    // excludeTypes removes 2 more (poll, slider)
    const html = await renderComponent("choice", vi.fn(), ["poll", "slider"])

    const radioMatches = html.match(/role="radio"/g) || []
    // 18 - 3 (klassen) - 2 (excluded) = 13
    expect(radioMatches).toHaveLength(13)

    expect(html).not.toContain('data-testid="question-type-option-mathematik"')
    expect(html).not.toContain('data-testid="question-type-option-poll"')
    expect(html).not.toContain('data-testid="question-type-option-slider"')
  })
})
