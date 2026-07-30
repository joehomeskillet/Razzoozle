// e2e/experience-display-content-free.spec.ts — WP #877 smoke test.
//
// Requires: twins running externally, E2E_PW set, quiz "E2E All Types" upserted
// (same fixture as answer-flow.spec.ts). Sibling of answer-flow.spec.ts by
// design — same login/join/start helpers, single browser context.
//
// Scope: this is the REGRESSION GUARD half of WP #877's content-free display
// projection — a game created WITHOUT an experience mode (the fixture/UI here
// never sets one) must render byte-identically to pre-#877 behaviour on the
// presenter screen: normal question content, no World-Shell blackout. The
// POSITIVE half (an active Experience mode actually renders the World-Shell
// instead of question content) needs a game created with `experienceMode` set
// AND the server's `experienceModesEnabled` allow-list including it — that's
// manager-config-tab territory, not exercised by this quiz-row UI flow, so
// it's intentionally left to a future spec once that config surface has its
// own e2e coverage.
import { expect, test, type Page } from "@playwright/test"
import quizFixture from "./fixtures/all-types-quiz.json" with { type: "json" }

const E2E_USER = process.env.E2E_USER ?? "admin"
const QUIZ_SUBJECT = quizFixture.subject
const PLAYER1 = "ExpDisplayP1"

async function managerLogin(host: Page) {
  const password = process.env.E2E_PW
  if (!password) {
    throw new Error("E2E_PW env is required for manager login")
  }
  await host.goto("/manager")
  await host.getByTestId("login-username").fill(E2E_USER)
  await host.getByTestId("login-password").fill(password)
  await host.getByTestId("login-submit").click()
}

async function startAllTypesQuiz(host: Page): Promise<string> {
  const row = host
    .getByTestId(/^quizz-row-/)
    .filter({ has: host.getByText(QUIZ_SUBJECT, { exact: true }) })
    .first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click()
  await host.getByTestId("quizz-start-btn").click()

  const pinEl = host.getByTestId("game-pin")
  await expect(pinEl).toBeVisible({ timeout: 30_000 })
  const pin = (await pinEl.innerText()).replace(/\s+/g, "").trim()
  expect(pin.length).toBeGreaterThan(0)
  return pin
}

async function playerJoin(page: Page, pin: string, username: string) {
  await page.goto("/")
  await page.getByTestId("pin-input-digit-0").click()
  await page.keyboard.type(pin)
  await page.getByTestId("join-submit").click()
  await page.getByTestId("username-input").fill(username)
  await page.getByTestId("join-submit").click()
  await expect(page.getByTestId("waiting-room")).toBeVisible({
    timeout: 30_000,
  })
}

test.describe("Experience Display Content-Free Payload (WP #877)", () => {
  test("classic-mode game shows question content on the presenter screen (no World-Shell blackout)", async ({
    browser,
  }) => {
    test.setTimeout(120_000)

    const hostCtx = await browser.newContext()
    const playerCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const player = await playerCtx.newPage()

    try {
      await test.step("manager login", async () => {
        await managerLogin(host)
      })

      let pin = ""
      await test.step("start E2E All Types quiz (no experience mode selected)", async () => {
        pin = await startAllTypesQuiz(host)
      })

      await test.step("player joins waiting room", async () => {
        await playerJoin(player, pin, PLAYER1)
      })

      await test.step("host starts game", async () => {
        const startOrNext = host.getByTestId("next-btn").or(
          host.getByTestId("quizz-start-btn"),
        )
        await expect(startOrNext.first()).toBeVisible({ timeout: 15_000 })
        await startOrNext.first().click()
      })

      // Classic mode: register_create's `validated_experience_mode` is None,
      // so status_emit's broadcast_status never emits `game:experience` — the
      // presenter's `experienceTransition` stays null and it falls through to
      // the normal CurrentComponent (Question), exactly like pre-#877.
      await test.step("presenter renders normal question content, not the World-Shell", async () => {
        await expect(host.getByTestId("question-text").first()).toBeVisible({
          timeout: 45_000,
        })
        // The World-Shell has no question-text testid by construction
        // (ExperienceDisplay.test.tsx asserts this); a passing question-text
        // wait above already proves it isn't mounted, this just documents why.
      })
    } finally {
      await hostCtx.close()
      await playerCtx.close()
    }
  })
})
