/**
 * e2e/stagehand/solo-types.spec.ts — Solo play, all 9 fixture question types,
 * across 3 mobile viewports.
 *
 * Run directly: `npx tsx e2e/stagehand/solo-types.spec.ts` (per
 * stagehand/README.md — plain script, not a Playwright Test / Jest suite; the
 * installed @browserbasehq/stagehand v3 SDK exposes its own CDP-based
 * Page/Locator, not Playwright's, and `@playwright/test` is not a dependency
 * of e2e/).
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = 'https://rust.razzoozle.xyz';

// normalize_filename("E2E All Types") (rust/server/src/socket/manager/quizz.rs)
// = lowercase, spaces->hyphens, take(10 chars) = "e2e-all-ty", then "-" plus an
// 8-hex-char UUID suffix. The suffix is random per seed run, so the id is
// resolved dynamically from the public quiz list instead of a stale hardcoded
// value (the original spec's 'e2e-all-ty-pKcA4Qj2' only ever matched one
// specific seed run).
const QUIZ_ID_PREFIX = 'e2e-all-ty-';

const VIEWPORTS = [
  { width: 375, height: 667, name: 'mobile-sm' },
  { width: 390, height: 844, name: 'mobile-std' },
  { width: 440, height: 956, name: 'mobile-lg' },
];

type FixtureQuestion = (typeof quizFixture.questions)[number];

// ── Stagehand Page/Locator helpers ──────────────────────────────────────────
// stagehand.page does not exist on v3 — the active page is
// stagehand.context.activePage(). Its Locator has no getByTestId/getByRole/
// filter/or/waitFor/evaluate; only click/fill/type/isVisible/innerText/first/
// nth/count on a raw CSS selector.

const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

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
    dispatched input/change) instead of a plain fill(), which does not
    reliably trigger onChange on a controlled React range input. */
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

/** Resolve the seeded quiz id. Repeat upsert-quiz.mjs runs can leave more than
    one id matching the deterministic prefix (observed live: both
    "e2e-all-ty-pKcA4Qj2" and "e2e-all-ty-21908fc2" existed simultaneously) —
    picking the first match blindly would silently run against a stale/wrong
    quiz. Verify each candidate's actual question count against the fixture
    before accepting it. */
async function resolveQuizId(page: Page): Promise<string> {
  const ids = await page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`GET ${url} failed with status ${res.status}`);
    }
    return (await res.json()) as string[];
  }, `${BASE_URL}/api/quizzes`);
  const candidates = ids.filter((id) => id.startsWith(QUIZ_ID_PREFIX));
  if (candidates.length === 0) {
    throw new Error(
      `No seeded quiz id starting with "${QUIZ_ID_PREFIX}" found via /api/quizzes — ` +
        'run e2e/scripts/upsert-quiz.mjs against e2e/fixtures/all-types-quiz.json first.',
    );
  }

  for (const candidate of candidates) {
    const matches = await page.evaluate(
      async ({ url, expectedCount, expectedFirstQuestion }) => {
        const res = await fetch(url);
        if (!res.ok) {
          return false;
        }
        const body = (await res.json()) as { questions?: Array<{ question: string }> };
        return (
          body.questions?.length === expectedCount &&
          body.questions?.[0]?.question === expectedFirstQuestion
        );
      },
      {
        url: `${BASE_URL}/api/quizz/${candidate}/solo`,
        expectedCount: quizFixture.questions.length,
        expectedFirstQuestion: quizFixture.questions[0].question,
      },
    );
    if (matches) {
      return candidate;
    }
  }

  throw new Error(
    `Found ${candidates.length} quiz id(s) matching prefix "${QUIZ_ID_PREFIX}" (${candidates.join(', ')}), ` +
      `but none has ${quizFixture.questions.length} questions starting with "${quizFixture.questions[0].question}". ` +
      're-run e2e/scripts/upsert-quiz.mjs against the current fixture.',
  );
}

// ── Real testid-driven answer strategies (SoloAnswers.tsx contract) ────────
// Choice/boolean/poll submit immediately on tap (no separate submit button —
// SoloAnswers.handleAnswer calls submitAnswer() synchronously); every other
// type has an explicit submit control. Every path is proven via the
// tile/button's `disabled` attribute flipping true (set synchronously in the
// click handler, before the REST call resolves) — a real DOM signal, not a
// sleep or an always-true length check.

