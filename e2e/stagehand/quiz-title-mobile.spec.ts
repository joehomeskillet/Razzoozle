/**
 * e2e/stagehand/quiz-title-mobile.spec.ts — Quiz title + overflow menu at 375px (D13, F3).
 *
 * Run directly: `npx tsx e2e/stagehand/quiz-title-mobile.spec.ts` (per
 * stagehand/README.md — plain script, not a Playwright Test / Jest suite; the
 * installed @browserbasehq/stagehand v3 SDK exposes its own CDP-based
 * Page/Locator, not Playwright's, and `@playwright/test` is not a dependency
 * of e2e/).
 *
 * Validates design.md's D13 mobile list-action pattern for the quiz
 * management list (QuizzList.tsx, under the "Quiz" nav tab — NOT the "Play"
 * landing tab's quiz picker, which carries no overflow menu at all): at
 * <600px each row's title stays laid out (non-zero width) and secondary
 * actions collapse into an overflow trigger (aria-haspopup="menu" ->
 * role="menu" containing >=1 role="menuitem").
 */
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
// stagehand.page does not exist on v3 — the active page is
// stagehand.context.activePage(). Its Locator has no getByTestId/getByRole/
// filter/or/waitFor/evaluate/locator(); only click/fill/type/isVisible/
// innerText/first/nth/count on a raw (possibly compound) CSS selector.
const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

async function waitForTestId(page: Page, id: string, timeoutMs = 15_000) {
  await page.waitForSelector(testIdSel(id), { state: 'visible', timeout: timeoutMs });
}

async function waitForTestIdPrefix(page: Page, prefix: string, timeoutMs = 15_000) {
  await page.waitForSelector(testIdPrefixSel(prefix), { state: 'visible', timeout: timeoutMs });
}

/** Click the first <button> anywhere on the page whose visible text matches
    one of the given candidates exactly (locale-tolerant — copied verbatim
    from mp-loop.spec.ts's clickButtonByText: live headless Chrome resolves
    "en-US" via LanguageDetector regardless of the app's de-first default, so
    tab/button text asserted here must not assume German). */
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
  throw new Error(`No <button> found with text among: ${textCandidates.join(', ')}`);
}

async function runQuizTitleMobileTest() {
  const password = requireE2EPassword();

  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) {
    throw new Error('Stagehand did not produce an active page after init()');
  }

  try {
    // ============ MOBILE VIEWPORT (375px, D13 breakpoint) — set before nav so
    // isMobile state (window.innerWidth < 600) is correct on first mount ============
    await page.setViewportSize(375, 667);

    // ============ MANAGER: LOGIN ============
    await page.goto(`${BASE_URL}/manager`);
    await waitForTestId(page, 'login-password');
    await page.locator(testIdSel('login-username')).fill(e2eUsername());
    await page.locator(testIdSel('login-password')).fill(password);
    await page.locator(testIdSel('login-submit')).click();
    // Post-condition: the "Play" landing tab (quiz picker) only renders once
    // auth succeeds. Testid is dynamic (`quizz-row-${id}`), wait on the prefix.
    await waitForTestIdPrefix(page, 'quizz-row-');

    // ============ NAVIGATE: open the D12 mobile Drawer, select "Quiz" tab ============
    // Below the 920px rail breakpoint (design.md), nav lives in a hamburger
    // Drawer (ConsoleShell.tsx) — the "Quiz" tab (QuizzList.tsx) is the D13
    // row-with-overflow-menu view; "Play" (default landing) has no overflow
    // menu at all, so this navigation step is required, not optional.
    const openNavSel = 'button[aria-label="Open navigation"], button[aria-label="Navigation öffnen"]';
    await page.waitForSelector(openNavSel, { state: 'visible', timeout: 10_000 });
    await page.locator(openNavSel).first().click();
    await clickButtonByText(page, 'Quiz');

    // ============ FIRST QUIZ ROW: title stays laid out at 375px (D13) ============
    // ListRow renders the title as a `span.truncate.font-semibold` — no row
    // testid exists on this tab, so scope by class + document order (first
    // match = first row) instead of Locator.locator() chaining, which this
    // SDK's Locator class does not support.
    const titleSelector = 'span.truncate.font-semibold';
    await page.waitForSelector(titleSelector, { state: 'visible', timeout: 15_000 });

    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }, titleSelector);

    if (!box) {
      throw new Error('Quiz title element not found in DOM (first row, "Quiz" tab)');
    }
    if (box.width <= 0) {
      throw new Error(`Quiz title width is ${box.width}px (expected > 0) — title collapsed at 375px`);
    }
    console.log(`Quiz title visible + laid out at 375px (${Math.round(box.width)}px wide).`);

    // ============ OVERFLOW MENU: aria-haspopup -> role=menu -> role=menuitem ============
    const overflowSelector = 'button[aria-haspopup="menu"]';
    const overflowVisible = await page.locator(overflowSelector).first().isVisible();
    if (!overflowVisible) {
      throw new Error('Overflow trigger (aria-haspopup="menu") not visible at 375px — D13 collapse did not happen');
    }
    await page.locator(overflowSelector).first().click();

    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 5_000 });
    const menuItemCount = await page.locator('[role="menuitem"]').count();
    if (menuItemCount === 0) {
      throw new Error('Overflow menu opened but has 0 role="menuitem" entries');
    }

    console.log(
      `Quiz title mobile test passed: title visible + laid out, overflow menu has ${menuItemCount} item(s).`,
    );
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
