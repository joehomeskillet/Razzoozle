/**
 * e2e/stagehand/fill-blank-matching-droppin.spec.ts — Solo play of the
 * fill-blank, matching, and drop-pin question types (the SlotDropdownBoard +
 * HotspotImage answers that the all-types fixture behind solo-types.spec.ts
 * does not carry).
 *
 * Run directly: `npx tsx e2e/stagehand/fill-blank-matching-droppin.spec.ts`
 * (per stagehand/README.md — plain Stagehand script, NOT a Playwright Test /
 * Jest suite; the installed @browserbasehq/stagehand v3 SDK exposes its own
 * CDP-based Page/Locator, not Playwright's, and `@playwright/test` is not a
 * dependency of e2e/).
 *
 * Viewports / parallelism: exactly ONE mobile viewport (375x667, mobile-sm)
 * and ONE Stagehand browser, with every question answered strictly in order —
 * the solo host sees a single client, i.e. the serial-host-load equivalent of
 * Playwright `workers: 1`. Documented here (rather than in a runner config)
 * because this spec is a plain script: if it is ever wired into a runner or
 * extended to more viewports, keep workers=1 / serial.
 *
 * Quiz resolution: GET /api/quizzes returns bare ids and the subject only
 * appears in the per-quiz solo payload, so candidates are probed in order —
 * ids starting with the deterministic seed prefix "e2e-all-ty-"
 * (normalize_filename("E2E All Types"), rust/server/src/socket/manager/
 * quizz.rs) first, then every other id — accepting the first quiz whose id
 * starts with the prefix OR whose subject contains "All Types" AND that
 * carries at least one fill-blank / matching / drop-pin question. Probes are
 * capped (MAX_PROBES) because both the probes and the playthrough itself hit
 * the per-IP solo rate limit (120 calls/min, rust/server/src/state/mod.rs).
 *
 * Graceful-skip contract (this spec is discovery-driven and the seeded quiz
 * may legitimately lack all three types): no matching quiz, no target type in
 * the matched quiz, or a non-target question blocking the path → console.warn
 * + exit 0 ("at least one type tested OR all skipped cleanly"). A target type
 * that IS present but whose flow breaks (controls never appear, pin never
 * lands, result phase never arrives) → exit 1.
 *
 * Scoring is out of scope: /api/quizz/:id/solo strips the real correctIndex
 * (rust/server/src/http/solo.rs serializes 0 for every slot/leftItem), so the
 * "first selectable option" this spec picks per slot exercises the flow
 * (select → submit → result → next), not answer correctness.
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = 'https://rust.razzoozle.xyz';

// normalize_filename("E2E All Types") = lowercase, spaces->hyphens, take(10),
// then "-" plus a random 8-hex-char suffix — the same deterministic prefix
// solo-types.spec.ts resolves against. The subject needle covers reseeds
// whose id drifted from the prefix.
const QUIZ_ID_PREFIX = 'e2e-all-ty-';
const SUBJECT_NEEDLE = 'all types';

// Cap on per-quiz solo-payload probes during resolution: every probe (and
// every in-play check-answer call) counts against the 120/min per-IP solo
// rate limit, so discovery must stay cheap.
const MAX_PROBES = 40;

const VIEWPORT = { width: 375, height: 667, name: 'mobile-sm' } as const;

const TARGET_TYPES = ['fill-blank', 'matching', 'drop-pin'] as const;
type TargetType = (typeof TARGET_TYPES)[number];

// Wire shape of GET /api/quizz/:id/solo (SoloQuestion in
// rust/server/src/http/solo.rs) — only the fields this spec reads.
type SoloQuestion = {
  question?: string;
  type?: string;
  cooldown?: number;
  min?: number;
  max?: number;
  tokens?: string[];
  slots?: Array<{ options?: string[] }>;
  leftItems?: Array<{ label?: string; options?: string[] }>;
  media?: { url?: string };
};

type SoloQuizPayload = {
  subject?: string;
  questions?: SoloQuestion[];
};

type ResolvedQuiz = {
  id: string;
  subject: string;
  questions: SoloQuestion[];
  presentTargets: Set<TargetType>;
};

// ── Stagehand Page/Locator helpers ──────────────────────────────────────────
// Same constraints as solo-types.spec.ts: stagehand.page does not exist on
// v3 (the active page is stagehand.context.activePage()), and its Locator
// has no getByTestId/getByRole/filter/or/waitFor/evaluate/selectOption; only
// click/fill/type/isVisible/innerText/first/nth/count on a raw CSS selector.

const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

async function isDisabledSelector(page: Page, selector: string): Promise<boolean | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as (HTMLButtonElement | HTMLInputElement | HTMLSelectElement | null);
    return el ? el.disabled : null;
  }, selector);
}

async function waitForDisabledTestId(page: Page, id: string, timeoutMs = 15_000) {
  const selector = testIdSel(id);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await isDisabledSelector(page, selector)) === true) {
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for "${selector}" to become disabled (submit never registered)`);
}

/** Inverse of waitForDisabledTestId — proves a control has reached the fresh,
    interactive "answering" phase (a stale post-submit phase of the previous
    question renders the same testids disabled). */
