# SDD: Schülerportal und Solo-Zuweisung (konsolidiert)

Status: Entwurf (Spec-Phase, kein Code geschrieben)
Datum: 2026-07-28
Konsolidiert aus: `docs/sdd/2026-07-28-solo-assignment-targets.md` (Zuweisungs-Datenmodell,
Manager-Flow) und `docs/sdd/2026-07-28-solo-multiplayer-parity.md` (Befund #7: Lehrkraft-
Auswertung fehlt vollständig). Beide Zulieferungen wurden am Code nachgeprüft; Korrekturen
sind in Abschnitt 2 sichtbar markiert. Dieses Dokument ersetzt die Zuweisungs-Spec als
verbindliche Fassung und erweitert sie um das Schülerportal.

Vorgaben des Projektinhabers (entschieden, nicht mehr zu diskutieren):
1. Zuweisung an eine Klasse heisst: **alle Mitglieder müssen die Aufgabe lösen**, Fortschritt
   wird je Kind geführt.
2. Es gibt ein **Schülerportal**, in dem offene Aufträge sichtbar sind.
3. Die Oberfläche **recycelt die Manager-Bausteine** (Console-Primitives, Dialoge, PIN-UI) —
   modular, kein Neuerfinden.
4. UI-Governance aus `AGENTS.md` gilt: neue Komponenten über `pnpm g:*`, keine harten
   Hex-Farben, nur gemappte Token-Utilities, Pflicht-Verifikationskette vor "fertig".

---

## 1. Worum es geht

Eine Lehrkraft kann heute ein Solo-Quiz nur als anonymen Link teilen — wer ihn öffnet, spielt
unter selbstgewähltem Namen, und die Lehrkraft erfährt nie, welches Kind teilgenommen hat.
Dieser Plan verdrahtet den bereits existierenden, aber unerreichbaren Assignment-Unterbau
(Tabellen, PIN-Prüfung, Fristen) mit Klassen und Schülern: die Lehrkraft weist ein Quiz einer
Klasse oder einzelnen Kindern zu, jedes Kind bekommt einen eigenen Auftrag mit eigenem
Fortschritt. Neu dazu kommt ein Schülerportal, in dem sich ein Kind mit Klassen-Code, Namen
und seinem 4-Emoji-PIN anmeldet, seine offenen, erledigten und abgelaufenen Aufträge sieht und
sie direkt startet — die Lehrkraft sieht spiegelbildlich pro Auftrag, wer gelöst hat und wer
nicht.

## 2. Was heute existiert und wiederverwendet wird

Alle Angaben am Code des Zielworktrees verifiziert (Branch `docs/portal-plan`, Stand 2026-07-28).

### 2.1 Korrekturen an den Zulieferungen (sichtbar)

- **Routenpfad ist Singular:** der Auftrag nennt `POST /api/assignments`; tatsächlich ist es
  `POST /api/assignment` (`rust/server/src/http/mod.rs:215`), daneben
  `GET /api/assignment/:id` (216), `GET /api/assignment/:id/results` (217),
  `POST /api/assignment/:id/validate-pin` (218). Die Targets-Spec hatte das bereits korrigiert.
- **Zeilenangabe PIN-Prüfung:** der Auftrag nennt `db/pins.rs:66-91`; `validate_student_pin`
  liegt tatsächlich auf `rust/server/src/db/pins.rs:70-99` (Doc-Kommentar ab 66). Inhaltlich
  stimmt der Befund: geprüft werden PIN-Match, `students.active` und Assignment-Existenz
  (`pins.rs:84-90`), **nicht** die Adressateneigenschaft.
- **`GET /api/assignment/:id` ist komplett öffentlich** — `handle_get_assignment`
  (`assignments.rs:224-264`) ruft `authorize_manager_request` nirgends auf. Die Targets-Spec
  formulierte missverständlich, für "Einzel-Assignment-Abrufe" gelte ein Owner-Check weiter.
  Richtig ist: die Route ist bewusst ungeschützt, weil die Spieler-Seite sie lädt
  (`packages/web/src/pages/quizz/$id/assignment.$assignmentId.tsx:113-115`). Sie bleibt
  öffentlich, bekommt aber Revoked-Behandlung (Abschnitt 4.1).
- **Submit-Fehler verpuffen stumm:** `finishGame` fängt jeden Fehler des
  `/solo-score`-POSTs ab und tut nichts (`packages/web/src/features/game/stores/solo.ts`,
  catch-Block am Ende von `finishGame`, Kommentar "Score submission failure is non-fatal").
  Für gezielte Aufträge ist das nicht akzeptabel (Frist-/Versuchs-/Token-403 muss das Kind
  sehen) — neuer Pflichtpunkt in Abschnitt 5.6, in keiner Zulieferung enthalten.
- **Parity-Befund #7 bestätigt und präzisiert:** kein einziger Client-Aufruf von
  `POST /api/assignment` oder `GET /api/assignment/:id/results` (Grep über
  `packages/{web,common,mcp}/src`: einziger Treffer ist der GET der Spieler-Seite, s. o.).
  `AssignmentRunner.tsx` (`packages/web/src/features/game/components/answers/`) wird
  ausschliesslich von seinem eigenen Test importiert — in keiner Route gemountet; die
  Assignment-Route mountet stattdessen `SoloAnswers` (`assignment.$assignmentId.tsx:317`).

### 2.2 Backend-Bestand (gebaut, aber unverdrahtet)

- `POST /api/assignment` (`assignments.rs:96-170`): Rollen-Gate `role_may_manage_assignments`
  (`assignments.rs:71-73`, nur `admin`/`lehrkraft`), `owner_id`-Extraktion aus dem
  Session-Token (`assignments.rs:124-133`), opake 12-Zeichen-ID (`assignments.rs:135`),
  `deadline`/`maxAttempts`/`requireIdentifier`/`showCorrectAnswers` in `metadata`-JSONB
  (`assignments.rs:140-154`). **`assigned_to` wird beim INSERT hart auf `NULL` gesetzt**
  (`assignments.rs:156-158`, SQL-Literal `VALUES ($1, $2, NULL, …)`).
- `POST /api/assignment/:id/validate-pin` (`assignments.rs:172-222`): Brute-Force-Schutz
  3 Fehlversuche/60 s je Assignment+IP (`assignments.rs:178-181`,
  `rust/server/src/state/rate_limit.rs:218`), PIN-Formatprüfung (`emoji_pin::is_valid_pin`,
  `rust/server/src/http/emoji_pin.rs:172`), konstant-förmige Fehler. Stellt bei Erfolg ein
  `solo_sessions`-Token aus (`create_solo_session`, `pins.rs:44-64`, TTL 120 min).
