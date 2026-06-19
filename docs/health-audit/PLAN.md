# Razzoozle Code-Health Cleanup — Plan v2 (2026-06-19, LOCKED)

Status: **Phases 0–4 complete; implementation (5–8) gated on operator go-ahead.**
Source: read-only audit `wnw73gk04` (10 tracks, 35 findings) → reconciled plan → 5-model review `w45wo2kls` (groq/nv/ms/qw/sf, all *approve-with-changes*) → this revised, locked plan.

## Review outcome (Phase 3) → revisions baked in (Phase 4)
Verdict: structure **endorsed** (wave disjointness holds across W1–W9, gates correct, cross-wave deps verified). Revisions applied below: D9 hard-drop; D1 rewritten (z.input + probe-first + precise paths); C1/C2 de-risked (helper-comove rules); B3 additive-only; A1 export-only; preflight worktree/glob guard; W2 picks up the one real Room.tsx toast; D2 struck; optional registry logger WP added.

## Preflight (Phase 0)
- Branch `main` @ `efd0012`, **0 tracked changes**, no in-progress merge/rebase.
- 15 untracked = inert screenshot/playwright scratch (not touched, not cleaned).
- ⚠ **Stale worktree** `.claude/worktrees/ux-gap-analysis` (7.1M) holds DUPLICATE `packages/**` incl. locale JSON. **Rule: every find/grep/glob in WPs is scoped to `packages/...`; never `.claude/`.** Build scope is safe (per-package tsc/vitest ignore it). (Operator may `git worktree remove` it; not required.)

## Ground truth
- Shipped: `common`, `socket`, `web`; `mcp` host-only (excluded). Gates: `pnpm -r run types`, `pnpm lint` (oxlint), `pnpm test` (vitest, 58 files), `pnpm build`. No knip/ts-prune/depcheck.
- Animation contract `packages/web/src/features/game/animation/presets.ts` present; 100% `motion/react`, no framer-motion/gsap. Deps: 0 unused (clean).

## Scope decisions
**Informational (no action, validated):** J1 (presets exist), J2 (motion-only), J7 (presentation isolated from game logic), C3 (round-manager NOT split — game logic), I-track (no unused deps).
**Hard-dropped:**
- **D9 — audit HALLUCINATION.** All 5 reviewers: zero payment/checkout/billing references anywhere. No payload to fold. Gone.
- B1/B5/B6 (formatter dedup, low value, collision-prone), C5/C6/C8 (no clean boundary), D4 (collides config split), D5/D6/D8 (generated/acceptable casts), G4 (mostly already i18n'd — except one toast, now folded into W2), G5 (unused keys), J6 (manager ad-hoc reduced-motion: functional, large surface, low value), **D2 struck** (cast is correct; H5's test covers safety).
**Merged/promoted:** D10→D3 (same file); E2+J3+J5→one WP (Leaderboard.tsx); H1+H6→one WP (roundRecap.test.ts); B3 & F2 promoted; D7 optional; new **WP-LOG** optional (registry logger).

## Waves (file-disjoint within each wave; sequential between waves)
Worker = **edit files only, no git**; orchestrator runs gates + commits per wave. All paths repo-relative under `packages/`.

### Wave 1 — i18n locale parity (low risk, additive JSON only)
- **WP-G1** `web/src/locales/{es,fr,it,zh}/results.json`: add `playSelf, hostYourOwn, createSticker` (translate from de).
- **WP-G2** `web/src/locales/{es,fr,it,zh}/game.json`: add `achievementBanner.wins, locked, tier.{bronze,silver,gold,diamant}` (from de).
- **WP-G3** `web/src/locales/{en + all}/common.json`: add `back, networkError` (code falls back to German today).
- Gate: `pnpm -r run types`, `pnpm build`, locale key-parity diff (scoped to `web/src/locales`).

### Wave 2 — visible-bug + a11y quick fixes (low risk)
- **WP-F3** `web/src/features/game/components/states/Room.tsx`: (a) restore `focus-visible` ring on kick button (line ~232, match Radix buttons same file); (b) i18n the one hardcoded toast `toast.success("Satellit-Display verbunden")` (line ~66) → `t('manager:satellite.connected')` + add key to `de/manager.json` (+ locales; pattern: DisplayControl uses `manager:satellite.paired`). Single-owner Room.tsx.
- **WP-F7** `web/src/features/game/components/RecapSequence.tsx`: progress-dot ternary (lines ~324-326) currently renders identical class for active+upcoming — make active distinct (e.g. `bg-white` vs `bg-white/40`).
- Gate: types, lint, build.

### Wave 3 — Leaderboard motion/contract fix (low risk, single-owner file) — VALIDATED SAFE
- **WP-E2J3J5** `web/src/features/game/components/states/Leaderboard.tsx`: `layout={!reveal.reduced}` (line ~389); StreakBadge (line ~47) → `reveal.spring` + reduced guard; player-row entry/exit (lines ~390-408) → `reveal.item()/reveal.tween()`; drop hardcoded `y:50`/`0.2`/`0.45`. (Reviewers confirm: SHOW_LEADERBOARD is a between-rounds screen driven by a 1600ms setTimeout — not a per-frame hot path; gating is the correct reduced-motion behavior.)
- Gate: types, build, lint; visual smoke.

