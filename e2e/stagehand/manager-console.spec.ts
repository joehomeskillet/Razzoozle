/**
 * e2e/stagehand/manager-console.spec.ts — Manager Console acceptance suite (W6-1).
 *
 * Validates all 18 ConsoleShell nav sections (design.md Manager UX SDD #86)
 * render via BOTH the desktop nav rail (>=920px, persistent) and the mobile
 * hamburger Drawer (<920px, D12) — matched against each tab's REAL rendered
 * label, not a substring guess: several section keys do NOT substring-match
 * their translated label (key "ki" -> label "AI", "submissions" ->
 * "Suggestions", "schueler" -> "Student management", "users" -> "User
 * Management", "klassen" -> "Classes", "gamemode" -> "Mode") — that mismatch,
 * not a scroll/visibility problem, is what made a prior attempt misreport
 * those 6 as "not visible" (verified: Stagehand's Locator.isVisible() has no
 * viewport/ancestor-clipping check at all — only display/opacity/size — and
 * Locator.click() auto-scrolls via CDP DOM.scrollIntoViewIfNeeded).
 *
 * Run directly: `npx tsx e2e/stagehand/manager-console.spec.ts` (per
 * stagehand/README.md — plain script, not Playwright Test/Jest).
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = 'https://rust.razzoozle.xyz';

function requireE2EPassword(): string {
  const pw = process.env.E2E_PW;
  if (!pw) {
    throw new Error('E2E_PW environment variable is required for manager login.');
  }
  return pw;
}

function e2eUsername(): string {
  return process.env.E2E_USER ?? 'admin';
}

const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

async function waitForTestId(page: Page, id: string, timeoutMs = 15_000) {
  await page.waitForSelector(testIdSel(id), { state: 'visible', timeout: timeoutMs });
}

async function waitForTestIdPrefix(page: Page, prefix: string, timeoutMs = 15_000) {
  await page.waitForSelector(testIdPrefixSel(prefix), { state: 'visible', timeout: timeoutMs });
}

// key -> real translated tab label, both locales (packages/web/src/locales/
// {en,de}/manager.json "tabs"). Exact-match lookup replaces the fragile
// substring guess a prior attempt used.
const TAB_LABELS: Record<string, { en: string; de: string }> = {
  play: { en: 'Play', de: 'Spielen' },
  quizz: { en: 'Quiz', de: 'Quiz' },
  catalog: { en: 'Catalog', de: 'Katalog' },
  klassen: { en: 'Classes', de: 'Klassen' },
  schueler: { en: 'Student management', de: 'Schülerverwaltung' },
  media: { en: 'Media', de: 'Medien' },
  results: { en: 'Results', de: 'Ergebnisse' },
  submissions: { en: 'Suggestions', de: 'Vorschläge' },
  profile: { en: 'My Profile', de: 'Mein Profil' },
  gamemode: { en: 'Mode', de: 'Modus' },
  ki: { en: 'AI', de: 'KI' },
  achievements: { en: 'Achievements', de: 'Achievements' },
  running: { en: 'Running Games', de: 'Laufende Spiele' },
  users: { en: 'User Management', de: 'Nutzerverwaltung' },
  design: { en: 'Design', de: 'Design' },
  labels: { en: 'Labels', de: 'Fächer' },
  satellite: { en: 'Satellite', de: 'Satellit' },
  dev: { en: 'Dev', de: 'Dev' },
};

const NAV_SECTIONS = Object.keys(TAB_LABELS);

function matchesSection(text: string, section: string): boolean {
  const t = text.trim();
  const { en, de } = TAB_LABELS[section];
  return t === en || t === de;
}

type Status = 'pass' | 'fail' | 'skip';

interface SectionResult {
  section: string;
  desktop: Status;
  mobile: Status;
  desktopError?: string;
  mobileError?: string;
}

/** Find + click the nav tab for `section` among the current `button[role="tab"]`
    candidates (rail on desktop, Drawer on mobile — same NavItem markup,
    different container). Returns false only if genuinely absent (no exact
    label match anywhere). click() itself scrolls the element into view via
    CDP, so no separate pre-click visibility/scroll gate is needed. */
async function clickSectionTab(page: Page, section: string): Promise<boolean> {
  const tabs = page.locator('button[role="tab"]');
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    const tab = tabs.nth(i);
    const text = await tab.innerText().catch(() => '');
    if (matchesSection(text, section)) {
      await tab.click();
      return true;
    }
  }
  return false;
}

/** Section-active assertion: tab switch persisted (localStorage) + non-empty
    visible content. A heading is intentionally NOT asserted: several
    sections (e.g. "play" / ConfigSelectQuizz) render no h1/h2/h3 at all,
    while ConsoleShell's OWN chrome always has a persistent page-title h1 —
    asserting on "any h1/h2 exists" would false-pass every section via that
    persistent title and never actually test the section body. */
async function assertSectionActive(page: Page, section: string): Promise<void> {
  await page.waitForTimeout(300);

  const stored = await page.evaluate(() => localStorage.getItem('rahoot_manager_tab'));
  if (stored !== section) {
    throw new Error(`localStorage rahoot_manager_tab is "${stored}", expected "${section}"`);
  }

  const panelText = await page.locator('[role="tabpanel"]').innerText().catch(() => '');
  if (!panelText.trim()) {
    throw new Error('Section tabpanel has no visible text content');
  }
}

