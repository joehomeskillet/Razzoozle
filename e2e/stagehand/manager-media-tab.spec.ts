/**
 * e2e/stagehand/manager-media-tab.spec.ts — Manager Media tab smoke test.
 *
 * Validates Media tab renders correctly with grid visible and
 * filter row (source/visibility) controls present.
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

async function assertMediaTabVisible(page: Page): Promise<void> {
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() => localStorage.getItem('rahoot_manager_tab'));
  if (stored !== 'media') {
    throw new Error(`Expected tab 'media' but localStorage has "${stored}"`);
  }

  const gridContent = await page.locator('[role="tabpanel"]').innerText().catch(() => '');
  if (!gridContent.trim()) {
    throw new Error('Media tab panel has no visible content');
  }

  // Check for filter/control elements (source/visibility selects or inputs)
  const hasFilters = await page.evaluate(() => {
    // Look for select/combobox elements in the tab that would be filter controls
    const selects = document.querySelectorAll('[role="tabpanel"] select, [role="tabpanel"] [role="combobox"]');
    const filterInputs = document.querySelectorAll('[role="tabpanel"] input[placeholder*="filter" i], [role="tabpanel"] input[placeholder*="search" i]');
    const filterButtons = document.querySelectorAll('[role="tabpanel"] button[aria-label*="filter" i]');
    return selects.length > 0 || filterInputs.length > 0 || filterButtons.length > 0;
  });

  if (!hasFilters) {
    throw new Error('No filter controls found in Media tab');
  }

  // Check for media grid structure (could be table, grid, or list of items)
  const hasGridStructure = await page.evaluate(() => {
    const tabpanel = document.querySelector('[role="tabpanel"]');
    if (!tabpanel) return false;
    // Look for common grid/table/list structures
    return !!(
      tabpanel.querySelector('[role="grid"]') ||
      tabpanel.querySelector('table') ||
      tabpanel.querySelector('[role="row"]') ||
      tabpanel.querySelector('[class*="grid"]') ||
      tabpanel.querySelector('[class*="list"]') ||
      tabpanel.querySelector('[class*="table"]')
    );
  });

  if (!hasGridStructure) {
    throw new Error('No grid/table/list structure found in Media tab');
  }
}

async function runMediaTabTest() {
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

    console.log('[TEST] Asserting Media tab visibility...');
    await assertMediaTabVisible(page);

    console.log('============================================================');
    console.log('MANAGER MEDIA TAB SMOKE TEST: PASS');
    console.log('============================================================');
    console.log('✓ Media tab rendered');
    console.log('✓ Media grid/list structure visible');
    console.log('✓ Filter controls present');
    console.log('✓ Tab content visible');
    console.log('============================================================');

    process.exit(0);
  } finally {
    await stagehand.close();
  }
}

runMediaTabTest().then(
  () => undefined,
  (err) => {
    console.error('Media tab test error:', err);
    process.exit(1);
  },
);
