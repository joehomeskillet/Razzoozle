# Backlog-SDD Umsetzungs-Briefing für grok CLI

## 1. Übersicht: Die 6 neuen SDDs

| SDD | Datei | Liefert |
|-----|-------|--------|
| **1. Fill-Blank-Matching** | `docs/design/fill-blank-matching-sdd.md` | 2 neue Fragetypen: Dropdown-Lücken + Slot-Matching; geteilte SlotDropdownBoard; Teilpunkte-Scoring |
| **2. Drop-Pin** | `docs/design/drop-pin-sdd.md` | Fragetyp Bild-Klick-Hotspot: Rechteck-Zonen, binär, ein Pin pro Zone |
| **3. API-LLM-Harmonization** | `docs/design/api-llm-harmonization-sdd.md` | AI-Generator + LLM harmonisieren für ALLE 13 Fragetypen (aktuell nur 4 unterstützt); blinde API-Flecken schließen |
| **4. Study-Practice-Modes** | `docs/design/study-practice-modes-sdd.md` | Study-Modus (Karteikarten) + Practice-Modus mit Statistiken |
| **5. Host-Analytics** | `docs/design/host-analytics-sdd.md` | Streaks, Time-to-Answer, Export, Cap, Timeout, Randomize |
| **6. Content-Import** | `docs/design/content-import-sdd.md` | Template-Library, PPTX/PDF-Import, AI-Extractor für Inhalte |

## 2. Umsetzungs-Reihenfolge & Abhängigkeiten

