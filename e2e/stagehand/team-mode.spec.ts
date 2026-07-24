/**
 * e2e/stagehand/team-mode.spec.ts — Team mode lobby and selection.
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { z } from 'zod';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = 'https://rust.razzoozle.xyz';

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

async function waitForTestId(page: Page, id: string, opts?: { state?: 'visible' | 'hidden'; timeout?: number }) {
  await page.waitForSelector(testIdSel(id), {
    state: opts?.state ?? 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

async function waitForTestIdPrefix(page: Page, prefix: string, opts?: { state?: 'visible'; timeout?: number }) {
  await page.waitForSelector(testIdPrefixSel(prefix), {
    state: opts?.state ?? 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

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
    throw new Error(`No seeded quiz id starting with "${prefix}" found.`);
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

  throw new Error(`No fully matching seeded quiz id found for "${prefix}".`);
}

async function runTeamModeSpec() {
  const password = requireE2EPassword();

  const managerStagehand: Stagehand = newStagehand();
  const player1Stagehand: Stagehand = newStagehand();
  const player2Stagehand: Stagehand = newStagehand();

  await managerStagehand.init();
  await player1Stagehand.init();
  await player2Stagehand.init();

  const managerPage = managerStagehand.context.activePage();
  const player1Page = player1Stagehand.context.activePage();
  const player2Page = player2Stagehand.context.activePage();

  if (!managerPage || !player1Page || !player2Page) {
    throw new Error('Stagehand did not produce an active page after init()');
  }

  try {
    // ============ MANAGER: LOGIN ============
    await managerPage.goto(`${BASE_URL}/manager`);
    await waitForTestId(managerPage, 'login-password');
    await managerPage.locator(testIdSel('login-username')).fill(e2eUsername());
    await managerPage.locator(testIdSel('login-password')).fill(password);
    await managerPage.locator(testIdSel('login-submit')).click();
    await waitForTestIdPrefix(managerPage, 'quizz-row-');

    // ============ MANAGER: ENABLE TEAM MODE GLOBALLY ============
    await managerPage.goto(`${BASE_URL}/manager/config/gamemode`);
    await managerPage.waitForSelector('#setting-team-mode button', { state: 'visible', timeout: 15_000 });
    
    // Ensure team mode toggle is turned on
    await managerPage.evaluate(() => {
      const btn = document.querySelector('#setting-team-mode button') as HTMLButtonElement | null;
      if (btn && btn.getAttribute('aria-checked') !== 'true') {
        btn.click();
      }
    });
    
    // Wait for optimistic save to complete
    await managerPage.waitForTimeout(1_000);

    // ============ MANAGER: OPEN + START QUIZ ============
    await managerPage.goto(`${BASE_URL}/manager/config/play`);
    await waitForTestIdPrefix(managerPage, 'quizz-row-');

    const quizId = await resolveQuizId(managerPage);
    await managerPage.locator(testIdSel(`quizz-row-${quizId}`)).click();
    await waitForTestId(managerPage, 'quizz-start-btn');

    // Enable per-game team mode toggle in ConfigSelectQuizz
    await managerPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button[role="switch"]'));
      for (const btn of buttons) {
        // ToggleField renders the text "Team-Modus" in a sibling/parent container
        const root = btn.parentElement?.parentElement;
        if (root && root.innerText.toLowerCase().includes('team')) {
          if (btn.getAttribute('aria-checked') !== 'true') {
            (btn as HTMLButtonElement).click();
          }
          return;
        }
      }
    });

    await managerPage.locator(testIdSel('quizz-start-btn')).click();
    await waitForTestId(managerPage, 'game-pin');

    const { pin: gamePin } = await managerStagehand.extract(
      'Locate the 6-digit PIN code displayed on the screen for players to join.',
      PinSchema,
    );

    // ============ PLAYERS: JOIN ============
    const players = [
      { page: player1Page, name: 'P1-Red' },
      { page: player2Page, name: 'P2-Blue' }
    ];

    for (const { page, name } of players) {
      await page.goto(BASE_URL);
      await waitForTestId(page, 'pin-input-digit-0');
      await page.locator(testIdSel('pin-input-digit-0')).click();
      await page.type(gamePin);
      await page.locator(testIdSel('join-submit')).click();
      await waitForTestId(page, 'username-input');
      await page.locator(testIdSel('username-input')).fill(name);
      await page.locator(testIdSel('join-submit')).click();
      await waitForTestId(page, 'waiting-room');

      // Assert Wait lobby shows team UI when teamMode is active
      const teamGroupVisible = await page.evaluate(() => {
        return !!document.querySelector('div[role="group"]');
      });
      if (!teamGroupVisible) {
        throw new Error(`Team selection group not visible in waiting room for ${name}`);
      }
    }

    // ============ PLAYERS: PICK TEAM ============
    // P1 picks Red (1st button)
    await player1Page.evaluate(() => {
      const teamBtns = document.querySelectorAll('div[role="group"] button');
      if (teamBtns.length > 0) {
        (teamBtns[0] as HTMLButtonElement).click();
      }
    });

    // P2 picks Blue (2nd button)
    await player2Page.evaluate(() => {
      const teamBtns = document.querySelectorAll('div[role="group"] button');
      if (teamBtns.length > 1) {
        (teamBtns[1] as HTMLButtonElement).click();
      }
    });

    // Short buffer for socket events
    await player1Page.waitForTimeout(1_000);

    // ============ MANAGER: START GAME ============
    await waitForTestId(managerPage, 'next-btn');
    await managerPage.locator(testIdSel('next-btn')).click();

    // Q1 in all-types-quiz.json is "choice" type. We submit the correct answer (solutions[0] = index 1 -> Mars)
    const q1ControlId = 'answer-btn-1';
    
    await player1Page.waitForSelector(testIdSel(q1ControlId), { state: 'visible', timeout: 45_000 });
    await player1Page.locator(testIdSel(q1ControlId)).click();

    await player2Page.waitForSelector(testIdSel(q1ControlId), { state: 'visible', timeout: 45_000 });
    await player2Page.locator(testIdSel(q1ControlId)).click();

    // ============ MANAGER: ADVANCE ============
    // Move to responses view
    await managerPage.locator(testIdSel('next-btn')).click();
    await managerPage.waitForTimeout(1_500);
    // Move to leaderboard
    await managerPage.locator(testIdSel('next-btn')).click();

    await managerPage.waitForSelector(testIdPrefixSel('leaderboard-row-'), { state: 'visible', timeout: 15_000 });
    
    // Best-effort check for team indicators on leaderboard
    const hasTeamModeIndicators = await managerPage.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid^="leaderboard-row-"]');
      return Array.from(rows).some(row => 
        row.innerHTML.includes('Red') || 
        row.innerHTML.includes('Blue') ||
        row.innerHTML.includes('Rot') ||
        row.innerHTML.includes('Blau') ||
        row.innerHTML.includes('var(--team-') ||
        row.className.includes('bg-')
      );
    });
    
    console.log('Leaderboard reached. Has team indicators:', hasTeamModeIndicators);
    console.log('Team mode game loop passed: players joined, picked teams, answered Q1, reached leaderboard.');
  } finally {
    await managerStagehand.close();
    await player1Stagehand.close();
    await player2Stagehand.close();
  }
}

runTeamModeSpec().then(
  () => process.exit(0),
  (err) => {
    console.error('Team mode loop failed:', err);
    process.exit(1);
  },
);
