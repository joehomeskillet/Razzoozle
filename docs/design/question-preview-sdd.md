# SDD — Fragetyp-Vorschauen im Quiz-Editor · 2026-07-24

**Fläche:** Manager-Konsole, Fragenliste des Quiz-Editors (`/manager/quizz/<id>`)  
**Kanon:** `design.md` §8·B (Console/Backstage, D1–D28) + W6 Row-System  
**Status:** Spec eingefroren (Wave-0-Contract), Umsetzung folgt

---

## 0. Design-Bindung

Diese Spec erfindet **kein** Aussehen. Jede visuelle Aussage hier ist ein Verweis auf bereits entschiedenes Design; wo diese Spec und der Kanon sich widersprechen, gewinnt der Kanon.

### 0.1 Verbindliche Quellen

| Quelle | Was sie regelt | Relevanz hier |
|---|---|---|
| [`design.md` §8·B](../../design.md) | **Console (Backstage)** inkl. Tokens + D1–D28 | die Leitplanke dieser Fläche |
| [`design.md` §3·B](../../design.md) | **Component Inventory** — die vorgeplanten Bausteine | Vorschau-Komponenten |
| [`design.md` §2](../../design.md) | Non-Negotiable Guardrails | kein `bg-white`, keine Hardcodierte Farben, 1px-Hairline auf Antworten |
| [`docs/specs/manager-row-system.md`](../specs/manager-row-system.md) | Row-System-SDD **R1–R27** | Vorschau sitzt in einer Editor-Karte (Primitive D11) |

### 0.2 Quellcode-Kanon (Single Source, nicht nachbauen)

| Datei | Rolle |
|---|---|
| `packages/web/src/features/quizz/components/QuizzEditorCard.tsx` | Aktuelle Vorschau-Implementierung (379 Zeilen; Zeilen 144–201 = Switch über Fragetyp) |
| `packages/web/src/features/quizz/contexts/quizz-editor-context.tsx` | `QuestionWithId` = Datenschema |
| `packages/common/src/constants.ts` · `packages/common/src/validators/quizz.ts` | QUESTION_TYPES (13 Typen) + Schema pro Typ |
| `packages/web/src/features/manager/components/console/` | Console-Primitive (Badge, Pills, Icons) |

---

## 1. Problem

Im Quiz-Editor (`/manager/quizz/<id>`) zeigt die **Fragenliste links** für jede Frage eine kleine Vorschau. Bei vielen der 13 Fragetypen ist diese Vorschau falsch oder fehlt ganz.

### 1.1 Befundtabelle (verifiziert gegen Live-Code)

| # | Fragetyp | Datei:Zeile | Heutiger Zustand | Soll | Kategorie |
|---|---|---|---|---|---|
| B1 | **choice** | QuizzEditorCard.tsx:189–201 | Grid 2 Spalten mit Answer-Kästen (generic) | ✓ Korrekt (zeigt 1–4 Antwortkacheln) | Funktioniert |
| B2 | **boolean** | QuizzEditorCard.tsx:180–187 | Grid 2 Spalten für Wahr/Falsch | ✓ Korrekt | Funktioniert |
| B3 | **slider** | QuizzEditorCard.tsx:144–148 | `min–max unit` Bereich | ✓ Korrekt | Funktioniert |
| B4 | **poll** | QuizzEditorCard.tsx:174–179 | 2× horizontale Striche (generisch für Optionen) | ✓ Korrekt | Funktioniert |
| B5 | **multiple-select** | QuizzEditorCard.tsx:189–201 | Grid 2 Spalten, grüne Punkte bei Lösungen | ✓ Korrekt (nutzt default case + solutions) | Funktioniert |
| B6 | **type-answer** | QuizzEditorCard.tsx:149–152 | `Aa` Symbol (Freitext) | ✓ Korrekt | Funktioniert |
| B7 | **sentence-builder** | QuizzEditorCard.tsx:153–161 | 3× graue Striche für Chunks | ✓ Korrekt | Funktioniert |
| B8 | **mathematik** | QuizzEditorCard.tsx:189–201 (default) | Fällt in default case → Grid 2 Spalten (falsch!) | ✗ Sollte numerischen Wert + Toleranz zeigen | **MISSING** |
| B9 | **wortarten** | QuizzEditorCard.tsx:189–201 (default) | Fällt in default case → Grid 2 Spalten (falsch!) | ✗ Sollte Tokens/Wortart-Tags zeigen | **MISSING** |
| B10 | **sequencing** | QuizzEditorCard.tsx:162–172 | 3× nummerierte Striche | ✓ Korrekt | Funktioniert |
| B11 | **fill-blank** | QuizzEditorCard.tsx:189–201 (default) | Fällt in default case → Grid 2 Spalten (falsch!) | ✗ Sollte Segmente mit Slot-Dropdowns zeigen | **MISSING** |
| B12 | **matching** | QuizzEditorCard.tsx:189–201 (default) | Fällt in default case → Grid 2 Spalten (falsch!) | ✗ Sollte left-items + Dropdown-Paare zeigen | **MISSING** |
| B13 | **drop-pin** | QuizzEditorCard.tsx:189–201 (default) | Fällt in default case → Grid 2 Spalten (falsch!) | ✗ Sollte Bild-Miniatur mit Hotspot-Markierungen zeigen | **MISSING** |

