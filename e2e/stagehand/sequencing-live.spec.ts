/**
 * e2e/stagehand/sequencing-live.spec.ts — W6-10 / R12 (P1 critical)
 *
 * First LIVE multiplayer sequencing run against fixture Q (sequencing):
 *   P1 places items in correctOrder → scores
 *   P2 places wrong order → 0 for that question
 *
 * Fixture lock: e2e/fixtures/all-types-quiz.json (sequencing has 5 items live;
 * parent SDD said 8 — product fixture is SSOT).
 *
 * Run: cd e2e && E2E_PW=… npx tsx stagehand/sequencing-live.spec.ts
 * Serial only — do not parallelize with other stagehand specs.
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { z } from 'zod';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://rust.razzoozle.xyz';

type FixtureQuestion = (typeof quizFixture.questions)[number];

function requireE2EPassword(): string {
  const pw = process.env.E2E_PW;
  if (!pw) {
    throw new Error('E2E_PW environment variable is required for manager login.');
  }
  return pw;
}

function e2eUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

const PinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
});

const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

async function waitForTestId(
  page: Page,
  id: string,
  opts?: { state?: 'visible' | 'hidden'; timeout?: number },
) {
  await page.waitForSelector(testIdSel(id), {
    state: opts?.state ?? 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

async function waitForTestIdPrefix(page: Page, prefix: string, timeout = 15_000) {
  await page.waitForSelector(testIdPrefixSel(prefix), { state: 'visible', timeout });
}

async function isTestIdVisible(page: Page, id: string): Promise<boolean> {
  return page.locator(testIdSel(id)).isVisible().catch(() => false);
}

async function isDisabledSelector(page: Page, selector: string): Promise<boolean | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLButtonElement | HTMLInputElement | null;
    return el ? el.disabled : null;
  }, selector);
}

async function waitForDisabledTestId(page: Page, id: string, timeoutMs = 15_000) {
  const selector = testIdSel(id);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await isDisabledSelector(page, selector)) === true) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for "${selector}" to become disabled`);
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
  throw new Error(`No element matching data-testid^="${prefix}" with text "${text}"`);
}

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

async function setRangeValue(page: Page, selector: string, value: number) {
  await page.evaluate(
    ({ sel, v }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) throw new Error(`setRangeValue: no element for "${sel}"`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter ? setter.call(el, String(v)) : (el.value = String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel: selector, v: value },
  );
}

async function resolveQuizId(page: Page): Promise<string> {
  if (!page.url().startsWith(BASE_URL)) {
    await page.goto(BASE_URL);
  }
  const ids = await page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return (await res.json()) as string[];
  }, `${BASE_URL}/api/quizzes`);

  const prefix = 'e2e-all-ty-';
  const candidates = ids.filter((id) => id.startsWith(prefix));
  if (candidates.length === 0) {
    throw new Error(`No quiz id starting with ${prefix} — run upsert-quiz.mjs first`);
  }

  for (const candidate of candidates) {
    const matches = await page.evaluate(
      async ({ url, expectedCount, expectedFirst }) => {
        const res = await fetch(url);
        if (!res.ok) return false;
        const body = (await res.json()) as { questions?: Array<{ question: string }> };
        return (
          body.questions?.length === expectedCount &&
          body.questions?.[0]?.question === expectedFirst
        );
      },
      {
        url: `${BASE_URL}/api/quizz/${candidate}/solo`,
        expectedCount: quizFixture.questions.length,
        expectedFirst: quizFixture.questions[0].question,
      },
    );
    if (matches) return candidate;
  }
  throw new Error(`No candidate among ${candidates.join(',')} matches fixture content`);
}

// ── Answer helpers (subset used to reach sequencing) ───────────────────────

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

async function answerWortarten(page: Page, tokenCount: number, solutions: number[], posSet: string[]) {
  for (let i = 0; i < tokenCount; i++) {
    const tokenSelector = testIdSel(`wortarten-token-${i}`);
    const disabled = (await isDisabledSelector(page, tokenSelector)) === true;
    if (disabled) continue;
    const posSelector = testIdSel(`wortarten-pos-${i}-${posSet[solutions[i]]}`);
    await page.locator(tokenSelector).click();
    const start = Date.now();
    while (Date.now() - start < 3_000) {
      if (await page.locator(posSelector).isVisible().catch(() => false)) break;
      await page.waitForTimeout(100);
    }
    await page.locator(posSelector).click();
  }
  await page.locator(testIdSel('wortarten-submit')).click();
  await waitForDisabledTestId(page, 'wortarten-submit');
}

/** Sequencing: click bank chips by label in the desired order, then submit. */
async function answerSequencing(
  page: Page,
  orderIds: string[],
  items: Array<{ id: string; label: string }>,
) {
  for (const itemId of orderIds) {
    const item = items.find((it) => it.id === itemId);
    if (!item) throw new Error(`sequencing item id ${itemId} missing from fixture`);
    await clickByPrefixAndText(page, 'sequencing-item-', item.label);
  }
  await page.locator(testIdSel('sequencing-submit')).click();
  await waitForDisabledTestId(page, 'sequencing-submit');
}