- `solo_sessions` (`db/migrations/015_student_pins.sql:10-18`): FKs auf `assignments(id)` und
  `students(id)`, `used`-Flag — **wird nur geschrieben (`pins.rs:51-54`), nirgends gelesen**
  (einziger Treffer in `rust/` ist der INSERT; die Migration vermerkt "consumed by the
  solo-score handler in a later WP" — nie gebaut).
- `handle_solo_score` (`rust/server/src/http/solo.rs:444-655`): serverseitige Score-Neuberechnung
  (SEC-05, `solo.rs:556`), Frist- und Versuchslimit-Gates (`solo.rs:577-612`,
  `deadline_passed` 424-432, `attempt_limit_reached` 434-442), schreibt `player_name` als
  rohen Client-Freitext (`solo.rs:619-631`). Unbekannte `assignmentId` = fail-open
  (Kommentar `solo.rs:574-576`). Keine Identitätsprüfung, kein Token-Konsum.
- `GET /api/assignment/:id/results` (`assignments.rs:266-315`): Rollen-Gate ja
  (`assignments.rs:271`), **kein Owner-Check** — jede Lehrkraft kann Ergebnisse jeder
  Assignment-ID einsehen.
- Schema: `assignments` (`db/migrations/001_initial_schema.sql:200-209`,
  `assigned_to VARCHAR(100)` Freitext ohne FK auf 203, Index 211), `owner_id` seit
  `008_owner_scoping.sql` (auch auf `solo_results`), `solo_results` ohne `student_id`
  (`001:89-99`, `assignment_id` seit `005`), `classes`/`students` (`011`, BIGSERIAL-IDs =
  sequenziell erratbar), m:n `class_students` (`014`), `students.pin` = 4-Emoji-Klartext,
  lehrkraftsichtbar per Design (`015:1`), Orphan-Trigger seit 015 entfernt (Schüler überleben
  Klassenlöschung), `active`-Flags (`021`/`022`), Namens-Unique je Owner (`016`).
- Live-Klassen-Login als Muster: Roster serverseitig via `students_with_pins`
  (`pins.rs:130-157`, Owner-Scoping `WHERE cs.class_id = $1 AND c.owner_id = $2`; Aufrufer
  `rust/server/src/socket/player/login.rs:394-398`), PIN-Klartextprüfung
  `validate_student_pin_plain` (`pins.rs:105-124`, inaktiv ⇒ `Ok(false)` ohne Oracle).
- Emoji-PIN-Infrastruktur: kuratiertes Set ≥256 Einträge (`emoji_pin.rs:5`), öffentliche
  Route `GET /api/emoji-pin-set` (`mod.rs:220`).
- Wire-Typen: `assignmentValidator` (`packages/common/src/validators/assignment.ts:6-14`),
  `SoloScoreRequest` (`solo.rs:137-…`), `SoloScoreEntry`
  (`packages/common/src/types/game/index.ts:170-174`).

### 2.3 Frontend-Bestand zum Recyceln

- `ConfigSelectQuizz.tsx` (`packages/web/src/features/manager/components/configurations/`):
  "Copy Solo Link" baut den assignment-losen Link `/quizz/:id/solo` (150-163, Button 373-388)
  und umgeht den ganzen Mechanismus; `ActionFooter` 354-389; `useClassManager()` wird schon
  aufgerufen, aber nur `classes` destrukturiert (Zeile 32).
- `useClassManager()` liefert `classes` **und** `allStudents` (`klassen/useClassManager.ts:46-47`,
  Return 341-343) — kein neuer Fetch nötig.
- Tri-State-Klassendialog: `schueler/ConfigSchueler.tsx:86-164` (Membership-Berechnung,
  `filteredActiveClasses` 109-112) + 476-546 (DialogPanel + Checkbox-Liste).
- Such+Listen-Picker: `klassen/StudentPicker.tsx:36-131` (Suche, aktive Auswahl, Vorbild für
  die Mehrfachauswahl-Variante).
- Console-Primitives, laut Export-Kommentar "Generic + presentational"
  (`features/manager/components/console/index.ts:1-3`): `ConsoleShell`, `NavItem`, `ListRow`,
  `SectionCard`, `EmptyState`, `SelectableRow`, `rowStyles.ts`, `tokens.css`, `listMotion.ts`.
- PIN-Bausteine: `schueler/PinDialog.tsx` (Grapheme-sichere Anzeige, `symbols[]`-Prärang),
  `schueler/PrintCredentialsDialog.tsx`; Eingabeseite `EmojiPinInput.tsx` und
  `PlayerNameSelect.tsx` (`features/game/components/join/`), Ablauf-Vorbild
  `Username.tsx:93-122` (Login) und 196-269 (Roster-UI, Fehlerbild 170-183).
- Manager-Tab-Registry: `BUILTIN_TABS` + `isTabAllowed` mit `gated: "klassenEnabled"`
  (`features/manager/components/configurations/index.tsx:85-201, 205-…`).
- Generatoren (`scripts/generate-component.mjs`): `g:console` →
  `features/manager/components/console/`, `g:player` → `features/game/components/player/`,
  `g:menu` → `components/manager/`. Scaffold dort, danach ggf. in den Feature-Ordner der
  Geschwisterkomponenten verschieben (bestehende `ConfigXxx` liegen in `configurations/`).
- Routen sind file-based (TanStack); `route.gen.ts` ist Generat — neue Route = neue Datei
  unter `src/pages/`, nie von Hand in route.gen.ts.
- i18n: 6 Locales (de/en/es/fr/it/zh) × 8 Namespaces; **kein** `assignment`- oder
  `portal`-Namespace — `assignment.$assignmentId.tsx` nutzt `assignment:`-Keys heute nur über
  `defaultValue`. Gate: `scripts/check-locales.sh`.

## 3. Datenmodell

### 3.1 Entscheidung: Schüler-Snapshot (Fan-out), eine Zeile je Kind

Übernommen aus der Targets-Spec (dort Variante B, Begründung §3 — Schüler sind seit
Migration 015 bewusst erstklassige, klassenentkoppelte Entitäten; `solo_sessions` setzt die
1:1-Bindung Assignment↔Schüler bereits voraus). **Sie erfüllt Vorgabe 1 direkt:** die
N Fan-out-Zeilen einer Klassenzuweisung SIND das "je Kind geführte" Fortschritts-Ledger —
"erledigt/offen" ist keine eigene Statusspalte, sondern abgeleitet:
ein Kind-Auftrag ist *erledigt*, sobald mindestens eine `solo_results`-Zeile mit
`assignment_id = <seine Zeile>` existiert; *Punktzahl* = `MAX(score)`,
*Versuche* = `COUNT(*)` (identisch zur bestehenden Versuchszählung `solo.rs:594-601`).

### 3.2 Migration `db/migrations/023_assignment_targets.sql` (additiv, idempotent)

```sql
-- Gezielte Zuweisungen: eine Zeile je Kind, gruppiert je Zuweisungsakt.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS assigned_student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assignment_group_id UUID,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_assignments_student ON assignments(assigned_student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_group   ON assignments(assignment_group_id);
CREATE INDEX IF NOT EXISTS idx_assignments_owner   ON assignments(owner_id);

-- Portal-Zugang: dauerhafter Klassen-Code (lazy erzeugt, Abschnitt 4.3).
ALTER TABLE classes ADD COLUMN IF NOT EXISTS join_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_join_code
  ON classes(join_code) WHERE join_code IS NOT NULL;

-- Portal-Sitzungen: Schüler-Identität für Listen-Abrufe (Hash at rest, Muster 020).
CREATE TABLE IF NOT EXISTS student_sessions (
  id         BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_sessions_student ON student_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_solo_sessions_student    ON solo_sessions(student_id);
```

Semantik der Spalten:
- `assigned_student_id` NULLABLE: `NULL` = ungezielte Alt-/Anonym-Zuweisung (bleibt erlaubt,
  Nicht-Ziele); gesetzt = nur dieses Kind darf einlösen. `ON DELETE CASCADE`: Hard-Delete
  eines Schülers räumt seine Aufträge mit ab — gleiche Philosophie wie der bestehende
  `solo_sessions`-FK (`015:12-13`).
- `assignment_group_id`: fasst die N Zeilen eines Zuweisungsakts; **bewusst kein FK auf
  `classes(id)`** (Randfall "Klasse gelöscht", Abschnitt 8.4).
- `revoked_at`: weiche Rücknahme statt Hard-Delete (Philosophie der `active`-Flags 021/022;
  Ergebnisse bleiben auswertbar).
- `student_sessions.token_hash`: SHA-256-Hex des Tokens, gleiches Format wie die
  User-Sessions seit `020_sessions.sql` (`db/users.rs::hash_token`-Muster) — Klartext-Token
  liegen nie in der DB. TTL 8 h (offene Frage 8). `solo_sessions` bleibt unverändert die
  kurzlebige Pro-Spiel-Einlösung (Klartext-Token, TTL 120 min, `used`-Flag).

### 3.3 Umgang mit vorhandenen Daten

- `assigned_to` ist an der einzigen Schreibstelle hart `NULL` (`assignments.rs:157-158`),
  `CreateAssignmentRequest` (`assignments.rs:31-42`) hat kein Feld dafür. Vor dem Rollout
  einmalig gegen die Prod-DB verifizieren:
  `SELECT COUNT(*) FROM assignments WHERE assigned_to IS NOT NULL` — erwartet 0; bei ≠0 stoppen
  und Befund klären (Übernahme aus der Targets-Spec, dort ausdrücklich als ungeprüfte Annahme
  markiert).
- Kein Backfill nötig: Alt-Zeilen (`assigned_student_id`/`assignment_group_id` = NULL)
  verhalten sich exakt wie bisher.
- **Spätere, getrennte** Migration `024_drop_assigned_to.sql`: `assigned_to` und Index
  `idx_assignments_quiz_id_assigned_to` (`001:211`) droppen — bewusst nicht im selben Schritt,
  damit ein Rollback der neuen Spalten nicht mit dem Drop verheddert. Prod-Spalten vor dem
  Deploy verifizieren (Migrations-Schritt läuft im Rust-CD, `scripts/migrate-apply.sh`).
- `solo_results.student_id` (FK, nullable) bleibt **Folge-WP**, nicht Teil dieser Migration:
  unter dem Fan-out ist `solo_results.assignment_id` bereits eindeutig einem Kind zuordenbar
  (Abschnitt 7); die Spalte verbessert nur strukturelle Integrität.

## 4. Server: Endpunkte, vollständig

Autorisierungs-Grundsatz: Lehrkräfte agieren ausschliesslich in ihrer `owner_id`-Domäne;
Kinder sehen ausschliesslich per PIN/Token bewiesene eigene Daten. `authorize_manager_request`
(`assignments.rs:80-94`) wird so erweitert, dass es den geprüften User (id + role)
**zurückgibt**, statt ihn wegzuwerfen — die heutige zweite Session-Lookup-Runde für die
`owner_id` (`assignments.rs:124-133`) entfällt, und jeder Handler hat den Owner für seine
Scoping-Query. Fehlende/ungültige Session → `401 {"error":"unauthorized"}` (unverändert).

### 4.1 Geänderte Endpunkte

**`POST /api/assignment`** — Request neu (Superset, `assignmentValidator` in
`packages/common/src/validators/assignment.ts` wird gespiegelt erweitert; das WP besitzt
dieses Contract-File mit):

```jsonc
{
  "quizzId": "string",        // Pflicht (wie heute)
  "classId": 12,              // optional — XOR studentIds
  "studentIds": [3, 7],       // optional — XOR classId, nicht leer
  "deadline": 1735689600000,  // optional, epoch ms
  "maxAttempts": 3,           // optional, >= 1
  "showCorrectAnswers": false // optional (metadata, wie heute)
}
```

Verhalten:
- Weder `classId` noch `studentIds` gesetzt → Alt-Verhalten: EINE ungezielte Zeile, Antwort
  `{ "groupId": null, "assignmentIds": ["<id>"] }` (Antwortform ändert sich von `{id}` —
  bruchfrei, da null Client-Callsites, Abschnitt 2.1).
- Beide gesetzt oder `studentIds: []` → `400 {"error":"classId xor studentIds"}`.
- `classId`: Ownership-Gate `SELECT 1 FROM classes WHERE id=$1 AND owner_id=$2 AND active`
  → sonst `403`, keine Teilzuweisung. Fan-out-Roster:
  `SELECT s.id FROM students s JOIN class_students cs ON cs.student_id=s.id
   WHERE cs.class_id=$1 AND s.active` — inaktive Kinder ausgeschlossen (analog Login/Join).
  Leerer Roster → `400 {"error":"class has no active students"}`, nichts angelegt.
- `studentIds`: `SELECT COUNT(*) FROM students WHERE id = ANY($1) AND owner_id=$2 AND active`
  muss = `len(studentIds)` sein, sonst `403` (fremde ODER inaktive ODER unbekannte IDs — eine
  Fehlerform, kein Oracle welche ID scheiterte). Duplikate in der Liste → dedupliziert.
- Fan-out: **eine Transaktion**, je Zielkind eine Zeile (eigene 12-Zeichen-ID nach Bestandsmuster
  `assignments.rs:135`, gemeinsame frische `assignment_group_id` = UUIDv4,
  `assigned_student_id`, `owner_id`, identisches `metadata`). Antwort
  `201 { "groupId": "<uuid>", "assignmentIds": ["a1…","a2…"] }`.
- Quiz unbekannt → `404` (wie heute, `assignments.rs:110-116`); Rolle `user` → `401`
  (SEC-X2a, unverändert).

**`POST /api/assignment/:id/validate-pin`** — Wire unverändert
(`{studentId, pin}` → `{studentToken, expiresAt}`), aber `validate_student_pin`
(`pins.rs:70-99`) schliesst die Adressaten-Lücke; die Existenz-Query (`pins.rs:84-90`) wird zu:

```sql
SELECT EXISTS(
  SELECT 1 FROM assignments a
  WHERE a.id = $1
    AND a.revoked_at IS NULL
    AND (a.assigned_student_id IS NULL OR a.assigned_student_id = $2)
)
```

Ungezielte Alt-Zuweisungen bleiben für jeden gültigen PIN offen; gezielte sind auf das
Zielkind beschränkt; zurückgenommene für alle zu. Fehlerform bleibt konstant
(`403 {"error":"invalid"}` für falschen PIN, fremdes Kind, revoked, inaktiv — kein Oracle),
Brute-Force-Zählung unverändert (`assignments.rs:178-181`).

**`POST /api/quizz/:id/solo-score`** — `SoloScoreRequest` (`solo.rs:137`) und sein
Zod-Spiegel in `packages/common` bekommen `studentToken?: string` (das Payload-WP besitzt
das common-Type-File mit). Ablauf-Erweiterung im bestehenden Assignment-Block
(`solo.rs:577-612`), die Metadata-Query lädt zusätzlich `assigned_student_id, revoked_at`:
1. `revoked_at IS NOT NULL` → `403 "Assignment revoked"` (vor Frist-/Versuchsprüfung).
2. `assigned_student_id IS NULL` → Verhalten exakt wie heute (Freitext-`player_name`).
3. `assigned_student_id` gesetzt → `studentToken` Pflicht, atomarer Konsum ohne TOCTOU:
   ```sql
   UPDATE solo_sessions SET used = true
   WHERE token = $1 AND assignment_id = $2 AND used = false AND expires_at > now()
   RETURNING student_id
   ```
   Kein Treffer (fehlend/fremd/verbraucht/abgelaufen) → `403 "invalid session"`. Das
   zurückgegebene `student_id` muss `assigned_student_id` gleichen (Defense-in-depth; per
   Konstruktion in `create_solo_session` schon gegeben) → sonst `403`.
   `player_name` wird für gezielte Aufträge **serverseitig** aus `students.display_name`
   gesetzt — der Client-Freitext (`solo.rs:625`) wird ignoriert; damit ist die Auswertung
   beweisbar, nicht behauptet. Jeder weitere Versuch braucht ein frisches Token (Portal-
   Session-Mint prüft dabei erneut Frist/Versuche, 4.3).
4. Frist-/Versuchsgates unverändert danach (`deadline_passed`, `attempt_limit_reached`).
   Fail-open für unbekannte `assignmentId` bleibt NUR für den tokenlosen Altpfad bestehen.

**`GET /api/assignment/:id`** — bleibt öffentlich (Spieler-Seite lädt sie,
`assignment.$assignmentId.tsx:113-115`). Neu: `revoked_at` gesetzt → `410 Gone`
(Client zeigt den vorhandenen Closed-Screen); Antwort erhält
`"requiresPin": true|false` (= `assigned_student_id IS NOT NULL`), damit die Spieler-Route
weiss, ob Freitext-`NameScreen` (heute 246-256) oder Token-Pfad gilt. Geleakt wird für eine
erratene ID weiterhin nur `quizzId`+Frist — die ID ist opak (12 Zeichen), und keine
Ergebnis- oder Schülerdaten hängen an dieser Route.

**`GET /api/assignment/:id/results`** — Rollen-Gate bleibt; **neu, zwingend:** Owner-Check
`assignments.owner_id = <session user id>` → `403` bei Mismatch (heute fehlend,
`assignments.rs:266-315`). `404` für unbekannte ID wie heute.

### 4.2 Neue Endpunkte — Manager (alle: Rollen-Gate + Owner-Scope)

**`GET /api/assignment/groups`** → Übersicht aller Zuweisungsakte des Owners:
```jsonc
{ "groups": [ {
    "groupId": "uuid", "quizzId": "…", "subject": "…", "createdAt": 1735…,
    "deadline": 1735… | null, "maxAttempts": 3 | null, "revokedAt": null | 1735…,
    "targetCount": 24, "submittedCount": 17
} ] }
```
SQL-Kern: `assignments WHERE owner_id=$1 AND assignment_group_id IS NOT NULL`, gruppiert nach
`assignment_group_id`, `submittedCount` = Anzahl Zeilen mit `EXISTS(solo_results)`;
`subject` via Join `quizzes`. Sortierung `createdAt DESC`.

**`GET /api/assignment/group/:groupId/results`** → Pro-Kind-Status:
```jsonc
{ "groupId": "uuid", "quizzId": "…", "subject": "…", "deadline": …, "revokedAt": …,
  "students": [ {
     "studentId": 7, "displayName": "Mia K.", "active": true,
     "assignmentId": "ab12…", "status": "done" | "open",
     "bestScore": 4200 | null, "attemptsUsed": 2, "lastSubmittedAt": 1735… | null
} ] }
```
Query (Fan-out-Zeilen = Soll-Liste, kein Live-Roster-Join — Snapshot-Semantik):
```sql
SELECT a.id, a.assigned_student_id, s.display_name, s.active,
       MAX(r.score), COUNT(r.id), MAX(r.answered_at)
FROM assignments a
JOIN students s ON s.id = a.assigned_student_id
LEFT JOIN solo_results r ON r.assignment_id = a.id
WHERE a.assignment_group_id = $1 AND a.owner_id = $2
GROUP BY a.id, a.assigned_student_id, s.display_name, s.active
ORDER BY s.display_name
```
Unbekannte Gruppe bzw. fremder Owner → `404` (kein Existenz-Oracle über fremde Gruppen).

**`DELETE /api/assignment/group/:groupId`** → Rücknahme:
`UPDATE assignments SET revoked_at = now()
 WHERE assignment_group_id=$1 AND owner_id=$2 AND revoked_at IS NULL` —
Antwort `{ "revoked": n }`; idempotent (zweiter Aufruf `{"revoked":0}`, 200); Gruppe
unbekannt/fremd → `404`. Kein Hard-Delete (Abschnitt 8.3).

**`GET /api/classes/:id/join-code`** → `{ "joinCode": "KX7M2P" }` — liefert den Code, erzeugt
ihn lazy beim ersten Abruf (6 Zeichen aus A-Z ohne I/O + 2-9; Kollisone via Unique-Index +
Retry). **`POST /api/classes/:id/join-code/rotate`** → neuer Code, alter sofort ungültig
(bestehende Portal-Sitzungen bleiben gültig — der Code gated nur den Login). Beide: Rollen-Gate
+ `classes.owner_id`-Check → `403`/`404`. Bewusst HTTP statt Socket-Events, damit die gesamte
Zuweisungs-Fläche einen Auth-Mechanismus (`x-manager-token`) nutzt; die Klassen-Tab-UI ruft
sie per fetch auf. (Entscheidung, abweichend vom Socket-CRUD der Klassen — im Review anfechtbar.)

### 4.3 Neue Endpunkte — Schülerportal (öffentlich, rate-limitiert, konstante Fehlerformen)

**`POST /api/portal/roster`** — Body `{ "joinCode": "KX7M2P" }` →
```jsonc
{ "className": "4b", "students": [ { "studentId": 7, "displayName": "Mia K." } ] }
```
Auflösung: `classes WHERE join_code=$1 AND active`; nur aktive Klassenmitglieder
(Join wie `students_with_pins`, `pins.rs:141-145`, aber ohne PINs im Response!), sortiert nach
`display_name`. Unbekannter/inaktiver Code → `404 {"error":"invalid"}`; Rate-Limit über den
bestehenden `check_pin_rate`-Mechanismus, Schlüssel `portal-roster:<ip>`, Fehlversuch zählt.
Exponiert werden nur Anzeigenamen — dieselbe Exposition, die der Live-Klassen-Join heute
bereits über den Raum-Roster hat (`login.rs:394-398` → `SUCCESS_ROOM`).

**`POST /api/portal/login`** — Body `{ "joinCode": "…", "studentId": 7, "pin": "🐟🌲🚀🎈" }` →
```jsonc
{ "portalToken": "<hex128>", "expiresAt": "2026-07-28T18:00:00.000Z",
  "student": { "id": 7, "displayName": "Mia K." } }
```
Prüfkette (jeder Fehlschlag identisch `403 {"error":"invalid"}`, Brute-Force 3/60 s,
Schlüssel `portal:<joinCode>:<ip>`):
1. PIN-Format (`emoji_pin::is_valid_pin`).
2. Klasse per `join_code` (aktiv).
3. `studentId` ist aktives Mitglied GENAU dieser Klasse (`class_students`-Join) — sonst könnte
   ein Kind mit gültigem eigenem PIN über einen fremden Klassen-Code fremde Roster durchproben.
4. `validate_student_pin_plain` (`pins.rs:105-124`).
Token: 128-bit-Hex (Muster `assignments.rs:210`), Ablage NUR als SHA-256-Hash in
`student_sessions`, TTL 8 h.

**`GET /api/portal/assignments`** — Header `Authorization: Bearer <portalToken>` →
```jsonc
{ "student": { "id": 7, "displayName": "Mia K." },
  "open":    [ <entry> ], "done": [ <entry> ], "expired": [ <entry> ] }
// entry:
{ "assignmentId": "ab12…", "quizzId": "…", "subject": "Brüche",
  "assignedAt": 1735…, "deadline": 1735… | null, "maxAttempts": 3 | null,
  "attemptsUsed": 1, "bestScore": 4200 | null, "lastSubmittedAt": 1735… | null }
```
Token-Lookup über `token_hash` + `expires_at > now()` → sonst `401` (Client wirft zur
Anmeldung zurück). Klassifikation serverseitig, eine Query über
`assignments WHERE assigned_student_id = $me` + `LEFT JOIN solo_results`:
- `done`: ≥1 Ergebnis (revoked-done bleibt in done — Geleistetes verschwindet nicht).
- `expired`: kein Ergebnis UND Frist abgelaufen (`deadline_passed`-Semantik, `solo.rs:424-432`).
- `open`: Rest ohne `revoked_at`; revocierte ohne Ergebnis werden **gar nicht** geliefert.

**`POST /api/portal/assignment/:id/session`** — Bearer Portal-Token →
`{ "studentToken": "<hex>", "expiresAt": "…" }` (frische `solo_sessions`-Zeile via
`create_solo_session`, `pins.rs:44-64`, TTL 120 min). Prüfungen in Reihenfolge, Fehler je
eigene Form: Assignment unbekannt → `404`; `revoked_at` → `410`;
`assigned_student_id ≠ <token-student>` (auch NULL) → `403 {"error":"invalid"}`;
Frist abgelaufen → `403 {"error":"deadline"}`; Versuche erschöpft
(`COUNT(solo_results) >= maxAttempts`) → `403 {"error":"attempts"}`. Damit entfällt für
Portal-Nutzer die erneute PIN-Eingabe je Aufgabe; `validate-pin` (4.1) bleibt als
Direktlink-Pfad ohne Portal bestehen.

## 5. Schülerportal

### 5.1 Route und Feature-Ort

- Route: **`/portal`** (Slug Englisch, stehende Regel; UI-Text Deutsch) — neue Datei
  `packages/web/src/pages/portal/index.tsx`; `route.gen.ts` regeneriert beim Build.
- Feature-Code: `packages/web/src/features/portal/` (Komponenten via `pnpm g:player`
  gescaffoldet — Portal = Kind-Gerät = Player-Domain — und dorthin verschoben, Muster
  Abschnitt 2.3).
- Die Player-Startseite (`packages/web/src/pages/(auth)/index.tsx:32-47`) bekommt unter dem
  Trophäen-Link einen zweiten Link "📚 Meine Aufgaben" → `/portal` (gleiches Link-Muster
  Zeilen 40-45).
- Sitzung: `portalToken` + `student` in `sessionStorage` (Schlüssel `portal_session`) —
  bewusst NICHT `localStorage`: Klassenzimmer-Geräte werden geteilt, Tab zu = abgemeldet.
  Vorhandenes gültiges Token beim Mount → direkt Liste; `401` → Login, Storage geleert.

### 5.2 Anmeldung (drei Schritte, ein Screen — Ablauf-Vorbild `Username.tsx:196-269`)

1. **Klassen-Code**: neue Komponente `PortalCodeEntry` (g:player) — ein Input
   (uppercase-normalisiert), Submit ruft `POST /api/portal/roster`. Der Code hängt im
   Klassenzimmer aus (Lehrkraft, Abschnitt 6.3).
2. **Name wählen**: Wiederverwendung `PlayerNameSelect`
   (`features/game/components/join/PlayerNameSelect.tsx`) mit dem Roster aus Schritt 1.
3. **4-Emoji-PIN**: Wiederverwendung `EmojiPinInput`
   (`features/game/components/join/EmojiPinInput.tsx`; kuratiertes Set via
   `GET /api/emoji-pin-set`). Submit → `POST /api/portal/login`.
Fehlerbild wie im Live-Join (`Username.tsx:170-183`): EINE unspezifische Meldung
("Name oder PIN stimmen nicht — versuch es nochmal"), Name+PIN bleiben stehen; nach dem
dritten Fehlversuch greift serverseitig die 60-s-Sperre, Meldung "Kurz warten, dann nochmal".

### 5.3 Aufbau der Liste

`PortalAssignmentList` (g:player) als Seitenrumpf; Container `PortalShell` (g:player, schlanker
Header: Anzeigename + Abmelden-Button, kein Manager-Nav). Wiederverwendete Console-Bausteine
(per Export-Kommentar generisch/präsentational, `console/index.ts:1-3`):
- `SectionCard` für die drei Gruppen "Offen", "Erledigt", "Abgelaufen".
- `ListRow` je Auftrag (title = Quiz-`subject`, meta = Frist/Versuche, footer = Punktebadge).
- `EmptyState` für den Leerzustand.
- `listMotion` (Stagger) und `rowStyles`/`tokens.css`-Token-Utilities.
Das ist eine bewusste Inhaber-Entscheidung ("recycle … css/ui/ux mässig"): das Portal nutzt
die Manager-Console-Optik, obwohl es eine Kind-Fläche ist. `design.md` wird im UI-WP um den
Portal-Kanon ergänzt (stehende Regel: neue Flächen-Entscheide sofort als Kanon nachziehen).

### 5.4 Zustände, je mit Verhalten

- **Keine Aufgaben** (alle drei Listen leer): `EmptyState` (Icon `ListChecks`), Text
  "Gerade ist nichts offen — schau später wieder rein." Kein CTA.
- **Offene Aufgaben**: klickbare `ListRow`s; meta zeigt "bis <Datum>" (Frist, lokalisiert)
  bzw. "Noch <n> Versuche" wenn `maxAttempts` gesetzt; Klick startet (5.5).
- **Erledigte Aufgaben**: `ListRow` mit Punktebadge (`bestScore`) und Abgabedatum. Klick:
  wenn Versuche übrig → erneut spielbar ("Nochmal spielen", zählt als weiterer Versuch,
  Server prüft ohnehin), sonst inert (nur Anzeige).
- **Abgelaufene Aufgaben**: ausgegraute `ListRow`s (rowStyles-Disabled-Variante), meta
  "Frist abgelaufen am <Datum>", nicht klickbar.
- **Zurückgenommene** Aufgaben erscheinen nicht (serverseitig gefiltert, 4.3) — ausser sie
  waren schon erledigt, dann bleiben sie in "Erledigt".

### 5.5 Start und Übergabe an den Spiel-Flow

Klick auf offenen Auftrag → `POST /api/portal/assignment/:id/session` → bei Erfolg Navigation
auf die bestehende Route `/quizz/$quizzId/assignment/$assignmentId` mit `studentToken` und
`displayName` im Router-State; der Solo-Store (`stores/solo.ts`) bekommt `studentToken` +
`setStudentToken` (analog `assignmentId`/`setAssignmentId`, den die Route heute schon setzt,
`assignment.$assignmentId.tsx:152`). Die Assignment-Route überspringt bei vorhandenem Token
die Freitext-`NameScreen` (heute 246-256) — `playerName` ist serverbekannt und wird ohnehin
serverseitig gesetzt (4.1). `finishGame` sendet `studentToken` im `/solo-score`-Body mit.
Session-Mint-Fehler auf der Liste: `410` → Toast "Diese Aufgabe wurde zurückgezogen" +
Refresh; `403 deadline/attempts` → Toast + Eintrag wandert beim Refresh in die passende Gruppe.

### 5.6 Nach dem Abschluss

- `FinishedScreen` (`SoloFinishedScreen`) erhält eine optionale `onBackToPortal`-Prop; die
  Assignment-Route reicht sie nur durch, wenn der Lauf aus dem Portal kam (Router-State-Flag).
  Klick → zurück zu `/portal`, Liste wird neu geladen — der Auftrag liegt jetzt unter
  "Erledigt" mit Punktzahl.
- **Submit-Fehler sichtbar machen (neu, Korrektur aus 2.1):** der Store bekommt
  `submitError: string | null`; schlägt der `/solo-score`-POST für einen Auftrag fehl
  (Frist/Versuche/Token/Netz), rendert die Assignment-Route statt des Finished-Screens den
  vorhandenen `AssignmentErrorScreen` (`assignment.$assignmentId.tsx:36-64`) mit gemappter
  Meldung ("Die Frist ist leider abgelaufen — deine Antworten wurden nicht mehr gewertet" /
  "Sitzung abgelaufen — geh zurück zum Portal und starte neu") und Rücksprung-Button.
  Der stumme catch bleibt nur für den anonymen Solo-Pfad ohne `assignmentId`.

## 6. Manager-Seite (play-Tab)

1. **Dritter Button "Zuweisen"** in der bestehenden `ActionFooter`
   (`ConfigSelectQuizz.tsx:354-389`), Icon `Send`, `data-testid="assign-btn"`; disabled ohne
   Quiz-Auswahl; nur gerendert wenn `config.klassenEnabled === true` (gleiches Gate wie der
   Klassen-Toggle, `ConfigSelectQuizz.tsx:276`) — ohne Klassenverwaltung gibt es keine
   Adressaten. "Spiel starten" und "Solo-Link kopieren" bleiben unverändert.
2. **`AssignQuizzDialog`** (Scaffold `pnpm g:console AssignQuizzDialog`, verschoben nach
   `features/manager/components/configurations/`): `DialogPanel` mit zwei exklusiven Modi
   (Segmented-Buttons "Klasse" / "Schüler"):
   - Modus Klasse: Checkbox-Liste nur aktiver Klassen — Recycling des Bulk-Dialogs
     `ConfigSchueler.tsx:476-546` samt `filteredActiveClasses`-Muster (109-112), aber ohne
     Indeterminate (reine Einfachauswahl gemäss "einer Klasse"; Radio-Semantik).
   - Modus Schüler: neue Mehrfachauswahl-Variante `AssignStudentPicker` (g:console) nach dem
     Muster `StudentPicker.tsx:36-131` (Suche + Liste), Checkboxen statt Einzelklick;
     Datenquelle `allStudents` — im bereits vorhandenen `useClassManager()`-Aufruf
     (`ConfigSelectQuizz.tsx:32`) nur zusätzlich destrukturieren.
   - Optional darunter: Frist (natives `<input type="datetime-local">`) und max. Versuche
     (`<input type="number" min=1>`). `requireIdentifier` wird NICHT angeboten — für
     gezielte Aufträge ist die Identität PIN-bewiesen (offene Frage 9).
3. Bestätigen → `POST /api/assignment`; Erfolgs-Toast nach Bestandsmuster
   (`handleCopySoloLink`, 150-163) mit Aktion "Zur Auswertung" → Tab `assignments`
   (Abschnitt 7). `403`/`400` → Fehler-Toast mit Serverfehlertext.
4. **Klassen-Code für den Aushang**: im Klassen-Tab (`klassen/ConfigKlassen.tsx`) je
   Klassenzeile eine Aktion "Klassen-Code" — Dialog nach `PinDialog`-Muster
   (`schueler/PinDialog.tsx`: Gross-Anzeige + Regenerieren-Button), ruft
   `GET /api/classes/:id/join-code` bzw. `…/rotate` (4.2). Druckbar über das vorhandene
   `PrintCredentialsDialog`-Muster (Folge-Ausbau, nicht Pflicht in Welle 1).

## 7. Auswertung für die Lehrkraft

Neuer Manager-Tab **`assignments`** in `BUILTIN_TABS`
(`features/manager/components/configurations/index.tsx:85-201`), einsortiert nach `results`,
`gated: "klassenEnabled"` (Gate-Logik `isTabAllowed` unverändert, index.tsx:205 ff.); Route
damit automatisch `/manager/config/assignments` über den bestehenden `$tab`-Mechanismus
(`pages/manager/config.$tab.tsx:53-112`, keine neue Routen-Datei nötig).

Komponente **`ConfigAssignments`** (Scaffold `pnpm g:console`, verschoben nach
`configurations/`):
- Liste der Zuweisungsakte via `GET /api/assignment/groups`: je Gruppe eine `ListRow`
  (title = subject, meta = "zugewiesen am … · Frist …", footer = Fortschritts-Badge
  "17 / 24 erledigt", revocierte Gruppen mit "Zurückgezogen"-Badge ausgegraut).
- Klick expandiert die Pro-Kind-Ansicht via `GET /api/assignment/group/:groupId/results`:
  je Kind eine Zeile mit Status-Chip — "erledigt · 4200 P. · 2 Versuche" / "offen" /
  zusätzlich "deaktiviert"-Marker wenn `active=false`. `bestScore == null` ⇒ offen.
- Aktion "Zurückziehen" je Gruppe: `AlertDialog`-Bestätigung (Bestandsmuster
  `ConfigSchueler.tsx:461-473`) → `DELETE /api/assignment/group/:groupId`.
- Leerzustand: `EmptyState` mit CTA "Quiz zuweisen" → Tab `play`.
Damit ist Parity-Befund #7 (Backend fertig, Frontend fehlt) für die Auswertungsseite
geschlossen; die dort erwähnte fehlende Listing-Route ist `GET /api/assignment/groups`.

## 8. Randfälle, je mit erwartetem Verhalten

1. **Kind wechselt die Klasse während der Bearbeitung:** Aufträge hängen an
   `assigned_student_id`, nicht an der Mitgliedschaft — nichts ändert sich an Sichtbarkeit,
   Spielbarkeit oder Auswertung. Portal-Login läuft fortan über den Code der NEUEN Klasse
   (Login prüft aktive Mitgliedschaft der Code-Klasse, 4.3); ist das Kind danach in keiner
   Klasse, ist das Portal für es unerreichbar — der Direktlink+PIN-Pfad (4.1) funktioniert
   weiter (offene Frage 2).
2. **Kind ist in zwei Klassen:** Login über beide Codes möglich; die Auftragsliste ist
   identisch (schülerbezogen, nicht klassenbezogen). Weist man beiden Klassen dasselbe Quiz
   zu, entstehen zwei getrennte Aufträge — siehe 5.
3. **Zuweisung wird zurückgenommen:** `revoked_at` gesetzt, kein Hard-Delete. Offene
   Einträge verschwinden aus dem Portal; Session-Mint `410`, `validate-pin` `403`,
   `solo-score` `403`. Bereits erledigte bleiben beim Kind unter "Erledigt" und in der
   Lehrkraft-Auswertung sichtbar (Gruppe trägt "Zurückgezogen"-Badge).
4. **Klasse wird gelöscht:** kein FK von `assignments` auf `classes` (3.2) — Aufträge und
   Ergebnisse bleiben vollständig erhalten (Schüler überleben die Löschung seit Migration 015,
   Trigger-Drop `015:4-7`). Der Klassen-Code stirbt mit der Klasse → Portal-Zugang nur noch
   über eine andere Klasse oder den Direktlink. Gruppenansicht zeigt weiterhin die
   Schülerliste, nur keinen Klassennamen (kein Snapshot-Feld, offene Frage 6).
5. **Dieselbe Aufgabe zweimal zugewiesen** (Doppelklick der Lehrkraft, überlappende Klassen):
   keine Deduplizierung — zwei eigenständige Zeilen mit eigener Frist, eigenem Versuchsbudget,
   eigenem Ergebnis-Slot. Portal zeigt zwei Einträge, unterscheidbar über Zuweisungsdatum und
   Frist in der meta-Zeile (offene Frage 4 der Targets-Spec, Standard beibehalten).
6. **Frist läuft während der Bearbeitung ab:** Client prüft nur beim Laden
   (`assignment.$assignmentId.tsx:135-148`); der Submit wird serverseitig abgelehnt
   (`solo.rs:587-592`; exakt auf der Frist gilt noch als pünktlich, Vertrag
   `solo.rs:424-432`). Neu sichtbar statt stumm: `submitError`-Pfad (5.6) zeigt "Frist
   abgelaufen, Antworten nicht gewertet"; der Auftrag liegt danach unter "Abgelaufen".
7. **Kind wird deaktiviert:** beim Zuweisen ausgeschlossen (Fan-out filtert `active`, 4.1).
   Bestehende Aufträge: Portal-Login scheitert (`validate_student_pin_plain` ⇒ false,
   `pins.rs:120`), `validate-pin` scheitert (`pins.rs:95`), Session-Mint prüft `active`
   ebenfalls. Die Lehrkraft-Auswertung behält die Zeile (Snapshot) mit "deaktiviert"-Marker
   und allen vorhandenen Ergebnissen.

## 9. Sicherheit

- **Adressatenprüfung (Schliessung der gemeldeten Lücke):** `validate_student_pin` bindet die
  Einlösung an `assigned_student_id` (4.1) — dieselbe Bedingung gilt im Portal-Session-Mint
  (4.3). Ohne diese beiden Stellen wäre `assigned_student_id` nur Reporting-Metadatum.
- **Sitzungseinlösung (Schliessung der solo_sessions-Lücke):** gezielte Submits verlangen ein
  unverbrauchtes `solo_sessions`-Token, das in EINEM `UPDATE … RETURNING` konsumiert wird
  (kein TOCTOU); jeder Versuch braucht ein frisches Token, dessen Ausgabe Frist/Versuche
  erneut prüft. `player_name` gezielter Ergebnisse kommt serverseitig aus
  `students.display_name` — die Auswertung beruht nie auf Client-Behauptungen.
- **Brute Force:** bestehender 3/60-s-Mechanismus (`rate_limit.rs:218`) wird mit neuen
  Schlüsseln wiederverwendet (`portal-roster:<ip>`, `portal:<joinCode>:<ip>`); PIN-Raum ist
  256⁴ ≈ 4,3 Mrd. bei ≥256 kuratierten Emoji (`emoji_pin.rs:237`), Code-Raum 30⁶ ≈ 729 Mio.
- **Was ein fremdes Kind sehen könnte — und warum nicht:** `students.id` ist sequenziell
  erratbar (`011:18`), deshalb ist KEINE Portal-Route allein ID-adressiert: Liste und
  Session-Mint verlangen das Bearer-Token (Identität), der Login verlangt Code + Mitgliedschaft
  + PIN. Ein gültiger eigener PIN öffnet keine fremden Aufträge (Adressatenprüfung), ein
  fremder Klassen-Code ohne Mitgliedschaft keinen Login (4.3 Schritt 3). Der Roster-Endpunkt
  exponiert hinter dem Code nur Anzeigenamen — dieselbe Exposition wie der bestehende
  Live-Join-Roster. PINs verlassen den Server in keiner Portal-Antwort.
- **Token-Hygiene:** Portal-Token nur als SHA-256-Hash at rest (Muster `020_sessions.sql`),
  TTL 8 h, `sessionStorage` statt `localStorage` auf geteilten Geräten; `solo_sessions`
  bleiben 120-min-Einweg-Token. Abgelaufene Zeilen räumt ein späteres Vacuum-WP (nicht
  blockierend, Tabellen wachsen langsam).
- **Manager-Fläche:** Owner-Checks auf allen neuen Routen (4.2) und nachgezogen auf
  `GET /api/assignment/:id/results` (bestehende Lücke); Fan-out validiert Klassen- und
  Schüler-Ownership VOR dem Insert, eine Transaktion, keine Teilzuweisungen.
- **Kein neues Auth-System:** Lehrkraft-Auth bleibt `x-manager-token`; Kinder-Identität bleibt
  PIN-basiert; keine Passwörter, keine Accounts für Kinder.

## 10. Nicht-Ziele

- Keine Änderung am Live-Klassenmodus (`klassenMode`/`EVENTS.GAME.CREATE`,
  `ConfigSelectQuizz.tsx:139-148,276-320`) — unabhängiger Codepfad.
- Kein Multi-Klassen-Ziel pro Zuweisungsakt (später: weiterer Akt = weitere Gruppe).
- Keine automatische Nachzügler-Aufnahme in bestehende Klassen-Zuweisungen (Snapshot).
- Der anonyme Solo-Link (`/quizz/:id/solo`, "Solo-Link kopieren") bleibt unverändert bestehen
  — anderer Bedarf (schnelles anonymes Teilen), offene Frage 7.
- Kein `solo_results.student_id`-Backfill in dieser Welle (Folge-WP; Auswertung funktioniert
  ohne, Abschnitt 3.1/7).
- Keine Benachrichtigungen (E-Mail/Push) bei neuer Zuweisung; kein Offline-/PWA-Sonderpfad
  fürs Portal.
- Keine Solo/MP-Paritätsarbeiten ausser Befund #7 (die Parity-Spuren A–E bleiben eigener
  Backlog; einzige Berührung: die Submit-Fehler-Sichtbarkeit 5.6, die dieser Plan ohnehin
  braucht).
