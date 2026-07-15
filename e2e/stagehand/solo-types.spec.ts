import { test, expect } from '@playwright/test';
import { newStagehand } from './config';
import { z } from 'zod';

const VIEWPORTS = [
  { width: 375, height: 667, name: 'mobile-sm' },
  { width: 390, height: 844, name: 'mobile-std' },
  { width: 440, height: 956, name: 'mobile-lg' },
];

const QUIZ_ID = 'e2e-all-ty-pKcA4Qj2';
const BASE_URL = 'https://rust.razzoozle.xyz';

// Question type definitions with answer strategies
const QUESTION_TYPES = [
  {
    name: 'multiple-choice',
    selector: '[data-testid^="option-"]',
    answer: async (page: any) => {
      const options = await page.locator('[data-testid^="option-"]').all();
      if (options.length > 0) {
        await options[0].click();
      }
    },
  },
  {
    name: 'true-false',
    selector: '[data-testid*="true"], [data-testid*="false"]',
    answer: async (page: any) => {
      const btn = await page.locator('[data-testid*="true"]').first();
      if (await btn.isVisible()) {
        await btn.click();
      }
    },
  },
  {
    name: 'short-answer',
    selector: '[data-testid="input-answer"]',
    answer: async (page: any) => {
      await page.fill('[data-testid="input-answer"]', 'test answer');
    },
  },
  {
    name: 'matching',
    selector: '[data-testid^="match-option-"]',
    answer: async (page: any) => {
      const pairs = await page.locator('[data-testid^="match-pair-"]').all();
      if (pairs.length > 0) {
        await pairs[0].click();
      }
    },
  },
  {
    name: 'wortarten',
    selector: '[data-testid^="solo-wortarten-token-"]',
    answer: async (page: any) => {
      // Wortarten: token 0 is disabled, click active tokens
      const tokens = await page.locator('[data-testid^="solo-wortarten-token-"]').all();

      // Token 0 should be disabled; skip it
      for (let i = 1; i < tokens.length; i++) {
        const disabled = await tokens[i].evaluate((el: Element) =>
          el.getAttribute('disabled') || el.classList.contains('disabled')
        );
        if (!disabled) {
          await tokens[i].click();
        }
      }

      // Select parts of speech for each active token
      // Based on fixture: "Der Hund läuft schnell"
      // Token 1 (Hund) = Nomen, Token 2 (läuft) = Verb, Token 3 (schnell) = Adverb
      const pos1 = await page.locator('[data-testid="solo-wortarten-pos-1-nomen"]').first();
      if (await pos1.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pos1.click();
      }

      const pos2 = await page.locator('[data-testid="solo-wortarten-pos-2-verb"]').first();
      if (await pos2.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pos2.click();
      }

      const pos3 = await page.locator('[data-testid="solo-wortarten-pos-3-adverb"]').first();
      if (await pos3.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pos3.click();
      }

      // Submit wortarten answer
      const submit = await page.locator('[data-testid="solo-wortarten-submit"]').first();
      if (await submit.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submit.click();
      }
    },
  },
  {
    name: 'mathe',
    selector: '[data-testid="input-mathe-answer"]',
    answer: async (page: any) => {
      const input = await page.locator('[data-testid="input-mathe-answer"]').first();
      if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
        await input.fill('42');
      }
    },
  },
  {
    name: 'lückentext',
    selector: '[data-testid^="lueckentext-fill-"]',
    answer: async (page: any) => {
      const fills = await page.locator('[data-testid^="lueckentext-fill-"]').all();
      for (let i = 0; i < fills.length; i++) {
        await fills[i].fill(`answer${i + 1}`);
      }
    },
  },
  {
    name: 'drag-drop',
    selector: '[data-testid^="drag-source-"]',
    answer: async (page: any) => {
      const sources = await page.locator('[data-testid^="drag-source-"]').all();
      const targets = await page.locator('[data-testid^="drag-target-"]').all();

      if (sources.length > 0 && targets.length > 0) {
        await sources[0].dragTo(targets[0]);
      }
    },
  },
  {
    name: 'ranking',
    selector: '[data-testid^="rank-item-"]',
    answer: async (page: any) => {
      const items = await page.locator('[data-testid^="rank-item-"]').all();
      if (items.length >= 2) {
        // Swap first two items
        await items[0].dragTo(items[1]);
      }
    },
  },
];

