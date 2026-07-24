# SDD: Self-Paced / Homework Mode

**Status:** DESIGN (Wave 7) | **Scope-Frozen input:** `docs/wave6-7-sdd.md` R-W7-1  
**Implementation:** Wave 8 only — this document is architecture + flows + effort. Zero product code.  
**Verified against:** `db/migrations/*.sql` (001–022), `rust/server/src/http/assignments.rs`, `rust/server/src/http/solo.rs`, `packages/web/src/pages/quizz/$id/assignment.$assignmentId.tsx`  
**Target LOC:** ≤500 | **Author:** grok-cli (Wave 7)

---

## 1. Problem

Razzoozle already has:

| Capability | Where | Gap |
|---|---|---|
| Solo untimed play | `/api/quizz/:id/solo*`, SoloStore | No class context, no homework lifecycle |
| Assignments API | `POST/GET /api/assignment*` | No `class_id`, no type (`live` vs `self_paced`) |
| Deadline (partial) | `metadata.deadline` JSON + **client-only** check on assignment page | Server does **not** reject late `solo-score` |
| Student PIN + sessions | `students.pin`, `solo_sessions` (mig 015) | Not wired to class-scoped homework list |
| Results by assignment | `GET /api/assignment/:id/results` | No class roster completeness view |

**Teacher need:** assign a quiz to a class with a deadline; students play async; teacher sees who finished and scores.

**Student need:** see open homework in lobby, play solo under that assignment, get locked out after deadline.

---

## 2. User Flows

### 2.1 Teacher — Create Homework

1. Manager → Quiz list → select quiz → **Homework** action (or dedicated Homework tab).
2. Pick **class** (from `classes` owned by teacher).
3. Optional: set **deadline** (datetime local → ms epoch).
4. Optional: `maxAttempts`, `showCorrectAnswers`, `requireIdentifier` (already on create payload).
5. Submit → `POST /api/assignment` with `classId` + `assignmentType: "self_paced"`.
6. Toast + link; homework appears in Manager Results / class view.

### 2.2 Student — Play Homework

1. Opens app lobby (or deep-link `/quizz/:id/assignment/:assignmentId`).
2. Sees **Assigned Homework** section: quiz title, class name, countdown to deadline, Play.
3. Optional PIN gate if student identity required (`solo_sessions` / `validate-pin`).
4. Solo gameplay (existing SoloAnswers path) with `assignmentId` on score submit.
5. Finished → score in `solo_results` linked via `assignment_id`.

### 2.3 Deadline Enforcement

| Layer | Behavior |
|---|---|
| Client (exists) | `assignment.$assignmentId.tsx`: if `deadline < Date.now()` → closed screen |
| Client (new) | Lobby: gray Play button + red timer when expired |
| Server (new, required) | On `POST /api/quizz/:id/solo-score` **and** on assignment start: if assignment has deadline and `NOW() > deadline` → **403** `{ error: "assignment_closed" }` |
| Server (new) | Create/list: do not hide expired by default; teacher filter `status=open|closed` |

Client-only lock is insufficient (students can call the API directly).

---

## 3. Data Model Extensions

### 3.1 Live schema (verified)

```
-- 001_initial_schema.sql
assignments (
  id safe_id PK,
  quiz_id safe_id NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  assigned_to VARCHAR(100),          -- legacy free-text target
  assigned_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',  -- deadline, maxAttempts, requireIdentifier, showCorrectAnswers
  version INT DEFAULT 0,
  created_at, updated_at
)
-- 008_owner_scoping.sql
assignments.owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL

-- 005_solo_results_assignment_id.sql
solo_results.assignment_id text  -- index idx_solo_results_assignment_id

-- 011_classes.sql + 014_class_students_junction.sql
classes (id BIGSERIAL PK, owner_id, name, …)
class_students (class_id, student_id) UNIQUE

-- 015_student_pins.sql
solo_sessions (token PK, assignment_id → assignments, student_id → students, expires_at, used)
```

**Grep proof (Wave 7 verification artifact):**

