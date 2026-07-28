# SDD: Solo-Quiz Klassen-/Schüler-Zuweisung

Status: Entwurf (Spec-Phase, kein Code geschrieben)
Datum: 2026-07-28
Bezug: Wunsch des Projektinhabers — "soloquiz sollen direkt über
https://rust.razzoozle.xyz/manager/config/play einer klasse oder einzelnen schüler zugeordnet
werden können."

---

## 1. Worum es geht

Eine Lehrkraft wählt heute im Manager-Tab `/manager/config/play` ein Quiz aus und kann es entweder
sofort live starten oder einen anonymen, ungeschützten Solo-Link kopieren
(`packages/web/src/features/manager/components/configurations/ConfigSelectQuizz.tsx:150-163`) — wer
den Link öffnet, spielt unter einem selbstgewählten Namen, ohne dass die Lehrkraft weiss, wer genau
teilgenommen hat. Diese Spec beschreibt, wie stattdessen ein Solo-Quiz gezielt einer Klasse oder
einzelnen Schülern zugewiesen wird, sodass Teilnahme und Ergebnis eindeutig einem Kind zugeordnet
sind. Der Backend-Unterbau dafür (Assignment-Tabelle, PIN-Mechanismus, Fristen/Versuchslimits)
existiert grösstenteils bereits, ist aber an keiner Stelle mit Klassen/Schülern oder mit dem
Frontend verdrahtet.

## 2. Was heute schon da ist und wiederverwendet wird

**Assignment-Backend (Rust), existiert, aber unerreichbar:**
- Routen `rust/server/src/http/mod.rs:215-218`: `POST /api/assignment`, `GET /api/assignment/:id`,
  `GET /api/assignment/:id/results`, `POST /api/assignment/:id/validate-pin`.
  (Der Auftrag nennt `/api/assignments` — der tatsächliche Pfad im Code ist Singular
  `/api/assignment`.)
- Rollen-Gate `role_may_manage_assignments` (`rust/server/src/http/assignments.rs:71-73`): nur
  `admin`/`lehrkraft`, `user`-Rolle wird abgelehnt — direkt wiederverwendbar.
- `owner_id` ist auf `assignments` bereits vorhanden (`db/migrations/008_owner_scoping.sql:20`) und
  wird beim Erzeugen aus dem Session-Token gesetzt (`assignments.rs:124-133`) — die Infrastruktur
  für Besitzer-Scoping ist da, wird aktuell aber nur beim Schreiben, nicht beim Lesen genutzt (siehe
  Abschnitt 4).
- Fristen/Versuchslimits aus #471 sind bereits serverseitig durchgesetzt: `deadline_passed` und
  `attempt_limit_reached` (`rust/server/src/http/solo.rs:424-441`), angewendet in
  `handle_solo_score` (`solo.rs:569-609`) gegen `assignments.metadata`. Das bleibt unverändert
  wiederverwendbar — neue Zuweisungen tragen `deadline`/`maxAttempts` weiter im selben
  `metadata`-JSONB (`assignments.rs:140-154`).
- PIN-Validierung `validate_student_pin` (`rust/server/src/db/pins.rs:70-99`) und
  `create_solo_session` (`pins.rs:44-64`) sind fertig implementiert, inklusive Rate-Limiting
  (`assignments.rs:172-179`) und konstant-förmigen Fehlern (kein Oracle). Die Tabelle
  `solo_sessions` (`db/migrations/015_student_pins.sql:10-18`) hat bereits die korrekten
  Fremdschlüssel auf `assignments(id)` und `students(id)` — genau die Form, die für "wer spielt hier
  gerade" gebraucht wird.
- Der Klassen-PIN-Login aus dem Live-Modus (`packages/web/src/features/game/components/join/
  Username.tsx:93-122,196-269`, serverseitig `validate_student_pin_plain`, `pins.rs:105-124`) ist
  strukturell dasselbe Muster (Namen aus Roster wählen, 4-Emoji-PIN eingeben) und wird als Vorbild
  für den Zuweisungs-Login übernommen, nicht neu erfunden.

**Klassen/Schüler-Schema, sauber und direkt nutzbar:**
- `classes`/`students` mit `owner_id` (`db/migrations/011_classes.sql:10-23`), m:n-Verknüpfung
  `class_students` (`db/migrations/014_class_students_junction.sql:14-21`), Soft-Active-Flags
  `classes.active`/`students.active` (`db/migrations/021_classes_active.sql:11-12`,
  `022_students_active.sql:11-12`).
- `useClassManager()` liefert `classes` UND `allStudents` in einem Hook-Aufruf
  (`packages/web/src/features/manager/components/configurations/klassen/useClassManager.ts:47,343`).
  `ConfigSelectQuizz.tsx:32` importiert den Hook bereits, destrukturiert aber nur `classes` — kein
  neuer Fetch nötig, nur eine zusätzliche Destrukturierung.
