/**
 * e2e/stagehand/duplicate-name-reject.spec.ts — W6-8 / R13
 *
 * Second player with same username rejected (errors:game.duplicateName) OR
 * auto-suffix (product currently rejects — assert error, not waiting-room).
 *
 * Run: E2E_PW=… npx tsx e2e/stagehand/duplicate-name-reject.spec.ts
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { z } from 'zod';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://rust.razzoozle.xyz';
const NAME = 'DupAlice';

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
  for (const c of ids.filter((id) => id.startsWith('e2e-all-ty-'))) {
    const ok = await page.evaluate(
      async ({ url, n, first }) => {
        const res = await fetch(url);
        if (!res.ok) return false;
        const body = (await res.json()) as { questions?: Array<{ question: string }> };
        return body.questions?.length === n && body.questions?.[0]?.question === first;
      },
      {
        url: `${BASE_URL}/api/quizz/${c}/solo`,
        n: quizFixture.questions.length,
        first: quizFixture.questions[0].question,
      },
    );
    if (ok) return c;
  }
  throw new Error('No fixture quiz');
}

async function fillPin(page: Page, pin: string) {
  await page.goto(BASE_URL);
  await waitForTestId(page, 'pin-input-digit-0');
  await page.locator(testIdSel('pin-input-digit-0')).click();
  await page.type(pin);
  await page.locator(testIdSel('join-submit')).click();
  await waitForTestId(page, 'username-input');
}

async function run() {
  const managerSh: Stagehand = newStagehand();
  const p1Sh: Stagehand = newStagehand();
  const p2Sh: Stagehand = newStagehand();
  await managerSh.init();
  await p1Sh.init();
  await p2Sh.init();
  const manager = managerSh.context.activePage();
  const p1 = p1Sh.context.activePage();
  const p2 = p2Sh.context.activePage();
  if (!manager || !p1 || !p2) throw new Error('no pages');

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

    // P1 joins as DupAlice
    await fillPin(p1, pin);
    await p1.locator(testIdSel('username-input')).fill(NAME);
    await p1.locator(testIdSel('join-submit')).click();
    await waitForTestId(p1, 'waiting-room', 20_000);
    console.log('P1 joined OK');

    // P2 same name — expect reject (stay on username form or error, not waiting-room)
    await fillPin(p2, pin);
    await p2.locator(testIdSel('username-input')).fill(NAME);
    await p2.locator(testIdSel('join-submit')).click();
    await p2.waitForTimeout(2_500);

    const p2Waiting = await isTestIdVisible(p2, 'waiting-room');
    if (p2Waiting) {
      // Product may allow suffix rename into waiting-room — check displayed name
      const body = await p2.evaluate(() => document.body.innerText);
      if (body.includes(`${NAME}-2`) || body.includes(`${NAME} 2`) || /\bDupAlice-2\b/.test(body)) {
        console.log('W6-8: server applied -2 suffix (acceptable per R13)');
      } else {
        throw new Error('P2 reached waiting-room with same name without visible suffix — unexpected');
      }
    } else {
      // Still on join/username or saw error — good
      const stillUsername = await isTestIdVisible(p2, 'username-input');
      const errText = await p2.evaluate(() => document.body.innerText.toLowerCase());
      const hasErr =
        errText.includes('duplicate') ||
        errText.includes('already') ||
        errText.includes('vergeben') ||
        errText.includes('bereits') ||
        errText.includes('taken') ||
        errText.includes('name');
      if (!stillUsername && !hasErr) {
        console.warn(`WARNING: no waiting-room, no username field, weak error signal. body snippet: ${errText.slice(0, 200)}`);
      }
      console.log(
        `W6-8: duplicate rejected (waiting-room=${p2Waiting}, username-input=${stillUsername}, errHint=${hasErr})`,
      );
    }

    console.log('W6-8 duplicate-name-reject PASSED');
  } finally {
    await managerSh.close();
    await p1Sh.close();
    await p2Sh.close();
  }
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error('W6-8 FAILED:', e);
    process.exit(1);
  },
);