```
db/migrations/001_initial_schema.sql:200:CREATE TABLE IF NOT EXISTS assignments (
db/migrations/005_solo_results_assignment_id.sql:3:ALTER TABLE solo_results ADD COLUMN IF NOT EXISTS assignment_id text;
db/migrations/008_owner_scoping.sql:20:ALTER TABLE assignments ADD COLUMN IF NOT EXISTS owner_id …
db/migrations/011_classes.sql:10:CREATE TABLE IF NOT EXISTS classes (
db/migrations/014_class_students_junction.sql:15:CREATE TABLE IF NOT EXISTS class_students (
db/migrations/015_student_pins.sql:12:  assignment_id VARCHAR(100) NOT NULL REFERENCES assignments(id) …
```

### 3.2 Proposed migration (Wave 8 — not in this design phase)

```sql
-- 023_assignment_self_paced.sql (name TBD)
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS class_id BIGINT REFERENCES classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'self_paced';

ALTER TABLE assignments
  ADD CONSTRAINT assignments_type_check
  CHECK (assignment_type IN ('live', 'self_paced'));

CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_type_assigned_at
  ON assignments(assignment_type, assigned_at DESC);
```

**YAGNI decisions:**

- Keep `deadline` / `maxAttempts` / etc. in **metadata** (already used by `assignments.rs` L140–153 and the assignment play page). Do **not** promote to columns unless a reporting query proves it necessary.
- Do **not** change `solo_results` (already has `assignment_id`).
- `assigned_to` stays for legacy free-text; new class-scoped homework uses `class_id`.

### 3.3 Metadata keys (canonical)

| Key | Type | Notes |
|---|---|---|
| `deadline` | i64 ms epoch | Optional; server + client enforce |
| `maxAttempts` | i32 | Optional; enforce in Wave 8 if product needs it |
| `requireIdentifier` | bool | PIN / name path |
| `showCorrectAnswers` | bool | Solo feedback after submit |

---

## 4. Server Architecture

### 4.1 Existing (reuse)

| Endpoint / module | Path | Role |
|---|---|---|
| Create | `POST /api/assignment` | `handle_create_assignment` — role gate admin\|lehrkraft |
| Get | `GET /api/assignment/:id` | Returns deadline from metadata |
| Results | `GET /api/assignment/:id/results` | Joins `solo_results` by `assignment_id` |
| PIN | `POST /api/assignment/:id/validate-pin` | Issues `solo_sessions` token |
| Solo score | `POST /api/quizz/:id/solo-score` | Accepts optional `assignmentId` |
| Auth | `role_may_manage_assignments` | SEC-X2a |

**Source refs:**

- `rust/server/src/http/assignments.rs` (struct `Assignment`, create/get/results/PIN)
- `rust/server/src/http/solo.rs` (`assignment_id` on score insert)
- `rust/server/src/http/mod.rs` routes ~209–212

### 4.2 Extensions (Wave 8)

1. **Create body:** add `classId?: number`, `assignmentType?: "live" | "self_paced"` (default `self_paced`).
2. **Validate:** `class_id` must exist and `classes.owner_id` matches session user (or admin).
3. **List for student/lobby:** new `GET /api/assignments?classId=` or `GET /api/classes/:id/assignments` (open only for students; full for teacher). Prefer one list endpoint over socket spam.
4. **Deadline on score:** in `handle_solo_score`, if `assignment_id` set → load assignment metadata → reject if past deadline.
5. **Results enrichment (optional L):** join class roster → mark missing students as not-started.

### 4.3 Socket events

Parent SDD suggested `manager:createHomework` / `player:startHomework`.  

**Recommendation (YAGNI):** stay on **HTTP** for create/list/score (already there). Socket only if live manager needs push “new homework” to open lobby clients. Defer sockets to a follow-up unless lobby already has a durable subscription pattern for config.

---

## 5. Client Architecture

### 5.1 Existing

- `packages/web/src/pages/quizz/$id/assignment.$assignmentId.tsx` — load assignment, client deadline, Solo flow, `setAssignmentId` → score path.
- Solo store: `assignmentId` plumbing already present.

### 5.2 New / extend (Wave 8)

