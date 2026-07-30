import { createInstance } from "i18next"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import errorsDe from "@razzoozle/web/locales/de/errors.json"
import quizzDe from "@razzoozle/web/locales/de/quizz.json"
import quizzFr from "@razzoozle/web/locales/fr/quizz.json"
import quizzZh from "@razzoozle/web/locales/zh/quizz.json"

import { QuestionTypeSelector } from "../QuestionTypeSelector"
import type { QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"

// Mocked useManagerStore — allows test to control klassenEnabled
const managerStoreConfig = vi.hoisted(() => ({
  config: null as any,
}))

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: (selector: (s: any) => any) =>
    selector({ config: managerStoreConfig.config }),
}))

/**
 * Helper: Render QuestionTypeSelector with i18n provider
 * Note: SSR rendering only supports closed state (no Portal in Node)
 */
const renderComponent = async (
  currentType: QuestionTypeKey,
  onTypeChange = vi.fn(),
  excludeTypes?: QuestionTypeKey[],
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
        currentType={currentType}
        onTypeChange={onTypeChange}
        excludeTypes={excludeTypes}
      />
    </I18nextProvider>,
  )

  return html
}

describe("QuestionTypeSelector (SSR, Dropdown)", () => {
  beforeEach(() => {
    managerStoreConfig.config = null
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ===== CLOSED STATE TESTS (SSR-compatible) =====

  /**
   * Test 1: Closed state renders trigger button with correct structure
   */
  it("renders closed trigger button with current type", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent("choice")

    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label=')
  })

  /**
   * Test 2: Closed state does NOT render listbox
   */
  it("does not render listbox when closed", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent("choice")

    expect(html).not.toContain('role="listbox"')
    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-expanded="false"')
  })

  /**
   * Test 3: Closed state shows active type on trigger
   */
  it("displays active type label on closed trigger", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent("slider")

    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-label=')
  })

  /**
  /**
   * Test 4: Trigger has chevron indicator (CSS-based, no testid)
   */
  it("has visual chevron indicator on trigger", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent("choice")

    expect(html).toContain("border-r-2")
    expect(html).toContain("border-b-2")
  })

  /**
   * Test 5: Trigger styling for closed state
   */
  it("has correct styling for closed trigger", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent("choice")

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('data-testid="question-type-trigger"')
  })

  /**
   * Test 6: Works with klassenEnabled=false
   */
  it("renders correctly when klassenEnabled=false", async () => {
    managerStoreConfig.config = { klassenEnabled: false } as any
    const html = await renderComponent("choice")

    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-expanded="false"')
  })

  /**
   * Test 7: Respects excludeTypes (UI filter)
   */
  it("renders trigger regardless of excludeTypes filter", async () => {
    managerStoreConfig.config = { klassenEnabled: false } as any
    const html = await renderComponent("choice", vi.fn(), ["poll"])

    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-expanded="false"')
  })

  /**
   * Test 8: Locale robustness — French
   */
  it("renders French locale without error on trigger", async () => {
    managerStoreConfig.config = { klassenEnabled: false } as any
    const html = await renderComponent(
      "choice",
      vi.fn(),
      [],
      { quizz: quizzFr, errors: errorsDe },
    )

    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-expanded="false"')
  })

  /**
   * Test 9: Locale robustness — Chinese
   */
  it("renders Chinese locale without error on trigger", async () => {
    managerStoreConfig.config = { klassenEnabled: false } as any
    const html = await renderComponent(
      "choice",
      vi.fn(),
      [],
      { quizz: quizzZh, errors: errorsDe },
    )

    expect(html).toContain('data-testid="question-type-trigger"')
    expect(html).toContain('aria-expanded="false"')
  })

  /**
   * Test 10: Label section always renders
   */
  it("renders label section with correct structure", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent("choice")

    expect(html).toContain("text-xs")
    expect(html).toContain("font-semibold")
    expect(html).toContain("text-[var(--ink-subtle)]")
  })

  /**
   * Test 11: Trigger has complete A11y attributes
   */
  it("trigger has complete accessibility structure", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent("choice")

    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label=')
  })

  /**
   * Test 12: Button element with correct type
   */
  it("trigger is a button element with type=button", async () => {
    managerStoreConfig.config = { klassenEnabled: true } as any
    const html = await renderComponent("choice")

    expect(html).toContain('type="button"')
    expect(html).toContain('data-testid="question-type-trigger"')
  })
})