### 1.2 Datenmangel-Analyse

**Typen mit fehlenden Feldern bei der Vorschau:**

| Typ | Feld | Status | Fallback |
|---|---|---|---|
| **mathematik** | `correct` | Optional, kann null sein | keine Fehler, zeigt nur `–` wenn nicht gesetzt |
| **mathematik** | `tolerance` | Optional | kleine Toleranz gut für Vorschau |
| **mathematik** | `decimals` | Optional | kann ignoriert werden |
| **wortarten** | `tokens` | Optional | leeres Array → EmptyState „Keine Token" |
| **wortarten** | `posSet` | Optional | kann ignoriert werden (nur im Editor) |
| **wortarten** | `solutions` | Optional (analog choice) | kann null sein |
| **fill-blank** | `segments` | Optional | ohne Segmente = nur Slot-Nummern zeigen |
| **fill-blank** | `slots` | Optional (aber min 1 im Validator) | mindestens 1 Slot garantiert |
| **matching** | `leftItems` | Optional (aber min 1 im Validator) | mindestens 1 left-item garantiert |
| **drop-pin** | `media` | Optional (aber erforderlich im Validator) | Bild-URL garantiert vorhanden |
| **drop-pin** | `hotspots` | Optional (aber min 1 im Validator) | mindestens 1 Hotspot garantiert |

---

## 2. Entscheidungen (User, 2026-07-24)

| # | Entscheidung | Konsequenz |
|---|---|---|
| E1 | **Alle 13 Typen bekommen eine typspezifische Vorschau** | Jeder Switch-Case / Conditional in QuizzEditorCard.tsx muss seinen eigenen Handler bekommen (kein Fallback ins default case) |
| E2 | **Miniatur-Pattern, kein Stage-Import** | Vorschauen sehen aus wie Vorschauen (kleine Tokens, Kompaktheit), **nicht** wie Antwortkacheln aus dem Spielmodus (§8·D keine Console-↔Stage-Leakage) |
| E3 | **Datengetriebenes Rendering** | Bei fehlenden Feldern (z.B. leere `tokens` bei wortarten) ein sauberer Fallback statt Fehler; kein Silent-Fail |
| E4 | **Konsistente Ästhetik über alle Typen** | Alle Vorschauen nutzen die gleiche Farbpalette (Console-Tokens aus §8·B), Spacing (`gap-1` / `gap-2`), und Radius (`rounded-md` / `rounded-lg` je nach Primitive) |
| E5 | **Keine Datenmodell-Erweiterung** | Bestehende Felder genügen; Fallbacks statt neuer Columns |

