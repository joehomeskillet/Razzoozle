/**
 * e2e/stagehand/manager-deeplink.test.ts
 *
 * Hard-load deep-link regression (WP routes-B2, issue agent-claude/Razzoozle#219).
 *
 * ROOT CAUSE (now fixed): the `/manager/config` route never emitted GET_CONFIG,
 * so on a TRUE browser navigation (page.goto) the manager store's in-memory
 * `config` stayed null. The child route then ran `navigate({ to: "/manager" })`,
 * and the login page — seeing the still-valid sessionStorage token — redirected
 * to the BARE `/manager/config`, discarding the intended $tab and resolving to
 * the first allowed tab ("play" / Spielen). In-app clicks worked (config was
 * already loaded); only hard loads / deep-links broke, silently (0 console errors).
 *
 * FIX: the `/manager/config` layout now bootstraps config itself — it emits
 * GET_CONFIG (mirroring the `/manager/quizz` layout) and shows a loader until the
 * CONFIG event arrives, then renders the outlet. A deep-link therefore loads
 * config IN PLACE and keeps its tab instead of round-tripping through `/manager`.
 *
 * This spec hard-loads three deep-links against a fresh browser context with a
 * valid session (token in sessionStorage, no stored tab preference) and asserts
 * the TARGET tab renders — never the "play" fallback:
 *   1. /manager/config/quiz     (ungated → cleanest core-bug repro)
 *   2. /manager/config/classes  (klassenEnabled-gated)
 *   3. /manager/config/klassen  (old German slug → redirects to /classes)
 *
 * Run: `npx tsx e2e/stagehand/manager-deeplink.test.ts`
 * Requires: E2E_PW or RAZZOOZLE_ADMIN_PW. Cases 2 & 3 need klassenEnabled on the
 * target (classes is only an allowed tab when klassenEnabled is true).
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = 'https://rust.razzoozle.xyz';
const TAB_STORAGE_KEY = 'rahoot_manager_tab';

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

interface DeeplinkExpectation {
  /** Substring the settled URL must contain (e.g. "/manager/config/quiz"). */
  expectedUrlContains: string;
  /** Acceptable active-nav-tab labels across de/en (e.g. ["Classes", "Klassen"]). */
  activeTabLabels: string[];
  /** Optional tab-body marker proving the panel rendered (e.g. "klassen-create-btn"). */
  bodyTestId?: string;
}

/**
 * Hard-load a deep-link and assert it lands on the intended tab, never the play
 * fallback. Clears the stored tab preference first (keeping sessionStorage, i.e.
 * the auth token) so a stale localStorage tab can't mask the config-bootstrap
 * behaviour under test. Polls from goto through ConsoleBody mount so an
 * intermediate redirect to /play is caught, not only the settled URL.
 */
async function assertDeeplinkTab(
  page: Page,
  path: string,
  expect: DeeplinkExpectation,
): Promise<void> {
  await page.evaluate((key: string) => localStorage.removeItem(key), TAB_STORAGE_KEY);

  console.log(`[TEST] Hard-loading ${path} via page.goto()...`);
  await page.goto(`${BASE_URL}${path}`);

  const isPlayFallback = (url: string) => /\/manager\/config\/play\b/.test(url);

  // Poll until the console tabs mount, failing fast if the URL falls back to play.
  const deadline = Date.now() + 25_000;
  let tabsSeen = false;
  while (Date.now() < deadline) {
    if (isPlayFallback(page.url())) {
      throw new Error(`FAIL: ${path} redirected to play fallback. URL: ${page.url()}`);
    }
    const tabVisible = await page
      .locator('button[role="tab"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (tabVisible) {
      tabsSeen = true;
      break;
    }
    await page.waitForTimeout(50);
  }
  if (!tabsSeen) {
    throw new Error(`FAIL: ${path} — console tabs never mounted. URL: ${page.url()}`);
  }

  // Give any (buggy) post-mount navigate a few frames to surface before asserting.
  await page.waitForTimeout(500);
  const url = page.url();
  if (isPlayFallback(url)) {
    throw new Error(`FAIL: ${path} redirected to play after ConsoleBody mount. URL: ${url}`);
  }
  if (!url.includes(expect.expectedUrlContains)) {
    throw new Error(
      `FAIL: ${path} — expected URL to contain ${expect.expectedUrlContains}, got: ${url}`,
    );
  }

  if (expect.bodyTestId) {
    await waitForTestId(page, expect.bodyTestId, 15_000);
  }

  const activeTabText = await page.evaluate(() => {
    const selected = document.querySelector('button[role="tab"][aria-selected="true"]');
    return selected?.textContent?.trim() ?? '';
  });
  const labelOk = expect.activeTabLabels.some(
    (label) => activeTabText === label || activeTabText.includes(label),
  );
  if (!labelOk) {
    throw new Error(
      `FAIL: ${path} — expected active tab in [${expect.activeTabLabels.join(', ')}], got: "${activeTabText}"`,
    );
  }

  console.log(
    `  OK ${path}: URL=${url}, activeTab="${activeTabText}"` +
      (expect.bodyTestId ? `, body=${expect.bodyTestId}` : ''),
  );
}

async function runDeeplinkTests() {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) throw new Error('No active page');

  try {
    await page.setViewportSize(1280, 900);

    // Establish the session so the token lives in sessionStorage; `config` itself
    // is in-memory only and is null again on every subsequent hard load.
    await loginAsManager(page);

    // 1. Ungated tab — the cleanest core-bug repro (no klassenEnabled dependency).
    //    Before the fix this bounced /manager → bare /manager/config → play.
    await assertDeeplinkTab(page, '/manager/config/quiz', {
      expectedUrlContains: '/manager/config/quiz',
      activeTabLabels: ['Quiz'],
    });

    // 2. klassenEnabled-gated tab. Proves gated deep-links survive too, and that
    //    the tab body (ConfigKlassen) actually renders.
    await assertDeeplinkTab(page, '/manager/config/classes', {
      expectedUrlContains: '/manager/config/classes',
      activeTabLabels: ['Classes', 'Klassen'],
      bodyTestId: 'klassen-create-btn',
    });

    // 3. Old German slug → the oldToNewTabKeyMap redirect (klassen → classes)
    //    must still fire on a hard load and end on the classes tab, not play.
    await assertDeeplinkTab(page, '/manager/config/klassen', {
      expectedUrlContains: '/manager/config/classes',
      activeTabLabels: ['Classes', 'Klassen'],
      bodyTestId: 'klassen-create-btn',
    });

    console.log('============================================================');
    console.log('MANAGER DEEPLINK (hard-load): PASS');
    console.log('============================================================');
    console.log('✓ /manager/config/quiz    kept quiz tab (ungated core repro)');
    console.log('✓ /manager/config/classes kept classes tab + body (gated)');
    console.log('✓ /manager/config/klassen redirected to classes (alt slug)');
    console.log('✓ No play fallback at ConsoleBody mount or after settle');
    console.log('============================================================');
  } finally {
    await stagehand.close();
  }
}

runDeeplinkTests().then(
  () => process.exit(0),
  (err) => {
    console.error('Manager deeplink test error:', err);
    process.exit(1);
  },
);
