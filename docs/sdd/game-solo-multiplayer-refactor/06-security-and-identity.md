# 06 — Security and Identity

**Status**: Target state (adjudicated, frozen) · **Owner**: Claude (orchestrator) · **Scope**: Klassenmodus-join security model, session tokens, role isolation, player identity binding, PIN verification, reconnect anti-spoof · **Reference**: Phase-0 baseline (existing docs §05, §05-class-mode-join-spec), charter item #4

---

## CURRENT STATE (Phase-0 Inventory)

### 1. Two-tier secret model: Manager (argon2) + Student (plaintext PIN)

**Manager authentication** (teacher/admin login):
- Password: Argon2-hashed, stored in `sessions.token_hash` (`db/migrations/010_sessions.sql`)
- Session: Server-issued token, 7-day TTL, resolved via `session_user()` helper (`db/users.rs:207-228`)
- Transport: HTTP header `X-Manager-Token` (converted to Bearer token in Phase-2 per §6 of TARGET)
- Sources: `http/login.rs:29-40` (POST /api/login), `db/users.rs` (session + password validation)

**Student emoji-PIN** (class-mode identity secret):
- Storage: **Plaintext** in `students.pin TEXT` column (`db/migrations/015_student_pins.sql:1-2`), comment explicitly states "stored as the emoji string, teacher-visible by design"
- Format: 4-emoji sequence, ~33 bits entropy per symbol (~132 bits total, per `emoji_pin.rs:109-116` generator)
- Generation: `generate_pin()` (`emoji_pin.rs:109-116`) draws 4 unique symbols via `rand::thread_rng()` before any `.await`
- Comparison: Plain string equality (line 92 of `db/pins.rs:92`), NOT constant-time (noted as non-ideal but acceptable given the plaintext storage model)
- Exposure to host/manager: **BY DESIGN, YES** — emitted in plaintext JSON on class management events (`class:createStudent` → `class:studentCreated`, line 742-751 of `socket/manager/classes.rs`)
- Exposure to player/student: **ZERO** — no code path sends PIN to a joining player (this is the G1 blocker)
- Logging: No `tracing::info!/debug!` calls interpolate the raw PIN value anywhere in emoji_pin.rs, assignments.rs, db/pins.rs, or db/classes.rs (grep-verified)

**Brute-force protection (existing but orphaned)**:
- Rate-limiter: `POST /api/assignment/:id/validate-pin` has 3 fails/60s per (assignment, IP) via `RATE_LIMITER.check_pin_rate` (`assignments.rs:184-213`)
- Oracle-prevention: All failure branches (student not found / PIN mismatch / assignment not found) collapse into a single `Err("validation_failed")` (line 93, `db/pins.rs:93`)
- **But**: This endpoint is called by **zero client code** (grep confirms zero hits for `validatePin`/`validate-pin` in packages/web/src) — the entire verify path is dead-end

### 2. Class + student roster data model (fully built, read-only by students)

**Schema**:
- `classes` table (owner_id scoped, `db/migrations/011_classes.sql`)
- `students` table (`display_name`, `first_name`, `last_name`, `owner_id`, `pin`, `birthdate`, `db/migrations/015_student_pins.sql`)
- `class_students` many-to-many junction (`db/migrations/014_class_students_junction.sql`)
- `solo_sessions` table (mints `studentToken` on PIN validation, never read, `db/migrations/015_student_pins.sql:10-18`)

**Server-side roster management** (`db/classes.rs`, 883 LOC + `socket/manager/classes.rs`, 880 LOC):
- Teacher-only CRUD: `class:create`, `class:addStudent`, `class:updateStudent`, `class:getStudents`, `class:regenPin`, etc. — all gated by `ctx.require_user()` (no student-role session type exists)
- Ownership model: Every query takes `me: Option<i64>` where `None` = admin (bypass), `Some(user_id)` = scoped to `owner_id = user_id`
- Non-owning teachers receive `"class not found or not owned"` errors