### Wave 4 — test coverage A (low risk)
- **WP-B3** `socket/src/services/game/__tests__/helpers.ts` — **ADDITIVE-ONLY**: add any missing reflection helpers (`setStarted/setCurrentQuestion/getCurrentQuestion/getAutoTimer`). **Never rename/remove existing exports** (12 test files import them); **never edit the importer test files**. This keeps it parallel-safe with H1H6.
- **WP-H1H6** `socket/src/services/game/__tests__/round-manager.roundRecap.test.ts`: assert SHOW_ROUND_RECAP interposition (2-q vs 1-q), multi-round `roundRecapShown` reset, idempotency. (`round-manager.ts` read-only.)
- **WP-H2** new `web/src/features/game/utils/swAutoReload.test.ts`: loop guards (refreshing flag, sessionStorage once-flag, isActiveQuestion).
- Gate: `pnpm test`.

### Wave 5 — a11y focus management + i18n labels (medium risk)
- **WP-F1** `web/src/features/quizz/components/CatalogPickerModal.tsx`: focus-trap + initial focus + restore (pattern from MediaPickerModal/ConfigCatalog).
- **WP-F2** `web/src/features/manager/components/SimControl.tsx` + `DisplayControl.tsx`: Tab containment + reliable focus restore (explicit triggerRef).
- **WP-F4** `web/src/features/game/components/CircularTimer.tsx` + `game:timer.remaining` in ALL locales: i18n aria-label.
- **WP-F5** `web/src/pages/party/manager/$gameId.tsx`: progressbar `aria-label` (line ~68).
- **WP-F6** `web/src/pages/quizz/$id/solo.tsx`: gate `SoloAutoAdvance` (line ~470) on `autoAdvance` + manual "start" when off (WCAG 2.2.2).
- Gate: types, build, lint; **re-run locale key-parity** (F4 re-touches game.json); optional `browser-qa` for F1 focus-trap.

### Wave 6 — test coverage B + extract-for-testability (low risk)
- **WP-H4** new `web/src/features/theme/apply.test.ts`: `fetchTheme` 4 fallback paths (vi.stubGlobal fetch).
- **WP-H5** extract `setTokenColor` → `web/src/features/manager/utils/setTokenColor.ts` + test; ConfigTheme.tsx imports it. *Prereq for W9-C4.*
- **WP-H3** `socket/src/services/game/__tests__/pause.test.ts`: pin SHOW_ROOM/SHOW_START/SHOW_PREPARED/WAIT pausable.
- Gate: `pnpm test`.

### Wave 7 — type contract tightening (medium risk) — PROBE-FIRST
- **WP-D1** single-owner `packages/common/src/types/game/socket.ts`. Replace `unknown` C2S payloads (SUBMIT_QUESTION, EDIT_SUBMISSION, QUIZZ.SAVE, CATALOG.ADD/UPDATE) with **`z.input<typeof validator>`** (NOT `z.infer`/`z.output` — `questionValidator`/`catalogAddValidator` have `.transform()` on `solutions`; z.infer is post-transform and would mis-type wire shapes — the documented "transform→required-output breaks literals" trap). EDIT_SUBMISSION has no named validator → type inline `{ id: string; question: z.input<typeof questionValidator> }`.
  - **Step 1 (probe, before editing):** grep every `emit(SUBMIT_QUESTION|EDIT_SUBMISSION|QUIZZ.SAVE|CATALOG.*)` caller (known: QuizzEditorSidebar, QuizzEditorHeader, ConfigSubmissions, ConfigCatalog, ConfigManageQuizz, ConfigAI, SubmitPage) and run `pnpm -r run types` after the type change to enumerate breakers.
  - **Step 2:** for each surfaced compile error — **REPORT it as a finding (real shape bug vs draft-type mismatch); do NOT silently `as`-cast it away.** Only the emit-caller files the probe proves need a *genuine* shape fix join D1's owned set; otherwise keep that event `unknown` and note it.
  - Out of scope: handler-side `payload: unknown` (handlers already `safeParse` — server is safe).
- **WP-D3D10** `packages/socket/src/handlers/game.ts`: replace manual `as {field?:unknown}` casts (lines ~156-158/185-186/359-361/401) with existing zod validators (`achievementsConfigValidator`; inline minimal validator for SET_GAME_CONFIG if none).
- **WP-D7** (optional) `packages/socket/src/services/ai-provider.ts`: tighten optional chaining on API response shape.
- Gate: `pnpm -r run types` (the point), build, test.