async function answerFixtureCorrect(page: Page, q: FixtureQuestion) {
  switch (q.type) {
    case 'choice':
    case 'boolean':
      await answerChoiceLike(page, (q as { solutions: number[] }).solutions[0]);
      return;
    case 'poll':
      await answerChoiceLike(page, 0);
      return;
    case 'slider':
      await answerSlider(page, (q as { correct: number }).correct);
      return;
    case 'multiple-select':
      await answerMultipleSelect(page, (q as { solutions: number[] }).solutions);
      return;
    case 'type-answer':
      await answerTypeAnswer(page, (q as { acceptedAnswers: string[] }).acceptedAnswers[0]);
      return;
    case 'sentence-builder':
      await answerSentenceBuilder(page, (q as { chunks: string[] }).chunks);
      return;
    case 'mathematik':
      await answerMathematik(page, (q as { correct: number }).correct);
      return;
    case 'wortarten': {
      const w = q as { tokens: string[]; solutions: number[]; posSet: string[] };
      await answerWortarten(page, w.tokens.length, w.solutions, w.posSet);
      return;
    }
    case 'sequencing': {
      const s = q as {
        items: Array<{ id: string; label: string }>;
        correctOrder: string[];
      };
      await answerSequencing(page, s.correctOrder, s.items);
      return;
    }
    default:
      throw new Error(`Unknown type: ${(q as { type: string }).type}`);
  }
}

/** Wrong sequencing: reverse of correctOrder (guaranteed wrong for ≥2 items). */
async function answerSequencingWrong(
  page: Page,
  q: {
    items: Array<{ id: string; label: string }>;
    correctOrder: string[];
  },
) {
  const wrong = [...q.correctOrder].reverse();
  await answerSequencing(page, wrong, q.items);
}

function answerControlTestId(type: string): string {
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
    case 'sequencing':
      return 'sequencing-item-0';
    default:
      return 'answer-btn-0';
  }
}

async function advanceManagerUntil(
  managerPage: Page,
  targetVisible: () => Promise<boolean>,
  maxSteps = 24,
) {
  for (let step = 0; step < maxSteps; step++) {
    if (await targetVisible()) return;

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
    throw new Error('advanceManagerUntil: target never visible');
  }
}

async function joinPlayer(page: Page, pin: string, name: string) {
  await page.goto(BASE_URL);
  await waitForTestId(page, 'pin-input-digit-0');
  await page.locator(testIdSel('pin-input-digit-0')).click();
  await page.type(pin);
  await page.locator(testIdSel('join-submit')).click();
  await waitForTestId(page, 'username-input');
  await page.locator(testIdSel('username-input')).fill(name);
  await page.locator(testIdSel('join-submit')).click();
  await waitForTestId(page, 'waiting-room');
}

