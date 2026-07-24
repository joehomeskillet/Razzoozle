/**
 * e2e/stagehand/mid-game-reconnect.spec.ts — W6-4 / R4
 *
 * Mid-game player disconnect + rejoin:
 *   answer Q1 → kill player page → rejoin PIN+name → consistent mid-game state
 *   host advances → Q2 visible
 *
 * Run serial: E2E_PW=… npx tsx e2e/stagehand/mid-game-reconnect.spec.ts
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { z } from 'zod';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://rust.razzoozle.xyz';
const PLAYER = 'Rejoin-P1';

function requireE2EPassword(): string {
  const pw = process.env.E2E_PW;
  if (!pw) throw new Error('E2E_PW required');
  return pw;
}
function e2eUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

const PinSchema = z.object({ pin: z.string().regex(/^\d{6}$/) });
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

async function resolveQuizId(page: Page): Promise<string> {
  if (!page.url().startsWith(BASE_URL)) await page.goto(BASE_URL);
  const ids = await page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return (await res.json()) as string[];
  }, `${BASE_URL}/api/quizzes`);
  for (const candidate of ids.filter((id) => id.startsWith('e2e-all-ty-'))) {
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
  throw new Error('No fixture-matching e2e-all-ty quiz');
}

async function joinWithPin(page: Page, pin: string, name: string) {
  await page.goto(BASE_URL);
  await waitForTestId(page, 'pin-input-digit-0');
  await page.locator(testIdSel('pin-input-digit-0')).click();
  await page.type(pin);
  await page.locator(testIdSel('join-submit')).click();
  await waitForTestId(page, 'username-input');
  await page.locator(testIdSel('username-input')).fill(name);
  await page.locator(testIdSel('join-submit')).click();
}

async function advanceManagerUntil(
  manager: Page,
  target: () => Promise<boolean>,
  maxSteps = 16,
) {
  for (let i = 0; i < maxSteps; i++) {
    if (await target()) return;
    if (await isTestIdVisible(manager, 'next-btn')) {
      await manager.locator(testIdSel('next-btn')).click().catch(() => {});
    }
    await manager.waitForTimeout(1_200);
  }
  if (!(await target())) throw new Error('advanceManagerUntil exhausted');
}

async function run() {
  const q1 = quizFixture.questions[0];
  const q2 = quizFixture.questions[1];
  const managerSh: Stagehand = newStagehand();
  let playerSh: Stagehand | null = newStagehand();
  let rejoinSh: Stagehand | null = null;
  await managerSh.init();
  await playerSh.init();
  const manager = managerSh.context.activePage();
  let player = playerSh.context.activePage();
  if (!manager || !player) throw new Error('no pages');

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

    await joinWithPin(player, pin, PLAYER);
    await waitForTestId(player, 'waiting-room');
    await waitForTestId(manager, 'next-btn');
    await manager.locator(testIdSel('next-btn')).click();

    await player.waitForSelector(testIdSel('answer-btn-0'), { state: 'visible', timeout: 45_000 });
    const t1 = await player.locator(testIdSel('question-text')).first().innerText();
    if (!t1.includes(q1.question)) throw new Error(`Expected Q1, got ${t1}`);

    // Answer Q1 correctly (choice solution index)
    const sol = (q1 as { solutions?: number[] }).solutions?.[0] ?? 0;
    await player.locator(testIdSel(`answer-btn-${sol}`)).click();
    console.log('Q1 answered — simulating disconnect');

    // Kill player browser (socket DC)
    await playerSh.close();
    playerSh = null;
    player = null as unknown as Page;

    // Rejoin fresh browser with same PIN + name
    rejoinSh = newStagehand();
    await rejoinSh.init();
    const rejoin = rejoinSh.context.activePage();
    if (!rejoin) throw new Error('no rejoin page');
    await joinWithPin(rejoin, pin, PLAYER);

    // After rejoin: must not be on Q2 yet if host has not advanced past Q1 reveal/leaderboard.
    // Accept: waiting-room / result / answer UI for Q1 / mid-game shell — not Q2 text immediately
    // unless host already advanced (race). Wait a moment then read question text.
    await rejoin.waitForTimeout(2_000);
    const midText = await rejoin
      .locator(testIdSel('question-text'))
      .first()
      .innerText()
      .catch(() => '');
    if (midText.includes(q2.question)) {
      console.warn('WARNING: already on Q2 after rejoin (host may have auto-advanced)');
    } else {
      console.log(`Rejoin mid-state text="${midText.slice(0, 80)}" (not prematurely Q2)`);
    }

    // Host advances toward Q2
    await advanceManagerUntil(manager, async () => {
      const text = await rejoin
        .locator(testIdSel('question-text'))
        .first()
        .innerText()
        .catch(() => '');
      return text.includes(q2.question);
    });

    const after = await rejoin.locator(testIdSel('question-text')).first().innerText();
    if (!after.includes(q2.question)) {
      throw new Error(`Expected Q2 after advance, got "${after}"`);
    }
    console.log('W6-4 mid-game-reconnect PASSED');
  } finally {
    await managerSh.close();
    if (playerSh) await playerSh.close();
    if (rejoinSh) await rejoinSh.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error('W6-4 mid-game-reconnect FAILED:', err);
    process.exit(1);
  },
);