- Roster-Query mit Owner-Scoping existiert schon als Vorbild:
  `students_with_pins` (`pins.rs:130-157`) joint `class_students`/`classes` mit
  `WHERE cs.class_id = $1 AND c.owner_id = $2` — exakt die Prüfung, die die neue
  Zuweisungslogik für "nur eigene Klassen" braucht.

**UI-Bausteine zum Wiederverwenden statt Neubau:**
- Tri-State-Checkbox-Dialog für Klassenauswahl:
  `packages/web/src/features/manager/components/configurations/schueler/ConfigSchueler.tsx:86-164,
  476-546` (`Checkbox` mit `indeterminate`, `DialogPanel`, gefilterte aktive Klassen).
- Such+Listen-Picker für Einzelschüler:
  `packages/web/src/features/manager/components/configurations/klassen/StudentPicker.tsx:36-131`
  (aktuell Einzelauswahl für `MOVE_STUDENT`, für Mehrfachauswahl erweiterbar).
- Clipboard-Toast-Pattern: `handleCopySoloLink`, `ConfigSelectQuizz.tsx:150-163`.
- `ActionFooter`-Button-Reihe, `ConfigSelectQuizz.tsx:354-389`.

**Ausdrücklich NICHT betroffen:** `klassenMode`/`classId` in `ConfigSelectQuizz.tsx:36-37,276-320`
ist ein Live-Spiel-Startparameter für `EVENTS.GAME.CREATE` (`ConfigSelectQuizz.tsx:140-148`,
serverseitig `rust/server/src/socket/manager/classes.rs`, nicht gelesen für diese Spec) — ein
unabhängiger Codepfad, der unverändert bleibt.

## 3. Datenmodell

### Empfehlung: Variante B — Schüler-Snapshot (Fan-out)

Jeder Zuweisungsakt ("Quiz X der Klasse Y zuweisen" oder "Quiz X den Schülern A, B zuweisen")
erzeugt **eine `assignments`-Zeile pro Zielschüler**, verknüpft über eine gemeinsame Gruppen-ID.
"Einzelner Schüler" ist dabei kein Sonderfall, sondern derselbe Fan-out mit Rostergrösse 1.

```sql
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS assigned_student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assignment_group_id UUID,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assignments_student ON assignments(assigned_student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_group ON assignments(assignment_group_id);
```

- `assigned_student_id`: das eigentliche Ziel. Nullable, damit bestehende (und weiterhin erlaubte,
  siehe Nicht-Ziele) anonyme Zuweisungen ohne Ziel unverändert funktionieren.
- `assignment_group_id`: rein organisatorisch — fasst die N Zeilen eines Zuweisungsakts zusammen,
  damit die Lehrkraft Frist/Status als eine Einheit sieht und bearbeitet
  (`UPDATE assignments SET metadata = ... WHERE assignment_group_id = $1`). Kein Fremdschlüssel auf
  `classes(id)`, bewusst — siehe Randfall "Klasse wird gelöscht" in Abschnitt 8.
- `revoked_at`: weiche Rücknahme statt Hard-Delete (Begründung: gleiche Philosophie wie
  `classes.active`/`students.active`, 021/022 — Ergebnishistorie bleibt erhalten, siehe Abschnitt 8).

**Verworfene Alternative — Variante A (dynamische Klassen-Referenz):** eine Spalte
`assigned_class_id BIGINT REFERENCES classes(id)`, ein `assignments`-Datensatz pro Zuweisungsakt,
Mitgliedschaft wird bei jeder PIN-Prüfung/jedem Submit live gegen `class_students` aufgelöst.

**Begründung gegen A:**
1. Migration 015 entfernt ausdrücklich den Orphan-Cleanup-Trigger aus 014 mit der Begründung
   "students are now first-class entities (own PIN, own history)"
   (`db/migrations/015_student_pins.sql:4-7`) — Schüler-Identität ist im Repo bewusst von der
   aktuellen Klassenmitgliedschaft entkoppelt. A würde das für Zuweisungen umkehren.
2. Unter A verschwindet ein Kind, das die Klasse verlässt, rückwirkend und stillschweigend aus der
   "wer hat bearbeitet"-Auswertung der Lehrkraft, obwohl nichts an seiner Bearbeitung passiert ist.
3. A braucht eine Live-Zugriffsprüfung gegen `class_students` an jeder Konsumstelle (PIN-Validierung,
   Submit) — diese Prüfung existiert nirgends im heutigen Code; B braucht nur einen trivialen
   Gleichheitsvergleich `assigned_student_id = $student_id`.
4. B passt exakt auf die bereits vorhandene, aber unverdrahtete `solo_sessions`-Tabelle, deren FK
   bereits "ein Assignment gehört zu genau einem Schüler" voraussetzt
   (`db/migrations/015_student_pins.sql:12-13`).