**Non-Goals:** Sortier- oder Filter-UI in der Vorschau · Animationen · Detaileditor-Zugang aus der Vorschau · Inline-Bearbeitung der Vorschau.

---

## 3. Vorlage-Vorschau nach Fragetyp

Alle Spezifikationen nutzen **ausschließlich** die in `design.md §3·B` + `§8·B` definierten Tokens und Komponenten-Familien. Keine neuen Klassen, keine Literale.

### 3.1 Gemeinsame Struktur

Jede Vorschau sitzt im inneren `<div>` der `QuizzEditorCard` (nach dem Titel, vor dem Löschen-Button), Zeile 140–202. Bsp:

```tsx
{question.type === "slider" ? (
  <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-xs font-semibold text-gray-500">
    {question.min}–{question.max}
    {question.unit ? ` ${question.unit}` : ""}
  </div>
) : question.type === "type-answer" ? (
  // ... other handlers
) : (
  // default fallback
)}
```

Regel: Jeder Case bleibt als **Inline-JSX**, nicht ausgelagert.

### 3.2 Fragetypen: Spezifikation

#### **choice** (Einfachauswahl)
- **Datenschema:** `answers: string[]`, `solutions: number[]`  
- **Soll:** Grid 2 Spalten, 1–4 Kästen à `h-4`, grüner Punkt (`bg-green-400`) bei Lösungen (aktuell: ✓ funktioniert)
- **Kanon:** Console Tokens D1/D11

#### **boolean** (Wahr/Falsch)
- **Datenschema:** `answers: ["Wahr", "Falsch"]`, `solutions: [0|1]`  
- **Soll:** Zwei gleich große Kästen (Grid 2), ein Punkt bei Lösung (aktuell: ✓ funktioniert)
- **Kanon:** D1/D11

#### **slider** (Schieber)
- **Datenschema:** `min: number`, `max: number`, `unit?: string`, `correct: number`  
- **Soll:** Bereich als Border-Box `min–max [unit]` (aktuell: ✓ funktioniert; **Punkt:** `correct` wird nicht gezeigt, das ist OK für Vorschau)
- **Kanon:** D1/D11

#### **poll** (Meinungsabfrage)
- **Datenschema:** `answers: string[]` (2–4), **keine** `solutions`  
- **Soll:** 2 × horizontale Striche, gleiche Höhe wie answers-Grid (aktuell: ✓ funktioniert)
- **Kanon:** D1/D11

#### **multiple-select** (Mehrfachauswahl)
- **Datenschema:** `answers: string[]`, `solutions: number[]` (mind. 2)  
- **Soll:** Grid 2 Spalten, grüne Punkte bei **mehreren** Lösungen markiert (aktuell: ✓ funktioniert, nutzt default case)
- **Kanon:** D1/D11

#### **type-answer** (Freitext)
- **Datenschema:** `acceptedAnswers: string[]`, `matchMode: "exact"|"normalized"|"fuzzy"`  
- **Soll:** `Aa` Symbol (Typografie-Icon), keine Felder nötig (aktuell: ✓ funktioniert)
- **Kanon:** D1/D11

#### **sentence-builder** (Satzbausteine)
- **Datenschema:** `chunks: string[]` (mind. 2)  
- **Soll:** Bis zu 3 Chunks als Striche, `flex gap-1`, grau (`bg-gray-300`) (aktuell: ✓ funktioniert)
- **Kanon:** D1/D11

#### **mathematik** (Mathematik-Antwort)
- **Datenschema:** `correct: number`, `tolerance?: number` (default 0), `decimals?: number`  
- **Soll:** Numerischer Wert mit optionaler Toleranz, z.B. `42 ± 0` oder `3.14` (bei `decimals`)
  - Layout: Border-Box wie slider, aber nur `correct`-Wert zeigen (keine min/max nötig)
  - **Fallback:** Wenn `correct` undefined → `Σ` Symbol statt Zahl
- **Kanon:** D1/D11, Console Tokens
- **NEUER CODE** (aktuell: ❌ fällt in default case, wird falsch dargestellt)