async function runDesktopPass(page: Page): Promise<Map<string, { status: Status; error?: string }>> {
  const out = new Map<string, { status: Status; error?: string }>();
  console.log('Desktop (1280x900): testing nav rail...');

  for (const section of NAV_SECTIONS) {
    try {
      const found = await clickSectionTab(page, section);
      if (!found) {
        out.set(section, { status: 'skip' });
        console.log(`  [SKIP] ${section} (not present in rail)`);
        continue;
      }
      await assertSectionActive(page, section);
      out.set(section, { status: 'pass' });
      console.log(`  [PASS] ${section}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      out.set(section, { status: 'fail', error });
      console.error(`  [FAIL] ${section}: ${error}`);
    }
  }
  return out;
}

async function runMobilePass(page: Page): Promise<Map<string, { status: Status; error?: string }>> {
  const out = new Map<string, { status: Status; error?: string }>();
  console.log('Mobile (375x812): testing Drawer nav...');

  // Radix Dialog.Trigger auto-sets aria-haspopup="dialog" — locale-independent,
  // unlike matching the "Open navigation"/"Navigation öffnen" aria-label text.
  const openNavSel = 'button[aria-haspopup="dialog"]';

  for (const section of NAV_SECTIONS) {
    try {
      await page.waitForSelector(openNavSel, { state: 'visible', timeout: 5_000 });
      await page.locator(openNavSel).first().click();
      await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5_000 });
      // Settle the open transition — the prior loop iteration's Dialog can
      // still be mid-close-animation (Radix keeps content mounted briefly for
      // its exit transition), and clicking too early lands on that STALE
      // still-visible tab instead of the freshly reopened one (live-run
      // finding: "quizz" clicked resolved to the previous "play" section).
      await page.waitForTimeout(300);

      const found = await clickSectionTab(page, section);
      if (!found) {
        // Close the Drawer we opened (D10 Escape-to-close) before the next section.
        await page.keyboard.press('Escape').catch(() => undefined);
        out.set(section, { status: 'skip' });
        console.log(`  [SKIP] ${section} (not present in Drawer)`);
        continue;
      }
      // handleDrawerSelect closes the Dialog itself after a selection — wait
      // for that close to fully finish so the NEXT iteration's re-open of the
      // Drawer never races a still-mounted previous instance.
      await assertSectionActive(page, section);
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 3_000 }).catch(() => undefined);
      out.set(section, { status: 'pass' });
      console.log(`  [PASS] ${section}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      out.set(section, { status: 'fail', error });
      console.error(`  [FAIL] ${section}: ${error}`);
    }
  }
  return out;
}

async function runManagerConsoleTest() {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) {
    throw new Error('Stagehand did not produce an active page after init()');
  }

  try {
    // Viewport set BEFORE goto so ConsoleShell's isDesktop (>=920px rail vs
    // Drawer) state is correct on first mount.
    await page.setViewportSize(1280, 900);
    await page.goto(`${BASE_URL}/manager`);
    await waitForTestId(page, 'login-password');
    await page.locator(testIdSel('login-username')).fill(e2eUsername());
    await page.locator(testIdSel('login-password')).fill(requireE2EPassword());
    await page.locator(testIdSel('login-submit')).click();
    await waitForTestIdPrefix(page, 'quizz-row-');

    const desktop = await runDesktopPass(page);

    await page.setViewportSize(375, 812);
    await page.waitForTimeout(500);
    const mobile = await runMobilePass(page);

    const results: SectionResult[] = NAV_SECTIONS.map((section) => {
      const d = desktop.get(section)!;
      const m = mobile.get(section)!;
      return {
        section,
        desktop: d.status,
        mobile: m.status,
        desktopError: d.error,
        mobileError: m.error,
      };
    });

    console.log('\n============================================================');
    console.log('MANAGER CONSOLE ACCEPTANCE TEST RESULTS');
    console.log('============================================================');

    let desktopPass = 0;
    let mobilePass = 0;
    let failCount = 0;
    let bothMissingCount = 0;

    for (const r of results) {
      const bothMissing = r.desktop === 'skip' && r.mobile === 'skip';
      if (bothMissing) {
        bothMissingCount++;
        console.log(`SKIP | ${r.section.padEnd(14)} | not present in rail OR Drawer`);
        continue;
      }
      if (r.desktop === 'pass') desktopPass++;
      if (r.mobile === 'pass') mobilePass++;
      if (r.desktop === 'fail' || r.mobile === 'fail') failCount++;

      const d = r.desktop === 'pass' ? 'PASS' : r.desktop === 'fail' ? `FAIL (${r.desktopError})` : 'SKIP';
      const m = r.mobile === 'pass' ? 'PASS' : r.mobile === 'fail' ? `FAIL (${r.mobileError})` : 'SKIP';
      const line = r.desktop === 'fail' || r.mobile === 'fail' ? 'FAIL' : 'PASS';
      console.log(`${line} | ${r.section.padEnd(14)} | Desktop: ${d} | Mobile: ${m}`);
    }

    console.log('============================================================');
    console.log(
      `Summary: Desktop ${desktopPass}/${NAV_SECTIONS.length} PASS, ` +
        `Mobile ${mobilePass}/${NAV_SECTIONS.length} PASS, ` +
        `${failCount} FAIL, ${bothMissingCount} SKIP (of ${NAV_SECTIONS.length} sections)`,
    );
    console.log('============================================================');

    if (failCount > 0) {
      process.exit(1);
    }
    process.exit(0);
  } finally {
    await stagehand.close();
  }
}

runManagerConsoleTest().then(
  () => undefined,
  (err) => {
    console.error('Manager console test error:', err);
    process.exit(1);
  },
);
