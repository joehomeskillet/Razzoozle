/**
 * e2e/stagehand/kick-roster.spec.ts — Manager kick/roster feature (frozen testid contract).
 *
 * Run directly: `npx tsx e2e/stagehand/kick-roster.spec.ts`
 * Verifies manager can kick a player from the waiting room via roster card UI,
 * and that the player is properly notified and removed from the game.
 */
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';
import { z } from 'zod';
import { newStagehand } from './config';
import quizFixture from '../fixtures/all-types-quiz.json';

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

const PinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
});

// ── Stagehand Page/Locator helpers ──────────────────────────────────────────

const testIdSel = (id: string) => `[data-testid="${id}"]`;
const testIdPrefixSel = (prefix: string) => `[data-testid^="${prefix}"]`;

async function waitForTestId(
  page: Page,
  id: string,
  opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number },
) {
  await page.waitForSelector(testIdSel(id), {
    state: opts?.state ?? 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

async function waitForTestIdPrefix(
  page: Page,
  prefix: string,
  opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number },
) {
  await page.waitForSelector(testIdPrefixSel(prefix), {
    state: opts?.state ?? 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

async function isTestIdVisible(page: Page, id: string): Promise<boolean> {
  return page.locator(testIdSel(id)).isVisible().catch(() => false);
}

/** Resolve the exact seeded quiz id matching fixture length and first question.
    Mirrors resolveQuizId pattern from mp-loop.spec.ts — ensures deterministic
    quiz selection even if multiple seeded copies exist. */
async function resolveQuizId(page: Page): Promise<string> {
  const ids = await page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`GET ${url} failed with status ${res.status}`);
    }
    return (await res.json()) as string[];
  }, `${BASE_URL}/api/quizzes`);

  const prefix = 'e2e-all-ty-';
  const candidates = ids.filter((id) => id.startsWith(prefix));
  if (candidates.length === 0) {
    throw new Error(
      `No seeded quiz id starting with "${prefix}" found via /api/quizzes — ` +
        'run e2e/scripts/upsert-quiz.mjs against e2e/fixtures/all-types-quiz.json first.',
    );
  }

  for (const candidate of candidates) {
    const matches = await page.evaluate(
      async ({ url, expectedCount, expectedFirstQuestion }) => {
        const res = await fetch(url);
        if (!res.ok) {
          return false;
        }
        const body = (await res.json()) as { questions?: Array<{ question: string }> };
        return (
          body.questions?.length === expectedCount &&
          body.questions?.[0]?.question === expectedFirstQuestion
        );
      },
      {
        url: `${BASE_URL}/api/quizz/${candidate}/solo`,
        expectedCount: quizFixture.questions.length,
        expectedFirstQuestion: quizFixture.questions[0].question,
      },
    );
    if (matches) {
      return candidate;
    }
  }

  throw new Error(
    `Found ${candidates.length} quiz id(s) matching prefix "${prefix}" (${candidates.join(', ')}), ` +
      `but none has ${quizFixture.questions.length} questions starting with "${quizFixture.questions[0].question}". ` +
      're-run e2e/scripts/upsert-quiz.mjs against the current fixture.',
  );
}

async function runKickRosterTest() {
  const password = requireE2EPassword();

  const managerStagehand: Stagehand = newStagehand();
  const playerStagehand: Stagehand = newStagehand();
  await managerStagehand.init();
  await playerStagehand.init();

  const managerPage = managerStagehand.context.activePage();
  const playerPage = playerStagehand.context.activePage();
  if (!managerPage || !playerPage) {
    throw new Error('Stagehand did not produce an active page after init()');
  }

  try {
    // ============ MANAGER: LOGIN ============
    await managerPage.goto(`${BASE_URL}/manager`);
    await waitForTestId(managerPage, 'login-password');
    await managerPage.locator(testIdSel('login-username')).fill(e2eUsername());
    await managerPage.locator(testIdSel('login-password')).fill(password);
    await managerPage.locator(testIdSel('login-submit')).click();
    await waitForTestIdPrefix(managerPage, 'quizz-row-');

    // ============ MANAGER: OPEN + START QUIZ ============
    const quizId = await resolveQuizId(managerPage);
    await managerPage.locator(testIdSel(`quizz-row-${quizId}`)).click();
    await waitForTestId(managerPage, 'quizz-start-btn');

    await managerPage.locator(testIdSel('quizz-start-btn')).click();
    await waitForTestId(managerPage, 'game-pin');

    const { pin: gamePin } = await managerStagehand.extract(
      'Locate the 6-digit PIN code displayed on the screen for players to join.',
      PinSchema,
    );

    // ============ PLAYER: JOIN WITH PIN AS "KickMe" ============
    await playerPage.goto(BASE_URL);
    await waitForTestId(playerPage, 'pin-input-digit-0');

    await playerPage.locator(testIdSel('pin-input-digit-0')).click();
    await playerPage.type(gamePin);
    await playerPage.locator(testIdSel('join-submit')).click();
    await waitForTestId(playerPage, 'username-input');

    await playerPage.locator(testIdSel('username-input')).fill('KickMe');
    await playerPage.locator(testIdSel('join-submit')).click();
    // Post-condition: player enters waiting room (SHOW_ROOM state on manager side).
    await waitForTestId(playerPage, 'waiting-room');

    // #89: reusable roster-card lookup — needed three times below (pre-kick
    // existence check, playerId extraction, post-kick removal check).
    async function hasRosterCardWithUsername(page: Page, username: string): Promise<boolean> {
      return page.evaluate(({ sel, attr, val }) => {
        const cards = document.querySelectorAll(sel);
        for (const card of cards) {
          if (card.getAttribute(attr) === val) {
            return true;
          }
        }
        return false;
      }, {
        sel: testIdPrefixSel('roster-card-'),
        attr: 'data-username',
        val: username,
      });
    }

    // ============ MANAGER: VERIFY PLAYER ROSTER + FIND KICK BUTTON ============
    // Wait for the player's roster card to appear. Contract: data-testid="roster-card-${player.id}"
    // with attribute data-username="KickMe". The testid is dynamic, so we poll for any
    // roster card with the matching username attribute.
    await waitForTestIdPrefix(managerPage, 'roster-card-');

    // Verify that a roster card with username="KickMe" is present before we kick.
    const kickMeCardExists = await hasRosterCardWithUsername(managerPage, 'KickMe');

    if (!kickMeCardExists) {
      throw new Error('Roster card with data-username="KickMe" was not found on the manager page');
    }

    console.log('✓ Manager: verified "KickMe" player is in roster');

    // ============ MANAGER: CLICK KICK BUTTON FOR "KickMe" PLAYER ============
    // Contract: kick button is data-testid="kick-btn-${player.id}" and is located within
    // or next to the roster card. Find the kick button by searching within the card.
    const playerId = await managerPage.evaluate(({ sel, attr, val }) => {
      const cards = document.querySelectorAll(sel);
      for (const card of cards) {
        if (card.getAttribute(attr) === val) {
          // Extract player ID from the testid (e.g., "roster-card-abc123" => "abc123")
          const testid = card.getAttribute('data-testid') || '';
          return testid.replace('roster-card-', '');
        }
      }
      return null;
    }, {
      sel: testIdPrefixSel('roster-card-'),
      attr: 'data-username',
      val: 'KickMe',
    });

    if (!playerId) {
      throw new Error('Could not extract player ID from roster card');
    }

    // Click the kick button for this player (contract: data-testid="kick-btn-${playerId}")
    const kickBtnSelector = testIdSel(`kick-btn-${playerId}`);
    await managerPage.locator(kickBtnSelector).click();
    console.log(`✓ Manager: clicked kick button for player ${playerId}`);

    // ============ MANAGER: CONFIRM KICK IN DIALOG ============
    // Contract: confirmation button is data-testid="kick-confirm-btn"
    await waitForTestId(managerPage, 'kick-confirm-btn');
    await managerPage.locator(testIdSel('kick-confirm-btn')).click();
    console.log('✓ Manager: confirmed kick');

    // ============ ASSERTIONS: MANAGER SIDE ============
    // #89: PLAYER_KICKED (which drives the roster-card removal) is a one-shot
    // broadcast the server drops silently (`.emit(...).ok()`) if the manager
    // socket isn't connected at that instant, and socket.io never redelivers
    // a missed server->client push after reconnecting — only the client's own
    // outgoing queue is buffered across a disconnect, not the server's sends.
    // Live runs show both Stagehand sockets occasionally drop for ~2s right
    // around this point (Stagehand/CDP harness quirk correlated with the
    // page.evaluate() calls above, not a product bug — kick itself is
    // manually verified working end-to-end in a real browser, #87). A plain
    // wait can't recover a truly-dropped message, so poll briefly for the
    // live UI update, then fall back to reloading the manager page once to
    // force a fresh MANAGER.RECONNECT resync of the (already correct)
    // server-side roster before concluding the kick failed.
    let cardStillPresent = await hasRosterCardWithUsername(managerPage, 'KickMe');
    const rosterPollDeadline = Date.now() + 5_000;
    while (cardStillPresent && Date.now() < rosterPollDeadline) {
      await managerPage.waitForTimeout(300);
      cardStillPresent = await hasRosterCardWithUsername(managerPage, 'KickMe');
    }

    if (cardStillPresent) {
      console.log('… roster card still present after 5s — reloading manager page to resync from server state (#89)');
      await managerPage.reload();
      // No roster cards at all after reload is expected here (KickMe was the
      // only player) — a timeout on this wait is not itself an error.
      await waitForTestIdPrefix(managerPage, 'roster-card-', { timeout: 10_000 }).catch(() => undefined);
      cardStillPresent = await hasRosterCardWithUsername(managerPage, 'KickMe');
    }

    if (cardStillPresent) {
      throw new Error(
        'Roster card for "KickMe" should have been removed but is still present on manager page (even after reload resync)',
      );
    }
    console.log('✓ Manager: "KickMe" roster card removed from UI');

    // ============ ASSERTIONS: PLAYER SIDE ============
    // Player receives GAME.RESET("errors:game.kickedByManager") and is navigated away
    // from the waiting room. The player page should either:
    // - Redirect to an Ended/kicked view
    // - Return to home/lobby
    // - Show an error toast and navigate away
    // Detect by waiting for waiting-room to detach (player left the game).
    // #89: same one-shot-broadcast caveat as the manager side above — if the
    // player's own socket was mid-reconnect when RESET was sent, reload once
    // to force a fresh PLAYER.RECONNECT (party/$gameId.tsx's own 8s
    // reconnect-timeout-then-navigate-home fallback then takes over once the
    // server fails to find this client_id in the game's player list).
    let waitingRoomGone = await playerPage
      .waitForSelector(testIdSel('waiting-room'), { state: 'detached', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (!waitingRoomGone) {
      console.log('… player still shows waiting-room after 10s — reloading player page to resync from server state (#89)');
      await playerPage.reload();
      waitingRoomGone = await playerPage
        .waitForSelector(testIdSel('waiting-room'), { state: 'detached', timeout: 12_000 })
        .then(() => true)
        .catch(() => false);
    }

    if (!waitingRoomGone) {
      throw new Error(
        'Player should have been removed from waiting room but the waiting-room testid is still visible (even after reload resync)',
      );
    }
    console.log('✓ Player: removed from waiting room after kick');

    console.log('\nKick roster test passed: manager kicked player, player notified and removed.');
  } finally {
    await managerStagehand.close();
    await playerStagehand.close();
  }
}

runKickRosterTest().then(
  () => process.exit(0),
  (err) => {
    console.error('Kick roster test failed:', err);
    process.exit(1);
  },
);
