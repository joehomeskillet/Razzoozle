/**
 * e2e/stagehand/manager-media-tab.spec.ts — Manager Media tab usage assertions.
 *
 * Tests:
 * 1. Usage badges on used media (image001-1-22340b26.webp, gen-GTgo3FZ4.webp)
 * 2. Info dialog with usage details
 * 3. Delete warning for used media
 * 4. B1 regression: no dialog stacking on delete
 *
 * Run directly: `npx tsx e2e/stagehand/manager-media-tab.spec.ts`
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = 'https://rust.razzoozle.xyz';

function requireAdminPassword(): string {
  let pw = process.env.RAZZOOZLE_ADMIN_PW || process.env.E2E_PW;
  if (pw) {
    return pw;
  }
  throw new Error(
    'Admin password required. Set RAZZOOZLE_ADMIN_PW or E2E_PW environment variable.',
  );
}

function getUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

const testIdSel = (id: string) => `[data-testid="${id}"]`;

async function waitForTestId(page: Page, id: string, timeoutMs = 15_000) {
  await page.waitForSelector(testIdSel(id), { state: 'visible', timeout: timeoutMs });
}

async function findMediaCardByFilename(page: Page, filename: string): Promise<{ article: any; index: number }> {
  const cards = await page.$$('article[role="option"]');
  for (let i = 0; i < cards.length; i++) {
    const text = await cards[i].innerText?.catch(() => '');
    if (text?.includes(filename)) {
      return { article: cards[i], index: i };
    }
  }
  throw new Error(`Media card for "${filename}" not found`);
}

async function assertUsageBadges(page: Page): Promise<void> {
  console.log('[TEST] Asserting usage badges...');

  // Used media should have "1×" badge
  const usedMedia = ['image001-1-22340b26.webp', 'gen-GTgo3FZ4.webp'];
  for (const filename of usedMedia) {
    const { article } = await findMediaCardByFilename(page, filename);
    const badge = await article.querySelector?.('div[title] div');
    if (!badge) {
      throw new Error(`No badge found for used media "${filename}"`);
    }
    const badgeText = await badge.textContent?.catch(() => '');
    if (!badgeText?.includes('1×')) {
      throw new Error(`Badge text for "${filename}" is "${badgeText}", expected "1×"`);
    }
  }

  // Unused media should NOT have badge (e.g., boump-*.wav)
  const unusedCards = await page.$$('article[role="option"]');
  for (const card of unusedCards) {
    const text = await card.innerText?.catch(() => '');
    if (text?.includes('boump') || text?.includes('.wav')) {
      const badge = await card.querySelector?.('div[title]');
      if (badge) {
        throw new Error(`Unused media "${text}" should not have a badge`);
      }
    }
  }

  console.log('  ✓ Usage badges correct (used media: 1×, unused: no badge)');
}

async function assertInfoDialogUsage(page: Page): Promise<void> {
  console.log('[TEST] Asserting info dialog usage section...');

  // Test used media: image001-1-22340b26.webp
  const { article: usedCard } = await findMediaCardByFilename(page, 'image001-1-22340b26.webp');
  const infoButton = await usedCard.querySelector?.('button[aria-label*="Details" i]');
  if (!infoButton) {
    throw new Error('Info button not found on used media card');
  }
  await infoButton.click?.();
  await page.waitForTimeout(300);

  // Check for usage section with quiz name
  const usageHeading = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('label, h3, h4'));
    return headings.find(el => el.textContent?.includes('Used in') || el.textContent?.includes('Verwendet in'));
  });
  if (!usageHeading) {
    throw new Error('Usage section heading not found in dialog');
  }

  // Check for quiz title
  const quizText = await page.evaluate(() => {
    const content = document.body.innerText;
    return content.includes('E2E All Types');
  });
  if (!quizText) {
    throw new Error('Quiz title "E2E All Types" not found in usage section');
  }

  // Close dialog
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(300);

  // Test unused media (boump file if available)
  const unusedCards = await page.$$('article[role="option"]');
  for (const card of unusedCards) {
    const text = await card.innerText?.catch(() => '');
    if (text?.includes('boump')) {
      const infoBtn = await card.querySelector?.('button[aria-label*="Details" i]');
      if (infoBtn) {
        await infoBtn.click?.();
        await page.waitForTimeout(300);

        const emptyText = await page.evaluate(() => {
          const content = document.body.innerText;
          return content.includes('keinem Quiz') || content.includes('no quiz') || content.includes('Not used');
        });
        if (!emptyText) {
          throw new Error('Empty state text not found for unused media');
        }

        await page.keyboard.press('Escape').catch(() => undefined);
        await page.waitForTimeout(300);
      }
    }
  }

  console.log('  ✓ Info dialog usage section correct');
}

async function assertDeleteWarning(page: Page): Promise<void> {
  console.log('[TEST] Asserting delete warning...');

  const { article: usedCard } = await findMediaCardByFilename(page, 'image001-1-22340b26.webp');
  const deleteButton = await usedCard.querySelector?.('button[aria-label*="delete" i]');
  if (!deleteButton) {
    throw new Error('Delete button not found');
  }

  await deleteButton.click?.();
  await page.waitForTimeout(500);

  // Check for warning text in confirm dialog
  const warningText = await page.evaluate(() => {
    const content = document.body.innerText;
    return content.includes('Löschen entfernt es dort nicht') || content.includes('will not remove it there');
  });
  if (!warningText) {
    throw new Error('Delete warning text not found in confirm dialog');
  }

  // Cancel the dialog
  const cancelButton = await page.$('button:has-text("Cancel"), button:has-text("Abbrechen")');
  if (cancelButton) {
    await cancelButton.click?.();
  } else {
    await page.keyboard.press('Escape').catch(() => undefined);
  }
  await page.waitForTimeout(300);

  // Verify no info dialog appeared (B1 regression test)
  const isDialogOpen = await page.evaluate(() => {
    return document.querySelector('[role="dialog"]') !== null;
  });
  if (isDialogOpen) {
    throw new Error('B1 regression: Info dialog unexpectedly opened after delete cancel');
  }

  console.log('  ✓ Delete warning present');
  console.log('  ✓ B1 regression test passed (no dialog stacking)');
}

async function runMediaUsageTest() {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) {
    throw new Error('Stagehand did not produce an active page after init()');
  }

  try {
    await page.setViewportSize(1280, 900);
    await page.goto(`${BASE_URL}/manager`);

    console.log('[TEST] Waiting for login form...');
    await waitForTestId(page, 'login-password');

    console.log('[TEST] Filling login credentials...');
    const username = getUsername();
    const password = requireAdminPassword();
    await page.locator(testIdSel('login-username')).fill(username);
    await page.locator(testIdSel('login-password')).fill(password);
    await page.locator(testIdSel('login-submit')).click();

    console.log('[TEST] Waiting for manager to load...');
    await page.waitForSelector('button[role="tab"]', { state: 'visible', timeout: 20_000 });

    console.log('[TEST] Navigating to /manager/config...');
    await page.goto(`${BASE_URL}/manager/config`);
    await page.waitForTimeout(500);

    console.log('[TEST] Clicking Media tab...');
    const tabs = page.locator('button[role="tab"]');
    const n = await tabs.count();
    let mediaTabFound = false;
    for (let i = 0; i < n; i++) {
      const tab = tabs.nth(i);
      const text = await tab.innerText().catch(() => '');
      if (text.trim() === 'Media' || text.trim() === 'Medien') {
        await tab.click();
        mediaTabFound = true;
        break;
      }
    }
    if (!mediaTabFound) {
      throw new Error('Media tab not found in nav tabs');
    }

    await page.waitForTimeout(500);

    // Run all usage assertions
    await assertUsageBadges(page);
    await assertInfoDialogUsage(page);
    await assertDeleteWarning(page);

    console.log('============================================================');
    console.log('MANAGER MEDIA USAGE ASSERTIONS: PASS');
    console.log('============================================================');
    console.log('✓ Usage badges render correctly');
    console.log('✓ Info dialog shows usage details');
    console.log('✓ Delete warning displays');
    console.log('✓ B1 regression: no dialog stacking');
    console.log('============================================================');
  } finally {
    await stagehand.close();
    process.exit(0);
  }
}

runMediaUsageTest().then(
  () => undefined,
  (err) => {
    console.error('Media usage test error:', err);
    process.exit(1);
  },
);