async function waitForEnabledSelector(page: Page, selector: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await isDisabledSelector(page, selector)) === false) {
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for "${selector}" to become enabled (answering phase never became interactive)`);
}

/** Set a range/slider input's value the React-safe way (native value setter +
    dispatched input/change) instead of a plain fill(), which does not
    reliably trigger onChange on a controlled React range input. Verbatim
    from solo-types.spec.ts (used only for pass-through questions here). */
async function setRangeValue(page: Page, selector: string, value: number) {
  await page.evaluate(
    ({ sel, v }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) {
        throw new Error(`setRangeValue: no element for "${sel}"`);
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter ? setter.call(el, String(v)) : (el.value = String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel: selector, v: value },
  );
}


// ── Quiz resolution ─────────────────────────────────────────────────────────

async function resolveQuiz(page: Page): Promise<ResolvedQuiz | null> {
  // The page starts at about:blank (null origin) right after init() — a
  // fetch() to BASE_URL from there is cross-origin and gets blocked. Land on
  // the app origin first so the evaluate()-fetches below are same-origin
  // (live-run finding in solo-types.spec.ts, 2026-07-15).
  if (!page.url().startsWith(BASE_URL)) {
    await page.goto(BASE_URL);
  }

  const ids = await page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`GET ${url} failed with status ${res.status}`);
    }
    return (await res.json()) as string[];
  }, `${BASE_URL}/api/quizzes`);

  // Prefix matches first (V8's sort is stable, so list order is preserved
  // within each group), then all other ids for the subject-needle probe.
  const ordered = [...new Set(ids)].sort(
    (a, b) => Number(b.startsWith(QUIZ_ID_PREFIX)) - Number(a.startsWith(QUIZ_ID_PREFIX)),
  );

  const matchedWithoutTargets: string[] = [];
  let probed = 0;
  for (const id of ordered) {
    if (probed >= MAX_PROBES) {
      console.warn(
        `Probe budget exhausted (${MAX_PROBES}) — the remaining ${ordered.length - probed} quiz id(s) were not inspected.`,
      );
      break;
    }
    probed++;
    const payload = await page.evaluate(async (url) => {
      const res = await fetch(url);
      if (!res.ok) {
        return null; // 404 (deleted quiz) / 429 (solo rate limit) — skip this candidate
      }
      return (await res.json()) as SoloQuizPayload;
    }, `${BASE_URL}/api/quizz/${id}/solo`);
    if (!payload || !Array.isArray(payload.questions)) {
      continue;
    }
    const subject = payload.subject ?? '';
    const isSeedIdentity = id.startsWith(QUIZ_ID_PREFIX) || subject.toLowerCase().includes(SUBJECT_NEEDLE);
    if (!isSeedIdentity) {
      continue;
    }
    const presentTargets = new Set<TargetType>();
    for (const q of payload.questions) {
      if ((TARGET_TYPES as readonly string[]).includes(q.type ?? '')) {
        presentTargets.add(q.type as TargetType);
      }
    }
    if (presentTargets.size === 0) {
      // Repeat seed runs can leave several prefix matches side by side —
      // remember this one for the skip diagnostic but keep scanning for a
      // reseeded duplicate that actually carries the target types.
      matchedWithoutTargets.push(id);
      continue;
    }
    return { id, subject, questions: payload.questions, presentTargets };
  }

  if (matchedWithoutTargets.length > 0) {
    console.warn(
      `Quiz id(s) ${matchedWithoutTargets.join(', ')} match the seed identity ` +
        '(prefix or subject) but contain no fill-blank/matching/drop-pin questions.',
    );
  }
  return null;
}

// ── Target-type answer strategies (SoloAnswers.tsx contract) ────────────────
// IMPORTANT divergence from solo-types.spec.ts: SoloAnswers.submitSlotAnswer
// / submitDropPin never call setSubmitted(true), and SoloShell keeps
// SoloAnswers mounted across the answering→result transition (keyed on the
// question index, not the phase) — so for these three types the answer
// controls NEVER gain `disabled` after submitting. The reliable "submit
// registered" post-condition is the result phase itself: SoloFooterControls'
// Next/Finish button is rendered (via SoloShell.footerAction) only when
// phase === "result", i.e. only after the check-answer round-trip resolved.
// The footer lives in SoloShell's bottom bar — the only div carrying both
// z-50 and border-t — and the auto-advance toggle next to it always has
// aria-pressed, so this selector matches exactly the Next/Finish button and
// nothing else (in particular not the still-enabled board submit buttons).
const RESULT_NEXT_SEL = 'div.z-50.border-t button:not([aria-pressed]):not([disabled])';

async function waitForResultPhaseAndAdvance(page: Page, timeoutMs = 20_000) {
  await page.waitForSelector(RESULT_NEXT_SEL, { state: 'visible', timeout: timeoutMs });
  await page.locator(RESULT_NEXT_SEL).click();
}


/** fill-blank AND matching share SlotDropdownBoard: one native <select> per
    slot (`solo-slot-select-<idx>` — matching only adds row labels), and a
    submit (`solo-slot-submit`) that stays disabled until EVERY slot has a
    selection. The v3 Locator has no selectOption, so each <select> is set
    the React-safe way (native value setter + dispatched input/change — the
    same pattern setRangeValue uses for range inputs). */
async function answerSlotDropdown(page: Page, type: 'fill-blank' | 'matching', budgetMs: number) {
  const slotsSel = testIdPrefixSel('solo-slot-select');
  await page.waitForSelector(slotsSel, { state: 'visible', timeout: budgetMs });
  // Fresh-phase proof: the first <select> must be ENABLED before touching it
  // (a stale post-submit phase renders the same testids disabled).
  await waitForEnabledSelector(page, testIdSel('solo-slot-select-0'));

  const slotCount = await page.locator(slotsSel).count();
  if (slotCount === 0) {
    throw new Error(`${type}: slot board visible but no [data-testid^="solo-slot-select"] elements found`);
  }
  for (let i = 0; i < slotCount; i++) {
    await page.evaluate((idx) => {
      const el = document.querySelector(`[data-testid="solo-slot-select-${idx}"]`);
      if (!(el instanceof HTMLSelectElement)) {
        throw new Error(`slot select ${idx}: element missing or not a <select>`);
      }
      // First real option (index 0 is the disabled "Select option" placeholder
      // with value ""). correctIndex is stripped server-side, so any valid
      // option exercises the flow.
      const option = Array.from(el.options).find((o) => o.value !== '' && !o.disabled);
      if (!option) {
        throw new Error(`slot select ${idx}: no selectable option`);
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter ? setter.call(el, option.value) : (el.value = option.value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, i);
  }

  // allFilled gate: an ENABLED submit proves every select registered its
  // change (SlotDropdownBoard keeps submit disabled until all slots are set).
  await waitForEnabledSelector(page, testIdSel('solo-slot-submit'));
  await page.locator(testIdSel('solo-slot-submit')).click();
  await waitForResultPhaseAndAdvance(page);
}

/** drop-pin: click the hotspot image to place the pin (this enables submit),
    submit, then advance. Solo renders the solo-prefixed testids
    (HotspotImage testIdPrefix="solo-"); the unprefixed fallback keeps the
    spec working if the board is ever mounted without the prefix. */
async function answerDropPin(page: Page, budgetMs: number) {
  const imageSel = `${testIdSel('solo-hotspot-image')}, ${testIdSel('hotspot-image')}`;
  const pinSel = `${testIdSel('solo-hotspot-pin')}, ${testIdSel('hotspot-pin')}`;
  const submitSel = `${testIdSel('solo-hotspot-submit')}, ${testIdSel('hotspot-submit')}`;

  await page.waitForSelector(imageSel, { state: 'visible', timeout: budgetMs });
  // Fresh-phase proof: no pin placed yet (a stale result phase of a previous
  // drop-pin question would still show the old pin, and clicks on the
  // disabled board would silently no-op).
  const freshStart = Date.now();
  while (await page.locator(pinSel).first().isVisible().catch(() => false)) {
    if (Date.now() - freshStart > 10_000) {
      throw new Error('drop-pin: previous pin never cleared (stale phase?)');
    }
    await page.waitForTimeout(200);
  }

  await page.locator(imageSel).first().click(); // center click → pin at (0.5, 0.5)
  await page.waitForSelector(pinSel, { state: 'visible', timeout: 10_000 });
  await waitForEnabledSelector(page, submitSel);
  await page.locator(submitSel).first().click();
  await waitForResultPhaseAndAdvance(page);
}


// ── Non-target pass-through strategies ──────────────────────────────────────
// Solo has no per-question deep link: reaching a fill-blank/matching/drop-pin
// question at index N requires answering questions 0..N-1 first. These
// best-effort answers (wrong is fine — only the flow matters) mirror
// solo-types.spec.ts minus correctness. A pass-through failure is NOT a spec
// failure: it warns and stops the run early (targets already tested stay
// tested; unreachable targets count as skipped) because those other types
// are covered by solo-types.spec.ts.

/** Sentence-builder + sequencing share the chip-bank mechanic: clicking a
    bank chip moves it into the placed row, so first() is always a fresh,
    not-yet-placed chip; submit enables once the bank is drained. */
async function drainBankAndSubmit(page: Page, bankPrefix: string, submitId: string, budgetMs: number) {
  const bankSel = testIdPrefixSel(bankPrefix);
  await page.waitForSelector(bankSel, { state: 'visible', timeout: budgetMs });
  for (let guard = 0; guard < 40; guard++) {
    if ((await page.locator(bankSel).count()) === 0) {
      break;
    }
    await page.locator(bankSel).first().click();
    await page.waitForTimeout(150); // let React move the chip before re-counting
  }
  if ((await page.locator(bankSel).count()) !== 0) {
    throw new Error(`bank never drained for "${bankPrefix}"`);
  }
  await page.locator(testIdSel(submitId)).click();
  await waitForDisabledTestId(page, submitId);
}

async function passThroughNonTarget(page: Page, q: SoloQuestion, budgetMs: number): Promise<void> {
  switch (q.type) {
    case 'choice':
    case 'boolean':
    case 'poll': {
      // Choice-like tiles submit on tap and disable synchronously.
      const sel = `${testIdSel('solo-choice-tile-0')} button`;
      await page.waitForSelector(sel, { state: 'visible', timeout: budgetMs });
      await page.locator(sel).click();
      const start = Date.now();
      while (Date.now() - start < 15_000) {
        if ((await isDisabledSelector(page, sel)) === true) {
          return;
        }
        await page.waitForTimeout(200);
      }
      throw new Error('choice tile never disabled after tap');
    }
    case 'slider': {
      await page.waitForSelector(testIdSel('solo-slider-input'), { state: 'visible', timeout: budgetMs });
      await setRangeValue(page, testIdSel('solo-slider-input'), Math.round(((q.min ?? 0) + (q.max ?? 100)) / 2));
      await page.locator(testIdSel('solo-slider-submit')).click();
      await waitForDisabledTestId(page, 'solo-slider-submit');
      return;
    }
    case 'multiple-select': {
      const sel = `${testIdSel('solo-multiple-select-tile-0')} button`;
      await page.waitForSelector(sel, { state: 'visible', timeout: budgetMs });
      await page.locator(sel).click();
      await page.locator(testIdSel('solo-multiple-select-submit')).click();
      await waitForDisabledTestId(page, 'solo-multiple-select-submit');
      return;
    }
    case 'type-answer': {
      await page.waitForSelector(testIdSel('solo-type-answer-input'), { state: 'visible', timeout: budgetMs });
      await page.locator(testIdSel('solo-type-answer-input')).fill('e2e-pass-through');
      await page.locator(testIdSel('solo-type-answer-submit')).click();
      await waitForDisabledTestId(page, 'solo-type-answer-submit');
      return;
    }
    case 'sentence-builder':
      await drainBankAndSubmit(page, 'solo-sentence-builder-bank-', 'solo-sentence-builder-submit', budgetMs);
      return;
    case 'sequencing':
      await drainBankAndSubmit(page, 'solo-sequencing-bank-', 'solo-sequencing-submit', budgetMs);
      return;
    case 'mathematik': {
      // NB: not prefixed "solo-" — SoloAnswers.tsx reuses the MP testid verbatim.
      await page.waitForSelector(testIdSel('mathematik-input'), { state: 'visible', timeout: budgetMs });
      await page.locator(testIdSel('mathematik-input')).fill('0');
      await page.locator(testIdSel('mathematik-submit')).click();
      await waitForDisabledTestId(page, 'mathematik-submit');
      return;
    }
    case 'wortarten': {
      const tokenCount = q.tokens?.length ?? 0;
      if (tokenCount === 0) {
        throw new Error('wortarten question carries no tokens — cannot pass through');
      }
      await page.waitForSelector(testIdSel('solo-wortarten-token-0'), { state: 'visible', timeout: budgetMs });
      for (let i = 0; i < tokenCount; i++) {
        const tokenSel = testIdSel(`solo-wortarten-token-${i}`);
        if ((await isDisabledSelector(page, tokenSel)) === true) {
          continue; // editor-disabled token: intentionally untaggable
        }
        await page.locator(tokenSel).click();
        const posSel = testIdPrefixSel(`solo-wortarten-pos-${i}-`);
        await page.waitForSelector(posSel, { state: 'visible', timeout: 5_000 });
        await page.locator(posSel).first().click();
      }
      await page.locator(testIdSel('solo-wortarten-submit')).click();
      await waitForDisabledTestId(page, 'solo-wortarten-submit');
      return;
    }
    default:
      throw new Error(`no pass-through strategy for question type "${q.type ?? 'unknown'}"`);
  }
}


// ── Playthrough ─────────────────────────────────────────────────────────────

/** Play the resolved quiz solo from question 0, testing every target-type
    question on the way and passing through the rest. Returns the set of
    target types actually tested. Throws (fails the run) only when a TARGET
    question's own flow breaks; a pass-through failure stops the run early
    with a warning instead. */
async function playQuiz(page: Page, quiz: ResolvedQuiz): Promise<Set<TargetType>> {
  const tested = new Set<TargetType>();

  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await page.goto(`${BASE_URL}/quizz/${quiz.id}/solo`);
  const urlAfterNav = page.url();
  if (!urlAfterNav.includes('/solo')) {
    throw new Error(`Expected the solo route, got "${urlAfterNav}"`);
  }

  // Name entry — NameScreen has no testid; it is the only <form> on this
  // phase, so scoping to it is unambiguous (same as solo-types.spec.ts).
  await page.waitForSelector('form input[type="text"]', { state: 'visible', timeout: 15_000 });
  await page.locator('form input[type="text"]').fill('SH-Slots');
  await page.locator('form button[type="submit"]').click();

  const questions = quiz.questions;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const type = q.type ?? '';
    const isTarget = (TARGET_TYPES as readonly string[]).includes(type);
    // The "question" phase (cooldown) shows question-text first, then
    // SoloAutoAdvance flips to "answering" after `cooldown` seconds — the
    // budget covers that plus network slack.
    const budgetMs = ((q.cooldown ?? 5) + 20) * 1000;

    try {
      await page.waitForSelector(testIdSel('question-text'), { state: 'visible', timeout: 15_000 });
      const shown = await page.locator(testIdSel('question-text')).first().innerText();
      if (q.question && !shown.includes(q.question)) {
        throw new Error(`stale/mismatched question text — expected "${q.question}", got "${shown}"`);
      }

      if (isTarget) {
        if (type === 'drop-pin') {
          await answerDropPin(page, budgetMs);
        } else {
          await answerSlotDropdown(page, type as 'fill-blank' | 'matching', budgetMs);
        }
      } else {
        await passThroughNonTarget(page, q, budgetMs);
        await waitForResultPhaseAndAdvance(page);
      }
    } catch (err) {
      if (isTarget) {
        throw new Error(
          `Q${i + 1}/${questions.length} (${type}) @ ${VIEWPORT.name}: target flow failed — ` +
            `${(err as Error)?.message ?? err}`,
        );
      }
      console.warn(
        `SKIP: pass-through on Q${i + 1}/${questions.length} (${type || 'unknown'}) failed — ` +
          'any target questions after it are unreachable in this run.',
        err,
      );
      return tested;
    }

    if (isTarget) {
      tested.add(type as TargetType);
      console.log(`PASS: ${type} solo flow @ ${VIEWPORT.name} (Q${i + 1}/${questions.length}).`);
      // Early stop once every target type the quiz carries has been tested —
      // the remaining questions are covered by solo-types.spec.ts.
      if ([...quiz.presentTargets].every((t) => tested.has(t))) {
        return tested;
      }
    }
  }
  return tested;
}

async function main() {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) {
    throw new Error('Stagehand did not produce an active page after init()');
  }

  try {
    const quiz = await resolveQuiz(page);
    if (!quiz) {
      console.warn(
        `SKIP: no quiz with fill-blank/matching/drop-pin questions found ` +
          `(id prefix "${QUIZ_ID_PREFIX}" or subject containing "All Types"). ` +
          'All skipped cleanly — exit 0.',
      );
      return;
    }
    console.log(
      `Resolved quiz "${quiz.id}" ("${quiz.subject}", ${quiz.questions.length} questions) — ` +
        `target type(s) present: ${[...quiz.presentTargets].join(', ')}.`,
    );
    for (const t of TARGET_TYPES) {
      if (!quiz.presentTargets.has(t)) {
        console.warn(`SKIP: quiz "${quiz.id}" has no ${t} question — type not tested.`);
      }
    }

    const tested = await playQuiz(page, quiz);
    if (tested.size === 0) {
      console.warn('SKIP: no target type could be tested (see warnings above). All skipped cleanly — exit 0.');
      return;
    }
    console.log(`Done @ ${VIEWPORT.name} (${VIEWPORT.width}x${VIEWPORT.height}): tested ${[...tested].join(', ')}.`);
  } finally {
    await stagehand.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('fill-blank/matching/drop-pin solo spec FAILED:', err);
    process.exit(1);
  },
);