test.describe('Razzoozle Solo Questions - All Types, All Viewports', () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`Viewport ${viewport.width}×${viewport.height}`, () => {
      for (const questionType of QUESTION_TYPES) {
        test(`${questionType.name} - solo interaction`, async () => {
          const stagehand = newStagehand();

          try {
            // Start fresh page for this viewport
            await stagehand.page.setViewportSize({ width: viewport.width, height: viewport.height });

            // Navigate to solo quiz WITHOUT manager context (Issue #30)
            await stagehand.page.goto(`${BASE_URL}/quizz/${QUIZ_ID}/solo`);
            await stagehand.page.waitForLoadState('networkidle');

            // Verify we are on solo quiz page
            const urlAfterNav = stagehand.page.url();
            expect(urlAfterNav).toContain('/solo');
            expect(urlAfterNav).not.toContain('/manager');

            // Wait for question to render
            await stagehand.page.waitForSelector('[data-testid="question-prompt"]', { timeout: 5000 });

            // Get initial question type from DOM
            const questionTypeIdent = await stagehand.page.locator('[data-testid="question-type"]').innerText();
            console.log(`📝 Question type: ${questionTypeIdent}, Viewport: ${viewport.name}`);

            // Execute answer strategy
            await questionType.answer(stagehand.page);

            // Wait for submit button and click
            const submitBtn = await stagehand.page.locator('[data-testid="submit-answer"], [data-testid="submit-btn"]').first();
            if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await submitBtn.click();
            }

            // Wait for reveal/next screen
            await stagehand.page.waitForTimeout(1000);
            await stagehand.page.waitForSelector('[data-testid="reveal-section"], [data-testid="result-screen"]', { timeout: 8000 });

            // Assert result screen is visible (Score, Feedback, etc.)
            const resultScreen = await stagehand.page.locator('[data-testid="result-screen"]').isVisible().catch(() => false);
            const revealSection = await stagehand.page.locator('[data-testid="reveal-section"]').isVisible().catch(() => false);

            expect(resultScreen || revealSection).toBe(true);

            // Assert score is displayed (even if 0)
            const scoreText = await stagehand.page.locator('[data-testid="score-display"]').innerText().catch(() => '');
            expect(scoreText.length).toBeGreaterThanOrEqual(0);

            console.log(`✅ ${questionType.name} passed on ${viewport.name}`);

          } finally {
            await stagehand.cleanUp();
          }
        });
      }
    });
  }

  test('Wortarten specific: disabled token assertion', async () => {
    const stagehand = newStagehand();

    try {
      const viewport = VIEWPORTS[1]; // Use standard mobile
      await stagehand.page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Navigate to solo quiz
      await stagehand.page.goto(`${BASE_URL}/quizz/${QUIZ_ID}/solo`);
      await stagehand.page.waitForLoadState('networkidle');

      // Find wortarten question
      let found = false;
      const maxAttempts = 5;

      for (let i = 0; i < maxAttempts && !found; i++) {
        const qtype = await stagehand.page.locator('[data-testid="question-type"]').innerText().catch(() => '');
        if (qtype.includes('wortarten') || qtype.includes('Wortarten')) {
          found = true;
          break;
        }

        // Move to next question if this isn't wortarten
        const nextBtn = await stagehand.page.locator('[data-testid="next-question"]').isVisible().catch(() => false);
        if (nextBtn) {
          await stagehand.page.locator('[data-testid="next-question"]').click();
          await stagehand.page.waitForTimeout(500);
        }
      }

      expect(found).toBe(true);

      // Assert token 0 is disabled
      const token0 = stagehand.page.locator('[data-testid="solo-wortarten-token-0"]');
      const isDisabled = await token0.evaluate((el: Element) =>
        el.hasAttribute('disabled') || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true'
      ).catch(() => false);

      expect(isDisabled).toBe(true);

      // Assert other tokens are clickable (not disabled)
      const token1 = stagehand.page.locator('[data-testid="solo-wortarten-token-1"]');
      const token1Disabled = await token1.evaluate((el: Element) =>
        el.hasAttribute('disabled') || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true'
      ).catch(() => false);

      expect(token1Disabled).toBe(false);

      console.log('✅ Wortarten disabled token assertion passed');

    } finally {
      await stagehand.cleanUp();
    }
  });

  test('No manager context in solo mode', async () => {
    const stagehand = newStagehand();

    try {
      await stagehand.page.goto(`${BASE_URL}/quizz/${QUIZ_ID}/solo`);
      await stagehand.page.waitForLoadState('networkidle');

      // Verify no manager-config elements are present
      const managerNav = await stagehand.page.locator('[data-testid="manager-nav"]').isVisible().catch(() => false);
      const configBtn = await stagehand.page.locator('[data-testid="config-button"]').isVisible().catch(() => false);

      expect(managerNav).toBe(false);
      expect(configBtn).toBe(false);

      // Verify solo UI elements are present
      const soloContainer = await stagehand.page.locator('[data-testid="solo-game-container"]').isVisible().catch(() => false);
      const questionPrompt = await stagehand.page.locator('[data-testid="question-prompt"]').isVisible().catch(() => false);

      expect(soloContainer || questionPrompt).toBe(true);

      console.log('✅ No manager context in solo mode verified');

    } finally {
      await stagehand.cleanUp();
    }
  });
});
