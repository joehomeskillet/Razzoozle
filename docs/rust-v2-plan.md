# Razzoozle Rust Server — v2.0 Plan: Bug-Elimination + Modularization (SSD)

**Status baseline (2026-07-05):** the Rust server is **feature-complete + läuffähig** —
all socket handlers (game loop, all 7 question types, players, auth, quiz-from-disk,
HTTP+solo, game-control, reconnect, themes, results, bots, display, AI/media),
deployed on `:3012`. Verified: boots, full game → FINISHED, **100-player load 0 drops**,
**reconnect-same-name resumes (no duplicate)**. `main` = `01e382f0`.

**Goal:** eliminate all real bugs (both twins) → modularize to a state-of-the-art,
agent-friendly file layout → ship **v2.0**. Order (per user): läuffähig ✓ → **bughunt**
→ **modularization** → **v2.0 release**. Every step gated by `rust/gate.sh` + the real
smokes; every worker in an isolated git worktree; the plan itself vetted by LLM council + fusion.

---

## Part 1 — Bug-Elimination

### 1.0 Confirmed findings (adversarial fusion bughunt, 124 agents, ≥2-vote survivors) + empirical

**7 critical:**
| # | Finding | Twin | Fix |
|---|---|---|---|
| C1 | IDOR — cross-game manager control (START/REVEAL/LEADERBOARD/KICK/NEXT/SKIP/ABORT gate on global `is_logged`, not game ownership) | rust (Node same model) | `is_game_manager(client_id, game_id)` helper on every manager mutation |
| C2 | `SubmissionCategory` enum mismatch: Rust `literature` vs Node `general` | both | align the enum on both twins |
| C3 | Unauthenticated `GAME.CREATE` floods an unbounded games registry (no cap) | rust | active-game cap (Node has it) |
| C4 | Games never evicted → permanent memory leak | rust | TTL/finished-game eviction |
| — | **Reconnect-same-name RESETS score (1100→0)** — empirical, violates user requirement | rust | resume existing player by clientId, keep points/streak |

**8 high:** spoofable `clientId` session key (both), Unicode NFD normalization missing in text-match (both), no per-game player cap (rust), username/avatar no length validation (rust), public solo HTTP endpoints unthrottled (rust), solo-score file unbounded quadratic (rust), `SKIP_QUESTION` swallows `next_or_finish()` error (rust).

**4 medium:** first-correct bonus on practice questions (both), manager AUTH no brute-force throttle (rust), O(N-games) scans on hot paths (rust), `NEXT_QUESTION` drops `next_or_finish()` error via `.ok()` (rust).

> **Note — scoring is NOT broken.** The empirical 100-player test initially showed 0 points; root cause was **test-harness bugs** (wrong event name `player:answer` vs `player:selectedAnswer`, missing `gameId`). Corrected → real 4-question game plays to the end with a real podium (top=2200, 99/100 scored, 0 drops). Server scoring is correct.

> Many rust-only DoS/resource findings are **parity gaps** — the Node twin already has active-game caps, per-game player caps, rate-limited public endpoints, and auth throttling. The port must re-add them.

### 1.1 Finding sources (fused)
1. **Static frontier-fusion bughunt** (`bughunt-twins.js`, running): 6 dimensions —
   concurrency, auth-security, correctness, protocol-parity, resource/DoS, silent-failure —
   each fanned to a frontier finder, then adversarially refuted by 3 distinct-family lenses;
   only ≥2-vote-survivors kept. Covers rust/server + packages/socket (twins).
2. **Background security reviews** (already surfaced, to be verified):
   - **IDOR / cross-game manager control** — manager handlers gate on GLOBAL auth
     (`is_logged`), not per-game ownership (`manager_socket_id`); an authed manager can
     kick/abort/advance ANY game by passing its `gameId`. *(exists on both twins:
     Node `withAuth` is also global.)*
   - **Path-traversal** — `RESULTS.GET_SHARED` / `GET_THEME` read files by a
     client-supplied id (`config/solo-results/<id>.json`); `id="../.."` escapes the dir.
   - **Broken-authentication / insecure-default-credential** — `DEFAULT_MANAGER_PASSWORD="PASSWORD"`
     (matches Node); should refuse to start on the default in prod.
   - **Spoofable session key** — auth keyed on client-supplied `clientId`.
   - **Session-never-revoked** — `logged_clients` cleared by LOGOUT (added) but verify
     disconnect cleanup.
