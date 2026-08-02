/**
 * e2e/stagehand/team-mode.spec.ts — W6-7 / R10
 *
 * Deterministic (no act()): enable teamMode on start panel when available,
 * join 2 players, assert team picker in lobby Wait UI.
 *
 * Run: E2E_PW=… npx tsx e2e/stagehand/team-mode.spec.ts
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { z } from 'zod';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://rust.razzoozle.xyz';
const TEAM_PICKER_SELECTOR = 'div[role=group][aria-label] button[aria-pressed]';

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

async function setNativeSelectValue(page: Page, testId: string, value: string) {
  await page.evaluate(
    (target: [string, string]) => {
      const [id, nextValue] = target as [string, string];
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLSelectElement | null;
      if (!el) throw new Error(`Missing required select [data-testid="${id}"]`);
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      if (!descriptor?.set) throw new Error(`No value setter for [data-testid="${id}"]`);

      descriptor.set.call(el, nextValue);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [testId, value],
  );
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

async function joinPlayer(page: Page, pin: string, name: string) {
  await page.goto(BASE_URL);
  await waitForTestId(page, 'pin-input-digit-0');
  await page.locator(testIdSel('pin-input-digit-0')).click();
  await page.type(pin);
  await page.locator(testIdSel('join-submit')).click();
  await waitForTestId(page, 'username-input');
  await page.locator(testIdSel('username-input')).fill(name);
  await page.locator(testIdSel('join-submit')).click();
  await waitForTestId(page, 'waiting-room', 20_000);
}

async function clickNav(page: Page, ...labels: string[]) {
  return page.evaluate((cands) => {
    const els = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"]'));
    for (const el of els) {
      const t = (el.textContent ?? '').trim().toLowerCase();
      if (cands.some((c) => t === c.toLowerCase() || t.includes(c.toLowerCase()))) {
        (el as HTMLElement).click();
        return t;
      }
    }
    return null;
  }, labels);
}

/** Enable global teamMode capability in Game Mode settings if present. */
async function ensureTeamModeCapability(page: Page) {
  await clickNav(page, 'System', 'system');
  await page.waitForTimeout(300);
  await clickNav(page, 'Game mode', 'Spielmodus', 'gamemode', 'Game Mode', 'Modi');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('label, button, [role="switch"], div'));
    for (const el of nodes) {
      const t = (el.textContent ?? '').toLowerCase();
      if (!(t.includes('team mode') || t.includes('teammodus') || t.includes('team-modus') || t.includes('teammode'))) {
        continue;
      }
      const sw =
        (el.matches('[role="switch"]') ? el : null) ||
        el.querySelector('[role="switch"]') ||
        el.closest('div')?.querySelector('[role="switch"]');
      if (sw) {
        const pressed = sw.getAttribute('aria-checked') === 'true' || sw.getAttribute('data-state') === 'checked';
        if (!pressed) (sw as HTMLElement).click();
        return;
      }
    }
  });
  await page.waitForTimeout(500);
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
  await manager.setViewportSize({ width: 1280, height: 800 });

  try {
    await manager.goto(`${BASE_URL}/manager`);
    await waitForTestId(manager, 'login-password');
    await manager.locator(testIdSel('login-username')).fill(e2eUsername());
    await manager.locator(testIdSel('login-password')).fill(requireE2EPassword());
    await manager.locator(testIdSel('login-submit')).click();
    await waitForTestIdPrefix(manager, 'quizz-row-');

    await ensureTeamModeCapability(manager);

    await manager.goto(`${BASE_URL}/manager/config/play`);
    await waitForTestIdPrefix(manager, 'quizz-row-');
    const quizId = await resolveQuizId(manager);
    await manager.locator(testIdSel(`quizz-row-${quizId}`)).click();
    await waitForTestId(manager, 'play-options-btn');

    await manager.locator(testIdSel('play-options-btn')).click();
    await waitForTestId(manager, 'play-options-panel');
    await waitForTestId(manager, 'play-team-mode');
    await setNativeSelectValue(manager, 'play-team-mode', 'self');
    await manager.keyboard.press('Escape');
    await manager.waitForSelector(testIdSel('play-options-panel'), { state: 'hidden' });
    await manager.waitForSelector(testIdSel('play-team-mode'), { state: 'hidden' });

    await waitForTestId(manager, 'quizz-start-btn');
    await manager.locator(testIdSel('quizz-start-btn')).click();
    await waitForTestId(manager, 'game-pin');
    const { pin } = await managerSh.extract(
      'Locate the 6-digit PIN code displayed on the screen for players to join.',
      PinSchema,
    );

    await joinPlayer(p1, pin, 'Team-A-P1');
    await joinPlayer(p2, pin, 'Team-B-P2');

    const teamButtons = p1.locator(TEAM_PICKER_SELECTOR);
    const teamButtonCount = await teamButtons.count();
    console.log(`Team picker has ${teamButtonCount} buttons`);
    if (teamButtonCount < 2) throw new Error(`Team picker contract missing: expected at least 2 selectable teams, got ${teamButtonCount}`);
    const firstTeam = teamButtons.first();
    await firstTeam.click();
    const firstPressed = await firstTeam.getAttribute('aria-pressed');
    if (firstPressed !== 'true') {
      throw new Error(`Team selection did not apply: first team button aria-pressed is ${String(firstPressed)}`);
    }

    console.log('W6-7 team-mode PASSED');
  } finally {
    await managerSh.close();
    await p1Sh.close();
    await p2Sh.close();
  }
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error('W6-7 team-mode FAILED:', e);
    process.exit(1);
  },
);
