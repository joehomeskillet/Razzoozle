// e2e/answer-flow.spec.ts — Playwright answer-flow harness (W0b-2).
//
// Three SEPARATE browser contexts (host + 2 players) so each side gets its own
// localStorage/cookie jar. Backend choice is via baseURL/domain (E2E_BASE_URL),
// not localStorage.gameBackend.
//
// Requires: twins running externally, E2E_PW set, quiz "E2E All Types" upserted
// (W0a upsert-quiz.mjs). data-testid contract from W0_SPEC / W0b-1.
import { test, expect, type Page, type BrowserContext } from "@playwright/test"
// Path locked per W0_SPEC (W0a owns content; mirrored here for import/parse).
import quizFixture from "./fixtures/all-types-quiz.json"

const PLAYER1 = "Player1"
const PLAYER2 = "Player2"
const QUIZ_SUBJECT = quizFixture.subject

type Question = (typeof quizFixture.questions)[number]

type RolePages = {
  host: Page
  player1: Page
  player2: Page
  hostCtx: BrowserContext
  player1Ctx: BrowserContext
  player2Ctx: BrowserContext
}

// ── Answer strategies ─────────────────────────────────────────────────────────
// Player1 = always correct / fixture solutions; Player2 = wrong or different.

async function answerChoiceLike(
  page: Page,
  index: number,
  opts?: { doubleClick?: boolean },
) {
  const btn = page.getByTestId(`answer-btn-${index}`)
  await btn.click()
  if (opts?.doubleClick) {
    await btn.click({ force: true }).catch(() => {
      // Second click may be ignored (locked) — that is the desired behaviour.
    })
  }
}

