# Razzoozle — Forward Recommendations (post-cleanup, 2026-06-19)

Method: 40-agent read-only analysis — 6 independent lenses (architecture, testing, performance, security, a11y/i18n/UX, DX/CI) → dedup → adversarial ponytail/YAGNI critic per item (KEEP/RESHAPE/KILL) → fusion-free completeness pass. 33 candidates → **23 survived** (12 KEEP, 11 RESHAPE), 10 killed, 3 new gaps the lenses missed. Every item below was verified against the actual files; scopes are the critic's reshaped (smaller/safer) versions. No code changed — operator decides.

## TL;DR — the one theme that matters
The game exposes several **public / unauthenticated endpoints with no caps, throttles, or existence checks**, giving cheap resource-exhaustion / disk-fill / broadcast-amplification vectors. This cluster (1×P0 + 2×P1) is the recommended immediate next wave. Everything else is test-coverage, a11y polish, perf, and CI hygiene.

---

## P0 — do first (security, low effort)

**S0. Gate `/api/quizz/:id/solo-score` on quiz existence + cap entries** — `sec`, effort S, behavior-changing
`handleSoloScore` (http-routes.ts:453-486) calls `assertSafeId` then `appendSoloResult` with **no `getQuizzById` existence check** — unlike its siblings `handleSoloGet`:387 and `handleCheckAnswer`:415 which both verify. `SAFE_ID=/^[A-Za-z0-9_-]+$/` (config.ts:120) is broad, so any attacker-chosen id creates/grows a `config/solo-results/<id>.json` file unbounded → disk fill. Fix: require quiz existence (mirror the siblings) + cap entries per file. Add over-limit tests.

---

## P1 — high value, schedule next

### Unauthenticated abuse surface (from completeness gaps — lenses missed these)
**S1. Player-count cap on lobby join** — `sec`/DoS, effort S
`PLAYER.LOGIN` (handlers/game.ts:145-149) → `Game.join` (game/index.ts:383) → `PlayerManager.join` (player-manager.ts:31-78) validates only username + duplicate clientId. **No room-size limit anywhere.** A held invite code → unlimited joins → in-memory roster growth + O(N) broadcast amplification per join (emits at player-manager.ts:75-76). Add a per-game max-players cap.

**S2. Auth-gate `GAME.CREATE` + registry game cap** — `sec`/DoS, effort S
`GAME.CREATE` (handlers/game.ts:111-123) does only a quizz-existence lookup before `registry.addGame` (registry.ts:71-74, unbounded push) — **no manager-auth check.** Unauthenticated game-creation flood. Add manager-auth gate and/or a global active-game cap.

**T1. Malicious-zip tests for `importPluginZip`** — `test`, effort M
config.ts:2344-2431 is the **only path writing untrusted manager-uploaded ZIP bytes to disk** (via http-routes.ts:538-554). It carries 5 real guards (entry cap :2350, byte caps :2365/:2368, path-traversal :2407-2416, ext-allowlist :2418-2422, resolved-path-inside-dir :2427-2429) — all **untested**, while the sibling `importSkeletonZip` HAS these tests (skeleton.test.ts:134/149/165). Add traversal/oversize/bad-ext cases so a guard regression can't ship silently (no CI lint/test gate today — see CI items).

### Critical untested paths
**T2. Solo `check-answer` + `solo-score` HTTP endpoint tests** — `test`, effort S
handleCheckAnswer (http-routes.ts:398-451) + handleSoloScore (:453-486) have **zero HTTP-path coverage** (existing harness covers only /healthz, /metrics, openapi, GET /solo strip). Untested: questionIndex bounds (:417-420), points=round(1000*base) (:428), the slider sharpshooter gate (:431-440), persist-then-sort leaderboard (:469-477). Pure additive on the existing real-port harness.

**T3. `getSoloResults` corruption-tolerance test** — `test`, effort S
config.ts:2826-2874 has 4 corruption branches (missing→[], non-array→[], per-entry shape reject, JSON.parse throw→[]) + an untested read-modify-write `appendSoloResult`. Pin the defensive contract.

### Client performance
**P-1. Lazy-load the 1.9 MB DiceBear chunk off the universal join path** — `perf`, effort M, mild behavior change
Username.tsx:72 unconditionally calls `generateAvatar()` in the SUCCESS_JOIN handler → dynamic-imports `@dicebear/*` → built chunk `dicebear-*.js` is **1.9 MB** (next-largest is 157 KB). Nearly every joining player downloads 1.9 MB on the hottest path for a cosmetic auto-avatar. Fix: drop the eager call; fetch only when AvatarPicker opens (it already imports generateAvatar). Roster already falls back to initials (common/types/game/index.ts:261). Players who never open the picker get initials instead of an auto-avatar — confirm that trade is acceptable.

