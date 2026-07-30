// e2e/verify-525-unscored-types.spec.ts
import { test, expect, type Page } from "@playwright/test"

const E2E_USER = process.env.E2E_USER ?? "admin"

type UnscoredType = "word-cloud" | "brainstorm" | "confidence" | "micro-lesson"

interface TypeSpec {
  type: UnscoredType
  typeLabel: string
  questionText: string
  lines?: [string, string]
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

async function managerLogin(page: Page) {
  const password = process.env.E2E_PW
  if (!password) throw new Error("E2E_PW env is required")
  await page.goto("/manager")
  await page.getByTestId("login-username").fill(E2E_USER)
  await page.getByTestId("login-password").fill(password)
  await page.getByTestId("login-submit").click()
  await expect(page).toHaveURL(/\/manager\/config/, { timeout: 30_000 })
}

async function openTypePicker(page: Page) {
  const trigger = page.getByTestId("question-type-trigger")
  await trigger.click()
  await page.getByTestId("question-type-list").waitFor({ state: "visible", timeout: 5_000 })
}

async function closeTypePicker(page: Page) {
  const trigger = page.getByTestId("question-type-trigger")
  await trigger.click()
  await page.getByTestId("question-type-list").waitFor({ state: "hidden", timeout: 5_000 })
}

async function selectType(page: Page, typeLabel: string) {
  await openTypePicker(page)

  const option = page.getByRole("option").filter({ hasText: typeLabel }).first()
  await option.click()

  const dialog = page.getByRole("alertdialog")
  const dialogVisible = await dialog
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false)

  if (dialogVisible) {
    const confirmButton = dialog.getByRole("button").filter({ hasText: "Wechsel bestätigen" }).first()
    await confirmButton.click()
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  }

  await openTypePicker(page)
  const finalOption = page.getByRole("option").filter({ hasText: typeLabel }).first()
  await expect(finalOption).toHaveAttribute("aria-selected", "true")

  // Close picker after verification
  await closeTypePicker(page)
}

async function fillQuestionText(page: Page, text: string) {
  await page.getByLabel("Frage", { exact: true }).fill(text)
}

async function fillTwoAnswerLines(page: Page, a: string, b: string) {
  await page.getByLabel("Antwort A", { exact: true }).fill(a)
  await page.getByLabel("Antwort B", { exact: true }).fill(b)
}

async function configureQuestion(page: Page, spec: TypeSpec) {
  await selectType(page, spec.typeLabel)
  await fillQuestionText(page, spec.questionText)
  if (spec.lines) {
    await fillTwoAnswerLines(page, spec.lines[0], spec.lines[1])
  }
}

async function selectSlide(page: Page, n: number) {
  await page.getByRole("button", { name: `Folie ${n}`, exact: true }).click()
}

async function assertQuestionMatches(page: Page, spec: TypeSpec) {
  // Check selected type by opening picker and verifying aria-selected
  await openTypePicker(page)
  const selectedOption = page.getByRole("option").filter({ hasText: spec.typeLabel }).first()
  await expect(selectedOption).toHaveAttribute("aria-selected", "true")
  await closeTypePicker(page)

  await expect(page.getByLabel("Frage", { exact: true })).toHaveValue(spec.questionText)
  if (spec.lines) {
    await expect(page.getByLabel("Antwort A", { exact: true })).toHaveValue(spec.lines[0])
    await expect(page.getByLabel("Antwort B", { exact: true })).toHaveValue(spec.lines[1])
  } else {
    await expect(page.getByLabel(/^Antwort /)).toHaveCount(0)
  }
}

test("WP-525: word-cloud / brainstorm / confidence / micro-lesson — create, save, reload", async ({
  page,
}) => {
  test.setTimeout(180_000)
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
    await expect(page.locator("#quizz-subject-input")).toBeVisible({ timeout: 30_000 })
    await page.locator("#quizz-subject-input").fill(subject)
  })

  await test.step("create one question per unscored type", async () => {
    await configureQuestion(page, specs[0])
    for (const spec of specs.slice(1)) {
      await page.getByRole("button", { name: "Frage hinzufügen" }).click()
      await configureQuestion(page, spec)
    }
  })

  await test.step("save", async () => {
    await page.getByRole("button", { name: /^Speichern/ }).click()
    await expect(page.getByText("Quiz erfolgreich gespeichert")).toBeVisible({
      timeout: 30_000,
    })
    await expect(page).not.toHaveURL(/\/manager\/quizz$/, { timeout: 30_000 })
  })

  await test.step("find and open the saved quiz", async () => {
    await page.goto("/manager/config/quiz")
    const editBtn = page.getByLabel(new RegExp(`${escapeRegExp(subject)}.*bearbeiten`))
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

  await test.step("hard reload + re-verify", async () => {
    await page.reload()
    await expect(page.locator("#quizz-subject-input")).toHaveValue(subject, {
      timeout: 30_000,
    })
    for (let i = 0; i < specs.length; i++) {
      await selectSlide(page, i + 1)
      await assertQuestionMatches(page, specs[i])
    }
  })

  await test.step("cleanup: delete the test quiz", async () => {
    await page.goto("/manager/config/quiz")
    const editBtn = page.getByLabel(new RegExp(`${escapeRegExp(subject)}.*bearbeiten`))
    await expect(editBtn).toBeVisible({ timeout: 30_000 })
    const actionGroup = editBtn.locator("xpath=..")
    await actionGroup.getByLabel("Weitere Optionen").click()
    await actionGroup.getByRole("menuitem", { name: "Quiz löschen" }).click()
    await page.getByRole("button", { name: "Löschen", exact: true }).click()
    await expect(editBtn).toHaveCount(0, { timeout: 30_000 })
  })
})