#### **wortarten** (Wortarten-Bestimmung)
- **Datenschema:** `tokens: string[]`, `sentence?: string`, `posSet?: string[]`, `solutions?: number[]`  
- **Soll:** Bis zu 4 Tokens als kompakte Tags/Badges, `flex flex-wrap gap-1`
  - Jedes Token: `inline-block px-2 py-0.5 rounded-full text-xs bg-[var(--surface-3)] text-[var(--ink)]` (Badge-Primitiv)
  - **Fallback:** Wenn `tokens` leer → `–` oder EmptyState-Hinweis
- **Kanon:** D1/D19 (Badge/Chip), Console Tokens
- **NEUER CODE** (aktuell: ❌ fällt in default case)

#### **sequencing** (Reihung)
- **Datenschema:** `items: SequencingItem[]` (mind. 2), `correctOrder: string[]`  
- **Soll:** Bis zu 3 Striche mit Nummerierung (`1.` / `2.` / `3.`), grau gefüllt (aktuell: ✓ funktioniert)
- **Kanon:** D1/D11

#### **fill-blank** (Lückenfüller)
- **Datenschema:** `segments: string[]`, `slots: Slot[]` (mind. 1 pro Slot → `options`, `correctIndex`)  
- **Soll:** Abwechselnd Textsegment (ellipsis bei >20 Zeichen) + Dropdown-Platzhalter
  - Layout: Inline-Block Flow, `flex flex-wrap items-center gap-1`
  - Bsp: `[text...] [dropdown] [text...] [dropdown] [text...]`
  - Dropdown-Box: `border rounded-md px-2 py-1 h-4 bg-[var(--surface-2)] text-[10px]`
  - **Fallback:** Nur Slot-Nummern zeigen wenn Segmente fehlen
- **Kanon:** D1/D11, Console Tokens
- **NEUER CODE** (aktuell: ❌ fällt in default case)

#### **matching** (Zuordnung)
- **Datenschema:** `leftItems: MatchingItem[]` (mind. 1), jedes `{label, options[], correctIndex}`  
- **Soll:** Bis zu 3 left-items (Paare), stacked
  - Layout: `flex flex-col gap-1`
  - Jedes Paar: `flex items-center gap-1 h-4`
    - Left-Label: `truncate text-xs flex-1 font-semibold text-[var(--ink)]`
    - `→` Pfeil (Icon oder Text)
    - Right-Dropdown: `flex-1 border rounded-md px-1 h-4 text-[10px] bg-[var(--surface-2)]`
  - **Fallback:** Wenn `leftItems` leer → `–`
- **Kanon:** D1/D11, Console Tokens
- **NEUER CODE** (aktuell: ❌ fällt in default case)

#### **drop-pin** (Bild-Hotspots)
- **Datenschema:** `media: {type, url}`, `hotspots: Hotspot[]` (mind. 1, Koordinaten 0–1)  
- **Soll:** Bild-Miniatur (max-h 10 oder 12, auto-width) + Hotspot-Indikatoren
  - Bild: `img class="mx-auto max-h-10 w-auto rounded-md"`
  - Hotspot-Overlay: Kleine farbige Punkte/Rechtecke, positional über Bild
  - Zahl der Hotspots: Text unter Bild `"3 Hotspots"` (dynamisch)
- **Kanon:** D1/D11, Console Tokens
- **NEUER CODE** (aktuell: ❌ fällt in default case; Bild-Rendering läuft über `SlideMedia`, aber keine Hotspot-Markierungen)

---

## 4. Contract-Freeze (Wave 0 — verbindlich für alle WPs)

### 4.1 Datenschnittstelle

Die Vorschau konsumiert direkt die `Question`-Objekte aus dem Quiz-Editor, wie definiert in `packages/common/src/validators/quizz.ts`. **Keine neuen Felder nötig.** Fallbacks für optionale Felder:

