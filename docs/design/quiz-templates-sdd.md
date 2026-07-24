# SDD — Quiz-Vorlagen (Template Library) · 2026-07-24

**Fläche:** Manager-Konsole, Tab *Inhalte → Quiz* (`/manager/config/quiz`)
**Kanon:** `design.md` §8·B (Console/Backstage, D1–D28) + W6 Row-System-Kanon
**Status:** Spec eingefroren (Wave-0-Contract), Umsetzung in Wellen 1–3

---

## 0. Design-Bindung

Diese Spec erfindet **kein** Aussehen. Jede visuelle Aussage hier ist ein Verweis
auf bereits entschiedenes Design; wo diese Spec und der Kanon sich
widersprechen, gewinnt der Kanon.

### 0.1 Verbindliche Quellen

| Quelle | Was sie regelt | Relevanz hier |
|---|---|---|
| [`design.md`](../../design.md) | **Design-Verfassung**, kanonische Zusammenfassung | gesamte Spec |
| [`design.md` §2](../../design.md) | Non-Negotiable Guardrails (u.a. ink-on-fill, kein Glass) | jedes UI-WP |
| [`design.md` §3](../../design.md) | Color Tokens — Brand, Surfaces, State | Farbwahl, verboten: Literale |
| [`design.md` §3·B](../../design.md) | **Component Inventory** — die vorgeplanten Bausteine | §5 komponiert ausschliesslich hieraus |
| [`design.md` §4](../../design.md) | Typografie (Rubik, tabular-nums) | Zeilen-/Dialogtypografie |
| [`design.md` §8·B](../../design.md) | **Console (Backstage)** inkl. Tokens + D1–D28 | die Leitplanke dieser Fläche |
| [`design.md` §8·B / W4](../../design.md) | Chip-Kanon D19, Filter-Pill-Kanon D20, Overflow-Kanon D21, Scrollbar-Kanon D28 | Kategorie-Pills, Tag-Chips, ⋮-Menü, Dialog-Scrollfläche |
| [`design.md` §8·B / W6](../../design.md) | Row-System-Kanon (violetter Card-Hover, `rowStyles.ts`, Dichte, Selection, Bulk, Dialog, i18n) | Vorlagen-Zeile im Dialog |
| [`docs/specs/manager-row-system.md`](../specs/manager-row-system.md) | Row-System-SDD **R1–R27** — die Langfassung des W6-Kanons | `ListRow`-Nutzung in §5.1 |
| [`docs/design/manager-uiux-sdd.md`](./manager-uiux-sdd.md) | Manager-UI/UX-Refactor — Herkunft von D1–D18, ActionFooter-Muster (D14) | §5, WP-7 |
| [`docs/design/w7-manager-perfection-sdd.md`](./w7-manager-perfection-sdd.md) | Feinschliff-Entscheide der Konsole | Dialog- und Formdetails |
| [`docs/design/w6-card-anatomy.md`](./w6-card-anatomy.md) | Karten-/Zeilen-Anatomie | Aufbau der Vorlagen-Zeile |
| [`docs/design/w4-row-primitive-unification.md`](./w4-row-primitive-unification.md) | Vereinheitlichung auf das Row-Primitive | Verbot handgebauter Zeilen (V4) |
| [`docs/design/razzoozle-flat-design-decisions.md`](./razzoozle-flat-design-decisions.md) | Grundsatzentscheide des Flat-Systems | Begründung hinter §2/§3 |
| [`docs/design/razzoozle-flat-palette-verified.md`](./razzoozle-flat-palette-verified.md) | WCAG-Kontrastnachweise der Palette | Farbpaare gelten als geprüft |
| [`docs/design/razzoozle-flat-design-gap-analysis.md`](./razzoozle-flat-design-gap-analysis.md) | Audit + Marken-Säulen | Einordnung der Befunde §1.1 |

### 0.2 Quellcode-Kanon (Single Source, nicht nachbauen)

