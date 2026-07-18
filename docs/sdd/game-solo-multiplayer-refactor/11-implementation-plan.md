# 11 — Implementation Plan (Wave DAG)

**Status:** FROZEN · **Source of truth for contracts:** 16-adjudication-log.md · **Baseline:** green @ `dbf2a319c` (pnpm verify + rust gate GO).

> Supersedes an earlier auto-generated draft built on the withdrawn "0-conflicts" adjudication (validate-pin reuse, GameTransport-committed). This version follows the corrected 16: socket-path PIN verify, `emojiPin: string[]`, GameTransport deferred/evidence-gated, host class-select.

Rules for every wave: workers in isolated worktrees; orchestrator merges; per-wave gate = `pnpm verify` + `bash rust/gate.sh` + isolated `cargo test` (rust logic) + e2e (stagehand) + `design-validator` (UI) + locale-gate (`scripts/check-locales.sh` if locale touched); cross-vendor review before merge; ≥2 free-pool writers ⇒ grok wave-review first; merge → push `origin/main` → `razzoozle-rust-cd.timer` auto-deploys → healthz + browser smoke → `routing-outcome record`. Ship each **wave** as one coherent vertical slice (no broken intermediate deploy).

---

## WAVE 1 — Klassenmodus LIVE join (the headline feature)

Ship as ONE slice on branch `wave1-classmode`. Contract (16 §B) is frozen ⇒ server (1A) and TS contract (1B) build in parallel against it.

### 1A — Server enforcement slice (ONE capable Rust worker; coupled logic = single-worker exception)
Lane: `codex-gpt5` (subscription-first, GPT-5.6, trusted path) — fallback `grok-build` → `sonnet-worker`. Worktree. Gate `bash rust/gate.sh` + `cargo test` isolated (`-p no:randomly`, memory `rust-test-isolation-flakes`).
Files (each delta <150 LOC; monolith-guard-safe):
- `rust/protocol/src/player.rs`, `game.rs`: `PlayerLogin{ +student_id: Option<i64>, +emoji_pin: Option<Vec<String>> }`; `SuccessRoom{ +klassen: bool, +roster: Vec<RosterEntry> }`, `RosterEntry{ student_id, display_name, already_joined }`; error constants `INVALID_CREDENTIALS`, `ALREADY_JOINED`.
- `rust/server/src/state/game.rs`: `Game{ +owner_id: i64, +class_id: Option<i64> }`; `klassen_mode() = class_id.is_some()`.
- `rust/server/src/socket/game.rs`: `game:create` sets owner_id (authed host) + class_id (selected class); reject klassen without a class.
- `rust/server/src/state/snapshot.rs`: persist/restore owner_id+class_id (snapshot compat — old snapshots default class_id=None, memory `snapshot-restore-index-rebuild`).
- `rust/server/src/db/classes.rs`: `students_for_class(class_id) -> Vec<{id, display_name}>` (add if missing).
- `rust/server/src/socket/player/login.rs`: `player:join` klassen ⇒ `successRoom` with roster (NO pins, `already_joined` from live game); `player:login` klassen ⇒ resolve studentId∈roster, verify emojiPin via `db::pins::validate`, dual throttle (A9), dedup ALREADY_JOINED (A6), constant-error INVALID_CREDENTIALS (A7); success mints player_token. (no-payload handler pattern: memory `socketioxide-no-payload-handler`.)
- `rust/server/src/http/emoji_pin.rs` (+ route in `http/mod.rs`): `GET /api/emoji-pin-set -> [{emoji,label}]`.
- Inline `#[cfg(test)]`: rostered+correct→ok; wrong-pin→INVALID_CREDENTIALS; non-rostered studentId→INVALID_CREDENTIALS; 2nd active session→ALREADY_JOINED; throttle lockout.
Acceptance: rust gate GO; new cargo tests green; grep-proof verify is CALLED at the join call-site (memory `security-wiring-proof`); no `studentId`/pin in `tracing`; non-klassen join path byte-unchanged.

### 1B — TS contract (parallel to 1A, against 16 §B)
Lane: `or-coder-free` → `ali-coder`. Worktree. Files: `packages/common/src/types/game/*`, `packages/common/src/validators/client-events.ts` (join validators). Add `RosterEntry`, `successRoom.klassen/roster`, `player:login {studentId, emojiPin: string[]}`, error codes. Acceptance: `pnpm --filter @razzoozle/common typecheck` + tests green; no zod `.default()` traps (memory).

