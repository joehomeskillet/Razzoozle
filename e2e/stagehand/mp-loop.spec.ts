/**
 * e2e/stagehand/mp-loop.spec.ts — Multiplayer game loop (E2E All Types).
 *
 * Run directly: `npx tsx e2e/stagehand/mp-loop.spec.ts` (per stagehand/README.md
 * — this is a plain script, not a Playwright Test / Jest suite; the installed
 * @browserbasehq/stagehand v3 SDK exposes its own CDP-based Page/Locator, not
 * Playwright's, and there is no `@playwright/test` dependency in e2e/).
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { z } from 'zod';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = 'https://rust.razzoozle.xyz';

type FixtureQuestion = (typeof quizFixture.questions)[number];

// E2E_PW has no fallback — a missing env var must fail loudly at login time,
// not silently attempt a bogus 'notset' credential (SH1 review finding).
function requireE2EPassword(): string {
  const pw = process.env.E2E_PW;
  if (!pw) {
    throw new Error('E2E_PW environment variable is required for manager login.');
  }
  return pw;
}

const PinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
});

// ── Stagehand Page/Locator helpers ──────────────────────────────────────────
// stagehand.page does not exist on v3 — the active page is
// stagehand.context.activePage(). Its Locator has no getByTestId/getByRole/
// filter/or/waitFor/evaluate; only click/fill/type/isVisible/innerText/first/
// nth/count on a raw CSS selector. These helpers wrap the real API.

const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

async function waitForTestId(
  page: Page,
  id: string,
  opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number },
) {
  await page.waitForSelector(testIdSel(id), {
    state: opts?.state ?? 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

/** Same as waitForTestId, but for dynamic testids like `quizz-row-${id}` where
    only the static prefix is known ahead of time. */
async function waitForTestIdPrefix(
  page: Page,
  prefix: string,
  opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number },
) {
  await page.waitForSelector(testIdPrefixSel(prefix), {
    state: opts?.state ?? 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

async function isTestIdVisible(page: Page, id: string): Promise<boolean> {
  return page.locator(testIdSel(id)).isVisible().catch(() => false);
}

async function isDisabledSelector(page: Page, selector: string): Promise<boolean | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as (HTMLButtonElement | HTMLInputElement | null);
    return el ? el.disabled : null;
  }, selector);
}