5. A's einziger Vorteil — ein Edit statt N für Fristen — ist über `assignment_group_id` ohne
   Schemakosten nachgebaut.

### Umgang mit `assigned_to`

`assigned_to VARCHAR(100)` (`db/migrations/001_initial_schema.sql:203`) ist an der einzigen
Schreibstelle im gesamten Rust-Backend hart auf `NULL` gebunden
(`assignments.rs:157-158: "... VALUES ($1, $2, NULL, ...)"`); `CreateAssignmentRequest`
(`assignments.rs:31-42`) hat kein Feld, das diese Spalte je befüllen könnte. Die alte
JSON-Speicherschicht, die diese Tabelle laut Kommentar ersetzt ("replaces config/assignments/*.json",
`001_initial_schema.sql:199`), kennt laut Dateinamensmuster in `config/assignments/` (nicht
Produktionsdaten, e2e-Fixtures) ebenfalls kein `assignedTo`-Feld. Die Spalte ist damit mit sehr
hoher Sicherheit durchgehend `NULL` — **nicht geprüft**: die tatsächliche Zeilenzahl/den Inhalt der
produktiven Postgres-`assignments`-Tabelle habe ich aus diesem Read-Only-Zugriff nicht einsehen
können; vor dem Rollout einmalig per `SELECT COUNT(*) FROM assignments WHERE assigned_to IS NOT
NULL` verifizieren, nicht annehmen.

Migration in zwei getrennten Schritten:
1. Additiv, sofort: neue Spalten NULLABLE, kein Backfill nötig (siehe oben), kein harter
   `CHECK`-Constraint auf Anhieb — Alt-Zeilen (`assigned_student_id`/`assignment_group_id` = NULL)
   bleiben so nutzbar, wie sie es vorher waren.
2. Separat, zeitversetzt: `assigned_to` und ihren Index
   (`idx_assignments_quiz_id_assigned_to`, `001_initial_schema.sql:211`) droppen. Bewusst nicht im
   selben Schritt wie 1, damit eine falsche Annahme über "die Spalte ist tot" nicht denselben
   Rollback betrifft wie die neuen, produktiv genutzten Spalten.

### Nachgelagert, nicht Teil dieser Migration

`solo_results` hat keine `student_id`-Spalte, nur `player_name VARCHAR(100)` Freitext
(`001_initial_schema.sql:89-99`), roh vom Client übernommen (`solo.rs:625`,
`.bind(&payload.player_name)`). Unter Variante B ist das für die Auswertung **nicht blockierend**
(Begründung in Abschnitt 7), aber für strukturelle Integrität wünschenswert als eigenes Folge-WP:
`ALTER TABLE solo_results ADD COLUMN student_id BIGINT REFERENCES students(id) ON DELETE SET NULL`
(nullable, damit anonymes Solo-Spiel ohne Zuweisung weiter funktioniert).

## 4. Server: Endpunkte und Autorisierung

### Geändert

**`POST /api/assignment`** (`assignments.rs:96-170`, `handle_create_assignment`):
`CreateAssignmentRequest` (`assignments.rs:31-42`) bekommt zwei neue optionale Felder,
`classId: Option<i64>` und `studentIds: Option<Vec<i64>>` — genau eines von beiden muss gesetzt sein
(sonst `400 Bad Request`). `classId` löst serverseitig zur Roster-Fan-out-Liste auf (analog
`students_with_pins`, `pins.rs:130-157`); `studentIds` wird direkt verwendet (deckt "einzelner
Schüler" als `[id]` und "mehrere Schüler ohne ganze Klasse" ab, ohne einen dritten Fall im Schema zu
brauchen). Für jeden Zielschüler wird eine `assignments`-Zeile mit gemeinsamer
`assignment_group_id` (neu erzeugte UUID) angelegt. `CreateAssignmentResponse` (`assignments.rs:
44-46`, heute nur `{ id }`) wird zu `{ groupId, assignmentIds }`, da kein Client-Callsite diesen
Endpunkt aktuell aufruft (verifiziert, siehe Abschnitt 2) — kein Kompatibilitätsrisiko.
`packages/common/src/validators/assignment.ts:6-14` (`assignmentValidator`) bekommt dieselben zwei
optionalen Felder gespiegelt.

**Autorisierung, ausdrücklich:**
- Rollen-Gate bleibt `role_may_manage_assignments` (`assignments.rs:71-73`, unverändert).
- **Neu, zwingend:** bevor die Fan-out-Liste aufgelöst wird, muss geprüft werden, dass
  `classes.owner_id` bzw. jedes `students.owner_id` in `studentIds` mit dem `owner_id` des
  aufrufenden Session-Users übereinstimmt (`owner_id`-Extraktion bereits vorhanden,
  `assignments.rs:124-133`; Vergleichsmuster bereits vorhanden, `pins.rs:150` —
  `WHERE cs.class_id = $1 AND c.owner_id = $2`). Ohne diese Prüfung könnte eine Lehrkraft ein Quiz
  der Klasse einer anderen Lehrkraft zuweisen — das ist eine echte Sicherheitslücke, kein
  Nachtrag. Verstoss → `403 Forbidden`, keine Teilzuweisung.
