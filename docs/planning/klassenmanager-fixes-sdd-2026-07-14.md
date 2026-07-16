# Klassenmanager — Bug-Fix + Import/Export SDD

**Autor:** Fable (Orchestrator, Spec-only — keine Implementierung hier)
**Datum:** 2026-07-14
**Ziel:** `rust.razzoozle.xyz` (Rust-Twin), main `17b84e93`
**Auslöser:** User-Report — Klassenmanager: kein Klassen-Titel sichtbar, Löschen erst nach Reload, Schülerzuordnung geht nicht, Schülerverwaltung unauffindbar; zusätzlich Feature-Wunsch: Klassen-Import/Export gesamt + klassenweise.

Betroffene Dateien (Kern, alle eng gekoppelt → **ein Implementer**, kein Parallel-Flood):
- `packages/web/src/features/manager/components/configurations/klassen/useClassManager.ts`
- `packages/web/src/features/manager/components/configurations/klassen/ClassList.tsx`
- `packages/web/src/features/manager/components/configurations/klassen/ConfigKlassen.tsx`
- `rust/server/src/socket/manager/classes.rs`
- `rust/protocol/src/constants.rs`, `packages/common/src/constants.ts`, `packages/common` class socket types
- (Import/Export) `rust/server/src/http/` (neue Route(n) + mod.rs Registrierung), `rust/server/src/db/classes.rs`

**Contract-Ownership:** Dieser WP besitzt die `class:*`-Payload-Contracts (constants + TS-Typen, beide Seiten). Rust↔TS-Parität ist Pflicht (K2-Lesson).

---

## P1 — Bug-Fixes (verifizierte Root-Causes)

### Bug B — Löschen wird erst nach Reload sichtbar (CONFIRMED)
**Ursache:** `rust/server/src/socket/manager/classes.rs:181` emittiert `class:deleteSuccess` als `serde_json::json!({})` (leer). Der Client-Handler `useClassManager.ts:99-102` (`CLASS.DELETE_SUCCESS`) löscht die Klasse NICHT aus dem lokalen `classes`-State, sondern zeigt nur einen Toast — erst ein frischer `class:list` bei Reload spiegelt die Löschung.
**Fix:**
- Server: `deleteSuccess` mit `{ "id": class_id }` emittieren.
- Client: `CLASS.DELETE_SUCCESS`-Handler nimmt `{id}` und entfernt die Klasse aus `classes` (`setClasses(prev => prev.filter(c => c.id !== id))`) + räumt `pendingDeleteClass` + Toast.
**Contract:** `class:deleteSuccess` Payload `{}` → `{id: number}` (rust emit + TS-Typ).
**Akzeptanz:** Klasse löschen → sofort aus der Liste weg, ohne Reload; nach Reload weiterhin weg (DB).

### Bug C — Schüler lassen sich keiner Klasse zuordnen (CONFIRMED, Kern-Bug)
**Ursache:** `classes.rs:238` emittiert `class:studentAdded` als `{id, displayName}` OHNE `classId`. Der Client-Handler `useClassManager.ts:105-127` kann die Zielklasse nicht kennen und hängt den Schüler per unsinniger Bedingung (`c.id === pendingDeleteStudent?.studentId`) an ALLE Klassen außer einer an → Schüler erscheinen falsch/gar nicht korrekt zugeordnet.
**Fix:**
- Server: `studentAdded` mit `{ id, displayName, classId }` emittieren (classId ist im Handler bereits als `class_id` vorhanden, ~classes.rs:211/232).
- Client: `CLASS.STUDENT_ADDED`-Handler nimmt `{id, displayName, classId}` und fügt den Schüler NUR der Klasse mit `c.id === classId` hinzu (die Unsinns-Bedingung entfernen).
**Contract:** `class:studentAdded` Payload `{id, displayName}` → `{id, displayName, classId: number}`.
**Akzeptanz:** Klasse aufklappen → „Schüler hinzufügen" → Name → Schüler erscheint SOFORT nur in DIESER Klasse; Reload → Schüler bleibt in derselben Klasse (via class:getStudents); andere Klassen unverändert.

### Bug D — „Wo ist die Schülerverwaltung?" (UX-Discoverability)
**Ursache:** Die Schülerliste + „Schüler hinzufügen" liegen hinter dem Expand-Chevron (`ClassList.tsx:87-108` → Roster `:148-211`, Add-Button `:203`). Durch Bug C wirkte sie leer/kaputt. Funktional vorhanden.
**Fix (minimal, nach B+C):** Sicherstellen, dass Aufklappen die Schüler lädt (der bestehende `onFetchStudents` in ClassList:92 feuert nur wenn `students` leer — OK). **Kleine UX-Verbesserung:** die Schüleranzahl-Zeile (`ClassList.tsx:116`) klickbar/aufklappend machen ODER einen deutlichen „Schüler verwalten"-Hinweis, damit der Roster auffindbar ist. Keine große Umgestaltung (YAGNI).
**Akzeptanz:** Ein Manager findet ohne Anleitung die Schülerliste einer Klasse und kann Schüler hinzufügen/entfernen/umbenennen.

### Bug A — Kein Klassen-Titel sichtbar (REPRO-FIRST)
**Status:** Statisch nicht eindeutig — `db::get_classes` UND `create_class` serialisieren `name` korrekt; `ClassList.tsx:113-115` rendert `classObj.name` in `text-[var(--game-fg)]`. Verdächtige: (a) leere `name` im class:data-Payload für bestimmte Klassen, (b) CSS: `--game-fg` gegen `--surface` unlesbar/gleichfarbig, (c) ein Mapping-/Prop-Fehler in ConfigKlassen→ClassList.
**Vorgehen:** Der **Sonnet-5-Test-Agent reproduziert zuerst** (Screenshot + DOM-Inspektion des Klassen-Rows: ist der `<p>`-Text leer oder nur unsichtbar? Was steht im class:data-Payload?). Root-Cause-Ergebnis fließt in den Implementer-Fix.
**Akzeptanz:** Jede Klasse zeigt ihren Namen deutlich lesbar in der Liste.