- Kein Redesign des Lehrkraft-Auth; keine Schüler-Accounts mit Passwörtern.

## 11. Offene Produktfragen, je mit umkehrbarer Standardannahme

1. **Nachzügler-Sync:** neue Klassenmitglieder automatisch in laufende Zuweisungen aufnehmen?
   Standard: **nein** (Snapshot). Umkehrbar: "Fehlende nachtragen"-Button erzeugt weitere
   Fan-out-Zeilen derselben Gruppe — keine Schemaänderung.
2. **Klassenlose Kinder:** Portal-Zugang für Kinder ohne aktive Klassenmitgliedschaft?
   Standard: **nein**, Direktlink+PIN bleibt ihr Pfad. Umkehrbar über einen späteren
   schülerpersönlichen Code, ohne die bestehenden Endpunkte zu ändern.
3. **Punktzahl fürs Kind sichtbar:** Standard: **ja** (`bestScore` in "Erledigt"). Umkehrbar:
   Feld serverseitig weglassen — reine Response-Änderung.
4. **Wiederholen nach Erledigung:** Standard: **ja, bis `maxAttempts`** (ohne Limit
   unbegrenzt; Server zählt ohnehin). Umkehrbar: Session-Mint lehnt `done` ab.
5. **Join-Code:** Standard: 6 Zeichen A-Z (ohne I/O) + 2-9, lazy erzeugt, Rotation
   invalidiert sofort nur den Login (laufende Sitzungen unberührt). Format/UX umkehrbar,
   Spalte bleibt TEXT.
