# Manager-UI/UX-Konsolidierung — Abschlussbericht

**Datum:** 2026-07-22
**Grundlage:** SDD `docs/design/manager-uiux-sdd.md` (Issue agent-claude/Razzoozle#86), Wellenplan aus `docs/planning/manager-component-migration-matrix.md` (WP0 → WP7)
**Scope:** Alle 18 Manager-Sektionen (BUILTIN_TABS unter der Einzelroute `/manager/config`), geteilte Primitives, Design-Sprache-Konsolidierung
**Status:** W0–W7 gemergt und deployt; ein Live-Smoke des letzten Badge-Fixes steht noch aus (siehe §6)

Dieses Dokument schließt die 2026-07-21/22-Runde der Konsolidierung ab. Es ist die Nachfolge-Runde zur SDD-#86-Basis (W0–W6, geshippt 2026-07-16) und arbeitet die in `manager-ui-consistency-audit.md` (Correction 4) gefundenen Restlücken ab. Jede Zahl und SHA unten stammt aus dem Merge-Log, den Gitea-Issues #223/#241–#245 oder den Planning-Dokumenten.

---

## 1. Wellen-Übersicht W0–W7

Die Reihenfolge folgt der Migrations-Matrix (WP0 Shell/Audit → WP7 Cleanup). SHAs sind Merge-Commits auf `main`.

| Welle | Merge-SHAs | Ergebnis (ein Satz) |
|---|---|---|
| **W0 — Audit & Contract** | `f7b9381e3` (Audit + Matrix), Spec-Merges `7137ad018` (SettingRow-Spec, #225), `5ae0c2e80` (Filter-Label-Meinung), `e78286676` (Listen-Meinung, #236) | Audit aller 18 Sektionen, Migrations-Matrix und drei Design-Meinungen als Planning-Docs eingefroren, kein Produkt-Code geändert. |
| **W1 — PageHeader + P0** | `943128164` (A), `a7eca8894` (B + KI-Gate-Fix), `f7fef7006` (C Self-Admin-Guard), `e02905793` (D Labels-A11y, #223), `002998d2a`/`b169833bf` (D2 Inline-Create-Form), `63260b6fc`/`3723be9c5`/`6f40523ed` (E Dev-404s, #224/#226) | PageHeader in die Sektionen ausgerollt, zwei P0-Security-/A11y-Lücken geschlossen (Self-Admin-Guard, Labels-A11y), KI-Generator-Gate und tote Dev-Requests gefixt. |
| **W2 — Toolbars/A11y/Sticky** | `bfb718022` (A Profile-Active-State, #228), `2a6c1177a` (B Sticky-Overlap, #229), `d4068aefc` (C FilterGroup, #230), `5960d9f79` (D i18n-Drift, #231), `f32f42d3d` (E Dead-Filter-Leftover, #232), `c79a511be` (F Key-Refs, #233), `9f58eca5d`/`524635b08` (G Sticky-Geometrie, #234), `f6c159a5f` (H SET_THEME-Clamp, #235) | Sichtbare Filtergruppen-Labels, verlässliche ActionFooter-Sticky-Geometrie, i18n-Drift/Key-Refs bereinigt, Nav-Active-State für Profile korrigiert. |
| **W3 — Listen-Konsolidierung** | `e78286676` (0 Meinung, #236), `5dbf1f12d` (A Quiz+Klassen, #239) | Quiz- und Klassen-Listen auf ListRow vereinheitlicht (Dichte, `overflow`-Prop, Status-Badge statt Opacity-Dimmer). |
| **W4 — Media + Labels-A11y** | Media-Konsolidierung landete in Vorrunde (`903a35de3`, Usage-Badge/Dialog-Stack-Regression #210); Labels-A11y lief als W1-D `e02905793` (#223) | Keine eigenständigen W4-Merges in dieser Runde — Media war bereits konsolidiert, Labels-A11y wurde in W1 vorgezogen. |
| **W5 — Settings/SettingRow-Slots** | `1e10dd2d4` (A Slots + ActionFooter-dirty, #237), `063c631c6`/`9520020d3` (A Tests), `ced741a84` (B Gamemode, #241), `36e713c48` (C KI + Achievements, #242), `da13989dc` (C-Korrektur LabelRow-Badge-i18n, #242) | LabelRow/ToggleField um Restart-Badge-/Status-/Disabled-Slots erweitert, Gamemode/KI/Achievements darauf migriert, Provider-Status inline, Dirty-Footer verdrahtet. |
| **W6 — Dev-Tools IA** | `9009daced` (A Dev-IA-Gruppen + Danger-Zone + Copy-Blocks + Env-Badge, #238), `3fc5c47b4` (Skeleton-Locale-Vollabdeckung ×6, Cross-Review) | Dev-Tab in gruppierte IA mit Danger-Zone und Copy-Blöcken überführt, Skeleton-Locale-Keys ×6 ohne defaultValue-Substitute vervollständigt. |
| **W7 — Cleanup** | `0781b9e42` (#243) | Tote Locale-Keys (−76 ×6), CreateLabelDialog entfernt, `check-key-refs.sh`-Gate und `locale-sync remove`-Subcommand neu. |
| **Post-Smoke-Fixes** | `bdf87e1d6` (ActionFooter-dirty sichtbar, #244), `95cd34b9e` + `cb6eb214b` (Badge-Overlap, #245) | Prod-Smoke-Befunde der W5-Welle nachgezogen (sichtbarer Dirty-Zustand, Badge nicht mehr vom Switch überdeckt). |

Die Abfolge **W0 → W1 → {W2 ∥ W3} → W5 → W6 → W7** ist die *geplante* Dependency-Reihenfolge der Migrations-Matrix. Chronologisch wich die Merge-Folge davon ab: W6 (Dev-Tools, `9009daced`/`3fc5c47b4`) landete vor dem W5-Rest — W5-B/W5-C wurden erst Stunden später gemergt. Post-Smoke-Fixes folgten im Anschluss.

---

## 2. Primitives: wiederverwendet vs. neu

**Wiederverwendet (unverändert übernommen):** ListRow, SectionCard, EmptyState, NavItem, SelectableRow, SubGroup, Badge/StatusBadge, FilterPill, PageHeader, LabelRow, ToggleField, ActionFooter, AlertDialog, OverflowMenu, DialogPanel, FormSection. Diese existierten und waren gut (Audit §2.3 der SDD); die Arbeit war Adoption, nicht Neubau.

**Neu — Komponente:**
- **FilterGroup** (W2-C, `d4068aefc`): Wrapper für sichtbare Gruppen-Labels vor FilterPill-Reihen (Quelle/Sichtbarkeit/Fächer). Kapselt Label + responsive flex-Logik gemäß `filter-group-labels-opinion.md`; behält das bestehende `role="group"`/`aria-label`-Muster und macht es nur sichtbar.

**Neu — Slot-Erweiterung bestehender Primitives (statt eigenständiger SettingRow):**
- Die `setting-row-spec.md` schlug eine eigenständige SettingRow-Komponente vor. Implementiert wurde stattdessen additiv: **LabelRow/ToggleField** erhielten die Slots `restartBadge`, `statusMessage` und `disabledReason`, **ActionFooter** ein `dirty`-Prop (W5-A `1e10dd2d4`). Keine bestehende Call-Site wurde gebrochen; die Slot-Semantik deckt Restart-Hinweise, Validierungs-/Save-Status und Disabled-Gründe ab.

**Neu — Tooling/Gates:**
- **`scripts/check-key-refs.sh`** (W7): CI-fähiges Gate, jede statische `t("manager:…")`-Referenz muss im de-Locale existieren (exit 1 bei Miss).
- **`locale-sync.mjs remove <dead-keys.json>`-Subcommand** (W7): strukturierte Key-Entfernung inkl. `pruneEmpty`, damit Locale-JSON nie von Hand editiert wird.
- (Bereits aus der SDD-#86-Basis: `scripts/check-manager-tokens.sh` als Token-Verbots-Gate — in dieser Runde als Wave-Gate genutzt.)

---

## 3. Entfernte Duplikate / tote Artefakte

- **CreateLabelDialog:** unbenutzter Import zunächst entfernt (W1-D2b `b169833bf`), Komponente in W7 vollständig getilgt; ein stale Kommentar in `DialogPanel.tsx` mit korrigiert (`0781b9e42`).
- **76 tote manager-Locale-Keys ×6 Sprachen** entfernt (W7, `0781b9e42`). Vollständige Key-Liste im Worker-Report zu **Issue #243** (dort inline dokumentiert) — hier bewusst nicht dupliziert. Dynamische Key-Familien (z.B. `media.category.*`, `ai.kind.*`, `labels.colors.*`) wurden per Live-Referenz-Beweis behalten. Diff der Cleanup-Welle: 10 Dateien, +243/−667.
- **Nicht-funktionales Duplikat-Such-Input + toter Filter-State** entfernt (W2-E `f32f42d3d`, #232).
- **Unbenutzter Import `getTokenHeader`** (TS6133) und **tote OpenAPI-Endpoint-Referenzen** entfernt (W1-E `3723be9c5`/`63260b6fc`).

---

## 4. Screenshot- / Smoke-Findings-Status

- **Badge-Saga (final: #245, `cb6eb214b`):** Kette über drei Stufen — (1) Restart-Hinweis war hartkodiert, (2) auf i18n-Key umgestellt (`common:restartRequired` ×6, `da13989dc`) mit No-Truncate-Pill, (3) Prod-Smoke fand die i18n-korrekte Badge visuell vom Toggle-Switch überdeckt (Label-Spalte `sm:max-w-40` = Max-Width, nicht fixe Breite; ~22px/~37px verdeckt). Fix: `sm:max-w-40` → `sm:max-w-60` auf der Label-Spalte (LabelRow + ToggleField, +2/−2), Badge bleibt auf der Label-Zeile, Mobile unverändert.
- **ActionFooter-dirty sichtbar (#244, `bdf87e1d6`):** Auf `/manager/config/achievements` war `isDirty` an `ActionFooter.dirty` verdrahtet, der Footer sah vor/nach einer Änderung aber identisch aus (einzige Rückmeldung war „Gespeichert" nach dem Save). Der `dirty`-Prop rendert nun einen sichtbaren ungespeicherten Zustand.
- **Gamemode ohne ActionFooter = Absicht:** Der Modus-Tab nutzt per-Field-Optimistic-Save und braucht daher keinen Sammel-Dirty-Footer; das ist beabsichtigt, kein Bug.
- **skeleton.js-404 einmalig / SW-Staleness:** Das tote `/theme/skeleton.js`-404 im Dev-Tab war ein einmaliges Service-Worker-Staleness-Artefakt; das zugrundeliegende Verhalten (Editor-Prefill-Fetches auf Theme-Flags gegated) ist korrekt (W1-E `3723be9c5`, W1-E3 `6f40523ed`, #224/#226).

---

## 5. Deviations vom SDD

- **Satellit bleibt statischer Explainer:** Der Geräteverwaltungs-Ausbau ist ein separates Feature, nicht Teil der Konsolidierung, und wurde aus WP5 gestrichen (DECISION `wp-scope-satellit-profile`).
- **Profile bleibt Header-Action ohne eigenen Nav-Eintrag:** Die W2-A-Active-State-Lösung (`bfb718022`) ist final; kein zusätzlicher Nav-Eintrag (DECISION `wp-scope-satellit-profile`).
- **URL-Slugs englisch:** Routen-/Tab-Slugs sind englisch (`classes`/`students`/`ai`/`quiz`, Merge `922877d5f`), UI-Text bleibt Deutsch — Standing Rule, keine Abweichung im Einzelfall.
- **SettingRow als Slot-Erweiterung statt eigenständiger Komponente:** siehe §2 — die Spec sah eine neue Komponente vor, umgesetzt wurde die additive Slot-Variante auf LabelRow/ToggleField.

---

## 6. Offene Punkte / Follow-ups

- **Live-Smoke des Badge-Fixes (#245):** Der Merge-Kommentar hält fest, dass die Live-Verifikation „im Voll-Smoke nach Deploy" folgt — steht als letzter Schritt noch aus (Voll-Smoke läuft).
- **Description-Padding nachziehen:** Das `sm:pl-40`-Description-Padding in LabelRow/ToggleField muss an die neue `sm:max-w-60`-Label-Spalte angepasst werden (sonst Indent-Versatz zwischen Label und Description). Fix läuft als WP `fix/desc-padding`.
- **ActionFooter-dirty ausrollen:** Der sichtbare Dirty-Zustand ist bisher nur in ConfigAchievements verdrahtet. Sieben weitere ActionFooter-Callsites (ConfigAI, ConfigCatalog, ConfigKlassen, ConfigManageQuizz, ConfigTheme, ConfigSelectQuizz, ConfigUsers) könnten den Dirty-State durchreichen — Follow-up-WP.
- **Tautologische i18n-Tests härten:** Die zwei i18n-Fallback-Tests in `settingrow-slots.test.tsx` prüfen nur Props, nicht das Render-Ergebnis. Bei Gelegenheit auf Render-Assertions heben (analog den ActionFooter-dirty-Tests).
- **Finale Gate-Werte:** W7-Merge lief mit tsc 0, Build OK, vitest 183/183, i18n 0 WARNs, Token-Gate 0, check-key-refs GRÜN; nach den Post-Smoke-Fixes vitest 187/187 (#245). Keine offenen Gate-Failures.

---

*Quellen: Merge-SHAs und Wellen-Zuordnung aus `git log --oneline --merges`; Issue-Details/Zahlen (76 Keys, Badge-Overlap-px, Diff-Stats, Gate-Werte) aus Gitea #223/#241–#245 inkl. Worker-Report-Kommentaren; Primitives/Deviations aus `manager-ui-consistency-audit.md`, `manager-component-migration-matrix.md`, `setting-row-spec.md`, `filter-group-labels-opinion.md`, `list-consolidation-opinion.md`, SDD `manager-uiux-sdd.md` und `.claude/state/DECISIONS.md` (`wp-scope-satellit-profile`).*