**Kritische Abhängigkeit:** `api-llm-harmonization` (SDD #3) hängt logisch von den neuen Fragetypen ab. Der LLM-Generator muss `fill-blank-matching` und `drop-pin` kennen, bevor er sie harmonisieren kann.

### Empfohlene Wellen:

**Wave 1 (Fragetypen — Grundlagen):**
1. `fill-blank-matching` — neue Quiz-Kernlogik; geringe äußere Abhängigkeiten
2. `drop-pin` — parallel zu #1 möglich, aber fertig VOR #3

**Wave 2 (LLM-Integration — hängt von Wave 1 ab):**
3. `api-llm-harmonization` — baut auf den neuen Typen von #1 & #2 auf

**Wave 3 (Unabhängige Features — kein Warten nötig):**
4. `study-practice-modes` — völlig unabhängig
5. `host-analytics` — völlig unabhängig
6. `content-import` — völlig unabhängig (aber benötigt generierte Quiz für Sinn)

**Empfehlung für Parallelisierung:** 
- Wave 1: #1 & #2 parallel (verschiedene Worktrees, verschiedene Worker)
- Wave 2: #3 starten nach #1 & #2 gemündet
- Wave 3: #4, #5, #6 parallel starten (sobald main stabil)

## 3. Ausführungsregeln für grok CLI & Worker-Pool

### Pro SDD:
- **Eigener Worktree:** `git worktree add .claude/worktrees/sdd-<slug> -b wp/sdd-<slug> origin/main`
- **Keine Merges in Main während WP läuft** — Orchestrator koordiniert sequenziell nach Waves

### Sub-Wellen pro SDD (Wave-5-Choreografie):

**A. Contract Phase:**
- TypeScript/Rust Interface-Contracts einfrieren (`.ts` types, Rust structs)
- Locale-Strings (6× namespaces) in `locales/`
- Commit-Prefix: `sdd:<name>:a-contract`

**B. Rust-Backend:**
- DB-Schema (migriert), Query-Layer, Business-Logic
- Alle cargo crates testen: `cargo test --workspace` (NICHT nur `build`)
- Commit-Prefix: `sdd:<name>:b-backend`

**C. Web-Frontend (untertilt in C0 + C1):**
- **C0 (Wire):** Client-Emits an Server-Handler verdrahten, Spinner-Gates
- **C1 (UI):** Komponenten rendern, Styles (Tailwind v4), Interaktion
- Commit-Prefixes: `sdd:<name>:c0-wire`, `sdd:<name>:c1-ui`

**D. i18n + E2E:**
- `scripts/check-locales.sh` auf ALLE 6 Namespaces (NICHT mit Placeholders)
- E2E-Tests: **serialisiert** (Host-Last, `--workers=1`), Vor-Screenshots für Regressions-Gate
- Commit-Prefix: `sdd:<name>:d-i18n-e2e`

### Gates pro Phase:
| Phase | Gate-Befehl | Fehler → BLOCKER |
|-------|------------|------------------|
| **A** | `git diff --name-only HEAD \| grep -E '(types.ts\|contracts)\|locales'` — Diff-Nichtleere | Leere Contracts |
| **B** | `cargo test --workspace --all-features 2>&1 \| grep -E '(test result\|error)'` | Test-Fail |
| **C0** | `pnpm verify` + Linter (Eslint, TypeCheck) | Compile-Fehler |
| **C1** | `pnpm build && pnpm verify` + Screenshot-Baseline | Layout-Fehler |
| **D** | `scripts/check-locales.sh` ×6 + `pnpm e2e --config playwright-serial.config.ts` | i18n-Lücken, flaky Tests |

## 4. Agenten-Pool & WP-Verteilung

**Strategie:** Kleine, modulare WPs über den Pool verteilen; keine Megaaufträge an eine Lane.

### Lane-Routing (Priorität):
1. **or-coder-free / local-coder-ov** → Kleine WPs (Contract-Freeze, Komponenten <100 LOC, UI-Tweaks)
2. **cursor (kimi-k3, cline-pass)** → UI/Frontend-intensive Arbeit (Layouts, Interaktion, a11y)
3. **codex (GPT-5.6-sol)** → Rust-Kern, Scoring-Logik, Harmonization (LLM-API-Calls)
4. **grok** → Cross-Review nach jedem Wave (FINDINGS-Check vor Merge)
5. **sonnet-worker** → Eskalation bei Komplexität oder Blocker

### Typische WP-Struktur:
```
wp/sdd-<name>:<phase>-<subcomponent>
  ├─ A-contract        (or-coder-free)
  ├─ B-db-schema       (codex)
  ├─ B-queries         (codex)
  ├─ B-logic           (codex)
  ├─ C0-wire           (cursor)
  ├─ C1-components     (cursor/or-free)
  ├─ C1-styles         (or-coder-free)
  ├─ D-i18n            (grok/agy)
  └─ D-e2e             (cline/stagehand)
```

**Pflicht pro Worker:**
- Eigener Worktree (nil shared main tree)
- Gate-Bericht mit Befehl + Output (Copy-Paste verbatim)
- wp-verify nach Abschluss
- Commit nur auf Branch (NOT pushed)

## 5. Häufige Fallstricke & Checks

### Vor SDD-Umsetzung:

**Check: Doppelarbeit vermeiden**
```bash
# Suche existierende Felder (teils schon vorhanden)
git grep -n "stripeStreak\|responseMs\|shuffle\|answer_order" src/
```
- `stripeStreak` — existiert ggf. schon (analytics backlog)
- `responseMs` — Zeit-zu-Antwort, ggf. in DB
- `shuffle` — Randomize, ggf. Quiz-Model
- `answer_order` — Namenkonflikt mit `answer_order` (Lösungs-Auswahl-Modus)

**Check: Locale-Namespacing**
```bash
ls locales/*/backlog/ 2>/dev/null || echo "backlog-namespace noch nicht erstellt"
```
Falls nicht vorhanden: neuer namespace `backlog.*` mit 6 JSON-Dateien.

**Check: SQLx-Kompilierungszeit**
- `sqlx:check` kann bei vielen neuen Queries langsam werden → Early-test
- `.sqlx` Cache prüfen (oft stale bei DB-Schema-Änderungen)

### Während Umsetzung:

**Locale-Artefakte nach WP-Abschluss:**
- Gelösche Strings? → Überflüssige JSON-Einträge entfernen
- Neue Strings? → 6× testen (check-locales ×6 namespace)
- Dev-Sprache als Fallback verwenden (Deutsch)

**E2E Serialisierungspflicht:**
- `playwright-serial.config.ts` nutzen (NICHT standard `playwright.config.ts`)
- Host-Last bei parallelen Tests unklar → serialisiert = sicher
- Nach Test-Lauf: `mv test-results artifacts/` (für Baseline)

**TypeScript-Interface-Freeze:**
- Contracts in Phase A sind KANONISCH für alle nachgelagerten WPs
- Änderungen an Types nach Phase A → Alle nachfolgenden WPs invalidieren

## 6. Orchestrator-Verantwortlichkeiten

Der Lead orchestriert zwischen WPs:
1. **Split-Checks** vor Dispatch: Jede WP ≤ ~150 LOC Diff? ≥3 Worker pro Wave?
2. **Wave-Merge-Gate:** ALLE WPs einer Wave gemündet + gate-Berichte gelesen
3. **Remotes-Vergleich:** github/main vs. Gitea sync prüfen
4. **CI-Feedback-Loop:** Failures → Worker re-assign oder Eskalation
5. **Branch-Cleanup:** Nach Merge `git worktree remove` + Branch löschen

## 7. Erfolgs-Kriterien

- [ ] Contract-Phase: Alle 6 SDDs haben Typescript + Rust Types + Locale-Namespaces
- [ ] Rust-Phase: `cargo test --workspace` grün für alle neuen Queries/Logik
- [ ] Wire-Phase: Kein UI-Spinner hängt; alle emitted Events awaited
- [ ] UI-Phase: Design-Validator clean; Tailwind v4 Phantom-Utilities ausgeschlossen
- [ ] i18n-Phase: `check-locales.sh` ×6 grün; keine DEV-Fallbacks im Prod-Build
- [ ] E2E-Phase: Alle Szenarien serialisiert grün; Screenshots baseline (Regressions-Gate)
- [ ] Finale: Alle Branches auf main gemergt; zero offen Worktrees

---

**Nächster Schritt:** Orchestrator dispatcht Wave 1 mit fill-blank-matching + drop-pin parallel. Codex/Cursor als Primary-Lanes, or-free für kleine Contract-WPs. Grok-Review nach jeder Wave VOR Merge.