6. **Klassenname-Snapshot auf Gruppen:** Standard: **nein** (YAGNI); bei Bedarf später
   `assignment_groups`-Metatabelle oder Textspalte.
7. **"Solo-Link kopieren":** bleibt? Standard: **ja, unverändert** neben "Zuweisen".
8. **Portal-Token-TTL:** Standard: **8 h** (ein Schultag). Umkehrbar per Konstante.
9. **`requireIdentifier`/`showCorrectAnswers` im Dialog:** Standard: **nicht anbieten** —
   `requireIdentifier` ist für gezielte Aufträge obsolet (PIN-Identität), `showCorrectAnswers`
   wartet auf die Reveal-Entscheidung der Paritätsanalyse (§5.1 dort). Metadata-Felder bleiben
   im Schema, nichts wird entfernt.
10. **Verifikation Prod-Daten:** `assigned_to`-NULL-Annahme vor Rollout per COUNT bestätigen
    (3.3). Standard: bei 0 wie geplant; sonst Stopp und Neubewertung.

## 12. Testbarkeit

**Test-IDs** (Muster wie bestehend, z. B. `class-select` `ConfigSelectQuizz.tsx:302`,
`quizz-start-btn` 356):
- Manager: `assign-btn`, `assign-mode-class`, `assign-mode-students`,
  `assign-class-radio-<id>`, `assign-student-checkbox-<id>`, `assign-deadline-input`,
  `assign-max-attempts-input`, `assign-confirm-btn`; Auswertung:
  `assignment-group-row-<groupId>`, `assignment-student-row-<studentId>`,
  `assignment-revoke-btn`; Klassen-Code: `class-join-code`, `class-join-code-rotate`.