### a11y (player answer path — highest-traffic surface)
**A1. Slider answer input: add `aria-label` + `aria-valuetext`** — `ux`, effort S
Answers.tsx:540-549 + SoloAnswers.tsx:343-352 render `<input type="range">` with no aria-label/valuetext; value+unit (kg/%/year) are visual-only. SR users get "slider, 50" with no question context or unit.

**A2. Text-answer input: real accessible name** — `ux`, effort S (RESHAPED)
Answers.tsx:470 + SoloAnswers.tsx:253 are labelled only by `placeholder` (WCAG 4.1.2 anti-pattern). Add `aria-label={t("game:typeAnswerPlaceholder")}` (existing key, all 6 locales) — 2-line change, no new strings.

**A3. Placeholder contrast bump (3 sites)** — `ux`, effort S (RESHAPED)
Answers.tsx:485 + SoloAnswers.tsx:266: `…/40` → `/60` (4.93:1 AA-pass); solo.tsx:172: `placeholder-gray-400` → `gray-500` (4.63:1). Use the AA-passing targets, not the borderline /55.

### DX
**D1. Scope oxlint to ignore `examples/`** — `dx`, effort S (RESHAPED)
Adds one `.oxlintrc.json` override `{ files:["examples/**/*.js"], rules:{ "no-var":"off","object-shorthand":"off","func-names":"off" } }` → clears ~21 of 25 errors (intentional vanilla-JS plugin demo) while keeping no-unused-vars/eqeqeq. Config-only.

---

## P2 — nice-to-have / opportunistic

**Security**
- **S3.** Coarse rate-limit on public solo routes (mirror `checkGlobalSubmissionRate`, server-wide fixed window, 429 over-limit) — http-routes.ts:711-747 are publicly mounted + do sync disk I/O per request. NOT per-key (attacker-controlled).
- **S4.** Brute-force throttle on `MANAGER.AUTH` (manager.ts:674-705 has constant-time compare but no failed-attempt limit). Count failures only, fixed window, reuse the existing sweep — no persistent lockout.
- **S5.** Test the `/r/:id` OG-unfurl handler (http-routes.ts:630-683) — SSR file read + regex HTML injection of `result.subject`/`winner.username` via `injectOg`/`escHtml`; most failure modes of any route, zero tests. (gap)
- **S6.** Upgrade vite ≥8.0.16 — clears HIGH/MODERATE dev advisories. Dev-only (Dockerfile:36 ships prebuilt dist; vite never runs in prod), so not prod-exploitable.
- **S7.** Document the manager-controlled AI `baseUrl` SSRF (ai-provider.ts:111) in the trust-boundary doc (PLUGINS.md:13-15). Doc-only — within the manager-trust boundary, no allowlist code (YAGNI).

**Tests / arch**
- **T4.** `computeTeamStandings` unassigned/invalid-teamId branch (round-manager.ts:2216-2218) — team selection is opt-in, so "joined, never picked" is a normal untested case.
- **T5.** `persistAchievements` localStorage merge + double-fire guard (Result.tsx:35-47/75) — RESHAPED to a unit test of the merge util only (export it; no behavior change); it's the real data source for TrophyGallery + PlayerFinished.
- **AR1.** Extract the 15 pure badge conditions (round-manager.ts:1367-1474) into `game/achievement-eval.ts` — RESHAPED: conditions-only, thresholds resolved at the call site, all counter/recap mutation left in the loop. Maintainability-only, P2 (no user-facing bug; live realtime scoring path; no CI net).

**a11y / i18n**
- **A4.** Label the satellite pair-code input (Room.tsx:195-202, placeholder-only).
- **A5.** Localize the SharePage `navigator.share` English "Standings" fallback (SharePage.tsx:217) — fold into the next i18n edit.