3. **Empirical real-game tests** (green so far): `loadtest-100.cjs` (100 players, 0 drops),
   `smoke-reconnect.cjs` (same-name resume). Extend: reconnect with a **non-zero score**
   (current test scored 0 — retention not strongly proven); kick/abort/bots/display live paths;
   rapid connect/disconnect churn.

### 1.2 Fix approach
- One **fix per finding**, each in an isolated worktree, gated (`rust/gate.sh` GO + smoke
  FINISHED + relevant real-test). Adversarially verify each finding is REAL before fixing.
- **Twin parity:** a bug present in both Rust + Node is fixed in BOTH (the port must not
  diverge). Track which twin(s) each fix touches.
- **Auth hardening (one helper):** add `is_game_manager(client_id, game_id)` (uses existing
  `get_manager_socket_id`) and gate every manager mutation on it — fixes IDOR across all
  handlers in one pattern. Sanitize file-id inputs (reject `/`, `..`) for the file-reading
  handlers. Refuse boot on default password in prod (env flag).

### 1.3 Bug-elimination fleet (agent flood)
Parallel worktree workers, capability-matched: free coders for mechanical fixes, CLI
(cursor/grok) for coupled ones, fusion for design-level auth decisions. Orchestrator
re-gates every return; NO-GO → discard worktree.

---

## Part 2 — Modularization (State-of-the-art SSD)

### 2.1 Problem
`main.rs` is a **2082-line monolith** — the root cause of repeated worker regressions
(wholesale-rewrites deleting prior batches) and the blocker to parallel development.

### 2.2 Target layout — one handler / function per file
```
rust/server/src/
  main.rs              # thin: init tracing, load fixture, build registry+SocketIo,
                       #       axum router, serve. NO handler bodies.
  ctx.rs               # HandlerCtx { registry: Arc<RwLock<GameRegistry>>, io: SocketIo,
                       #             client_id: String } — cuts closure-capture boilerplate.
  socket/
    mod.rs             # register_all(&socket, &ctx) -> calls every handler's register()
    game_create.rs     # game:create
    manager_auth.rs    manager_start_game.rs   manager_reveal.rs
    manager_show_leaderboard.rs  manager_next_question.rs  manager_skip_question.rs
    manager_abort_quiz.rs  manager_adjust_timer.rs  manager_kick_player.rs
    manager_logout.rs  manager_get_theme.rs  manager_submit_question.rs
    manager_add_bots.rs  manager_reconnect.rs
    player_join.rs  player_login.rs  player_selected_answer.rs  player_leave.rs
    player_select_team.rs  player_set_avatar.rs  player_reconnect.rs
    clock_ping.rs  metrics.rs
    display_register.rs  display_pair.rs  display_ping.rs  display_disconnect.rs
    disconnect.rs
  http/
    mod.rs             # router() building the axum Router
    health.rs  quizzes.rs  quiz_solo.rs  check_answer.rs  solo_score.rs
  media_ai.rs          # already modular (keep)
  state/
    mod.rs  registry.rs  game.rs  fixture.rs
  eval/ …              # engine already separate crate
```
~31 socket handler files + 5 HTTP files + state split. Each socket handler file exposes:
```rust
pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::…, move |socket, Data(payload)| { /* body */ });
}
```

### 2.3 Why this is "agent-friendly" (the point)
- **One handler per file** → a worker editing a handler physically cannot delete another
  batch (blast radius = one small file). Kills the wholesale-rewrite failure class.
- **Parallelism unlocked** → N workers edit N disjoint handler files simultaneously, zero
  main.rs merge conflicts.
- **Testable units** → each handler register() is independently reviewable/greppable.
- `gate.sh` markers migrate from `main.rs` line-floor to per-file presence checks.

### 2.4 Execution (parallel, behavior-preserving)
1. **Scaffold** (orchestrator): create `ctx.rs`, `socket/mod.rs`, `http/mod.rs`; extract
   ONE handler as the reference template; gate + smoke GO. Establishes the exact pattern.
2. **Fan out (agent flood):** each worker extracts ONE handler from `main.rs` into its own
   file with the `register()` signature — workers WRITE new files (read the body from
   main.rs), they do NOT mutate main.rs. Disjoint outputs → massively parallel, no conflict.
