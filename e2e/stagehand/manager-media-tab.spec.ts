/**
 * e2e/stagehand/manager-media-tab.spec.ts — Manager Media tab usage assertions.
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = 'https://rust.razzoozle.xyz';

function requireAdminPassword(): string {
  let pw = process.env.RAZZOOZLE_ADMIN_PW || process.env.E2E_PW;
  if (pw) return pw;
  throw new Error('Admin password required. Set RAZZOOZLE_ADMIN_PW or E2E_PW environment variable.');
}

function getUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

const testIdSel = (id: string) => `[data-testid="${id}"]`;

async function waitForTestId(page: Page, id: string, timeoutMs = 15_000) {
  await page.waitForSelector(testIdSel(id), { state: 'visible', timeout: timeoutMs });
}

async function findMediaCardByFilename(page: Page, filename: string): Promise<number> {
  const index = await page.evaluate((fn: string) => {
    const cards = Array.from(document.querySelectorAll('article[role="option"]'));
    return cards.findIndex(card => card.innerText.includes(fn));
  }, filename);
  if (index < 0) throw new Error(`Media card for "${filename}" not found`);
  return index;
}

async function closeDialogRobust(page: Page, timeoutMs = 5000): Promise<void> {
  const startTime = Date.now();
  
  // Try clicking close button (Radix Dialog close trigger)
  const closeClicked = await page.evaluate(() => {
    const closeBtn = document.querySelector('[aria-label="Close"], [aria-label="close"]');
    if (closeBtn) {
      (closeBtn as HTMLButtonElement).click?.();
      return true;
    }
    return false;
  });
  
  // If no close button, try Escape key via Radix Dialog handler
  if (!closeClicked) {
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { 
        key: 'Escape', 
        code: 'Escape',
        bubbles: true,
        cancelable: true
      });
      document.activeElement?.dispatchEvent?.(event) || document.dispatchEvent(event);
    });
  }
  
  // Wait for dialog to close with timeout
  while (Date.now() - startTime < timeoutMs) {
    const isClosed = await page.evaluate(() => {
      return document.querySelector('[role="dialog"]') === null;
    });
    if (isClosed) return;
    await page.waitForTimeout(100);
  }
  
  throw new Error(`Info dialog failed to close after ${timeoutMs}ms`);
}

async function assertUsageBadges(page: Page): Promise<void> {
  console.log('[TEST] Asserting usage badges...');
  const usedMedia = ['image001-1-22340b26.webp', 'gen-GTgo3FZ4.webp'];
  for (const filename of usedMedia) {
    const index = await findMediaCardByFilename(page, filename);
    const hasBadge = await page.evaluate((idx: number) => {
      const card = document.querySelectorAll('article[role="option"]')[idx];
      const badge = card?.querySelector?.('div[title] span');
      return badge?.textContent?.includes('1×') ?? false;
    }, index);
    if (!hasBadge) throw new Error(`Badge "1×" not found for used media "${filename}"`);
  }

  const unusedOk = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('article[role="option"]'));
    return cards.every(card => {
      const isUnused = card.innerText.includes('boump') || card.innerText.includes('.wav');
      if (!isUnused) return true;
      return !card.querySelector?.('div[title] span');
    });
  });
  if (!unusedOk) throw new Error('Unused media should not have badge');

  console.log('  ✓ Usage badges correct (used media: 1×, unused: no badge)');
}

async function assertInfoDialogUsage(page: Page): Promise<void> {
  console.log('[TEST] Asserting info dialog usage section...');
  const index = await findMediaCardByFilename(page, 'image001-1-22340b26.webp');

  await page.evaluate((idx: number) => {
    const card = document.querySelectorAll('article[role="option"]')[idx];
    const infoBtn = card?.querySelector?.('button[aria-label*="Details" i]');
    (infoBtn as HTMLButtonElement)?.click?.();
  }, index);
  await page.waitForTimeout(300);

  const hasUsageSection = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('label, h3, h4, div'));
    return headings.some(el => 
      el.textContent?.includes('Used in') || 
      el.textContent?.includes('Verwendet in') || 
      el.textContent?.includes('E2E All Types')
    );
  });
  if (!hasUsageSection) throw new Error('Usage section or quiz title not found');

  // Robustly close the info dialog
  await closeDialogRobust(page);
  
  // Verify it's actually closed
  const stillOpen = await page.evaluate(() => {
    return document.querySelector('[role="dialog"]') !== null;
  });
  if (stillOpen) throw new Error('Info dialog failed to close after assertion');
  
  console.log('  ✓ Info dialog usage section correct');
}

async function assertDeleteWarning(page: Page): Promise<void> {
  console.log('[TEST] Asserting delete warning...');
  const index = await findMediaCardByFilename(page, 'image001-1-22340b26.webp');

  // Click delete button (language-safe selector)
  await page.evaluate((idx: number) => {
    const card = document.querySelectorAll('article[role="option"]')[idx];
    const deleteBtn = card?.querySelector?.('button[aria-label*="delete" i]') || 
                      card?.querySelector?.('button[aria-label*="löschen" i]');
    (deleteBtn as HTMLButtonElement)?.click?.();
  }, index);
  await page.waitForTimeout(500);

  const hasWarning = await page.evaluate(() => {
    return document.body.innerText.includes('Löschen entfernt es dort nicht') || 
           document.body.innerText.includes('will not remove it there');
  });
  if (!hasWarning) throw new Error('Delete warning not found');

  // Click cancel button (language-safe)
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelBtn = buttons.find(btn => 
      btn.innerText.includes('Abbrechen') || 
      btn.innerText.includes('Cancel')
    );
    if (cancelBtn) (cancelBtn as HTMLButtonElement).click?.();
  });
  
  // Wait for delete dialog exit animation
  await page.waitForTimeout(500);
  
  // Verify delete dialog is closed before checking for info dialog
  const deleteDialogClosed = await page.evaluate(() => {
    const alertDialog = document.querySelector('[role="alertdialog"]');
    return alertDialog === null;
  });
  if (!deleteDialogClosed) {
    await page.waitForTimeout(300);
  }

  // B1 regression: info dialog must NOT open after delete cancel
  const isDialogOpen = await page.evaluate(() => {
    return document.querySelector('[role="dialog"]') !== null;
  });
  if (isDialogOpen) throw new Error('B1 regression: Info dialog opened after delete cancel');

  console.log('  ✓ Delete warning present');
  console.log('  ✓ B1 regression test passed (no dialog stacking)');
}

async function runMediaUsageTest() {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) throw new Error('No active page');

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
    await page.waitForTimeout(1000);
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
    if (!mediaTabFound) throw new Error('Media tab not found');
    await page.waitForTimeout(1000);

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
  }
}

runMediaUsageTest().then(
  () => process.exit(0),
  (err) => {
    console.error('Media usage test error:', err);
    process.exit(1);
  }
);