**Client-side roster UI** (manager-only, zero player exposure):
- All under `packages/web/src/features/manager/components/configurations/klassen/` and `schueler/`
- `StudentPicker.tsx` (pick a student from roster) imported by exactly ONE file: `ConfigKlassen.tsx` (grep-verified)
- Never used by any player-facing page

### 3. Klassenmodus flag: set at game create, never enforced at join

**Current behavior**:
- Game creation: `game:create` accepts optional `selectedModes.klassen: bool` (gated by global `klassen_enabled` config flag, `socket/game.rs:60,77`)
- Storage: Snapshotted onto `Game.selected_modes.klassen` at create time, immutable for the game's life
- Read-back: Surfaced to manager in reconnect/snapshot data (`state/snapshot.rs:82`)
- **But**: Read in exactly **two places server-side** only (grep-verified):
  1. `socket/game.rs:72` — at game creation (stored, then ignored)
  2. `state/snapshot.rs:82` — at reconnect (sent to host dashboard, but no action taken)

**Never read** at join-time:
- `socket/player/login.rs` (`player:join` → `player:login` handlers) never checks `game.selected_modes.klassen`
- Username is free-text validated only for length/shape via `GameRegistry::validate_username` (line 89)
- No PIN, no student-id, no roster check of any kind gates a player join
- Result: Any player (rostered or not, correct PIN or not) can join a "klassen mode" game as if it were ordinary multiplayer

**Client-side**: `klassenEnabled` gates which **question types** are selectable in the editor (Mathematik, Wortarten, Vokabelliste), not a play-time gate

### 4. Player join flow: identical for class-mode and regular multiplayer (no PIN, no roster check)

**Multiplayer join path** (both modes):
1. Player enters 6-digit numeric invite code in `PinInput.tsx` (room code, NOT emoji-PIN) → `PLAYER.JOIN` event
2. Server validates length==6, looks up game by invite code (`socket/player/login.rs:9-51`), emits `game:successRoom`
3. Player enters free-text username (max 20 chars, `Username.tsx:17`, no server-side length cap found) → `PLAYER.LOGIN` event
4. Server validates username/avatar shape only, checks `join_locked` and player-cap, adds player, mints `player_token`, emits `game:successJoin`
5. **No PIN check, no roster query, no class-membership verification anywhere in this path** (G2 blocker)

**Solo assignment play**:
1. Player fetches `GET /api/assignment/:id`, client checks only `deadline` field
2. Player enters free-text name (max 40 chars via `<input>`, default "Anonym") in `SoloNameScreen.tsx`
3. On finish, posts score with only `playerName` (free text) + `assignmentId` (`POST /api/quizz/:id/solo-score`)
4. `solo_results` table stores only `playerName` (raw free-text), never joined against `students` roster
5. **`POST /api/assignment/:id/validate-pin` endpoint exists but is never called** (G3 blocker) — `solo_sessions` table written, never read

### 5. Orphaned PIN verification scaffold

**What exists**:
- HTTP endpoint: `POST /api/assignment/:id/validate-pin` (`http/assignments.rs:178-228`, fully hardened with rate-limiting + oracle-prevention)
- Token mint: Creates `studentToken`, inserts into `solo_sessions` table
- Database schema: `solo_sessions` with columns `id, assignment_id, student_id, token, used, created_at, expires_at` (`db/migrations/015_student_pins.sql:10-18`)

**What doesn't exist**:
- Client-side caller: Zero references to `validate-pin` or `studentToken` anywhere in `packages/web/src` (grep-verified)
- Server-side reader: `solo_sessions` table written but never read (grep confirms `INSERT` at `db/pins.rs:52` only, no `SELECT`)
- No handler validates a `student_token`, no handler flips `used` to `true`
- Complete dead-end: write path with no corresponding read path (G3 blocker)

### 6. Reconnect anti-spoof (sound, no changes needed)

