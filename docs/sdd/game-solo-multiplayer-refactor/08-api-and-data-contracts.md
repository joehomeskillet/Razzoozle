---
title: "08 — REST API + Data Model + Shared Contracts"
owner: phase0
status: draft
scope: >
  READ-ONLY inventory of the CURRENT state. No product code changed.
  Sources: rust/server/src/http/*, rust/server/src/db/*, packages/common/src/validators/*,
  packages/common/src/types/*, packages/common/src/openapi/*, db/migrations/*.
---

## 0. Scope note

The Rust HTTP surface is deliberately small: the control plane (game
create/start, theme, AI, moderation, class/student CRUD) runs over ~90
socket.io events (see `docs/rust-port-event-inventory.md`), gated by
`manager:auth`. This doc covers only the plain-REST edge registered in
`rust/server/src/http/mod.rs:router()` (`rust/server/src/http/mod.rs:219-277`)
plus the DB layer and shared contracts that back it.

---

## 1. REST endpoint table

Auth legend: **public** = no auth; **manager-session** = `X-Manager-Token`
header resolved via `db::users::session_user` (any active role, see
`authorize_manager_request`, `rust/server/src/http/mod.rs:98-117`);
**admin-session** = same but `role == "admin"` (`authorize_admin_request`,
`mod.rs:124-141`); **teach-session** = role ∈ {`admin`,`lehrkraft`}
(`role_may_manage_assignments`, `rust/server/src/http/assignments.rs:71-73`);
**bearer-admin** / **bearer-user** = `Authorization: Bearer <token>` variants
used only by `users.rs` (`require_admin_http`/`require_user_http`,
`rust/server/src/http/users.rs:37-74`) — note this is a **second, header-name-
inconsistent auth convention** living next to the `X-Manager-Token` one, see §3;
**dev-key** = `authorize_dev_request` / local `authorize_dev_request` in
`observability.rs`, fail-closed on missing `DEV_API_KEY`.

| Method+Path | Handler (file:line) | Auth | Request type | Response type |
|---|---|---|---|---|
| GET /health, /healthz, /api/v1/health | `http/mod.rs:189-198` | public | — | `HealthResponse{status,ts}` / `"ok"` |
| POST /api/login | `http/login.rs:29` `handle_login` | public (global brute-force throttle) | `LoginRequest{username,password}` (`login.rs:14-17`) | `LoginResponse{token,role,username}` (`login.rs:20-24`) |
| GET /api/users | `http/users.rs:80` `list` | bearer-admin | — | `Vec<db::users::UserDetail>` (`db/users/mod.rs:291-298`) |
| POST /api/users | `http/users.rs:104` `create` | bearer-admin | `CreateUserRequest{username,password,role?}` | `UserResponse{id,username,role}` |
| DELETE /api/users/:id | `http/users.rs:197` `delete_user_handler` | bearer-admin | — | 200 / 400 self-delete / 400 last-admin / 404 |
| POST /api/users/:id/disable, /enable | `http/users.rs:149,172` | bearer-admin | — | 200 |
| POST /api/users/:id/reset-password | `http/users.rs:248` | bearer-admin | `{newPassword}` | 200 (revokes all sessions) |
| POST /api/profile/change-password | `http/users.rs:293` | bearer-user | `{currentPassword,newPassword}` | 200 (revokes all-but-caller sessions) |
| POST /api/submit/:token | `http/submit.rs:31` `handle_submit` | public (token=owner's `submit_token`) | `SubmitRequest{submittedBy,question,category?}` (`submit.rs:18-25`) | 201 / 404 unknown token / 400 invalid / 429 queue-full(200 pending cap) |
| GET /api/achievements | `http/achievements.rs:189` `handle_achievements` | public | — | `{achievements:[MergedAchievement;14]}` |
| GET /api/quizzes | `http/solo.rs:152` `handle_get_quizzes` | public | — | `Vec<String>` (quiz ids) |
| GET /api/quizz/:id/solo | `http/solo.rs:160` `handle_get_quiz_solo` | public, per-IP rate-limited | — | `SoloResponse{subject,questions:[SoloQuestion]}` (solutions/`correct`/`acceptedAnswers` stripped) |
| POST /api/quizz/:id/check-answer | `http/solo.rs:223` `handle_check_answer` | public, per-IP rate-limited | `CheckAnswerRequest{questionIndex,answerId?,answerIds?,answerText?}` | `CheckAnswerResponse{correct,points?,accuracy?,achievements?,poll?}` |
| POST /api/quizz/:id/solo-score | `http/solo.rs:328` `handle_solo_score` | public, per-IP rate-limited | `SoloScoreRequest{playerName,score(ignored),answers?,assignmentId?}` | `SoloScoreResponse{leaderboard:[SoloResultEntry] (top 1000)}` |
| POST /api/assignment | `http/assignments.rs:102` `handle_create_assignment` | teach-session | `CreateAssignmentRequest{quizzId,deadline?,maxAttempts?,requireIdentifier?,showCorrectAnswers?}` | `{id}` |
| GET /api/assignment/:id | `http/assignments.rs:230` `handle_get_assignment` | public | — | `Assignment{id,quizzId,createdAt,deadline?,maxAttempts?,requireIdentifier?,showCorrectAnswers?}` |
| GET /api/assignment/:id/results | `http/assignments.rs:272` | teach-session | — | `{results:[{playerName,score,answeredAt,assignmentId?}]}` |
| POST /api/assignment/:id/validate-pin | `http/assignments.rs:178` `handle_validate_pin` | public, per-(assignment,IP) brute-force guard (3/60s) | `ValidatePinRequest{studentId,pin}` | `ValidatePinResponse{studentToken,expiresAt}` — **token is minted, persisted to `solo_sessions`, then never read anywhere** (§4, gap) |
| GET /api/skeleton/export | `http/skeleton/mod.rs:46` | admin-session (`authorize_manager` local helper, `mod.rs:24-42`, actually role=="admin" despite the name) | — | theme bundle zip/json |
| POST /api/skeleton/import | `http/skeleton/mod.rs:68` | admin-session, body ≤16MiB (`SKELETON_IMPORT_MAX`) | bundle bytes | broadcasts `MANAGER.THEME` via `state.io` |
| POST /api/v1/client-events | `http/client_events.rs:234` `handle_client_events` | public | `ClientEvent` discriminated union (`client_events.rs:22-53`) | 200/204 (sampled logging + `CLIENT_EVENTS_TOTAL` metric) |
| POST /api/plugins/import | `http/plugins.rs:24` `handle_plugin_import` | admin-session, Content-Length pre-check + body cap `PLUGIN_ZIP_MAX_BYTES` | raw ZIP body | `{ok:true,plugin}`; broadcasts `PLUGIN_CONFIG` |
| GET /api/plugins/:id/export | `http/plugins.rs:95` `handle_plugin_export` | admin-session | — | `application/zip` attachment |
| GET /api/v1/observability/events | `http/observability.rs:545` | dev-key | — | socket event catalog |
| GET /api/v1/observability/schema | `http/observability.rs:555` | dev-key | — | JSON Schema for event payloads |
| GET /api/v1/observability/logs/server, /logs/client | `http/logs.rs:277,288` | dev-key | — | ring-buffer log tail (redacted, `logs.rs`) |
| GET /theme/*path | `http/assets.rs:129` | public | — | theme asset bytes |
| GET /plugins/:id/*path | `http/assets.rs:152` | public | — | plugin asset bytes |
| GET /sounds/*path | `http/assets.rs:172` | public | — | sound asset bytes |
| GET /r/:id | `http/result_og.rs:76` `handle_result_og` | public | — | HTML w/ injected OG meta tags (regex `NoExpand`-safe, `result_og.rs:38-52`); 302→`/` if SPA shell missing |
| GET /metrics | `http/metrics.rs:121` | dev-key | — | Prometheus text |
| GET /sw.js, /registerSW.js, /manifest.webmanifest, /media/*, /assets/*, / | `http/static_files.rs` | public | — | SPA/static assets |
| * (fallback) | `static_files::handle_spa_fallback` | public | — | SPA shell |

**Not registered anywhere in `router()`, but fetched by the client:**
`GET /api/openapi.json` — `packages/web/.../ConfigDev/ApiExplorerCard.tsx:55` calls
`withToken("/api/openapi.json")`, and `packages/common/src/openapi/doc.ts` builds
a full `buildOpenApiDoc()` document — but no Rust route serves it and no code
anywhere calls `buildOpenApiDoc()` (`grep -rln buildOpenApiDoc packages/` returns
only `doc.ts` itself). This 404 is independently confirmed live in
`docs/design/manager-uiux-sdd.md:60` (finding F6, Dev-tab). **Dead
export + missing route, same feature, both halves unfinished.**

---

## 2. Data model

All game-relevant persistence is Postgres (`db/migrations/001_initial_schema.sql`
onward); `config/*.json` files are legacy/fallback reads only (see §4). Every
content/result table added `owner_id` in `db/migrations/008_owner_scoping.sql`
(nullable FK → `users.id`, `NULL` = admin-visible unfiltered row) — every DB
function in `db/*.rs` takes `me: Option<i64>` and applies
`WHERE ($1::bigint IS NULL OR owner_id = $1)`, so **the owner filter is
duplicated per-query as a raw SQL string across `classes.rs`, `quizz.rs`,
`catalog.rs`, `results.rs`, `submissions.rs`, `media.rs`, `labels.rs`** rather
than centralized (no view/RLS) — a pattern worth flagging for the
modularization strand, not a bug.

### games / results

| Table | Key columns | Relationships | file:line |
|---|---|---|---|
| `games_config` | `id=1` (enforced single row), `manager_password`, `team_mode`, `join_locked`, `randomize_answers`, `scoring_mode`, `low_latency_enabled`, `low_latency_config JSONB` | — | `db/migrations/001_initial_schema.sql:18-32`; reads via `db/config.rs:14-26,244` |
| `quizzes` | `id safe_id` PK, `subject`, `questions JSONB`, `archived`, `owner_id` | `game_results.quiz_id`→SET NULL, `assignments.quiz_id`→CASCADE, `solo_results.quiz_id`→CASCADE | `db/migrations/001:38-47`, `008:17`; `db/quizz.rs:8-57` (`get_quizzes` → in-memory `HashMap<String,Quizz>`, deserializes `questions` JSONB into `Vec<razzoozle_protocol::quizz::Question>`) |
| `game_results` | `id safe_id` PK, `quiz_id`→SET NULL, `subject`, `date`, `players JSONB`, `questions JSONB` (added `db/migrations/004`), `recap JSONB` (added `003`), `owner_id` | — | `db/results.rs:7-83` |
| `solo_results` | `id safe_id` PK, `quiz_id`→CASCADE, `player_name`, `score`, `answered_at`, `assignment_id text` (added `005_solo_results_assignment_id.sql`, **not** an FK), `owner_id` | logically joined to `assignments.id` by string equality only, no FK constraint | `db/migrations/001:88-99`, `005`; writer `http/solo.rs:458-470`; reader `db/results.rs` N/A — solo results have no `db/solo_results.rs` module, queries are inlined directly in `http/solo.rs:458,473` and `http/assignments.rs:296` (only DB access that bypasses the `db/` module layer) |
| `assignments` | `id safe_id` PK, `quiz_id`→CASCADE, `assigned_to`, `assigned_at`, `metadata JSONB` (holds `deadline`/`maxAttempts`/`requireIdentifier`/`showCorrectAnswers` — no dedicated columns), `owner_id` | `solo_results.assignment_id` (string, unenforced) | `db/migrations/001:200-212`; writer/reader inlined in `http/assignments.rs:162-176,242-249` (also bypasses `db/`) |

### classes / students / emoji-PIN (class-mode-join substrate)

| Table | Key columns | Relationships | file:line |
|---|---|---|---|
| `classes` | `id BIGSERIAL`, `owner_id`→CASCADE, `name` (UNIQUE per owner via 23505 check in `create_class`/`update_class`) | 1:N `class_students` | `db/migrations/011_classes.sql:10-15`; `db/classes.rs:5-32` |
| `students` | `id BIGSERIAL`, `class_id`→SET NULL (legacy, nullable since `014`), `owner_id`→CASCADE, `display_name`, `first_name`/`last_name` (`017`), `birthdate` (`016`), `pin TEXT` (`015`) | M:N via `class_students`; `students_audit` logs name changes | `db/migrations/011:17-23`, `014:34-38`, `015:2`, `016`, `017`; `db/classes.rs:685-776` `create_student` |
| `class_students` | junction, `UNIQUE(class_id,student_id)` | orphan-cleanup trigger **dropped** in `015_student_pins.sql:4-7` ("students are now first-class entities … deletion is explicit only") — supersedes the trigger `014` added | `db/migrations/014:15-21`, `015:4-7` |
| `students_audit` | `student_id`, `actor_id`, `old_display_name`, `new_display_name`, `changed_at` | append-only, written by `db/classes.rs:422-438` `update_student` | `db/migrations/014:41-48` |
| `solo_sessions` | `token TEXT` PK, `assignment_id`→CASCADE, `student_id`→CASCADE, `expires_at`, `used bool` (**never set true anywhere**), `created_at` | intended session for PIN-gated solo assignment play | `db/migrations/015_student_pins.sql:10-18`; **write-only**: `db/pins.rs:44-64` `create_solo_session` INSERTs; `grep -rn solo_sessions rust/server/src` shows **zero SELECT/read** of this table anywhere in the Rust tree — see gap below |
| `labels` / `class_labels` / `quiz_labels` / `media_labels` / `catalog_labels` | global admin-defined tag taxonomy (`labels`), junctions per entity | `db/migrations/018_labels.sql`, `019_class_labels.sql`; `db/labels.rs` |

**Emoji-PIN itself is not a table** — it is a pure code artifact:
`http/emoji_pin.rs:3-105` (`EMOJI_PIN_SET`, 260+ VS16-safe emoji/label pairs),
`generate_pin()/labels_for()/symbols_of()/is_valid_pin()` (`emoji_pin.rs:109-172`).
The PIN *value* is persisted only inside `students.pin` (plain text column,
teacher-visible by design per migration comment). `symbols_of` does
longest-match-first parsing specifically to survive multi-codepoint (VS16)
emoji, consistent with memory `auto_emoji_grapheme_vs16`.

### users / auth

| Table | Key columns | file:line |
|---|---|---|
| `users` | `id BIGSERIAL`, `username UNIQUE`, `password_hash` (argon2), `role` CHECK ∈ {`admin`,`user`,`lehrkraft`} (widened `012_lehrkraft_role.sql`), `active`, `submit_token` (opaque, unique, added `008`) | `db/migrations/007:6-13`, `012`, `008:37` |
| `sessions` | `id BIGSERIAL` PK (surrogate, added `020`), `token_hash` (SHA-256 hex, **raw token never stored** — `020_sessions.sql` migrated off a plaintext-PK design), `user_id`→CASCADE, `expires_at` (7-day TTL), `last_seen` (set at mint only, never updated on hot path) | `db/migrations/007:15-20`, `020` (full rewrite + forward-hash of pre-existing plaintext rows); `db/users/mod.rs:156-236` `mint_session`/`session_user`/`delete_session`/`revoke_user_sessions`. `MAX_SESSIONS_PER_USER=10` enforced by trimming oldest rows on every mint (`users/mod.rs:14,188-197`) — multi-session-per-user is intentional (X2a), not a bug. |

---

## 3. Client↔server contracts

### 3a. Zod validators that actually gate a REST body

Only two validator files gate REST (not socket) traffic end-to-end:

- `packages/common/src/validators/client-events.ts` (`clientEventValidator`,
  a `z.discriminatedUnion`) mirrors `http/client_events.rs:22-53`'s
  hand-written `ClientEvent` enum 1:1 (same 4 variants, same field caps —
  `CAP_SHORT=200`/`CAP_TEXT=2000` in Rust match `SHORT=200`/`TEXT=2000` in
  the zod file, cross-referenced by comment at `client_events.rs:15-16`).
  This is the one contract pair in the codebase with an explicit
  cross-language sync comment.
- `packages/common/src/openapi/doc.ts` imports `soloCheckAnswerRequestValidator`
  and `soloScoreSubmitValidator` (from `validators/solo.ts`) purely to render
  them into the (unserved, §1) OpenAPI JSON Schema — **not** to validate any
  request at runtime.

### 3b. Orphaned / stale validators (found, not used to gate anything)

- `packages/common/src/validators/solo.ts` — `soloScoreSubmitValidator`
  (`solo.ts:12-28`) declares `answers: [{questionIndex, correct:boolean}]`.
  The **actual** wire body the web client sends
  (`packages/web/src/features/game/stores/solo.ts:315-319`) and the Rust
  handler consumes (`http/solo.rs:108-121` `SoloScoreSubmitAnswer`) is
  `{questionIndex, answerId?, answerIds?, answerText?, correct? (ignored,
  SEC-05)}` — **the validator schema is stale relative to the SEC-05
  server-side-rescoring rewrite** (Rust now recomputes score from
  `answerId`/`answerIds`/`answerText` and explicitly ignores the client's
  `correct` flag; the zod schema still only knows the old `correct`-trusting
  shape and doesn't even have the answer fields). `grep -rln
  soloScoreSubmitValidator packages/` shows it is referenced nowhere except
  `openapi/doc.ts`, so nothing currently breaks — but the published OpenAPI
  schema (if it were ever served) would document the wrong request shape.
- `packages/common/src/validators/assignment.ts` (`assignmentValidator`) —
  `grep -rln assignmentValidator packages/` returns only its own file.
  Never imported by the Rust doc generator, the web client, or any test.
- `packages/common/src/types/catalog.ts` `CatalogEntry` (TS, hand-written,
  imports `Question` from `types/game`) vs. `rust/protocol/src/quizz.rs:174-187`
  `CatalogEntry` (Rust, `#[ts(export)]`) — same logical shape (`id`,
  `question`, `tags?`, `source?`, `addedAt`), but **two independent
  hand-maintained definitions**, not generated from one another (see 3c).

### 3c. rust/protocol ts-rs bindings — generated but disconnected

`rust/protocol/src/{quizz,game,manager,player,status,theme,media_ai,results_display}.rs`
derive `#[ts(export)]` (ts-rs) and the crate's `src/bin/export_types.rs`
emits ~140 `.ts` files into `rust/protocol/bindings/` (confirmed: `Question`,
`Quizz`, `QuizzWithId`, `CatalogEntry`, `Label`, etc. all present, one file
per type). **`grep -rln "protocol/bindings" packages/` returns nothing** —
no file under `packages/common` or `packages/web` imports from
`rust/protocol/bindings/`. The hand-written TS source of truth for the web
client is instead `packages/common/src/types/game/index.ts:61-65`, which
derives `Question`/`Quizz`/`QuizzWithId` from the **zod validators**
(`questionValidator`/`quizzValidator` in `validators/quizz.ts`), not from
Rust. So today there are **three parallel definitions of the same
Question/Quizz shape**:
1. `packages/common/src/validators/quizz.ts` (zod, actually enforced by the
   web client and, per `rust-port-event-inventory.md`, intended to gate
   `QUIZZ.SAVE`/`QUIZZ.UPDATE` over the socket layer — the real contract),
2. `rust/protocol/src/quizz.rs` `Question`/`Quizz`/`QuizzWithId` (Rust struct,
   serde-driven, the actual Rust-side wire type), and
3. `rust/protocol/bindings/*.ts` (ts-rs-generated from #2, but unconsumed).

(1) and (2) are kept in sync by hand/by test (`quizz.rs:214-307` has explicit
serde round-trip tests including camelCase field-name assertions like
`disabledTokens`), not by tooling. (3) is dead weight — a generation
pipeline that runs (bindings are present and current-looking) but has no
consumer. **Recommendation for the modularization strand:** either wire
`packages/common` to import from `rust/protocol/bindings/` (retiring the
hand-written duplicates) or delete the `ts-rs`/`export_types` machinery —
not both existing unused.

### 3d. Auth header inconsistency (contract-level, not just a style nit)

Three different bearer-token conventions coexist on the HTTP edge for
what is semantically the same "which logged-in user is this" question:
- `X-Manager-Token: <session token>` — `mod.rs:98-141`, used by
  `assignments.rs`, `skeleton/mod.rs`, `plugins.rs`.
- `Authorization: Bearer <session token>` — `users.rs:37-74`, used only by
  `/api/users*` and `/api/profile/change-password`.
- `?token=<DEV_API_KEY>` query string **or** `X-Manager-Token: <DEV_API_KEY>`
  **or** `Authorization: Bearer <DEV_API_KEY>` — `authorize_dev_request`
  (`mod.rs:152-179`) accepts all three for `/metrics`;
  `observability.rs:484-544` has its own **separate, parallel**
  `authorize_dev_request` implementation (query param first, then header)
  for `/api/v1/observability/*`. Two functions with the identical name in
  the same crate, different signatures, same purpose — confirmed by
  `docs/design/manager-uiux-sdd.md:60` finding F6 ("Auth-Token im
  Query-String" on `/api/openapi.json?token=…`, which per §1 doesn't even
  resolve to a live route).
Both `session_id` mechanisms (`X-Manager-Token` and `Authorization: Bearer`)
resolve to the **same** `db::users::session_user()` lookup underneath — the
inconsistency is header-naming/placement only, not two separate credential
stores, but it means a caller must know per-endpoint which header a given
route expects.

---

## 4. Persisted formats & compat constraints

### 4a. File-based fallbacks (legacy, non-authoritative when DB is configured)

`config/` (bind-mount, symlinked from repo `config/` per memory
`reference_twin-config-mount-snapshot-perms`) still holds
`achievements.json`, `game.json`, `media-manifest.json`, `theme-revisions.json`
and per-entity dirs (`quizz/`, `results/`, `solo-results/`, `submissions/`,
`catalog/`, `theme/`, `theme-templates/`, `assignments/`, `plugins/`,
`state/`). These are read **only as a fallback when `state.db_pool.is_none()`**
— e.g. `http/achievements.rs:189-194` tries DB first via
`crate::db::get_achievements`, falls back to `load_file_overrides()`
(`achievements.rs:148-171`) which validates against a hand-ported zod-parity
`validate_config()` (`achievements.rs:129-146`) and **fails closed to the
hardcoded registry defaults** on any parse/validation error — never partial-
applies a corrupt override file. `db/README.md` still describes a 3-phase
`DATABASE_MODE=file|dual-write|pg-only` rollout and a "Node + Rust dual-write"
model; per the charter (`00-charter.md:24`, "Node-Twin gelöscht") that Node
twin is already gone, so **this README is stale documentation** — the actual
runtime is DB-primary-with-file-fallback, not the described 3-phase rollout.

### 4b. `config/state/registry-rust.json` — crash-recovery snapshot

`state/snapshot.rs:7-8,11-29` — versioned (`SNAPSHOT_VERSION=1`), one file,
path `$CONFIG_PATH/state/registry-rust.json` (deliberately **not**
`registry.json`, to avoid clobbering a co-mounted Node snapshot format —
comment at `snapshot.rs:25-26`). `game_to_snapshot` (`snapshot.rs:36-90+`)
serializes full in-memory `Game` state: `gameId`, `inviteCode`,
`managerClientId`, `ownerUserId`, `hostToken`, `phase` (mapped from
`GamePhase` enum to the same string tags as `GAME.STATUS`'s `Status`, e.g.
`"SHOW_RESULT"`), `quizz`, `players` (with a **separate** `playerTokens` map
reconstructed from `player.player_token` because that field carries
`#[serde(skip)]` for wire safety — snapshot format is intentionally richer
than the socket wire format, not a re-use of it), `lowLatencyConfig`,
`autoMode`, `currentQuestionIndex`, `answerDeadlineAtServerMs`,
`lastManagerStatus`, `selectedModes`. Per memory
`reference_snapshot_restore_index_rebuild`, restore must rebuild every
in-memory lookup index (not just deserialize the list) and the client never
uses `player_token` for auto-rejoin — both are load-bearing constraints on
any change to this format.

### 4c. `solo_results` / assignment PIN flow — the class-mode-join gap

This is the most consequential finding for the charter's item 4
(Klassenmodus-Beitritt, serverseitige Verifikation). Tracing the full
intended flow end-to-end:

1. Manager mints a student PIN — socket-only, `socket/manager/classes.rs`
   (`crate::http::emoji_pin::generate_pin/labels_for/symbols_of`, 11 call
   sites at lines 717-869) — teacher-facing, unrelated to game join.
2. `POST /api/assignment/:id/validate-pin` (`assignments.rs:178-228`)
   checks a submitted PIN against `students.pin`
   (`db/pins.rs:69-95` `validate_student_pin`, constant-shape error so no
   student/PIN-existence oracle), then **mints and persists** a
   `solo_sessions` row + returns `{studentToken, expiresAt}`
   (`assignments.rs:215-227`, `db/pins.rs:44-64`).
3. **Nothing downstream ever reads `solo_sessions` or checks a
   `studentToken`.** `grep -rn "solo_sessions|student_token" rust/server/src`
   shows the only occurrences are the mint site above and the response
   struct field name. `handle_get_quiz_solo`, `handle_check_answer`, and
   `handle_solo_score` (`http/solo.rs:160,223,328`) take no
   `Authorization`/token parameter at all — they are the same fully public,
   IP-rate-limited endpoints used by anonymous solo play.
4. The web client never calls step 2 in the first place:
   `grep -rn "validate-pin|studentToken" packages/web/src` — **zero
   matches**. The only client caller of the assignment flow
   (`packages/web/src/pages/quizz/$id/assignment.$assignmentId.tsx:107-177`)
   does `GET /api/assignment/:id` → `loadQuiz(quizzId)` (same public
   `/solo` endpoint) → on finish, `POST /solo-score` with `assignmentId` —
   **PIN validation is not in this path at all.**
5. `POST /api/assignment` (create) is likewise only ever called from
   `mod.rs`'s route table — no UI component posts to it
   (`grep -rn "api/assignment" packages/web/src` finds only the one GET
   above).

**Net effect:** the "Emoji-PIN + Klassen/Schüler-Datenmodell existiert
bereits" reuse claim in `00-charter.md:25` is accurate for the **data
model** (tables, PIN generation/validation primitives, teacher-side socket
management) but **not** for a working, enforced, UI-reachable class-mode
join flow — that flow has a designed-but-orphaned HTTP scaffold
(`validate-pin` → `solo_sessions` → `studentToken`) with no consumer on
either end (no UI caller, no downstream check). Any new class-mode-join
design should explicitly decide whether to **finish wiring this existing
scaffold** (cheapest: make `/solo`, `/check-answer`, `/solo-score` accept
and verify `studentToken` when an `assignmentId`/PIN-gated context is
present, and add the UI call to `validate-pin`) or **replace it** — but per
the charter's non-goals ("keine PIN-Speicher-Änderung außer zwingend") the
underlying `students.pin` / `solo_sessions` schema itself should very likely
survive; only the missing wiring needs building.

### 4d. Optimistic-locking column present but unused

`db/README.md:101-109` documents a `version INT` column + optimistic-
concurrency pattern (`UPDATE ... SET version = version + 1 WHERE id=$1 AND
version=$2`) as a cross-cutting convention. Every table in
`001_initial_schema.sql` does carry a `version INT DEFAULT 0` column. None
of the `UPDATE` statements actually read in this inventory
(`quizz.rs`, `classes.rs`, `results.rs`, `submissions.rs`, `catalog.rs`,
`media.rs`, `labels.rs`, `config.rs`) reference `version` in their `WHERE`
clause or increment it — every mutation is last-write-wins. Not necessarily
a bug (no evidence of concurrent-edit incidents in memory), but the schema
promises a guarantee the code doesn't provide; worth a decision (wire it up
or drop the column) rather than silent drift.

### 4e. `assignments.metadata` — schemaless JSONB, not dedicated columns

`deadline`, `maxAttempts`, `requireIdentifier`, `showCorrectAnswers` all
live inside one `metadata JSONB` blob (`assignments.rs:146-160` builds it
field-by-field, `assignments.rs:253-257` reads it back with
`.and_then(|v| v.as_i64())` etc., silently `None` on type mismatch —
fail-open on read, not fail-closed). Any future field added here needs no
migration, but also gets no DB-level type/NOT NULL constraint; validation
is entirely at the Rust struct layer on write and best-effort on read.

---

## 5. Summary for downstream SDD docs

- **05-class-mode-join-spec.md** should treat §4c as the primary finding:
  the join/PIN-verification path is unbuilt end-to-end despite the data
  model existing, and must decide finish-vs-replace explicitly.
- **06-security-and-identity.md** should pick up §3d (three auth
  conventions, two `authorize_dev_request` functions) and the `/api/users*`
  bearer-vs-`X-Manager-Token` split as its input.
- **19/21 (modularization)** should pick up §3c (ts-rs bindings pipeline
  unused — decide keep-and-wire vs delete) and §2's repeated raw-SQL
  owner-filter pattern.