### Wave 8 — large-file extractions (medium risk; behavior-preserving, NOT import-path-only)
- **WP-C1** `socket/src/services/config.ts` → `config-plugins.ts`: move the plugin cluster (readPlugins/writePlugins/buildPluginZip/importPluginZip/removePlugin/setPluginConfig/resolvePluginAsset/readPluginManifest/pluginServerPath) **plus `PLUGIN_ASSET_EXT` AND its `.delete('svg')` mutation together** (svg-exclusion security invariant). Co-move plugin-only private helpers. **Re-export from config.ts.** **Keep in the barrel:** `getPath`, `initConfig`, `assertSafeId`, the `hasKey`/ai-secrets consumers, and module-singleton state (`let pendingCount` etc.). **Extracted file must NOT import the config barrel back** (cycle). If clean extraction would force a cycle or a new shared-helpers module → **STOP and report; do not create a new abstraction** (violates no-new-abstractions).
- **WP-C2** `config.ts` → `config-media.ts` (after C1, same owner): media cluster (getMediaList/saveMediaFile/deleteMediaFile/saveEphemeralAvatar/deleteGameAvatars/cleanupStaleAvatars/saveGeneratedImageBytes/saveBackgroundImage/saveSoundFile) + media-only private helpers (decodeDataUrl/mediaFilePath/normalizeMediaStem/upsertMediaMeta/createMediaMeta/ensureMediaDirs/isMediaCategory). Same barrel/cycle rules. If entangled → STOP and report (C2 is optional; C1 is the cleaner win).
- **WP-C7** `web/src/features/game/contexts/socket-context.tsx` → `useClockSync.ts` (independent; named export, zero shared state).
- Gate: `pnpm -r run types` + **`pnpm test` after EACH of C1 and C2 separately** + build.

### Wave 9 — duplication + dead-code + arch polish (low risk)
- **WP-A1** `common/src/validators/plugin.ts`: **remove only the `export` keyword** from `PLUGIN_FORMAT_VERSION`; keep the const (used at line 16 in `.default(...)`). Do NOT inline/delete.
- **WP-B2** new `web/src/features/game/utils/color.ts` `safeHex(hex,fallback)`; replace local HEX_RE in SharePage.tsx, TrophySticker.tsx, PlayerFinished.tsx.
- **WP-B4** new `web/src/features/manager/hooks/useNowSeconds.ts`; replace in DisplayStatusCard.tsx, ConfigDev.tsx.
- **WP-C4** `web/src/features/manager/components/configurations/ConfigTheme.tsx`: extract `ThemeTemplateManager` (after W6-H5).
- **WP-J4** `web/src/features/game/components/AchievementMedal.tsx`: hardcoded `duration: 1.8/2.2` → `DURATION.base * 1.8 / *2.2` (reduced-motion guard already correct).
- **WP-LOG** (optional) `socket/src/services/registry.ts`: route the 19 raw `console.*` through the existing `logger.ts` — **only if `logger` mirrors to console+buffer (verify first); else report and skip** (must stay behavior-preserving; these feed the dev log-download buffer).
- Gate: types, lint, test, build.

## Cross-wave dependencies / single-owner
- W4 B3 additive-only → safe parallel with H1H6 (no serialize needed given the constraint).
- W6 H5 (extract) **before** W9 C4 (ConfigTheme extraction).
- W4 B3 → W6 H3 (both ultimately rely on helpers.ts; additive-only keeps it safe).
- W1 game.json **before** W5 F4 game.json (sequential additive; re-gate parity after W5).
- Within W8: C1 **before** C2 (same file).
- Single-owner files (never co-edited in parallel): `socket.ts` (W7), `round-manager.ts` (read-only in cleanup), `config.ts` (W8 C1→C2), `Leaderboard.tsx` (W3), `Room.tsx` (W2), `ConfigTheme.tsx` (W6 H5 → W9 C4, sequential).

## Execution mechanics
- Branch `feat/health-cleanup-2026-06-19` off `main`; **never push to main until operator-approved merge.**
- CD safe: `razzoozle-cd` deploys from a separate cd-src clone; dev `source/` tree is never reset — no timer stop needed.
- Workers: edit-only, no git, **disjoint files in the warm `source/` tree** (NOT fresh worktrees — host `pnpm install` hangs). Write pool: `or-coder-free`, `or-deepseek-flash`, `ms-coder`, `cerebras-coder`, `cohere-coder`, `nebius-coder`, `qw-coder`, `sf-coder`, `zhipu-coder`, `local-coder-ov`.
- Route block: orchestrator opens `claude-route-override "health-cleanup wN" --ttl 3600` per wave (workers' Write/Edit on `packages/*` also need it open); `--clear` after.
- Per wave: dispatch disjoint WPs in parallel → gates → orchestrator commits the wave → next wave. After all waves: `production-validator` + optional `browser-qa`; then operator-gated merge.

## Out of scope (NOT changing)
Game logic in `round-manager.ts`; new deps; new abstractions beyond `safeHex` + `useNowSeconds` + the two extractions; framer-motion/gsap; any behavior change (all WPs behavior-preserving or additive).