**Current implementation** (`socket/player/session.rs:163-325`):
- `player_token`: Server-issued random, secure, never sent to client at join (only at first `player:login` response)
- `client_id`: Device-level UUID persisted client-side, sent on every handshake
- Reconnect logic: 
  1. Server rejects if player already holds a minted token that doesn't match the reconnecting `client_id` (anti-hijack guard, lines 205-219)
  2. Fallback: If no prior token issued (fresh browser), `client_id` alone is sufficient
  3. No additional PIN re-check needed (reconnect is per-game-session, not per-player-identity)
- Verdict: **Sound design, no security gap** (Phase-0 doc #06 §5 audited this)

### 7. Role isolation gaps

**Currently broken/incomplete**:
- Assignments table has **no `class_id` column** (FK to classes.id) — `db/migrations/013_assignments.sql` shows no such field
- Assignment CRUD gates on `role_may_manage_assignments` (checks `admin`/`lehrkraft` only) but **not class-scoped** — a teacher cannot be prevented from assigning a quiz to a class they don't own (because there's no link)
- Solo assignment play **never verifies** the player is in the assignment's class (even if class_id existed)
- Result: Assignment can be played by anyone with the URL, no roster verification (G5 blocker)

**No student-role session type exists**:
- Roles in codebase: `admin`, `lehrkraft`, generic `user` only (see `assignments.rs:71-73`)
- No `student` role, no `student_token` session artifact that could be validated (G4 blocker)
- A validated emoji-PIN produces nothing — no session, no token type, no scoped permission

### 8. Identifier field: half-wired and discarded

**Current state** (`socket/player/login.rs`):
- `player:login` payload optionally carries an `identifier` field (free-text, intended for tracking per `packages/common/src/validators/assignment.ts:11`)
- Handler extracts it into `_identifier` (underscore-prefix, line 81-84) — read and **immediately discarded**
- Companion config: `require_identifier: Some(false)` hardcoded (line 34), marked TODO: "read from live config file"
- Result: Half-wired feature, never actually implemented for tracking or enforcement (M2 finding in §7 of TARGET)

---

## TARGET STATE (Adjudicated Nov 2026)

### 1. Two-tier secret model: PRESERVE as-is, ENFORCE at join

**Manager/teacher account password** (argon2-hashed, per-manager session token via `sessions.token_hash`) — **no change**. This tier remains for admin and teacher auth.

**Student emoji-PIN** (plaintext, teacher-visible by design, 4-emoji ≈33 bits entropy per `emoji_pin.rs:109-116`) — **no change to storage or hashing**. The CHANGE is: enforcement at player join for class-mode games must verify PIN against the stored plaintext every time.

| | Current | Target | Audit gate |
|---|---|---|---|
| Storage | Plaintext `students.pin TEXT` | **UNCHANGED** | `db/migrations/015_student_pins.sql` — no schema change |
| Verification | **Called by nobody** (HTTP endpoint dead code) | **Called on every `player:join` in class-mode** | `socket/player/login.rs:register_join` + `socket/player/login.rs:register_login` |
| Session artifact | Solo: bare UUID in `solo_sessions.token` (unhashed, unread) | **Discontinue `solo_sessions` table entirely** — use `player_token` pattern from multiplayer (random URL-safe, server-side only) | `db/pins.rs` — delete references to `solo_sessions` |
| Transport | None (player-facing code never sends PIN) | **Client → Server: emoji-PIN sent via socket on `player:join`** | New `player:join` payload field (wire contract in `razzoozle-protocol::game.rs`) |
| Client-side component | **Missing** — no `EmojiPinInput` exists | **Required: build `EmojiPinInput.tsx`** mirroring `PinInput.tsx` structure but rendering 4 emoji glyphs instead of 6 numeric digits | `packages/web/src/components/EmojiPinInput.tsx` — new file |

### 2. Emoji-PIN verification: HARDENED + WIRED INTO JOIN PATH

**Current state** (§1–2 of Phase-0 doc): brute-force throttle (3 fails/60s per assignment+IP) + format gate + path-traversal guard + constant-error-shape oracle-prevention all exist server-side, but the HTTP endpoint is dead code (zero client calls).

**Target state:**