- Inaktive Klassen/Schüler (`classes.active`/`students.active`, 021/022) werden beim Fan-out
  serverseitig ausgeschlossen (analog zum bestehenden Ausschluss bei Login/Join).

**`GET /api/assignment/:id/results`** (`assignments.rs:266-315`, `handle_get_assignment_results`):
prüft heute nur das Rollen-Gate (`assignments.rs:270`), **keine** Besitzerprüfung — jede Lehrkraft
mit `admin`/`lehrkraft`-Rolle kann aktuell die Ergebnisse jeder beliebigen Assignment-ID einsehen,
auch die einer fremden Lehrkraft, sofern sie die ID kennt oder errät (die ID ist zwar ein opaker
12-Zeichen-String, `assignments.rs:135`, aber das ist kein Ersatz für eine echte Zugriffsprüfung).
**Neu, zwingend:** Owner-Check `assignments.owner_id = session_user.id` ergänzen, `403` bei
Mismatch. Das gilt unverändert weiter für Einzel-Assignment-Abrufe.

**`POST /api/assignment/:id/validate-pin`** (`assignments.rs:172-222`) → `validate_student_pin`
(`pins.rs:70-99`): prüft heute PIN-Match + `active` + `assignment_exists`
(`assignment_exists`-Query, `pins.rs:84-90`), **keine** Zugehörigkeitsprüfung — jeder Schüler mit
gültiger eigener PIN kann sich für jede existierende `assignment_id` validieren, unabhängig davon,
ob er das Ziel dieser Zuweisung ist. **Neu, zwingend** (siehe offene Frage 3, Standardannahme JA):
Query um `AND (a.assigned_student_id IS NULL OR a.assigned_student_id = $student_id)` erweitern —
ungezielte (Alt-)Zuweisungen bleiben offen, gezielte werden auf den Zielschüler beschränkt.

**`handle_solo_score`** (`solo.rs:444-655`): prüft bei vorhandener `assignmentId` heute nur
Deadline/`maxAttempts` (`solo.rs:587-609`), nie Identität. **Neu:** wenn die Assignment ein
`assigned_student_id` trägt, muss der Submit ein gültiges, unverbrauchtes `solo_sessions`-Token
mitbringen (aus `validate-pin`), das serverseitig konsumiert wird (`used = true` setzen,
`solo_sessions.token`/`assignment_id`/`student_id` matchen, `expires_at` prüfen). Ohne gültiges
Token → `403`. Ungezielte Zuweisungen (`assigned_student_id IS NULL`) verhalten sich unverändert
(freier `player_name`, wie heute).

### Neu

- **`GET /api/assignment/group/:groupId`** — liefert Metadaten (Quiz, Frist, `revoked_at`) plus die
  Zielschüler-Liste des Zuweisungsakts. Auth: Rollen-Gate + Owner-Check (`owner_id` einer beliebigen
  Zeile der Gruppe = Session-User, alle Zeilen einer Gruppe tragen denselben `owner_id`, da im
  selben Request erzeugt).
- **`GET /api/assignment/group/:groupId/results`** — join der Fan-out-Zeilen (= Roster-Snapshot)
  gegen `solo_results` per `solo_results.assignment_id = assignments.id`, liefert pro Schüler
  Status ("noch offen" / "abgegeben, Score X, wann"). Auth wie oben. Details Abschnitt 7.
- **`DELETE /api/assignment/:id`** und **`DELETE /api/assignment/group/:groupId`** — setzen
  `revoked_at = now()` (kein Hard-Delete, siehe Abschnitt 8). Auth wie oben.
- **`POST /api/students/:id/session`** und **`GET /api/students/:id/assignments`** — für den
  link-losen Zugang der Lernenden, siehe Abschnitt 6. **Wichtig:** anders als die opake
  `assignment_id` ist `students.id` ein `BIGSERIAL` (`db/migrations/011_classes.sql:18`), also
  sequenziell und erratbar. `GET /api/students/:id/assignments` darf deshalb **nie** ohne gültiges,
  frisch per PIN erzeugtes Token beantwortet werden — sonst kann jeder durch Hochzählen von IDs
  fremde Zuweisungslisten einsehen. Das ist kein Implementierungsdetail, sondern eine
  Zugriffskontroll-Anforderung dieser Spec.

