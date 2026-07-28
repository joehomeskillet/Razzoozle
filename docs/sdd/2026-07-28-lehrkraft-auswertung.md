# SDD: Lehrkraft-Auswertung zugewiesener Solo-Aufgaben — pro Kind und pro Aufgabe

Status: Entwurf (Spec-Phase, kein Code geschrieben)
Datum: 2026-07-28
Bezug: Erweiterung von Issue #471. Baut auf `docs/sdd/2026-07-28-schuelerportal-und-zuweisung.md`
(im Folgenden „Portal-SDD") auf und **erweitert dessen Abschnitt 7 / WP-C2** — es entsteht kein
zweiter Auswertungs-Tab neben dem dort geplanten, sondern der dort geplante Tab bekommt die hier
spezifizierte Form. Alle Bestandsangaben am Code verifiziert, Stand main = 7ef9b5a37.

Vorgaben des Projektinhabers (entschieden, nicht mehr zu diskutieren):
1. **Zwei gleichwertige Reiter**: „Nach Kind" und „Nach Aufgabe". Beide gleich schnell
   erreichbar, keiner untergeordnet.
2. **Detailtiefe bis zur einzelnen Frage**: beim Öffnen eines Kindes ist sichtbar, welche Frage
   richtig und welche falsch war.
3. **Eigener Menüpunkt** in der Seitenleiste unter „Schule", neben Klassen und
   Schülerverwaltung. Der bestehende Ergebnisse-Tab bleibt unangetastet (Live-Spiele).
4. **Drei Zusatzfunktionen**: CSV-Export · Filter nach Zeitraum · Anzeige säumiger Kinder.

---

## 1. Worum es geht

Eine Lehrkraft, die ihrer Klasse Solo-Quiz-Aufgaben zuweist, sieht heute nirgends, wer sie
erledigt hat, wie gut, und woran ein Kind gescheitert ist — die Ergebnisse liegen zwar in der
Datenbank, aber ohne Oberfläche, ohne verlässliche Kind-Zuordnung und ohne Frageebene. Dieses
Dokument spezifiziert einen neuen Menüpunkt im Lehrkraft-Bereich mit zwei gleichwertigen
Sichten: „Nach Kind" (welches Kind steht wo, bis hinunter zur einzelnen richtig/falsch
beantworteten Frage) und „Nach Aufgabe" (welche Aufgabe wurde von wem erledigt). Dazu kommen
CSV-Export, ein Zeitraumfilter und eine Anzeige säumiger Kinder — alles auf Daten, die der
Server selbst geprüft hat, nie auf Behauptungen des Clients.

## 2. Was heute existiert und wiederverwendet wird

### 2.1 Server und Daten

- `solo_results` hat die Frageebene-Spalte bereits: `answers JSONB NOT NULL DEFAULT '{}'`
  (`db/migrations/001_initial_schema.sql:95`; Tabelle 001:89-99, `assignment_id text` seit
  `005_solo_results_assignment_id.sql:3`, `owner_id` seit `008_owner_scoping.sql:19`). Die
  einzige Schreibstelle listet sechs Spalten ohne `answers`
  (`rust/server/src/http/solo.rs:619-631`) — die Spalte ist tot auf ihrem Default. Bestätigt:
  **kein Schema-Umbau nötig, nur Befüllen.**
- Das Pro-Frage-Urteil entsteht bereits serverseitig und wird verworfen: `compute_solo_score`
  (`solo.rs:347-379`) ruft je Antwort `evaluate_answer` und summiert nur
  `eval_result.base * 1000` (374-375); `EvalResult { correct, base }`
  (`rust/engine/src/eval.rs:21-24`) geht sofort out of scope.
- SEC-05 bleibt Grundgesetz: das clientseitige `correct`-Flag wird nie gelesen
  (`solo.rs:125-127`, Doc-Kommentar 341-346), `payload.score` ebenso wenig (556-559).
- Wertungsfreie Fragetypen sind zentral definiert: `UNSCORED_QUESTION_TYPES` = poll,
  word-cloud, brainstorm, confidence, micro-lesson mit Helfer `isUnscoredQuestionType`
  (`packages/common/src/constants.ts:495-505`); die Rust-Seite gibt für alle fünf
  `EvalResult { correct: false, base: 0.0 }` zurück (`eval.rs:114-150`). **Korrektur zur
  Vorerhebung: es sind fünf Typen, nicht vier — micro-lesson gehört dazu.**
- Frist-/Versuchsgates existieren (`solo.rs:577-612`, `deadline` und `maxAttempts` aus
  `assignments.metadata`, geschrieben `rust/server/src/http/assignments.rs:140-154`).
- Auth-Bausteine: `ensure_manager_user` (`rust/server/src/auth/mod.rs:71-76`), Rollen-Gate
  `role_may_manage_assignments` = admin|lehrkraft (`assignments.rs:71-73`), Scoping-Idiom
  `scope_me` — admin `None`, sonst `Some(user_id)`
  (`rust/server/src/socket/manager/config_helper.rs:11-17`).
- `GET /api/assignment/:id/results` (`assignments.rs:266-315`, Route
  `rust/server/src/http/mod.rs:217`) liefert die Abgaben einer Assignment-ID — heute ohne
  Owner-Check (nur Rollen-Gate, 271) und ohne Frageebene. Null Client-Callsites (Portal-SDD
  §2.1).

### 2.2 Portal-SDD als Unterbau (harte Voraussetzung)

Die Kind-Achse dieser Auswertung existiert erst mit dem Portal-SDD:

- Migration `023_assignment_targets.sql`: `assignments.assigned_student_id`,
  `assignment_group_id`, `revoked_at` (Portal-SDD §3.2, Zeilen 152-179). Ohne sie gibt es
  keinen Nenner — `assigned_to` wird heute hart auf NULL geschrieben
  (`assignments.rs:156-158`).
- Fan-out: eine `assignments`-Zeile je Kind = Soll-Liste; „erledigt" =
  `EXISTS(solo_results WHERE assignment_id = <Zeile>)`, Punktzahl `MAX(score)`, Versuche
  `COUNT(*)` (Portal-SDD §3.1).
- Identität: `player_name` wird für gezielte Aufträge serverseitig aus
  `students.display_name` gesetzt, Token-Konsum ohne TOCTOU (Portal-SDD §4.1, Punkt 3).
