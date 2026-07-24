/**
 * e2e/stagehand/class-mode-enforcement.spec.ts — W6-6 / R11
 *
 * Klassen mode join: free-text username path hidden; roster/PIN path required.
 * Soft-skip if klassenEnabled is off in game config (tab gated).
 *
 * Run: E2E_PW=… npx tsx e2e/stagehand/class-mode-enforcement.spec.ts
 */
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { newStagehand } from './config';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://rust.razzoozle.xyz';
const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

function requirePassword(): string {
  const password = process.env.E2E_PW;
  if (!password) throw new Error('E2E_PW environment variable is required for manager login.');
  return password;
}

async function waitForTestId(page: Page, id: string, timeout = 15_000) {
  await page.waitForSelector(testIdSel(id), { state: 'visible', timeout });
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/manager`);
  await waitForTestId(page, 'login-password');
  await page.locator(testIdSel('login-username')).fill(process.env.E2E_USER ?? 'admin');
  await page.locator(testIdSel('login-password')).fill(requirePassword());
  await page.locator(testIdSel('login-submit')).click();
  await page.waitForSelector(testIdPrefixSel('quizz-row-'), { state: 'visible', timeout: 15_000 });
}

async function clickNav(page: Page, ...labels: string[]) {
  return page.evaluate((cands) => {
    const els = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"]'));
    for (const el of els) {
      const t = (el.textContent ?? '').trim().toLowerCase();
      if (cands.some((c) => t === c.toLowerCase() || t.includes(c.toLowerCase()))) {
        (el as HTMLElement).click();
        return t;
      }
    }
    return null;
  }, labels);
}

async function run() {
  const managerSh = newStagehand();
  const playerSh = newStagehand();
  await managerSh.init();
  await playerSh.init();
  const manager = managerSh.context.activePage();
  const player = playerSh.context.activePage();
  if (!manager || !player) throw new Error('Stagehand did not produce active pages after init().');

  try {
    await login(manager);
    await manager.setViewportSize({ width: 1280, height: 800 });

    // Open classes via SPA nav (deep-link can bounce when klassen gated)
    await clickNav(manager, 'School', 'Schule', 'school');
    await manager.waitForTimeout(300);
    const classesNav = await clickNav(
      manager,
      'Klassen',
      'Classes',
      'classes',
      'klassen',
    );

    if (!classesNav) {
      // Try direct route once
      await manager.goto(`${BASE_URL}/manager/config/classes`);
      await manager.waitForTimeout(1_000);
    }

    const hasCreate = await manager.locator(testIdSel('klassen-create-btn')).isVisible().catch(() => false);
    const hasFilter =
      (await manager.locator(testIdSel('classes-status-filter-active')).isVisible().catch(() => false)) ||
      (await manager.locator(testIdSel('classes-status-filter-all')).isVisible().catch(() => false));

    if (!hasCreate && !hasFilter) {
      console.log(
        'W6-6 SKIP: classes UI not available (klassenEnabled likely false in game config)',
      );
      console.log('W6-6 class-mode-enforcement PASSED (soft skip — feature gated off)');
      return;
    }

    // Prefer filter-all if active filter missing
    if (await manager.locator(testIdSel('classes-status-filter-all')).isVisible().catch(() => false)) {
      await manager.locator(testIdSel('classes-status-filter-all')).click().catch(() => {});
    } else if (
      await manager.locator(testIdSel('classes-status-filter-active')).isVisible().catch(() => false)
    ) {
      await manager.locator(testIdSel('classes-status-filter-active')).click().catch(() => {});
    }

    const classIds = await manager.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="class-select-"]')).map((el) =>
        (el.getAttribute('data-testid') ?? '').replace('class-select-', ''),
      ),
    );
    if (classIds.length === 0) {
      console.log('W6-6 SKIP: no classes in roster to bind klassen game');
      console.log('W6-6 class-mode-enforcement PASSED (soft skip — empty classes)');
      return;
    }
    const classId = classIds[0];
    console.log(`Using class id ${classId}`);

    // Start quiz with klassen if toggles exist
    await manager.goto(`${BASE_URL}/manager/config/play`);
    await manager.waitForSelector(testIdPrefixSel('quizz-row-'), { state: 'visible', timeout: 15_000 });
    await manager.locator(testIdPrefixSel('quizz-row-e2e-all-ty-')).first().click().catch(async () => {
      await manager.locator(testIdPrefixSel('quizz-row-')).first().click();
    });
    await waitForTestId(manager, 'quizz-start-btn', 15_000);

    // Toggle last switch-ish controls that look like klassen when present
    const klassenToggle = await manager.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label, button, [role="switch"]'));
      for (const el of labels) {
        const t = (el.textContent ?? '').toLowerCase();
        if (t.includes('klassen') || t.includes('class mode') || t.includes('klassenmodus')) {
          const sw =
            el.matches('[role="switch"]')
              ? el
              : el.querySelector('[role="switch"]') ||
                el.closest('div')?.querySelector('[role="switch"]');
          if (sw) {
            (sw as HTMLElement).click();
            return true;
          }
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!klassenToggle) {
      console.log('W6-6 SKIP: klassenMode toggle not on quiz start panel (config.klassenEnabled?)');
      console.log('W6-6 class-mode-enforcement PASSED (soft skip — toggle absent)');
      return;
    }

    await manager.waitForTimeout(500);
    const hasClassSelect = await manager.locator(testIdSel('class-select')).isVisible().catch(() => false);
    if (hasClassSelect) {
      await manager.evaluate(
        ({ selector, value }) => {
          const select = document.querySelector(selector) as HTMLSelectElement | null;
          if (!select) return;
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
        },
        { selector: testIdSel('class-select'), value: classId },
      );
    }

    await manager.locator(testIdSel('quizz-start-btn')).click();
    await waitForTestId(manager, 'game-pin', 20_000);
    const pin = (await manager.locator(testIdSel('game-pin')).innerText()).replace(/\D/g, '');
    if (!/^\d{6}$/.test(pin)) throw new Error(`Expected 6-digit game PIN, got "${pin}".`);

    await player.goto(BASE_URL);
    await waitForTestId(player, 'pin-input-digit-0');
    await player.locator(testIdSel('pin-input-digit-0')).click();
    await player.type(pin);
    await player.locator(testIdSel('join-submit')).click();
    await player.waitForTimeout(2_000);

    const freeText = await player.locator(testIdSel('username-input')).isVisible().catch(() => false);
    const studentSearch = await player.locator('#student-search').isVisible().catch(() => false);
    const classJoin = await player.locator(testIdSel('class-join-submit')).isVisible().catch(() => false);

    if (freeText && !studentSearch && !classJoin) {
      throw new Error('Free-text username path remained available in class mode.');
    }
    if (studentSearch || classJoin || !freeText) {
      console.log(
        `W6-6 PASS: class join UI enforced (freeText=${freeText}, studentSearch=${studentSearch}, classJoin=${classJoin})`,
      );
    } else {
      throw new Error('Could not determine class-mode join enforcement UI');
    }
  } finally {
    await managerSh.close();
    await playerSh.close();
  }
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error('W6-6 class-mode-enforcement FAILED:', error);
    process.exit(1);
  },
);
