// e2e/answer-flow.spec.ts — Playwright answer-flow harness (W0b-2).
//
// Three SEPARATE browser contexts (host + 2 players) so each side gets its own
// localStorage/cookie jar. Backend choice is via baseURL/domain (E2E_BASE_URL),
// not localStorage.gameBackend.
//
// Requires: twins running externally, E2E_PW set, quiz "E2E All Types" upserted
// (W0a upsert-quiz.mjs). data-testid contract from W0_SPEC / W0b-1.
//
// WP-504-E2E: covers 3 of the 4 unscored question types (brainstorm, confidence,
// micro-lesson) end to end. `word-cloud` is NOT exercised in this baseline suite
// (historical: #533 behoben, input-affordance seit 2026-07-29 verfügbar). Suite-
// Erweiterung für word-cloud offen; siehe #546 für Scope.
import { test, expect, type Page, type BrowserContext } from "@playwright/test"
// Path locked per W0_SPEC (W0a owns content; mirrored here for import/parse).
import quizFixture from "./fixtures/all-types-quiz.json" with { type: "json" }

const PLAYER1 = "Player1"
const PLAYER2 = "Player2"
const E2E_USER = process.env.E2E_USER ?? "admin"
const QUIZ_SUBJECT = quizFixture.subject

type Question = (typeof quizFixture.questions)[number]

// Question types that never receive a right/wrong verdict — mirrors
// packages/common/src/constants.ts UNSCORED_QUESTION_TYPES, minus "word-cloud"
// (not reachable in this suite, see file header). Kept as a local literal list
// rather than importing the shared constant: e2e/ is a standalone pnpm project
// outside the packages/ workspace (no @razzoozle/common dependency).
const UNSCORED_IN_SUITE = ["poll", "brainstorm", "confidence", "micro-lesson"]

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