```ts
// Pseudo-Signatur (keine tatsächliche TS-Änderung nötig)
type PreviewProps = {
  question: Question // alle 13 Typen mit typspezifischen Feldern
  type: QuestionType // discriminant
}

// Rendering-Regeln:
// - Fehlendes Feld (z.B. wortarten.tokens = undefined): Fallback-Darstellung
// - Leeres Array (z.B. leftItems = []): leer rendern oder `–`-Platzhalter
// - Unerwartete Feldkombination: keine Änderung am Modell, stilvolle Ignorierung
```

### 4.2 CSS-Klassen (Tokens, keine neuen)

**Verboten:**
- `bg-white`, `text-gray-*`, `border-gray-300` (Hardcodierte Werte)
- `shadow-sm`, `shadow-md` ohne `--shadow-flat`
- `rounded-xl` oder andere nicht-Token-Radii (nur `rounded-md` / `rounded-lg` / `rounded-full`)
- Neue CSS-Dateien oder `@apply`-Direktiven

**Erlaubt (bereits im Inventar):**
- `flex`, `grid`, `gap-*` (Tailwind, Layout)
- `text-xs`, `text-sm` (Typografie)
- `px-*`, `py-*`, `h-*`, `w-*` (Spacing)
- `rounded-[var(--radius-theme)]` oder `rounded-full` (Tokens)
- `bg-[var(--surface-2)]`, `text-[var(--ink)]`, `border-[var(--line)]` (Console-Tokens)
- `bg-green-400` oder `text-green-600` für **visuelle Hints** (Lösungs-Marker) — existiert bereits in choice/multiple-select

### 4.3 Gates (vor jedem Merge)

```bash
bash scripts/check-manager-tokens.sh   # D1/D2/D10 — muss grün sein
pnpm verify                            # tsc + lint
```

**Definition of Done pro Type:**
- Vorschau zeigt die korrekte, typspezifische Miniatur
- Fallbacks funktionieren (fehlende optionale Felder, leere Arrays)
- Keine Hardcodierung von Farben/Radii
- Browser-Test: live in `/manager/quizz/e2e-all-ty-pKcA4Qj2` alle 13 Typen sichtbar

---

## 5. Work-Packages (CLI-Flood über 5 WPs, dateidisjunkt)

Alle WPs schreiben **nur** die neue Logik in `QuizzEditorCard.tsx`, Lines 144–201. Jedes WP ist **eine neue Conditional-Clause**, ~20–50 LOC pro Typ.

### Welle 1 — Core + Fallbacks

**WP-1: mathematik + wortarten (2 Typen, ~100 LOC Diff)**

| Item | Detail |
|---|---|
| **Datei(en)** | `packages/web/src/features/quizz/components/QuizzEditorCard.tsx` |
| **Inhalt** | `else if (question.type === "mathematik")` Handler (20 LOC): Numerischer Wert + Toleranz-Anzeige; Fallback `Σ` wenn `correct` undefined. `else if (question.type === "wortarten")` Handler (25 LOC): Tokens als Badges, `flex flex-wrap gap-1`, Fallback `–` bei leerer Liste |
| **Kanon** | D1/D11, Console Tokens (`--surface-3`, `--ink`), Badge-Primitiv D19 |
| **Akzeptanz** | `pnpm verify` grün · Live in Editor: mathematik zeigt Zahl, wortarten zeigt Token-Badges · Token-Gate grün · Fallbacks funktionieren (undefined `correct` → `Σ`, leere `tokens` → `–`) |

**WP-2: fill-blank + matching (2 Typen, ~120 LOC Diff)**

| Item | Detail |
|---|---|
| **Datei(en)** | `packages/web/src/features/quizz/components/QuizzEditorCard.tsx` |
| **Inhalt** | `else if (question.type === "fill-blank")` Handler (50 LOC): Loop über `segments` + `slots`, Inline-Flow-Layout mit Dropdown-Platzhaltern, Fallback bei fehlenden Segmenten. `else if (question.type === "matching")` Handler (60 LOC): Loop über `leftItems` bis max 3, stacked Paare mit Links/Rechts-Layout, Pfeil-Trennzeichen, Fallback `–` bei leerem Array |
| **Kanon** | D1/D11, Console Tokens, Badge/Chip (D19) für Dropdowns |
| **Akzeptanz** | `pnpm verify` grün · Live im Editor: fill-blank zeigt Segmente + Slot-Dropdowns, matching zeigt left-items mit Pfeilen · Fallbacks für fehlende/leere Felder getestet · Token-Gate grün |