1. **Move verification from HTTP → Socket**
   - Current: `POST /api/assignment/:id/validate-pin` (`http/assignments.rs:178-228`) unused
   - Target: `player:join` handler **queries the class roster** for the joining player by name + PIN (see §3 below), rejects non-membership
   - Rationale: Multiplayer class-mode games join via `player:join` socket event, not HTTP. Assignment solo-play also needs rosters. Socket path consolidates both.

2. **Rosters must be reachable at join-time**
   - Current: Class/student data lives in `db/classes.rs` + `socket/manager/classes.rs` (teacher/admin-only read/write)
   - Target: `player:join` handler queries `db/classes.rs::get_students(owner_id=game.owner_id, class_id=...)` and matches against the player-supplied name + PIN
   - Prerequisite: Game must carry `owner_id` (the teacher who created it). Currently: `Game` struct in `rust/server/src/state/game.rs` has no `owner_id` field. **Add it** (ownership tracking for class-roster validation)
   - Ownership scoping: If `game.klassen_mode == true`, then `player:join` MUST validate (name, PIN) against the game-creator's class roster. If `game.klassen_mode == false`, join proceeds as today (no roster check).

3. **Rate-limit + Oracle prevention**
   - Keep the existing throttle logic from `assignments.rs:184-213` (3 fails/60s per `assignment_id:client_ip`)
   - Extend: also apply per-game throttle (`game_id:client_ip`, lower bound 5 fails/5min if roster lookup fails repeatedly)
   - Keep the constant-error-shape collapse: any of (student not found / PIN mismatch / game not in klassen mode) collapses into a single `Err(PLAYER.JOIN.FAILED.INVALID_CREDENTIALS)` socket event
   - Rationale: "not in klassen mode" is not an enumerable secret, but treat it the same way for consistency

4. **Roster name match semantics**
   - Player supplies: `username` field (free-text, max 20 chars today)
   - Roster contains: `student.display_name` + `student.first_name` + `student.last_name` columns
   - Match rule (target): **Exact match against `display_name`**. If no `display_name` (null in DB after a student edit), fallback to match `first_name` (case-insensitive, stripped whitespace). If still no match, reject.
   - Rationale: Teacher has control over `display_name` (the field they edit in the UI); exact match prevents name-confusion attacks. Fallback to first_name is for backward compat in case a name was never set via the new flow.
   - This is stricter than the current "free-text anything" model but necessary for a secure class-mode.

### 3. Role isolation: ENFORCE assignment↔class link + teacher-only assignment creation

**Current state** (Phase-0 §3):
- Assignments table (`db/migrations/013_assignments.sql`) has **no `class_id` column**
- `http/assignments.rs:71-73` gate is role-based (`role_may_manage_assignments` checks `admin` or `lehrkraft`) but not class-scoped
- Solo play identifies the player by free-text `playerName` only, never checks the assignment against a class or roster

**Target state:**

1. **Assignments belong to classes**
   - Schema change: Add `class_id: i64 NOT NULL` column to `assignments` table (FK to `classes.id`, cascade delete)
   - Server (`db/assignments.rs` + `socket/manager/assignments.rs`): every assignment CRUD operation checks `game.owner_id == current_user_id` AND `assignment.class_id` belongs to the user's classes (via ownership scope at `db/classes.rs`)
   - Prevent: A teacher cannot assign a quiz to a class they don't own

2. **Solo assignment play verifies class membership**
   - `pages/quizz/$id/assignment.$assignmentId.tsx` (currently line ~135-148): add a **server-side roster verification** step before allowing the name-entry screen
   - On `GET /api/assignment/:id`: Server returns the assignment + its linked class + (optional, teacher-only) the roster; client receives assignment metadata
   - On `POST /api/quizz/:quizzId/check-answer` (solo answer submission): Include the `assignmentId` in the payload; server verifies the player's submitted `playerName` matches a student in the assignment's linked class via PIN check (same logic as §2 step 4)
   - Fallback for old flow: If assignment has no `class_id` (pre-migration data), allow anonymous play (no PIN required, current behavior)

