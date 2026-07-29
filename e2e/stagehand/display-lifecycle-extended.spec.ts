/**
 * e2e/stagehand/display-lifecycle-extended.spec.ts — W6-11 / R9
 *
 * Satellite display auth path (soft if SATELLITE_TOKEN not configured on prod):
 * - Manager can open Display/Satellit config tab
 * - Pairing UI mounts without crash
 * - If env has satellite secret available client-side only via pairing flow,
 *   exercise pair code UI
 *
 * Full manager-event emit via satelliteToken requires server SATELLITE_TOKEN;
 * this spec gates on UI presence (manager-media-tab style) + optional skip.
 *
 * Run: E2E_PW=… npx tsx e2e/stagehand/display-lifecycle-extended.spec.ts
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

async function clickNavByText(page: Page, ...labels: string[]) {
  const hit = await page.evaluate((cands) => {
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
  return hit;
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

    // Open System group if collapsed, then Display / Satellit / Design-adjacent tabs
    await clickNavByText(page, 'System', 'system');
    await page.waitForTimeout(400);

    const opened = await clickNavByText(
      page,
      'Display',
      'Satellit',
      'Satellite',
      'Presenter',
      'Anzeige',
      'display',
    );

    if (!opened) {
      // Fall back: any element mentioning satellite/display pairing
      const body = await page.evaluate(() => document.body.innerText.toLowerCase());
      if (body.includes('satellit') || body.includes('display') || body.includes('pairing')) {
        console.log('W6-11: display/satellite copy visible without dedicated nav click');
      } else {
        throw new Error('no Display/Satellit nav on this build — lifecycle UI not exposed (P2) — feature must be enabled or test skipped explicitly');
      }
    } else {
      console.log(`Opened nav: ${opened}`);
    }

    await page.waitForTimeout(1_000);
    // Pairing card / status should not crash; look for common markers
    const markers = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasPair: /pair|pairing|koppeln|code/i.test(text),
        hasSatellite: /satellit|display|presenter/i.test(text),
        hasErrorBoundary: /something went wrong|unexpect/i.test(text),
      };
    });
    if (markers.hasErrorBoundary) {
      throw new Error('Display tab rendered error boundary');
    }
    console.log(`Display tab markers: ${JSON.stringify(markers)}`);

    // Optional deep-link refresh cycle: reload manager, still authed
    await page.reload();
    await waitForTestIdPrefix(page, 'quizz-row-', 20_000);
    console.log('Post-reload manager still authenticated');

    console.log('W6-11 display-lifecycle-extended PASSED');
  } finally {
    await stagehand.close();
  }
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error('W6-11 FAILED:', e);
    process.exit(1);
  },
);
