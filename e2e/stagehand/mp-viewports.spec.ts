/**
 * e2e/stagehand/mp-viewports.spec.ts — W6-MP / R1
 *
 * Smoke: manager lobby + player join shell render at 375 / 600 / 920 widths.
 * Full MP game loop stays in mp-loop.spec.ts; this is layout/readability gate.
 *
 * Run: E2E_PW=… npx tsx e2e/stagehand/mp-viewports.spec.ts
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { z } from 'zod';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://rust.razzoozle.xyz';
const VIEWPORTS = [
  { width: 375, height: 667, name: '375' },
  { width: 600, height: 800, name: '600' },
  { width: 920, height: 800, name: '920' },
];

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

/** Assert critical nodes are visible and have non-zero layout box. */
async function assertLayoutOk(page: Page, testId: string, label: string) {
  await waitForTestId(page, testId, 20_000);
  const box = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, x: r.x, overflowX: document.documentElement.scrollWidth > window.innerWidth + 2 };
  }, testId);
  if (!box || box.w < 8 || box.h < 8) {
    throw new Error(`${label}: ${testId} missing or squished (${JSON.stringify(box)})`);
  }
  // Soft warn on horizontal page overflow at 375
  if (box.overflowX) {
    console.warn(`${label}: page has horizontal overflow (soft)`);
  }
  console.log(`${label}: ${testId} ok ${Math.round(box.w)}x${Math.round(box.h)}`);
}

async function runViewport(vp: (typeof VIEWPORTS)[number]) {
  const managerSh: Stagehand = newStagehand();
  const playerSh: Stagehand = newStagehand();
  await managerSh.init();
  await playerSh.init();
  const manager = managerSh.context.activePage();
  const player = playerSh.context.activePage();
  if (!manager || !player) throw new Error('no pages');

  try {
    await manager.setViewportSize({ width: vp.width, height: vp.height });
    await player.setViewportSize({ width: vp.width, height: vp.height });

    await manager.goto(`${BASE_URL}/manager`);
    await waitForTestId(manager, 'login-password');
    await manager.locator(testIdSel('login-username')).fill(e2eUsername());
    await manager.locator(testIdSel('login-password')).fill(requireE2EPassword());
    await manager.locator(testIdSel('login-submit')).click();
    await waitForTestIdPrefix(manager, 'quizz-row-');
    await assertLayoutOk(manager, 'login-submit', `${vp.name} post-login` ).catch(async () => {
      // login-submit gone after login — check quiz row instead
      await assertLayoutOk(manager, `quizz-row-${await resolveQuizId(manager)}`, `${vp.name} quiz-row`);
    });

    const quizId = await resolveQuizId(manager);
    // re-assert quiz row if previous catch already did
    const rowVisible = await manager.locator(testIdSel(`quizz-row-${quizId}`)).isVisible().catch(() => false);
    if (rowVisible) {
      await assertLayoutOk(manager, `quizz-row-${quizId}`, `${vp.name} quiz-list`);
    }

    await manager.locator(testIdSel(`quizz-row-${quizId}`)).click();
    await waitForTestId(manager, 'quizz-start-btn');
    await assertLayoutOk(manager, 'quizz-start-btn', `${vp.name} start-btn`);
    await manager.locator(testIdSel('quizz-start-btn')).click();
    await waitForTestId(manager, 'game-pin');
    await assertLayoutOk(manager, 'game-pin', `${vp.name} game-pin`);

    const { pin } = await managerSh.extract(
      'Locate the 6-digit PIN code displayed on the screen for players to join.',
      PinSchema,
    );

    await player.goto(BASE_URL);
    await waitForTestId(player, 'pin-input-digit-0');
    await assertLayoutOk(player, 'pin-input-digit-0', `${vp.name} pin-input`);
    await player.locator(testIdSel('pin-input-digit-0')).click();
    await player.type(pin);
    await player.locator(testIdSel('join-submit')).click();
    await waitForTestId(player, 'username-input');
    await assertLayoutOk(player, 'username-input', `${vp.name} username`);
    await player.locator(testIdSel('username-input')).fill(`VP-${vp.name}`);
    await player.locator(testIdSel('join-submit')).click();
    await waitForTestId(player, 'waiting-room');
    await assertLayoutOk(player, 'waiting-room', `${vp.name} waiting-room`);

    console.log(`Viewport ${vp.name} PASSED`);
  } finally {
    await managerSh.close();
    await playerSh.close();
  }
}

async function run() {
  for (const vp of VIEWPORTS) {
    console.log(`--- viewport ${vp.name} ---`);
    await runViewport(vp);
  }
  console.log('W6-MP mp-viewports PASSED (375/600/920)');
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error('W6-MP FAILED:', e);
    process.exit(1);
  },
);