async function waitForDisabledTestId(page: Page, id: string, timeoutMs = 15_000) {
  const selector = testIdSel(id);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const disabled = await isDisabledSelector(page, selector);
    if (disabled === true) {
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for "${selector}" to become disabled (submit never registered)`);
}

async function clickByPrefixAndText(page: Page, prefix: string, text: string) {
  const candidates = page.locator(testIdPrefixSel(prefix));
  const n = await candidates.count();
  for (let i = 0; i < n; i++) {
    const el = candidates.nth(i);
    if ((await el.innerText()).trim() === text) {
      await el.click();
      return;
    }
  }
  throw new Error(`No element matching data-testid^="${prefix}" with text "${text}" (checked ${n} candidates)`);
}

/** Set a range/slider input's value the React-safe way (native value setter +
    dispatched input/change), since a plain `.fill()` on a controlled React
    range input does not reliably trigger onChange. */
async function setRangeValue(page: Page, selector: string, value: number) {
  await page.evaluate(
    ({ sel, v }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) {
        throw new Error(`setRangeValue: no element for "${sel}"`);
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter ? setter.call(el, String(v)) : (el.value = String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel: selector, v: value },
  );
}

async function bodyContainsText(page: Page, text: string): Promise<boolean> {
  const bodyText = await page.locator('body').innerText();
  return bodyText.includes(text);
}

// ── Real testid-driven answer strategies (Answers.tsx contract) ────────────
// waitForAnswerControl() is called before every one of these, so a `click()`
// that finds nothing throws immediately instead of silently no-op'ing.

async function answerChoiceLike(page: Page, index: number) {
  await page.locator(testIdSel(`answer-btn-${index}`)).click();
}

async function answerMultipleSelect(page: Page, indices: number[]) {
  for (const i of indices) {
    await page.locator(testIdSel(`answer-btn-${i}`)).click();
  }
  await page.locator(testIdSel('multi-select-submit')).click();
  await waitForDisabledTestId(page, 'multi-select-submit');
}

async function answerSlider(page: Page, value: number) {
  await setRangeValue(page, testIdSel('slider-input'), value);
  await page.locator(testIdSel('slider-submit')).click();
  await waitForDisabledTestId(page, 'slider-submit');
}

async function answerTypeAnswer(page: Page, text: string) {
  await page.locator(testIdSel('type-answer-input')).fill(text);
  await page.locator(testIdSel('type-answer-submit')).click();
  await waitForDisabledTestId(page, 'type-answer-submit');
}

async function answerSentenceBuilder(page: Page, words: string[]) {
  for (const word of words) {
    await clickByPrefixAndText(page, 'sentence-chunk-', word);
  }
  await page.locator(testIdSel('sentence-submit')).click();
  await waitForDisabledTestId(page, 'sentence-submit');
}

async function answerMathematik(page: Page, value: number) {
  await page.locator(testIdSel('mathematik-input')).fill(String(value));
  await page.locator(testIdSel('mathematik-submit')).click();
  await waitForDisabledTestId(page, 'mathematik-submit');
}

// tokens/posSet/solutions come straight from the fixture: solutions[i] is the
// posSet index for tokens[i]. This fixture has no disabledTokens (see the
// per-token disabled assertion in the main loop below).
async function answerWortarten(page: Page, solutions: number[], posSet: string[]) {
  for (let i = 0; i < solutions.length; i++) {
    const posLabel = posSet[solutions[i]];
    await page.locator(testIdSel(`wortarten-token-${i}`)).click();
    await page.locator(testIdSel(`wortarten-pos-${i}-${posLabel}`)).click();
  }
  await page.locator(testIdSel('wortarten-submit')).click();
  await waitForDisabledTestId(page, 'wortarten-submit');
}

/** Submit the fixture-correct answer for one question. Type is read directly
    from the fixture object (not sniffed from the DOM/AI), so there is no
    fallback-to-wrong-type failure mode. */
async function answerFixtureQuestion(page: Page, q: FixtureQuestion) {
  switch (q.type) {
    case 'choice':
    case 'boolean':
      await answerChoiceLike(page, q.solutions![0]);
      return;
    case 'poll':
      // No solutions on a poll — any option is a valid vote.
      await answerChoiceLike(page, 0);
      return;
    case 'slider':
      await answerSlider(page, q.correct!);
      return;
    case 'multiple-select':
      await answerMultipleSelect(page, q.solutions!);
      return;
    case 'type-answer':
      await answerTypeAnswer(page, q.acceptedAnswers![0]);
      return;
    case 'sentence-builder':
      await answerSentenceBuilder(page, q.chunks!);
      return;
    case 'mathematik':
      await answerMathematik(page, q.correct!);
      return;
    case 'wortarten':
      await answerWortarten(page, q.solutions!, q.posSet!);
      return;
    default:
      // The fixture's `type` field is a plain `string` after JSON import (no
      // discriminated-union narrowing), so this default is reachable at the
      // type level even though every real fixture value is handled above.
      throw new Error(`Unknown fixture question type: ${JSON.stringify(q)}`);
  }
}

function answerControlTestId(type: FixtureQuestion['type']): string {
  switch (type) {
    case 'slider':
      return 'slider-input';
    case 'type-answer':
      return 'type-answer-input';
    case 'sentence-builder':
      return 'sentence-chunk-0';
    case 'mathematik':
      return 'mathematik-input';
    case 'wortarten':
      return 'wortarten-token-0';
    default:
      return 'answer-btn-0';
  }
}

/** Manager-only state advance: click next-btn (host-exclusive control) while a
    recognized safe intermediate screen (responses/round-recap/leaderboard) is
    showing, until the target becomes true on the player's page. Mirrors the
    proven advanceToState pattern in e2e/answer-flow.spec.ts. */
async function advanceManagerUntil(
  managerPage: Page,
  targetVisible: () => Promise<boolean>,
  maxSteps = 8,
) {
  for (let step = 0; step < maxSteps; step++) {
    if (await targetVisible()) {
      return;
    }
    const safeState =
      (await isTestIdVisible(managerPage, 'responses-view')) ||
      (await isTestIdVisible(managerPage, 'round-recap')) ||
      (await managerPage.locator(testIdPrefixSel('leaderboard-row-')).first().isVisible().catch(() => false));
    if (safeState) {
      await managerPage.locator(testIdSel('next-btn')).click();
    }
    await managerPage.waitForTimeout(1_500);
  }
  if (!(await targetVisible())) {
    throw new Error('advanceManagerUntil: target state never became visible within the retry budget');
  }
}

async function runMpGameLoop() {
  const password = requireE2EPassword();

  const managerStagehand: Stagehand = newStagehand();
  const playerStagehand: Stagehand = newStagehand();
  await managerStagehand.init();
  await playerStagehand.init();

  const managerPage = managerStagehand.context.activePage();
  const playerPage = playerStagehand.context.activePage();
  if (!managerPage || !playerPage) {
    throw new Error('Stagehand did not produce an active page after init()');
  }

  try {
    // ============ MANAGER: LOGIN ============
    await managerPage.goto(`${BASE_URL}/manager`);
    await waitForTestId(managerPage, 'login-password');

    // %password% is substituted server-side by Stagehand's variables mechanism
    // so the real secret never appears in the instruction text/logs.
    await managerStagehand.act('Enter %password% into the password field and click the login button', {
      variables: { password },
    });
    // Post-condition: the quiz list only renders once auth succeeded.
    // Testid is dynamic (`quizz-row-${id}`), so we wait on the static prefix.
    await waitForTestIdPrefix(managerPage, 'quizz-row-');

    // ============ MANAGER: OPEN + START "E2E All Types" QUIZ ============
    await clickByPrefixAndText(managerPage, 'quizz-row-', quizFixture.subject);
    await waitForTestId(managerPage, 'quizz-start-btn');

    await managerPage.locator(testIdSel('quizz-start-btn')).click();
    // Post-condition: the PIN only renders once the game session actually exists.
    await waitForTestId(managerPage, 'game-pin');

    // extract(instruction, schema) resolves to the schema-inferred value
    // directly (unlike act()'s {success, message} ActResult) — it throws on a
    // schema/extraction failure, which is the loud-failure behaviour we want.
    const { pin: gamePin } = await managerStagehand.extract(
      'Locate the 6-digit PIN code displayed on the screen for players to join.',
      PinSchema,
    );

    // ============ PLAYER: JOIN WITH PIN ============
    await playerPage.goto(BASE_URL);
    await waitForTestId(playerPage, 'pin-input-digit-0');

    await playerPage.locator(testIdSel('pin-input-digit-0')).click();
    await playerPage.type(gamePin);
    await playerPage.locator(testIdSel('join-submit')).click();
    // Post-condition: a valid PIN moves us from the PIN screen to the username screen.
    await waitForTestId(playerPage, 'username-input');

    await playerPage.locator(testIdSel('username-input')).fill('SH-Player');
    await playerPage.locator(testIdSel('join-submit')).click();
    // Post-condition: username accepted → waiting room.
    await waitForTestId(playerPage, 'waiting-room');

    // ============ MANAGER: START GAME (leave lobby) ============
    // next-btn is host-exclusive (GameWrapper gates it on `manager &&`) — the
    // player never has a "next" control and must not be driven through one.
    await waitForTestId(managerPage, 'next-btn');
    await managerPage.locator(testIdSel('next-btn')).click();

    // ============ QUESTIONS: 9 REAL FIXTURE TYPES, IN FIXTURE ORDER ============
    const questions = quizFixture.questions;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const controlId = answerControlTestId(q.type);

      await playerPage.waitForSelector(testIdSel(controlId), { state: 'visible', timeout: 45_000 });

      // Question text must match the fixture verbatim — a real assertion,
      // not an informational log.
      const questionText = await playerPage.locator(testIdSel('question-text')).first().innerText();
      if (!questionText.includes(q.question)) {
        throw new Error(
          `Q${i + 1} (${q.type}): expected question text to include "${q.question}", got "${questionText}"`,
        );
      }

      // Wortarten: the fixture carries no `disabledTokens`, so every token
      // must be enabled — assert that ground truth instead of the informational
      // "token 0 disabled?" check the original spec logged and never enforced.
      if (q.type === 'wortarten') {
        for (let t = 0; t < q.tokens!.length; t++) {
          const disabled = await isDisabledSelector(playerPage, testIdSel(`wortarten-token-${t}`));
          if (disabled) {
            throw new Error(`Q${i + 1} wortarten: token ${t} ("${q.tokens![t]}") is unexpectedly disabled`);
          }
        }
      }

      // Only the player answers — the manager is host-only in this topology
      // (every MP e2e helper in this repo has the host observe and advance
      // state, never submit an answer itself).
      await answerFixtureQuestion(playerPage, q);

      const isLast = i === questions.length - 1;
      const nextQ = isLast ? null : questions[i + 1];

      await advanceManagerUntil(managerPage, async () => {
        if (isLast) {
          return isTestIdVisible(playerPage, 'podium');
        }
        return isTestIdVisible(playerPage, answerControlTestId(nextQ!.type));
      });
    }

    // ============ PODIUM: real assertions, not informational logs ============
    await waitForTestId(playerPage, 'podium');
    await waitForTestId(managerPage, 'podium');

    if (!(await bodyContainsText(playerPage, 'SH-Player'))) {
      throw new Error('Expected "SH-Player" to be visible on the podium');
    }

    console.log('MP game loop passed: all 9 fixture question types, podium reached.');
  } finally {
    await managerStagehand.close();
    await playerStagehand.close();
  }
}

runMpGameLoop().then(
  () => process.exit(0),
  (err) => {
    console.error('MP game loop failed:', err);
    process.exit(1);
  },
);