| Datei | Rolle |
|---|---|
| `packages/web/src/index.css` (`@theme`) | alle Tokens; Tailwind 4 **ohne** `tailwind.config` (§5 design.md) |
| `.../manager/components/console/rowStyles.ts` | 15 Zeilen-Konstanten, Hover/Selected exklusiv branchen (W6 §2) |
| `.../manager/components/console/listMotion.ts` | Ein-/Ausfahrt-Kurve aller Listen (W6 §7) |
| `.../manager/components/console/ListRow.tsx` · `EmptyState.tsx` · `SectionCard.tsx` | Zeilen-, Zustands- und Container-Primitive (D11) |
| `.../components/manager/DialogPanel.tsx` | Radix-Dialog-Chrome (D10) — Scrim, Titel, Close, Fokusfalle |
| `.../components/manager/OverflowMenu.tsx` · `FilterPill.tsx` · `Badge.tsx` | ⋮-Menü (D21), Filter-Pills (D20), Chips (D19) |
| `.../components/ui/ActionFooter.tsx` | Primäraktions-Leiste (D14) |

### 0.3 Nachweis statt Behauptung

„Ist im Stil" gilt erst, wenn beides zutrifft:

```bash
bash scripts/check-manager-tokens.sh    # D1/D2/D10 grep-Gate, CI-blockierend
~/.claude/skills/design-validator/scripts/validate.sh   # GREEN/YELLOW/RED gegen design.md
```

