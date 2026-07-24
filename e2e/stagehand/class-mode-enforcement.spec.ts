/**
 * W6-6 / R11: class mode exposes roster+PIN only and rejects invalid credentials.
 *
 * Run: E2E_PW=… npx tsx e2e/stagehand/class-mode-enforcement.spec.ts
 */
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { newStagehand } from './config';

const BASE_URL = 'https://rust.razzoozle.xyz';
const CLASS_NAME = 'E2E Class W6';
const STUDENT_NAME = 'E2E Student W6';
const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

interface ClassInfo {
  id: string;
  name: string;
  studentCount: number;
}

function requirePassword(): string {
  const password = process.env.E2E_PW;
  if (!password) throw new Error('E2E_PW environment variable is required for manager login.');
  return password;
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/manager`);
  await page.waitForSelector(testIdSel('login-password'), { state: 'visible' });
  await page.locator(testIdSel('login-username')).fill(process.env.E2E_USER ?? 'admin');
  await page.locator(testIdSel('login-password')).fill(requirePassword());
  await page.locator(testIdSel('login-submit')).click();
  await page.waitForSelector(testIdPrefixSel('quizz-row-'), { state: 'visible' });
}

async function readClasses(page: Page): Promise<ClassInfo[]> {
  return page.evaluate((prefix) =>
    Array.from(document.querySelectorAll<HTMLInputElement>(`[data-testid^="${prefix}"]`)).map(
      (input) => {
        const root = input.closest<HTMLElement>('[data-state]');
        const match = root?.textContent?.match(/(\d+)\s+(?:students?|Schüler)/i);
        return {
          id: (input.dataset.testid ?? '').slice(prefix.length),
          name: (input.getAttribute('aria-label') ?? '').split(':').slice(1).join(':').trim(),
          studentCount: Number(match?.[1] ?? 0),
        };
      },
    ), 'class-select-');
}

async function ensureRosteredClass(page: Page): Promise<ClassInfo> {
  await page.goto(`${BASE_URL}/manager/config/classes`);
  await page.waitForSelector(testIdSel('klassen-create-btn'), { state: 'visible' });
  await page.locator(testIdSel('classes-status-filter-active')).click();
  let classes = await readClasses(page);
  const rostered = classes.find((entry) => entry.studentCount > 0);
  if (rostered) return rostered;

  let target = classes[0];
  if (!target) {
    await page.locator(testIdSel('klassen-create-btn')).click();
    const dialog = '[aria-labelledby="create-class-dialog-title"]';
    await page.waitForSelector(dialog, { state: 'visible' });
    await page.locator(`${dialog} input`).fill(CLASS_NAME);
    const buttons = page.locator(`${dialog} button`);
    await buttons.nth((await buttons.count()) - 1).click();
    await page.waitForTimeout(500);
    classes = await readClasses(page);
    target = classes.find((entry) => entry.name === CLASS_NAME);
  }
  if (!target) throw new Error('Could not create or resolve an active class.');

  await page.goto(`${BASE_URL}/manager/config/students`);
  await page.waitForSelector('div.sticky button', { state: 'visible' });
  const footerButtons = page.locator('div.sticky button');
  await footerButtons.nth((await footerButtons.count()) - 1).click();
  const dialog = '[aria-labelledby="create-student-dialog-title"]';
  await page.waitForSelector(dialog, { state: 'visible' });
  await page.locator(`${dialog} input`).first().fill(STUDENT_NAME);
  const selected = await page.evaluate(({ selector, className }) => {
    const labels = Array.from(document.querySelectorAll<HTMLLabelElement>(`${selector} label`));
    const label = labels.find((entry) => entry.textContent?.trim() === className);
    label?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    return Boolean(label);
  }, { selector: dialog, className: target.name });
  if (!selected) throw new Error(`Class "${target.name}" missing from create-student dialog.`);
  await page.locator(`${dialog} button[type="submit"]`).click();
  await page.waitForSelector('[aria-labelledby="pin-dialog-title"]', { state: 'visible' });
  return target;
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
    const targetClass = await ensureRosteredClass(manager);

    await manager.goto(`${BASE_URL}/manager/config/play`);
    await manager.waitForSelector('[data-testid^="quizz-row-e2e-all-ty-"]', { state: 'visible' });
    await manager.locator('[data-testid^="quizz-row-e2e-all-ty-"]').first().click();
    const switches = manager.locator('button[role="switch"]');
    await switches.nth((await switches.count()) - 1).click();
    await manager.waitForSelector(testIdSel('class-select'), { state: 'visible' });
    await manager.evaluate(({ selector, value }) => {
      const select = document.querySelector<HTMLSelectElement>(selector);
      if (!select) throw new Error('Class select missing');
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, { selector: testIdSel('class-select'), value: targetClass.id });
    await manager.locator(testIdSel('quizz-start-btn')).click();
    await manager.waitForSelector(testIdSel('game-pin'), { state: 'visible' });
    const pin = (await manager.locator(testIdSel('game-pin')).innerText()).replace(/\D/g, '');
    if (!/^\d{6}$/.test(pin)) throw new Error(`Expected 6-digit game PIN, got "${pin}".`);

    await player.goto(BASE_URL);
    await player.waitForSelector(testIdSel('pin-input-digit-0'), { state: 'visible' });
    await player.locator(testIdSel('pin-input-digit-0')).click();
    await player.type(pin);
    await player.locator(testIdSel('join-submit')).click();
    await player.waitForSelector('#student-search', { state: 'visible' });
    if (await player.locator(testIdSel('username-input')).isVisible().catch(() => false)) {
      throw new Error('Free-text username path remained visible in class mode.');
    }

    await player.locator('#student-search').fill('E2E Unknown W6');
    const empty = await player.locator('[role="status"]').innerText();
    if (!empty.trim()) throw new Error('Unknown roster search did not show a visible rejection.');
    await player.locator('#student-search').fill('');
    await player.locator('[role="listbox"] [role="option"]:not([aria-disabled="true"]) input').first().click();
    for (let slot = 1; slot <= 4; slot += 1) {
      await player.locator(`#emoji-pin-${slot}`).click();
      await player.waitForSelector('[role="combobox"] [role="option"]', { state: 'visible' });
      await player.locator('[role="combobox"] [role="option"]').first().click();
    }
    await player.locator(testIdSel('class-join-submit')).click();
    await player.waitForSelector('[role="alert"]', { state: 'visible' });
    if (await player.locator(testIdSel('waiting-room')).isVisible().catch(() => false)) {
      throw new Error('Invalid class credentials reached waiting room.');
    }
    console.log(`W6-6 PASS: class ${targetClass.id} enforced roster+PIN join.`);
  } finally {
    await managerSh.close();
    await playerSh.close();
  }
}

run().then(() => process.exit(0), (error) => {
  console.error('W6-6 class-mode-enforcement FAILED:', error);
  process.exit(1);
});
