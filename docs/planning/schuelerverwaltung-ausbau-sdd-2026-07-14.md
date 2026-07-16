# Schülerverwaltung-Ausbau — SDD (Razzoozle Rust twin)

**Date:** 2026-07-14  
**Status:** Design Phase (implementation pending Klassenmanager P1/P2 completion)  
**Stakeholder:** joel.scherrer90@gmail.com  

## User Request Summary

Allow teachers to:
1. **Enroll students in multiple classes** (A): Existing `students` table binds each student to one class. Add many-to-many support via `class_students` junction table.
2. **View per-student analytics** (B): Quiz history (which game, which answers, timestamps) + aggregated stats (accuracy %, attempts, trends) per student, scoped to teacher's classes.
3. **Send solo quiz assignments to individual students** (C): Generate expiring PIN-based assignment links (QR code or direct URL) so a student can join a solo quiz without a class roster lookup.

**Sequencing:** Areas A (schema) → B+C (both consume identity bridge) → C's token feeds B's attribution. Future plan, dependent on Klassenmanager P1/P2 (current Wave).

---

## Orchestrator-Korrekturen & User-Ergänzungen (2026-07-14) — VERBINDLICH vor Implementierung

Diese Sektion überschreibt widersprechende Detailangaben in den WPs unten (die Workflow-Agents haben einige Pfade/Namen halluziniert und eine Migration überengineered). Gegen den echten Tree verifiziert.

**A) Pfad-/Namens-Korrekturen (real gegen den Tree geprüft):**
1. **Migrations liegen in `db/migrations/`** (Repo-Root), NICHT `rust/server/db/migrations/`. Nächste freie Nummer: `db/migrations/013_multi_class_support.sql` (011_classes, 012_lehrkraft_role existieren).
2. **`packages/common/src/types/models.rs` existiert NICHT** — `packages/common` ist TypeScript. TS-Typen → `packages/common/src/types/*.ts`; Rust-Wire-Typen → `rust/protocol/src/`. Kein `.rs` in common.
3. **Event-Naming: bestehende `class:*`-Konvention nutzen** (class:list/create/createSuccess/addStudent/studentAdded, camelCase), NICHT `manager:move-student`. Neue Events: `class:moveStudent`, `class:removeFromClass`, `class:studentClasses` — in `rust/protocol/src/constants.rs` + `packages/common/src/constants.ts` (beide Seiten, WP besitzt den Contract).

**B) Migration entschlacken (YAGNI — CLAUDE.md Anti-Overengineering):** WP-A-02s 4-Phasen-Dual-Write-über-Wochen ist Enterprise-Fleet-Overkill für einen Single-Instance-Twin, den wir kontrolliert deployen. Stattdessen: **eine** additive Migration (Junction `class_students` + Backfill + `students.class_id` nullable lassen für ein kurzes Kompat-Fenster + Orphan-Trigger). `class_id` in einem simplen Follow-up droppen, sobald der Junction-Pfad live verifiziert ist. Keine wochenlangen Soak-Phasen. WP-A-02 entsprechend auf „ein Follow-up-Cleanup" reduzieren.

**C) User-Ergänzung — eigene „Schülerverwaltung" NEBEN der Klassenverwaltung:** Zusätzlich zur klassen-zentrischen Klassen-Tab ein eigener **schüler-zentrischer** Tab „Schülerverwaltung": Liste ALLER Schüler, ihre Mehrfach-Klassen-Zugehörigkeiten (Schüler zu Klassen hinzufügen/entfernen via `class:moveStudent`/`class:removeFromClass`), Einstieg in Pro-Schüler-Auswertungen (WP-B-02) und „Solo an Schüler senden" (WP-C-02). Ergänzt WP-B-02, ersetzt es nicht: B-02 = klassen-zentrische Dashboard-Sicht, der neue Tab = schüler-zentrische Verwaltung. Neuer WP **WP-D-01: Schülerverwaltung-Tab**.

**D) User-Ergänzung — klassenEnabled-Gating (cross-cutting, PFLICHT-Akzeptanzkriterium jedes UI-WP):** Klassen-Tab UND der neue Schülerverwaltung-Tab UND alle hier beschriebenen Features sind **nur sichtbar/aktiv wenn Klassenmodus an** ist (Manager → „Modus"/gamemode → klassenEnabled). Nutze das bestehende Tab-`gated`-Mechanik in `packages/web/src/features/manager/components/configurations/index.tsx` (aktuell `gated: "devMode"`) — erweitere die `gated`-Union um `"klassenEnabled"` (falls nicht schon vorhanden) und setze sie auf beide Tabs. Selbes Muster wie die bereits klassenEnabled-gegatete Lehrkraft-Rolle (WP-USR).

**E) User-Ergänzung — Import/Export im neuen Modell (ersetzt den zurückgestellten Klassenmanager-P2):** Export/Import muss das NEUE Modell abbilden: Mehrfach-Klassen-Zugehörigkeiten + Schüler-Records. Granularität: **gesamt** (alle Klassen+Schüler), **klassenweise** (eine Klasse + ihre Schüler), **schülerweise** (ein Schüler + seine Klassen/optional History). JSON mit `version`-Bump. Owner-scoped, server-validiert. Neuer WP **WP-D-02: Import/Export (neues Modell)**. Die v1-Impl des gestoppten P2-Workers liegt als Referenz auf Branch `worktree-agent-ad9d2bcbfcef7f1cf`.

**F) Zur Beachtung bei den Contracts:** die bestehenden Klassenmanager-Events aus P1 (`class:deleteSuccess {id}`, `class:studentAdded {id,displayName,classId}`) sind bereits live — neue Events dazu konsistent halten.

---