Jedes UI-WP nennt in seinem Report die Kanon-Punkte, gegen die es gebaut hat
(z.B. „D10, D11, D14, W6 §2/§7"). Ein Review, das nur „sieht gut aus" sagt,
zählt nicht.

---

## 1. Problem

Die Vorlagen-Funktion (`TemplateLibraryCard`) wurde als Prototyp eingehängt und
nie an den Konsolen-Kanon angeglichen. Sie sitzt permanent zwischen
Select-All-Leiste und Quiz-Liste (`ConfigManageQuizz.tsx:194`) und kostet dort
dauerhaft vertikalen Platz, obwohl sie eine seltene Aktion ist.

### 1.1 Kanon-Verstöße im Bestand (`TemplateLibraryCard.tsx`, 74 LOC)

| # | Zeile | Verstoß | Regel |
|---|-------|---------|-------|
| V1 | 42 | `bg-white`, `border` ohne Token, `rounded-xl`, `shadow-sm` | D1, D5, D9 |
| V2 | 55 | `text-gray-500` | D1 |
| V3 | 46 | `text-red-600` als einziger Fehler-Kanal | D1, D3, D16 |
| V4 | 51 | handgebaute Zeile statt `ListRow` | D11, W6-Kanon |
| V5 | 61 | handgebauter Button statt `Button`, kein D7-Focus, `rounded-md` | D7, D9, D11 |
| V6 | 194 (Parent) | Primäraktion mitten im Listen-Flow statt `ActionFooter` | D14 |
| V7 | — | kein Loading-, kein Empty-State; Fehler nur als roter Fließtext | D16 |
| V8 | 44, 65 | `defaultValue`-Fallbacks in `t()` | W6-Kanon §15 |
| V9 | 19–23 | nacktes `fetch` statt `fetchWithAuth` | Bestandsmuster `lib/api.ts` |

### 1.2 Fehlende Funktion

Das Backend (`rust/server/src/http/templates.rs`) kennt nur:

- `GET /api/templates` → Metadaten-Liste
- `POST /api/templates/create-from` → Quiz aus Vorlage erzeugen

Es gibt **kein Anlegen, kein Bearbeiten, kein Löschen** von Vorlagen. Die
Vorlagen unter `config/templates/*.json` sind nur per Dateizugriff auf dem
Server pflegbar.

---

## 2. Entscheidungen (User, 2026-07-24)

| # | Entscheidung | Konsequenz |
|---|---|---|
| E1 | **Volles CRUD inkl. Fragen** | Neue REST-Endpunkte + Editor im Template-Modus |
| E2 | **Dialog aus dem ActionFooter** | Dritter Button „Aus Vorlage“; Card verschwindet aus dem Listen-Flow |
| E3 | **Admin-only für Schreibzugriff** | Lesen/Verwenden: jede Session. Anlegen/Ändern/Löschen: `role == "admin"`, server-erzwungen |

**Non-Goals:** Vorlagen-Kategorien als eigene Verwaltungsfläche · Import/Export
von Vorlagen-Dateien · Vorlagen-Sharing zwischen Instanzen · Besitzer pro
Vorlage (E3 ist global, nicht per-User) · Umbau der Quiz-Liste selbst.

---

## 3. Ziel-Architektur

```
ActionFooter [ + Neues Quiz ] [ ⤒ Import ] [ ▤ Aus Vorlage ]
                                              │
                                              ▼
                              TemplatePickerDialog (Radix, D10)
                              ├─ Suche + Kategorie-FilterPills
                              ├─ ListRow je Vorlage
                              │   ├─ primär: „Verwenden“ → POST create-from → /manager/quizz/:id
                              │   └─ ⋮ (nur Admin)
                              │       ├─ „Bearbeiten“  → /manager/template/$templateId   (Fragen)
                              │       ├─ „Umbenennen“  → TemplateMetaDialog (PUT, nur Metadaten)
                              │       └─ „Löschen“     → AlertDialog → DELETE
                              └─ Footer (nur Admin): „Neue Vorlage“ → TemplateMetaDialog → POST
                                              │
                                              ▼
                              /manager/template/$templateId
                              QuizzEditorProvider + QuizzEditorShell
                              (Header mit templateMode → REST statt Socket)
```

**Zwei getrennte Wege — nicht verwechseln** (Plan-Review-Befund):

| Aktion | Öffnet | Persistenz | ändert |
|---|---|---|---|
| **Bearbeiten** | Editor-Route `/manager/template/$templateId` | `PUT` mit vollem Body | Fragen (Metadaten unverändert durchgereicht) |
| **Umbenennen** | `TemplateMetaDialog` | `PUT` mit vollem Body | Metadaten (Fragen unverändert durchgereicht) |
| **Neue Vorlage** | `TemplateMetaDialog` | `POST` | legt an, `questions: []` oder aus `fromQuizId` |

Beide `PUT`-Wege senden immer den **kompletten** `TemplateWriteBody` — es gibt
kein Teil-Update, damit kein Weg den jeweils anderen Teil leert.

**Kernentscheidung:** Es entsteht **kein zweiter Editor**. Der bestehende
Quiz-Editor bekommt einen optionalen Persistenz-Modus; nur der Speicherpfad im
Header verzweigt. Alles darunter (Fragen-Liste, Slides, Typ-Picker) bleibt
unverändert.

---

## 4. Contract-Freeze (Wave 0 — verbindlich für alle WPs)

### 4.1 REST-API

Alle Pfade unter `/api/templates`. Schreiboperationen verlangen
`Authorization: Bearer <token>` mit `role == "admin"`; fehlt/greift das nicht →
**403** mit JSON-Body `{"error":"..."}`. Lesen bleibt wie bisher ohne Admin-Gate.

| Methode | Pfad | Auth | Body | Antwort |
|---|---|---|---|---|
| GET | `/api/templates` | Session | — | `TemplateMeta[]` (unverändert) |
| GET | `/api/templates/:id` | Session | — | `TemplateFull` |
| POST | `/api/templates` | **Admin** | `TemplateCreateBody` | `TemplateFull` (201) |
| PUT | `/api/templates/:id` | **Admin** | `TemplateWriteBody` | `TemplateFull` |
| DELETE | `/api/templates/:id` | **Admin** | — | `204` |
| POST | `/api/templates/create-from` | Session | `{templateId, subject?}` | unverändert |

**Typen (Serde-Namen = Wire-Namen, camelCase):**

```ts
type TemplateMeta = {
  id: string; category: string; name: string;
  description: string; tags: string[]; questionCount: number
}

type TemplateFull = TemplateMeta & { questions: Question[] }  // Question = @razzoozle/common

type TemplateWriteBody = {
  name: string; category: string; description: string;
  tags: string[]; questions: Question[]
}

type TemplateCreateBody = TemplateWriteBody & { fromQuizId?: string }
// fromQuizId gesetzt → questions werden aus dem Quiz übernommen, Body-questions ignoriert
```

**Server-Invarianten:**

- `id` wird **serverseitig** vergeben (`slugify(name)` + Kollisions-Suffix), nie
  vom Client. Bestehende IDs bleiben stabil.
- Jede `:id` läuft durch `safe_asset_id` (Bestand, `crate::state`) → kein
  Pfad-Traversal.
- Schreiben ist **atomar**: in `<id>.json.tmp` schreiben, dann `fs::rename` —
  ein Absturz darf keine halbe Datei hinterlassen.
- `PUT` auf unbekannte `id` → 404, kein implizites Anlegen.
- `DELETE` löscht nur die Vorlagen-Datei; daraus erzeugte Quizze bleiben.
- Das Dateiformat bleibt exakt das bestehende (`id/category/name/description/
  tags/questions`) — die drei Bestandsdateien in `config/templates/` müssen ohne
  Migration weiter laden.
### 4.1a Auth-Konsolidierung (Plan-Review 2026-07-24, korrigiert)

Der erste Entwurf wollte `require_admin_http` aus `users.rs` hochziehen. Das war
falsch — der Bestand hat **bereits eine zentrale Auth**, und zwar zweigleisig:

| Stelle | Header | Nutzer |
|---|---|---|
| `rust/server/src/auth/mod.rs` (`ensure_admin`, `ensure_manager`, `ensure_manager_user`) | **nur** `X-Manager-Token` | plugins, assignments, skeleton (via `http::authorize_admin_request`, das nur delegiert) |
| `rust/server/src/http/users.rs:38` `require_admin_http` (privat) | **nur** `Authorization: Bearer` | die Users-REST-API |

Das Frontend spricht über `fetchWithAuth` (`lib/api.ts`) ausschliesslich
**Bearer** — deshalb existiert der zweite Guard überhaupt. Ein dritter Guard für
Templates würde die Duplikation zementieren (bekanntes Fehlermuster: verstreute
Authorizer, die einzeln driften).

**Entscheidung:** Templates bekommen **keinen eigenen Guard**. Stattdessen wird
die zentrale Auth einmal um den Bearer-Transport erweitert (WP-0):

- `auth::resolve_session_user` akzeptiert `Authorization: Bearer <token>`
  **oder** `X-Manager-Token` — beide lösen über dasselbe
  `db::users::session_user` auf. Additiv, kein Rechteverlust: derselbe Token,
  anderer Transportheader.
- neu: `pub async fn ensure_admin_user(headers, pool) -> Option<AuthUser>`
  (Admin-Variante von `ensure_manager_user`) für Handler, die den User brauchen.
- `users.rs::require_admin_http` wird **gelöscht**, die Users-Handler rufen
  `auth::ensure_admin_user`.
- `templates.rs` nutzt dieselbe Funktion. Keine neue Auth-Logik, kein
  Dev-Key-Fallback, keine Kopie.

Danach existiert genau **eine** Stelle, die einen Session-Token zu einer Rolle
auflöst.

### 4.2 i18n — `manager:templates.*` (Namespace `manager`, alle 6 Locales)

Bestand `title`/`use` bleibt. Neu:

```
templates.open              "Aus Vorlage"            (ActionFooter-Button)
templates.dialogTitle       "Vorlage wählen"
templates.searchPlaceholder "Vorlage suchen"
templates.allCategories     "Alle"
templates.questionCount_one / _other   "{{count}} Frage" / "{{count}} Fragen"
templates.empty.title       "Noch keine Vorlagen"
templates.empty.body        "Lege eine Vorlage an, um Quizze schneller zu starten."
templates.noMatches         "Keine Vorlage passt zur Suche."
templates.loading           "Vorlagen werden geladen"
templates.loadError         "Vorlagen konnten nicht geladen werden."
templates.edit              "Bearbeiten"
templates.delete            "Löschen"
templates.create            "Neue Vorlage"
templates.saveAsTemplate    "Als Vorlage speichern"
templates.form.name / .category / .description / .tags / .tagsHint
templates.deleteConfirm.title / .body / .confirm
templates.saved             "Vorlage gespeichert"
templates.deleted           "Vorlage gelöscht"
templates.createError / .saveError / .deleteError
```

Regel: **keine `defaultValue`-Fallbacks** (W6-Kanon §15). Pflege ausschließlich
über `scripts/locale-sync.mjs`, Gate `scripts/check-locales.sh`.

### 4.3 `data-testid` (eingefroren — e2e hängt daran)

| testid | Element |
|---|---|
| `quizz-template-btn` | ActionFooter-Button „Aus Vorlage“ |
| `template-picker` | Dialog-Root |
| `template-search` | Suchfeld im Dialog |
| `template-row-<id>` | ListRow einer Vorlage |
| `template-use-<id>` | Primäraktion „Verwenden“ (Name aus Bestand beibehalten) |
| `template-edit-<id>` | Menüpunkt „Bearbeiten“ (→ Editor-Route) |
| `template-rename-<id>` | Menüpunkt „Umbenennen“ (→ Metadaten-Dialog) |
| `template-delete-<id>` | Menüpunkt „Löschen“ |
| `template-create-btn` | „Neue Vorlage“ im Dialog-Footer |
| `template-meta-form` | Metadaten-Dialog |
| `template-save-btn` | Speichern im Metadaten-Dialog |
| `editor-save-template-btn` | „Als Vorlage speichern“ im Quiz-Editor-Header |

`template-library` (alter Card-Root) entfällt ersatzlos.

---

## 5. UI-Spezifikation

Komponiert **ausschließlich** aus dem bestehenden Inventar: `DialogPanel`,
`ListRow`, `EmptyState`, `OverflowMenu`, `FilterPill`, `Badge`, `Button`,
`Input`, `Select`, `ActionFooter`, `rowStyles.ts`, `listMotion.ts`.

### 5.1 Mockup — TemplatePickerDialog

```html
<!-- DialogPanel maxWidth="lg" · Scrim bg-black/40 (D10) -->
<div class="rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-6 shadow-[var(--shadow-flat)]">
  <h2 class="text-lg font-semibold text-[var(--ink)]">Vorlage wählen</h2>

  <!-- Suche + Kategorie-Pills -->
  <input class="mt-4 min-h-11 w-full rounded-[var(--radius-theme)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--ink)]
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
         placeholder="Vorlage suchen" />
  <div class="mt-3 flex flex-wrap gap-2">
    <button class="min-h-9 rounded-full px-2.5 py-0.5 text-xs font-semibold">Alle</button>
    <button class="min-h-9 rounded-full px-2.5 py-0.5 text-xs font-semibold">math</button>
    <button class="min-h-9 rounded-full px-2.5 py-0.5 text-xs font-semibold">sprachen</button>
  </div>

  <!-- Liste: ListRow density="compact", max-h + console-scroll (D28) -->
  <ul class="console-scroll mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
    <li class="flex items-center gap-3 rounded-lg px-4 py-2 outline outline-transparent
               hover:bg-[var(--accent-tint)] hover:outline-[var(--color-primary)]">
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold leading-5 text-[var(--ink)]">Quadratformel</span>
        <span class="block truncate text-xs leading-4 text-[var(--ink-muted)]">math · 2 Fragen</span>
      </span>
      <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold">algebra</span>
      <button class="min-h-11 rounded-lg px-3 text-sm">Verwenden</button>
      <button class="min-h-11 min-w-11" aria-label="Weitere Aktionen">⋮</button>
    </li>
  </ul>

  <!-- Footer nur für Admin -->
  <div class="mt-5 flex justify-end">
    <button class="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-theme)] bg-[var(--color-primary)] px-5 py-3 text-white">
      + Neue Vorlage
    </button>
  </div>
</div>
```

**Regeln:**

- Zeilen-Hover/-Selected kommen aus `console/rowStyles.ts` (W6 §2), **nie**
  handgeschrieben — das Mockup zeigt nur das Ergebnis.
- Kategorie-Pills via `FilterPill` mit `token-ok: toolbar-density-36` (W6 §6).
- Tag-Chips via `Badge`/`chipBase` (D19), maximal 3 sichtbar, Rest `+n`.
- Weiß auf Violett ist nur auf `--color-primary` erlaubt (D6).
- Listen-Ein-/Ausblendung über `console/listMotion.ts` (W6 §7).

### 5.2 Zustände (D16, verpflichtend)

| Zustand | Darstellung |
|---|---|
| Laden | `aria-live="polite"`-Region mit `templates.loading`, keine Sprung-Layouts |
| Leer (0 Vorlagen) | `EmptyState` (Icon `LayoutTemplate`) + CTA „Neue Vorlage“ (nur Admin) |
| Keine Treffer (Filter) | `EmptyState` mit `templates.noMatches`, CTA = Filter zurücksetzen |
| Ladefehler | `EmptyState` mit `templates.loadError` + „Erneut versuchen“ |
| Schreibfehler | Toast (Bestandsmuster) mit `templates.saveError`/`.deleteError` |

### 5.3 Berechtigung im UI

`useManagerStore().role === "admin"` blendet ⋮-Menü, „Neue Vorlage“ und „Als
Vorlage speichern“ ein. Das UI-Gate ist **Komfort, nicht Sicherheit** — die
Durchsetzung liegt beim Server (§4.1). Ein Nicht-Admin sieht die Vorlagen und
kann sie verwenden.

### 5.4 Metadaten-Dialog (`TemplateMetaDialog`)

`DialogPanel maxWidth="md"`. Felder: Name (Pflicht), Kategorie (`Select`,
Bestandswerte + Freitext), Beschreibung (`Input`), Tags (kommasepariert →
`string[]`, Hinweiszeile). D15-Formularregeln: `aria-invalid` bei leerem Namen,
Fehlermeldung neben dem Feld, Fokus auf das erste ungültige Feld. Zwei Aufrufer:
„Neue Vorlage“ (`POST`) und „Umbenennen“ (`PUT`, Metadaten geändert, `questions`
unverändert durchgereicht). **Nicht** der Weg für Fragen — das ist §5.5.

### 5.5 Template-Editor-Route

`/manager/template/$templateId` (englischer Slug — stehende Regel), Datei
`packages/web/src/pages/manager/template.$templateId.tsx`. `route.gen.ts` ist
**generiert** — nie von Hand anfassen, der Build erzeugt den Eintrag.

Ablauf: `GET /api/templates/:id` → `QuizzEditorProvider initialData={{id,
subject: name, questions}}` → `QuizzEditorShell`. Beim Speichern verzweigt der
Header (§6, WP-9): `PUT /api/templates/:id` mit vollem `TemplateWriteBody`
(Metadaten aus dem geladenen Template unverändert, `questions` aus dem Editor).
Kein Socket-Emit im Template-Modus. Nicht-Admin, der die Route direkt aufruft →
Redirect auf `/manager/config/quiz`.

**Spinner-Falle (Plan-Review-Befund, verbindlich für WP-9).** `handleSave`
(`QuizzEditorHeader.tsx:96`) setzt `isSaving = true`; zurückgesetzt wird es
ausschliesslich in den Socket-Handlern `QUIZZ.SAVE_SUCCESS` / `UPDATE_SUCCESS` /
`ERROR` (Zeilen 149–175). Im Template-Modus kommt keins dieser Events → der
Spinner hinge dauerhaft.

`useEvent` ist ein `useEffect`-Wrapper (`socket-context.tsx:394`) und darf
deshalb **nicht** bedingt aufgerufen werden (Rules of Hooks). Der Fix ist
folglich:

1. Die drei `useEvent`-Aufrufe bleiben unbedingt stehen; ihre **Callbacks**
   returnen früh, wenn `templateMode` gesetzt ist.
2. Der Template-Zweig in `handleSave` setzt `isSaving` selbst zurück — im
   `.then()` **und** im `.catch()` (bzw. `finally`), inklusive Erfolgs-/
   Fehlertoast und Zurücksetzen des Dirty-Snapshots (`markSaved`).
3. `leaveAfterSaveRef`-Verhalten (Speichern-und-verlassen) muss im
   Template-Zweig identisch bedient werden, sonst hängt der Verlassen-Dialog.

Akzeptanz dafür: Speichern im Template-Editor beendet den Spinner sichtbar, ein
erzwungener Serverfehler (403) zeigt einen Fehlertoast **und** löst den Spinner.

---

## 6. Work-Packages

Wave 0 = dieses Dokument (eingefroren). Innerhalb einer Welle sind alle WPs
dateidisjunkt und laufen parallel.

### Welle 1 — Auth-Fundament, Backend, Contract-Artefakte

**WP-0 läuft allein und zuerst** — WP-1 und WP-2 bauen darauf auf.

| WP | Datei(en) | Inhalt | Akzeptanz |
|---|---|---|---|
| **WP-0** | `rust/server/src/auth/mod.rs`, `rust/server/src/http/users.rs` | Auth-Konsolidierung nach §4.1a: `resolve_session_user` akzeptiert zusätzlich `Authorization: Bearer`; neu `ensure_admin_user`; `require_admin_http` in `users.rs` **gelöscht**, Handler rufen die zentrale Funktion | `cargo build` + `cargo test` grün · `grep -rn "require_admin_http" rust/` liefert 0 Treffer · Users-API funktioniert weiter mit Bearer · plugins/assignments/skeleton mit `X-Manager-Token` unverändert |
| **WP-1** | `rust/server/src/http/templates.rs`, `rust/server/src/http/mod.rs` | CRUD-Handler + Routen-Wiring nach §4.1; Auth **ausschliesslich** über `auth::ensure_admin_user` (kein eigener Guard, keine Kopie); atomares tmp+rename; `safe_asset_id` auf jeder `:id`; server-vergebene IDs | `cargo build` grün · kein neuer Auth-Code in `templates.rs` · GET/POST/PUT/DELETE wie §4.1 |
| **WP-2** | `rust/server/tests/templates_crud.rs` (neu) | Integrationstests: Liste, Get, Create, Update, Delete, 403 ohne Admin-Token, 400 bei `../`-ID, 404 bei PUT auf Unbekanntes, Bestandsdateien laden unverändert | `cargo test` grün, jeder Fall einzeln benannt |
| **WP-3** | `packages/web/src/lib/templatesApi.ts` (neu) | Typisierter REST-Client (`listTemplates/getTemplate/createTemplate/updateTemplate/deleteTemplate/createQuizFromTemplate`) auf `fetchWithAuth`; wirft `Error` mit Server-Message bei !ok | `pnpm typecheck` grün · kein nacktes `fetch` |
| **WP-4** | `packages/web/src/locales/{de,en,es,fr,it,zh}/manager.json` | Keys aus §4.2 in allen 6 Locales via `scripts/locale-sync.mjs` | `scripts/check-locales.sh` grün · keine `defaultValue` im Code |

### Welle 2 — UI (gegen den eingefrorenen Contract)

| WP | Datei(en) | Inhalt | Kanon (§0) | Akzeptanz |
|---|---|---|---|---|
| **WP-5** | `.../manager/components/templates/TemplatePickerDialog.tsx` (neu) | Dialog nach §5.1–§5.3: `DialogPanel`, Suche, `FilterPill`-Kategorien, `ListRow` (compact), `OverflowMenu` admin-gated, alle vier Zustände aus §5.2 | D1, D2, D7, D9, D10, D11, D16, D19–D21, D28 · W6 §2/§3/§7 · R1–R27 | Token-Gate grün · keine `bg-white`/`text-gray-*` · testids wie §4.3 |
| **WP-6** | `.../manager/components/templates/TemplateMetaDialog.tsx` (neu) | Metadaten-Formular nach §5.4, D15-Validierung | D7, D10, D15, D18 · W6 §14 (Select-Breiten) | Token-Gate grün · `aria-invalid` bei leerem Namen |
| **WP-7** | `.../configurations/quizzes/ConfigManageQuizz.tsx`; **löscht** `.../templates/TemplateLibraryCard.tsx` | `<TemplateLibraryCard />` (Zeile 194) entfernen; dritten `ActionFooter`-Button „Aus Vorlage“ (`variant="secondary"`, Icon `LayoutTemplate`) + Dialog-State ergänzen | **D14** (ActionFooter) · D8 · manager-uiux-sdd | Quiz-Liste ohne Vorlagen-Block · Datei `TemplateLibraryCard.tsx` gelöscht, keine Referenz mehr im Baum |
| **WP-8** | `packages/web/src/pages/manager/template.$templateId.tsx` (neu) | Route nach §5.5 inkl. Lade-/Fehlerzustand und Nicht-Admin-Redirect; `route.gen.ts` **nicht** editieren | D16 (Lade-/Fehlerzustand) | `pnpm build` erzeugt Route-Eintrag automatisch · Direktaufruf als Nicht-Admin landet auf `/manager/config/quiz` |
| **WP-9** | `.../quizz/components/QuizzEditorHeader.tsx` | Optionaler Prop `templateMode?: {templateId, meta}`: gesetzt → `PUT /api/templates/:id` statt `EVENTS.QUIZZ.UPDATE/SAVE`. **Spinner-Fix nach §5.5 zwingend**: `useEvent`-Aufrufe bleiben unbedingt, Callbacks returnen früh bei `templateMode`; `isSaving` wird im REST-Zweig selbst zurückgesetzt (then **und** catch), `markSaved` + `leaveAfterSaveRef` identisch bedient. Zusätzlich Admin-Button „Als Vorlage speichern“ (`editor-save-template-btn`) im Normalmodus → `POST` mit `fromQuizId` | D7, D14 · Bestandsmuster Toast | Bestehender Quiz-Save unverändert (kein Verhaltensdiff ohne den Prop) · Spinner endet sichtbar bei Erfolg **und** bei erzwungenem 403 · `pnpm verify` grün |

### Welle 3 — Verifikation

| WP | Datei(en) | Inhalt | Akzeptanz |
|---|---|---|---|
| **WP-10** | `e2e/` (Stagehand-Spec) | Flow: Quiz-Tab → „Aus Vorlage“ → Suche → Verwenden → Quiz-Editor; Admin: Bearbeiten → Frage ändern → speichern → Änderung nach Reload sichtbar; Löschen; Nicht-Admin sieht kein ⋮ | Lauf verbatim grün (kein behaupteter Pass) |

**Abhängigkeiten:**

- **WP-0 zuerst und allein** (Auth-Fundament). WP-1 und WP-2 starten erst nach
  seinem Merge — sonst bauen sie gegen einen Guard, den es noch nicht gibt.
- WP-3 und WP-4 sind vom Auth-Umbau unabhängig und laufen parallel zu WP-0,
  weil der Contract in §4 fixiert ist.
- Welle 2 startet erst, wenn WP-1/WP-3/WP-4 gemerged sind (UI konsumiert Client
  + Keys).

---

## 7. Gates (vor jedem Merge)

```bash
pnpm verify                            # tsc + lint + vitest
bash scripts/check-manager-tokens.sh   # D1/D2/D10 — muss grün sein
bash scripts/check-locales.sh          # 6 Locales × alle Namespaces
bash rust/gate.sh                      # nur für WP-1/WP-2
```

Zusätzlich: `design-validator` gegen die Quiz-Seite (RED = blockierend), und
ein Browser-Durchlauf des Flows — ein grüner Testlauf allein zählt für die
UI-WPs nicht als Nachweis.

**Definition of Done:** alle Akzeptanzkriterien erfüllt · Gates grün ·
Cross-Vendor-Review pro WP · `TemplateLibraryCard.tsx` gelöscht ·
Entscheidung im Ledger (`claude-decisions`) · Deploy verifiziert.

---

## 8. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Auth-Konsolidierung (WP-0) bricht bestehende Routen | Erweiterung ist rein additiv (zusätzlich akzeptierter Header, gleiche Auflösung); WP-0 läuft allein, `cargo test` + Smoke auf Users-Tab, Plugin-Import und Assignments vor dem Merge |
| Bearer-Akzeptanz öffnet einen neuen Angriffspfad | Nein: derselbe Session-Token, dieselbe DB-Auflösung, dieselbe Rollenprüfung — nur ein zweiter Transportheader. WP-2 testet 403 ohne Token, mit Nicht-Admin-Token und mit falschem Token |
| Editor-Header-Umbau regressiert den normalen Quiz-Save | `templateMode` ist optional; ohne Prop identischer Codepfad; Spinner-Fix nach §5.5 explizit als Akzeptanzkriterium; e2e deckt beide Wege ab |
| `route.gen.ts` wird von Hand editiert | Explizit in WP-8 verboten — generiert vom TanStack-Vite-Plugin |
| Vorlagen-Datei wird beim Schreiben zerstört | Atomares tmp+rename (§4.1) |
| Bestandsvorlagen laden nach dem Umbau nicht mehr | WP-2 testet die drei Dateien aus `config/templates/` explizit |