- Owner-Check auf `GET /api/assignment/:id/results` (Portal-SDD §4.1, „neu, zwingend").
- Endpunkte `GET /api/assignment/groups` und `GET /api/assignment/group/:groupId/results`
  (Portal-SDD §4.2, Zeilen 331-363) — diese Spec konsumiert sie und baut keine zweiten.
- Manager-Tab `assignments` mit Komponente `ConfigAssignments` (Portal-SDD §7, Zeilen
  630-652; WP-C2 in §13). **Delta dieser Spec:** der Tab wird nicht „nach results"
  einsortiert, sondern gemäss Vorgabe 3 in die Seitenleisten-Gruppe „Schule" (siehe 5.1);
  `ConfigAssignments` bekommt die Zwei-Reiter-Form aus Abschnitt 5 statt der einfachen
  Gruppenliste aus Portal-SDD §7. Die dort beschriebenen Inhalte (Gruppenliste,
  Zurückziehen-Aktion, Pro-Kind-Status) gehen im Reiter „Nach Aufgabe" auf.

Vom Portal-Plan ist noch nichts implementiert (Grep `ConfigAssignments|api/assignment/groups`
über `packages/web/src` und `rust/server/src`: keine Treffer).

### 2.3 Frontend-Bausteine

- Tab-Registrierung: `BUILTIN_TABS` + `isTabAllowed` mit `gated: "klassenEnabled"`
  (`packages/web/src/features/manager/components/configurations/index.tsx:85-200, 205-225`);
  Route entsteht automatisch über den `$tab`-Mechanismus.
- Seitenleisten-Gruppierung (zweite, getrennte Registrierstelle): `NAV_GROUPS`, Gruppe
  „Schule" mit `keys: ["classes", "students", "labels"]`
  (`packages/web/src/features/manager/components/console/ConsoleShell.tsx:86-103`, school
  95-98); ungruppierte Keys landen als Sicherheitsnetz am Ende (`groupNavItems`, 111-129).
- Drilldown-Muster: `ListRow` mit `details`-Slot, vorgeführt in `ClassList.tsx`
  (`expandedClassId` 83/113, `details`-Slot 263-266) — Zeile aufklappen, Sub-Zeilen rendern.
- Filter-Grammatik: `FilterPill`-Reihe (`configurations/schueler/ConfigSchueler.tsx:252-258`),
  `Badge tone="warning"` (`klassen/ClassList.tsx:257`).
- Datumsfilter: `DateInput` (natives `type=date`), heute nur Einzeltag
  (`configurations/ConfigResults.tsx:5, 221`, Vergleich `localDateKey` 45).
- CSV: `csvField` (RFC-4180 + Formel-Injection-Guard),`csvFilename` (personenfreier
  Dateiname), `downloadResultCsv` (Client-Blob, transiente object-URL)
  (`packages/web/src/features/manager/utils/resultExport.ts:9-15, 20-36, 68-78`); Datei ist
  auf additive weitere `build*Csv`-Funktionen ausgelegt.
- Frage-Zeilen-Optik (Check/X je Frage) als visuelles Vorbild:
  `ResultModal/ResultModalAnswers.tsx` — arbeitet aber auf `GameResult.playerAnswers`, die
  Datenform dieser Spec ist eine andere; übernommen wird das Muster, nicht der Code.
- **Kein Zwei-Reiter-Muster vorhanden**: Grep über `packages/web/src` nach radix-tabs /
  Segmented / ToggleGroup liefert keine Ansichts-Umschalter — die Komponente entsteht neu
  (5.2).
- Generator-Pflicht: neue Komponenten via `pnpm g:console` (Governance-Regeln, `CLAUDE.md`).

## 3. Datengrundlage

**Grundsatz dieser Spec: gespeichert und angezeigt wird ausschliesslich, was der Server
geprüft hat — nie, was der Client behauptet.** Das clientseitige `correct`-Flag
(`solo.rs:125-127`) und `payload.score` bleiben ignoriert; die Frageebene entsteht aus
demselben `evaluate_answer`-Aufruf, der den Score erzeugt (SEC-05, Test `solo.rs` im
tests-Block).

### 3.1 Woher jede angezeigte Zahl kommt

| Anzeige | Quelle |
| --- | --- |
| Soll („von 6 Kindern" / „6 Aufgaben") | Fan-out-Zeilen: `assignments WHERE assigned_student_id IS NOT NULL` (023, Portal-SDD §3.1) |
| erledigt | `EXISTS(solo_results WHERE assignment_id = a.id)` (Portal-SDD §3.1) |
| Punktzahl | `MAX(solo_results.score)` — serverseitig neu berechnet (`solo.rs:556`) |
| Versuche | `COUNT(solo_results.*)` je Assignment-Zeile (Zählmuster `solo.rs:595-601`) |
| Kind-Identität | `assignments.assigned_student_id` → `students.display_name`; `player_name` serverseitig gesetzt (Portal-SDD §4.1) — nie Freitext als Identität |
| Frist | `assignments.metadata->>'deadline'` (epoch ms, `assignments.rs:142-144`) |
| säumig | abgeleitet: offen + Frist (3.5 / 6.3) |
| Frage richtig/falsch | `solo_results.answers` JSONB — neu befüllt (3.2) |
| Mandantengrenze | `assignments.owner_id` (`008_owner_scoping.sql:22`, gesetzt `assignments.rs:157-164`) — **nie** `solo_results.owner_id` (3.4) |

### 3.2 Befüllen von `solo_results.answers` (die eine echte Server-Änderung)

`compute_solo_score` (`solo.rs:347-379`) wird umgestellt von `-> i32` auf:

```rust
struct SoloQuestionOutcome {
    index: usize,          // Frage-Index im Quiz zum Abgabezeitpunkt
    verdict: Verdict,      // Correct | Incorrect | Unscored
    points: i32,           // (eval_result.base * 1000).round()
    question_text: String, // Snapshot, chars().take(160), „…" bei Kürzung
}
struct SoloOutcome { score: i32, questions: Vec<SoloQuestionOutcome> }
fn compute_solo_score(quiz: &Quizz, answers: Option<&[SoloScoreSubmitAnswer]>) -> SoloOutcome
```

Regeln:
- Die `questions`-Liste entsteht **innerhalb derselben Schleife** wie der Score — damit
  tragen Dedupe- und Bereichsregeln (negative/out-of-range Indizes ignoriert, doppelter
  Index nur beim ersten Vorkommen, `solo.rs:356-366`) identisch; die Detailansicht kann der
  gespeicherten Summe nie widersprechen.
- `verdict = Unscored`, wenn der Fragetyp wertungsfrei ist (die fünf Typen aus
  `eval.rs:114-150` / `constants.ts:495-501`); sonst `Correct`/`Incorrect` aus
  `eval_result.correct`. Wertungsfreie Fragen erscheinen damit nie fälschlich als „falsch".
- `question_text` wird mit `chars().take(160)` gekürzt; wurde gekürzt, wird „…"
  angehängt, damit die Kürzung sichtbar ist (Prüfbefund G2-5: 80 Zeichen machten
  Textaufgaben mit identischem Präfix ununterscheidbar). **Nie** `&s[..N]`
  (Byte-Slice-Truncation panict an UTF-8-Grenzen).
- Invariante: `sum(points) == score`. Sie hält, weil jeder Summand ≤ 1000 ist, je Index nur
  einmal zählt und die Kappung `min(verified, theoretical_max)` (`solo.rs:549, 559`) nur
  gegen den ignorierten Client-Score wirkt, nie gegen die eigene Summe.
- **Kein `answerText` in der Persistenz.** Vorgabe 2 verlangt „welche Frage richtig und
  welche falsch war" — das Urteil, nicht den Wortlaut. Antworttexte sind Freitext von
  Minderjährigen (personenbezogen) und bis 10 000 Zeichen pro Antwort gross
  (`SOLO_SCORE_ANSWER_TEXT_MAX`, `rust/server/src/state/mod.rs:118`). Weglassen ist die
  datensparsame Standardannahme; additiv nachrüstbar (offene Frage 9).

Der INSERT (`solo.rs:619-631`) bekommt eine siebte Spalte `answers` mit:

```jsonc
{ "v": 1, "total": 12, "questions": [
    { "i": 0, "verdict": "correct",   "points": 1000, "q": "Was ist 3 × 4?" },
    { "i": 1, "verdict": "incorrect", "points": 0,    "q": "Welches Wort ist ein Verb?" },
    { "i": 2, "verdict": "unscored",  "points": 0,    "q": "Wie sicher warst du dir?" } ] }
```

`total` = Fragenzahl des Quiz zum Abgabezeitpunkt (Randfall 8.4). `v` erlaubt spätere
Formatänderungen; leeres Objekt `{}` bleibt die eindeutige Signatur „Altlauf ohne Detail".
Der Client behandelt `v` explizit: nur `v == 1` wird gerendert, jedes andere `v` fällt in
einen definierten Hinweiszustand (5.5) — nie ein Crash, nie ein Teilrendering (G2-6).
TS-Spiegel des Formats in `packages/common` (WP-E0); Zod-Spiegel von
`SoloScoreSubmitAnswer` wird dabei korrigiert — `answerId`/`answerIds`/`answerText` fehlen
dort heute und `correct` ist fälschlich Pflicht
(`packages/common/src/validators/solo.ts:19-26` gegen `solo.rs:122-134`).

### 3.3 Migration `db/migrations/025_solo_results_assignment_fk.sql` (additiv, idempotent)

023/024 sind vom Portal-SDD belegt (§3.2/§3.3); höchste Migration auf main ist 022.

```sql
-- Waisen neutralisieren, bevor der FK entsteht (Alt-IDs aus der JSON-Ära,
-- die keine assignments-Zeile mehr haben): unerreichbar für jede Auswertung,
-- Leaderboard (quiz_id-basiert) unberührt.
UPDATE solo_results SET assignment_id = NULL
 WHERE assignment_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.id = solo_results.assignment_id);

-- FK: Löschkaskade Kind → Aufträge (023) → Ergebnisse. NULL bleibt erlaubt
-- (anonymes Solo-Spiel). Guarded, weil scripts/migrate-apply.sh jede Datei
-- bei jedem Deploy re-applied (dokumentiert in 020_sessions.sql:17-19).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_solo_results_assignment') THEN
    ALTER TABLE solo_results
      ADD CONSTRAINT fk_solo_results_assignment
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
  END IF;
END $$;
```

Begründung: Randfall „Kind wird gelöscht" (8.5) braucht einen definierten Löschpfad für die
Ergebnisse; 023 kaskadiert bereits Kind → `assignments`, dieser FK zieht die Ergebnisse
nach. Dokumentierte Nebenwirkung: Quiz-Löschung kaskadiert über
`assignments.quiz_id … ON DELETE CASCADE` (`001_initial_schema.sql:203`) künftig auch die
zuweisungsgebundenen Ergebnisse — die waren nach Quiz-Löschung ohnehin unerreichbar
(Auswertung joint über `assignments`, Leaderboard über das gelöschte `quiz_id`).
Nicht geprüft: FK-Kompatibilität `text` → Domain `safe_id` (`001:90, 201`) — im Gate gegen
die lokale Postgres verifizieren, nicht annehmen (Lehre: SQL-Reviews brauchen Live-Probe).

### 3.4 Umgang mit vorhandenen Daten

- **Alt-Läufe tragen `answers = '{}'`** — Frageebene existiert nur vorwärts ab Deploy von
  WP-E1. Die Detailansicht zeigt für solche Läufe den Zustand „Für diesen Lauf liegen keine
  Einzelantworten vor" (5.5); ein Backfill ist unmöglich (die Rohantworten wurden nie
  gespeichert). Deshalb wird WP-E1 als erstes gemergt: ab dann sammeln sich Daten, noch
  bevor die Oberfläche existiert.