---

## P2 — Feature E: Klassen-Import/Export (gesamt + klassenweise)

**Anforderung:** Manager kann (1) ALLE eigenen Klassen inkl. Schüler exportieren, (2) EINE Klasse inkl. Schüler exportieren, (3) eine Export-Datei importieren (egal ob 1 oder viele Klassen). Owner-scoped: jeder eingeloggte Manager exportiert/importiert seine eigenen Klassen (nicht admin-only, aber owner-gebunden — nutze die vorhandene owner-Scoping-Logik `me = None wenn admin else user_id`).

**Format (JSON, round-trip-fähig):**
```json
{ "version": 1, "classes": [ { "name": "2C", "students": [ { "displayName": "Anna Muster" } ] } ] }
```
Per-Klasse-Export = dieselbe Struktur mit genau einer Klasse. Import akzeptiert 1..n Klassen. Beim Import werden Klassen NEU angelegt (keine Merge-Semantik in v1 — YAGNI; doppelte Namen sind erlaubt, wie es die DB bereits zulässt). Optional CSV NICHT in v1.

**Server (mirror des Skeleton-Import/Export-Musters `http/skeleton/mod.rs`, aber owner-scoped statt admin):**
- `GET /api/classes/export` → JSON aller owner-Klassen + Schüler (Content-Disposition attachment).
- `GET /api/classes/:id/export` → JSON dieser einen owner-Klasse + Schüler (404 wenn nicht owner).
- `POST /api/classes/import` → Body = obiges JSON; legt pro Klasse `create_class` + pro Schüler `add_student` an (owner = session user); Validierung: name non-empty, students-Array, Größen-Cap (z. B. ≤ 500 Klassen / ≤ 200 Schüler pro Klasse). Auth: session-token (require_user), owner-gebunden. Bei Fehler: 4xx mit Klartext.
- DB: ggf. kleine Helper in `db/classes.rs` (bestehende `get_classes`/`get_students`/`create_class`/`add_student` wiederverwenden).

**Client (`ConfigKlassen.tsx` + `ClassList.tsx`):**
- Header: „Alle exportieren" (GET /api/classes/export → Blob-Download `klassen-export.json`) + „Importieren" (File-Picker → POST /api/classes/import → bei Erfolg `class:list` neu emittieren + Toast).
- Pro Klassen-Row: ein Export-Icon → GET /api/classes/:id/export → Download `klasse-<name>.json`.
- Alle fetches mit dem Session-Token (x-manager-token / Authorization) wie die bestehenden ConfigUsers-Calls (`fetchWithAuth`).
- i18n-Keys für alle neuen Labels/Toasts in ALLEN 6 Locales (`manager.json` unter `classes.*`).

**Akzeptanz:** Export aller Klassen lädt eine JSON mit allen Klassen+Schülern; Per-Klasse-Export lädt genau eine; Import dieser Datei legt die Klassen+Schüler wieder an (nach Reload sichtbar); ein anderer Owner kann fremde Klassen weder exportieren (404) noch beim Import überschreiben (nur eigene neu angelegt).

---

## Routing & Testing

**Implementer:** `codex-gpt5` (Rust↔TS-Contract-Parität, multi-file — Kernstärke), eigener Worktree. Eskalation: `sonnet-worker` (worktree) falls Contract-Parität/Build bricht. **Ein** Implementer für P1+P2 (Dateien überlappen stark → kein Parallel-Flood).

**Test-Agent (PFLICHT, User-Direktive):** separater **Sonnet-5-Agent** mit Browser (Playwright). Zwei Durchläufe:
1. **Baseline-Repro (vor Fix):** alle 4 Bugs per Klick nachspielen, Screenshots + DOM-Evidenz (v. a. Bug A: ist der Titel-Text leer oder unsichtbar?). Ergebnis an den Implementer.
2. **Abnahme (nach Fix + Deploy):** kompletter Klick-Durchlauf mit Screenshots an jedem Schritt — Klasse anlegen (Titel sichtbar?), umbenennen, löschen (sofort weg?), aufklappen, Schüler hinzufügen (nur diese Klasse?), Schüler umbenennen/entfernen, Reload-Persistenz, Export-all + per-Klasse (Datei prüfen), Import (Round-trip). Plus die Testsuite (`pnpm --filter @razzoozle/socket run test`, `pnpm --filter @razzoozle/web run test`, `bash rust/gate.sh`, `cargo test`). PASS/FAIL pro Punkt, Screenshot-Pfade, keine „Lobby-erreicht = Pass"-Abkürzung.

**Gate/Merge (Fable):** Diff lesen, `rust/gate.sh` + `CI=true pnpm --filter @razzoozle/web run types` (2 known errors) + `pnpm verify`, Contract-Parität Rust↔TS prüfen, FF-Merge, beide Remotes, `routing-outcome record`, Deploy via CD, Sonnet-Abnahme.

## Definition of Done
- Bug A/B/C/D behoben + vom Sonnet-Test-Agent per Screenshot bestätigt.
- Import/Export gesamt + klassenweise funktional (Round-trip verifiziert), owner-scoped.
- `class:deleteSuccess {id}` + `class:studentAdded {id,displayName,classId}` Contracts Rust↔TS in Parität.
- Gates grün, beide Remotes am finalen SHA, deployed, `/healthz`==200.