3. **Teacher-only role gate**
   - `role_may_manage_assignments` at `http/assignments.rs:71-73` is already scoped to `admin`/`lehrkraft`; no change needed
   - Extend: `admin` can manage *any* assignment; `lehrkraft` can manage only assignments linked to their owned classes

### 4. PIN validation: CALL on every `player:join` for class-mode games + CALL on every solo answer submission for assignment play

**Current state**: Validation endpoint exists but is dead code (0 client calls).

**Target implementation**:

| Scenario | Where verified | Handler | Payload | Gate logic |
|---|---|---|---|---|
| **Multiplayer class-mode join** | `player:join` + `player:login` (two-step) | `socket/player/login.rs:register_join` + `register_login` | Join: `{gameId, username, identifier?, emoji_pin?}`; Login: `{gameId, username, avatar?}` — PIN sent on join, not login | If `game.klassen_mode == true`, PIN + roster name required; else skip |
| **Solo assignment play** | `POST /api/quizz/:id/check-answer` (per-answer submission) | `http/solo.rs:handle_check_answer` (currently line ~390-427) | Extend payload: add `playerName` + `assignmentId` + `emoji_pin` | If `assignment.class_id IS NOT NULL`, validate PIN + roster; else allow anonymous |
| **Reconnect anti-spoof** | `player:reconnect` | `socket/player/session.rs:register_reconnect` | Current: `{gameId, playerToken?, lastServerSeq?}` — **NO change** to reconnect contract, already secure (§5) | Reconnect is per-game-session, not per-player-identity, so no PIN re-check needed; existing token+clientId anti-spoof holds |

### 5. Reconnect security: token + clientId anti-spoof HOLDS AFTER reconnect

**Current state** (Phase-0 §4, verified correct):
- `player_token` minted server-side (random, secure)
- `client_id` persisted client-side (durable UUID)
- Reconnect rejects a client_id fallback if that player already holds a minted token that doesn't match — anti-hijack measure (`socket/player/session.rs:205-219`)

**Target state**: **NO CHANGE**. This model is sound.

**Audit gate**: On every reconnect, server must verify:
1. `game` still exists (not evicted)
2. `player` still in game (not kicked)
3. `player_token` matches (if sent) OR `client_id` is fallback-eligible (no prior token issued, per comment `:205-219`)
4. After bind, emit `PLAYER.SUCCESS_RECONNECT` with current `gameId, status, username, points` — matches current behavior

No additional security gate needed; verify existing code at `socket/player/session.rs:163-325` calls all checks above.

### 6. Auth conventions: CONSOLIDATE to Bearer token in socket handshake

**Current state** (Phase-0 §3, multiple conventions):
1. **Manager session**: HTTP `x-manager-token` header (resolved via `session_user()`) + socket handshake `auth.hostToken` (game-specific, bypasses session lookup)
2. **Player multiplayer**: Socket handshake `auth.clientId` (device-level, no per-session auth)
3. **Satellite/display kiosk**: HTTP `X-Satellite-Token` header + socket handshake `auth.satelliteToken` (currently dead server-side per Phase-0 §6 finding D8)

**Target state (consolidated)**:

| Role | Auth mechanism | Socket handshake | HTTP header | Notes |
|---|---|---|---|---|
| **Manager (quiz editor, game host)** | Session token (7-day TTL, argon2-hashed token_hash in DB) | `auth: { clientId, sessionToken? }` (optional, minted post-login) | `Authorization: Bearer <sessionToken>` on REST calls | Consolidate HTTP + socket to same Bearer token pattern; `hostToken` per-game becomes a second-factor check only (gameId + hostToken match, reject if hostToken stale) |
| **Player (multiplayer game)** | Device + session binding | `auth: { clientId }` (device-level, no token until `player:login`) | (none) | No HTTP auth; post-join, `player_token` stored in localStorage, sent on `player:reconnect` |
| **Solo assignment player** | Name + emoji-PIN (class-mode only) | `auth: { clientId, assignmentId? }` | (none) | PIN sent on first answer submission, not handshake (HTTP POST to `/check-answer`); no socket session needed for solo |
| **Display/satellite kiosk** | TBD — out of scope for this adjudication | — | — | D8 finding notes this is dead code; leave unresolved for separate SDD/WP |