- Portal: `portal-code-input`, `portal-code-submit`, `portal-name-select`,
  `portal-pin-input`, `portal-login-submit`, `portal-empty`, `portal-open-list`,
  `portal-done-list`, `portal-expired-list`, `portal-assignment-item-<assignmentId>`,
  `portal-logout`, `portal-back-btn` (Finished-Screen), `assignment-submit-error`.

**Abnahmekriterien (prüfbar):**
1. `POST /api/assignment` mit fremder `classId` → `403`, null Zeilen; mit eigener Klasse
   (N aktive, M inaktive Mitglieder) → genau N Zeilen, eine `assignment_group_id`, inaktive
   ohne Zeile.
2. `classId` UND `studentIds` → `400`; leere `studentIds` → `400`; leerer Klassenroster → `400`.
3. Kind A validiert PIN für Auftrag von Kind B → `403` konstanter Form; für eigenen → Token.
4. `solo-score` für gezielten Auftrag ohne/mit verbrauchtem/mit abgelaufenem `studentToken`
   → `403`, kein `solo_results`-Insert; mit gültigem → Insert mit serverseitigem
   `player_name` = `students.display_name`, Token `used=true`.
5. Zurückgenommene Gruppe: Portal-open-Liste ohne Eintrag, Session-Mint `410`,
   `GET /api/assignment/:id` `410`, vorhandene Ergebnisse in der Gruppen-Auswertung sichtbar.