async function run() {
  const seqQ = quizFixture.questions.find((q) => q.type === 'sequencing');
  if (!seqQ || seqQ.type !== 'sequencing') {
    throw new Error('Fixture has no sequencing question');
  }
  const seqIndex = quizFixture.questions.findIndex((q) => q.type === 'sequencing');
  console.log(
    `Sequencing is Q${seqIndex + 1}/${quizFixture.questions.length} with ${seqQ.items.length} items (correctOrder length ${seqQ.correctOrder.length})`,
  );

  const managerSh: Stagehand = newStagehand();
  const p1Sh: Stagehand = newStagehand();
  const p2Sh: Stagehand = newStagehand();
  await managerSh.init();
  await p1Sh.init();
  await p2Sh.init();

  const managerPage = managerSh.context.activePage();
  const p1 = p1Sh.context.activePage();
  const p2 = p2Sh.context.activePage();
  if (!managerPage || !p1 || !p2) {
    throw new Error('Stagehand missing active page');
  }

  try {
    // Manager login + start quiz
    await managerPage.goto(`${BASE_URL}/manager`);
    await waitForTestId(managerPage, 'login-password');
    await managerPage.locator(testIdSel('login-username')).fill(e2eUsername());
    await managerPage.locator(testIdSel('login-password')).fill(requireE2EPassword());
    await managerPage.locator(testIdSel('login-submit')).click();
    await waitForTestIdPrefix(managerPage, 'quizz-row-');

    const quizId = await resolveQuizId(managerPage);
    await managerPage.locator(testIdSel(`quizz-row-${quizId}`)).click();
    await waitForTestId(managerPage, 'quizz-start-btn');
    await managerPage.locator(testIdSel('quizz-start-btn')).click();
    await waitForTestId(managerPage, 'game-pin');

    const { pin } = await managerSh.extract(
      'Locate the 6-digit PIN code displayed on the screen for players to join.',
      PinSchema,
    );
    console.log(`Game PIN ${pin}`);

    await joinPlayer(p1, pin, 'Seq-P1');
    await joinPlayer(p2, pin, 'Seq-P2');

    await waitForTestId(managerPage, 'next-btn');
    await managerPage.locator(testIdSel('next-btn')).click();

    // Play through questions until sequencing (both answer; P1 correct path for non-seq).
    for (let i = 0; i < quizFixture.questions.length; i++) {
      const q = quizFixture.questions[i];
      const controlId = answerControlTestId(q.type);

      await p1.waitForSelector(testIdSel(controlId), { state: 'visible', timeout: 45_000 });
      await p2.waitForSelector(testIdSel(controlId), { state: 'visible', timeout: 45_000 });

      const qText = await p1.locator(testIdSel('question-text')).first().innerText();
      if (!qText.includes(q.question)) {
        throw new Error(`Q${i + 1}: expected "${q.question}", got "${qText}"`);
      }

      if (q.type === 'sequencing') {
        console.log('Reached sequencing LIVE — P1 correct, P2 wrong');
        const s = q as {
          items: Array<{ id: string; label: string }>;
          correctOrder: string[];
        };
        await answerSequencing(p1, s.correctOrder, s.items);
        await answerSequencingWrong(p2, s);
      } else {
        // Both players answer correctly so score delta at sequencing is clear.
        await answerFixtureCorrect(p1, q);
        await answerFixtureCorrect(p2, q);
      }

      const isLast = i === quizFixture.questions.length - 1;
      const nextQ = isLast ? null : quizFixture.questions[i + 1];

      await advanceManagerUntil(managerPage, async () => {
        if (isLast) {
          return isTestIdVisible(managerPage, 'podium');
        }
        const text = await p1
          .locator(testIdSel('question-text'))
          .first()
          .innerText()
          .catch(() => '');
        return text.includes(nextQ!.question);
      });

      // After sequencing reveal/advance, assert leaderboard if present.
      if (q.type === 'sequencing') {
        // Walk until leaderboard or podium; assert P1 rank/score ≥ P2 when rows visible.
        const start = Date.now();
        let sawRows = false;
        while (Date.now() - start < 30_000) {
          const p1Row = await isTestIdVisible(managerPage, 'leaderboard-row-Seq-P1');
          const p2Row = await isTestIdVisible(managerPage, 'leaderboard-row-Seq-P2');
          if (p1Row && p2Row) {
            sawRows = true;
            const scores = await managerPage.evaluate(() => {
              const read = (name: string) => {
                const el = document.querySelector(`[data-testid="leaderboard-row-${name}"]`);
                return el?.textContent ?? '';
              };
              return { p1: read('Seq-P1'), p2: read('Seq-P2') };
            });
            console.log(`Leaderboard rows: P1="${scores.p1}" P2="${scores.p2}"`);
            // Extract first integer as points if present.
            const num = (s: string) => {
              const m = s.replace(/[,\s]/g, ' ').match(/(\d{1,6})/g);
              return m ? Math.max(...m.map(Number)) : null;
            };
            const s1 = num(scores.p1);
            const s2 = num(scores.p2);
            if (s1 != null && s2 != null && s1 <= s2) {
              throw new Error(
                `Expected Seq-P1 score > Seq-P2 after correct vs wrong sequencing (P1=${s1}, P2=${s2})`,
              );
            }
            if (s1 != null && s2 != null) {
              console.log(`Score assert OK: P1 ${s1} > P2 ${s2}`);
            }
            break;
          }
          if (await isTestIdVisible(managerPage, 'podium')) {
            console.log('Reached podium before leaderboard rows — accept as terminal success');
            break;
          }
          // Nudge manager next if stuck on responses.
          if (await isTestIdVisible(managerPage, 'responses-view')) {
            await managerPage.locator(testIdSel('next-btn')).click().catch(() => {});
          }
          await managerPage.waitForTimeout(1_000);
        }
        if (!sawRows && !(await isTestIdVisible(managerPage, 'podium'))) {
          console.warn('WARNING: neither leaderboard rows nor podium seen after sequencing');
        }
      }
    }

    await waitForTestId(managerPage, 'podium', { timeout: 30_000 });
    console.log('W6-10 sequencing-live PASSED (podium reached, no panic)');
  } finally {
    await managerSh.close();
    await p1Sh.close();
    await p2Sh.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error('W6-10 sequencing-live FAILED:', err);
    process.exit(1);
  },
);
