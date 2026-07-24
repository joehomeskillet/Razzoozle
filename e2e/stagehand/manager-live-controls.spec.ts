/**
 * e2e/stagehand/manager-live-controls.spec.ts — W6-3 / R6–R8
 *
 * Host live controls on game-control-panel:
 *   R6 skipQuestion → players advance to next fixture question
 *   R7 adjustTimer +10s → control stays usable (best-effort)
 *   R8 revealAnswer → responses/result UI appears before natural deadline
 *
 * Run: E2E_PW=… npx tsx e2e/stagehand/manager-live-controls.spec.ts
 * Serial only.
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { z } from 'zod';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://rust.razzoozle.xyz';

function requireE2EPassword(): string {
  const pw = process.env.E2E_PW;
  if (!pw) throw new Error('E2E_PW environment variable is required');
  return pw;
}
function e2eUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

const PinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
});

const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

async function waitForTestId(page: Page, id: string, timeout = 15_000) {
  await page.waitForSelector(testIdSel(id), { state: 'visible', timeout });
}
async function waitForTestIdPrefix(page: Page, prefix: string, timeout = 15_000) {
  await page.waitForSelector(testIdPrefixSel(prefix), { state: 'visible', timeout });
}
async function isTestIdVisible(page: Page, id: string) {
  return page.locator(testIdSel(id)).isVisible().catch(() => false);
}

/** Click a control-panel button by aria-label candidates (en+de). */
async function clickControlByAria(page: Page, ...labels: string[]) {
  await waitForTestId(page, 'game-control-panel', 20_000);
  const clicked = await page.evaluate((cands) => {
    const panel = document.querySelector('[data-testid="game-control-panel"]');
    if (!panel) return null;
    const buttons = Array.from(panel.querySelectorAll('button'));
    for (const b of buttons) {
      const aria = (b.getAttribute('aria-label') ?? '').trim();
      const title = (b.getAttribute('title') ?? '').trim();
      if (cands.includes(aria) || cands.includes(title)) {
        (b as HTMLButtonElement).click();
        return aria || title;
      }
    }
    return null;
  }, labels);
  if (!clicked) {
    throw new Error(`No control button matching aria/title in: ${labels.join(' | ')}`);
  }
  console.log(`Clicked control: "${clicked}"`);
}