6. `GET /api/assignment/:id/results` einer fremden Lehrkraft → `403` (Regression auf die
   geschlossene Lücke).
7. Portal-Login: falscher PIN 3× → vierter Versuch `429`-Verhalten des Rate-Limiters
   (konstante Fehlerform); richtiger PIN mit fremdem Klassen-Code → `403`.
8. `GET /api/portal/assignments` klassifiziert korrekt: erledigt (mit `bestScore` = MAX),
   offen, abgelaufen; revoked-unerledigt fehlt; `401` bei abgelaufenem Token.
9. Frist läuft während Bearbeitung ab → Submit `403`, UI zeigt `assignment-submit-error`
   (kein stummer Leaderboard-Screen), Eintrag danach unter "Abgelaufen".
10. Kind in zwei Klassen: Login über beide Codes, identische Liste; Klasse gelöscht →
    Aufträge und Auswertung unverändert vorhanden.
11. Gruppen-Auswertung: Kind ohne Abgabe = `status:"open"`/`bestScore:null`; nach Abgabe
    ändert sich nur seine Zeile.
12. Locale-Gate: neue Namespaces `assignment.json` + `portal.json` in ALLEN 6 Locales,
    `scripts/check-locales.sh` grün in jedem Gate.

**Werkzeuge und Pflichten:** e2e via Stagehand-Lane (echte Browser-Kontexte, act-Cache;
Multi-Kind-Szenarien über getrennte Kontexte, NIE same-origin-iframes — bekannte
client_id-Falle); e2e-Verzeichnis liegt ausserhalb des pnpm-Workspace (`source/e2e/`,
Install mit `--ignore-workspace`). Deep-Link-Pflicht: `/portal` und die Assignment-Route
zusätzlich als Hard-Load (`page.goto`) testen, nicht nur In-App-Klick. Rust-Gate
`bash rust/gate.sh` je Server-WP; UI-WPs fahren die Pflicht-Verifikationskette
(`pnpm tokens:validate · tokens:ast · tokens:neural · tokens:ai-audit`) mit Verbatim-Ausgabe
im Report. Nach jeder Welle: Deploy + voller Browser-Smoke des Game-Loops (stehende Regel —
Lobby erreichen ist kein Pass).

