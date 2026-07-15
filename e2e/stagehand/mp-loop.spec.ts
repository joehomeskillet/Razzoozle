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

// E2E_USER is not a secret (it's the login name, e.g. "admin" from
// BOOTSTRAP_ADMIN_USER) so a default is safe here, unlike the password above.
function e2eUsername(): string {
  return process.env.E2E_USER ?? 'admin';
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

/** Click the first <button> anywhere on the page whose visible text matches
    one of the given candidates exactly (locale-tolerant — e.g. "Next" or
    "Weiter"), for controls that carry no data-testid (RecapSequence.tsx's
    advance button). Swallows a not-found rather than throwing — used for a
    control that legitimately disappears for part of its own lifecycle (the
    final recap cue removes its advance button and auto-completes on its own
    timer), so "button not there right now" is a normal, retryable state here,
    not a hard failure. */
async function clickButtonByText(page: Page, ...textCandidates: string[]): Promise<void> {
  const candidates = page.locator('button');
  const n = await candidates.count();
  for (let i = 0; i < n; i++) {
    const el = candidates.nth(i);
    const text = (await el.innerText().catch(() => '')).trim();
    if (textCandidates.includes(text)) {
      await el.click();
      return;
    }
  }
}

/** Resolve the exact seeded quiz id by content, not by clicking the first
    "E2E All Types" row found. Repeat upsert-quiz.mjs runs can leave more than
    one seeded id with that exact subject (mirrors solo-types.spec.ts's
    resolveQuizId — observed live there: both "e2e-all-ty-pKcA4Qj2" and
    "e2e-all-ty-21908fc2" existed simultaneously, one carrying manually-edited
    state e.g. a disabled wortarten token from prior manual QA). Picking the
    wrong duplicate here doesn't throw — every fixture question TYPE still
    exists — but produces a live quiz whose actual content/timing (or, per
    that same drift, question count) differs from what this spec asserts,
    which showed up as a flaky final-question reveal (live-run finding,
    2026-07-15). Verifying full question-count + first-question match, like
    solo already does, makes the quiz selection deterministic instead of
    "first DOM match wins". */
async function resolveQuizId(page: Page): Promise<string> {
  const ids = await page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`GET ${url} failed with status ${res.status}`);
    }
    return (await res.json()) as string[];
  }, `${BASE_URL}/api/quizzes`);

  const prefix = 'e2e-all-ty-';
  const candidates = ids.filter((id) => id.startsWith(prefix));
  if (candidates.length === 0) {
    throw new Error(
      `No seeded quiz id starting with "${prefix}" found via /api/quizzes — ` +
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
        // /solo is a public read-only projection of the same quiz content
        // used here purely to verify identity, independent of game mode.
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
    `Found ${candidates.length} quiz id(s) matching prefix "${prefix}" (${candidates.join(', ')}), ` +
      `but none has ${quizFixture.questions.length} questions starting with "${quizFixture.questions[0].question}". ` +
      're-run e2e/scripts/upsert-quiz.mjs against the current fixture.',
  );
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

/** Tag only the tokens the LIVE quiz actually has enabled, reading the real
    `disabled` attribute per token from the DOM rather than assuming a fixed
    count. The seeded quiz's `disabledTokens` is an independent, manager-UI
    -editable setting (Editor-Toggle) — it is NOT part of the fixture JSON
    and can differ from it at any time (observed live: quiz
    e2e-all-ty-pKcA4Qj2 currently has token 0 disabled from prior manual QA).
    Also asserts real click-consistency for both states: a disabled token's
    click must NOT open its POS picker; an enabled token's click MUST open
    it. This holds whether 0 or N tokens are disabled. */
async function answerWortarten(page: Page, tokenCount: number, solutions: number[], posSet: string[]) {
  for (let i = 0; i < tokenCount; i++) {
    const tokenSelector = testIdSel(`wortarten-token-${i}`);
    const posPrefixSelector = testIdPrefixSel(`wortarten-pos-${i}-`);
    const disabled = (await isDisabledSelector(page, tokenSelector)) === true;

    if (disabled) {
      await page.locator(tokenSelector).click();
      await page.waitForTimeout(300);
      const pickerOpened = await page.locator(posPrefixSelector).first().isVisible().catch(() => false);
      if (pickerOpened) {
        throw new Error(`Disabled wortarten token ${i} unexpectedly opened its POS picker on click`);
      }
      continue;
    }

    const posSelector = testIdSel(`wortarten-pos-${i}-${posSet[solutions[i]]}`);
    await page.locator(tokenSelector).click();
    let pickerOpened = false;
    const start = Date.now();
    while (Date.now() - start < 3_000) {
      if (await page.locator(posSelector).isVisible().catch(() => false)) {
        pickerOpened = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    if (!pickerOpened) {
      throw new Error(`Enabled wortarten token ${i} did not open its "${posSet[solutions[i]]}" POS option on click`);
    }
    await page.locator(posSelector).click();
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
      await answerWortarten(page, q.tokens!.length, q.solutions!, q.posSet!);
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
  maxSteps = 20,
) {
  for (let step = 0; step < maxSteps; step++) {
    if (await targetVisible()) {
      return;
    }

    // The FINISHED/Podium screen (last question only) plays an "award recap"
    // overlay FIRST (RecapSequence.tsx) that holds the whole podium section at
    // opacity-0 until its own cards are stepped through. With autoMode left at
    // its default game-config value of false (this quiz never toggles the
    // manager's Auto-Weiter switch), that stepping never happens on its own —
    // it needs the same "Weiter" control the recap component itself exposes.
    // Detected/driven here by aria-label + button TEXT ("Auszeichnungen" /
    // "Weiter", de/game.json — matches the component's own defaultValue
    // fallback verbatim) rather than a new data-testid: this spec targets the
    // LIVE deployed rust.razzoozle.xyz build, and a testid added to
    // RecapSequence.tsx in this same worktree only ships on the NEXT deploy,
    // so it can't be exercised (or verified) here yet — text/aria-label is
    // already live. Both "en" and "de" variants are matched: i18n.ts resolves
    // the initial language from the real browser `navigator.language`
    // (LanguageDetector, fallbackLng "en"), and Stagehand's headless Chrome
    // reports "en-US" with no explicit --lang flag — so the LIVE rendered
    // text here is actually English ("Awards"/"Next"), not German, even
    // though the rest of this app is de-first (live-run finding, 2026-07-15:
    // an initial German-only match against "Auszeichnungen"/"Weiter" never
    // fired at all). The click-anywhere overlay button was tried first
    // instead of the accessible advance button and never actually advanced
    // anything: it sits at z-0 UNDER the card content's z-10 stacking
    // context, so a real coordinate-based click lands on the
    // (non-interactive) card on top of it, not the overlay underneath. The
    // advance button itself disappears on the brief final "Und jetzt: Das
    // Podium"/"And now: the podium" cue (RecapSequence.tsx
    // `{!isFinalCue && (...)}`), which auto-completes on its own 1400ms timer
    // — a missing button there is expected, not an error; just wait. next-btn
    // cannot be used at all here: for STATUS.FINISHED it is wired to "exit",
    // not "advance" (MANAGER_SKIP_BTN[FINISHED] = "common:exit"), so clicking
    // it would leave the game rather than progress the recap.
    const recapVisible =
      (await managerPage.locator('section[aria-label="Awards"]').first().isVisible().catch(() => false)) ||
      (await managerPage.locator('section[aria-label="Auszeichnungen"]').first().isVisible().catch(() => false));
    if (recapVisible) {
      await clickButtonByText(managerPage, 'Next', 'Weiter');
      await managerPage.waitForTimeout(1_500);
      continue;
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
    // Real testid-driven fill+click (not act()) — the login form requires
    // BOTH username and password (ManagerPassword.tsx handleSubmit rejects an
    // empty username with a toast and never calls /api/login), and a
    // single-instruction act() call for "enter password + click login" only
    // ever performed the password fill and then reported no further
    // actionable element, leaving the username empty and the form unsubmitted
    // (live-run finding, 2026-07-15).
    await managerPage.goto(`${BASE_URL}/manager`);
    await waitForTestId(managerPage, 'login-password');
    await managerPage.locator(testIdSel('login-username')).fill(e2eUsername());
    await managerPage.locator(testIdSel('login-password')).fill(password);
    await managerPage.locator(testIdSel('login-submit')).click();
    // Post-condition: the quiz list only renders once auth succeeded.
    // Testid is dynamic (`quizz-row-${id}`), so we wait on the static prefix.
    await waitForTestIdPrefix(managerPage, 'quizz-row-');

    // ============ MANAGER: OPEN + START "E2E All Types" QUIZ ============
    const quizId = await resolveQuizId(managerPage);
    await managerPage.locator(testIdSel(`quizz-row-${quizId}`)).click();
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

      // Wortarten's disabled-token set lives on the live quiz (manager-UI
      // Editor-Toggle), independent of the fixture — answerWortarten() reads
      // the real per-token `disabled` state itself and asserts click
      // consistency for whichever tokens are actually disabled.

      // Only the player answers — the manager is host-only in this topology
      // (every MP e2e helper in this repo has the host observe and advance
      // state, never submit an answer itself).
      await answerFixtureQuestion(playerPage, q);

      const isLast = i === questions.length - 1;
      const nextQ = isLast ? null : questions[i + 1];

      // Target must be the NEXT question's own text, not just its answer
      // control testid — several fixture types share the same default control
      // id (answerControlTestId('choice') === answerControlTestId('boolean')
      // === 'answer-btn-0'), so checking only the control's visibility can
      // report "arrived" while the current question's own (now-disabled)
      // control is still on screen and the manager hasn't advanced at all
      // (live-run finding, 2026-07-15: Q2 read back Q1's question text).
      await advanceManagerUntil(managerPage, async () => {
        if (isLast) {
          // 'podium' (Podium.tsx) only ever renders on the MANAGER route
          // (GAME_STATE_COMPONENTS_MANAGER) — the plain player route maps
          // FINISHED to PlayerFinished.tsx, which carries no testid at all,
          // so this loop's own exit condition could never be satisfied by
          // checking playerPage (live-run finding, 2026-07-15: this was the
          // actual reason advanceManagerUntil kept exhausting its retry
          // budget on the last question regardless of how large it was).
          return isTestIdVisible(managerPage, 'podium');
        }
        const text = await playerPage
          .locator(testIdSel('question-text'))
          .first()
          .innerText()
          .catch(() => '');
        return text.includes(nextQ!.question);
      });
    }

    // ============ PODIUM: real assertions, not informational logs ============
    // FINISHED status renders DIFFERENT components per role (constants.ts
    // GAME_STATE_COMPONENTS_MANAGER maps it to Podium.tsx — data-testid="podium"
    // — but the plain player-facing GAME_STATE_COMPONENTS maps it to
    // PlayerFinished.tsx, which has NO testid at all). Waiting for 'podium' on
    // the player page can therefore never succeed (live-run finding,
    // 2026-07-15). The player-side assertion instead targets the "Nach dem
    // Spiel"/submit-a-quiz link, which PlayerFinished always renders
    // unconditionally — unlike the top-3 leaderboard / "SH-Player" username,
    // which only appears when the game's (randomly rotating, per
    // ConfigGameMode's "full,top3,private" default) endScreen mode is not
    // "private", so asserting on the player's own name would be flaky.
    await waitForTestId(managerPage, 'podium');
    await playerPage.waitForSelector('a[href="/submit"]', { state: 'visible', timeout: 15_000 });

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