async function resolveQuizId(page: Page): Promise<string> {
  if (!page.url().startsWith(BASE_URL)) await page.goto(BASE_URL);
  const ids = await page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return (await res.json()) as string[];
  }, `${BASE_URL}/api/quizzes`);
  const candidates = ids.filter((id) => id.startsWith('e2e-all-ty-'));
  for (const candidate of candidates) {
    const ok = await page.evaluate(
      async ({ url, n, first }) => {
        const res = await fetch(url);
        if (!res.ok) return false;
        const body = (await res.json()) as { questions?: Array<{ question: string }> };
        return body.questions?.length === n && body.questions?.[0]?.question === first;
      },
      {
        url: `${BASE_URL}/api/quizz/${candidate}/solo`,
        n: quizFixture.questions.length,
        first: quizFixture.questions[0].question,
      },
    );
    if (ok) return candidate;
  }
  throw new Error(`No fixture-matching quiz among ${candidates.join(',')}`);
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
  const q1 = quizFixture.questions[0];
  const q2 = quizFixture.questions[1];
  if (!q1 || !q2) throw new Error('Fixture needs ≥2 questions');

  const managerSh: Stagehand = newStagehand();
  const playerSh: Stagehand = newStagehand();
  await managerSh.init();
  await playerSh.init();
  const manager = managerSh.context.activePage();
  const player = playerSh.context.activePage();
  if (!manager || !player) throw new Error('No active page');

  try {
    await manager.goto(`${BASE_URL}/manager`);
    await waitForTestId(manager, 'login-password');
    await manager.locator(testIdSel('login-username')).fill(e2eUsername());
    await manager.locator(testIdSel('login-password')).fill(requireE2EPassword());
    await manager.locator(testIdSel('login-submit')).click();
    await waitForTestIdPrefix(manager, 'quizz-row-');

    const quizId = await resolveQuizId(manager);
    await manager.locator(testIdSel(`quizz-row-${quizId}`)).click();
    await waitForTestId(manager, 'quizz-start-btn');
    await manager.locator(testIdSel('quizz-start-btn')).click();
    await waitForTestId(manager, 'game-pin');

    const { pin } = await managerSh.extract(
      'Locate the 6-digit PIN code displayed on the screen for players to join.',
      PinSchema,
    );
    console.log(`PIN ${pin}`);

    await joinPlayer(player, pin, 'Ctrl-P1');
    await waitForTestId(manager, 'next-btn');
    await manager.locator(testIdSel('next-btn')).click();

    // Wait for Q1 answer control
    await player.waitForSelector(testIdSel('answer-btn-0'), { state: 'visible', timeout: 45_000 });
    const t1 = await player.locator(testIdSel('question-text')).first().innerText();
    if (!t1.includes(q1.question)) {
      throw new Error(`Expected Q1 "${q1.question}", got "${t1}"`);
    }
    console.log('Q1 visible — testing live controls');

    // R7 first: +10s while answer window is open (before skip/reveal closes it).
    await clickControlByAria(
      manager,
      'Add 10 seconds',
      '10 Sekunden dazugeben',
      'Ajouter 10 secondes',
      'Añadir 10 segundos',
      'Aggiungi 10 secondi',
    );
    if (!(await isTestIdVisible(manager, 'game-control-panel'))) {
      throw new Error('game-control-panel disappeared after +10s');
    }
    console.log('R7 adjustTimer +10s OK (panel still present)');

    // R8: revealAnswer ends answer window (same family as skip — request_abort path).
    // Prefer reveal first so we can assert UI progress; skip is equivalent abort.
    await clickControlByAria(
      manager,
      'Reveal answer',
      'Auflösen',
      'Révéler la réponse',
      'Mostrar respuesta',
      'Mostra risposta',
      '揭晓答案',
    );

    const revealDeadline = Date.now() + 20_000;
    let revealed = false;
    while (Date.now() < revealDeadline) {
      const managerResponses = await isTestIdVisible(manager, 'responses-view');
      const anyDisabled = await player.evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll('[data-testid^="answer-btn-"]'),
        ) as HTMLButtonElement[];
        return btns.length > 0 && btns.every((b) => b.disabled);
      });
      const nextVisible = await isTestIdVisible(manager, 'next-btn');
      if (managerResponses || anyDisabled || nextVisible) {
        revealed = true;
        break;
      }
      await player.waitForTimeout(400);
    }
    if (!revealed) {
      throw new Error('After reveal, neither responses-view nor disabled answers nor next-btn observed');
    }
    console.log('R8 revealAnswer OK (answer window closed / results path)');

    // R6: skipQuestion is implemented as abort of SelectAnswer (same as reveal for
    // an open window). After reveal we are past SelectAnswer — exercise skip on
    // the NEXT question's answer window instead.
    // Advance manager through responses/recap/leaderboard to Q2.
    for (let step = 0; step < 12; step++) {
      const text = await player
        .locator(testIdSel('question-text'))
        .first()
        .innerText()
        .catch(() => '');
      if (text.includes(q2.question)) break;
      if (await isTestIdVisible(manager, 'next-btn')) {
        await manager.locator(testIdSel('next-btn')).click().catch(() => {});
      }
      await manager.waitForTimeout(1_200);
    }

    await player.waitForSelector(testIdSel('answer-btn-0'), { state: 'visible', timeout: 45_000 });
    const t2 = await player.locator(testIdSel('question-text')).first().innerText();
    if (!t2.includes(q2.question)) {
      throw new Error(`Expected Q2 "${q2.question}" before skip test, got "${t2}"`);
    }

    await clickControlByAria(
      manager,
      'Skip question',
      'Frage überspringen',
      'Passer la question',
      'Saltar pregunta',
      'Salta domanda',
    );

    const skipDeadline = Date.now() + 20_000;
    let skipped = false;
    while (Date.now() < skipDeadline) {
      if (await isTestIdVisible(manager, 'responses-view')) {
        skipped = true;
        break;
      }
      const disabled = await player.evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll('[data-testid^="answer-btn-"]'),
        ) as HTMLButtonElement[];
        return btns.length > 0 && btns.every((b) => b.disabled);
      });
      if (disabled) {
        skipped = true;
        break;
      }
      await player.waitForTimeout(400);
    }
    if (!skipped) {
      throw new Error('After skip on Q2, answer window did not close');
    }
    console.log('R6 skipQuestion OK (aborted Q2 answer window → results path)');

    console.log('W6-3 manager-live-controls PASSED');
  } finally {
    await managerSh.close();
    await playerSh.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error('W6-3 manager-live-controls FAILED:', err);
    process.exit(1);
  },
);