## 13. Reihenfolge der Umsetzung (kleine WPs, Contract-Freeze zuerst)

**Welle 0 — Contract-Freeze (parallel):**
- WP-0a: Migration `023_assignment_targets.sql` (nur SQL, 3.2) + Prod-Verifikations-Query
  dokumentiert.
- WP-0b: Wire-Contracts — `assignmentValidator`-Erweiterung (`packages/common/src/validators/
  assignment.ts`), `SoloScoreRequest.studentToken` (Rust-Struct `solo.rs:137` + Zod-Spiegel),
  Response-Typen der neuen Endpunkte als TS-Typen in `packages/common`. Friert alle
  Signaturen aus Abschnitt 4 ein.

**Welle 1 — Server-Kern (parallel auf Welle 0):**
- WP-S1: `POST /api/assignment` Fan-out + Owner-Checks + `authorize_manager_request` gibt
  User zurück (4.1/4.2-Grundsatz).
- WP-S2: `validate_student_pin`-Adressaten-/Revoked-Scope + `solo-score`-Token-Konsum +
  serverseitiger `player_name` (4.1) — die beiden Lückenschlüsse; besitzt `pins.rs` und den
  Assignment-Block in `solo.rs`.
- WP-S3: Gruppen-Endpunkte (`groups`, `group/:id/results`, `DELETE group/:id`) + Owner-Check
  auf `:id/results` + `410`/`requiresPin` auf `GET /api/assignment/:id` (4.1/4.2).