- **`solo_results.owner_id` wird weiterhin nicht benutzt.** Der INSERT setzt sie nicht, und
  der Re-Apply-Backfill `UPDATE solo_results SET owner_id = 1 WHERE owner_id IS NULL`
  (`008_owner_scoping.sql:53-58`) schreibt bei jedem Deploy alles dem Bootstrap-Admin zu —
  die Spalte ist als Mandantengrenze wertlos. Jede Query dieser Spec scopet über
  `assignments.owner_id`.
- Ungezielte Alt-Zuweisungen (`assigned_student_id IS NULL`) haben keine Kind-Achse; sie
  erscheinen nur im Reiter „Nach Aufgabe" (8.7).

## 4. Server: Endpunkte

Neues Modul `rust/server/src/http/evaluation.rs` (single-responsibility, unter 400 Zeilen —
monolith-guard). Gemeinsamer Auth-Vorspann jedes Handlers, wörtlich:

```rust
let user = crate::auth::ensure_manager_user(&headers, &state.db_pool).await
    .filter(|u| matches!(u.role.as_str(), "admin" | "lehrkraft"))
    .ok_or_else(|| json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"))?;
let me: Option<i64> = if user.role == "admin" { None } else { Some(user.user_id) };
```

Rolle `user` und fehlende/abgelaufene Session → `401 {"error":"unauthorized"}` (Muster
`assignments.rs:80-94`). `lehrkraft` sieht ausschliesslich Zeilen mit
`assignments.owner_id = me` (SQL-Muster `($n::bigint IS NULL OR a.owner_id = $n)`); `admin`
sieht global alles. Jeder Handler loggt Erfolg strukturiert und personenfrei:
`tracing::info!(user_id, rows, "evaluation: …")` — keine Namen, keine PINs, kein
Geburtsdatum (die Redaktionsliste `REDACT_KEYS` kennt keine Personenschlüssel,
`rust/server/src/http/logs.rs:81-96`; deshalb dürfen keine hinein).

Zeitraumparameter überall gleich: `?from=YYYY-MM-DD&to=YYYY-MM-DD`, beide optional,
Filterachse `assignments.assigned_at` (`from` inklusiv 00:00, `to` exklusiv +1 Tag, UTC;
offene Frage 2). Unparsebares Datum → `400 {"error":"invalid date"}`.

### 4.1 `GET /api/evaluation/students?from&to` — Reiter „Nach Kind", Listenebene

```jsonc
{ "students": [ {
    "studentId": 7, "displayName": "Mia K.", "active": true,
    "assignedCount": 6,      // Fan-out-Zeilen im Zeitraum (revocierte ohne Ergebnis zählen nicht)
    "doneCount": 5,          // Zeilen mit >= 1 solo_results-Zeile
    "openCount": 1,          // nicht revoked, ohne Ergebnis, Frist nicht vorbei
    "overdueCount": 0,       // nicht revoked, ohne Ergebnis, Frist vorbei
    "dueSoonCount": 1,       // Teilmenge von openCount: Frist in <= DUE_SOON_MS
    "lastSubmittedAt": 1753700000000 | null
} ] }
```

SQL-Kern (eine Query, Aggregation über die Fan-out-Zeilen):

```sql
SELECT s.id, s.display_name, s.active,
       COUNT(*) FILTER (WHERE a.revoked_at IS NULL OR r.cnt > 0)               AS assigned,
       COUNT(*) FILTER (WHERE r.cnt > 0)                                       AS done,
       ..., MAX(r.last_at)                                                     AS last_submitted
FROM assignments a
JOIN students s ON s.id = a.assigned_student_id
LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt, MAX(answered_at) AS last_at
                   FROM solo_results r WHERE r.assignment_id = a.id) r ON true
WHERE a.assigned_student_id IS NOT NULL
  AND ($1::bigint IS NULL OR a.owner_id = $1)
  AND ($2::timestamptz IS NULL OR a.assigned_at >= $2)
  AND ($3::timestamptz IS NULL OR a.assigned_at <  $3)
GROUP BY s.id, s.display_name, s.active
ORDER BY s.display_name
```

`overdue`/`dueSoon` als weitere `FILTER`-Ausdrücke gegen
`(a.metadata->>'deadline')::bigint` (Cast-Muster wie Lese-Seite `solo.rs:587`). Kinder ohne
einzige Fan-out-Zeile im Zeitraum erscheinen nicht (die Liste ist eine Auswertung, kein
Roster). Leere Liste = `{"students": []}`, kein Fehler.

Live-Gate-Pflicht dieser Query (Prüfbefund G1): `EXPLAIN` gegen die lokale Postgres mit
Testdaten; erwartet wird die Nutzung des 023-Index auf `assigned_student_id` (Portal-SDD
§3.2). Liefert 023 ihn nicht, zieht WP-E2 ihn nach — nicht annehmen, nachweisen.

### 4.2 `GET /api/evaluation/student/:studentId?from&to` — ein Kind, alle Aufträge

```jsonc
{ "studentId": 7, "displayName": "Mia K.", "active": true,
  "assignments": [ {
     "assignmentId": "ab12cd34ef56", "groupId": "uuid" | null,
     "quizzId": "…", "subject": "Brüche", "targetLabel": "Klasse 4b" | null,
     "assignedAt": 1753600000000, "deadline": 1753800000000 | null,
     "status": "done" | "open" | "overdue" | "revoked",
     "dueSoon": false, "bestScore": 4200 | null, "attemptsUsed": 2,
     "lastSubmittedAt": 1753700000000 | null
} ] }
```

Statusableitung serverseitig, eine Definition für alle Flächen: `done` = ≥ 1 Ergebnis (auch
bei gesetztem `revoked_at` — Geleistetes verschwindet nicht, Konsistenz mit Portal-SDD
§4.3); `revoked` = revoked ohne Ergebnis; `overdue` = offen und Frist vorbei
(`deadline_passed`-Semantik, `solo.rs:424-432`: exakt auf der Frist ist pünktlich); `open` =
Rest. Berechtigung: Query filtert `a.owner_id` wie 4.1; existiert das Kind nicht **oder**
hat es für diesen Owner keine Zeilen → `404 {"error":"not found"}` — eine Form, kein
Existenz-Oracle über fremde `students.id` (BIGSERIAL, sequenziell erratbar,
`011_classes.sql:18`).

### 4.3 Erweiterung `GET /api/assignment/groups?from&to`

Der Portal-Endpunkt (Portal-SDD §4.2, Zeilen 331-342) bekommt dieselben beiden
Filterparameter auf `assigned_at`, sonst unverändert. Er trägt den Reiter „Nach Aufgabe";
diese Spec definiert keinen Parallel-Endpunkt.

### 4.4 Erweiterung `GET /api/assignment/:id/results` — die Frageebene

Bestehender Handler (`assignments.rs:266-315`), Response je Zeile erweitert (null
Client-Callsites, bruchfrei):

```jsonc
{ "results": [ {
    "resultId": "quiz-abc123def456", "playerName": "Mia K.", "score": 4200,
    "answeredAt": "2026-07-28T10:15:00.000Z",
    "detail": { "v": 1, "total": 12, "questions": [ /* 3.2 */ ] } | null   // null = Altlauf ('{}')
} ] }
```