**Rationale for consolidation**:
- Single Bearer token pattern reduces confusion (no "which header?")
- Handshake carries `clientId` (device-level, durable) + optional session token (user-level, temporary)
- HTTP REST calls use same Bearer token as socket handshake (no dual-pathway confusion)
- Backward compat: old `x-manager-token` header still accepted in transition, with deprecation warning

**Implementation order**: Phase-2 (after Klassenmodus-join is stable); not blocking the charter MVP.

### 7. Audit findings: Current vs. Target, Risk Assessment

| Finding | Current risk | Target gate | Mitigation | Implementation WP |
|---|---|---|---|---|
| **C1: Class-mode join path is 0% implemented** | **CRITICAL** — any student (rostered or not, correct PIN or not) can join a class-mode game; no enforcement at all | `player:join` + `player:login` query class roster + validate PIN (§2) | Add `game.owner_id` (game ownership tracking) + roster query at join + PIN verification socket handler | Klassenmodus join WP (charter item #4, wave 1) |
| **C2: Solo assignment play has no roster binding** | **HIGH** — assignment can be played by anyone with the URL + free-text name, no PIN, no class check | `POST /api/quizz/:id/check-answer` validates PIN + roster name (§3) | Add `assignments.class_id` schema + assignment↔class join queries | Solo assignment security WP (charter item #4, wave 1) |
| **C3: `solo_sessions` table is dead code** | LOW — unused, unhashed token stored but never read; moot in practice but technically a DB leak if ever queried via SQL injection | Delete all references (Phase-0 doc §1 item 2) | Cleanup WP: remove `solo_sessions` table, remove `db/pins.rs:51-63` references | Cleanup WP (post-MVP, low priority) |
| **C4: HTTP PIN-verify endpoint not wired** | MEDIUM — orphaned, increases attack surface (extra endpoint, even if unused) | Move verification logic to socket `player:join` (§2); deprecate HTTP endpoint | HTTP endpoint still works (no-op) during transition; emit deprecation log; remove in phase 2 | Auth refactor WP (phase 2, post-MVP) |
| **C5: Satellite token auth is dead** | MEDIUM — D8 finding: satellite route sends 3 auth signals server-side doesn't read; client believes authenticated when not | TBD (out of scope) — leave for separate adjudication (not blocking chart MVPs) | No mitigation in this SDD | Satellite auth WP (phase TBD) |
| **C6: Multiple auth conventions** | MEDIUM — HTTP header vs. socket handshake vs. per-game token creates cognitive load, potential misuse | Consolidate to Bearer token pattern (§6) | Unified handshake + HTTP header; gradual deprecation of old signals | Auth consolidation WP (phase 2, post-MVP) |
| **M1: Player name is not hashed/normalized** | MEDIUM — free-text names can be confusing if similar (e.g. "Alice " vs "Alice"); case sensitivity not defined | Exact-match `display_name`, case-insensitive fallback to `first_name` (§3 step 4) | Server enforces match rule at join; client uses the server-provided `display_name` for display (not user input) | Klassenmodus join WP |
| **M2: `identifier` field is half-wired** | LOW — `player:login` accepts `identifier` but discards it (underscore-prefix); intended for tracking but not implemented | Either (a) implement full `identifier_hash` computation + storage, or (b) delete the field entirely and use `display_name` for tracking | Target: implement (b) — delete half-wired field; use class-roster `student.id` + `display_name` as the tracking key | Phase 2 cleanup WP |

---

## IMPLEMENTATION ROADMAP

### Wave 1: Klassenmodus-join (Charter Item #4, blocking MVP)

1. **WP: Add `game.owner_id` (game ownership tracking)**
   - Files: `rust/server/src/state/game.rs`, `socket/game.rs` (game creation handler), `protocol/game.rs` (Game wire type)
   - Gate: `player:join` must validate `game.owner_id` is set (non-zero) before proceeding
   - Estimate: 1–2 hrs

2. **WP: Schema — Add `assignments.class_id` FK**
   - Files: `db/migrations/018_assignments_class_id.sql` (new migration)
   - Gate: All assignment CRUD requires class ownership check (`assignments.rs` + socket handlers)
   - Estimate: 1 hr

3. **WP: Socket — Move PIN verification to `player:join` handler**
   - Files: `socket/player/login.rs:register_join`, new query in `db/classes.rs`
   - Added handler logic:
     ```rust
     if game.klassen_mode {
       let students = db::classes::get_students(owner_id, game.class_id)?;
       let student = students.iter().find(|s| s.display_name == username)?
         .ok_or("invalid_credentials")?;
       db::pins::validate_student_pin(&student.id, &emoji_pin)?;
     }
     ```
   - Gate: Rate-limiter (3 fails/60s) + oracle prevention (constant-error-shape)
   - Estimate: 2–3 hrs

4. **WP: Client — Build `EmojiPinInput.tsx` component**
   - Files: `packages/web/src/components/EmojiPinInput.tsx` (new), `join/Room.tsx` (conditional render gated on `game.klassen_mode`)
   - Mirrors `PinInput.tsx` structure but renders emoji glyphs + handles grapheme splitting (reuse `Intl.Segmenter` from `features/manager/.../schueler/PinDialog.tsx:19-24`)
   - Gate: E2E test for emoji-PIN entry + validation failure flow
   - Estimate: 2–3 hrs

5. **WP: E2E — Klassenmodus-join test**
   - Files: `source/e2e/class-mode-join.spec.ts` (new)
   - Scenarios: (a) rostered student, correct PIN → join succeeds; (b) rostered student, wrong PIN → rejected; (c) non-rostered name → rejected; (d) brute-force throttle (4th attempt rejected)
   - Gate: All scenarios passing
   - Estimate: 2–3 hrs

### Wave 2: Solo assignment security (Charter Item #4, blocking MVP)

1. **WP: Socket — Extend `POST /api/quizz/:id/check-answer` to validate PIN for assignments**
   - Files: `http/solo.rs:handle_check_answer`
   - Added logic: if `assignmentId` present AND `assignment.class_id` not null, validate PIN + roster
   - Gate: E2E test for solo assignment (correct PIN → score recorded; wrong PIN → rejected)
   - Estimate: 2–3 hrs

2. **WP: E2E — Solo assignment security test**
   - Files: `source/e2e/solo-assignment-security.spec.ts` (new)
   - Scenarios: (a) correct PIN → completes quiz, score recorded; (b) wrong PIN → rejected after first answer; (c) non-rostered name → rejected; (d) assignment with no class_id (legacy) → allows anonymous play
   - Gate: All scenarios passing
   - Estimate: 2–3 hrs

### Phase 2 (Post-MVP): Auth Consolidation + Cleanup

- **WP: Auth consolidation** — Bearer token + deprecate HTTP header (§6)
- **WP: Cleanup** — Delete `solo_sessions` table, remove dead HTTP PIN-verify endpoint, delete `identifier` field

---

## DEFINITION OF DONE (Adjudicated Target)

- [ ] `player:join` in class-mode games queries class roster + validates emoji-PIN before adding player
- [ ] Solo assignment play validates PIN + roster membership before recording score
- [ ] Rate-limiting and oracle-prevention measures in place (3 fails/60s, constant-error-shape)
- [ ] `EmojiPinInput` component built and E2E tested
- [ ] Non-rostered players are rejected with `INVALID_CREDENTIALS` (no name-enumeration oracle)
- [ ] `game.owner_id` tracks the teacher who created the game (ownership scoping enabled)
- [ ] `assignments.class_id` links assignments to classes (class-scoped assignment management enabled)
- [ ] Reconnect anti-spoof (token + clientId validation) verified intact
- [ ] Typecheck, lint, E2E, integration tests all passing
- [ ] Cross-review by Grok (security mindset) and Codex (architecture) completed
- [ ] All High/Medium findings from §7 either implemented or explicitly deferred with rationale
