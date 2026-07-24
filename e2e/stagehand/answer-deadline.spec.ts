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
    throw new Error('No seeded quiz id found.');
  }

  for (const candidate of candidates) {
    const matches = await page.evaluate(
      async ({ url, expectedCount, expectedFirstQuestion }) => {
        const res = await fetch(url);
        if (!res.ok) return false;
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
    if (matches) return candidate;
  }
  throw new Error('No match found.');
}

async function advanceManagerUntil(
  managerPage: Page,
  targetVisible: () => Promise<boolean>,
  maxSteps = 20,
) {
  for (let step = 0; step < maxSteps; step++) {
    if (await targetVisible()) {
      return;
    }

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

async function runAnswerDeadlineTest() {
  const password = requireE2EPassword();

  const managerStagehand: Stagehand = newStagehand();
  const p1Stagehand: Stagehand = newStagehand();
  const p2Stagehand: Stagehand = newStagehand();

  await managerStagehand.init();
  await p1Stagehand.init();
  await p2Stagehand.init();

  const managerPage = managerStagehand.context.activePage();
  const p1Page = p1Stagehand.context.activePage();
  const p2Page = p2Stagehand.context.activePage();

  if (!managerPage || !p1Page || !p2Page) {
    throw new Error('Failed to init pages');
  }

  try {
    // 1. Manager login
    await managerPage.goto(`${BASE_URL}/manager`);
    await waitForTestId(managerPage, 'login-password');
    await managerPage.locator(testIdSel('login-username')).fill(e2eUsername());
    await managerPage.locator(testIdSel('login-password')).fill(password);
    await managerPage.locator(testIdSel('login-submit')).click();
    await waitForTestIdPrefix(managerPage, 'quizz-row-');

    // 2. Start Game
    const quizId = await resolveQuizId(managerPage);
    await managerPage.locator(testIdSel(`quizz-row-${quizId}`)).click();
    await waitForTestId(managerPage, 'quizz-start-btn');
    await managerPage.locator(testIdSel('quizz-start-btn')).click();
    await waitForTestId(managerPage, 'game-pin');

    const { pin: gamePin } = await managerStagehand.extract(
      'Locate the 6-digit PIN code displayed on the screen for players to join.',
      PinSchema,
    );

    // 3. P1 Join
    await p1Page.goto(BASE_URL);
    await waitForTestId(p1Page, 'pin-input-digit-0');
    await p1Page.locator(testIdSel('pin-input-digit-0')).click();
    await p1Page.type(gamePin);
    await p1Page.locator(testIdSel('join-submit')).click();
    await waitForTestId(p1Page, 'username-input');
    await p1Page.locator(testIdSel('username-input')).fill('EarlyPlayer');
    await p1Page.locator(testIdSel('join-submit')).click();
    await waitForTestId(p1Page, 'waiting-room');

    // 4. P2 Join
    await p2Page.goto(BASE_URL);
    await waitForTestId(p2Page, 'pin-input-digit-0');
    await p2Page.locator(testIdSel('pin-input-digit-0')).click();
    await p2Page.type(gamePin);
    await p2Page.locator(testIdSel('join-submit')).click();
    await waitForTestId(p2Page, 'username-input');
    await p2Page.locator(testIdSel('username-input')).fill('LatePlayer');
    await p2Page.locator(testIdSel('join-submit')).click();
    await waitForTestId(p2Page, 'waiting-room');

    // 5. Manager starts the game
    await waitForTestId(managerPage, 'next-btn');
    await managerPage.locator(testIdSel('next-btn')).click();

    // 6. Wait for question 1 on both players
    const q1 = quizFixture.questions[0]; // "Which planet is known as the Red Planet?"
    const controlId = 'answer-btn-0';

    await p1Page.waitForSelector(testIdSel(controlId), { state: 'visible', timeout: 15_000 });
    await p2Page.waitForSelector(testIdSel(controlId), { state: 'visible', timeout: 15_000 });

    const p1QuestionText = await p1Page.locator(testIdSel('question-text')).first().innerText();
    if (!p1QuestionText.includes(q1.question)) {
      throw new Error(`P1: Expected "${q1.question}", got "${p1QuestionText}"`);
    }

    // 7. P1 answers correctly and early (Mars = index 1)
    await p1Page.locator(testIdSel(`answer-btn-${q1.solutions![0]}`)).click();

    // 8. P2 waits >10s (timer is 10s). Let's wait 12s to be sure.
    console.log('Waiting 12s for deadline to pass for P2...');
    await p2Page.waitForTimeout(12000);

    // After 12s, P2 attempts to answer correctly (or anything).
    // The button might be disabled, or the click might do nothing.
    const p2BtnDisabled = await isDisabledSelector(p2Page, testIdSel(`answer-btn-${q1.solutions![0]}`));
    
    if (p2BtnDisabled) {
      console.log('P2 button is disabled after deadline, as expected.');
    } else {
      console.log('P2 button is NOT disabled. Clicking it anyway to test server-side rejection.');
      await p2Page.locator(testIdSel(`answer-btn-${q1.solutions![0]}`)).click().catch(err => {
        console.log('Click on P2 button failed (maybe disabled?):', err.message);
      });
    }

    // 9. Advance manager to the leaderboard
    // The sequence for question 1: answers -> round-recap -> leaderboard -> next question
    await advanceManagerUntil(managerPage, async () => {
      // Check if leaderboard rows are visible on manager
      return managerPage.locator(testIdPrefixSel('leaderboard-row-')).first().isVisible().catch(() => false);
    });

    // 10. Check the scores on the manager leaderboard.
    // We expect P1 to have a positive score (because they answered correctly and early).
    // We expect P2 to have a score of 0 (because they answered late, or click was ignored).
    
    // We need to fetch the scores from the manager page's DOM.
    // Let's grab all rows and check their texts.
    const rowLocators = managerPage.locator(testIdPrefixSel('leaderboard-row-'));
    const rowCount = await rowLocators.count();
    
    let p1Score = -1;
    let p2Score = -1;

    for (let i = 0; i < rowCount; i++) {
      const rowText = await rowLocators.nth(i).innerText();
      // Row text usually contains name and score, like "P1-Early\n150"
      if (rowText.includes('EarlyPlayer')) {
        const match = rowText.match(/\d+/g);
        if (match) p1Score = parseInt(match[match.length - 1], 10);
      }
      if (rowText.includes('LatePlayer')) {
        const match = rowText.match(/\d+/g);
        if (match) p2Score = parseInt(match[match.length - 1], 10);
      }
    }

    console.log(`P1 Score: ${p1Score}`);
    console.log(`P2 Score: ${p2Score}`);

    if (p1Score <= 0) {
      throw new Error(`Expected EarlyPlayer to have >0 score, got ${p1Score}`);
    }
    
    // Check if P2 score is 0. If P2 is not found or has 0, it's correct.
    if (p2Score > 0) {
      throw new Error(`Expected LatePlayer to have 0 score because of late submission, got ${p2Score}`);
    }

    console.log('Answer deadline test passed: P1 scored, P2 was rejected.');

  } finally {
    await managerStagehand.close();
    await p1Stagehand.close();
    await p2Stagehand.close();
  }
}

runAnswerDeadlineTest().then(
  () => process.exit(0),
  (err) => {
    console.error('Answer deadline test failed:', err);
    process.exit(1);
  },
);
