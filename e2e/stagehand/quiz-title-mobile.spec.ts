import { test, expect } from "@playwright/test"
import { Stagehand } from "@browserbasehq/stagehand"

test("Quiz title should be visible on mobile 375px viewport", async ({ page }) => {
  const stagehand = new Stagehand({ page })
  await stagehand.init()

  page.setViewportSize({ width: 375, height: 812 })

  await page.goto("https://rust.razzoozle.xyz/manager/quizz")

  const password = process.env.E2E_PW || "password"
  const loginInput = page.locator('input[type="password"]')
  await loginInput.fill(password)
  await page.locator('button:has-text("Anmelden")').click()

  await page.waitForNavigation()
  await page.waitForSelector("[data-testid=quiz-list]", { timeout: 5000 })

  const quizItem = page.locator("[data-testid=quiz-list] > div").first()
  const titleElement = quizItem.locator("h2, [role=heading]").first()

  const boundingBox = await titleElement.boundingBox()
  expect(boundingBox).not.toBeNull()
  expect(boundingBox!.width).toBeGreaterThan(0)

  const titleText = await titleElement.textContent()
  expect(titleText).toBeTruthy()
  expect(titleText?.length).toBeGreaterThan(0)

  const overflowButton = quizItem.locator("button[aria-haspopup='menu']")
  await expect(overflowButton).toBeVisible()

  await overflowButton.click()

  const menuItem = page.locator("[data-testid=duplicate]")
  await expect(menuItem).toBeVisible()

  await stagehand.close()
})
