# 05 — Class-Mode Join Spec

Phase-0 inventory only. This document records the CURRENT state of the
class/student/emoji-PIN + player-join surface, with file:line evidence. It
does not propose target behavior — that is adjudicated later.

## CURRENT STATE

### 1. Two unrelated "join" surfaces exist — do not conflate them

The task brief's assumption that `packages/web/src/pages/submit/index.tsx` is
the player-join page is **incorrect** in the current codebase. There are two
completely separate flows that both involve a "PIN":

| Surface | Purpose | PIN kind | Entry point |
|---|---|---|---|
| **Multiplayer live-game join** | Player joins a running Kahoot-style game | 6-digit **numeric invite code** (room code, not secret) | `features/game/components/join/Room.tsx` → `PinInput.tsx` (`inputMode="numeric"`, regex `/\D/gu` strips non-digits — `PinInput.tsx:73`) |
| **Question submission** | Public visitor submits a quiz question to a manager's moderation queue | none | `pages/submit/index.tsx:1-6` → `features/submission/SubmitPage/SubmitPage.tsx`, backed by `POST /api/submit/:token` (`rust/server/src/http/submit.rs:31`) |
| **Solo assignment play (the actual class-mode-relevant surface)** | Student plays a teacher-assigned quiz solo | 4-**emoji** PIN (student identity secret) — see §2 | `pages/quizz/$id/assignment.$assignmentId.tsx:1-339` |

`PinInput.tsx` is a **numeric** 6-digit widget for the game invite code
(`Room.tsx:18` `PIN_LENGTH = 6`, comment: "Must match the server-side
invite-code validator (length 6)"; digit-filter regex `/\D/gu` at
`PinInput.tsx:68,82`). It has nothing to do with the emoji-PIN system. The
emoji-PIN has no dedicated input widget anywhere in `packages/web` — see §5.

### 2. Emoji-PIN system (class/student identity secret)

- 264-entry emoji set with German labels, defined statically in
  `rust/server/src/http/emoji_pin.rs:3-105` (`EMOJI_PIN_SET`).