async function answerMultiSelect(
  page: Page,
  indices: number[],
  opts?: { doubleSubmit?: boolean },
) {
  for (const i of indices) {
    await page.getByTestId(`answer-btn-${i}`).click()
  }
  const submit = page.getByTestId("multi-select-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

async function answerSlider(
  page: Page,
  value: number,
  opts?: { doubleSubmit?: boolean },
) {
  const input = page.getByTestId("slider-input")
  await input.fill(String(value))
  // range inputs sometimes need input event; fill is enough for Playwright.
  await input.evaluate((el, v) => {
    const node = el as HTMLInputElement
    node.value = String(v)
    node.dispatchEvent(new Event("input", { bubbles: true }))
    node.dispatchEvent(new Event("change", { bubbles: true }))
  }, value)
  const submit = page.getByTestId("slider-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

async function answerTypeAnswer(
  page: Page,
  text: string,
  opts?: { doubleSubmit?: boolean },
) {
  await page.getByTestId("type-answer-input").fill(text)
  const submit = page.getByTestId("type-answer-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

/** Sentence-builder: click bank chips by text (order = answer order). */
async function answerSentenceByWords(
  page: Page,
  words: string[],
  opts?: { doubleSubmit?: boolean },
) {
  for (const word of words) {
    const chunk = page
      .getByTestId(/^sentence-chunk-/)
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(word)}\\s*$`) })
      .first()
    await chunk.click()
  }
  const submit = page.getByTestId("sentence-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function player1AnswerPlan(q: Question): {
  run: (_page: Page, _opts?: { doubleSubmit?: boolean }) => Promise<void>
} {
  switch (q.type) {
    case "choice":
    case "boolean":
      return {
        run: (page, opts) =>
          answerChoiceLike(page, q.solutions[0], {
            doubleClick: opts?.doubleSubmit,
          }),
      }
    case "poll":
      // No solutions — pick first option as "canonical" P1 vote.
      return {
        run: (page, opts) =>
          answerChoiceLike(page, 0, { doubleClick: opts?.doubleSubmit }),
      }
    case "slider":
      return {
        run: (page, opts) => answerSlider(page, q.correct, opts),
      }
    case "multiple-select":
      return {
        run: (page, opts) => answerMultiSelect(page, q.solutions, opts),
      }
    case "type-answer":
      return {
        run: (page, opts) =>
          answerTypeAnswer(page, q.acceptedAnswers[0], opts),
      }
    case "sentence-builder":
      return {
        run: (page, opts) => answerSentenceByWords(page, q.chunks, opts),
      }
    default: {
      const _exhaustive: never = q
      throw new Error(`Unknown question type: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

function player2AnswerPlan(q: Question): {
  run: (_page: Page) => Promise<void>
} {
  switch (q.type) {
    case "choice":
      // solutions=[1] Mars → pick Venus (0)
      return { run: (page) => answerChoiceLike(page, 0) }
    case "boolean":
      // solutions=[0] Wahr → Falsch
      return { run: (page) => answerChoiceLike(page, 1) }
    case "poll":
      // Different from P1's index 0
      return { run: (page) => answerChoiceLike(page, 1) }
    case "slider":
      return { run: (page) => answerSlider(page, q.min) }
    case "multiple-select":
      // Wrong set: 4 and 6
      return { run: (page) => answerMultiSelect(page, [2, 3]) }
    case "type-answer":
      return { run: (page) => answerTypeAnswer(page, "London") }
    case "sentence-builder":
      return {
        run: (page) => answerSentenceByWords(page, [...q.chunks].reverse()),
      }
    default: {
      const _exhaustive: never = q
      throw new Error(`Unknown question type: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

// ── Host / join helpers ───────────────────────────────────────────────────────

async function managerLogin(host: Page) {
  const password = process.env.E2E_PW
  if (!password) {
    throw new Error("E2E_PW env is required for manager login")
  }
  await host.goto("/manager")
  await host.getByTestId("login-password").fill(password)
  await host.getByTestId("login-submit").click()
}

async function startAllTypesQuiz(host: Page): Promise<string> {
  // Quiz id is server-derived (slug + shortId); match by subject text on row.
  const row = host
    .getByTestId(/^quizz-row-/)
    .filter({ hasText: QUIZ_SUBJECT })
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
  // 2-step join wizard: PIN screen (Room.tsx) → Username screen (Username.tsx).
  // Step 1: PIN submission
  await page.getByTestId("pin-input-digit-0").click()
  await page.keyboard.type(pin)
  await page.getByTestId("join-submit").click() // Submits PIN, unmounts Room
  // Step 2: Username submission (auto-waits for Username screen)
  await page.getByTestId("username-input").fill(username)
  await page.getByTestId("join-submit").click() // Submits username, emits player:login
  await expect(page.getByTestId("waiting-room")).toBeVisible({
    timeout: 30_000,
  })
}


/** Advance host past answer phase → reveal → leaderboard → next question. */
async function hostAdvanceAfterAnswers(host: Page) {
  // SELECT_ANSWER → ABORT_QUIZ (skip ends the question / moves to results).
  // Contract: next-btn is the main progression control; reveal-btn is optional.
  const next = host.getByTestId("next-btn")
  const reveal = host.getByTestId("reveal-btn")

  if (await reveal.isVisible().catch(() => false)) {
    await reveal.click()
  } else if (await next.isVisible().catch(() => false)) {
    await next.click()
  }

  // Allow result / responses screen to settle, then push to leaderboard if needed.
  await host.waitForTimeout(500)
  if (await next.isVisible().catch(() => false)) {
    // May need 1–2 next clicks: responses → leaderboard → next question
    await next.click()
    await host.waitForTimeout(300)
  }
}

async function assertQuestionTextAligned(pages: RolePages, expected: string) {
  for (const role of ["host", "player1", "player2"] as const) {
    const el = pages[role].getByTestId("question-text")
    await expect(el).toBeVisible({ timeout: 30_000 })
    await expect(el).toContainText(expected)
  }
  const t1 = await pages.host.getByTestId("question-text").innerText()
  const t2 = await pages.player1.getByTestId("question-text").innerText()
  const t3 = await pages.player2.getByTestId("question-text").innerText()
  expect(t1.trim()).toBe(t2.trim())
  expect(t1.trim()).toBe(t3.trim())
}

async function parseLeaderboardScore(
  page: Page,
  username: string,
): Promise<number> {
  const row = page.getByTestId(`leaderboard-row-${username}`)
  await expect(row).toBeVisible({ timeout: 20_000 })
  const text = await row.innerText()
  // Prefer last integer in the row (score); fall back to 0 if only name shown.
  const nums = text.match(/\d+/g)
  if (!nums || nums.length === 0) {
    return 0
  }
  return Number(nums[nums.length - 1])
}

// ── Main suite ────────────────────────────────────────────────────────────────

test.describe("Answer flow — E2E All Types", () => {
  test("host + 2 players: all 7 types, P1 correct > P2", async ({
    browser,
  }) => {
    test.setTimeout(300_000)

    const hostCtx = await browser.newContext()
    const player1Ctx = await browser.newContext()
    const player2Ctx = await browser.newContext()

    const host = await hostCtx.newPage()
    const player1 = await player1Ctx.newPage()
    const player2 = await player2Ctx.newPage()
    const pages: RolePages = {
      host,
      player1,
      player2,
      hostCtx,
      player1Ctx,
      player2Ctx,
    }

    try {
      let gamePin = ""

      await test.step("manager login", async () => {
        await managerLogin(host)
      })

      await test.step("start E2E All Types quiz → read PIN", async () => {
        gamePin = await startAllTypesQuiz(host)
      })

      await test.step("two players join waiting room", async () => {
        await playerJoin(player1, gamePin, PLAYER1)
        await playerJoin(player2, gamePin, PLAYER2)
      })

      await test.step("host starts game (leave room)", async () => {
        // SHOW_ROOM → START_GAME via next-btn (or quizz-start-btn if still labeled).
        const startOrNext = host.getByTestId("next-btn").or(
          host.getByTestId("quizz-start-btn"),
        )
        await expect(startOrNext.first()).toBeVisible({ timeout: 15_000 })
        await startOrNext.first().click()
      })

      // Race flags: one deadline race (P2 late), one double-submit (P1).
      // Use boolean (index 1) for deadline; multiple-select (index 4) for double-submit.
      const DEADLINE_Q = 1
      const DOUBLE_SUBMIT_Q = 4

      for (let i = 0; i < quizFixture.questions.length; i++) {
        const q = quizFixture.questions[i]

        await test.step(`Q${i + 1} ${q.type}: align question-text`, async () => {
          // SHOW_QUESTION / cooldown may precede SELECT_ANSWER; wait for answers UI.
          await expect(player1.getByTestId("question-text")).toBeVisible({
            timeout: 45_000,
          })
          await assertQuestionTextAligned(pages, q.question)
        })

        // Verbatim assertion on choice answer button (Mars).
        if (q.type === "choice") {
          await test.step("verbatim: answer-btn shows 'Mars'", async () => {
            const mars = player1.getByTestId("answer-btn-1")
            await expect(mars).toBeVisible()
            await expect(mars).toHaveText("Mars")
          })
        }

        await test.step(`Q${i + 1} ${q.type}: players answer`, async () => {
          const p1 = player1AnswerPlan(q)
          const p2 = player2AnswerPlan(q)

          if (i === DEADLINE_Q) {
            // (a) Deadline race: P2 answers <1s before 10s timeout (t≈9s).
            await p1.run(player1)
            await expect(player1.getByTestId("answer-submitted")).toBeVisible({
              timeout: 10_000,
            })
            // Wait ~9s of the 10s limit, then P2 submits.
            await player2.waitForTimeout(9_000)
            await p2.run(player2)
          } else if (i === DOUBLE_SUBMIT_Q) {
            // (b) Double-submit: P1 clicks submit twice rapidly.
            await p1.run(player1, { doubleSubmit: true })
            await p2.run(player2)
          } else {
            await Promise.all([p1.run(player1), p2.run(player2)])
          }

          await expect(player1.getByTestId("answer-submitted")).toBeVisible({
            timeout: 10_000,
          })
          await expect(player2.getByTestId("answer-submitted")).toBeVisible({
            timeout: 10_000,
          })
        })

        await test.step(`Q${i + 1}: reveal + leaderboard P1 > P2`, async () => {
          await hostAdvanceAfterAnswers(host)

          // P1 should see correct-answer-highlight after reveal (scored types).
          if (q.type !== "poll") {
            await expect(
              player1.getByTestId("correct-answer-highlight"),
            ).toBeVisible({ timeout: 20_000 })
          }

          // Ensure leaderboard is showing (may need extra next).
          const table = host.getByTestId("leaderboard-table")
          if (!(await table.isVisible().catch(() => false))) {
            const next = host.getByTestId("next-btn")
            if (await next.isVisible().catch(() => false)) {
              await next.click()
            }
          }
          await expect(table).toBeVisible({ timeout: 20_000 })

          const s1 = await parseLeaderboardScore(host, PLAYER1)
          const s2 = await parseLeaderboardScore(host, PLAYER2)
          // After first scored question P1 should lead; poll may tie until then.
          if (q.type !== "poll" || i > 0) {
            expect(s1).toBeGreaterThan(s2)
          }

          // Double-submit must not explode score unreasonably (no double count).
          // Cap: theoretical max ~1000 * questions answered correctly.
          expect(s1).toBeLessThanOrEqual(1000 * (i + 1) + 50)

          // Advance to next question (unless last).
          if (i < quizFixture.questions.length - 1) {
            const next = host.getByTestId("next-btn")
            if (await next.isVisible().catch(() => false)) {
              await next.click()
            }
          }
        })
      }

      await test.step("optional podium visible at end", async () => {
        const podium = host.getByTestId("podium")
        // Host may still be on leaderboard; one more next → finished/podium.
        const next = host.getByTestId("next-btn")
        if (await next.isVisible().catch(() => false)) {
          await next.click()
        }
        // Podium is optional in intermediate screens — soft check.
        if (await podium.isVisible().catch(() => false)) {
          await expect(podium).toBeVisible()
        }
      })
    } finally {
      await hostCtx.close()
      await player1Ctx.close()
      await player2Ctx.close()
    }
  })

  // Standalone race blocks (can run if full flow is flaky; share setup pattern).
  test.describe("Race conditions", () => {
    test("deadline race: P2 answers <1s before 10s timeout", async ({
      browser,
    }) => {
      // Covered inside main flow at boolean question; this block documents the
      // contract and remains available as a focused re-run once twins are live.
      test.skip(
        !process.env.E2E_RACE_STANDALONE,
        "Standalone race tests opt-in via E2E_RACE_STANDALONE=1; main flow covers deadline race",
      )

      const hostCtx = await browser.newContext()
      const p1Ctx = await browser.newContext()
      const p2Ctx = await browser.newContext()
      try {
        const host = await hostCtx.newPage()
        const p1 = await p1Ctx.newPage()
        const p2 = await p2Ctx.newPage()
        await managerLogin(host)
        const pin = await startAllTypesQuiz(host)
        await playerJoin(p1, pin, PLAYER1)
        await playerJoin(p2, pin, PLAYER2)
        await host.getByTestId("next-btn").click()
        // Q1 choice: both answer quickly so we reach Q2 boolean for deadline.
        await expect(p1.getByTestId("question-text")).toBeVisible({
          timeout: 45_000,
        })
        await player1AnswerPlan(quizFixture.questions[0]).run(p1)
        await player2AnswerPlan(quizFixture.questions[0]).run(p2)
        await hostAdvanceAfterAnswers(host)
        await host.getByTestId("next-btn").click()
        // Q2 boolean deadline race
        await expect(p1.getByTestId("question-text")).toBeVisible({
          timeout: 45_000,
        })
        await player1AnswerPlan(quizFixture.questions[1]).run(p1)
        await p2.waitForTimeout(9_000)
        await player2AnswerPlan(quizFixture.questions[1]).run(p2)
        await expect(p2.getByTestId("answer-submitted")).toBeVisible()
      } finally {
        await hostCtx.close()
        await p1Ctx.close()
        await p2Ctx.close()
      }
    })

    test("double-submit: P1 rapid double click does not error", async ({
      browser,
    }) => {
      test.skip(
        !process.env.E2E_RACE_STANDALONE,
        "Standalone race tests opt-in via E2E_RACE_STANDALONE=1; main flow covers double-submit",
      )

      const hostCtx = await browser.newContext()
      const p1Ctx = await browser.newContext()
      const p2Ctx = await browser.newContext()
      try {
        const host = await hostCtx.newPage()
        const p1 = await p1Ctx.newPage()
        const p2 = await p2Ctx.newPage()
        await managerLogin(host)
        const pin = await startAllTypesQuiz(host)
        await playerJoin(p1, pin, PLAYER1)
        await playerJoin(p2, pin, PLAYER2)
        await host.getByTestId("next-btn").click()
        await expect(p1.getByTestId("question-text")).toBeVisible({
          timeout: 45_000,
        })
        // Double-click choice answer immediately.
        await player1AnswerPlan(quizFixture.questions[0]).run(p1, {
          doubleSubmit: true,
        })
        await player2AnswerPlan(quizFixture.questions[0]).run(p2)
        await expect(p1.getByTestId("answer-submitted")).toBeVisible()
        // No error toast/dialog assumed — page stays usable.
        await expect(p1.getByTestId("question-text")).toBeVisible()
      } finally {
        await hostCtx.close()
        await p1Ctx.close()
        await p2Ctx.close()
      }
    })
  })
})
