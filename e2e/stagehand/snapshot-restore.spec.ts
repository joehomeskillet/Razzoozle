/**
 * W6-1 / R3: safe snapshot-restore coverage through player kill-rejoin.
 *
 * Run serially: E2E_PW=... npx tsx e2e/stagehand/snapshot-restore.spec.ts
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

const BASE_URL = 'https://rust.razzoozle.xyz';
const PLAYER_NAME = 'Snapshot-Player';
const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

function requireE2EPassword(): string {
  const password = process.env.E2E_PW;
  if (!password) {
    throw new Error('E2E_PW environment variable is required for manager login.');
  }
  return password;
}

async function waitForTestId(page: Page, id: string, timeout = 15_000) {
  await page.waitForSelector(testIdSel(id), { state: 'visible', timeout });
}

async function isTestIdVisible(page: Page, id: string): Promise<boolean> {
  return page.locator(testIdSel(id)).isVisible().catch(() => false);
}

async function resolveQuizId(page: Page, firstQuestion: string): Promise<string> {
  const ids = await page.evaluate(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url} failed with status ${response.status}`);
    return (await response.json()) as string[];
  }, `${BASE_URL}/api/quizzes`);

  const candidates = ids.filter((id) => id.startsWith('e2e-all-ty-'));
  for (const id of candidates) {
    const matches = await page.evaluate(
      async ({ url, expectedCount, expectedFirst }) => {
        const response = await fetch(url);
        if (!response.ok) return false;
        const body = (await response.json()) as { questions?: Array<{ question: string }> };
        return (
          body.questions?.length === expectedCount &&
          body.questions?.[0]?.question === expectedFirst
        );
      },
      {
        url: `${BASE_URL}/api/quizz/${id}/solo`,
        expectedCount: quizFixture.questions.length,
        expectedFirst: firstQuestion,
      },
    );
    if (matches) return id;
  }
  throw new Error(`No E2E All Types quiz matches ${quizFixture.questions.length} fixture questions`);
}

async function joinPlayer(page: Page, pin: string) {
  await page.goto(BASE_URL);
  await waitForTestId(page, 'pin-input-digit-0');
  await page.locator(testIdSel('pin-input-digit-0')).click();
  await page.type(pin);
  await page.locator(testIdSel('join-submit')).click();
  await waitForTestId(page, 'username-input');
  await page.locator(testIdSel('username-input')).fill(PLAYER_NAME);
  await page.locator(testIdSel('join-submit')).click();
  await waitForTestId(page, 'waiting-room');
}

async function advanceToLeaderboard(managerPage: Page) {
  for (let step = 0; step < 16; step++) {
    if (await isTestIdVisible(managerPage, `leaderboard-row-${PLAYER_NAME}`)) return;

    const canAdvance =
      (await isTestIdVisible(managerPage, 'responses-view')) ||
      (await isTestIdVisible(managerPage, 'round-recap')) ||
      (await managerPage
        .locator(testIdPrefixSel('leaderboard-row-'))
        .first()
        .isVisible()
        .catch(() => false));
    if (canAdvance) {
      await managerPage.locator(testIdSel('next-btn')).click();
    }
    await managerPage.waitForTimeout(1_500);
  }
  throw new Error(`Leaderboard row for ${PLAYER_NAME} never became visible`);
}

async function runSnapshotRestore() {
  const password = requireE2EPassword();
  const [q1, q2] = quizFixture.questions;
  if (!q1 || !q2 || q1.type !== 'choice' || q1.solutions?.[0] === undefined) {
    throw new Error('all-types-quiz.json must start with a scored choice question followed by Q2');
  }

  const managerStagehand: Stagehand = newStagehand();
  const playerStagehand: Stagehand = newStagehand();
  let rejoinedStagehand: Stagehand | undefined;
  let originalPlayerClosed = false;

  await managerStagehand.init();
  await playerStagehand.init();
  const managerPage = managerStagehand.context.activePage();
  const playerPage = playerStagehand.context.activePage();
  if (!managerPage || !playerPage) throw new Error('Stagehand did not produce active pages');

  try {
    await managerPage.goto(`${BASE_URL}/manager`);
    await waitForTestId(managerPage, 'login-password');
    await managerPage.locator(testIdSel('login-username')).fill(process.env.E2E_USER ?? 'admin');
    await managerPage.locator(testIdSel('login-password')).fill(password);
    await managerPage.locator(testIdSel('login-submit')).click();
    await managerPage.waitForSelector(testIdPrefixSel('quizz-row-'), {
      state: 'visible',
      timeout: 15_000,
    });

    const quizId = await resolveQuizId(managerPage, q1.question);
    await managerPage.locator(testIdSel(`quizz-row-${quizId}`)).click();
    await waitForTestId(managerPage, 'quizz-start-btn');
    await managerPage.locator(testIdSel('quizz-start-btn')).click();
    await waitForTestId(managerPage, 'game-pin');
    const pinText = await managerPage.locator(testIdSel('game-pin')).innerText();
    const pin = pinText.replace(/\D/g, '');
    if (!/^\d{6}$/.test(pin)) throw new Error(`Expected a 6-digit game PIN, got "${pinText}"`);

    await joinPlayer(playerPage, pin);
    const gameId = new URL(playerPage.url()).pathname.split('/').filter(Boolean).at(-1);
    if (!gameId) throw new Error(`Could not derive game id from ${playerPage.url()}`);
    const tokenKey = `player_token:${gameId}`;
    const playerToken = await playerPage.evaluate((key) => localStorage.getItem(key), tokenKey);
    if (!playerToken) throw new Error(`Join did not persist ${tokenKey}`);

    await managerPage.locator(testIdSel('next-btn')).click();
    await waitForTestId(playerPage, `answer-btn-${q1.solutions[0]}`, 45_000);
    const q1Text = await playerPage.locator(testIdSel('question-text')).innerText();
    if (!q1Text.includes(q1.question)) throw new Error(`Expected Q1 "${q1.question}", got "${q1Text}"`);
    await playerPage.locator(testIdSel(`answer-btn-${q1.solutions[0]}`)).click();
    await waitForTestId(managerPage, 'responses-view', 30_000);

    await playerStagehand.close();
    originalPlayerClosed = true;

    rejoinedStagehand = newStagehand();
    await rejoinedStagehand.init();
    const rejoinedPage = rejoinedStagehand.context.activePage();
    if (!rejoinedPage) throw new Error('Fresh Stagehand did not produce an active player page');
    await rejoinedPage.goto(BASE_URL);
    await rejoinedPage.evaluate(
      ({ key, token }) => localStorage.setItem(key, token),
      { key: tokenKey, token: playerToken },
    );
    await rejoinedPage.goto(`${BASE_URL}/party/${gameId}`);
    await waitForTestId(rejoinedPage, 'answer-result', 15_000);

    await advanceToLeaderboard(managerPage);
    const rowText = await managerPage
      .locator(testIdSel(`leaderboard-row-${PLAYER_NAME}`))
      .innerText();
    const rowNumbers = rowText.match(/\d+/g);
    const score = rowNumbers ? Number(rowNumbers.at(-1)) : Number.NaN;
    if (!Number.isFinite(score) || score <= 0) {
      throw new Error(`Expected persisted Q1 score > 0 for ${PLAYER_NAME}, row was "${rowText}"`);
    }

    await managerPage.locator(testIdSel('next-btn')).click();
    await waitForTestId(rejoinedPage, 'question-text', 45_000);
    const q2Text = await rejoinedPage.locator(testIdSel('question-text')).innerText();
    if (!q2Text.includes(q2.question)) throw new Error(`Expected Q2 "${q2.question}", got "${q2Text}"`);

    console.log(`W6-1 passed: ${PLAYER_NAME} rejoined with persisted Q1 score and reached Q2.`);
  } finally {
    await managerStagehand.close();
    if (!originalPlayerClosed) await playerStagehand.close();
    if (rejoinedStagehand) await rejoinedStagehand.close();
  }
}

runSnapshotRestore().then(
  () => process.exit(0),
  (error) => {
    console.error('W6-1 snapshot-restore failed:', error);
    process.exit(1);
  },
);