- WP-S4: Portal-Endpunkte (`roster`, `login`, `assignments`, `session`) + `student_sessions`-
  DB-Layer + Join-Code-Endpunkte (4.2/4.3).

**Welle 2 — Client (je auf dem passenden Server-WP):**
- WP-C1 (nach S1): `AssignQuizzDialog` + `AssignStudentPicker` + Footer-Button (6).
- WP-C2 (nach S3): Tab `assignments` + `ConfigAssignments` (7).
- WP-C3 (nach S4): Portal — Route, `PortalShell`, `PortalCodeEntry`, Login-Steps,
  `PortalAssignmentList` (5.1-5.4) + Klassen-Code-Dialog im Klassen-Tab (6.4).
- WP-C4 (nach S2+S4): Spiel-Integration — Store-`studentToken`/`submitError`,
  NameScreen-Skip, `onBackToPortal`, Fehler-Screens (5.5/5.6).
- WP-C5: i18n — Namespaces `assignment.json`/`portal.json` ×6 + neue `manager:`-Keys;
  eigenes WP, Locale-Merges nie textuell.

**Welle 3 — Absicherung und Nacharbeit:**
- WP-T1: Stagehand-e2e über den vollen Kreis (zuweisen → Portal-Login → spielen → Auswertung
  → zurückziehen), 3 Viewports, Hard-Load-Deep-Links (12).
- WP-N1 (später, unabhängig): Migration `024_drop_assigned_to.sql` (3.3).
- WP-N2 (später, unabhängig): `solo_results.student_id` + Befüllung aus dem Token-Pfad.
- WP-N3 (später): Vacuum abgelaufener `student_sessions`/`solo_sessions`.

Harte Ketten: 0a→S1/S2/S4 (Schema), 0b→alle S-WPs (Contracts), S1→C1, S3→C2, S4→C3,
S2+S4→C4; C5 ist nur von den finalen Key-Listen der C-WPs abhängig; T1 nach Welle 2 komplett.
Nach jeder Welle: Deploy + Live-Smoke (Abschnitt 12), erst dann die nächste Welle.