- `generate_pin()` (`emoji_pin.rs:109-116`) draws 4 unique symbols via
  `rand::thread_rng()`, called synchronously before any `.await` (comment:
  "Must be called BEFORE any async/await to avoid !Send issues with
  ThreadRng").
- `symbols_of()` / `is_valid_pin()` (`emoji_pin.rs:137-172`) do longest-match
  parsing to survive multi-codepoint VS16 emoji (e.g. `🕷️`) — covered by
  `test_multi_codepoint_pin_parsing` (`emoji_pin.rs:228-250`).
- **Storage: PLAINTEXT, not hashed.** `students.pin` is a bare `TEXT` column
  (`db/migrations/015_student_pins.sql:1-2`, comment: *"Student PIN =
  persistent 4-emoji password (stored as the emoji string, teacher-visible by
  design)"*). `db::classes::create_student` inserts it directly
  (`db/classes.rs:736-744`, `.bind(pin)`).
- **Verification: plain string equality**, not constant-time.
  `db::pins::validate_student_pin` (`db/pins.rs:69-95`) does
  `stored == pin` (line 92) after fetching the stored plaintext PIN and
  checking the assignment exists; both failure branches (student not found /
  assignment not found / pin mismatch) collapse into a single
  `Err("validation_failed")` (line 93) — a deliberate constant-error-shape
  anti-oracle measure, but the comparison itself is not constant-time.
- **Exposure to the host/manager: BY DESIGN, YES.** Every class-management
  socket handler that mints or reveals a PIN emits it back to the manager
  socket in plaintext JSON:
  - `class:createStudent` → `class:studentCreated` includes `"pin": pin`
    (`socket/manager/classes.rs:742-751`).
  - `class:studentPin` → `class:studentPinData` includes `"pin": pin`
    (`socket/manager/classes.rs:793-801`, backfill branch `804-814`).
  - `class:regenPin` → `class:pinRegenerated` includes `"pin": pin`
    (`socket/manager/classes.rs:864-870`).
  All three are gated by `ctx.require_user()` (teacher/admin session only,
  `classes.rs:772-781`, `839-848`) — a student or anonymous player can never
  reach these handlers. This matches the migration comment
  ("teacher-visible by design"): the PIN is a printable/shareable secret the
  teacher hands to the physical student, not a server secret.
- **Exposure to the PLAYER/JOINING client:** never happens today, because
  nothing in the join/solo-play client code ever requests it — see §5 (the
  gap). The dedicated verify endpoint exists server-side
  (`POST /api/assignment/:id/validate-pin`,
  `rust/server/src/http/mod.rs:240` → `assignments::handle_validate_pin`,
  `http/assignments.rs:178-228`) with brute-force throttling (3 fails/60s per
  assignment+IP via `RATE_LIMITER.check_pin_rate`, `assignments.rs:184-213`)
  but it is **called by nobody** — see §5.
- **Logging:** no `tracing::info!/warn!/debug!` call anywhere in
  `emoji_pin.rs`, `assignments.rs`, `db/pins.rs`, or `db/classes.rs`
  interpolates the raw PIN value; the `warn!` calls in
  `socket/manager/classes.rs:778,816,822,845` log only static
  deny/error strings, never the PIN itself. Grep-verified, no hits.

### 3. Classes + student rosters — data model and endpoints

Tables (`db/migrations/011_classes.sql`, `014_class_students_junction.sql`,
`015_student_pins.sql`, `016_student_birthdate_class_name_unique.sql`,
`017_student_names.sql`): `classes` (owner_id-scoped), `students`
(`display_name`, `first_name`, `last_name`, `owner_id`, `pin`, `birthdate`),
`class_students` (many-to-many junction), `solo_sessions` (see §5 — dead
table).

`rust/server/src/db/classes.rs` (883 lines) exposes: `create_class`,
`get_classes` (:36), `get_class` (:88), `update_class` (:122),
`delete_class` (:156, cascades to students via FK), `add_student` (:181),
`get_students` (:223), `remove_student` (:264), `update_student` (:343),
`move_student_to_class` (:447), `remove_student_from_class` (:494),
`get_student_classes` (:543), `list_all_students` (:579),
`can_manage_student`/`can_manage_student_internal` (:645/:657),
`create_student` (:685), `class_get_student_pin` (:778),
`class_set_student_pin` (:806).

Ownership model: every read/write takes `me: Option<i64>` where `None` =
admin (bypasses ownership filter), `Some(user_id)` = scoped to
`owner_id = user_id` (e.g. `db/pins.rs:11`, `classes.rs:708`). Non-owning
teachers get `"class not found or not owned"` /
`"permission denied for one or more classes"` errors, mapped to
`errors:class.classNotOwned` for the client
(`socket/manager/classes.rs:20-27`).

Socket surface — `rust/server/src/socket/manager/classes.rs` (880 lines),
all registered in `register()` (:30-46) and **all gated by
`ctx.require_user()`** (teacher/admin session required, no exceptions
found): `class:list` (:49), `class:create` (:75/119 area), `class:update`
(:120), `class:delete` (:175), `class:addStudent` (:225),
`class:removeStudent` (:290), `class:updateStudent` (:329),
`class:getStudents` (:413), `class:moveStudent` (:443),
`class:removeFromClass` (:513), `class:studentClasses` (:569),
`class:listAllStudents` (:615), `class:createStudent` (:652),
`class:studentPin` (:765), `class:regenPin` (:832).

**All of these are teacher/admin-only management endpoints.** None is
reachable by an unauthenticated player or a student socket — there is no
student-role session type in this codebase at all (roles seen:
`admin`, `lehrkraft`, generic `user` — `assignments.rs:71-73`
`role_may_manage_assignments`).

Client-side, class/student roster UI lives exclusively under
`packages/web/src/features/manager/components/configurations/klassen/`
(`ConfigKlassen.tsx`, `ClassList.tsx`, `useClassManager.ts`,
`StudentPicker.tsx`) and `.../schueler/` (`StudentList.tsx`,
`useSchuelerManager.ts`, `CreateStudentDialog.tsx`) — all under the
**manager** feature tree. `StudentPicker.tsx` (the only component that lets
someone pick a student from a roster) is imported by exactly one file,
`ConfigKlassen.tsx` (grep-verified) — never by any player-facing page.

### 4. `klassen` / Klassen-Modus flag: exists, but is a no-op for join

`game:create` accepts an optional `selectedModes.klassen: bool`
(`packages/protocol` / `SelectedModes`, read at
`rust/server/src/socket/game.rs:72` `req_klassen`), gated by the global
`klassen_enabled` config flag (`socket/game.rs:60,77`). The validated value
is snapshotted onto the game as `g.selected_modes.klassen`
(`socket/game.rs:143-151`) and surfaced back to the manager in the
reconnect/game snapshot (`state/snapshot.rs:82`: `"klassen":
game.selected_modes.klassen`).

**This flag is read in exactly those two places and nowhere else in the Rust
server** (grep-verified across `rust/server/src`: only `game.rs:72` and
`snapshot.rs:82` reference `.klassen`). Specifically:
- `socket/player/login.rs` (`player:login`, the multiplayer join handler)
  reads `game.selected_modes.team_mode` (line 120) but **never reads
  `.klassen`**. Username is free text validated only for length/shape via
  `GameRegistry::validate_username` (`login.rs:89`); no PIN, no student-id,
  no class-roster check of any kind gates a `player:login` call.
- `socket/player/login.rs:81-84` extracts an optional `identifier` field
  from the login payload into `_identifier` — underscore-prefixed, i.e.
  **read and immediately discarded**; comment at line 80 says "#12: Extract
  identifier from payload (for identifierHash computation)" — that hash
  computation does not exist in this file. This is the `requireIdentifier`
  pseudonym feature (Kahoot "identifier" opt-in tracking per
  `packages/common/src/validators/assignment.ts:11`), unrelated to
  class-mode/PIN, and itself only partially wired (also see
  `socket/player/login.rs:34` `require_identifier: Some(false), // TODO(parity):
  read from live config file` — hardcoded `false` today).

Client-side, `klassen`/`klassenEnabled` only gates which **question types**
are selectable in the quiz editor (`QuestionEditorType.tsx:110` comment:
"Gate Mathematik, Wortarten, and Vokabelliste visibility on
klassenEnabled") — an authoring-time UI filter, not a play-time or
join-time gate. The e2e suite documents this directly:
`e2e/answer-flow.spec.ts:394-399,467-470` skips Wortarten-type coverage with
the comment "Wortarten questions are runtime-filtered to class-mode games
only" / "requires class-mode game" — confirming class-mode currently only
constrains *which question types a host can put in a quiz*, not *who may
join as a player*.

Repo-wide grep for `classMode` / `class_mode` / `class-mode` (product code,
excluding this e2e comment) returns **zero hits** — confirmed per the task's
expectation.

### 5. Player JOIN flow — actual current behavior (both modes)

**Multiplayer (`Room.tsx` → `Username.tsx`):**
1. Player enters 6-digit numeric invite code in `PinInput` (`Room.tsx:101-105`),
   emits `PLAYER.JOIN` (`player:join`, `Room.tsx:55`).
2. Server validates length==6 and looks up the game by invite code
   (`socket/player/login.rs:9-51`, `register_join`); emits
   `game:successRoom` with `requireIdentifier` hardcoded to `false`
   (`login.rs:34`, TODO noted above).
3. Player enters a **free-text username** (max 20 chars, `Username.tsx:17`)
   and optional avatar; emits `PLAYER.LOGIN` (`player:login`).
4. Server (`socket/player/login.rs:54-269`, `register_login`) validates
   username/avatar shape only (`login.rs:89-99`), checks `join_locked` and
   player-cap, adds the player, mints a `player_token`, emits
   `game:successJoin` with `{gameId, playerToken}`
   (`login.rs:209-217`). **No PIN, no student identity, no class
   membership check anywhere in this path.**

**Solo assignment play (`assignment.$assignmentId.tsx`, the class-mode-relevant
surface):**
1. Page fetches `GET /api/assignment/:id` (`assignment.$assignmentId.tsx:113`),
   checks only the `deadline` field client-side (`:135-148`).
2. On success, goes straight to `phase === "name"` →
   `NameScreen`/`SoloNameScreen.tsx` (`assignment.$assignmentId.tsx:246-256`):
   a plain `<input type="text" maxLength={40}>` defaulting to
   `"Anonym"` if left blank (`SoloNameScreen.tsx:41`,
   `assignment.$assignmentId.tsx:251`).
3. `startGame()` proceeds directly into quiz play; on finish, `finishGame(id)`
   posts the score with only `playerName` (free text) and `assignmentId`
   (`SoloScoreRequest.player_name`, `solo.rs:125-131`).
4. **`POST /api/assignment/:id/validate-pin` (`assignments.rs:178-228`,
   the emoji-PIN verification endpoint, complete with rate-limiting and a
   `solo_sessions` token mint) is never called from any file under
   `packages/web/src`** — grep for `validate-pin` / `validatePin` /
   `studentToken` across `packages/web/src` returns **zero matches**.
5. The `solo_sessions` table it writes to
   (`db/migrations/015_student_pins.sql:10-18`,
   `db/pins.rs:44-64` `create_solo_session`) is **written but never read**
   anywhere in `rust/server/src` (grep-verified: `solo_sessions` appears only
   once, in the `INSERT` at `db/pins.rs:52`). No handler validates a
   `student_token`, no handler ever flips `used` to `true`. The table is a
   fully wired write path with no corresponding read path — dead end-to-end.
6. `solo_results` (the score-persistence table hit by `finishGame`) has no
   `student_id` column and is never joined against `students`
   (`solo.rs:458-468`: columns are `id, quiz_id, player_name, score,
   answered_at, assignment_id` — `player_name` is the raw free-text string
   from step 2, unrelated to any `students.display_name` row).

**Net effect:** a teacher can build a full class roster with emoji-PIN
identities (§2–3), and can even flag a multiplayer game as "klassen mode"
at creation (§4), but no player-facing code path — solo assignment or live
multiplayer — ever asks a joining user to pick a name from that roster or
enter their PIN. Every join today is anonymous free-text, in both modes.

## TARGET — FROZEN

The class-mode-join target is adjudicated and frozen in **`16-adjudication-log.md` §B** (server contracts + client flow) with the decision matrix in §A, the UX flow in **`13-grok-primary-review.md` §A**, and the server security design in **`06-security-and-identity.md` §TARGET**. Build order + WPs: **`11-implementation-plan.md` Wave 1**.

Headline: live MP class-mode join = **socket** path (`player:join` → `game:successRoom{klassen,roster}` → `player:login{studentId, emojiPin: string[]}` → server verifies name∈roster + PIN against plaintext `students.pin` → `game:successJoin | INVALID_CREDENTIALS | ALREADY_JOINED`). Host selects a class (`game.class_id`); PIN never leaves the server; free-text name cannot bypass (identity = studentId ∈ roster, server-enforced).
