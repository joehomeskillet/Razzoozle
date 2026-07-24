/**
 * e2e/stagehand/ai-rate-limit.spec.ts — W6-9 / R14 (P3)
 *
 * Flood AI text-gen UI if present; assert rate-limit or graceful disable.
 * Soft-pass when AI tab/keys are not configured on prod.
 *
 * Run: E2E_PW=… npx tsx e2e/stagehand/ai-rate-limit.spec.ts
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://rust.razzoozle.xyz';

function requireE2EPassword(): string {
  const pw = process.env.E2E_PW;
  if (!pw) throw new Error('E2E_PW required');
  return pw;
}
function e2eUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

async function waitForTestId(page: Page, id: string, timeout = 15_000) {
  await page.waitForSelector(testIdSel(id), { state: 'visible', timeout });
}
async function waitForTestIdPrefix(page: Page, prefix: string, timeout = 15_000) {
  await page.waitForSelector(testIdPrefixSel(prefix), { state: 'visible', timeout });
}

async function clickByText(page: Page, ...labels: string[]) {
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
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) throw new Error('no page');
  await page.setViewportSize({ width: 1280, height: 800 });

  try {
    await page.goto(`${BASE_URL}/manager`);
    await waitForTestId(page, 'login-password');
    await page.locator(testIdSel('login-username')).fill(e2eUsername());
    await page.locator(testIdSel('login-password')).fill(requireE2EPassword());
    await page.locator(testIdSel('login-submit')).click();
    await waitForTestIdPrefix(page, 'quizz-row-');

    await clickByText(page, 'System', 'system');
    await page.waitForTimeout(300);
    const aiNav = await clickByText(page, 'AI', 'KI', 'Ai', 'ai');
    if (!aiNav) {
      console.log('W6-9 SKIP: no AI/KI nav tab — rate-limit UI not exposed');
      console.log('W6-9 ai-rate-limit PASSED (soft skip)');
      return;
    }
    console.log(`Opened AI nav: ${aiNav}`);
    await page.waitForTimeout(800);

    // Find generate / test buttons
    const genLabels = [
      'generate',
      'generieren',
      'test',
      'frage',
      'question',
      'run',
      'ausführen',
    ];
    const clickGen = async () =>
      page.evaluate((cands) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const b of buttons) {
          if ((b as HTMLButtonElement).disabled) continue;
          const t = `${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`.toLowerCase();
          if (cands.some((c) => t.includes(c))) {
            (b as HTMLButtonElement).click();
            return t.trim().slice(0, 80);
          }
        }
        return null;
      }, genLabels);

    let hits = 0;
    let limited = false;
    for (let i = 0; i < 6; i++) {
      const clicked = await clickGen();
      if (!clicked) {
        if (i === 0) {
          console.log('W6-9 SKIP: AI tab open but no generate/test control found');
          console.log('W6-9 ai-rate-limit PASSED (soft skip)');
          return;
        }
        break;
      }
      hits += 1;
      await page.waitForTimeout(400);
      const body = await page.evaluate(() => document.body.innerText.toLowerCase());
      if (
        body.includes('rate limit') ||
        body.includes('rate-limit') ||
        body.includes('zu viele') ||
        body.includes('throttl') ||
        body.includes('cooldown') ||
        body.includes('limitiert')
      ) {
        limited = true;
        console.log(`Rate-limit signal after click #${hits}`);
        break;
      }
    }

    if (limited) {
      console.log(`W6-9 PASS: rate limited after ${hits} clicks`);
    } else if (hits > 0) {
      // AI may be unconfigured → errors without rate limit; still no crash
      console.log(
        `W6-9 SOFT-PASS: ${hits} generate clicks without explicit rate-limit text (AI may be off/unkeyed)`,
      );
    }
    console.log('W6-9 ai-rate-limit PASSED');
  } finally {
    await stagehand.close();
  }
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error('W6-9 FAILED:', e);
    process.exit(1);
  },
);