## Entscheidungen (User, 2026-07-14) — RESOLVED + Symbol-PIN-Design

Die „Open Decisions"-Sektion weiter unten ist damit für Welle 1 entschieden:

1. **Schüler-Eigentum = GETEILT.** Jeder Lehrer, dessen Klasse den Schüler enthält, darf den Schüler-Record bearbeiten. **Pflicht:** Audit-Log auf `students`-UPDATE (old/new/actor_id/timestamp) wie in WP-A-01 beschrieben. F-07-owner-Check: `owner_of(any_class_containing_student)`.
2. **Live-Klassenspiel-Attribution = Namensauswahl + Symbol-PIN.** Im Klassenmodus wählt der Spieler beim Join seinen Namen aus dem Klassen-Roster UND bestätigt mit seinem **Symbol-PIN** → mappt serverseitig auf `student_id` (kein Freitext-Name; der PIN verhindert Impersonation eines Mitschülers). Dieselbe Symbol-PIN-Mechanik wie beim versendeten Solo (unten).
3. **Solo-PIN = Einmal-PIN, überschreibbar** (Default single-use, Lehrer kann pro Versand mehrfach/unbegrenzt setzen). Beides implementieren.
4. **Auswertungen = nur Lehrkräfte** (Welle 1). Schüler-Selbstansicht deferred (Welle 3).

### Emoji-/Symbol-PIN (ersetzt die HMAC-„PIN"-Details in WP-C-01/C-02)

**Kern-UX (User-Direktive 2026-07-14): der PIN ist eine Folge von 4 EMOJIS/SYMBOLEN, die der Schüler durch ANTIPPEN auswählt — nicht tippt.** Zielgruppe ab 3. Klasse (~8 J.): große antippbare Icons in einem Picker-Grid, kein Text-Input, kein Tastatur-Tippen. Beispiel-PIN: 🐱 🚗 🐑 🏠. Jedes Icon hat ein deutsches Wort-Label darunter (katze/auto/schaf/haus) nur zur Referenz/Barrierefreiheit/Vorlesen — die **Auswahl erfolgt über das Bild**, nicht das Wort. Das ist ein „Bild-PIN" für junge/leseschwache Kinder.

