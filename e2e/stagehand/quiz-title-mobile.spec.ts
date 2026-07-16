/**
 * e2e/stagehand/quiz-title-mobile.spec.ts — Quiz title visibility on mobile (375px).
 *
 * Run directly: `npx tsx e2e/stagehand/quiz-title-mobile.spec.ts`
 * 
 * Validates D13 mobile pattern: quiz title remains visible at 375px viewport,
 * action overflow menu appears, and menu items are accessible.
 */
import { z } from 'zod';
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = 'https://rust.razzoozle.xyz';

// E2E_PW has no fallback — a missing env var must fail loudly at login time,
// not silently attempt a bogus 'notset' credential.
function requireE2EPassword(): string {
  const pw = process.env.E2E_PW;
  if (!pw) {
    throw new Error('E2E_PW environment variable is required for manager login.');
  }
  return pw;
}

// E2E_USER is not a secret (it's the login name, e.g. "admin" from
// BOOTSTRAP_ADMIN_USER) so a default is safe here, unlike the password above.
function e2eUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

// ── Stagehand Page/Locator helpers ──────────────────────────────────────────
const testIdSel = (id: string) => `[data-testid="${id}"]`;

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

async function waitForSelector(
  page: Page,
  selector: string,
  opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number },
) {
  await page.waitForSelector(selector, {
    state: opts?.state ?? 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

async function runQuizTitleMobileTest() {
  const stagehand = newStagehand();
  try {
    const page = stagehand.context.activePage();
    const password = requireE2EPassword();

    // ============ LOGIN TO MANAGER ============
    await page.goto(`${BASE_URL}/manager`);
    await waitForTestId(page, 'login-password');
    await page.locator(testIdSel('login-username')).fill(e2eUsername());
    await page.locator(testIdSel('login-password')).fill(password);
    await page.locator(testIdSel('login-submit')).click();

    // Post-condition: quiz list renders after auth succeeds
    // (look for any quiz row — testid is dynamic quizz-row-${id})
    await page.waitForSelector('[data-testid^="quizz-row-"]', {
      state: 'visible',
      timeout: 15_000,
    });

    // ============ SET MOBILE VIEWPORT (375px) ============
    // Stagehand v3 uses setViewportSize on the Page directly
    await page.setViewportSize({ width: 375, height: 812 });

    // Small delay to allow re-render at new viewport
    await page.waitForTimeout(500);

    // ============ VALIDATE QUIZ TITLE VISIBLE ON MOBILE ============
    // Find the first quiz row container (any element with data-testid="quizz-row-*")
    const firstQuizRow = page.locator('[data-testid^="quizz-row-"]').first();
    
    // Title is rendered inside ListRow as a <span> with truncate class
    // and the text content is q.subject
    const titleElement = firstQuizRow.locator('span.truncate').first();

    // Wait for the title to be visible
    await titleElement.isVisible();
    
    // Verify bounding box exists and width > 0
    const boundingBox = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
      };
    }, 'span.truncate');

    if (!boundingBox) {
      throw new Error('Quiz title element not found in DOM');
    }

    if (boundingBox.width <= 0) {
      throw new Error(`Quiz title width is ${boundingBox.width}px (expected > 0)`);
    }

    const titleText = await titleElement.innerText();
    if (!titleText || titleText.trim().length === 0) {
      throw new Error('Quiz title text is empty or whitespace');
    }

    console.log(`✓ Quiz title visible: "${titleText}" (${Math.round(boundingBox.width)}px wide)`);

    // ============ VALIDATE OVERFLOW MENU ON MOBILE ============
    // Find the overflow menu button (aria-haspopup="menu" within the same row)
    const overflowButton = firstQuizRow.locator('button[aria-haspopup="menu"]');
    const isOverflowVisible = await overflowButton.isVisible();

    if (!isOverflowVisible) {
      throw new Error('Overflow menu button (aria-haspopup="menu") not visible on mobile');
    }

    console.log('✓ Overflow menu button visible');

    // Click the overflow button to open the menu
    await overflowButton.click();

    // Verify the menu (role="menu") appears
    await waitForSelector(page, '[role="menu"]', { state: 'visible', timeout: 5_000 });
    console.log('✓ Menu opened (role="menu" visible)');

    // Verify at least one menu item exists (look for role="menuitem")
    const menuItems = page.locator('[role="menuitem"]');
    const menuItemCount = await menuItems.count();

    if (menuItemCount === 0) {
      throw new Error('No menu items (role="menuitem") found in overflow menu');
    }

    console.log(`✓ Menu has ${menuItemCount} items`);

    // Verify specific action is accessible (e.g., "edit" action)
    const editItem = page.locator(testIdSel('edit'));
    const editVisible = await editItem.isVisible().catch(() => false);
    if (!editVisible) {
      throw new Error('Edit action not found in overflow menu (data-testid="edit")');
    }

    console.log('✓ Edit action accessible in menu');

    console.log('\n✅ Quiz title mobile test passed: title visible at 375px, menu functional');
  } finally {
    await stagehand.close();
  }
}

runQuizTitleMobileTest().then(
  () => process.exit(0),
  (err) => {
    console.error('Quiz title mobile test failed:', err);
    process.exit(1);
  },
);