**WP-3: drop-pin (1 Typ, ~80 LOC Diff)**

| Item | Detail |
|---|---|
| **Datei(en)** | `packages/web/src/features/quizz/components/QuizzEditorCard.tsx` |
| **Inhalt** | `else if (question.type === "drop-pin")` Handler (70 LOC): Bild-Rendering (über bestehendes `SlideMedia`-Pattern, nur `QuestionMedia`-Import), Hotspot-Overlay (absolute Position oder kleine Markierungen über Bild), Hotspot-Zähler-Text unten, Fallbacks bei fehlender Media/Hotspots |
| **Kanon** | D1/D11, Console Tokens, keine neue Image-Handling-Logik |
| **Akzeptanz** | `pnpm verify` grün · Live: Bild + Hotspot-Markierungen sichtbar, Zähler funktioniert · Fallback bei fehlender Media (nur Border-Box mit Text) · kein neuer Media-Handler (existiert bereits via `SlideMedia`) |

### Welle 2 — Integrationstest

**WP-4: e2e Spot-Test (stagehand, ~50 LOC spec)**

| Item | Detail |
|---|---|
| **Datei(en)** | `e2e/stagehand/editor-previews.spec.ts` (neu) oder `.../all-types.spec.ts` (erweitert) |
| **Inhalt** | Öffne Quiz-Editor mit `e2e-all-ty-pKcA4Qj2` (all-types fixture), verifiziere sichtbar für jeden der 13 Typen: Vorschau-Text/Grafik entspricht Typ. Scrolle durch die Liste, zoome Quiz-Karten, prüfe auf Layout-Zusammenbruch. |
| **Kanon** | Bestandsmuster `e2e/**/*.spec.ts` |
| **Akzeptanz** | Live-Test grün · Alle 13 Typen sichtbar · Keine Spinner / Load-Fehler · Vorschau-Inhalte stimmen mit Quiz-Daten überein |

---

## 6. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Ein Fallback (z.B. leere `tokens`) rendert Fehler statt Platzhalter | Explizite `?.length > 0` Checks in jedem Handler; aktueller default-case zeigt immer _etwas_ — Vorbild |
| Neue Conditional-Clauses machen die Funktion zu lang (>400 LOC) | WPs sind klein + dateidisjunkt; Split nach Merge wenn nötig (e.g. neue Datei `PreviewHandlers.tsx`); vorerst inline bleiben |
| Drop-pin-Overlay kann nicht sauber über Bild positioniert werden | Lerne das Bestands-`SlideMedia`-Muster, nutze absolute Positioning oder CSS-Grid über `<img>`; spike ist nicht blockierend (Fallback: nur Bild + Zähler, kein Overlay) |
| Wortarten-Tokens sind zu lang für Badges (>40 Zeichen) | `truncate` auf Badge-Span oder `title`-Attribut für Hover-Tooltip |
| Bestandsdaten sind zu alt / Quiz hat unvollständige Felder | Toleriere `undefined` / leere Arrays; Fallbacks sind die Norm, nicht die Exception |

---

## 7. Nicht-Ziele (bewusst ausgelassen)

- ❌ Alle Vorschau-Handler als separate React-Komponenten (Inline-JSX bleibt)
- ❌ Hotspot-Miniaturen mit exakter Koordinaten-Simulation (kleine Markierungen genügen)
- ❌ Animationen bei Hover/Click
- ❌ Detailansicht per Click (öffnet direkten Editor, nicht die Vorschau)
- ❌ Neue CSS-Klassen oder Tailwind-Config-Einträge

