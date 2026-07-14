# Fächer/Labels — SDD (Razzoozle Rust twin)

**Date:** 2026-07-14
**Status:** Design Phase
**Stakeholder:** joel.scherrer90@gmail.com
**Grundlage:** verifizierte Code-Maps (Datenmodell/Rust-Server + Web-UI), 2026-07-14

## User Request Summary

1. **Admin-only Verwaltungsmenü** im Manager, in dem Labels („Fächer") definiert werden — Labels werden AUSSCHLIESSLICH dort angelegt/umbenannt/gelöscht.
2. **Tagging:** Quizzes, Medien und Katalog-Einträge können mit Labels versehen werden.
3. **Anzeige + Filter:** Die drei Flächen (Quiz-Liste, Medien, Katalog) zeigen Labels als Chips und können danach filtern.
4. **Tests sind Pflicht** („sdd, tests und alles").

---

## 1. Ziel + Nicht-Ziele

**Ziel:** Eine globale, admin-definierte, flache Label-Taxonomie („Fächer" wie *Mathe*, *Deutsch*, *NMG*), die orthogonal zu `quizzes.subject` ist — `subject` ist der Quiz-**Titel** (die Quiz-ID wird beim Save via `normalize_filename` daraus abgeleitet, `socket/manager/quizz.rs` ~Zeile 158), keine Taxonomie. Labels werden zentral definiert und an drei Entitätstypen angehängt.

**Nicht-Ziele (YAGNI, explizit):**
- **Keine Label-Hierarchien** (kein Parent/Child, keine Gruppen, keine Sortier-Ordnung außer Name).
- **Keine per-User-Labels** — Labels sind global und admin-definiert. Kein `owner_id` auf der `labels`-Tabelle.
- **Keine Migration/Ablösung der Katalog-Freitext-Tags:** `catalog_entries.tags JSONB '[]'` (001) fließt end-to-end (`db/catalog.rs` insert/update, `protocol/src/quizz.rs:161 CatalogEntry.tags`) und **bleibt unverändert bestehen**. Labels sind ein zweites, separates Konzept (definiert vs. frei). Die Wire-Payload `CatalogEntry.tags` wird NICHT umgedeutet — das würde bestehende Consumer brechen (Map-Risiko).
- **Kein Label-Feld im Spiel-/Player-Flow** — reine Manager-Konsole.
- **Keine HTTP-Endpoints** — Feature läuft komplett über Socket-Events wie catalog/media/class (vermeidet auch die Duplikat-Authorizer-mit-Dev-Key-Falle aus `http/mod.rs`/`http/skeleton/mod.rs`, Memory `duplicate-authorizers-devkey`).

---

## 2. Datenmodell

### Entscheidung: Junction-Tabellen (nicht JSONB-Array) — Begründung aus den Map-Fakten

Das Repo hat beide Muster: JSONB-String-Array (catalog tags, 001) und Junction (014 `class_students`). `TEXT[]` kommt nirgends vor. Für **admin-DEFINIERTE** Entitäten mit Name+Farbe, referenziert von 3 Entitätstypen, mit Rename-/Delete-Integrität und Filterbarkeit ist die Junction das etablierte Muster (Map-Fakt „Storage idiom verdict"):

- **Rename:** ein UPDATE auf `labels.name` — Chips überall sofort korrekt. Mit JSONB-Arrays müssten 3 Tabellen durchsucht/umgeschrieben werden.
- **Delete:** `ON DELETE CASCADE` räumt Zuordnungen atomar ab.
- **Filter:** indexierter JOIN statt `jsonb_contains` über unindexierte Spalten.
- **Präzedenz:** Definitions-Tabelle wie `011_classes.sql` (BIGSERIAL + name + created_at), Junction wie `014_class_students_junction.sql` (BIGSERIAL id, zwei FKs ON DELETE CASCADE, UNIQUE-Paar, per-Column-Indizes).

**PK-Typ-Mix (Map-Fakt):** `quizzes.id` / `media_assets.id` / `catalog_entries.id` sind alle `safe_id` (DOMAIN VARCHAR(100) CHECK `'^[A-Za-z0-9_-]+$'`, 001); `labels.id` wird BIGSERIAL. Die Junctions mischen daher `label_id BIGINT` mit `entity_id safe_id`. **Drei separate Junctions** (statt einer polymorphen `entity_type`-Tabelle), weil nur so echte FKs mit CASCADE auf die drei Entitätstabellen möglich sind — polymorph gäbe es keine referenzielle Integrität.

### Migration `db/migrations/018_labels.sql` (nächste freie Nummer — 016 nur auf main, 017 nur auf Branch fix/sv-n1 c4bd5780; vor Merge Rebase-Check auf Kollision!)

Idempotenz ist Pflicht: `scripts/migrate-apply.sh` re-applied JEDE Datei bei jedem Lauf; frische DBs kriegen sie via `docker-entrypoint-initdb.d`-Mount (compose.rust.yml Zeile 69).

```sql
-- 018_labels.sql — Fächer/Labels: global, admin-definiert, flach (kein owner_id, keine Hierarchie)

CREATE TABLE IF NOT EXISTS labels (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT 'gray',        -- Palette-Slug, siehe §5 / Offene Entscheide
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- TIMESTAMPTZ → sqlx DateTime<Utc> (Memory socketioxide/sqlx)
);

CREATE TABLE IF NOT EXISTS quiz_labels (
  id       BIGSERIAL PRIMARY KEY,
  quiz_id  safe_id NOT NULL REFERENCES quizzes(id)  ON DELETE CASCADE,
  label_id BIGINT  NOT NULL REFERENCES labels(id)   ON DELETE CASCADE,
  UNIQUE (quiz_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_labels_quiz_id  ON quiz_labels(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_labels_label_id ON quiz_labels(label_id);

CREATE TABLE IF NOT EXISTS media_labels (
  id       BIGSERIAL PRIMARY KEY,
  media_id safe_id NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  label_id BIGINT  NOT NULL REFERENCES labels(id)       ON DELETE CASCADE,
  UNIQUE (media_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_media_labels_media_id ON media_labels(media_id);
CREATE INDEX IF NOT EXISTS idx_media_labels_label_id ON media_labels(label_id);

CREATE TABLE IF NOT EXISTS catalog_labels (
  id         BIGSERIAL PRIMARY KEY,
  catalog_id safe_id NOT NULL REFERENCES catalog_entries(id) ON DELETE CASCADE,
  label_id   BIGINT  NOT NULL REFERENCES labels(id)          ON DELETE CASCADE,
  UNIQUE (catalog_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_labels_catalog_id ON catalog_labels(catalog_id);
CREATE INDEX IF NOT EXISTS idx_catalog_labels_label_id   ON catalog_labels(label_id);
```

Kein Backfill nötig (Greenfield — Map-Fakt: keinerlei bestehende label/fach-Tabelle, -Module oder -Events im Repo). Keine `DO $$`-Blöcke nötig; `IF NOT EXISTS` reicht für vollständige Idempotenz.

**Bekannte Kante — Quiz-Rename:** `quizz:save` leitet die Quiz-ID aus `subject` ab; ein Titel-Rename kann eine NEUE ID erzeugen (`duplicate` hängt `' (Kopie)'` an). CASCADE würde die Labels des alten Datensatzes mitlöschen. Behandlung siehe §6 WP-L1 (Save-Handler trägt Labels bei ID-Wechsel über) und §8.

---

## 3. Contract (Events + Typen)

### Entscheidung: dedizierte `label:*`-Events (nicht Erweiterung der Save-Flows) — begründet

- Media hat **keinen** Update-Event (nur `media:upload`/`media:delete`, `socket/manager/media/mod.rs` Zeilen ~97/243) — ein Save-Flow-Ansatz bräuchte dort einen komplett neuen Event ohnehin.
- Der Quiz-Save-Flow ist wegen der ID-aus-Titel-Ableitung fragil als Träger.
- Ein einheitliches `label:assign` deckt alle drei Entitäten mit EINEM Handler ab (KISS).
- Für die **Anzeige** in den Listen reiten `labelIds` auf den bestehenden List-Payloads (QuizzMeta in `manager:config`, `media:data`, `catalog:data`) — kein zusätzlicher Roundtrip pro Fläche. Beide Datenfluss-Muster sind präzedenziert (Map-Fakt: quizz via ManagerConfig/emitConfig, media/catalog via eigene LIST/DATA-Paare).
- Die **Label-Definitionen** kommen über ein eigenes `label:list`/`label:data`-Paar (Muster media/catalog) statt ManagerConfig-Ride: funktioniert damit identisch im Quiz-Editor-Routentree, der KEINEN ConfigProvider hat (`pages/manager/quizz/layout.tsx` — Config via `useManagerStore`, Map-Caveat).

### Neues `pub mod label` in `rust/protocol/src/constants.rs` (Stil: Doc-Comment-Payload-Contracts wie `mod class`)

| Event | Richtung | Payload | Gate |
|---|---|---|---|
| `label:list` | C→S | **payloadless** → Handler-Signatur zwingend `|socket: SocketRef|` ohne `Data<>`-Extractor (socketioxide droppt sonst still — dokumentiert an `constants.rs class::LIST_ALL_STUDENTS`, Memory `socketioxide-no-payload-handler`) | require_user |
| `label:data` | S→C | `{ labels: [{ id: number, name: string, color: string }] }` | — |
| `label:create` | C→S | `{ name: string, color?: string }` → bei Erfolg `label:data` (volle Liste re-emitten, Muster catalog) | **require_admin** |
| `label:update` | C→S | `{ id: number, name?: string, color?: string }` → `label:data` | **require_admin** |
| `label:delete` | C→S | `{ id: number }` → `label:data` (CASCADE räumt Junctions) | **require_admin** |
| `label:assign` | C→S | `{ entityType: "quizz"\|"media"\|"catalog", entityId: string, labelIds: number[] }` — **Replace-Set-Semantik** (Transaktion: DELETE alle Zuordnungen der Entität, INSERT neue) → idempotent, kein Diff-Protokoll nötig | require_user + Entitäts-Sichtbarkeit |
| `label:assigned` | S→C | `{ entityType, entityId, labelIds }` (Ack; Flächen refetchen ihre Liste) | — |
| `label:error` | S→C | `{ message: string }` | — |

**Beidseitige Konstanten-Files (WP-Ownership-Regel: der Contract-WP besitzt BEIDE Seiten + Typ-Files):**
- `rust/protocol/src/constants.rs` — `pub mod label`
- `packages/common/src/constants.ts` — `LABEL: { LIST, DATA, CREATE, UPDATE, DELETE, ASSIGN, ASSIGNED, ERROR }`
- `rust/protocol/src/` — neuer ts-rs-Typ `Label { id, name, color }`; `CatalogEntry` (quizz.rs:161) bekommt `label_ids: Option<Vec<i64>>` ZUSÄTZLICH zu `tags` (Koexistenz!)
- `packages/common/src/types/manager.ts` + QuizzMeta (`common/src/types/game`) — `labelIds?: number[]` auf `QuizzMeta` und `MediaMeta` (Map-Risiko: ohne QuizzMeta-Erweiterung kann Web die Quiz-Fläche nicht shippen)

### List-Payload-Erweiterungen (Server)

- `db::get_quizzes_meta` (`rust/server/src/db/quizz.rs`): `LEFT JOIN quiz_labels` + `COALESCE(array_agg(label_id) FILTER (WHERE label_id IS NOT NULL), '{}')` → `labelIds` im Meta-JSON `{id, subject, archived, questionCount, labelIds}`. Damit landet der Label-Stand automatisch in jedem `manager:config`-Re-Emit nach Writes (`config_helper.rs build_and_emit_config`) — deckt das Map-Risiko „Label-State muss in get_quizzes_meta reflektiert sein" ab.
- `db::get_media_list` (`db/media.rs`): analog `labelIds` in MediaMeta.
- `db::get_catalog` (`db/catalog.rs`): analog `labelIds` neben dem bestehenden `tags`.

Owner-Scoping bleibt unangetastet: das Idiom `($N::bigint IS NULL OR owner_id = $N)` mit `me=None` für Admin (Map-Fakt, `config_helper.rs scope_me()`) umschließt weiterhin die Basis-Query; die Label-JOINs ändern die Sichtbarkeit nicht.

---

## 4. Admin-Gating

Exakt die bestehenden Pfade, nichts Neues:

- **Socket (Definitions-CRUD):** `HandlerCtx::require_admin()` (`rust/server/src/socket/mod.rs:53`, role=='admin', Session-Token gecacht via require_user `mod.rs:28`) in `label:create/update/delete` — gleiche Nutzung wie `manager/config.rs:157`, `manager/plugins.rs:323`, `socket/ai.rs:79`. Denied-Pfad emittet `constants::manager::UNAUTHORIZED` (`manager:unauthorized`) **plus `warn!`-Log auf dem Denied-Branch** (Pflicht per Memory `silent-unauthorized-is-game-host` — stumme Denies haben schon eine Regression versteckt).
- **Socket (Lesen + Zuweisen):** `label:list` und `label:assign` sind `require_user` — Map-Risiko beachtet: media:list/catalog:list sind require_user; Tagging/Filtern muss Nicht-Admins (owner-scoped) verfügbar bleiben. `label:assign` prüft zusätzlich, dass die Ziel-Entität für den User sichtbar ist (Owner-Scoping-Idiom).
- **UI-Tab:** ein `BUILTIN_TABS`-Eintrag mit `roleGate: "admin"` in `packages/web/src/features/manager/components/configurations/index.tsx` (TabDef Zeile 82; Admin-Präzedenz gamemode/ki/achievements/running/users/design/satellite Zeilen 139–187; Enforcement `isTabAllowed()` Zeile 211, Rolle aus `useManagerStore`). `nameKey: "manager:tabs.labels"`.
- **Kein HTTP** (§1 Nicht-Ziele) — falls je nötig, NUR `require_admin_http` aus `http/users.rs:36` wiederverwenden, nie die Dev-Key-Fallback-Varianten kopieren.

---

## 5. UI

### 5.1 Neuer Tab „Fächer" (Definition, admin-only)

`ConfigLabels.tsx` unter `features/manager/components/configurations/labels/` — strukturelles Vorbild ist `klassen/ConfigKlassen.tsx` (Map: „closest structural precedent": Suche + Create/Edit/Delete via AlertDialog über einer benannten Entitätsliste, Socket-Wiring in einem Hook `useLabelManager.ts`, Zeilen via `ListRow` aus `console/index.ts`):

- Liste aller Labels (Name + Farb-Chip + Verwendungs-los, YAGNI: kein Usage-Count in v1).
- Anlegen: Name-Input + Farbwahl aus **fester Palette** (~8 vordefinierte Farb-Slugs als Buttons — kein freier Color-Picker).
- Umbenennen/Farbe ändern: AlertDialog wie ConfigKlassen.
- Löschen: AlertDialog mit Hinweis „Label wird von allen Quizzes/Medien/Katalog-Einträgen entfernt" (CASCADE).

### 5.2 Gemeinsame Chip-/Filter-Bausteine (bewusste Ausnahme vom „keine neuen Files"-Reflex)

Map-Befund: es existiert KEIN shared Chip/Badge/FilterPills-Component; Pill- und Chip-Markup ist inline dupliziert (ConfigMedia + ConfigCatalog). Da dieses Feature **drei weitere Kopien** erzeugen würde, sind zwei kleine Shared-Components in `features/manager/components/console/` gerechtfertigt (Map-Risiko „Drift" adressiert; jeweils <50 Zeilen, weit unter monolith-guard):

- `LabelChip.tsx` — Markup-Klon des Katalog-Tag-Chips / StudentList-Klassen-Chips: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium` (`schueler/StudentList.tsx` Zeilen 81–103; `catalog/ConfigCatalog.tsx` Zeilen 264–271), Hintergrund aus dem Farb-Slug, optionales Remove-X.
- `LabelFilterPills.tsx` — Klon der `aria-pressed` rounded-full Pill-Row (`ConfigMedia.tsx` sourceFilter Zeilen 194–215): „Alle" + ein Pill pro Label, Single-Select.

**Design-Token-Pflichten:** Razzoozle-`packages/web` ist token-bound Tailwind (Mode A) — Farb-Slugs mappen auf bestehende `var(--token)`-Werte aus dem Projekt-`@theme`-Block, **keine hartkodierten Hex-Werte** in den Components; `design-excellence`-Checkliste vor dem Schreiben (APCA-Kontrast der Chip-Text/Hintergrund-Paare, Touch-Targets ≥44px für die Filter-Pills, `aria-pressed` beibehalten). Bestehende `design.md` des Projekts ist kanonisch, Palette daraus ableiten.

### 5.3 Die drei Flächen

| Fläche | Chips (Anzeige) | Zuweisen | Filter |
|---|---|---|---|
| **Quiz** (`quizzes/ConfigManageQuizz.tsx` + `QuizzList.tsx`) | `LabelChip`s in `ListRow.meta` (akzeptiert ReactNode, Map-Fakt) neben questionCount | „+ Fach"-Menü pro Zeile via Radix-Select-als-Action-Menu — exakt das `StudentList.tsx`-Muster (Zeilen 105–140, value-Reset nach Pick) → `label:assign` | `LabelFilterPills` neben Such-Input/Sort (`ConfigManageQuizz.tsx` Zeilen 74–121); Prädikat client-seitig in `useQuizzManager.ts` (Filter auf `q.labelIds`) |
| **Medien** (`ConfigMedia/ConfigMedia.tsx`) | `LabelChip`s in der MediaCard-Metazeile (`MediaCard.tsx` Zeilen 100–105) + voll in `MediaInfoDialog.tsx` | Zuweisung im `MediaInfoDialog` (Radix-Select-Muster) | Dritte Pill-Row unter sourceFilter/scope (Zeilen 194–243) + ein Prädikat im bestehenden `filtered`-useMemo (client-seitig, Map-Fakt: „a label filter is a third pill row + one predicate") |
| **Katalog** (`catalog/ConfigCatalog.tsx`) | `LabelChip`s (farbig) NEBEN den bestehenden grauen Freitext-Tag-Chips (Zeilen 264–271) — visuell unterscheidbar durch Farbe | Im `CatalogQuestionModal`/`CatalogQuestionForm` (Map: „where label assignment would plug in") | `LabelFilterPills` neben der Scope-Pill-Group; Prädikat im bestehenden Client-Filter (Suche matcht weiterhin auch `entry.tags`, Zeilen 99–104) |

**Explizit NICHT in v1:** Label-Filter in `ConfigSelectQuizz.tsx` (Play-Tab) — dort existiert heute NULL Filter-UI (Map-Risiko: net-new Layout über einer Radiogroup, kein Spiegelmuster). → Offener Entscheid §8.
**Quiz-Editor-Caveat:** falls Label-UI je im Editor landet: Route-Tree hat keinen ConfigProvider (`pages/manager/quizz/layout.tsx`) — Definitionen via eigenem `label:list` holen oder `useManagerStore`, nie `useConfig()`. v1 braucht den Editor nicht (Zuweisung passiert in der Liste).

### 5.4 i18n

`manager.json` in ALLEN 6 Locales (de/en/es/fr/it/zh, `packages/web/src/locales/<lang>/manager.json`): `tabs.labels` + neuer Top-Level-Block `labels` (Titel, Buttons, Dialog-Texte, Filter-„Alle", Empty-State). Lazy-Backend (`src/i18n.ts`, import.meta.glob) braucht keine Registrierung; `t("manager:labels.…", { defaultValue })` per Konvention.

---

## 6. Work-Package-Schnitt (file-disjunkt)

Reihenfolge: **WP-L0 zuerst mergen** (Scaffold = Contract-Owner), danach L1–L5 **parallel** (disjunkte Files), L6 nach Merge aller. Jeder Worker im eigenen Worktree (stehende Regel), Merge nur via `git -C` auf den Main-Tree.

### WP-L0 — Scaffold: Migration + Contract + Tab-Skeleton
**Files owned:**
- NEU `db/migrations/018_labels.sql` (§2, exakt)
- `rust/protocol/src/constants.rs` (`pub mod label` + Doc-Comments), `rust/protocol/src/quizz.rs` (`Label`-Typ, `CatalogEntry.label_ids`)
- `packages/common/src/constants.ts` (`LABEL`-Block), `packages/common/src/types/manager.ts` + QuizzMeta/MediaMeta-Typfile (`labelIds?: number[]`)
- `.../configurations/index.tsx` (ein `BUILTIN_TABS`-Eintrag `{key:"labels", nameKey:"manager:tabs.labels", icon, component: ConfigLabels, roleGate:"admin"}`)
- NEU `.../configurations/labels/ConfigLabels.tsx` (Skeleton: EmptyState-Platzhalter)
- 6× `locales/*/manager.json` (alle Keys, auch die von L2–L5 gebrauchten — i18n zentral hier, damit die Fill-WPs die JSONs nicht anfassen)

**Akzeptanz:** Migration läuft 2× hintereinander fehlerfrei (Idempotenz); `cargo build` + ts-rs-Export grün; Tab erscheint NUR für Admin (Nicht-Admin-Session: Tab fehlt); `pnpm verify` grün.
**Gates:** `bash rust/gate.sh` · `pnpm verify` · `scripts/check-locales.sh` · Ephemeral-PG-Idempotenz (frischer PG-Container, alle Migrationen 2× via migrate-apply.sh, Exit 0) · Rebase-Check auf Migrations-Nummern-Kollision mit 016/017 vor Merge.

### WP-L1 — Rust-Handler + db-Layer
**Files owned:**
- NEU `rust/server/src/db/labels.rs` — `get_labels`, `create_label`, `update_label`, `delete_label`, `set_entity_labels(entity_type, entity_id, label_ids)` (Transaktion, Replace-Set)
- NEU `rust/server/src/socket/manager/labels.rs` — `pub fn register(...)`, alle `label:*`-Handler (Gating §4, `warn!` auf Denied)
- `rust/server/src/socket/manager/mod.rs` — `pub mod labels;` + Registration (Muster catalog/classes/media)
- `rust/server/src/db/quizz.rs` / `db/media.rs` / `db/catalog.rs` — `labelIds`-Aggregation in `get_quizzes_meta` / `get_media_list` / `get_catalog` (§3)
- `rust/server/src/socket/manager/quizz.rs` — Save-Handler: bei ID-Wechsel durch Titel-Rename Labels vom alten auf den neuen Datensatz übertragen (ein `UPDATE quiz_labels SET quiz_id=$new WHERE quiz_id=$old` vor dem Delete des Alt-Records, in der Save-Transaktion)

**Akzeptanz:** `label:list` als payloadless `|socket: SocketRef|` (kein Data-Extractor!); Nicht-Admin auf `label:create` → `manager:unauthorized` + warn-Log; `label:assign` auf fremde (nicht-sichtbare) Entität → abgelehnt; Rename-Carry-over getestet; alle Files <400 Zeilen (monolith-guard).
**Gates:** `bash rust/gate.sh` · Rust-Unit-Tests (§7) isoliert grün (Memory `rust-test-isolation-flakes`: flakende Tests isoliert re-runnen) · Ephemeral-PG-Asserts.

### WP-L2 — Definitions-UI (Fächer-Tab)
**Files owned:** `labels/ConfigLabels.tsx` (Fill), NEU `labels/useLabelManager.ts`, NEU `console/LabelChip.tsx`, NEU `console/LabelFilterPills.tsx`, `console/index.ts` (Re-Exports).
**Akzeptanz:** CRUD-Roundtrip im Browser (anlegen → erscheint; umbenennen → Chip-Text ändert sich; löschen → weg); Farbwahl nur aus Palette; keine hartkodierten Hex; Empty-State; alle Strings via `t()`.
**Gates:** `pnpm verify` (Typecheck) · `scripts/check-locales.sh` · design-excellence-Review (APCA, Touch-Targets, aria-pressed).

### WP-L3 — Quiz-Fläche
**Files owned:** `quizzes/ConfigManageQuizz.tsx`, `quizzes/QuizzList.tsx`, `quizzes/useQuizzManager.ts`.
**Akzeptanz:** Chips in ListRow.meta; „+ Fach"-Menü assignt via `label:assign` und die Liste zeigt den neuen Stand nach dem nächsten `manager:config` (Reload-Fall inklusive — get_quizzes_meta trägt labelIds); Filter-Pill grenzt Liste korrekt ein; Suche+Sort+Filter kombinierbar; Archiv-Sektion gefiltert.
**Gates:** `pnpm verify` · check-locales (keine neuen Keys nötig — aus L0).

### WP-L4 — Medien-Fläche
**Files owned:** `ConfigMedia/ConfigMedia.tsx`, `ConfigMedia/MediaCard.tsx`, `ConfigMedia/MediaInfoDialog.tsx`.
**Akzeptanz:** Chips auf Card; Zuweisung im InfoDialog persistiert (DB prüfen, nicht nur UI — Memory `reload-load-gate-isconnected`: „zero network"-Signale sind bei Socket.io irreführend); Label-Pill-Row filtert zusammen mit sourceFilter+scope+Suche.
**Gates:** `pnpm verify`.

### WP-L5 — Katalog-Fläche
**Files owned:** `catalog/ConfigCatalog.tsx`, `catalog/CatalogQuestionModal.tsx`/`CatalogQuestionForm.tsx`.
**Akzeptanz:** Label-Chips farbig NEBEN grauen Freitext-Tags (beide sichtbar, unterscheidbar); Zuweisung im Modal; Filter-Pills; bestehende Tag-Suche unverändert.
**Gates:** `pnpm verify`.

### WP-L6 — E2E + Abnahme (nach Merge L0–L5, sequenziell — shared PG, Memory `e2e-recap-flow-parity-gaps`)
**Files owned:** neuer Stagehand-Test im bestehenden e2e-Harness.
**Akzeptanz:** §7-Browser-Flow grün; **voller Game-Loop-Smoke** danach (login→create×2→START→play→reveal→finish — Lobby erreichen ist KEIN Pass, Memory `spot-test-full-flow`), um Regressionsfreiheit der manager:config-Erweiterung zu belegen.
**Gates:** Stagehand-Run · Game-Loop-Smoke · re-gate des Main-Trees (`rust/gate.sh` + `pnpm verify`) vor Deploy.

---

## 7. Test-Plan (Pflicht)

1. **Rust-Unit (db-Layer, `rust/server/src/db/labels.rs` `#[cfg(test)]` bzw. bestehender Test-Ort):**
   - create/rename/delete Label; UNIQUE-Name-Verletzung → Fehler.
   - `set_entity_labels` Replace-Set: setzen → ändern → leeren; UNIQUE-Paar hält Doppel-Insert ab.
   - Label-Delete → CASCADE räumt alle drei Junctions.
   - Entity-Delete (Quiz löschen) → quiz_labels-Zeilen weg.
   - Quiz-Rename-Carry-over: alt-ID→neu-ID, Labels bleiben.
   - `get_quizzes_meta`/`get_media_list`/`get_catalog` liefern korrekte `labelIds` inkl. leerem Array; Owner-Scoping unverändert (me=Some sieht nur eigene, me=None alles).
   - Flake-Regel: Tests mit globalem State isoliert re-runnen (Memory `rust-test-isolation-flakes`); gate.sh führt Tests NICHT aus → Test-Lauf ist eigener Gate-Schritt.
2. **Ephemeral-PG-Asserts (frischer Container):**
   - Alle Migrationen 001–018 **zweimal** hintereinander via `scripts/migrate-apply.sh` → Exit 0 (Idempotenz-Gate).
   - `\d labels` / `\d quiz_labels` etc.: FK-Targets, UNIQUE-Constraints, Indizes vorhanden.
   - safe_id-CHECK greift: Insert mit ungültiger entity_id schlägt fehl.
3. **Web:** `pnpm verify` (Typecheck+Lint+Tests) pro WP; ts-rs-Export ↔ common-Typen konsistent.
4. **Stagehand-Browser-Flow (ein Szenario, act-cache-fähig):**
   Admin-Login → Tab „Fächer" → Label „Mathe" (Farbe wählen) anlegen → Quiz-Tab: Quiz mit „Mathe" taggen → Chip sichtbar → Filter „Mathe" → nur getaggtes Quiz sichtbar, Filter „Alle" → alle → Medien-Tab: Medium taggen → Label-Pill filtert Cards → Katalog analog → zurück zu „Fächer": Label umbenennen → Chip-Texte überall aktualisiert → Label löschen → Chips überall weg. **Negativ:** Login als Nicht-Admin → Tab „Fächer" existiert nicht.
5. **i18n ×6:** `scripts/check-locales.sh` grün (alle Keys in de/en/es/fr/it/zh); Stichprobe: UI auf en umschalten, keine rohen Keys.
6. **Persistenz-Gegenprobe:** nach Tagging `SELECT` direkt auf quiz_labels — DB ist die Wahrheit, nicht das UI (Memory-Regel).

---

## 8. Offene User-Entscheide (klar markiert)

| # | Frage | Optionen | Empfehlung |
|---|---|---|---|
| E1 | **Farbe pro Label?** | ja (feste Palette ~8 Töne) / nein (alle grau) | **Ja, feste Palette** — Chips auf 3 Flächen sind ohne Farbe kaum scanbar; feste Slugs halten design.md-Token-Bindung. Schema trägt `color` so oder so (Default 'gray'), Entscheid kostet nur UI. |
| E2 | **Filter-UI: Pill-Klick vs. Dropdown** | Pill-Row (Muster ConfigMedia sourceFilter) / Dropdown | **Pill-Row, Single-Select + „Alle"** — exakt das etablierte Muster; Dropdown wäre neues Pattern. Bei >~10 Labels später auf Dropdown wechseln (nicht jetzt, YAGNI). |
| E3 | **Mehrfach-Label pro Item?** | ja / nein (max 1 „Fach") | **Ja** — Schema (UNIQUE-Paar) und UI (Chips) tragen es ohne Mehraufwand; ein Hard-Limit wäre künstlich und müsste extra erzwungen werden. |
| E4 | **Label-Filter auch im Play-Tab (`ConfigSelectQuizz`)?** | v1 / später | **Später** — dort existiert null Filter-UI (net-new Layout, Map-Risiko). Erst Nutzung auf den 3 Kern-Flächen beobachten. |
| E5 | **Zuweisen: nur Owner oder jeder require_user?** | jeder eingeloggte User auf für ihn sichtbare Entitäten / nur Owner+Admin | **Sichtbarkeits-Scoping (wie Design oben)** — deckungsgleich mit bestehender Edit-Berechtigung der Flächen. |
| E6 | **Katalog-Freitext-Tags langfristig?** | koexistieren / später deprecaten | **Koexistieren (v1 fix)** — Deprecation wäre Contract-Bruch (`CatalogEntry.tags`), separater Entscheid wenn Labels sich bewährt haben. |
| E7 | **Quiz-Rename-Carry-over** (§6 WP-L1) bestätigen | Labels wandern mit / gehen verloren | **Wandern mit** — alles andere fühlt sich wie Datenverlust an. Bitte absegnen, weil es den Save-Handler berührt. |

---

## Implementation Hazards & Mitigations

| Hazard | Severity | Mitigation |
|---|---|---|
| Migrations-Nummern-Kollision (016 main-only, 017 branch-only, Worktree sv-int endet bei 015) | HIGH | 018 explizit geclaimt; Rebase-Check auf `db/migrations/` vor Merge (WP-L0-Gate). |
| Quiz-Rename erzeugt neue ID → CASCADE killt Labels | HIGH | Carry-over im Save-Handler (WP-L1) + Unit-Test; Entscheid E7. |
| `label:list` mit Data-Extractor → Handler feuert still nie | MEDIUM | Payloadless-Signatur `|socket: SocketRef|` als Akzeptanzkriterium; Präzedenz-Doku an `class::LIST_ALL_STUDENTS`. |
| Stummer Admin-Deny verschluckt Fehlerbild | MEDIUM | `warn!` auf jedem Denied-Branch (Pflicht, Memory-Regel). |
| `CatalogEntry.tags` versehentlich umgedeutet | MEDIUM | `label_ids` als NEUES Feld; `tags` byte-identisch; Contract-Files exklusiv bei WP-L0. |
| manager:config-Payload-Erweiterung bricht Player/Reload-Flows | MEDIUM | additives optionales Feld `labelIds?`; WP-L6 voller Game-Loop-Smoke. |
| Chip/Pill-Markup-Drift (3 neue Kopien) | LOW | Shared `LabelChip`/`LabelFilterPills` (WP-L2), Flächen konsumieren nur. |

## Definition of Done

- [ ] 018 idempotent (2×-Lauf-Gate auf Ephemeral-PG), FKs/UNIQUE/Indizes verifiziert.
- [ ] `label:*`-Contract beidseitig (constants.rs + constants.ts) mit Doc-Comment-Payloads.
- [ ] Definitions-CRUD strikt admin-gated (require_admin + roleGate:"admin" + warn-Log); Negativ-Test Nicht-Admin.
- [ ] Chips + Filter auf Quiz-, Medien-, Katalog-Fläche funktional; Owner-Scoping unverändert.
- [ ] Rust-Unit-Tests + Ephemeral-PG-Asserts + `pnpm verify` + `scripts/check-locales.sh` (×6 Locales) grün.
- [ ] Stagehand-Flow (anlegen → taggen → filtern → Medien filtern → umbenennen → löschen) grün.
- [ ] Voller Game-Loop-Browser-Smoke nach Deploy grün (Lobby ≠ Pass).
- [ ] Alle WPs in eigenen Worktrees; Merges via `git -C` auf Main-Tree; keine Files >400 Zeilen.