**Grundsatz für die gesamte Fläche:** eine Lehrkraft darf ausschliesslich innerhalb ihrer eigenen
`owner_id`-Domäne zuweisen und auswerten; ein Kind darf ausschliesslich seine eigenen, per PIN
bewiesenen Zuweisungen sehen — nie eine fremde `student_id`, auch nicht durch Erraten der Nummer.

## 5. Manager-Oberfläche

Ort: `/manager/config/play` → `ConfigSelectQuizz.tsx`, im bestehenden Options-Panel neben
`klassenMode` (`ConfigSelectQuizz.tsx:243-351`), als dritte Aktion in der `ActionFooter`
(`ConfigSelectQuizz.tsx:354-389`) — Button "Zuweisen" neben "Spiel starten" / "Solo-Link kopieren".

Ablauf:
1. Quiz auswählen (bestehende Radiogroup, `ConfigSelectQuizz.tsx:223-240`, unverändert).
2. "Zuweisen" öffnet einen Dialog mit zwei Reitern/Modi: "Klasse" und "Schüler" (exklusiv, passend
   zum Wunsch "einer Klasse oder einzelnen Schülern" — nicht kombiniert, siehe Nicht-Ziele).
   - Modus Klasse: Tri-State-Checkbox-Liste wie in `ConfigSchueler.tsx:476-546`, aber ohne
     Indeterminate-Logik (hier reine Auswahl, keine Bulk-Membership) — nur aktive Klassen
     (`filteredActiveClasses`-Muster, `ConfigSchueler.tsx:109-112`).
   - Modus Schüler: `StudentPicker.tsx:36-131`, auf Mehrfachauswahl erweitert (heute Einzelklick für
     `MOVE_STUDENT`) — `allStudents` aus `useClassManager()` ist im Hook-Aufruf der Komponente
     bereits vorhanden (`ConfigSelectQuizz.tsx:32`), muss nur zusätzlich destrukturiert werden.
   - Frist/Versuchslimit: dieselben Felder, die #471 bereits kennt (`assignments.metadata`), als
     optionale Inputs im selben Dialog.
3. Bestätigen → `POST /api/assignment` mit `quizzId` + `classId` **oder** `studentIds` (+ optional
   `deadline`/`maxAttempts`) → Antwort `{ groupId, assignmentIds }`.
4. Rückmeldung: Toast mit Erfolg + Link zur neuen "Aufgabe verwalten"-Ansicht (Abschnitt 7),
   analog zum bestehenden Toast-Pattern (`handleCopySoloLink`, `ConfigSelectQuizz.tsx:150-163`).
   Kein einzelner "Solo-Link" mehr pro Kind kopierbar in dieser Spec — Zugang läuft über den
   link-losen Weg aus Abschnitt 6, nicht über verschickte URLs (das ist eine Änderung gegenüber dem
   heutigen `handleCopySoloLink`-Verhalten, siehe offene Frage in Abschnitt 10).

## 6. Sicht der Lernenden — Aufgaben finden ohne zugeschickten Link

Heute gibt es keinen Ort, an dem ein Kind seine Zuweisungen sieht: die Player-Startseite zeigt nur
Raumcode-Eingabe und einen Trophäen-Link (`packages/web/src/pages/(auth)/index.tsx:32-47`), und
`assignment.$assignmentId.tsx` ist ausschliesslich über eine bekannte `assignmentId` in der URL
erreichbar. Ohne irgendeinen Ankerpunkt (Schule/Klasse) kann ein Kind nicht wissen, in wessen
`owner_id`-Domäne es überhaupt suchen soll — Klassen sind pro Lehrkraft isoliert
(`classes.owner_id`, `011_classes.sql:12`). Ein vollständig link-loser, schulweiter
Self-Service-Zugang würde eine neue, öffentlich adressierbare Klassen-Kennung voraussetzen, die es
heute nicht gibt.

**Vorschlag:** ein dauerhafter, nicht ablaufender Klassen-Code (kurz, für Kinder abtippbar — analog
zum Raumcode-Muster, aber nicht zeitlich begrenzt), den die Lehrkraft einmalig einrichtet und z. B.
im Klassenzimmer aushängt. Neue Route `/my-assignments` (Slug Englisch, UI-Text Deutsch, laut
stehender Regel):
1. Klassen-Code eingeben (öffentlich, rate-limitiert).
2. Namen aus dem Klassen-Roster wählen (`PlayerNameSelect`-Pattern aus `Username.tsx:93-122`).
3. 4-Emoji-PIN eingeben (`EmojiPinInput`-Pattern, dieselbe Komponente wie im Live-Join).
4. Server validiert PIN gegen `students.pin` (`validate_student_pin_plain`, `pins.rs:105-124`,
   bereits produktiv im Live-Modus) und stellt ein kurzlebiges Sitzungs-Token für **diesen
   Schüler** aus (`POST /api/students/:id/session`, neu, Abschnitt 4).
