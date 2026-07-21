/**
 * e2e/stagehand/manager-deeplink.test.ts
 *
 * Hard-load deep-link regression: /manager/config/classes must stay on the
 * classes tab after a true browser navigation (page.goto), not fall back to
 * play while config (klassenEnabled) is still undefined in the manager store.
 *
 * Bug (ConsoleBody, configurations/index.tsx): before klassenEnabled is set by
 * the server CONFIG event, allowedTabs omits klassen-gated tabs and the render
 * fallback + useEffect navigate to allowedTabs[0] ("play"). This test must FAIL
 * without the hydration gate on that fallback/navigate (final URL → /play, or
 * active tab → Play while still settling).
 *
 * Run: `npx tsx e2e/stagehand/manager-deeplink.test.ts`
 * Requires: E2E_PW or RAZZOOZLE_ADMIN_PW; classes tab needs klassenEnabled on the target.
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = 'https://rust.razzoozle.xyz';

function requireAdminPassword(): string {
  const pw = process.env.RAZZOOZLE_ADMIN_PW || process.env.E2E_PW;
  if (pw) return pw;
  throw new Error('Admin password required. Set RAZZOOZLE_ADMIN_PW or E2E_PW.');
}

function getUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

const testIdSel = (id: string) => `[data-testid="${id}"]`;

async function waitForTestId(page: Page, id: string, timeoutMs = 15_000) {
  await page.waitForSelector(testIdSel(id), { state: 'visible', timeout: timeoutMs });
}

async function loginAsManager(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/manager`);
  console.log('[TEST] Waiting for login form...');
  await waitForTestId(page, 'login-password');
  const username = getUsername();
  const password = requireAdminPassword();
  await page.locator(testIdSel('login-username')).fill(username);
  await page.locator(testIdSel('login-password')).fill(password);
  await page.locator(testIdSel('login-submit')).click();
  console.log('[TEST] Waiting for manager console after login...');
  await page.waitForSelector('button[role="tab"]', { state: 'visible', timeout: 20_000 });
}

/**
 * Poll the URL from goto through ConsoleBody mount. The hydration race
 * redirects to /play on the first paint after tabs appear (useEffect → onSelect).
 * Catch that intermediate redirect — not only the final settled URL.
 */
async function assertNoPlayFallbackDuringHydration(page: Page, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let sawTabs = false;

  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes('/manager/config/play')) {
      throw new Error(
        `FAIL: deep-link redirected to play fallback (hydration race). URL: ${url}`,
      );
    }

    const tabVisible = await page
      .locator('button[role="tab"]')
      .first()
      .isVisible()
      .catch(() => false);

    if (tabVisible && !sawTabs) {
      sawTabs = true;
      console.log(`[TEST] Console tabs visible; URL at first paint: ${url}`);
      // Buggy useEffect navigates on the next tick after mount — give it a
      // few frames so a race without the gate is reproducible here.
      await page.waitForTimeout(400);
      const urlAfterMount = page.url();
      console.log(`[TEST] URL ~400ms after tabs mount: ${urlAfterMount}`);
      if (urlAfterMount.includes('/manager/config/play')) {
        throw new Error(
          `FAIL: deep-link redirected to play fallback right after ConsoleBody mount (hydration race). URL: ${urlAfterMount}`,
        );
      }
      if (!urlAfterMount.includes('/manager/config/classes')) {
        throw new Error(
          `FAIL: expected /manager/config/classes right after mount, got: ${urlAfterMount}`,
        );
      }
      return;
    }

    await page.waitForTimeout(50);
  }

  throw new Error(
    `FAIL: timed out waiting for manager console tabs after hard-load. Final URL: ${page.url()}`,
  );
}

async function runDeeplinkClassesTest() {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) throw new Error('No active page');

  try {
    await page.setViewportSize(1280, 900);

    // Auth must be established so the token is in sessionStorage; config itself
    // is in-memory only and will be undefined on the next hard load.
    await loginAsManager(page);

    // True hard page load of the deep-link (not in-app navigate / click).
    console.log('[TEST] Hard-loading /manager/config/classes via page.goto()...');
    await page.goto(`${BASE_URL}/manager/config/classes`);

    // Race window: tabs mount while klassenEnabled may still be undefined →
    // without the ConsoleBody hydration gate this redirects to play.
    await assertNoPlayFallbackDuringHydration(page);

    // Settle: full config + classes panel.
    await page.waitForTimeout(1500);

    const finalUrl = page.url();
    console.log(`  Final URL: ${finalUrl}`);

    if (finalUrl.includes('/manager/config/play')) {
      throw new Error(
        `FAIL: deep-link redirected to play fallback (hydration race). URL: ${finalUrl}`,
      );
    }
    if (!finalUrl.includes('/manager/config/classes')) {
      throw new Error(
        `FAIL: expected URL to contain /manager/config/classes, got: ${finalUrl}`,
      );
    }

    // Classes panel marker (ConfigKlassen create control) — proves the tab body rendered.
    await waitForTestId(page, 'klassen-create-btn', 15_000);

    // Active nav tab should be Classes / Klassen, not Play / Spielen.
    const activeTabText = await page.evaluate(() => {
      const selected = document.querySelector('button[role="tab"][aria-selected="true"]');
      return selected?.textContent?.trim() ?? '';
    });
    const isClassesLabel =
      activeTabText === 'Classes' ||
      activeTabText === 'Klassen' ||
      activeTabText.includes('Classes') ||
      activeTabText.includes('Klassen');
    if (!isClassesLabel) {
      throw new Error(
        `FAIL: expected active tab to be Classes/Klassen, got: "${activeTabText}"`,
      );
    }

    console.log('============================================================');
    console.log('MANAGER DEEPLINK (classes hard-load): PASS');
    console.log('============================================================');
    console.log('✓ Hard page.goto(/manager/config/classes) kept classes URL');
    console.log('✓ No play fallback at ConsoleBody mount or after settle');
    console.log('✓ Classes tab body rendered (klassen-create-btn)');
    console.log(`✓ Active nav tab: ${activeTabText}`);
    console.log('============================================================');
  } finally {
    await stagehand.close();
  }
}

runDeeplinkClassesTest().then(
  () => process.exit(0),
  (err) => {
    console.error('Manager deeplink test error:', err);
    process.exit(1);
  },
);