async function answerChoiceLike(page: Page, testId: string) {
  const selector = `${testIdSel(testId)} button`;
  await page.locator(selector).click();
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    if ((await isDisabledSelector(page, selector)) === true) {
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for "${selector}" to become disabled (tap never registered)`);
}

async function answerMultipleSelect(page: Page, indices: number[]) {
  for (const i of indices) {
    await page.locator(`${testIdSel(`solo-multiple-select-tile-${i}`)} button`).click();
  }
  await page.locator(testIdSel('solo-multiple-select-submit')).click();
  await waitForDisabledTestId(page, 'solo-multiple-select-submit');
}

async function answerSlider(page: Page, value: number) {
  await setRangeValue(page, testIdSel('solo-slider-input'), value);
  await page.locator(testIdSel('solo-slider-submit')).click();
  await waitForDisabledTestId(page, 'solo-slider-submit');
}

async function answerTypeAnswer(page: Page, text: string) {
  await page.locator(testIdSel('solo-type-answer-input')).fill(text);
  await page.locator(testIdSel('solo-type-answer-submit')).click();
  await waitForDisabledTestId(page, 'solo-type-answer-submit');
}

async function answerSentenceBuilder(page: Page, words: string[]) {
  for (const word of words) {
    await clickByPrefixAndText(page, 'solo-sentence-builder-bank-', word);
  }
  await page.locator(testIdSel('solo-sentence-builder-submit')).click();
  await waitForDisabledTestId(page, 'solo-sentence-builder-submit');
}

async function answerMathematik(page: Page, value: number) {
  // NB: not prefixed "solo-" — SoloAnswers.tsx reuses the MP testid verbatim.
  await page.locator(testIdSel('mathematik-input')).fill(String(value));
  await page.locator(testIdSel('mathematik-submit')).click();
  await waitForDisabledTestId(page, 'mathematik-submit');
}

async function answerWortarten(page: Page, solutions: number[], posSet: string[]) {
  for (let i = 0; i < solutions.length; i++) {
    const posLabel = posSet[solutions[i]];
    await page.locator(testIdSel(`solo-wortarten-token-${i}`)).click();
    await page.locator(testIdSel(`solo-wortarten-pos-${i}-${posLabel}`)).click();
  }
  await page.locator(testIdSel('solo-wortarten-submit')).click();
  await waitForDisabledTestId(page, 'solo-wortarten-submit');
}

/** Submit the fixture-correct answer for one question. Type is read directly
    from the fixture object (not sniffed from the DOM/AI), so there is no
    fallback-to-wrong-type failure mode. */
async function answerFixtureQuestion(page: Page, q: FixtureQuestion) {
  switch (q.type) {
    case 'choice':
    case 'boolean':
      await answerChoiceLike(page, `solo-choice-tile-${q.solutions![0]}`);
      return;
    case 'poll':
      // No solutions on a poll — any option is a valid vote.
      await answerChoiceLike(page, 'solo-choice-tile-0');
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

/** The real testid that only becomes visible once this question type has
    reached the "answering" phase — used as the immediate post-condition
    before answering, so a stuck "question"/cooldown phase fails loudly
    instead of the answer step silently no-op'ing. */
function answerControlTestId(type: FixtureQuestion['type']): string {
  switch (type) {
    case 'slider':
      return 'solo-slider-input';
    case 'type-answer':
      return 'solo-type-answer-input';
    case 'mathematik':
      return 'mathematik-input';
    case 'wortarten':
      return 'solo-wortarten-token-0';
    case 'multiple-select':
      return 'solo-multiple-select-tile-0';
    case 'sentence-builder':
      return 'solo-sentence-builder-bank-';
    default:
      return 'solo-choice-tile-0';
  }
}

function isPrefixControl(id: string): boolean {
  return id.endsWith('-');
}

/** Play the whole fixture quiz solo end-to-end at one viewport, asserting the
    real answer contract for every one of the 9 fixture question types along
    the way. There is no per-question deep link in solo mode — the quiz
    always starts at question 0 and advances sequentially — so "9 types × 3
    viewports" means 3 full playthroughs, one per viewport, not 27 isolated
    single-question tests. */
async function playFullQuizAtViewport(page: Page, quizId: string, viewport: (typeof VIEWPORTS)[number]) {
  await page.setViewportSize(viewport.width, viewport.height);
  await page.goto(`${BASE_URL}/quizz/${quizId}/solo`);

  const urlAfterNav = page.url();
  if (!urlAfterNav.includes('/solo')) {
    throw new Error(`Expected the solo route, got "${urlAfterNav}"`);
  }
  if (urlAfterNav.includes('/manager')) {
    throw new Error(`Solo route unexpectedly resolved under /manager: "${urlAfterNav}"`);
  }
  // No manager context leaks into solo: the two real manager-only testids
  // (login gate + quiz-start control) must never exist on this route.
  if (await page.locator(testIdSel('login-password')).isVisible().catch(() => false)) {
    throw new Error('Manager login gate unexpectedly visible on the solo route');
  }
  if (await page.locator(testIdSel('quizz-start-btn')).isVisible().catch(() => false)) {
    throw new Error('Manager quiz-start control unexpectedly visible on the solo route');
  }

  // Name entry — NameScreen has no testid; it is the only <form> on this
  // phase, so scoping to it is unambiguous.
  await page.waitForSelector('form input[type="text"]', { state: 'visible', timeout: 15_000 });
  await page.locator('form input[type="text"]').fill('SH-Solo');
  await page.locator('form button[type="submit"]').click();

  const questions = quizFixture.questions;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    // "question" phase (cooldown) always shows question-text first, then
    // auto-transitions to "answering" after `q.cooldown` seconds.
    await page.waitForSelector(testIdSel('question-text'), { state: 'visible', timeout: 15_000 });
    const questionText = await page.locator(testIdSel('question-text')).first().innerText();
    if (!questionText.includes(q.question)) {
      throw new Error(
        `Q${i + 1} (${q.type}) @ ${viewport.name}: expected question text to include "${q.question}", got "${questionText}"`,
      );
    }

    const controlId = answerControlTestId(q.type);
    const controlSelector = isPrefixControl(controlId) ? testIdPrefixSel(controlId) : testIdSel(controlId);
    // Timeout budget covers the fixture's own cooldown plus network slack.
    await page.waitForSelector(controlSelector, { state: 'visible', timeout: (q.cooldown + 20) * 1000 });

    // Wortarten: the fixture carries no `disabledTokens`, so every token must
    // be enabled — assert that ground truth instead of the informational
    // "token 0 disabled?" check the original spec logged and never enforced.
    if (q.type === 'wortarten') {
      for (let t = 0; t < q.tokens!.length; t++) {
        const disabled = await isDisabledSelector(page, testIdSel(`solo-wortarten-token-${t}`));
        if (disabled) {
          throw new Error(
            `Q${i + 1} wortarten @ ${viewport.name}: token ${t} ("${q.tokens![t]}") is unexpectedly disabled`,
          );
        }
      }
    }

    await answerFixtureQuestion(page, q);

    const isLast = i === questions.length - 1;
    if (isLast) {
      // The last question's result has no "next" — finishGame() posts the
      // score and the page moves straight to the finished screen.
      await page.waitForSelector(testIdSel('solo-finished-score'), { state: 'visible', timeout: 15_000 });
    } else {
      // Result-phase footer "Next" button has no testid. It is provably the
      // only ENABLED button without `aria-pressed` on screen at this point:
      // every SoloAnswers control just got `disabled` on submit (asserted
      // above via waitForDisabledTestId/answerChoiceLike), and the only other
      // footer control (auto-advance toggle) always carries `aria-pressed`.
      const nextBtnSelector = 'button:not([disabled]):not([aria-pressed])';
      await page.waitForSelector(nextBtnSelector, { state: 'visible', timeout: 15_000 });
      await page.locator(nextBtnSelector).click();
    }
  }

  const finishedScoreVisible = await page.locator(testIdSel('solo-finished-score')).isVisible().catch(() => false);
  if (!finishedScoreVisible) {
    throw new Error(`@ ${viewport.name}: expected solo-finished-score to be visible after the last question`);
  }
  const finishedLeaderboardVisible = await page
    .locator(testIdSel('solo-finished-leaderboard'))
    .isVisible()
    .catch(() => false);
  if (!finishedLeaderboardVisible) {
    throw new Error(`@ ${viewport.name}: expected solo-finished-leaderboard to be visible after the last question`);
  }
}

async function runSoloSuite() {
  const failures: Array<{ viewport: string; error: unknown }> = [];

  for (const viewport of VIEWPORTS) {
    const stagehand = newStagehand();
    await stagehand.init();
    const page = stagehand.context.activePage();
    if (!page) {
      throw new Error('Stagehand did not produce an active page after init()');
    }

    try {
      const quizId = await resolveQuizId(page);
      await playFullQuizAtViewport(page, quizId, viewport);
      console.log(`Solo playthrough passed @ ${viewport.name} (${viewport.width}x${viewport.height}).`);
    } catch (err) {
      console.error(`Solo playthrough FAILED @ ${viewport.name}:`, err);
      failures.push({ viewport: viewport.name, error: err });
    } finally {
      await stagehand.close();
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length}/${VIEWPORTS.length} viewport playthrough(s) failed: ` +
        failures.map((f) => f.viewport).join(', '),
    );
  }

  console.log(`All ${VIEWPORTS.length} solo viewport playthroughs passed (9 fixture question types each).`);
}

runSoloSuite().then(
  () => process.exit(0),
  (err) => {
    console.error('Solo suite failed:', err);
    process.exit(1);
  },
);