3. **Integrate (orchestrator):** replace main.rs's inline handler blocks with
   `socket::register_all(&socket, ctx)`; wire `http::router()`. One careful gated edit.
4. **Verify:** `gate.sh` GO + full-game smoke FINISHED + 100-player load + reconnect — the
   refactor is a **no-op on behavior**; any smoke regression blocks it.

---

## Part 3 — v2.0 Release
After bugs fixed (both twins) + modularized + all real-tests green:
- Tag `v2.0` (Rust server = drop-in for Node `packages/socket`, feature-complete).
- Update `rust/README.md`, root `README.md`, `docs/`, and the github.io page (honest
  "Rust rewrite complete, shadow-running" milestone).
- Release notes: what the Rust rewrite delivers (single ~10 MB binary, compile-checked
  state machine, Tauri-ready), the security hardening, the modular layout.
- Shadow cutover stays (Node `:3011` prod, Rust `:3012` preview) until load-parity signed off.

---

## Part 4 — Plan verification
This plan is reviewed by **LLM council** (paid multi-model peer panel) + **fusion-free**
(blind cross-provider panel) BEFORE execution — surfacing gaps, risks, and simpler paths.
Their feedback is folded in below before the fleet is dispatched.

> Council/fusion findings: _(appended after review)_

---

## Review verdict — ADOPTED (supersedes anything above where they conflict)

Vetted by frontier fusion (agy + codex, judge-synthesized, grounded in the repo) + arch (Gemini-3-Pro) + grok. User directive: **"nach empfehlungen vorgehen."** Adopted corrections:

### Auth (merges findings C1-IDOR + H-clientId-spoof + the reconnect bug into ONE correct fix)
- **Server-minted host token.** On `GAME.CREATE` (after password auth) the server mints a CSPRNG token, stores it in the game, returns it to the creating socket. **Every manager mutation** (START/REVEAL/SHOW_LEADERBOARD/NEXT/SKIP/ABORT/KICK/ADJUST_TIMER/…) requires that token, matched to the target game. Global `is_logged` stays only as the "may create games" gate. `is_game_manager(clientId, gameId)` is REJECTED — clientId is client-asserted (`main.rs:363`, Node `manager.ts:18`), so it's security theater.
- **Server-minted player token.** On `player:join` the server mints a per-player token; `player:reconnect` resumes by that token, NOT by clientId. Fixing reconnect to "resume by clientId + keep points" as originally planned would let a spoofer hijack the victim's *live scored* session — strictly worse than today's reset-to-0. clientId is demoted to reconnect/display metadata everywhere (incl. Node HTTP endpoints currently keyed on raw clientId, `manager.ts:49-53`).
- This is a **client-protocol change on BOTH twins** (web login/create/join/reconnect, bots, manager UI, solo HTTP) — the single most underestimated risk. Scope it as such, not "add a helper."
- **Path-traversal:** allowlist `^[A-Za-z0-9_-]+$` on file ids (`safe_asset_id()`), NOT substring-reject `/`+`..`.

### Modularization → DOMAIN modules (NOT one-file-per-handler)
- Group by domain mirroring the Node twin's existing layout: `socket/manager.rs`, `socket/player.rs`, `socket/game.rs`, `socket/results.rs`, `http/mod.rs`. Centralized `require_manager(game_id)` / `safe_asset_id()` / rate-limit guards. 5-6 domain files still give 5-6 disjoint parallel worker lanes (blast-radius rationale preserved) without rippling every ctx change across 31 signatures, and enable side-by-side Rust/Node parity review.
- Prefer **socketioxide-native `State<T>`** (`SocketIoBuilder::with_state`, the `state` feature is already on in Cargo.toml) over a hand-rolled closure-captured HandlerCtx; retained `SocketRef`s can leak.
- (The already-committed `socket/clock_ping.rs` + `metrics.rs` fold into a `socket/lowlatency.rs` domain module during this phase.)

### Ordering (confirmed) + prerequisite
- **Fix in the monolith FIRST, then modularize.** The security fixes are structural (session-token store, TTL eviction task, rate limiters change the shape of shared state); finalize that shape, then extraction is pure behavior-preserving movement gated by the existing real-game CI suite (`ead1e723`). Modularizing first = re-reviewing every moved handler for security AND parity twice.
- **Sanctioned exception:** extract the shared guard helpers (`require_manager`, `safe_asset_id`, rate-limit) into a module FIRST — the fixes need them anyway.
- **Reconnect ↔ eviction interaction:** the TTL/finished-game eviction must explicitly clear player sessions, or "resume indefinitely" reintroduces the memory leak (C4).