5. `GET /api/students/:id/assignments` (mit Token) liefert die Liste offener, nicht
   zurückgenommener, nicht fristabgelaufener Zuweisungen dieses Schülers.
6. Klick auf einen Eintrag führt in den bestehenden `assignment.$assignmentId`-Flow
   (`packages/web/src/pages/quizz/$id/assignment.$assignmentId.tsx`), diesmal mit dem
   `solo_sessions`-Token im Gepäck statt der heutigen Freitext-`NameScreen`
   (`assignment.$assignmentId.tsx:246-256`).

Das ist die einzige Stelle dieser Spec, die eine neue Schema-Ergänzung ausserhalb von `assignments`
braucht (`classes.join_code`) — als eigene, kleine Migration, nicht Teil von Abschnitt 3. Die genaue
Ausgestaltung (Code-Länge, Regenerierbarkeit, wo die Lehrkraft ihn einsieht) ist Produktentscheidung,
siehe offene Frage 6 in Abschnitt 10.

## 7. Auswertung — wer hat bearbeitet, wer nicht

Weil Variante B pro Zielschüler eine eigene `assignments`-Zeile erzeugt, ist `solo_results.assignment_
id = assignments.id` (Spalte existiert bereits, `db/migrations/005_solo_results_assignment_id.sql:3`)
bereits heute eindeutig einem einzelnen Schüler zuordenbar — **ohne** auf das nachgelagerte
`solo_results.student_id`-WP (Abschnitt 3) warten zu müssen. Der bestehende Query-Stil aus
`handle_get_assignment_results` (`assignments.rs:290-298`, `SELECT ... FROM solo_results WHERE
assignment_id = $1`) bleibt pro Zeile korrekt; neu ist nur die Aggregation über eine ganze Gruppe:

```sql
SELECT a.assigned_student_id, s.display_name, r.score, r.answered_at
FROM assignments a
JOIN students s ON s.id = a.assigned_student_id
LEFT JOIN solo_results r ON r.assignment_id = a.id
WHERE a.assignment_group_id = $1
ORDER BY s.display_name;
```

`r.score IS NULL` → "noch nicht bearbeitet". Kein Join gegen die aktuelle Klassen-Roster nötig — die
Roster-Snapshot-Semantik von Variante B (Abschnitt 3) liefert die Soll-Liste bereits über die
Fan-out-Zeilen selbst.

**Voraussetzung, damit dieser Befund vertrauenswürdig ist, nicht nur plausibel:** die
Identitätsprüfung aus Abschnitt 4 (PIN-Scope + `solo_sessions`-Token-Konsum bei Submit) muss
tatsächlich greifen. Ohne sie zeigt die Auswertung nur "irgendjemand hat unter dieser Assignment-ID
etwas eingereicht" — mit `player_name`, der weiterhin Freitext bleibt, aber wegen der 1:1-Bindung
Assignment↔Schüler nicht mehr zur Identifikation gebraucht wird, sondern nur noch als Anzeigefeld.

## 8. Randfälle

- **Kind wechselt die Klasse während laufender Bearbeitung:** unter Variante B unbetroffen — die
  Zuweisung hängt an `assigned_student_id`, nicht an der Klassenmitgliedschaft. Das Kind spielt zu
  Ende, die Auswertung bleibt korrekt. (Standardannahme, siehe offene Frage 2.)
- **Zuweisung wird zurückgenommen:** `revoked_at` wird gesetzt (Abschnitt 3/4), kein Hard-Delete.
  `handle_solo_score` und `validate_student_pin` müssen `revoked_at IS NULL` zusätzlich zur
  bestehenden Deadline-/Attempt-Prüfung berücksichtigen. Bereits eingereichte `solo_results` bleiben
  für die Auswertung sichtbar.
- **Klasse wird gelöscht:** `assignment_group_id` ist absichtlich kein Fremdschlüssel auf
  `classes(id)` (Abschnitt 3) — ein Löschen der Klasse hat keine Kaskaden-Wirkung auf bestehende
  Zuweisungen oder Ergebnisse, da jede Fan-out-Zeile über `assigned_student_id` direkt am Schüler
  hängt. Die Gruppenansicht (Abschnitt 4/7) zeigt in diesem Fall weiterhin die Schülerliste, aber
  keinen Klassennamen mehr (kein Snapshot-Feld vorgesehen, siehe offene Frage 6b).
- **Kind ist in zwei Klassen:** unproblematisch — `class_students` ist bereits m:n
  (`014_class_students_junction.sql:14-21`), eine Klassen-Zuweisung fasst zum Zuweisungszeitpunkt
  die aktuelle Roster beider ggf. überlappenden Klassen zusammen (jede Klassenzuweisung löst
  unabhängig auf).