### 1C — Client join UI (after 1A+1B on the integration branch)
- **C1 grapheme-util** (`local-coder-ov`/free): extract `splitGraphemes` + emoji-tile from `PinDialog.tsx` into shared `components/emoji/*`; PinDialog keeps working via the shared util.
- **C2 EmojiPinInput** (`cursor-gpt5`/`grok-build` — non-trivial a11y): new `features/game/components/join/EmojiPinInput.tsx` — 4 slots + searchable picker over `GET /api/emoji-pin-set` (search by German label), keyboard + aria per slot, ≥44px, error tied to input. Uses C1. Sends `emojiPin: string[]` copied verbatim from set (A2).
- **C3 PlayerNameSelect** (free coder): new `features/game/components/join/PlayerNameSelect.tsx` — searchable roster listbox, rows ≥44px (verify Leaderboard row geometry first), avatar|name|status|selection order, already-joined greyed.
- **C4 host class-select** (free coder): `ConfigSelectQuizz.tsx` — switch + Klassenauswahl (class picker) grouped; `game:create` sends `class_id`. Toggle geometry deferred to Wave 4 (A11).
- **C5 join-modal-wiring** (`cursor-gpt5`/`sonnet-worker` — integration): wire 5-stage class-mode modal into the real klassen-gated player-join surface (grep `join/Room.tsx` vs `Username.tsx` to confirm, memory `payload-wp-grep-verify-emit-sites`); gated on `successRoom.klassen`; batch name+PIN → `player:login`; non-specific error + keep both fields on retry; reconnect-mid-form state persistence.
- **C6 i18n** (`locale-sync`): all new strings ×6 locales ×namespaces; `scripts/check-locales.sh` green (memory `locale-json-gate`).

### 1D — e2e (after 1C)
- **D1** (`stagehand` skill): `e2e/stagehand/class-mode-join.spec.ts` — rostered+correct→lobby; wrong-pin→non-specific error, fields kept; non-rostered→error; already-joined→greyed/blocked; throttle after N; viewports 390/768/1280. Multi-player via Stagehand contexts (memory `iframe-single-clientid-limit`).

**Wave 1 DoD:** server enforcement live + non-bypassable (grep-proof call-site); client 5-stage flow; PIN never to client/host/logs; dedup + reconnect intact; gate green; e2e green; cross-vendor review clean; deployed + smoked.

### Wave 1b — a11y CRITICALs (small standalone, right after 1)
SOLO-001/002 (toast on solo `check-answer`/`solo-score` failure, `solo.ts:259-276,329-331`) + ACCESS-001 (live-region announce on reveal, `SoloAnswers.tsx:421`). Data-integrity/WCAG blockers, class-mode-independent. Free coders, own WPs.

---

## WAVE 2 — Solo/assignment class-mode security
`assignments.class_id` FK migration; gate `POST /api/quizz/:id/check-answer` on PIN+roster for class-linked assignments; legacy (no class_id) → anonymous allowed. E2E. (06 §3, 14 Wave 2.)

## WAVE 3 — Modularization (evidence-gated, A12)
Type the untyped payloads first (G6/G7/D20: `player:reconnect`, `manager:successReconnect`, `class:*`). Extract genuinely-shared: `usePlayerGameSession` (G9/D14), `HostControlBar` (from GameWrapper god-component), `useAnswerSubmission`, `LeaderboardRow` (D06). Guard D01/D03 intentional splits. `GameTransport` only if a concrete diff proves net simplification. Per-extraction cross-review.

## WAVE 4 — Visual consistency
Token/geometry unification + a11y geometry (ToggleField 28→44, PinInput 40→44) + guardrail fixes (VIS-001 `text-black` Room.tsx:225, VIS-002 SoloNameScreen gradient, D07 medal token drift on SharePage, D08 dialog shells, D09/D10/D11/D12). ScoreBadge (D05), Select (D11), switch (D10) primitives. Baseline+target+diff contact sheets in `artifacts/game-visual-consistency/`. design-validator GREEN gate.

## WAVE 5 — Cleanup + Phase-2 deferrals + endreview
solo_sessions + dead validate-pin + identifier cleanup; Bearer-auth consolidation (if in scope); full e2e matrix (solo per question-type ×3 viewports — memory `e2e-solo-coverage`); Grok+Codex endreview (18); implementation report (17).
