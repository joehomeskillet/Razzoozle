/**
 * e2e/stagehand/admin-self-delete-guard.spec.ts — W6-2 / R2
 *
 * Admin cannot delete own account:
 *   1) API: DELETE /api/users/{self-id} → 400
 *   2) UI: self-row delete action is disabled
 *
 * Run: cd e2e && E2E_PW=… npx tsx stagehand/admin-self-delete-guard.spec.ts
 */
import { newStagehand } from './config';
import type { Page } from '@browserbasehq/stagehand/lib/v3/understudy/page.js';

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://rust.razzoozle.xyz';

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

async function waitForTestId(
  page: Page,
  id: string,
  opts?: { timeout?: number },
) {
  await page.waitForSelector(testIdSel(id), {
    state: 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

async function waitForTestIdPrefix(
  page: Page,
  prefix: string,
  opts?: { timeout?: number },
) {
  await page.waitForSelector(testIdPrefixSel(prefix), {
    state: 'visible',
    timeout: opts?.timeout ?? 15_000,
  });
}

async function managerLogin(page: Page) {
  await page.goto(`${BASE_URL}/manager`);
  await waitForTestId(page, 'login-password');
  await page.locator(testIdSel('login-username')).fill(e2eUsername());
  await page.locator(testIdSel('login-password')).fill(requireE2EPassword());
  await page.locator(testIdSel('login-submit')).click();
  await waitForTestIdPrefix(page, 'quizz-row-');
}

async function run() {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.context.activePage();
  if (!page) {
    throw new Error('Stagehand did not produce an active page after init()');
  }

  // Desktop width so ListRow delete actions (max-sm:hidden) are visible.
  await page.setViewportSize({ width: 1280, height: 800 });

  try {
    await managerLogin(page);

    // Read token + username from session auth state after login.
    const auth = await page.evaluate(() => {
      const raw = sessionStorage.getItem('razzoozle_auth_state');
      if (!raw) return null;
      return JSON.parse(raw) as { token: string | null; username: string | null };
    });
    if (!auth?.token) {
      throw new Error('No razzoozle_auth_state.token after manager login');
    }
    const username = auth.username ?? e2eUsername();

    // Resolve self id via admin users API.
    const self = await page.evaluate(
      async ({ base, token, uname }) => {
        const res = await fetch(`${base}/api/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return { ok: false as const, status: res.status, body: await res.text() };
        }
        const users = (await res.json()) as Array<{ id: number; username: string }>;
        const me = users.find((u) => u.username === uname);
        return { ok: true as const, users, me };
      },
      { base: BASE_URL, token: auth.token, uname: username },
    );

    if (!self.ok) {
      throw new Error(`GET /api/users failed: ${self.status} ${self.body}`);
    }
    if (!self.me) {
      throw new Error(
        `Logged-in user "${username}" not found in /api/users (${self.users.map((u) => u.username).join(', ')})`,
      );
    }

    // API guard: self-delete must be 400.
    const del = await page.evaluate(
      async ({ base, token, id }) => {
        const res = await fetch(`${base}/api/users/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        return { status: res.status, text };
      },
      { base: BASE_URL, token: auth.token, id: self.me.id },
    );

    if (del.status !== 400) {
      throw new Error(
        `Expected DELETE /api/users/${self.me.id} → 400, got ${del.status}: ${del.text}`,
      );
    }
    console.log(`API self-delete guard OK: DELETE /api/users/${self.me.id} → 400`);

    // UI: open Users configuration and assert self delete control is disabled.
    // Nav labels vary by locale (Users / Benutzer / …). Prefer testid if present.
    // Tab label: en "User Management", de "Nutzerverwaltung" (manager:tabs.users).
    // May sit under the System SubGroup — expand group first if collapsed.
    const usersNavClicked = await page.evaluate(() => {
      const byTestId = document.querySelector('[data-testid="nav-users"]') as HTMLElement | null;
      if (byTestId) {
        byTestId.click();
        return 'testid';
      }
      const expanders = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (const el of expanders) {
        const t = (el.textContent ?? '').trim().toLowerCase();
        if (t.includes('system') || t.includes('system')) {
          (el as HTMLElement).click();
        }
      }
      const labels = [
        'user management',
        'nutzerverwaltung',
        'users',
        'benutzer',
        'nutzer',
      ];
      const buttons = Array.from(
        document.querySelectorAll('button, a, [role="tab"], [role="button"]'),
      );
      const match = buttons.find((el) => {
        const t = (el.textContent ?? '').trim().toLowerCase();
        return labels.some((l) => t === l || t.includes(l));
      }) as HTMLElement | undefined;
      if (match) {
        match.click();
        return match.textContent?.trim() ?? 'text';
      }
      // Dump nav text for debugging
      const navTexts = buttons
        .map((b) => (b.textContent ?? '').trim())
        .filter((t) => t.length > 0 && t.length < 40)
        .slice(0, 40);
      return `MISS:${navTexts.join('|')}`;
    });
    if (!usersNavClicked || usersNavClicked.startsWith('MISS:')) {
      throw new Error(`Could not find Users nav entry: ${usersNavClicked}`);
    }

    await waitForTestId(page, 'users-search', { timeout: 15_000 });

    // Prefer exact self-row selection control; fall back to any row showing username.
    const selectId = `user-select-${self.me.id}`;
    await page.waitForSelector(testIdSel(selectId), { state: 'visible', timeout: 15_000 });

    // Scope strictly to the self row via user-select-${id}.
    const deleteState = await page.evaluate(
      ({ selectTestId, uname }) => {
        const storeRaw = sessionStorage.getItem('razzoozle_auth_state');
        let storeUsername: string | null = null;
        try {
          storeUsername = storeRaw ? (JSON.parse(storeRaw).username ?? null) : null;
        } catch {
          storeUsername = null;
        }

        const sel = document.querySelector(`[data-testid="${selectTestId}"]`);
        if (!sel) {
          return { found: false as const, storeUsername, reason: 'no-select' };
        }
        // Walk up until we find a container that has multiple action buttons.
        let row: HTMLElement | null = sel as HTMLElement;
        for (let i = 0; i < 8 && row; i++) {
          const buttons = row.querySelectorAll('button');
          if (buttons.length >= 2 && row.textContent?.includes(uname)) {
            break;
          }
          row = row.parentElement;
        }
        if (!row) {
          return { found: false as const, storeUsername, reason: 'no-row' };
        }
        const buttons = Array.from(row.querySelectorAll('button'));
        // Prefer the DELETE action only (not copy/deactivate — both also self-guarded).
        // Self-delete title (de): "Du kannst dich nicht selbst löschen" / cannot_delete_self.
        // Non-self: aria-label/title is the plain "Delete"/"Löschen" label.
        const delBtn = buttons.find((b) => {
          const label = `${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''}`.toLowerCase();
          if (label.includes('kopieren') || label.includes('copy') || label.includes('deactivat') || label.includes('deaktiv')) {
            return false;
          }
          return (
            label.includes('delete') ||
            label.includes('löschen') ||
            label.includes('loeschen') ||
            label.includes('selbst löschen') ||
            label.includes('cannot delete')
          );
        });
        if (!delBtn) {
          return {
            found: true as const,
            hasDelete: false as const,
            storeUsername,
            buttonTitles: buttons.map(
              (b) =>
                `${b.getAttribute('title') ?? ''}|${b.getAttribute('aria-label') ?? ''}|disabled=${b.disabled}`,
            ).slice(0, 10),
          };
        }
        return {
          found: true as const,
          hasDelete: true as const,
          storeUsername,
          disabled: delBtn.disabled,
          title: delBtn.getAttribute('title') ?? '',
          ariaLabel: delBtn.getAttribute('aria-label') ?? '',
          ariaDisabled: delBtn.getAttribute('aria-disabled'),
          className: delBtn.className,
        };
      },
      { selectTestId: selectId, uname: username },
    );

    if (!deleteState.found) {
      throw new Error(
        `UI: could not locate users row for "${username}" (${JSON.stringify(deleteState)})`,
      );
    }
    if (!deleteState.hasDelete) {
      throw new Error(
        `UI: delete button not found on self row; storeUsername=${deleteState.storeUsername}; seen: ${JSON.stringify(deleteState.buttonTitles)}`,
      );
    }
    if (deleteState.disabled !== true) {
      throw new Error(
        `UI: expected self delete disabled=true, got disabled=${deleteState.disabled} title="${deleteState.title}" storeUsername=${deleteState.storeUsername} ariaLabel="${deleteState.ariaLabel}" class="${deleteState.className}"`,
      );
    }

    console.log(
      `UI self-delete guard OK: delete disabled for "${username}" (title="${deleteState.title}", storeUsername=${deleteState.storeUsername})`,
    );
    console.log('W6-2 admin-self-delete-guard PASSED');
  } finally {
    await stagehand.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error('W6-2 admin-self-delete-guard FAILED:', err);
    process.exit(1);
  },
);