- **Dieselbe Aufgabe zweimal zugewiesen** (gleicher Schüler, gleiches Quiz, z. B. weil er in zwei
  zugewiesenen Klassen ist, oder weil eine Lehrkraft zweimal zuweist): keine Deduplizierung —
  jede Zuweisung ist eine eigenständige Zeile mit eigener Frist/eigenem Versuchslimit und eigenem
  Ergebnis-Slot. In der "meine Aufgaben"-Liste (Abschnitt 6) erscheinen entsprechend zwei Einträge.
  (Standardannahme, siehe offene Frage 5 — Dedup-Logik wäre zusätzliche Komplexität ohne
  expliziten Bedarf.)

## 9. Nicht-Ziele

- Keine Änderung am Live-Klassenmodus (`klassenMode`/`EVENTS.GAME.CREATE`,
  `ConfigSelectQuizz.tsx:140-148,276-320`, `rust/server/src/socket/manager/classes.rs`) — separater,
  unberührter Codepfad.
- Kein Multi-Klassen-Ziel pro Zuweisungsakt — der Wunsch spricht von "einer Klasse", nicht mehreren
  gleichzeitig; bei Bedarf später über weiteren Fan-out unter neuer `assignment_group_id`
  nachrüstbar, ohne Schemaänderung.
- Keine automatische Nachzügler-Aufnahme in laufende Klassen-Zuweisungen (kein Live-Join gegen
  `class_students`, siehe Begründung Variante B).
- Keine Änderung des anonymen, ungezielten Solo-Spiels (`/quizz/:id/solo`) — bleibt wie heute
  Freitext-Name, kein PIN-Zwang, keine Zuordnung.
- Kein `solo_results.student_id`-Backfill in dieser Migration — eigenes Folge-WP (Abschnitt 3/12),
  für Variante B nicht blockierend (Abschnitt 7).
- Keine E-Mail-/Push-Benachrichtigung bei neuer Zuweisung.
- Kein Redesign des Auth-/Session-Systems für Lernende — der Klassen-Code-Login (Abschnitt 6) ist
  ein eigenständiger, leichtgewichtiger Mechanismus neben `users`/Sessions, kein Ersatz dafür.

## 10. Offene Produktfragen, mit umkehrbarer Standardannahme

1. **Nachzügler-Sync:** später beigetretene Klassenmitglieder automatisch mit aufnehmen?
   Standardannahme: **nein**, reiner Snapshot. Umkehrbar über einen späteren "fehlende Mitglieder
   nachtragen"-Button (weitere Fan-out-Zeilen, keine Schemaänderung).
2. **Zugriff nach Klassenaustritt:** darf ein Kind eine laufende Zuweisung nach Klassenwechsel zu
   Ende spielen? Standardannahme: **ja** (folgt strukturell aus Variante B). Umkehrbar durch eine
   zusätzliche Live-Prüfung, ohne Datenmodelländerung.
3. **PIN-Scope-Schliessung:** wird `validate_student_pin` zwingend um die Zielprüfung erweitert?
   Standardannahme: **ja, zwingend** — ohne sie ist `assigned_student_id` nur Reporting-Metadatum,
   keine Zugriffskontrolle.
4. **Inaktive Klassen/Schüler beim Zuweisen ausschliessen:** Standardannahme: **ja**, analog zu
   Login/Join.
5. **Mehrfachzuweisung derselben Aufgabe:** deduplizieren? Standardannahme: **nein** (Abschnitt 8).
6. **Klassen-Code für den link-losen Zugang** (Abschnitt 6):
   a) Format/Länge/Regenerierbarkeit — Standardannahme: 6-stelliger alphanumerischer Code, von der
      Lehrkraft in den Klasseneinstellungen einsehbar und regenerierbar (invalidiert alte Codes
      nicht rückwirkend, nur für neue Logins).
   b) Klassenname-Snapshot auf zurückgenommenen/gelöschten Gruppen anzeigen? Standardannahme:
      **nein** — zusätzliches Feld ohne aktuellen Bedarf, YAGNI.
7. **`solo_results.student_id`-Backfill:** eigenes Folge-WP, ja oder auf unbestimmte Zeit
   zurückgestellt? Standardannahme: **ja, als Folge-WP**, nicht blockierend für diese Spec.
8. **"Solo-Link kopieren" nach dieser Änderung:** bleibt der ungezielte Link
   (`handleCopySoloLink`, `ConfigSelectQuizz.tsx:150-163`) als dritte, unabhängige Option neben
   "Zuweisen" bestehen? Standardannahme: **ja**, unverändert — er bedient einen anderen Bedarf
   (schnelles anonymes Teilen) und wird von dieser Spec nicht ersetzt oder entfernt.

## 11. Testbarkeit

Test-Verzeichnis: `source/e2e/` (ausserhalb des pnpm-Workspace, eigener Install/Runner).