Sortierung `answered_at DESC` (neuester Versuch zuerst). Berechtigungen: Rollen-Gate wie
heute (271) **plus** Owner-Check `assignments.owner_id` → `403` bei Mismatch — das ist die
im Portal-SDD §4.1 als zwingend markierte Korrektur (WP-S3 dort); **diese Fläche darf nicht
vor diesem Check deployt werden**, sonst macht ein prominenter Menüpunkt fremde Kinderdaten
bequem klickbar. `404` für unbekannte ID wie heute (287).

### 4.5 `POST /api/evaluation/export-log` — Export-Baseline (Prüfbefund G2-3)

Fire-and-forget vom CSV-Button (6.1): Body `{ "view": "children" | "tasks", "rows": 42 }`,
Antwort `204`. Der Handler schreibt genau eine personenfreie tracing-Zeile
(`tracing::info!(user_id, view, rows, "evaluation: csv export")`) — keine Tabelle, keine
Persistenz über die Server-Logs hinaus (persistentes Audit bleibt offene Frage 6).
Auth-Vorspann wie alle Handler dieses Moduls (Abschnitt 4). Der Download wartet nie auf
diese Antwort; ein fehlgeschlagener Log-Call bricht den Export nicht ab.

## 5. Oberfläche

### 5.1 Menüpunkt und Registrierung (zwei Stellen, beide Pflicht)