**DX / CI**
- **D2.** Add oxlint to CI — warn-only `oxlint || true` now (both .gitea + .github ci.yml run only types/test/build today, but CONTRIBUTING.md:14 claims `verify` includes lint); flip to blocking after D1 + D3.
- **D3.** Fix the 2 production lint errors (round-manager.ts:930/:1007 `as number`→`!`, both already `.filter(...!==null)`-guarded → byte-for-byte safe).
- **D4.** Reconcile `.gitea` vs `.github` CI — RESHAPED: delete the redundant `.github` mirror (it skips cwebp + the 13 web tests, so its green check masks a socket-test failure), or 3-line-align it.
- **D5.** Pin floating `latest` devDeps — RESHAPED: pin `oxlint` to `^1.69.0` (matches lockfile) so `pnpm update` can't silently cross a major and flip rule sets. (`@stylistic/eslint-plugin@latest` is unused by the oxlint pipeline — pin or remove.)
- **P-2.** Correct the stale "~200-row hot path" comments (Leaderboard.tsx:270/293/415 — server hard-slices to top-5 at round-manager.ts:2600). Opportunistic doc-only, on the next edit.

---

## Considered & rejected (with reason)
- **Break config.ts↔ai-secrets import cycle / slice config.ts into modules** — cycle is one edge but the slice value is relocation-only on working files (same conclusion as the audit's deferral).
- **Dedup streak conditions client↔server** — overstated; the shared logic is the trivial `streak === threshold`; the two sites are structurally different (and answer-eval.ts is a deliberate solo-path duplicate).
- **Read game config once / clientId→answer Map / unify argmax-argmin pickers** — micro-opts; sync reads are cheap, N is small, and the pickers diverge on the parts that matter (per-round cap vs global).
- **Browser e2e smoke** — no infra, and the completeness pass surfaced the real issues without it (HTTP-harness tests give more value per effort here).
- **Drop dead framer-motion vite manualChunks branch** — dead but harmless.
- **Focus-trap on SimControl/DisplayControl popovers** — evidence was partly fabricated (cited a non-existent file path; the real focus-trap shipped in ConfigCatalog.tsx).
- **Align CI `--ignore-scripts` with Docker** — premise undercut by the repo's own config.

## Recommended next action
Implement the **P0 + S1 + S2** security/DoS cluster as one small file-disjoint wave (all effort-S, all in `socket/handlers` + `services/{config,http-routes,registry}`), each behind a test. These are behavior-changing (new guards), so the operator should confirm the limits (max players/game, max active games, entries-per-quiz). The rest can follow as test-coverage and polish waves.

---

## IMPLEMENTATION STATUS (2026-06-19) — branch `feat/health-cleanup-2026-06-19`, NOT pushed

All 23 vetted recommendations implemented across 4 staged, individually-gated waves, **except S6 (deferred, documented)**. Plus the requested **addon skeleton**. Final gate: types ✅ · test ✅ · build ✅ · **lint 0** (from 27 at audit start). Tests: socket 487, web 105 (+29 over the recs work; +54 over the whole engagement).

**Wave A — security/DoS** (`6737dd1`): S0 solo-score quiz-existence + 1000-cap · S1 max 200 players/game · S2 max 100 active games · S3 120/min rate-limit on solo routes · S4 MANAGER.AUTH brute-force throttle (10/60s). All limits are tunable named constants.
**Wave B — tests** (`1c8ca87`): T1 plugin-zip security · T2 solo endpoints (caught+fixed a real 500-vs-404 bug) · T3 getSoloResults corruption+cap · T4 team-standings exclusion · T5 persistAchievements (extracted+tested) · S5 /r/:id OG injection-escaping.
**Wave C — a11y/i18n/perf** (`688d63e`): A1 slider aria · A2 text-input name · A3 placeholder contrast (AA) · A4 Room label · A5 SharePage i18n · P-1 lazy DiceBear (1.9 MB off the join path) · P-2 stale-comment fix.
**Wave D — DX/CI + docs + addon** (`ab1d37f`, this commit): D1 oxlint scopes examples/ · D2 warn-only oxlint in CI · D3 round-manager `as`→`!` · D4 deleted redundant `.github` CI mirror · D5 pinned oxlint · S7 documented the AI-baseUrl SSRF (in-trust-boundary) · **addon skeleton** `examples/plugins/starter/` (plugin.json + ui.js host-API stub + ADDON-SKELETON.md) · lint driven to 0.

**Deferred (1):** **S6** vite ≥8.0.16 — dev-only advisory, not prod-exploitable (prod serves a prebuilt dist; vite never runs there). Bumping risks the build for ~nil security gain; do it in a routine dependency-maintenance pass with full CI.

**Merge:** operator-gated. `razzoozle-cd` only deploys on a `main` push from its separate clone, so the branch is safe at rest.
