// e2e/verify-525-unscored-types.spec.ts — standalone verification script for
// issue #525: can the four unscored question types (word-cloud, brainstorm,
// confidence, micro-lesson) be CREATED and SAVED in the manager's question
// editor, and does the saved state survive a hard page reload?
//
// This is a one-off verification harness (dispatched by the team lead),
// following the same manager-login pattern as answer-flow.spec.ts. It does
// not touch game-play at all — it only drives the /manager/quizz editor UI.
//
// Run:
//   E2E_BASE_URL=https://rust.razzoozle.xyz E2E_PW=*** \
//     ./node_modules/.bin/playwright test verify-525-unscored-types.spec.ts
import { test, expect, type Page } from "@playwright/test"

const E2E_USER = process.env.E2E_USER ?? "admin"

type UnscoredType = "word-cloud" | "brainstorm" | "confidence" | "micro-lesson"

interface TypeSpec {
  type: UnscoredType
  /** Exact button label text (quizz:type.*) as rendered in the type picker. */
  typeLabel: string
  questionText: string
  /** Two seed terms / content lines; undefined for types with no answers UI. */
  lines?: [string, string]
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

async function managerLogin(page: Page) {
  const password = process.env.E2E_PW
  if (!password) {
    throw new Error("E2E_PW env is required for manager login")
  }
  await page.goto("/manager")
  await page.getByTestId("login-username").fill(E2E_USER)
  await page.getByTestId("login-password").fill(password)
  await page.getByTestId("login-submit").click()
  // Successful login lands on /manager/config/<default tab> (client nav).
  await expect(page).toHaveURL(/\/manager\/config/, { timeout: 30_000 })
}

/** Select a question type in the editor's type-picker grid by its DE label. */
async function selectType(page: Page, typeLabel: string) {
  const radio = page.getByRole("radio").filter({ hasText: typeLabel }).first()
  await radio.click()
  await expect(radio).toHaveAttribute("aria-checked", "true")
}

async function fillQuestionText(page: Page, text: string) {
  await page.getByLabel("Frage", { exact: true }).fill(text)
}

async function fillTwoAnswerLines(page: Page, a: string, b: string) {
  await page.getByLabel("Antwort A", { exact: true }).fill(a)
  await page.getByLabel("Antwort B", { exact: true }).fill(b)
}

/** Configure the currently-selected slide as the given unscored type. */
async function configureQuestion(page: Page, spec: TypeSpec) {
  await selectType(page, spec.typeLabel)
  await fillQuestionText(page, spec.questionText)
  if (spec.lines) {
    await fillTwoAnswerLines(page, spec.lines[0], spec.lines[1])
  }
}

/** Select slide N (1-based visual index, matches "Folie N" aria-label). */
async function selectSlide(page: Page, n: number) {
  await page.getByRole("button", { name: `Folie ${n}`, exact: true }).click()
}

/** Assert the currently-selected slide matches the given spec. */
async function assertQuestionMatches(page: Page, spec: TypeSpec) {
  const radio = page.getByRole("radio").filter({ hasText: spec.typeLabel }).first()
  await expect(
    radio,
    `type radio for ${spec.type} should be checked`,
  ).toHaveAttribute("aria-checked", "true")
  await expect(
    page.getByLabel("Frage", { exact: true }),
    `question text for ${spec.type}`,
  ).toHaveValue(spec.questionText)
  if (spec.lines) {
    await expect(page.getByLabel("Antwort A", { exact: true })).toHaveValue(
      spec.lines[0],
    )
    await expect(page.getByLabel("Antwort B", { exact: true })).toHaveValue(
      spec.lines[1],
    )
  } else {
    // confidence: no answers UI at all (QuestionEditorAnswers returns null).
    await expect(page.getByLabel(/^Antwort /)).toHaveCount(0)
  }
}

test("WP-525: word-cloud / brainstorm / confidence / micro-lesson — create, save, reload", async ({
  page,
}) => {
  test.setTimeout(180_000)

  // The app's language detector reads localStorage before falling back to the
  // browser's navigator.language. Force "de" up front so button/aria-label
  // text matches the DE locale strings this spec asserts against — otherwise
  // Playwright's default en-US context renders the whole editor in English.
  await page.addInitScript(() => {
    window.localStorage.setItem("i18nextLng", "de")
  })

  const subject = `E2E-525-Verify-${Date.now()}`

  const specs: TypeSpec[] = [
    {
      type: "word-cloud",
      typeLabel: "Wortwolke",
      questionText: "Welche Begriffe fallen dir zu Photosynthese ein?",
      lines: ["Licht", "Chlorophyll"],
    },
    {
      type: "brainstorm",
      typeLabel: "Brainstorming",
      questionText: "Sammelt Ideen für ein nachhaltiges Klassenzimmer",
      lines: ["Mülltrennung", "Pflanzen"],
    },
    {
      type: "confidence",
      typeLabel: "Selbsteinschätzung",
      questionText: "Wie sicher fühlst du dich beim Thema Bruchrechnung?",
    },
    {
      type: "micro-lesson",
      typeLabel: "Mikro-Lektion",
      questionText: "Kurzlektion: Der Wasserkreislauf",
      lines: ["Verdunstung steigt auf", "Kondensation bildet Wolken"],
    },
  ]

  await test.step("manager login", async () => {
    await managerLogin(page)
  })

  await test.step("open blank quiz editor", async () => {
    await page.goto("/manager/quizz")
    await expect(page.locator("#quizz-subject-input")).toBeVisible({
      timeout: 30_000,
    })
    await page.locator("#quizz-subject-input").fill(subject)
  })

  await test.step("create one question per unscored type", async () => {
    // Slide 1 already exists (default "choice" question) — configure in place.
    await configureQuestion(page, specs[0])

    for (const spec of specs.slice(1)) {
      await page.getByRole("button", { name: "Frage hinzufügen" }).click()
      await configureQuestion(page, spec)
    }
  })

  await test.step("save", async () => {
    // Accessible name is "Speichern Ungespeicherte Änderungen" (concatenated
    // with the unsaved-changes status pill) — anchor at the start so this
    // doesn't also match the sidebar's "In Katalog speichern" button.
    await page.getByRole("button", { name: /^Speichern/ }).click()
    // Success toast + save-triggered navigation away from the editor.
    await expect(
      page.getByText("Quiz erfolgreich gespeichert"),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page).not.toHaveURL(/\/manager\/quizz$/, { timeout: 30_000 })
  })

  await test.step("find the saved quiz in the manage list and open it (fresh navigation)", async () => {
    await page.goto("/manager/config/quiz")
    const editBtn = page.getByLabel(
      new RegExp(`${escapeRegExp(subject)}.*bearbeiten`),
    )
    await expect(editBtn).toBeVisible({ timeout: 30_000 })
    await editBtn.click()
    await expect(page).toHaveURL(/\/manager\/quizz\/.+/, { timeout: 30_000 })
  })

  await test.step("verify all 4 questions persisted (post-navigation)", async () => {
    for (let i = 0; i < specs.length; i++) {
      await selectSlide(page, i + 1)
      await assertQuestionMatches(page, specs[i])
    }
  })

  await test.step("hard reload + re-verify (proves server persistence, not client cache)", async () => {
    await page.reload()
    await expect(page.locator("#quizz-subject-input")).toHaveValue(subject, {
      timeout: 30_000,
    })
    for (let i = 0; i < specs.length; i++) {
      await selectSlide(page, i + 1)
      await assertQuestionMatches(page, specs[i])
    }
  })

  // Housekeeping: this runs against the live rust.razzoozle.xyz environment,
  // not a throwaway instance — delete the quiz this run created so repeated
  // runs don't accumulate "E2E-525-Verify-*" clutter in the real quiz list.
  await test.step("cleanup: delete the test quiz", async () => {
    await page.goto("/manager/config/quiz")
    const editBtn = page.getByLabel(
      new RegExp(`${escapeRegExp(subject)}.*bearbeiten`),
    )
    await expect(editBtn).toBeVisible({ timeout: 30_000 })
    // Edit + duplicate + overflow-trigger are siblings in the same action
    // group — scope the overflow lookup to that group so it targets THIS
    // row and not some other quiz's "Weitere Optionen" button.
    const actionGroup = editBtn.locator("xpath=..")
    await actionGroup.getByLabel("Weitere Optionen").click()
    await actionGroup.getByRole("menuitem", { name: "Quiz löschen" }).click()
    await page.getByRole("button", { name: "Löschen", exact: true }).click()
    await expect(editBtn).toHaveCount(0, { timeout: 30_000 })
  })
})