**Recherche (Referenzen, 2026-07-14):** Der Standard-Ansatz ist Diceware/EFF-Wortlisten (7776 Wörter = 12,9 bit/Wort); die JS-Entsprechung wäre `unique-names-generator` (npm, custom-dictionary-fähig, „-"-Separator, N Wörter). **ABER: Generierung läuft SERVER-SEITIG in Rust** (Token-Sicherheit) → keine npm-Dependency, KEINE cargo-Dependency (das `rand`-Crate ist bereits im Server, z. B. argon2-Salt). Nur eine **eingebettete kuratierte Wortliste** nötig.

**Design:**
- **Symbol-Set (Rust-embedded):** ≥256 (Empfehlung ~300) klar unterscheidbare, für Kinder ab 3. Klasse SOFORT erkennbare Emojis (Tiere, Fahrzeuge, Essen, Alltagsobjekte — 🐱🚗🍎🏠⚽🌙☀️🐟…), je mit deutschem Wort-Label. Auswahl-Kriterien: visuell eindeutig unterscheidbar (keine 3 fast gleichen Katzengesichter), plattform-robust (Emojis, die auf iOS/Android/Web ähnlich aussehen), keine kulturell heiklen. Final als handkuratierte statische Liste im Repo (`rust/…/emoji_pin_set.rs` oder JSON-Asset mit `{emoji, label_de}`), KEINE Laufzeit-Dependency. (Referenz-Ansatz Diceware/`unique-names-generator`, aber wir generieren in Rust.)
- **Generierung:** 4 Symbole per CSPRNG (`rand` — NICHT `Math.random`), server-seitig, beim Erzeugen des Assignment/Solo-Tokens. Die Symbol-Folge ist der human-facing Lookup-Key; Server mappt sie 1:1 auf das serverseitige Token (student_id, class_id, assignment_id, expiry). Kollisions-Check gegen aktive PINs. (Reihenfolge zählt.)
- **Entropie:** 300 Symbole^4 ≈ 2^33; 256^4 = 2^32. Für einen **kurzlebigen, single-use, ratenlimitierten** Klassencode ausreichend (kein Passwort). **Pflicht:** PIN-Eingabeversuche ratenlimitieren (F-08 beachten — pro Assignment/IP, nicht global) und nach Ablauf/Verbrauch hart ablehnen.
- **Client — ANZEIGE (Lehrer/Versand):** die vom Server erzeugte 4-Symbol-Folge als große Icons + Wort-Labels + QR (reuse `packages/web/src/components/QRCode.tsx` / `qr-code-styling` — KEINE neue QR-Dependency).
- **Client — EINGABE (Schüler):** ein **Emoji-Picker-Grid** — der Schüler tippt nacheinander 4 Symbole aus dem Set an (großflächige Buttons, ggf. Suchfilter/Kategorien für ~300 Icons, aber primär visuell scrollbar). KEIN Text-Input, keine Tastatur. Ausgewählte Symbole werden als Folge angezeigt, letzte Auswahl rücknehmbar. Wort-Labels unter den Icons zum Vorlesen. QR-Scan bleibt die schnellste Alternative.
- **Server-Eval bleibt Pflicht (F-05):** der Symbol-PIN authentisiert nur die Identität; Score/Correctness werden weiterhin serverseitig gegen das Quiz bewertet, nie vom Client übernommen.

**Betroffene WPs:** WP-C-01 (Token-Infra → Symbol-PIN-Generierung + Wortliste + Mapping + Rate-Limit), WP-C-02 (Client: Wort+Icon+QR-Anzeige, 4-Wort-Picker-Eingabe), WP-B-01 (Identitäts-Attribution via Symbol-PIN), und der Live-Join (Namensauswahl+Symbol-PIN) in der Spiel-Join-Fläche.

---

## Architecture: The Identity Bridge

**Why this section first?** Per-student analytics (Area B) is impossible without linking every game/solo play result to a student_id. Areas A, B, and C converge on one load-bearing decision: how to reliably attribute a quiz result to a known student across three contexts.

### Three Identity Pathways

#### 1. **Live Class Games** (Strong Identity)
- Teacher starts a game → selects students from class roster → socket endpoint receives `student_id` in payload (extracted from class_students junction).
- `student_id` stored directly in `game_results.student_id`.
- **Assurance:** Socket handler validates teacher owns the class before accepting student list.
- **Schema dependency:** Requires `class_students` junction table (Area A).

#### 2. **Solo Submission with Assignment Token** (Medium Identity)
- Area C generates a signed HMAC token: `student_token = HMAC-SHA256( {student_id, class_id, assignment_id, expiry}, secret_key )` encoded as base64.
- Token issued via `POST /api/assignments/{id}/generate-pin` or embedded in QR code → delivered to student (email, SMS, or manually).
- Client submits token with solo result: `POST /api/quizzes/{id}/solo-score { student_token, answers, ... }`.
- Server validates token (signature, expiry, assignment max-attempts) before accepting submission.
- **Assurance:** HMAC prevents tampering; expiry enforced server-side; single-use or per-attempt counter blocks replay.
- **Schema dependency:** Requires `assignments` table extension (Area C) + `solo_results.student_id` FK (Area B).

#### 3. **Anonymous Solo (No Attribution)**
- Student plays public quiz without login or assignment token → result stored with `student_id = NULL`.
- Excluded from teacher dashboards and per-student analytics.
- **Use case:** Public leaderboards, self-assessment, demos.
- **No schema dependency** (existing behavior).

### Why This Bridge Matters

**Before (current state):** Solo results are anonymous or owned by free-text player_name. No way to link a play to a student_id. Teacher cannot ask "What did this student answer on Q3?"

**After:** Every result has optional `student_id` FK. Teacher queries `WHERE student_id = $student_id AND class_id = $class_id` to see all plays (solo + live) for that student, attribute answer history, and compute stats.

**Security guarantee (F-05 + F-07 mitigations):**
- **F-05 (Client Controls Score):** All three pathways validate answers server-side. Client `answers` field ignored; server re-evaluates against quiz JSON. Stored score is server-computed, never echoed from client.
- **F-07 (Assignment IDOR):** Token includes assignment_id; server validates assignment owner before accepting token. Queries scoped to `WHERE owner_id = $current_user_id`.

---

## Work Packages

### **WP-A-01: Many-to-Many Student↔Class Schema**

**Requirement:** Allow one student to belong to multiple classes. Current 1:N relationship (students.class_id FK) becomes N:M via junction table.

**Data Model + Migration**

Create migration `db/migrations/013_multi_class_support.sql`:

```sql
-- Phase 1: Create junction table + backfill existing data in transaction
BEGIN;

CREATE TABLE class_students (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id),
  student_id BIGINT NOT NULL REFERENCES students(id),
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, student_id),
  CONSTRAINT student_must_exist CHECK (student_id > 0)
);

CREATE INDEX idx_class_students_class_id ON class_students(class_id);
CREATE INDEX idx_class_students_student_id ON class_students(student_id);

-- Backfill: copy existing class membership (Phase 1 atomic, no race window)
INSERT INTO class_students (class_id, student_id, joined_at)
SELECT class_id, id, created_at FROM students WHERE class_id IS NOT NULL;

COMMIT;

-- Phase 1b: Modify students.class_id FK to allow NULL + set to ON DELETE SET NULL (temporary)
ALTER TABLE students
  ALTER COLUMN class_id DROP NOT NULL,
  DROP CONSTRAINT students_class_id_fkey,
  ADD CONSTRAINT students_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;

-- Orphan cleanup trigger (mandatory, not optional future enhancement)
CREATE FUNCTION delete_orphaned_student_after_class_students_delete() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM students WHERE id = OLD.student_id AND NOT EXISTS (
    SELECT 1 FROM class_students WHERE student_id = OLD.student_id
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_class_students_delete 
  AFTER DELETE ON class_students
  FOR EACH ROW 
  EXECUTE FUNCTION delete_orphaned_student_after_class_students_delete();
```

**Files Modified/Created:**
- **NEW:** `rust/server/db/migrations/013_multi_class_support.sql`
- **MODIFY:** `packages/common/src/types/models.rs` — add `ClassStudent` DTO
- **MODIFY:** `rust/server/src/db/classes.rs` — add 6 functions:
  - `add_student_to_class(class_id, student_id, owner_id) → Result`
  - `remove_student_from_class(class_id, student_id, owner_id) → Result` (atomic, orphan check)
  - `get_class_students(class_id, owner_id) → Vec<Student>` (permission-scoped)
  - `is_student_in_class(class_id, student_id) → bool`
  - `can_manage_student(student_id, owner_id) → bool` (check: owner of ANY class containing student)
  - `list_all_classes_for_student(student_id) → Vec<Class>` (for area B)

**Contract Specification**

Socket handler `socket/manager/classes.rs`:
- Existing: `manager:add-student` adds to single class. Keep backward-compatible.
- **NEW:** `manager:move-student { class_id, student_id }` — add to new class (idempotent).
- **NEW:** `manager:remove-student { class_id, student_id }` — remove from class (orphan check in function).
- **NEW:** `manager:list-student-classes { student_id }` — returns `[{ class_id, class_name, joined_at }]` (owner-scoped).

All handlers wrap database calls in transaction. Permission check: `can_manage_student() && owner_of(class_id)`.

**Security (Owner Scoping)**

- **Decision point:** In this design, students become shared resources. Any class owner containing that student can modify the student record (e.g., name, email). This is intentional (simplifies UX) but changes data isolation.
- **Mitigation:** Add audit logging to all `students` table UPDATEs (log `old_value, new_value, actor_id, timestamp`). Implement optional Postgres trigger or Rust middleware.
- **F-07 (IDOR) mitigation:** Always check `owner_of(any_class_containing_student)` before allowing student mutation.

**Acceptance Criteria**
- ✅ Backfill runs atomically; no race window.
- ✅ Existing students linked to classes via junction table.
- ✅ New student enrollment uses junction table.
- ✅ Removing student from last class triggers orphan deletion (no dangling records).
- ✅ Class deletion cascades correctly via FK + trigger (no double-delete).
- ✅ Permission checks enforce owner scoping; negative test: owner_B cannot access owner_A's students.
- ✅ All socket handlers scoped to current user's classes.

**Worker:** Subscribed agent (free-tier for schema + socket handlers).  
**Wave:** Wave 1 (before Area B implementation).

---

### **WP-A-02: Phase 2–4 Migration & Deprecation**

**Requirement:** Safely retire `students.class_id` column after junction table is stable (Phase 4). Phases 2–3 are dual-write (both old and new) to allow rollback.

**Migration Plan**

**Phase 2 (Dual Write — after 1 week of Phase 1 production):**
- Code deployment: both `insert students` and `insert class_students` for any new enrollments.
- No schema change in this phase.

**Phase 3 (Read From Junction — after 1 week of Phase 2 dual-write):**
- Code deployment: read from `class_students` by default; only consult `students.class_id` if junction is empty (backward-compat).
- No schema change.

**Phase 4 (Column Retirement — after 1 week of Phase 3):**
- Migration: `ALTER TABLE students DROP COLUMN class_id;`
- Restore original FK behavior in classes table if needed (rollback-proof plan documented).

**Acceptance Criteria**
- ✅ Phase 2 code passes all existing tests (no regressions).
- ✅ Phase 3 read path verified via integration test: both pathways produce same student list.
- ✅ Phase 4 migration validated offline (backup + test restore included).
- ✅ Rollback plan: document SQL to re-add column + restore FK in 2 minutes.

**Worker:** Subscribed agent (schema + testing).  
**Wave:** Wave 2 (post-Phase 1 soak).

---

### **WP-B-01: Per-Student Analytics Schema & Server-Side Answer Evaluation**

**Requirement:** Store per-answer detail for every quiz play (solo + live games), enabling teacher to audit what a student answered on each question. Fix F-05 (client-controlled scores) by rejecting client score/correct flags and always computing server-side.

**Data Model + Migration**

Create migration `db/migrations/015_add_student_analytics.sql`:

```sql
BEGIN;

-- Extend game_results and solo_results with student FK
ALTER TABLE game_results ADD COLUMN student_id BIGINT REFERENCES students(id);
ALTER TABLE solo_results ADD COLUMN student_id BIGINT REFERENCES students(id);

-- Per-answer detail tables (parallel schema for game/solo)
CREATE TABLE game_answers (
  id BIGSERIAL PRIMARY KEY,
  game_result_id BIGINT NOT NULL REFERENCES game_results(id) ON DELETE CASCADE,
  question_index INT NOT NULL,
  submitted_answer TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  time_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE solo_answers (
  id BIGSERIAL PRIMARY KEY,
  solo_result_id BIGINT NOT NULL REFERENCES solo_results(id) ON DELETE CASCADE,
  question_index INT NOT NULL,
  submitted_answer TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  time_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_answers_game_result ON game_answers(game_result_id);
CREATE INDEX idx_solo_answers_solo_result ON solo_answers(solo_result_id);

-- Indexes for teacher dashboards (Area B queries)
CREATE INDEX idx_game_results_student_id ON game_results(student_id);
CREATE INDEX idx_solo_results_student_id ON solo_results(student_id);
CREATE INDEX idx_solo_results_quiz_owner_score ON solo_results(quiz_id, created_at DESC);

COMMIT;
```

**Files Modified/Created:**
- **NEW:** `rust/server/db/migrations/015_add_student_analytics.sql`
- **MODIFY:** `packages/common/src/types/analytics.rs` — add DTOs:
  - `struct PlayerAnswer { question_index: usize, submitted: String, correct: bool, time_ms: i32 }`
  - `struct StudentPlaySummary { play_id: uuid, student_id: i64, quiz_id: uuid, score: i32, created_at: DateTime, answers: Vec<PlayerAnswer> }`
- **MODIFY:** `rust/server/src/http/solo.rs` (critical F-05 fix):
  - Refactor `handle_solo_score()` to load quiz definition from DB.
  - **DO NOT ACCEPT** `payload.score` or `payload.correct` fields.
  - Call internal `evaluate_answers(quiz, submitted_answers) → (score, per_answer_detail)`.
  - Insert `score` and all `answers` into `solo_answers` table.
  - **Test:** Send `{ answers: [...], submitted_score: 100 }` where correct score is 50; assert stored score is 50, not 100.
- **NEW:** `rust/server/src/http/analytics/mod.rs` — analytics endpoint handlers.
- **NEW:** `rust/server/src/http/analytics/queries.rs` — SQL layer:
  - `get_student_plays(student_id, class_id, owner_id, limit, offset) → Vec<StudentPlaySummary>`
  - `get_student_stats(student_id, owner_id) → { attempts, avg_score, accuracy_pct }`
  - `get_play_detail_with_answers(play_id, owner_id) → StudentPlaySummary`
- **MODIFY:** `rust/server/src/socket/player/login.rs` — extract `student_id` from login payload (passed when teacher initiates live game with roster selection).
- **MODIFY:** `rust/server/src/socket/player/lifecycle.rs` — store `student_id` in `game_results` row on game finish.

**Contract Specification**

HTTP endpoints (all owner-scoped; return 401 if not owner):

```
GET /api/students/{student_id}/analytics
  → { attempts: int, avg_score: float, accuracy_pct: float, total_games: int, last_played: DateTime }

GET /api/students/{student_id}/plays?limit=20&offset=0
  → { plays: [{ id, quiz_id, quiz_name, score, played_at, type: "solo"|"game" }] }

GET /api/students/{student_id}/plays/{play_id}/answers
  → { play_id, student_id, quiz_name, answers: [{ question_index, text, submitted, correct, time_ms }] }

GET /api/classes/{class_id}/students/analytics?limit=50
  → { students: [{ id, name, last_activity, attempts, avg_score, accuracy_pct }] }

GET /api/quizzes/{quiz_id}/class/{class_id}/breakdown
  → { quiz_name, students: [{ student_id, attempts, accuracy_pct, per_question: [{ q_index, accuracy_pct }] }] }
```

All queries filter `WHERE owner_id = $current_user_id` (teacher/manager only).

**Security (F-05 + F-07 + Owner Scoping)**

- **F-05 (Client Score):** Reject any `payload.score` or `payload.correct`. Always compute on server.
- **F-07 (Assignment IDOR):** All analytics queries include `owner_id` filter. If user B tries to access user A's student, return 404.
- **Per-student token security:** When solo submission includes `student_token`, validate token expiry + assignment owner before accepting result.
- **Audit trail:** Timestamp all inserts; log failed token validations (via application logging, not DB table).

**Acceptance Criteria**
- ✅ Server-side answer evaluation tested: client sends wrong score, stored score is correct.
- ✅ All analytics endpoints return 401 for unauthorized user.
- ✅ Negative test: user B cannot access user A's student details.
- ✅ Answer storage: 100% of submitted answers persisted, queryable.
- ✅ Pagination works: `LIMIT 20 OFFSET 40` returns correct slice.
- ✅ Performance: query for one student with 500 plays + answers completes in <500ms.

**Worker:** Subscribed agent (Rust backend + schema).  
**Wave:** Wave 1 (core analytics backend).

---

### **WP-B-02: Teacher Dashboard UI (Class Students Grid, Student Detail, Play Drill)**

**Requirement:** Three React pages for teachers to explore per-student analytics.

**Files Modified/Created:**

**NEW pages:**
- `packages/web/src/pages/admin/classes/[classId]/students.tsx` (ClassStudentsPage)
  - Displays all students in class as sortable grid: Name, Last Activity, # Attempts, Avg Score, Accuracy %.
  - Rows are clickable → navigate to student detail.
  - Teacher role check: 401 if not owner.

- `packages/web/src/pages/admin/students/[studentId]/index.tsx` (StudentDetailPage)
  - Header: Student name, class(es) enrolled, join date.
  - Tab 1 "All Plays": Paginated history of solo + live game plays. Columns: Date, Quiz Name, Type, Score, Accuracy %. Rows drillable.
  - Tab 2 "Per-Quiz Breakdown": Grid of quizzes × attempts; shows best/worst/avg score per quiz.
  - Tab 3 "Per-Question Analysis": Deep dive (placeholder for Wave 2, shows accuracy % per question across all plays).
  - Teacher role check: 401 if not owner.

- `packages/web/src/pages/admin/plays/[playId]/index.tsx` (StudentPlayDetailPage)
  - Single play detail: Quiz name, date, final score, timing.
  - Question-by-question breakdown: Question text (readonly), student's submitted answer, correct flag, time spent.
  - Teacher can review each answer; enables "Why did they get this wrong?" assessment.

**Components to create:**
- `packages/web/src/components/analytics/StudentStatsCard.tsx` — reusable stats card (used in both ClassStudentsPage + StudentDetailPage header).
- `packages/web/src/components/analytics/PlayHistoryTable.tsx` — paginated table for Tab 1.
- `packages/web/src/components/analytics/PerQuestionGrid.tsx` — drillable grid for per-question accuracy (Tab 3).

**Hooks:**
- `packages/web/src/hooks/useStudentAnalytics.ts` — fetches `GET /api/students/{id}/analytics`.
- `packages/web/src/hooks/usePlayDrill.ts` — fetches `GET /api/students/{id}/plays/{play_id}/answers`.

**Styling:** Follow Scandi design system (if in scandi project) or existing Razzoozle component library. Mobile-first breakpoints 920/600/375.

**Acceptance Criteria**
- ✅ ClassStudentsPage loads, renders all students from API.
- ✅ Click student row → navigates to StudentDetailPage with correct ID.
- ✅ StudentDetailPage shows 3 tabs, all functional.
- ✅ Tab 1 pagination: LIMIT 20, next/prev buttons work.
- ✅ Click play row → navigates to StudentPlayDetailPage with answers loaded.
- ✅ StudentPlayDetailPage displays all questions + answers, readonly.
- ✅ 401 check: reload as unauthorized user, pages return permission error.

**Worker:** Frontend agent (React + TypeScript).  
**Wave:** Wave 1 (post-backend merge).

---

### **WP-C-01: Assignment Token Infrastructure & PIN Generation**

**Requirement:** Enable teachers to generate expiring PIN codes (or URLs with embedded tokens) and send them to students for solo quiz access. Fix F-05 by enforcing server-side answer validation; mitigate F-07 by scoping tokens to assignment owner.

**Data Model + Migration**

Create migration `db/migrations/014_add_assignment_pin_expiry.sql`:

```sql
BEGIN;

ALTER TABLE assignments ADD COLUMN (
  assignment_pin VARCHAR(6) UNIQUE,                 -- 6-digit PIN
  pin_expiry_at TIMESTAMP,                           -- UTC timestamp
  pin_generated_at TIMESTAMP,                        -- When was PIN created
  pin_max_uses INT DEFAULT 1,                        -- Max PIN validations (default: single-use)
  pin_uses_count INT DEFAULT 0,                      -- Current uses
  owner_id UUID NOT NULL DEFAULT (SELECT id FROM users LIMIT 1),  -- FK to users; REQUIRED for F-07
  assigned_to_student_name VARCHAR(255),             -- Optional: teacher can pre-assign to named student
  first_accessed_at TIMESTAMP,                       -- Audit: when was PIN first used
  last_accessed_at TIMESTAMP                         -- Audit: when was PIN last used
);

-- FK + index for owner scoping (F-07 mitigation)
ALTER TABLE assignments ADD CONSTRAINT assignments_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id);

CREATE INDEX idx_assignments_owner_id ON assignments(owner_id);
CREATE INDEX idx_assignments_pin ON assignments(assignment_pin);

COMMIT;
```

**Files Modified/Created:**
- **NEW:** `rust/server/db/migrations/014_add_assignment_pin_expiry.sql`
- **MODIFY:** `packages/common/src/types/models.rs` — extend `Assignment` DTO with new columns.
- **NEW:** `rust/server/src/http/assignments/mod.rs` — endpoint handlers:
  - `POST /api/assignments/{id}/generate-pin { duration_minutes, assigned_to_student_name?, max_uses? } → { pin, qr_url, expires_at }`
  - `POST /api/assignments/{id}/validate-pin { pin } → { session_token, expiry }`
  - `POST /api/assignments/{id}/revoke-pin` — optional, allow teacher to revoke before expiry.
- **NEW:** `rust/server/src/http/assignments/token.rs` — token generation + validation:
  - `generate_student_token(student_id, class_id, assignment_id, expiry) → String` (HMAC-signed base64)
  - `validate_student_token(token_str) → Result<(student_id, assignment_id, expiry)>` (verify signature + expiry server-side)
  - `validate_pin_and_generate_token(assignment_id, pin, owner_id) → Result<session_token>` (atomic update + token issue)
- **MODIFY:** `rust/server/src/http/solo.rs` — extend `handle_solo_score()`:
  - Accept optional `student_token` parameter.
  - If provided, validate token + extract `student_id` + increment `pin_uses_count` (atomic).
  - Populate `solo_results.student_id` with extracted ID.
  - Store all answers in `solo_answers` table (reuses WP-B-01 schema).
  - **Reject** any `payload.score` or `payload.correct` fields (F-05 fix).
- **NEW:** `rust/server/src/http/assignments/qr.rs` — QR generation:
  - Generate URL: `https://razzoozle.local/quiz/{quiz_id}/join?pin={pin_code}&assignment_id={id}`
  - Use existing `qr-code-styling` dependency to render PNG (verify component exists: grep `packages/web/src/components/QRCode.tsx`).

**Contract Specification**

**Teacher Workflow (generate-pin):**
1. Teacher opens assignment detail page.
2. Clicks "Send to Student" → modal:
   - Input: "Pin valid for (X minutes)" (default 24h) + "Student name (optional)".
   - Click "Generate" → API call `POST /api/assignments/{id}/generate-pin`.
   - Server returns: { pin: "123456", qr_url: "data:image/png;...", expires_at: "2026-07-15T14:30:00Z" }.
   - UI displays: 6-digit PIN (big, copyable) + QR code (downloadable) + expiry timestamp.
   - Teacher can now share PIN via SMS, email, or manually tell student "use code 123456".

**Student Workflow (validate-pin + solo-score):**
1. Student receives PIN code (or scans QR).
2. Navigates to quiz join page (new): `/quiz/{quiz_id}/join`.
3. Inputs PIN → client POST `/api/assignments/{id}/validate-pin { pin }` → server validates:
   - PIN exists in `assignments` table.
   - `assignment_id` matches the quiz.
   - `pin_expiry_at > NOW()`.
   - `pin_uses_count < pin_max_uses` (if not unlimited).
   - Atomically: increment `pin_uses_count`, update `first_accessed_at` (if NULL), update `last_accessed_at`.
   - Return: { session_token: "eyJ...", expiry: "2026-07-15T15:00:00Z" }.
4. Client stores token (in sessionStorage, NOT localStorage to avoid XSS persistence).
5. Client redirects to quiz play page.
6. On quiz submit, client POST `/api/quizzes/{id}/solo-score { student_token, answers: [...], ... }`.
7. Server validates token (signature, expiry, single-use via consumed_token table), evaluates answers server-side, inserts with `student_id` populated.

**Security Hardening (F-05 + F-07 + Replay/Brute-Force Mitigations)**

1. **F-05 (Client Score):** `handle_solo_score()` **rejects** payload.score/correct fields. Always re-evaluate.
   - Test: Send `{ answers: [...], score: 100 }` where correct is 50 → assert stored is 50.

2. **F-07 (IDOR):** `generate-pin` checks `assignments.owner_id == $current_user_id`. `validate-pin` does not require auth (PIN is the auth), but token is single-use and short-lived.
   - Test: User A generates PIN for assignment A. User B cannot call validate-pin (assignment owner check).

3. **PIN Brute-Force Mitigation:**
   - Rate-limit: max 3 failed validate-pin attempts per assignment_id per minute → 429.
   - Track bad attempts in memory or Redis (not DB for speed).
   - After 3 failures, lock PIN for 5 minutes or revoke it.

4. **Token Replay Mitigation:**
   - Create `consumed_tokens` table: `(token TEXT PRIMARY KEY, assignment_id UUID, used_at TIMESTAMP)`.
   - On `validate-pin` success, insert issued token into table.
   - On solo-score, check: token exists in table? If yes, reject (replay). If no, insert + proceed.
   - TTL cleanup: delete rows older than 24h.

5. **Session Token XSS Risk (F-02):**
   - Current context: skeleton JS was exploitable (removed in F-02 fix). Token now in sessionStorage (not localStorage).
   - **Mitigation:** Token should be single-use (consumed after first solo-score). If session is compromised, attacker can only submit one quiz.
   - Document: "If session token is stolen, attacker can submit one quiz response. Do not reuse tokens across attempts."

6. **Manager Auth Check:**
   - `generate-pin` requires valid manager session (x-manager-token header or cookie).
   - Validate session is not expired; reject if >7 days old (per F-11).
   - Document dependency: "Cannot safely release until F-01/F-02 merged."

**Acceptance Criteria**
- ✅ PIN generated as 6 random digits, stored in `assignments.assignment_pin`.
- ✅ QR code renders correctly (grep `QRCode.tsx` exists + component compiles).
- ✅ validate-pin accepts PIN, validates expiry, returns token within 200ms.
- ✅ Brute-force test: 5 bad PIN attempts → 3rd fail accepted, 4–5 → 429.
- ✅ Replay test: use same token twice → 2nd use rejected.
- ✅ Server-side score: send wrong score in payload, stored score is correct.
- ✅ Owner scoping: User B cannot validate PIN for User A's assignment.
- ✅ Expiry enforcement: test with expired PIN → 403.
- ✅ Max uses: set max_uses=2, validate 3 times → 3rd use rejected.

**Worker:** Subscribed agent (Rust backend + token cryptography).  
**Wave:** Wave 2 (post-analytics backend).

---

### **WP-C-02: Client-Side PIN Entry & Assignment Modal**

**Requirement:** React UI for students to enter PIN and for teachers to generate + display PINs. Wire to Area B analytics (student_token populated in solo-score).

**Files Modified/Created:**

**NEW pages:**
- `packages/web/src/pages/quiz/[id]/join.tsx` (QuizJoinPage)
  - Entry point: `/quiz/{quiz_id}/join`.
  - Student sees two options:
    - "I have a PIN" → input 6-digit PIN → button "Join".
    - "Public quiz" → direct link to play.
  - On "Join", POST `/api/assignments/{id}/validate-pin { pin }` → get session_token.
  - Store token in sessionStorage under key `quiz_{quiz_id}_student_token`.
  - Redirect to `/quiz/{quiz_id}` (play page).
  - Play page: on submit, include `student_token` in payload.

**NEW components:**
- `packages/web/src/components/AssignmentSendModal.tsx`
  - Triggered from assignment detail page (button: "Send to Student").
  - Inputs: "Valid for (X minutes)" dropdown, "Student name (optional)" input.
  - On submit: POST `/api/assignments/{id}/generate-pin { duration_minutes, assigned_to_student_name }`.
  - Display result: large 6-digit PIN box (copyable button), QR code image, expiry time + "Share this with student".
  - "Copy PIN to Clipboard" button.
  - "Download QR" button (PNG).

**MODIFY pages:**
- `packages/web/src/pages/manager/Configurations.tsx`
  - Add button per assignment row: "Send to Student" → opens AssignmentSendModal.

- `packages/web/src/pages/quiz/[id]/play.tsx` (or similar)
  - On quiz completion, check sessionStorage for `quiz_{id}_student_token`.
  - If present, include in POST `/api/quizzes/{id}/solo-score { student_token, answers, ... }`.

**Hooks:**
- `packages/web/src/hooks/useAssignmentPin.ts` — manages PIN input, validation, token storage.

**Styling:** Mobile-first; PIN input should be large touch-targets (44px minimum per WCAG). QR code visible on mobile.

**Acceptance Criteria**
- ✅ QuizJoinPage renders, PIN input accepts 6 digits.
- ✅ Submit PIN → calls validate-pin endpoint, retrieves token.
- ✅ Token stored in sessionStorage; survives page reload.
- ✅ Play page includes token in solo-score payload.
- ✅ AssignmentSendModal generates PIN, displays QR.
- ✅ QR code scannable by phone camera (test with QR decoder).
- ✅ Mobile layout: PIN input and QR visible on 375px viewport.
- ✅ Unauthorized user (no manager session) cannot open send modal.

**Worker:** Frontend agent (React + TypeScript).  
**Wave:** Wave 2 (post-token backend).

---

## Sequencing & Dependencies

```
Wave 1:
  WP-A-01 (Junction table schema)
    ↓
  WP-B-01 (Analytics schema + server-side eval)
    ↓
  WP-B-02 (Teacher dashboard UI)

Wave 2 (parallel, both consume A's identity bridge):
  WP-C-01 (PIN token infrastructure)
    ↓
  WP-C-02 (PIN entry UI)

Wave 3 (future, if requested):
  WP-A-02 (Phase 2–4 migration cleanup)
  Assignment assignments-to-students bridge (student_tokens per assignment)
  Export analytics to CSV/PDF
  Data retention policies (e.g., delete solo_answers > 2 years old)
```

**Critical path:** A-01 (schema) → B-01 (analytics schema + F-05 fix) → C-01 (token infra).

**Reason:** 
- A-01 creates the `class_students` junction, enabling Area B queries.
- B-01 creates `student_id` FKs and enforces server-side answer eval (F-05 fix).
- C-01 creates the token mechanism that Area B consumes for attribution.

---

## Open Decisions for the User

1. **Student Ownership Model (A-01)**
   - Current: Teachers can manage students in their classes; students are shared resources across multiple teachers.
   - Alternative: Keep students per-owner (one teacher owns, others can enroll to classes but cannot edit).
   - **Impact:** Shared model simplifies UX but risks permission escalation. Recommend audit logging (noted in WP-A-01).

2. **QR vs. Direct Link (C-01)**
   - Design assumes QR code + PIN. Alternative: email direct link with embedded PIN.
   - **Decision:** Use both. Validate existing `qr-code-styling` dependency before starting (grep codebase).

3. **Single-Use vs. Multi-Use Tokens (C-01)**
   - Design default: `pin_max_uses = 1` (single-use PIN, single solo attempt per token).
   - Alternative: `pin_max_uses = -1` (unlimited, reusable PIN for classroom exam).
   - **Decision:** Default single-use. Teacher can override in modal. Implement both.

4. **Student Attribution in Live Class Games (B-01 + A-01)**
   - Design: Teacher selects roster → each student paired with login. **How are students identified during game start?** By class_id + name match? By unique student_id sent over socket?
   - **Decision needed:** Show example socket payload in Area B acceptance test.

5. **Data Retention for Solo Answer History (B-01)**
   - Design: Answers stored indefinitely. Should teachers auto-delete answers older than X years?
   - **Decision:** Implement optional `retention_days` in teacher settings (Wave 3). For now, keep indefinitely.

6. **Per-Question Analytics (B-02, Tab 3)**
   - Design mentions "Per-Question Analysis (placeholder for Wave 2)".
   - **Scope:** Is this displaying accuracy % per question across all student plays, or per single play only?
   - **Decision:** For Wave 1, show per-single-play (StudentPlayDetailPage). Per-student cross-play analysis deferred to Wave 2.

7. **Analytics Page Visibility (B-02)**
   - Design: Only teachers (managers) can view. Should students be able to see their own analytics?
   - **Decision:** Teachers only in Wave 1. Students self-view deferred (Wave 3).

8. **Manager Token Expiry Check (C-01)**
   - Design notes: "Token should NOT be reused; tie to socket session; mark as single-use."
   - **Implementation:** Where is manager session stored? Cookies? HTTP-only session store?
   - **Decision:** Reuse existing manager session validation from Klassenmanager (assumed present). Document dependency.

---

## Definition of Done

- [ ] All migrations executed in-order; no backfill race windows or cascade conflicts.
- [ ] Orphaned students cannot persist (trigger validates).
- [ ] WP-A-01 tests pass: permission checks, multi-class enrollment, removal, orphan cleanup.
- [ ] WP-B-01 schema created; indexes built and verified with EXPLAIN ANALYZE.
- [ ] **F-05 fix verified:** Client payload.score rejected; server-computed score always stored. Integration test confirms.
- [ ] **F-07 fix verified:** Teacher B cannot validate PIN for Teacher A's assignment. Negative test passes.
- [ ] WP-B-01 HTTP endpoints return 401 for unauthorized user.
- [ ] WP-B-02 pages render, load data, permit drill-down. Mobile layout responsive.
- [ ] WP-C-01 PIN generation, validation, token HMAC all implemented and tested.
- [ ] Brute-force rate-limiting functional (3 fails → 429).
- [ ] Replay mitigation tested (same token twice → 2nd rejected).
- [ ] QR component verified in codebase (grep successful).
- [ ] WP-C-02 PIN entry page + modal UI complete, mobile-optimized.
- [ ] All acceptance criteria per WP met + documented.
- [ ] No new dependencies added (reuse existing qr-code-styling).
- [ ] Security audit notes (F-05, F-07) closed.
- [ ] All work in dedicated git worktrees; main branch clean post-merge.
- [ ] Spot-test: full flow (teacher creates assignment → generates PIN → student joins via PIN → plays solo → result appears in student analytics with student_id).

---

## Implementation Hazards & Mitigations

| Hazard | Severity | Mitigation |
|--------|----------|-----------|
| Backfill race between Phase 1–2 (junction table gap) | CRITICAL | Embed backfill in migration transaction (WP-A-01); no async task. |
| Cascade FK conflict when class deleted mid-Phase-2 | CRITICAL | Change students.class_id FK to `ON DELETE SET NULL` during Phase 1–3 (WP-A-02). |
| Orphaned students persist (no auto-delete) | HIGH | Mandatory trigger on class_students DELETE (WP-A-01); not optional. |
| F-05: Client score accepted server-side | HIGH | Reject payload.score/correct fields in solo.rs; always re-evaluate (WP-B-01). |
| F-07: Assignment IDOR (User B accesses User A's PIN) | HIGH | Validate assignment.owner_id in all routes (WP-C-01). Negative test. |
| PIN brute-force (1M combinations, no rate limit) | HIGH | Rate-limit: 3 fails per assignment per minute → 429 (WP-C-01). |
| Token replay (use same token twice) | MEDIUM | Consumed_tokens table + check-before-insert (WP-C-01). |
| QR component missing/broken | MEDIUM | Grep codebase before starting. If absent, implement or use npm package (WP-C-02). |
| Manager token theft (F-02) | MEDIUM | Document: token is single-use. If compromised, attacker can submit 1 quiz. Gate release until F-01/F-02 merged. |
| Slow analytics queries (150M rows at scale) | MEDIUM | Indexes on (student_id, created_at DESC) + pagination (LIMIT 20). Benchmark before Wave 2. |
| Permission escalation (shared students model) | LOW | Implement audit logging on all student UPDATEs (WP-A-01). Optional trigger or middleware. |