| Surface | Change |
|---|---|
| Manager create UI | Class picker + deadline datetime + create → existing POST |
| Manager results | Class-filtered homework list; reuse results endpoint |
| Player lobby | Section **Assigned Homework**: title, countdown, Play → deep-link |
| Assignment page | Keep closed screen; add mid-play expiry toast if deadline hits during session (soft) |

**Non-goal for UI:** full LMS gradebook, multi-class batch assign, email notify.

---

## 6. Deadline Enforcement (detail)

```
Create:  deadline optional, ms UTC epoch in metadata
Start:   GET assignment → client gate (exists)
Play:    solo as today
Submit:  solo-score WITH assignmentId
         → server: SELECT metadata FROM assignments WHERE id=$1
         → if deadline and now_ms > deadline → 403 assignment_closed
         → else INSERT solo_results (…, assignment_id)
```

Race: student starts at T−10s, submits at T+30s → **reject** (hard server rule). Document in UI: “finish before deadline”.

---

## 7. Effort T-Shirt (Wave 8 implementation)

| Work item | Size | Est. h |
|---|---|---|
| DB migration `class_id` + `assignment_type` | S | 2–3 |
| Server create/list + ownership checks | M | 6–8 |
| Server deadline on solo-score | S | 2–3 |
| Manager create Homework UI | M | 6–8 |
| Lobby Assigned Homework section | S | 3–4 |
| Results dashboard (roster completeness) | L | 8–12 |
| e2e Stagehand (create → play → late reject) | M | 4–6 |
| Locales ×6 for new strings | S | 2–3 |
| **Total** | | **~33–47 h** |

Parent estimate 38–49 h still valid if results dashboard is in scope; drop to ~28–35 h if roster completeness is deferred.

---

## 8. Non-Goals (this design + Wave 8 v1)

- Live multiplayer “homework” rooms (`assignment_type=live` reserved, not implemented).
- LMS export (Moodle/Canvas), email/push notifications.
- Partial credit / late-penalty formulas.
- Changing Solo untimed free-play semantics.
- New Fragetypen.
- Promoting all metadata keys to SQL columns.
- Socket-only create path (HTTP first).

---

## 9. Open Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| OD-1 | Class membership source for lobby list | `class_students` only vs legacy `students.class_id` | **Junction only** (014 is canonical) |
| OD-2 | Student identity for homework | free name vs PIN/`solo_sessions` | Default free name; PIN if `requireIdentifier` |
| OD-3 | Multiple open homeworks per class+quiz | allow vs unique open | **Allow** (retakes / revisions); optional unique later |
| OD-4 | Expired visibility for students | hide vs show closed | Show closed (gray) so students know why |
| OD-5 | Socket notify on create | yes / no | **No** for v1 |
| OD-6 | `assignment_type='live'` | stub column only vs implement | Column with default `self_paced`; live path later |

---

## 10. Wave 8 Acceptance Criteria (preview)

1. Teacher with role admin|lehrkraft creates homework for class C with deadline D.
2. Student in C sees homework in lobby with countdown; non-member does not.
3. Play + score stores `solo_results.assignment_id`.
4. After D, Play disabled; `solo-score` with that assignment returns 403.
5. Teacher `GET …/results` lists submissions for that assignment.
6. Migrations apply idempotently; no Node backend paths.

---

## 11. Infrastructure Map (file paths)

| Concern | Path |
|---|---|
| Assignments HTTP | `rust/server/src/http/assignments.rs` |
| Solo score + assignment_id | `rust/server/src/http/solo.rs` |
| Router | `rust/server/src/http/mod.rs` |
| Assignment play UI | `packages/web/src/pages/quizz/$id/assignment.$assignmentId.tsx` |
| Classes UI | `packages/web/src/features/manager/components/configurations/klassen/*` |
| Migrations | `db/migrations/001`, `005`, `008`, `011`, `014`, `015` |
| Parent SDD | `docs/wave6-7-sdd.md` Teil B |

---

**Document status:** READY FOR DESIGN REVIEW (Wave 7) · Implementation blocked until Wave 8 kickoff.