Vorgeschlagene `data-testid`s (Muster wie bestehend, z. B. `class-select`,
`ConfigSelectQuizz.tsx:301`, `quizz-start-btn`, `ConfigSelectQuizz.tsx:355`):
- `assign-btn` — neuer Footer-Button.
- `assign-mode-class` / `assign-mode-students` — Modus-Umschalter im Dialog.
- `assign-class-checkbox-<id>` — pro Klasse in der Tri-State-Liste.
- `assign-student-checkbox-<id>` — pro Schüler im Picker.
- `assign-confirm-btn` — Bestätigen im Dialog.
- `assign-group-row-<studentId>` — Zeile in der Gruppen-Auswertung (Abschnitt 7).
- `my-assignments-class-code-input`, `my-assignments-name-select`, `my-assignments-pin-input` —
  Login-Schritte auf `/my-assignments`.
- `my-assignments-list-item-<assignmentId>` — Aufgabenliste.

Abnahmekriterien (auszugsweise, prüfbar):
- Lehrkraft A kann eine Klasse zuweisen, die ihr gehört; `POST /api/assignment` mit einer `classId`
  einer fremden Lehrkraft liefert `403`, es wird keine Zeile angelegt.
- Nach Zuweisung an eine Klasse mit N aktiven Schülern existieren genau N `assignments`-Zeilen mit
  derselben `assignment_group_id`; inaktive Klassenmitglieder erzeugen keine Zeile.
- Ein Schüler kann sich nur für seine eigene, ihm zugewiesene `assignmentId` per PIN validieren;
  Validierung gegen eine fremde `assignmentId` mit korrekter eigener PIN liefert `403`.
- `handle_solo_score` lehnt einen Submit ohne (oder mit bereits verbrauchtem) `solo_sessions`-Token
  für eine gezielte Zuweisung ab.
- `GET /api/students/:id/assignments` liefert `401`/`403` ohne gültiges Token, auch wenn `:id` eine
  existierende, aber fremde Schüler-ID ist.
- Gruppen-Auswertung zeigt für einen Schüler, der nicht abgegeben hat, `score: null`/"offen"; nach
  Submit erscheint sein Ergebnis, ohne dass sich die Zeile eines anderen Schülers ändert.
- Klassenwechsel eines Kindes während offener Bearbeitung ändert weder Sichtbarkeit der Zuweisung
  in der Gruppen-Auswertung noch die Spielbarkeit des bereits begonnenen Versuchs.
- Zurückgenommene Zuweisung (`revoked_at` gesetzt) lässt keinen neuen Submit mehr zu, bereits
  vorhandene Ergebnisse bleiben in der Auswertung sichtbar.

## 12. Reihenfolge der Umsetzung

0. Migration: `assignments.assigned_student_id`/`assignment_group_id`/`revoked_at` (additiv,
   nullable) + `classes.join_code` (für Abschnitt 6). `assigned_to`-Drop als separate,
   spätere Migration.
1. Server: `CreateAssignmentRequest`/`assignmentValidator` erweitern, Fan-out-Logik,
   Owner-Check beim Zuweisen (Abschnitt 4). Besitzt den gemeinsamen Contract-Typ in
   `packages/common/src/validators/assignment.ts` mit.
2. Server: PIN-Scope-Schliessung in `validate_student_pin` + Token-Konsum in `handle_solo_score`
   (Abschnitt 4) — Voraussetzung für eine vertrauenswürdige Auswertung.
3. Server: Owner-Check auf `GET /api/assignment/:id/results` nachziehen; neue Endpunkte
   `GET/DELETE /api/assignment/group/:groupId`, `GET /api/assignment/group/:groupId/results`.
4. Server: `POST /api/students/:id/session`, `GET /api/students/:id/assignments`,
   Klassen-Code-Auflösung (Abschnitt 6).
5. Web: Zuweisen-Dialog in `ConfigSelectQuizz.tsx` (Abschnitt 5), ruft WP 1 auf.
6. Web: Gruppen-Auswertungsansicht für die Lehrkraft (Abschnitt 7), ruft WP 3 auf.
7. Web: `/my-assignments`-Route (Abschnitt 6), ruft WP 4 auf; `assignment.$assignmentId.tsx` um
   Token-Übergabe statt Freitext-`NameScreen` erweitern.
8. Folge-WP, unabhängig terminierbar: `solo_results.student_id`-Spalte + Umstellung der
   Freitext-Zuordnung (Abschnitt 3, offene Frage 7) — verbessert Datenintegrität, ist aber für
   Abschnitt 7 dieser Spec nicht blockierend.

Reihenfolge 0→1→2→3 ist eine harte Kette (Server-Kern vor Client); 5/6/7 können parallel auf dem
jeweils fertigen Server-WP aufsetzen; 8 ist jederzeit später einschiebbar.