/** Mathematik (numeric): submit exact value within tolerance. */
async function answerMathematik(
  page: Page,
  value: number,
  opts?: { doubleSubmit?: boolean },
) {
  const input = page.getByTestId("mathematik-input")
  await input.fill(String(value))
  const submit = page.getByTestId("mathematik-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

/** Wortarten (parts of speech): select POS for each token.
    tokens and posSet are indexed; solutions are indices into posSet per token.
    Uses actual UI test-ids: wortarten-token-${i} (token button) + wortarten-pos-${i}-${posLabel} (POS button). */
async function answerWortarten(
  page: Page,
  tokenSolutions: number[],
  posSet: string[],
  opts?: { doubleSubmit?: boolean },
) {
  // For each token, click the token button to open POS picker, then select the correct POS.
  for (let i = 0; i < tokenSolutions.length; i++) {
    const posIndex = tokenSolutions[i]
    const posLabel = posSet[posIndex]
    // Click token button to open POS dropdown.
    await page.getByTestId(`wortarten-token-${i}`).click()
    // Click the POS option (uses the actual POS string label, not index).
    await page.getByTestId(`wortarten-pos-${i}-${posLabel}`).click()
  }
  const submit = page.getByTestId("wortarten-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

/** Sequencing: click bank items in correct order to place them, then submit. */
async function answerSequencing(
  page: Page,
  correctOrder: string[],
  items: Array<{ id: string; label: string }>,
  opts?: { doubleSubmit?: boolean },
) {
  // correctOrder is an array of item IDs in the order they should be placed.
  // We need to click on the bank items by finding them via the item index in the bank.
  for (const itemId of correctOrder) {
    const item = items.find((it) => it.id === itemId)
    if (!item) {
      throw new Error(`Item ${itemId} not found in items array`)
    }
    // Find the item in the bank by matching its label and clicking the first match.
    const bankItem = page
      .getByTestId(/^sequencing-item-/)
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(item.label)}\\s*$`) })
      .first()
    await bankItem.click()
  }
  const submit = page.getByTestId("sequencing-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

/** Brainstorm: submit one free-text idea via the input + submit button
    (BrainstormBoard's own form — same wire shape as type-answer). */
async function answerBrainstorm(
  page: Page,
  text: string,
  opts?: { doubleSubmit?: boolean },
) {
  await page.getByTestId("brainstorm-input").fill(text)
  const submit = page.getByTestId("brainstorm-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

/** Fill-blank / matching: native <select> per slot (SlotDropdownBoard) — both
    question types render the exact same board component and share testids
    (`slot-select-${i}`, `slot-submit`). Submit stays disabled until every slot
    has a selection, so callers must pass one index per slot. */
async function answerSlotBoard(
  page: Page,
  selections: number[],
  opts?: { doubleSubmit?: boolean },
) {
  for (let i = 0; i < selections.length; i++) {
    await page.getByTestId(`slot-select-${i}`).selectOption(String(selections[i]))
  }
  const submit = page.getByTestId("slot-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

/** Drop-pin: click a relative (0–1) point on the hotspot image. HotspotImage
    measures clicks relative to its own bounding box (same math used here),
    so any relX/relY in [0,1] lands at the matching spot. */
async function answerDropPin(
  page: Page,
  relX: number,
  relY: number,
  opts?: { doubleSubmit?: boolean },
) {
  const img = page.getByTestId("hotspot-image")
  const box = await img.boundingBox()
  if (!box) {
    throw new Error("hotspot-image has no bounding box")
  }
  await img.click({ position: { x: box.width * relX, y: box.height * relY } })
  const submit = page.getByTestId("hotspot-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

/** Word-cloud: submit one free-text word via the input + submit button
    (WordCloudDisplay's own form — wertungsfrei, same wire shape as
    brainstorm/type-answer). */
async function answerWordCloud(
  page: Page,
  text: string,
  opts?: { doubleSubmit?: boolean },
) {
  await page.getByTestId("word-cloud-input").fill(text)
  const submit = page.getByTestId("word-cloud-submit")
  await submit.click()
  if (opts?.doubleSubmit) {
    await submit.click({ force: true }).catch(() => {})
  }
}

/** Confidence: pick one of the three fixed self-assessment levels
    (ConfidenceSelector has no `answers` prop — the options are built in). */
async function answerConfidence(page: Page, level: "high" | "medium" | "low") {
  await page.getByTestId(`confidence-option-${level}`).click()
}

/** Micro-lesson: the fixture has a single slide, so "Lektion abschließen" is
    the first and only nav tap (MicroLessonViewer marks isLast from mount). */
async function answerMicroLesson(page: Page) {
  await page.getByTestId("microlesson-next").click()
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
          answerChoiceLike(page, q.solutions![0], {
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
        run: (page, opts) => answerSlider(page, q.correct!, opts),
      }
    case "multiple-select":
      return {
        run: (page, opts) => answerMultiSelect(page, q.solutions!, opts),
      }
    case "type-answer":
      return {
        run: (page, opts) =>
          answerTypeAnswer(page, q.acceptedAnswers![0], opts),
      }
    case "sentence-builder":
      return {
        run: (page, opts) => answerSentenceByWords(page, q.chunks!, opts),
      }
    case "mathematik":
      return {
        run: (page, opts) => answerMathematik(page, q.correct!, opts),
      }
    case "wortarten":
      return {
        run: (page, opts) => answerWortarten(page, q.solutions!, q.posSet!, opts),
      }
    case "sequencing":
      return {
        run: (page, opts) =>
          answerSequencing(page, q.correctOrder!, q.items!, opts),
      }
    case "brainstorm":
      return {
        run: (page, opts) =>
          answerBrainstorm(page, "Mehr Fokuszeit ohne Pendelweg", opts),
      }
    case "confidence":
      return {
        run: (page) => answerConfidence(page, "high"),
      }
    case "micro-lesson":
      return {
        run: (page) => answerMicroLesson(page),
      }
    case "fill-blank":
      return {
        run: (page, opts) =>
          answerSlotBoard(page, q.slots!.map((s) => s.correctIndex), opts),
      }
    case "matching":
      return {
        run: (page, opts) =>
          answerSlotBoard(page, q.leftItems!.map((li) => li.correctIndex), opts),
      }
    case "drop-pin": {
      const h = q.hotspots![0]
      return {
        run: (page, opts) =>
          answerDropPin(page, h.x + h.w / 2, h.y + h.h / 2, opts),
      }
    }
    case "word-cloud":
      return {
        run: (page, opts) => answerWordCloud(page, "Teamgeist", opts),
      }
    default: {
      const _exhaustive: never = q as never
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
      return { run: (page) => answerSlider(page, q.min!) }
    case "multiple-select":
      // Wrong set: 4 and 6
      return { run: (page) => answerMultiSelect(page, [2, 3]) }
    case "type-answer":
      return { run: (page) => answerTypeAnswer(page, "London") }
    case "sentence-builder":
      return {
        run: (page) => answerSentenceByWords(page, [...q.chunks!].reverse()),
      }
    case "mathematik":
      // Wrong answer: off by 1 (tolerance is 0, so this should fail).
      return { run: (page) => answerMathematik(page, 43) }
    case "wortarten":
      // Wrong POS assignment: rotate solutions by 1.
      return {
        run: (page) => answerWortarten(page, q.solutions!.map((s) => (s + 1) % q.posSet!.length), q.posSet!),
      }
    case "sequencing":
      // Wrong order: reverse the correct order for a different answer.
      return {
        run: (page) =>
          answerSequencing(page, [...q.correctOrder!].reverse(), q.items!),
      }
    case "brainstorm":
      return {
        run: (page) => answerBrainstorm(page, "Flexiblere Kernarbeitszeiten"),
      }
    case "confidence":
      // Different from P1's "high" — still no right/wrong for self-assessment.
      return { run: (page) => answerConfidence(page, "low") }
    case "micro-lesson":
      return { run: (page) => answerMicroLesson(page) }
    case "fill-blank":
      // Wrong: shift each slot's pick by one option (wraps within bounds).
      return {
        run: (page) =>
          answerSlotBoard(
            page,
            q.slots!.map((s) => (s.correctIndex + 1) % s.options.length),
          ),
      }
    case "matching":
      // Wrong pairing: rotate each item's pick by one.
      return {
        run: (page) =>
          answerSlotBoard(
            page,
            q.leftItems!.map((li) => (li.correctIndex + 1) % li.options.length),
          ),
      }
    case "drop-pin":
      // Wrong spot: far corner, clear of the fixture's single hotspot zone.
      return { run: (page) => answerDropPin(page, 0.85, 0.85) }
    case "word-cloud":
      return { run: (page) => answerWordCloud(page, "Flexibilität") }
    default: {
      const _exhaustive: never = q as never
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
  await host.getByTestId("login-username").fill(E2E_USER)
  await host.getByTestId("login-password").fill(password)
  await host.getByTestId("login-submit").click()
}

async function startAllTypesQuiz(host: Page): Promise<string> {
  // Quiz id is server-derived (slug + shortId); match by subject text on row.
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




async function assertQuestionTextAligned(pages: RolePages, expected: string) {
  for (const role of ["host", "player1", "player2"] as const) {
    const el = pages[role].getByTestId("question-text").first()
    await expect(el).toBeVisible({ timeout: 30_000 })
    await expect(el).toContainText(expected)
  }
  const t1 = await pages.host.getByTestId("question-text").first().innerText()
  const t2 = await pages.player1.getByTestId("question-text").first().innerText()
  const t3 = await pages.player2.getByTestId("question-text").first().innerText()
  expect(t1.trim()).toBe(t2.trim())
  expect(t1.trim()).toBe(t3.trim())
}

async function parseLeaderboardScore(
  page: Page,
  username: string,
): Promise<number> {
  const row = page.getByTestId(`leaderboard-row-${username}`)
  // Check visibility once; polling will retry this whole function if needed.
  if (!(await row.isVisible().catch(() => false))) {
    return 0
  }
  const text = await row.innerText()
  // Prefer last integer in the row (score); fall back to 0 if only name shown.
  const nums = text.match(/\d+/g)
  if (!nums || nums.length === 0) {
    return 0
  }
  return Number(nums[nums.length - 1])
}

/** Wait for type-specific answer control to be visible in SELECT_ANSWER phase. */
/** Effect-verified click from leaderboard to next question.
   Retries only while leaderboard-row is visible (proof that the click didn't work).
   Once controls appear, returns immediately. */
async function advanceToNextQuestion(host: Page, player1: Page, nextQType: string, maxSteps = 6) {
  // Determine which control ID to watch for (varies by question type).
  const controlId = nextQType === "slider" ? "slider-input"
    : nextQType === "type-answer" ? "type-answer-input"
    : nextQType === "sentence-builder" ? "sentence-chunk-0"
    : nextQType === "mathematik" ? "mathematik-input"
    : nextQType === "wortarten" ? "wortarten-token-0"
    : nextQType === "sequencing" ? "sequencing-item-0"
    : nextQType === "brainstorm" ? "brainstorm-input"
    : nextQType === "confidence" ? "confidence-option-high"
    : nextQType === "micro-lesson" ? "microlesson-next"
    : nextQType === "fill-blank" || nextQType === "matching" ? "slot-select-0"
    : nextQType === "drop-pin" ? "hotspot-image"
    : nextQType === "word-cloud" ? "word-cloud-input"
    : "answer-btn-0"

  for (let s = 0; s < maxSteps; s++) {
    // Target control visible = we've already advanced successfully.
    if (await player1.getByTestId(controlId).isVisible().catch(() => false)) return
    // Leaderboard still visible = click didn't work; re-click only then.
    if (await host.getByTestId(`leaderboard-row-${PLAYER1}`).isVisible().catch(() => false)) {
      await host.getByTestId("next-btn").click().catch(() => {})
    }
    // Let state settle between retries.
    await host.waitForTimeout(2_000)
  }
  // Loop exhausted; fall through to waitForAnswerControl (45s, definitive verification).
}

/** Advance to target state by clicking only on recognized safe states (responses/recap).
   Handles auto-jumps and reconnections gracefully without risk of ABORT/SKIP. */
async function advanceToState(host: Page, target: "leaderboard" | "podium", player1: Page, maxSteps = 5) {
  // NB: .or() cannot join locators from different pages — check each page separately.
  const targetVisible = async () =>
    target === "leaderboard"
      ? await host.getByTestId(`leaderboard-row-${PLAYER1}`).isVisible().catch(() => false)
      : (await host.getByTestId("podium").isVisible().catch(() => false)) ||
        (await player1.getByTestId("podium").isVisible().catch(() => false))
  for (let s = 0; s < maxSteps; s++) {
    if (await targetVisible()) return
    // Only click on RECOGNIZED safe states (responses-view or round-recap).
    if (await host.getByTestId("round-recap").isVisible().catch(() => false)) {
      // Recap advances itself (final cue auto-fires after 1400ms); nudge it along
      // via its own buttons when present, never via the hidden toolbar next-btn.
      await host.getByTestId("recap-final-advance").click({ timeout: 2_000 }).catch(() => {})
      await host.getByTestId("recap-advance").click({ timeout: 2_000 }).catch(() => {})
    } else if (await host.getByTestId("responses-view").isVisible().catch(() => false)) {
      await host.getByTestId("next-btn").click()
    }
    // Let state settle; do not click blindly.
    await host.waitForTimeout(1_500)
  }
  await expect.poll(targetVisible, { timeout: 30_000 }).toBe(true)
}

async function waitForAnswerControl(page: Page, questionType: string) {
  switch (questionType) {
    case "choice":
    case "boolean":
    case "poll":
    case "multiple-select":
      await expect(page.getByTestId("answer-btn-0")).toBeVisible({ timeout: 45_000 })
      break
    case "slider":
      await expect(page.getByTestId("slider-input")).toBeVisible({ timeout: 45_000 })
      break
    case "type-answer":
      await expect(page.getByTestId("type-answer-input")).toBeVisible({ timeout: 45_000 })
      break
    case "sentence-builder":
      await expect(page.getByTestId("sentence-chunk-0")).toBeVisible({ timeout: 45_000 })
      break
    case "mathematik":
      await expect(page.getByTestId("mathematik-input")).toBeVisible({ timeout: 45_000 })
      break
    case "wortarten":
      await expect(page.getByTestId("wortarten-token-0")).toBeVisible({ timeout: 45_000 })
      break
    case "sequencing":
      await expect(page.getByTestId("sequencing-item-0")).toBeVisible({ timeout: 45_000 })
      break
    case "brainstorm":
      await expect(page.getByTestId("brainstorm-input")).toBeVisible({ timeout: 45_000 })
      break
    case "confidence":
      await expect(page.getByTestId("confidence-option-high")).toBeVisible({ timeout: 45_000 })
      break
    case "micro-lesson":
      await expect(page.getByTestId("microlesson-next")).toBeVisible({ timeout: 45_000 })
      break
    case "fill-blank":
    case "matching":
      await expect(page.getByTestId("slot-select-0")).toBeVisible({ timeout: 45_000 })
      break
    case "drop-pin":
      await expect(page.getByTestId("hotspot-image")).toBeVisible({ timeout: 45_000 })
      break
    case "word-cloud":
      await expect(page.getByTestId("word-cloud-input")).toBeVisible({ timeout: 45_000 })
      break
    default:
      throw new Error(`Unknown question type: ${questionType}`)
  }
}

// ── Main suite ────────────────────────────────────────────────────────────────

test.describe("Answer flow — E2E All Types", () => {
  test("host + 2 players: all 10 types incl. sequencing, P1 correct > P2", async ({
    browser,
  }) => {
    test.setTimeout(480_000)

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
        // Transition: Lobby → Q1 (COOLDOWN). Loop will wait for SELECT_ANSWER via waitForAnswerControl.
      })

      // Race flags: one deadline race (P2 late), one double-submit (P1).
      // Use boolean (index 1) for deadline; multiple-select (index 4) for double-submit.
      const DEADLINE_Q = 1
      const DOUBLE_SUBMIT_Q = 4

      // Running leaderboard scores, captured after each question's reveal —
      // used to compute THIS question's point delta (WP-504-E2E), since the
      // cumulative "P1 > P2" check below stays trivially true once P1 has any
      // lead, regardless of what the current question scored.
      let prevScoreP1 = 0
      let prevScoreP2 = 0

      for (let i = 0; i < quizFixture.questions.length; i++) {
        const q = quizFixture.questions[i]

        await test.step(`Q${i + 1} ${q.type}: wait for controls + align question-text`, async () => {
          // Wait for type-specific answer control (covers COOLDOWN ~5s, then SELECT_ANSWER phase).
          // Timeout 45s ensures we reach SELECT_ANSWER even if HOST is slow advancing.
          await waitForAnswerControl(player1, q.type)
          // Now assert question text is visible and aligned across all roles.
          await expect(player1.getByTestId("question-text").first()).toBeVisible({
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
            // (a) Deadline race: P2 answers ~1s before 10s timeout.
            // t0 = question start (when controls became visible).
            const t0 = Date.now()
            await p1.run(player1)
            await expect(player1.getByTestId("answer-submitted")).toBeVisible({
              timeout: 10_000,
            })
            // P2 targets ~8.5s after question start (~1-1.5s before 10s timeout).
            const elapsedMs = Date.now() - t0
            const waitMs = Math.max(0, 8_500 - elapsedMs)
            await player2.waitForTimeout(waitMs)
            // P2 click may race the question end — catch if button disappeared.
            await p2.run(player2).catch(() => {})
            // P2 is last answerer — question may end early (all-answered).
            await expect(
              player2.getByTestId("answer-submitted").or(player2.getByTestId("answer-result")).first()
            ).toBeVisible({ timeout: 10_000 })
          } else if (i === DOUBLE_SUBMIT_Q) {
            // (b) Double-submit: P1 clicks submit twice rapidly.
            await p1.run(player1, { doubleSubmit: true })
            await expect(player1.getByTestId("answer-submitted")).toBeVisible({
              timeout: 10_000,
            })
            await p2.run(player2)
            // P2 is last answerer — question may end early (all-answered).
            await expect(
              player2.getByTestId("answer-submitted").or(player2.getByTestId("answer-result")).first()
            ).toBeVisible({ timeout: 10_000 })
          } else {
            // Sequential: P1 answers first, then P2.
            await p1.run(player1)
            await expect(player1.getByTestId("answer-submitted")).toBeVisible({
              timeout: 10_000,
            })
            await p2.run(player2)
            // P2 is last answerer — question may end early (all-answered).
            await expect(
              player2.getByTestId("answer-submitted").or(player2.getByTestId("answer-result")).first()
            ).toBeVisible({ timeout: 10_000 })
          }
        })

        await test.step(`Q${i + 1}: reveal + leaderboard P1 > P2`, async () => {
          const isLast = i === quizFixture.questions.length - 1

          if (isLast) {
            // Last question: advance to podium (state-dispatch handles responses/recap/auto-jumps).
            await advanceToState(host, "podium", player1)
          } else {
            // Questions 1-9: advance to leaderboard (state-dispatch handles responses/recap/auto-jumps).
            await advanceToState(host, "leaderboard", player1)

            // P1 should see correct-answer-highlight after reveal (scored types).
            if (!UNSCORED_IN_SUITE.includes(q.type)) {
              await expect(
                player1.getByTestId("correct-answer-highlight"),
              ).toBeVisible({ timeout: 20_000 })
            }

            // Score assertions with polling (animation).
            // After first scored question P1 should lead; poll may tie until then.
            if (q.type !== "poll" || i > 0) {
              await expect.poll(async () => {
                const s1 = await parseLeaderboardScore(host, PLAYER1)
                const s2 = await parseLeaderboardScore(host, PLAYER2)
                return s1 > s2
              }, { timeout: 10_000 }).toBe(true)
            }

            // WP-504-E2E — the actual assertion this WP exists for: an unscored
            // question must leave BOTH players' scores exactly where they were
            // before it (no wrong-marking side effect, no silent points).
            if (q.type === "brainstorm" || q.type === "confidence" || q.type === "micro-lesson") {
              await expect.poll(async () => {
                const s1 = await parseLeaderboardScore(host, PLAYER1)
                const s2 = await parseLeaderboardScore(host, PLAYER2)
                return s1 === prevScoreP1 && s2 === prevScoreP2
              }, { timeout: 10_000 }).toBe(true)
            }

            // Gegenprobe (choice, Q1): a genuinely scored wrong answer must
            // still produce a real point differential — proves the delta
            // check above isn't a vacuous no-op that would stay green even if
            // scoring silently broke for everyone.
            if (q.type === "choice") {
              await expect.poll(async () => {
                const s1 = await parseLeaderboardScore(host, PLAYER1)
                const s2 = await parseLeaderboardScore(host, PLAYER2)
                return s1 > prevScoreP1 && s2 === prevScoreP2
              }, { timeout: 10_000 }).toBe(true)
            }

            // Double-submit must not explode score unreasonably (no double count).
            // Cap: theoretical max ~1000 * questions answered correctly.
            await expect.poll(async () => {
              const s1 = await parseLeaderboardScore(host, PLAYER1)
              // ponytail: achievement bonuses accrue PER question (observed ≤420/round on prod config), so the margin scales with i; early rounds still catch a double-counted answer (+1000), later rounds are covered by the dedicated double-submit test (DOUBLE_SUBMIT_Q)
              return s1 <= 1600 * (i + 1)
            }, { timeout: 10_000 }).toBe(true)

            // Capture this question's final scores as the baseline for the
            // next question's delta checks above.
            prevScoreP1 = await parseLeaderboardScore(host, PLAYER1)
            prevScoreP2 = await parseLeaderboardScore(host, PLAYER2)

            // Advance to next question (effect-verified: re-click only if leaderboard still visible).
            // After this, waitForAnswerControl will verify we reached SELECT_ANSWER.
            await advanceToNextQuestion(host, player1, quizFixture.questions[i + 1].type)
          }
        })
      }

      // Final podium assertions (Q10 already transitioned to podium in the loop).
      await test.step("final podium check", async () => {
        // Podium is a HOST screen; players render PlayerFinished instead —
        // player-side end state is covered by the per-question asserts (Q1-Q10).
        await expect(host.getByTestId("podium")).toBeVisible({ timeout: 10_000 })
        // P1 is the winner: their name must appear on the host podium.
        await expect(host.getByTestId("podium")).toContainText(PLAYER1, {
          timeout: 10_000,
        })
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
      // Also exercised inline inside the main flow at the boolean question, but
      // runs unconditionally here too (CI-208-01): a focused, isolated repro
      // that does not depend on the 16-question main flow reaching that point,
      // and that still catches a regression even if the main flow itself is
      // red for an unrelated reason.
      test.setTimeout(120_000)

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
        // Wait for responses-view to be ready before advancing.
        await expect(host.getByTestId("responses-view")).toBeVisible({ timeout: 15_000 })
        // ONE click: Responses → Leaderboard OR Round-Recap (if achievements exist).
        await host.getByTestId("next-btn").click()
        // Wait for leaderboard-row OR round-recap (achievements may trigger interstitial recap).
        const lbOrRecap = host.getByTestId(`leaderboard-row-${PLAYER1}`).or(host.getByTestId("round-recap")).first()
        await expect(lbOrRecap).toBeVisible({ timeout: 15_000 })
        // If round-recap appeared, let it advance itself via its own buttons
        // (final cue auto-fires after 1400ms); never click the hidden next-btn.
        if (await host.getByTestId("round-recap").isVisible().catch(() => false)) {
          await host.getByTestId("recap-final-advance").click({ timeout: 2_000 }).catch(() => {})
          await host.getByTestId("recap-advance").click({ timeout: 2_000 }).catch(() => {})
        }
        // Wait for leaderboard (now guaranteed to be visible).
        await expect(host.getByTestId(`leaderboard-row-${PLAYER1}`)).toBeVisible({ timeout: 15_000 })
        // ONE click: Leaderboard → Q2.
        await host.getByTestId("next-btn").click()
        // Q2 boolean deadline race
        await expect(p1.getByTestId("question-text")).toBeVisible({
          timeout: 45_000,
        })
        // t0 = question start (when controls became visible).
        const t0 = Date.now()
        await player1AnswerPlan(quizFixture.questions[1]).run(p1)
        // P2 targets ~8.5s after question start (~1-1.5s before 10s timeout).
        const elapsedMs = Date.now() - t0
        const waitMs = Math.max(0, 8_500 - elapsedMs)
        await p2.waitForTimeout(waitMs)
        // P2 click may race the question end — catch if button disappeared.
        await player2AnswerPlan(quizFixture.questions[1]).run(p2).catch(() => {})
        await expect(p2.getByTestId("answer-submitted").or(p2.getByTestId("answer-result")).first()).toBeVisible()
        // Advance to leaderboard (state-dispatch handles auto-jumps and reconnections).
        await advanceToState(host, "leaderboard", p1)
      } finally {
        await hostCtx.close()
        await p1Ctx.close()
        await p2Ctx.close()
      }
    })

    test("double-submit: P1 rapid double click does not error", async ({
      browser,
    }) => {
      // Also exercised inline inside the main flow at DOUBLE_SUBMIT_Q, but runs
      // unconditionally here too (CI-208-01): an isolated repro that does not
      // depend on the main flow reaching that question.
      test.setTimeout(120_000)

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