1. `BUILTIN_TABS`-Eintrag nach `students` (`configurations/index.tsx:111-117`):
   `{ key: "assignments", nameKey: "manager:tabs.assignments", icon: ClipboardCheck,
   component: ConfigAssignments, gated: "klassenEnabled" }` — kein `roleGate`, wie
   classes/students (offene Frage 5); Route automatisch `/manager/config/assignments`.
   URL-Slug Englisch (stehende Regel), sichtbarer Name deutsch („Aufgaben").
2. `NAV_GROUPS`-Gruppe „Schule" (`ConsoleShell.tsx:96-98`) wird zu
   `keys: ["classes", "students", "assignments", "labels"]` — damit steht der Punkt neben
   Klassen und Schülerverwaltung (Vorgabe 3). Ohne diesen zweiten Eintrag landete der Tab
   ungrouped am Listenende (`groupNavItems`-Sicherheitsnetz, `ConsoleShell.tsx:111-129`).

Der Tab `results` (`index.tsx:124-129`, `ConfigResults.tsx`) bleibt byte-unverändert.

### 5.2 Zwei gleichwertige Reiter

Neue generische Komponente `SegmentedTabs` in `console/` (Scaffold `pnpm g:console
SegmentedTabs`): `role="tablist"`/`role="tab"`/`aria-selected`, Token-Utilities, keine
Feature-Kopplung — es gibt im gesamten web-Package keinen Ansichts-Umschalter zum
Wiederverwenden (2.3). `ConfigAssignments` rendert sie als Kopf mit genau zwei Reitern:
„Nach Kind" und „Nach Aufgabe". Der aktive Reiter liegt als Router-Search-Param
`?view=children | tasks` (Deep-Link- und e2e-fähig); ohne Param gilt „Nach Kind"
(Standardannahme, offene Frage 1), die letzte Wahl wird analog `TAB_STORAGE_KEY`
(`index.tsx:228`) in localStorage gemerkt. Beide Reiter teilen Zeitraumfilter und
Statusfilter (6.2/6.3) — Wechsel behält die Filter bei.

### 5.3 Reiter „Nach Kind"

Datenquelle 4.1, Fetch beim Mount und bei jeder Filteränderung (HTTP mit Manager-Token,
Muster der Portal-SDD-Flächen; bewusst nicht bulk in `ManagerConfig`).

- Je Kind eine `ListRow` (title = `displayName`, meta = „5 von 6 erledigt · zuletzt
  <Datum>", leading = Avatar-Initial): `overdueCount > 0` → `Badge tone="warning"`
  „<n> überfällig"; `active=false` → „deaktiviert"-Badge (Muster `ClassList.tsx:257`).
- Klick klappt die Zeile über den `details`-Slot auf (Muster `ClassList.tsx:263-266`) und
  lädt 4.2: je Auftrag eine Sub-Zeile (subject · targetLabel · Frist · Status-Chip ·
  bestScore · Versuche).
- A11y-Pflicht des Drilldowns (Prüfbefund G2-8), gilt identisch für 5.4: aufklappbare
  Zeilen setzen `aria-expanded` (Prop existiert bereits, `console/ListRow.tsx:38,
  166-176`) und `aria-controls` auf die Sub-Liste; Enter/Space kommen vom nativen
  `<button>`-Trigger (`ListRow.tsx:138`) frei Haus — keine Generator-Änderung nötig,
  nur konsequente Nutzung (AK 19).
- Klick auf eine Auftrags-Sub-Zeile mit `status = done` öffnet den Frage-Dialog (5.5).

### 5.4 Reiter „Nach Aufgabe"

Datenquelle 4.3 — inhaltlich die Gruppenliste aus Portal-SDD §7, hier als Reiter:

- Je Zuweisungsakt eine `ListRow` (title = subject, meta = „an <targetLabel> · zugewiesen
  am … · Frist …", footer = Fortschritts-Badge „17 / 24 erledigt"); revocierte Gruppen
  ausgegraut mit „Zurückgezogen"-Badge; zusätzlich „<n> säumig"-Badge (6.3).
- Klick expandiert via `GET /api/assignment/group/:groupId/results` (Portal-SDD §4.2) die
  Pro-Kind-Zeilen (Status-Chip wie 5.3).
- Klick auf ein erledigtes Kind öffnet denselben Frage-Dialog (5.5) — beide Reiter münden
  in dieselbe Detailansicht.
- Aktion „Zurückziehen" je Gruppe bleibt wie in Portal-SDD §7 spezifiziert (hier verortet,
  nicht doppelt gebaut).

### 5.5 Detailansicht bis zur Frageebene: `AttemptDetailDialog`

Neue Komponente (g:console), geöffnet mit `assignmentId` + Kind-Kontext, lädt 4.4:

- Kopf: Kind-Name, Quiz-subject, Punktebadge des besten Versuchs.
- Bei mehreren Versuchen: Versuchsliste, neuester zuerst („Versuch 3 · 4200 P. · 28.07.
  10:15"), aufklappbar je Versuch.
- Je Frage eine Zeile: laufende Nummer, `q`-Snapshot (max. 160 Zeichen + „…"-Marker,
  3.2), Urteil als Icon+Text — Check „richtig" / X „falsch" / neutrales Zeichen „ohne
  Wertung" (drittes Label, nie als falsch dargestellt) — plus `points`. Optik nach dem
  Muster `ResultModalAnswers.tsx`, Daten aus `detail.questions`. Die Urteils-Icons tragen
  `aria-hidden="true"` — das sichtbare Textlabel ist die zugängliche Beschreibung, es
  gibt kein Icon-only-Urteil (Prüfbefund G2-9, AK 19).
- `detail = null` (Altlauf): Hinweiszustand „Für diesen Lauf liegen keine Einzelantworten
  vor — er wurde vor der Detail-Erfassung gespielt." — keine Fragenliste, kein Fehler.
- `detail.v ≠ 1` (künftiges, diesem Client unbekanntes Format, Prüfbefund G2-6):
  Hinweiszustand „Detailformat unbekannt — bitte Anwendung aktualisieren"
  (`attempt-detail-unknown`), nie Crash, nie Teilrendering; der TS-Typ (WP-E0)
  modelliert `v` als Literal `1` mit explizitem Unknown-Fallback (AK 16).
- `detail.total ≠` aktuelle Fragenzahl des Quiz: Hinweisbadge „Quiz wurde seither geändert"
  (8.4); gerendert wird ausschliesslich aus dem Snapshot, nie gegen das Live-Quiz aufgelöst.

### 5.6 Zustände (je Reiter)

- **Ladend:** Spinner nach Bestandsmuster der Console-Listen; nie Stale-Liste weiterzeigen.
- **Fehler:** Fehlerzustand mit „Nochmal versuchen"-Button (`evaluation-error-retry`);
  `401` → bestehende Login-Behandlung des Manager-Bereichs.
- **Keine Zuweisungen vorhanden** (überhaupt): `EmptyState` mit CTA „Quiz zuweisen" → Tab
  `play` (deckungsgleich Portal-SDD §7-Leerzustand).
- **Leerer Filter** (Zeitraum/Status ohne Treffer): `EmptyState` „Keine Treffer im gewählten
  Zeitraum" mit Aktion „Filter zurücksetzen" — unterscheidbar vom Gar-nichts-Zustand.
- **klassenEnabled aus:** Tab existiert nicht (`isTabAllowed`, `index.tsx:214-217`).

## 6. Die drei Zusatzfunktionen

### 6.1 CSV-Export

Ein Export-Button je Reiter (`evaluation-csv-btn`), exportiert die **gerade sichtbare,
gefilterte Liste** — nie einen zweiten, eigenen Ladepfad, damit der Export automatisch
denselben Owner-Scope trägt wie die Ansicht.

- „Nach Kind": eine Zeile je Kind × Auftrag (flachgeklappt): Kind · Aufgabe · zugewiesen am
  · Frist · Status · Punkte · Versuche · zuletzt abgegeben. Datei:
  `auswertung-nach-kind-<datum>.csv`.
- „Nach Aufgabe": eine Zeile je Gruppe × Kind: Aufgabe · Ziel (targetLabel) · Kind · Status
  · Punkte · Versuche · Frist. Datei: `auswertung-nach-aufgabe-<datum>.csv`.
- Technik: neue `buildEvaluationCsv`-Funktionen **in derselben Datei** `resultExport.ts`
  (additiv, Muster der zwei bestehenden Builder); Pflicht-Bausteine unverändert
  wiederverwendet: `csvField` (resultExport.ts:9-15 — ein Kindername „=Anna" wäre sonst
  eine Excel-Formel), BOM + CRLF (62), `csvFilename` (20-36) und das
  Client-Blob-Download-Muster (68-78).
- Vorkehrungen für Kinderdaten: Dateiname enthält nie einen Kindernamen; es entsteht keine
  Datei auf dem Server (reiner Client-Blob); Spaltenköpfe aus i18n; kein Anonymisier-Toggle
  (für eine Pro-Kind-Auswertung sinnwidrig — bewusste Abweichung vom Live-Spiel-Default
  `result-modal-context.tsx`). Jeder Export feuert zusätzlich den fire-and-forget-Aufruf
  `POST /api/evaluation/export-log` (4.5) — eine personenfreie Server-Logzeile als
  Zugriffs-Baseline (Prüfbefund G2-3); der Download hängt nie an dieser Antwort.
  Persistentes Export-Audit darüber hinaus: offene Frage 6.
- Die Frageebene ist nicht Teil des CSV (offene Frage 4, Standard nein).

### 6.2 Filter nach Zeitraum

Zwei `DateInput`-Instanzen „Von" / „Bis" (natives `type=date`, Baustein
`ConfigResults.tsx:221` — dort bislang nur Einzeltag; hier zwei Instanzen statt eines neuen
Range-Widgets). Wirkung serverseitig über `?from&to` (4.x), Achse `assigned_at`
(Standardannahme, offene Frage 2). Leer = kein Filter. `from > to` → Client zeigt
Leer-Filter-Zustand, sendet nicht. Beide Reiter teilen den Zustand (5.2).

### 6.3 Anzeige säumiger Kinder

Definition (serverseitig, eine Wahrheit für Badges, Filter und Zählungen):

- **überfällig**: keine Abgabe, `revoked_at IS NULL`, Frist vorbei
  (`deadline_passed`-Semantik, `solo.rs:424-432`).
- **bald fällig**: keine Abgabe, nicht revoked, Frist innerhalb `DUE_SOON_MS` = 48 h
  (Konstante in `evaluation.rs`, offene Frage 3).
- Aufträge ohne Frist sind nie säumig; revocierte nie; erledigte nie.

Anzeige: `FilterPill`-Reihe über beiden Reitern (Muster `ConfigSchueler.tsx:252-258`):
**Alle · Offen · Erledigt · Säumig** — „Säumig" = überfällig ∪ bald fällig. Im Reiter „Nach
Kind" filtert sie Kinder mit mindestens einem solchen Auftrag und markiert die Zeile
(`Badge tone="warning"`, überfällig zusätzlich hervorgehoben); „Nach Aufgabe" zeigt je
Gruppe „<n> säumig". Die Filterung arbeitet auf den bereits gelieferten Zählfeldern
(4.1/4.2) — kein eigener Endpunkt. Datenlage ehrlich benannt: ein Kind, das dreimal
angefangen und nie beendet hat, ist von einem nie gestarteten nicht unterscheidbar —
persistiert wird nur in `finishGame` (`packages/web/src/features/game/stores/solo.ts:421-447`),
abgebrochene Läufe hinterlassen keine Zeile (8.10).

## 7. Datenschutz und Berechtigungen

- **Wer sieht was:** Rolle `user` — weder Tab-Daten noch Endpunkte (401 serverseitig, 4.x).
  Rolle `lehrkraft` — ausschliesslich Zuweisungen mit eigenem `assignments.owner_id`; es
  gibt kein Mitbesitz-Konzept (eine Klasse hat genau einen Owner, `011_classes.sql:11`),
  Team-Teaching ist damit bewusst nicht abgebildet. Rolle `admin` — global alles
  (`scope_me`-Semantik, `config_helper.rs:11-17`); die Bündelung aller Leistungsdaten in
  einer Ansicht ist die eigentliche Verschärfung und wird hier benannt, nicht versteckt.
- **Harte Deploy-Reihenfolge:** der Owner-Check auf `GET /api/assignment/:id/results`
  (Portal-SDD §4.1, heute fehlend — `assignments.rs:271` prüft nur die Rolle) muss vor
  oder mit WP-E3 live sein. Abnahmekriterium 11.4 sichert ihn als Regression.
- **Identität statt Behauptung:** „Nach Kind" hängt ausschliesslich an
  `assigned_student_id` + serverseitigem `player_name` (Portal-SDD §4.1); Freitext-Namen
  ungezielter Zuweisungen werden nie als Kind-Identität interpretiert (8.7).
- **Datensparsamkeit der Frageebene:** gespeichert werden Urteil, Punkte und ein
  160-Zeichen-Frage-Snapshot (Quiz-Inhalt, kein Kind-Inhalt) — kein Antworttext (3.2,
  offene Frage 9).
- **Logs:** die Auswertungs-Handler loggen `user_id` und Zeilenzahl, nie Namen/PINs/
  Geburtsdaten — `REDACT_KEYS` (`logs.rs:81-96`) enthält keine Personenschlüssel und
  Freitext im `msg`-Feld ist prinzipiell nicht redigierbar (`logs.rs:186-188`). Flankierend
  nimmt WP-E3 `playerName`/`player_name`/`displayName`/`display_name`/`pin`/`birthdate`/
  `studentId` in `REDACT_KEYS` auf (Einzeiler-Erweiterung, Rekursion vorhanden
  `logs.rs:100-114`).
- **Export:** serialisiert nur die geladene, gescopte Ansicht; Formel-Injection-Guard;
  keine Server-Datei; personenfreier Dateiname (6.1); jeder Export hinterlässt eine
  personenfreie Server-Logzeile (4.5). Einmal exportiert, ist die Datei ausserhalb des
  Systems — Randfall 8.5 erinnert daran.
- **Verbotene Muster** (im Bestand vorhanden, hier ausdrücklich nicht wiederverwendet): die
  quiz-weite Leaderboard-Query `WHERE quiz_id = $1 … LIMIT 1000` (`solo.rs:634-636`) als
  Vorlage irgendeiner Liste — sie ist der bestehende Namens-Leak an Kinder; und der
  ungescopte Ergebnis-Load `get_result_by_id(…, None)` des öffentlichen `/r/:id`
  (`rust/server/src/http/result_og.rs`). Keine Ansicht dieser Spec ist ohne Manager-Session
  erreichbar; es gibt keine öffentliche Auswertungs-URL.
- **Aufbewahrung:** unverändert unbegrenzt — kein `DELETE FROM solo_results` existiert im
  Bestand; einziger neuer Löschpfad ist die Kaskade bei Kind-Löschung (3.3). Die Prüfung
  (G2-4) stuft das zu Recht als Compliance-Lücke ein: Schuldatenschutz verlangt
  definierte Löschfristen für Leistungsdaten. Die Produktentscheidung aus offener
  Frage 7 muss deshalb vor dem Produktiveinsatz an echten Klassen fallen — ein benannter
  Betriebs-Blocker ausserhalb des Codes dieser Welle, keine ewige Vertagung.

## 8. Randfälle, je mit erwartetem Verhalten

1. **Kind wechselt die Klasse:** Aufträge hängen an `assigned_student_id`, nicht an der
   Mitgliedschaft (Portal-SDD §3.1) — beide Reiter zeigen das Kind unverändert;
   `targetLabel` bleibt der Klassennamen-Snapshot zum Zuweisungszeitpunkt.
2. **Aufgabe wird zurückgezogen** (`revoked_at` gesetzt, Portal-SDD §4.2): erledigte
   Zeilen bleiben mit „Zurückgezogen"-Badge sichtbar und behalten ihr Frage-Detail;
   unerledigte zählen weder als offen noch als säumig und fallen aus `assignedCount`
   (4.1) — die Quote „5 von 6" schrumpft auf „5 von 5".
3. **Kind gibt mehrfach ab:** Listenebene zeigt `MAX(score)` und `COUNT(*)` Versuche;
   „erledigt" zählt einmal. Der Dialog listet alle Versuche, neuester zuerst, jeder mit
   eigener Fragenliste (4.4) — die Lehrkraft sieht auch, ob Frage 2 im zweiten Versuch
   richtig wurde.
4. **Quiz wird nach der Abgabe geändert:** Urteil, Punkte und Frage-Snapshot sind zum
   Abgabezeitpunkt eingefroren (3.2) und werden nie nachberechnet. Der Dialog rendert aus
   dem Snapshot; weicht `detail.total` von der aktuellen Fragenzahl ab, erscheint „Quiz
   wurde seither geändert" (5.5). Kein Crash bei verschobenen Indizes, weil das Live-Quiz
   fürs Rendern nicht gebraucht wird.
5. **Kind wird gelöscht:** Hard-Delete kaskadiert Kind → `assignments` (023,
   `ON DELETE CASCADE`, Portal-SDD §3.2) → `solo_results` (neuer FK, 3.3). Das Kind
   verschwindet vollständig aus beiden Reitern und aus den Quoten; damit ist der
   Eltern-Löschwunsch erstmals technisch erfüllbar. Bereits erstellte CSV-Dateien liegen
   ausserhalb des Systems und sind organisatorisch zu behandeln.
6. **Quiz wird gelöscht:** `assignments`-Zeilen kaskadieren (`001:203`), mit ihnen die
   zuweisungsgebundenen Ergebnisse (3.3) — beide Reiter zeigen die Aufgabe nicht mehr.
   Dokumentierte, bewusste Folge; vorher waren diese Daten nur unsichtbar statt weg.
7. **Ungezielte Alt-Zuweisung** (`assigned_student_id IS NULL`): erscheint ausschliesslich
   im Reiter „Nach Aufgabe", ohne Soll-Zahl und ohne Säumig-Logik; die Abgabenliste (4.4)
   zeigt Freitext-`player_name` mit sichtbarem Marker „nicht verifiziert". Im Reiter
   „Nach Kind" existieren diese Abgaben strukturell nicht — das wird durch einen
   Hinweis im Leerzustand des Kindes nicht kaschiert, sondern ist so gewollt.
8. **Kind ist deaktiviert** (`students.active = false`): Zeile bleibt in beiden Reitern
   (Snapshot-Semantik) mit „deaktiviert"-Badge (Portal-SDD §7); zählt weiter in den Quoten.
9. **Altlauf ohne Frage-Detail** (`answers = '{}'`): Listen- und Statuszahlen voll
   funktionsfähig; nur der Dialog zeigt den Hinweiszustand statt Fragen (5.5).
10. **Abgebrochener Lauf** (Browser zu vor `finishGame`, `solo.ts:421-447`): keine Zeile in
    `solo_results` — der Auftrag bleibt „offen" bzw. wird säumig. „Offen" und
    „abgebrochen" sind in den Daten nicht unterscheidbar; die Oberfläche behauptet es
    entsprechend nirgends.

## 9. Nicht-Ziele

- Keine Änderung am `results`-Tab (`ConfigResults.tsx`) oder an `GameResult` — Vorgabe 3.
- Kein Speichern von Antworttexten (`answerText`) in `solo_results.answers` (3.2;
  didaktischer Preis und Nachrüstpfad ehrlich benannt in offener Frage 9).
- Keine Fragen-Aggregation über Kinder hinweg („welche Frage fiel am schwersten?") in
  dieser Welle — das v1-Format trägt mit `i`/`verdict` bereits alles Nötige, die
  Auswertung ist additiv nachrüstbar (offene Frage 10).
- Keine Freitext-Notizen der Lehrkraft pro Kind × Aufgabe (Prüfbefund G2-10): eigenes
  Feature mit eigener Datenhaltung und eigenem Datenschutz-Profil; bei Bedarf eigenes SDD.
- Kein Backfill der Frageebene für Altläufe (unmöglich, 3.4).
- Kein Fix des Solo-Leaderboard-Leaks (`solo.rs:634-636`, quiz-weit statt
  assignment-gescopt) — eigenes P0-WP ausserhalb dieses Auftrags; hier nur: das Muster
  wird nicht wiederverwendet (7).
- Keine Reparatur von `solo_results.owner_id` und kein `solo_results.student_id` —
  Letzteres bleibt Portal-WP-N2; diese Auswertung braucht beides nicht (3.1/3.4).
- Kein Server-CSV-Endpunkt, keine Serverdatei, kein Download-Link.
- Keine Erinnerungs-/Benachrichtigungsfunktion an säumige Kinder (die Säumig-Anzeige ist
  eine Handlungsliste der Lehrkraft, kein Nachrichtensystem).
- Keine automatische Aufbewahrungsfrist/Löschjob (offene Frage 7).
- Keine Änderungen an Schülerportal, Spiel-Flow oder PIN-Login (Portal-SDD-Hoheit); keine
  Änderung der Zuweisungs-Dialoge (Portal-SDD §6).
- Kein Anonymisier-Toggle in dieser Fläche (6.1).

## 10. Offene Fragen, je mit umkehrbarer Standardannahme

1. **Reiter-Default:** Welcher Reiter ist initial aktiv? Standard: „Nach Kind", letzte Wahl
   in localStorage. Umkehrbar: eine Konstante; die Gleichwertigkeit (Vorgabe 1) bleibt in
   jedem Fall — ein Klick trennt beide. Die Prüfung (G2-7) argumentiert für „Nach
   Aufgabe" als Erstaufruf-Default (nach einer gestellten Aufgabe fragt die Lehrkraft
   zuerst „wie ist sie ausgefallen?") — vertretbar, ändert wegen des
   localStorage-Merkens aber nur den allerersten Aufruf. Entscheidet der Projektinhaber;
   Nutzungs-Telemetrie zur Default-Findung ist abgelehnt (Tracking in einer
   Kinderdaten-Fläche widerspricht der Datensparsamkeits-Linie dieser Spec).
2. **Zeitachse des Filters:** `assigned_at` (wann gestellt) oder `answered_at` (wann
   bearbeitet)? Standard: `assigned_at` — die Zuweisung ist die Primärentität, und die
   Säumig-Logik hängt ohnehin an ihr. Umkehrbar: reiner Query-Wechsel, Wire unverändert.
3. **„Bald fällig"-Fenster:** Standard `DUE_SOON_MS` = 48 h als Konstante. Umkehrbar:
   Konstante ändern; konfigurierbar machen ist YAGNI, bis jemand danach fragt.
4. **Fragen-CSV** (eine Zeile je Kind × Frage): Standard: nein — Frageebene bleibt
   Bildschirm-Ansicht. Umkehrbar: additiver dritter Builder in `resultExport.ts`, die
   Daten liegen mit 4.4 bereits beim Client.
5. **roleGate des Tabs:** Der Web-Client kennt nur `role: "admin" | "user" | null`
   (`packages/web/src/features/game/stores/manager.ts:23`); wie eine `lehrkraft`-Session
   clientseitig ankommt, ist **nicht geprüft**. Standard: kein `roleGate` (wie
   classes/students, `index.tsx:104-117`) — der Server bleibt Autorität, eine
   `user`-Rolle sieht im Fehlerfall den 401-Fehlerzustand statt Daten. Umkehrbar:
   einzeiliges `roleGate`, sobald das Mapping geklärt ist.
6. **Persistentes Zugriffs-/Export-Audit** (Muster `students_audit`,
   `014_class_students_junction.sql:41-48`): Standard nach Prüfung (G2-3) angehoben —
   die personenfreien tracing-Zeilen aus Abschnitt 4 **plus** die Export-Logzeile (4.5)
   sind Pflicht-Baseline; eine persistente Audit-Tabelle bleibt verneint. Umkehrbar:
   additive Tabelle — der Endpunkt 4.5 existiert dann bereits als Schreibstelle.
7. **Aufbewahrungsfrist für `solo_results`:** Standard: keine in dieser Welle; Träger wäre
   das bestehende Reaper-Muster (`rust/server/src/main.rs`, 60-s-Intervalle) mit
   `answered_at` (`001:94`). Umkehrbar/nachrüstbar ohne Schema-Änderung; braucht eine
   Produktentscheidung (löschen vs. anonymisieren), nicht diese Spec. Nach Prüfung
   (G2-4) heraufgestuft: die Entscheidung muss **vor dem Produktiveinsatz an echten
   Klassen** fallen (7) — Schuldatenschutz verlangt definierte Löschfristen für
   Leistungsdaten; „keine Frist" ist als Dauerzustand nicht haltbar.
8. **Beamer-/Schulterblick-Schutz** (die Fläche zeigt Klarnamen, dieselbe Session bedient
   die Präsentationsfläche): Standard: kein zusätzlicher Mechanismus in dieser Welle.
   Umkehrbar: späterer „Namen ausblenden"-Schalter rein clientseitig.
9. **Antworttexte in der Frageebene (Welle-2-Kandidat, Prüfbefund G2-1):** Die Prüfung
   benennt den didaktischen Preis des Weglassens korrekt — die Lehrkraft sieht, DASS
   Frage 3 falsch war, aber nicht, ob zwölf Kinder dasselbe Fehlkonzept teilen oder nur
   vertippt sind. Standard bleibt trotzdem: nicht speichern. Antworttexte sind Freitext
   Minderjähriger, bis 10 000 Zeichen pro Antwort (`SOLO_SCORE_ANSWER_TEXT_MAX`,
   `rust/server/src/state/mod.rs:118`); sie zu persistieren ist eine
   Datenschutz-Entscheidung des Projektinhabers, keine Standardannahme dieser Spec.
   Nachrüstpfad ohne Bruch: additives Feld im versionierten Format (`v: 2`) — der
   Unknown-v-Fallback (5.5) schützt alte Clients; es braucht keine Code-Vorleistung.
10. **Fragen-Aggregation je Aufgabe** („welche Frage fiel am schwersten?", Prüfbefund
    G2-2): Standard: nicht in dieser Welle — die bindenden Vorgaben nennen sie nicht,
    und sie braucht entweder einen Aggregations-Endpunkt oder N Detail-Fetches.
    Nachrüstbar rein additiv: `answers` trägt je Frage `i` + `verdict`; ein späterer
    Summen-Endpunkt kann serverseitig aggregieren, ohne dass sich am Speicherformat
    irgendetwas ändert.

## 11. Testbarkeit

**Test-IDs** (Bestandsmuster; die Portal-IDs `assignment-group-row-<groupId>` /
`assignment-student-row-<studentId>` / `assignment-revoke-btn` gelten unverändert weiter):
`evaluation-view-children`, `evaluation-view-tasks` (SegmentedTabs), `evaluation-date-from`,
`evaluation-date-to`, `evaluation-filter-all|open|done|due` (FilterPills),
`evaluation-child-row-<studentId>`, `evaluation-child-assignment-row-<assignmentId>`,
`evaluation-csv-btn`, `evaluation-empty`, `evaluation-filter-empty`,
`evaluation-error-retry`, `attempt-detail-dialog`, `attempt-row-<resultId>`,
`attempt-question-row-<index>`, `attempt-detail-empty`, `attempt-detail-unknown`,
`quiz-changed-badge`.

**Abnahmekriterien (prüfbar):**
1. Nach einem Solo-Submit enthält `solo_results.answers` das v1-Objekt mit
   `sum(points) == score`; ein Client, der alle `correct`-Flags invertiert und
   `score: 999999` sendet, erzeugt byte-identische `answers` und denselben Score
   (Erweiterung des bestehenden SEC-05-Tests in `solo.rs`).
2. Ein Quiz mit Poll-, Word-Cloud-, Brainstorm-, Confidence- und Micro-Lesson-Fragen
   erzeugt für diese `verdict: "unscored"` — im Dialog erscheint keine davon als „falsch".
3. Duplikat-Index und out-of-range-Index im Payload erzeugen genau einen bzw. keinen
   `questions`-Eintrag (Spiegel der Score-Regeln, `solo.rs:356-366`).
4. `GET /api/assignment/:id/results` einer fremden Lehrkraft → `403`; `GET
   /api/evaluation/students` als Rolle `user` → `401`; als Lehrkraft nur eigene Kinder;
   als Admin alle (Regression auf Portal-Abnahmekriterium 6).
5. `GET /api/evaluation/student/:id` mit fremder oder unbekannter ID → identisches `404`
   (kein Oracle, `students.id` sequenziell).
6. Gruppe mit 6 Kindern, 5 Abgaben: „Nach Aufgabe" zeigt „5 / 6 erledigt"; „Nach Kind"
   zeigt beim sechsten Kind `openCount = 1`; nach dessen Abgabe ändert sich nur seine
   Zeile.
7. Frist gestern, keine Abgabe → Kind erscheint unter Filter „Säumig" mit
   Überfällig-Badge; dieselbe Zeile mit `revoked_at` gesetzt → nicht säumig, nicht in
   `assignedCount`.
8. Zeitraumfilter: Zuweisung vom 01.07. erscheint bei `from=2026-07-10` in keinem Reiter;
   `from > to` → `evaluation-filter-empty`, kein Request.
9. CSV „Nach Kind": Kindername `=Anna` steht in der Datei als `"'=Anna"`; Dateiname
   `auswertung-nach-kind-<datum>.csv` ohne Kindernamen; BOM + CRLF vorhanden.
10. Altlauf (`answers = '{}'`): Listen zeigen Score/Status normal, Dialog zeigt
    `attempt-detail-empty`, nie eine leere Fragenliste als „0 richtig".
11. Quiz nach Abgabe um zwei Fragen gekürzt → Dialog rendert die gespeicherten Fragen samt
    `quiz-changed-badge`, kein Fehler.
12. Kind hard-gelöscht → verschwindet aus beiden Reitern; DB-Probe: seine
    `solo_results`-Zeilen sind kaskadiert gelöscht (FK 3.3).
13. Mehrfachabgabe (3 Versuche): Liste zeigt `MAX(score)`/3 Versuche; Dialog listet drei
    Versuche, neuester zuerst, jeder mit eigener Fragenliste.
14. Locale-Gate: alle neuen Keys ×6 Locales, `scripts/check-locales.sh` grün in jedem Gate.
15. Gezielte Zuweisung (`assigned_student_id` gesetzt): eine Abgabe mit beliebigem
    Client-`playerName` speichert `player_name` == `students.display_name` — der
    Client-Freitext erreicht die Zeile nie (Regression auf Portal-SDD §4.1; Prüfbefund
    G1: bislang nur implizit über AK 4 abgedeckt).
16. `detail.v = 2` (künstlich eingespielt) → Dialog zeigt `attempt-detail-unknown`,
    kein Crash, kein Teilrendering.
17. Fragetext mit 200 Zeichen inkl. Umlaut/Emoji nahe der Grenze → Snapshot = 160
    Zeichen + „…", kein Panic (UTF-8-Grenze); kürzere Fragen bleiben ungekürzt ohne
    Marker.
18. CSV-Klick erzeugt genau eine `evaluation: csv export`-Logzeile mit `user_id`,
    `view`, `rows` und ohne Personendaten; der Download funktioniert auch, wenn der
    Log-Call fehlschlägt (fire-and-forget, 4.5).
19. Aufklappbare Zeilen tragen `aria-expanded`/`aria-controls`; Urteils-Icons im Dialog
    sind `aria-hidden` mit sichtbarem Textlabel (vitest gegen gerenderte Attribute).

**Werkzeuge und Pflichten:** Rust-Gate `bash rust/gate.sh` je Server-WP (Worktree braucht
den config-Symlink); UI-WPs fahren die Pflicht-Verifikationskette
(`pnpm tokens:validate · tokens:ast · tokens:neural · tokens:ai-audit`) mit
Verbatim-Ausgabe im Report. e2e via Stagehand-Lane (`source/e2e/`, ausserhalb des
pnpm-Workspace, Install `--ignore-workspace`); Multi-Kind-Szenarien über getrennte
Browser-Kontexte, nie same-origin-iframes; `/manager/config/assignments?view=tasks`
zusätzlich als Hard-Load (`page.goto`) testen. Nach jeder Welle: Deploy + voller
Browser-Smoke des Game-Loops (stehende Regel — Lobby erreichen ist kein Pass).

## 12. Reihenfolge der Umsetzung (kleine WPs, 1 WP ≈ 1 Datei)

Voraussetzung aus dem Portal-SDD: Welle 0 (023, Contracts) und Welle 1 (S1–S3: Fan-out,
Identität, Gruppen-Endpunkte, Owner-Check) — ohne sie gibt es weder Soll noch bewiesene
Kind-Zuordnung. **Unabhängig davon sofort mergefähig sind WP-E0–E2** — je früher E1 deployt
ist, desto mehr Läufe tragen Frage-Detail, wenn die Oberfläche kommt.

**Sofort (parallel zum Portal-Plan):**
- WP-E0 — Contract (`packages/common`): TS-Typ des `answers`-v1-Formats,
  Zod-Spiegel-Korrektur `validators/solo.ts` (3.2), Response-Typen der
  Evaluation-Endpunkte inkl. Status-Union `"done"|"open"|"overdue"|"revoked"`.
- WP-E1 — Rust `http/solo.rs`: `SoloOutcome` (160-Zeichen-Snapshot + „…"-Marker) +
  siebter INSERT-Bind + Tests (AK 1–3, 17).
- WP-E2 — Migration `025_solo_results_assignment_fk.sql` (3.3) + Live-PG-Probe des FK.

**Nach Portal-Welle 1:**
- WP-E3 — Rust `http/evaluation.rs`: 4.1 + 4.2 + Export-Log 4.5, `from`/`to` auf
  `groups` (4.3), Frageebene in `:id/results` (4.4), `REDACT_KEYS`-Erweiterung (7).
  Tests: AK 4–8, 15, 18 (Serverseite).
- WP-E4 — Web Gerüst: Tab-Registrierung (beide Stellen, 5.1), `SegmentedTabs`,
  `ConfigAssignments`-Rumpf mit Zuständen (5.6).
- WP-E5 — Web „Nach Aufgabe" (5.4; absorbiert Portal-WP-C2-Inhalte — mit dem
  Portal-Orchestrator abstimmen, damit WP-C2 nicht doppelt gebaut wird).
- WP-E6 — Web „Nach Kind" (5.3).
- WP-E7 — Web `AttemptDetailDialog` (5.5, inkl. Unknown-v-Fallback und
  aria-hidden-Icons). AK 10–13, 16, 19 (Dialog-Teil).
- WP-E8 — Web Zeitraumfilter + Säumig-Pills/Badges (6.2/6.3). AK 7–8.
- WP-E9 — Web CSV (`resultExport.ts` additiv + Buttons + fire-and-forget-Aufruf 4.5,
  6.1). AK 9, 18 (Client-Teil).
- WP-E10 — i18n: alle neuen `manager:`-Keys ×6 Locales; eigenes WP, Locale-Merges nie
  textuell. AK 14.
- WP-E11 — Stagehand-e2e über den vollen Kreis (zuweisen → spielen → beide Reiter →
  Frage-Dialog → CSV), 3 Viewports, Hard-Load-Deep-Links.

Harte Ketten: E0→E1; Portal-W1→E3→{E5, E6}→E7; E8/E9 nach E5+E6; E10 nach den finalen
Key-Listen; E11 zuletzt. E2 ist jederzeit einschiebbar. Jeder Worker im eigenen Worktree,
`claude-wp-verify` nach jedem Report, Deploy + Live-Smoke nach jeder Welle.

## 13. Was die Prüfung geändert hat

Zwei unabhängige Gutachten wurden vollständig eingearbeitet — G1 (Verifikations-Review,
WAVE-REVIEW CLEAN mit Auflagen) und G2 (agy-Lane, 9 nummerierte Findings plus ein
zehnter Punkt „qualitative Notizen"). Jeder Befund ist umgesetzt oder hier begründet
zurückgewiesen; nichts ist stillschweigend übergangen.

**Umgesetzt:**

- **G2-5 (Text-Kappung):** Frage-Snapshot von 80 auf 160 Zeichen erhöht, sichtbarer
  „…"-Marker bei Kürzung (3.2, 5.5, 7, AK 17).
- **G2-6 (Schema-Versionierung):** Unknown-`v`-Verhalten des Clients spezifiziert — nur
  `v == 1` wird gerendert, alles andere fällt in `attempt-detail-unknown` (3.2, 5.5,
  AK 16); der WP-E0-Typ modelliert `v` als Literal `1` mit explizitem Fallback.
- **G2-3 (Export-Audit):** Baseline angenommen — neuer fire-and-forget-Endpunkt
  `POST /api/evaluation/export-log` mit genau einer personenfreien tracing-Zeile (4.5,
  6.1, 7, AK 18); die persistente Audit-Tabelle bleibt verneint, der Standard von
  offener Frage 6 ist entsprechend angehoben.
- **G2-8 (Drilldown-a11y):** `aria-expanded`/`aria-controls` + Tastatur sind Pflicht
  der neuen Flächen (5.3, AK 19). Teil-Entwarnung am Bestand: `ListRow` bringt die
  `aria-expanded`-Prop und einen nativen `<button>`-Trigger bereits mit
  (`packages/web/src/features/manager/components/console/ListRow.tsx:38, 138,
  166-176`) — keine Generator-Änderung nötig, nur konsequente Nutzung.
- **G2-9, Dialog-Teil (sr-Labels):** Urteils-Icons `aria-hidden`, das sichtbare
  Textlabel ist die zugängliche Beschreibung (5.5, AK 19).
- **G2-10 (qualitative Notizen):** explizit als Nicht-Ziel aufgenommen (9) — vorher
  weder Feature noch Ausschluss.
- **G1 (player_name-Servertest):** neues Abnahmekriterium 15 — gezielte Zuweisungen
  speichern nie Client-Freitext als `player_name`; das war bisher nur implizit über
  AK 4 abgedeckt.
- **G1 (Index-Nachweis):** `EXPLAIN`-Pflicht der 4.1-Query im Live-Gate, erwarteter
  023-Index benannt (4.1).
- **G2-4 (Aufbewahrungsfrist), teilweise:** weiterhin kein Löschjob in dieser Welle
  (Produktentscheidung löschen vs. anonymisieren), aber heraufgestuft zum benannten
  Betriebs-Blocker: die Entscheidung muss vor dem Produktiveinsatz an echten Klassen
  fallen (7, offene Frage 7).

**Begründet zurückgewiesen:**

- **G2-1 (Antworttexte speichern):** abgelehnt für diese Welle. Der didaktische Preis
  ist real und steht jetzt ehrlich im Dokument (offene Frage 9) — aber Freitext
  Minderjähriger (bis 10 000 Zeichen pro Antwort) zu persistieren ist eine
  Datenschutz-Entscheidung des Projektinhabers, keine Standardannahme. Der
  versionierte `answers`-Container plus Unknown-v-Fallback macht die Nachrüstung
  bruchfrei möglich; es braucht keine Code-Vorleistung.
- **G2-2 (Fragen-Aggregation „Nach Aufgabe"):** abgelehnt für diese Welle — die
  bindenden Vorgaben (zwei Reiter, Frageebene je Kind, drei Zusatzfunktionen) nennen
  sie nicht; YAGNI. Als offene Frage 10 mit additivem Nachrüstpfad dokumentiert: das
  gespeicherte Format trägt mit `i`/`verdict` bereits alles Nötige.
- **G2-7 (Reiter-Default):** Standard bleibt „Nach Kind" (offene Frage 1, dort um das
  Gegenargument ergänzt); wegen localStorage wirkt der Default nur beim allerersten
  Aufruf, die Gleichwertigkeit (Vorgabe 1) ist davon unberührt. Telemetrie zur
  Default-Findung abgelehnt: Nutzungs-Tracking in einer Kinderdaten-Fläche
  widerspricht der Datensparsamkeits-Linie dieser Spec.
- **G2-9, Pill-Teil (FilterPill-Tastatur):** Fehlalarm gegen den Bestand —
  `FilterPill` ist ein natives `<button type="button">` mit `aria-pressed` und
  `focus-visible`-Outline (`packages/web/src/components/manager/FilterPill.tsx:25-29`);
  Enter/Space und Fokusreihenfolge kommen vom Element selbst. Ein Umbau auf
  `role="radio"` wäre eine Verschlechterung gegenüber dem projektweiten
  `aria-pressed`-Muster.

**Von G1 bestätigt, unverändert:** der fehlende Owner-Check auf
`GET /api/assignment/:id/results` ist ein akutes Loch im Bestand (`assignments.rs:271`,
nur Rollen-Gate) und bleibt harter Deploy-Blocker vor WP-E3 (4.4, 7, AK 4); die
Portal-W1-Abhängigkeit und die Reihenfolge „E0/E1 sofort, Fläche danach" gelten
unverändert (12).
