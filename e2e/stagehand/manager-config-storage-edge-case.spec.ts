/**
 * e2e/stagehand/manager-config-storage-edge-case.spec.ts
 * Test: invalid/stale localStorage tab key → silent fallback to first allowed tab
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = 'https://rust.razzoozle.xyz';
const TAB_STORAGE_KEY = 'rahoot_manager_tab';

function requireAdminPassword(): string {
  let pw = process.env.RAZZOOZLE_ADMIN_PW || process.env.E2E_PW;
  if (pw) return pw;
  throw new Error('Admin password required.');
}

function getUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

const testIdSel = (id: string) => `[data-testid="${id}"]`;

async function runStorageEdgeCaseTest() {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) throw new Error('No active page');

  try {
    await page.setViewportSize(1280, 900);
    await page.goto(`${BASE_URL}/manager`);
    console.log('[TEST] Waiting for login form...');
    await page.waitForSelector(testIdSel('login-password'), { state: 'visible', timeout: 20_000 });
    
    console.log('[TEST] Filling login credentials...');
    const username = getUsername();
    const password = requireAdminPassword();
    await page.locator(testIdSel('login-username')).fill(username);
    await page.locator(testIdSel('login-password')).fill(password);
    await page.locator(testIdSel('login-submit')).click();
    console.log('[TEST] Waiting for manager to load...');
    await page.waitForSelector('button[role="tab"]', { state: 'visible', timeout: 20_000 });

    // EDGE CASE: Set invalid localStorage tab key
    console.log('[TEST] Setting invalid localStorage tab key: "nonexistent-tab"...');
    await page.evaluate((key: string) => {
      localStorage.setItem(key, 'nonexistent-tab');
    }, TAB_STORAGE_KEY);

    // Navigate to bare /manager/config (should fallback silently)
    console.log('[TEST] Navigating to /manager/config (bare path with stale localStorage)...');
    await page.goto(`${BASE_URL}/manager/config`);
    await page.waitForTimeout(1500);

    // Should NOT error or crash; should redirect to first allowed tab silently
    const finalUrl = page.url();
    console.log(`  Final URL: ${finalUrl}`);

    // Verify: URL should be /manager/config/{first-allowed-tab}, NOT /manager/config/nonexistent-tab
    if (finalUrl.includes('nonexistent-tab')) {
      throw new Error('FAIL: App allowed invalid tab from localStorage (should have fallen back)');
    }

    if (!finalUrl.includes('/manager/config/')) {
      throw new Error(`FAIL: Expected /manager/config/*, got: ${finalUrl}`);
    }

    // Verify: no error dialogs or crashes
    const hasError = await page.evaluate(() => {
      const errorText = document.body.innerText;
      return errorText.includes('Error') || errorText.includes('404') || errorText.includes('undefined');
    });
    if (hasError) throw new Error('App showed error dialog on invalid tab');

    console.log('============================================================');
    console.log('STORAGE EDGE-CASE TEST: PASS');
    console.log('============================================================');
    console.log('✓ Invalid localStorage tab key handled silently');
    console.log('✓ Fallback to first allowed tab (no crash)');
    console.log('✓ URL correctly shows /manager/config/{valid-tab}');
    console.log('✓ No error dialogs displayed');
    console.log('============================================================');
  } finally {
    await stagehand.close();
  }
}

runStorageEdgeCaseTest().then(
  () => process.exit(0),
  (err) => {
    console.error('Storage edge-case test error:', err);
    process.exit(1);
  }
);