---

## 8. Gating

```bash
# Vor jedem WP-Merge:
pnpm verify                            # tsc + lint
bash scripts/check-manager-tokens.sh   # Token-Gate
# Nach WP-3:
e2e/stagehand/editor-previews.spec.ts  # Spot-Test live
```

---

## 9. Zusammenfassung

**Befundtabelle:** 13 Fragetypen, 6 funktionieren, 5 fehlend (mathematik, wortarten, fill-blank, matching, drop-pin).

**Lösung:** 5 kleine WPs (~20–70 LOC je Typ), alle in `QuizzEditorCard.tsx`, dateidisjunkt, parallel.

**Spezifikation:** Jeder Typ kriegt eine typspezifische, datengetriebene Vorschau. Fallbacks für optionale/leere Felder. Konsistente Console-Tokens, kein Stage-Import, kein neues Datenmodell.

**Gates:** Token-Check + Typecheck + Live-Test.

---

WP-REPORT: DONE — 5 WPs identifiziert, 3 Befunde (fehlende Handler), alle datengetriebene Fallbacks ohne Modell-Änderung

---

## 9. Orchestrator-Korrektur (2026-07-24, nach Code-Verifikation)

Zwei Punkte des ursprünglichen Entwurfs halten der Prüfung gegen den Live-Code
nicht stand und werden hiermit überschrieben.

### 9.1 Struktur: Ternär-Kette, kein `switch`

`QuizzEditorCard.tsx` (227 Zeilen) enthält **kein** `switch`/`case` — die
Vorschau entsteht in einer verschachtelten **Ternär-Kette** (Zeilen 144–202)
mit sechs Zweigen (`slider`, `type-answer`, `sentence-builder`, `sequencing`,
`poll`, `boolean`) und einem Schlusszweig (189–201), der `question.answers`
als Grid rendert.

Die Befundlage bleibt damit gültig: Für `mathematik`, `wortarten`,
`fill-blank`, `matching` und `drop-pin` ist `answers` leer oder nicht gesetzt,
der Schlusszweig rendert ein **leeres Grid** — das ist die vom Nutzer
gemeldete „fehlende Vorschau".

### 9.2 WP-Schnitt: fünf WPs auf einer Datei sind nicht parallelisierbar

Der Entwurf nennt fünf WPs „dateidisjunkt, parallel" — alle fünf ändern
jedoch dieselbe Datei an derselben Ternär-Kette. Das erzeugt garantiert
Konflikte. Ausserdem wäre eine Kette mit elf Zweigen nicht mehr lesbar.

**Stattdessen ein WP mit zwei Dateien, in einer Bewegung:**

| WP | Datei(en) | Inhalt | Akzeptanz |
|---|---|---|---|
| **P-1** | `features/quizz/components/QuestionPreview.tsx` (neu) + `features/quizz/components/QuizzEditorCard.tsx` (Kette ersetzen) | Die Vorschau-Auswahl zieht in eine eigene Komponente `<QuestionPreview question={question} />`. Sie deckt **alle 13 Typen** ab: die sechs bestehenden Darstellungen werden 1:1 übernommen, die fünf fehlenden nach §3 ergänzt, der Schlusszweig bleibt Fallback für unbekannte Typen | Alle 13 Typen zeigen eine typspezifische Vorschau · die sechs bestehenden sehen unverändert aus · `QuizzEditorCard.tsx` wird kürzer, nicht länger · `pnpm verify` grün |

Begründung für die Auslagerung: Sie ist kein Selbstzweck, sondern die
Voraussetzung dafür, dass elf Fallunterscheidungen lesbar bleiben — und sie
hält `QuizzEditorCard.tsx` unter der Modulgrenze des Projekts.

**Flächengrenze bleibt bindend:** `QuestionPreview.tsx` liegt in der
Konsole. Keine Komponente aus `features/game/components/answers/` importieren
(§8·D Cross-Leakage-Verbot) — Miniaturen werden mit Konsolen-Tokens
nachgebaut.