### v2.0 tag criteria (was missing)
Tag v2.0 only when: all 20 findings fixed on both twins (or explicitly waived with rationale) · `rust/gate.sh` GO · the full CI real-game suite green (unit + full-game-to-FINISHED + N-player load + reconnect-keeps-score) · domain-modularized · Rust↔Node protocol parity reviewed.

### External validation — actor-kit identity pattern (open-game-collective/actor-kit, MIT)
Independent recon (Sonnet 5) converges with the fusion verdict: **decouple identity from
transport.** Concrete shape to port to axum/socketioxide for the reconnect + auth fix:
- Assign a stable server-minted **PlayerId** (and host token) at join/create — survives the socket.
- Keep a `Sid → PlayerId` side table, rebuilt on every connect; keep score/streak/session state
  keyed by **PlayerId only** (never by socketioxide `Sid` or client-asserted clientId).
- A reconnect = a new socket presenting the same PlayerId/token → the server already holds that
  id's state (resume = full-resend, or checksum + delta later).
- Public/private per-caller context split maps to host/player/spectator projections of one
  authoritative state.
Port the *pattern* (actor-kit is XState/Cloudflare-specific — no dependency). trivia-jam is
AGPL-3.0 → read-only inspiration, and its own JOIN_GAME has a no-dedup double-join bug (don't copy).

---

## External research — fusion-vetted findings (codex+agy+grok), 2 workflows

### ts-rs (eval-ts-rs-leverage) — the bindings are DEAD CODE
Nobody imports `rust/protocol/bindings/`; the frontend/socket use hand-written DUPLICATE types in `packages/common/src/types/**`. ts-rs currently delivers ~none of its value. Ranked fix (all 3 panels agree):
1. **CI freshness gate** (S): `cargo test && git diff --exit-code rust/protocol/bindings/` in `scripts/rust-ci-test.sh` — else Rust type changes merge with stale bindings.
2. **Export the `GameStatus` union + 17 non-exported status-domain types** (S): add `#[derive(TS)] #[ts(export)]` to `GameStatus`, `FinishedData`, all `*Data`, `Status`/`ScoringMode`/`MatchMode`/`RoundRecapKey`; then delete hand-written `common/types/game/status.ts`. The central client state-machine union is currently hand-typed = drift magnet.
3. **`#[ts(optional)]`** (M) on the ~157 `Option<T>` + `skip_serializing_if` fields: today they render `T | null` but serde OMITS the key → should be `T?`. Fixes `null` vs `undefined` mismatches; prerequisite to adopting the bindings.
4. **Make bindings load-bearing** (L): barrel `index.ts`, tsconfig path `@razzoozle/protocol`, delete the hand-written duplicates, repoint imports. Turns ts-rs into the actual single source of truth.

### Quiz-repo recon (5 repos) — top steals
- ⭐ **Actor-pattern game loop** (gahoot, AGPL → clean-room reimplement): one tokio task per game owns GameState; socket handlers `mpsc::send(GameCommand)` instead of `Arc<Mutex>` direct mutation → race-free hot path, deterministic FSM, testable, scales to 200 + reconnect. ~200 LOC. **Addresses our concurrency-dimension findings.** Highest architectural payoff.
- **Auto-advance-when-all-answered** (ClassQuiz, MPL): emit `everyone_answered` + advance once all live players submit → removes host micromanagement, shortens per-round latency. Medium effort, real UX win. We don't have it.
- **Server-anchored answer window + latency scoring** — we already do server-side scoring; `time_sync` clock-calibration deferred to a later wave (server window suffices vs most cheating).
- **Validations (already correct):** server-side scoring (supabase-alt's client-side scoring is the anti-pattern), typed per-event structs → serde-tagged enum via ts-rs, identity-decoupled-from-socket (grihoot/ClassQuiz both have the socket-coupled anti-pattern we just fixed).
- **Skip:** Redis-as-state (we're in-memory; conceptual only for future multi-instance), hand-rolled WS framing, client-side scoring.
