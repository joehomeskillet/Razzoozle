# SDD — Fragetypen-Stilangleichung (Player-Antwortflächen) · 2026-07-24

**Fläche:** Game-Client / Player (`design.md` §8·D) — die 13 Fragetypen
**Anlass:** Die zuletzt implementierten Typen (drop-pin, fill-blank, matching,
sentence-builder, sequencing, slider …) sind funktional fertig, sitzen visuell
aber noch nicht auf dem Design-System.
**Status:** Befunde triagiert, WPs geschnitten; eine Kanon-Entscheidung offen (§4)

---

## 1. Design-Bindung

Verbindliche Quellen (identisch zu `quiz-templates-sdd.md` §0, hier die für die
Stage-Fläche relevanten):

| Quelle | Regelt |
|---|---|
| [`design.md` §2](../../design.md) | Non-Negotiable Guardrails #1–#7 — **die Messlatte dieser Spec** |
| [`design.md` §3](../../design.md) | Farb-Tokens, insb. `--radius-theme` (RUNTIME-themeable) und die Surfaces-Tabelle |
| [`design.md` §3·B](../../design.md) | Component Inventory — Answer-Tile-, Input-, Button-Rezept |
| [`design.md` §4](../../design.md) | Typografie, insb. **alle Ziffern tabular** |
| [`design.md` §8·D](../../design.md) | Game-Client: Stage-Domain, keine Console-Kontamination |
| [`design.md` §8·C](../../design.md) | Präsentator — teilt dieselben Stage-Tokens |
| [`docs/design/razzoozle-flat-design-decisions.md`](./razzoozle-flat-design-decisions.md) | Herkunft der Flat-Entscheide |
| [`docs/design/razzoozle-flat-palette-verified.md`](./razzoozle-flat-palette-verified.md) | Kontrastnachweise der Fills |

**Flächengrenze — der häufigste Fehler bei Reviews dieser Dateien:** Die
Antwortkomponenten sind **Stage**, nicht Console. Die Regeln **D1–D28 aus §8·B
gelten hier nicht** (`bg-white` ist auf Cream sogar ausdrücklich sanktioniert,
Guardrail #6). Ein Befund, der eine D-Regel gegen eine Stage-Datei zitiert, ist
zurückzuweisen.

---

## 2. Befundlage (triagiert)

Quelle: Cross-Vendor-Audit 2026-07-24 (codex; die Typen wurden von einer anderen
Lane gebaut). **Jeder Befund wurde gegen Code UND Kanonquelle nachgeprüft** —
das Ergebnis weicht bewusst vom Rohbericht ab.

### 2.1 Bestätigt — Guardrail-Verstoß

| # | Ort | Verstoß | Quelle |
|---|---|---|---|
| **B1** | `answers/HotspotImage.tsx:59` | `bg-black/5` auf einer **in-flow** Karte auf Cream | §2 Guardrail #6 wörtlich: „Never `bg-black/X` on an in-flow cream surface/card"; Carve-out gilt nur für `position: fixed` Scrims |
| **B2** | `answers/SliderInput.tsx:31` | Wertanzeige (`text-5xl`) ohne `[font-variant-numeric:tabular-nums_slashed-zero]` → Ziffern springen beim Ziehen | §4: „**All numerals** … use `font-variant-numeric: tabular-nums slashed-zero`" |
| **B3** | `answers/HotspotImage.tsx:101` | Pin mit `border-white`, während der Pin bei Reveal auf `--state-correct` / `--state-wrong` wechselt → weiß auf Grün/Rot | §2 Guardrail #5 (Kontrastlogik der cream-seitigen Fills); Fix: `border-[var(--answer-text)]` |

### 2.2 Bestätigt — Theming-Bug (der eigentliche Fund)

Der Rohbericht führte das als Kosmetik („24px statt 16px", zahlenmäßig falsch —
`rounded-2xl` ist 16px, `rounded-xl` 12px). Der Punkt ist ein anderer und
schwerer:

**`--radius-theme` ist laut §3 RUNTIME-themeable** — der Manager kann den Radius
im Design-Tab verstellen. Komponenten mit fester Utility-Klasse ziehen **nicht
mit** und laufen optisch aus dem Theme heraus.

| # | Ort | Klasse | Fix |
|---|---|---|---|
| **T1** | `components/AnswerButton.tsx:87` | `rounded-2xl` + `lg:rounded-3xl` | `rounded-[var(--radius-theme)]` |
| **T2** | `answers/SubmitButton.tsx:34` | `rounded-xl` | `rounded-[var(--radius-theme)]` |
| **T3** | `answers/SentenceBuilderBoard.tsx:137` | `rounded-xl` | dito |
| **T4** | `answers/SequencingBoard.tsx:136` | `rounded-xl` | dito |
| **T5** | `answers/WortartenPicker.tsx:474` | `rounded-xl` | dito |

T1 wiegt am schwersten: `AnswerButton` ist die gemeinsame Kachel **aller**
Fragetypen. `design.md` §7 hatte die Radius-Utilities als „inkonsistent,
catalog-only, not mass-rewritten this pass" zurückgestellt — dieser Pass holt
das für die Stage-Fläche nach.

### 2.3 Bestätigt — Uneinheitlichkeit zwischen den Typen

| # | Beobachtung | Zielbild |
|---|---|---|
| **K1** | Antwortflächen driften: `SentenceBuilderBoard:58` und `SequencingBoard:57` sind gestrichelte weiße Boxen, `ChoiceGrid` / `MultiSelectGrid` sind farbige Tiles, `SlotDropdownBoard:70` ein weißes Select | Ein gemeinsames Ablage-/Eingabeflächen-Rezept für alle „Ablage"-Typen (Sentence, Sequencing, Slot); farbige Tiles bleiben den Auswahl-Typen vorbehalten. Gestrichelter Rand nur dort, wo es eine echte Drop-Zone ist |
| **K2** | `SliderInput` ist als einziger Typ „Text mit Ring" statt Eingabe + Submit | Entweder an das Eingabe+Submit-Muster angleichen **oder** die Abweichung in `design.md` §3·B als eigenes Inventar-Element dokumentieren. Nicht undokumentiert lassen |
| **K3** | `ChoiceGrid:88` / `MultiSelectGrid:93` nutzen `hover:ring-white/40` auf bunten Tiles | Hover-Ring aus einem Token statt Weiß; die Hairline-Ring-Pflicht (Guardrail #3) darf dabei nicht überdeckt werden |

### 2.4 Zurückgewiesen (Overreads des Audits)

| Rohbefund | Warum nicht |
|---|---|
| „`bg-white` ist ein Blocker, muss `bg-[var(--surface)]`" | §2 Guardrail #6 sagt für die Cream-Fläche **wörtlich** „On cream use `bg-white` + `--shadow-flat`". Auf Stage ist `bg-white` sanktioniert; die Console-Regel D5 („never `bg-white`") gilt hier nicht. Siehe aber §4 — der Kanon ist an dieser Stelle uneindeutig |
| „`focus-visible:outline-[var(--color-field-ink)]` verletzt D7" | D7 ist eine **Console**-Regel (§8·B). Für Stage definiert der Kanon keine Focus-Farbe; `--color-field-ink` ist ein legitimes STATIC-Token. Kein Verstoß — aber eine Kanon-Lücke (§4) |

---

## 3. Non-Goals

Kein Umbau der Fragetyp-**Logik**, keine Änderung an Scoring, Wire-Format oder
Editoren. Keine neuen Fragetypen. Keine Änderung an `ChoiceGrid`-Farblogik
(`ANSWERS_COLORS` bleibt). Kein Anfassen der Console-Editoren in diesem SDD.

---

## 4. Kanon-Entscheidungen (User, 2026-07-24) — ENTSCHIEDEN

| # | Entscheidung | Folge |
|---|---|---|
| **E1** | **`bg-[var(--surface)]` ist kanonisch**, auch auf der Stage-Fläche. `bg-white` wird abgelöst. | `design.md` §2 Guardrail #6 wird präzisiert; Sweep über die Stage-Dateien (WP-5). Schaltet K1 frei |
| **E2** | **Stage-Focus = violett wie in der Konsole** (`focus-visible:outline-[var(--color-primary)]`), eine Focus-Farbe app-weit | `design.md` §3·B bekommt die Formel für Stage; `AnswerButton` wird umgestellt (WP-1) |

**Zum Kontrast-Einwand bei E2:** Die Formel trägt `outline-offset-2`, die
Outline liegt also **außerhalb** der Kachel — auf Cream (`#F4F1EA`) bzw. auf
Stage-Ink (`#0E1120`), nicht auf dem bunten Fill. Violett (`#7c3aed`) steht
gegen beide Hintergründe. Ein Kontrast-Check *pro Kachelfarbe* entfällt damit;
ein Sichttest über die Kacheln bleibt Teil des Gates (§6).

---

## 5. Work-Packages

Alle WPs sind dateidisjunkt und laufen parallel. Reine Klassen-Edits, keine
Logikänderung — deshalb Free-/CLI-Lanes mit engem Scope.

| WP | Datei(en) | Inhalt | Akzeptanz |
|---|---|---|---|
| **WP-1** | `packages/web/src/features/game/components/AnswerButton.tsx` | T1: `rounded-2xl` + `lg:rounded-3xl` → `rounded-[var(--radius-theme)]` · E2: Focus-Outline → `outline-[var(--color-primary)]` | Radius folgt dem Theme-Token · Focus violett, Offset unverändert · Reveal-Zustände unverändert · `pnpm verify` grün |
| **WP-2** | `answers/HotspotImage.tsx` | B1: `bg-black/5` → tokenbasierte helle Fläche (`bg-[var(--surface)]`, ggf. mit Opazität) · B3: Pin-Rand `border-white` → `border-[var(--answer-text)]` | `grep "bg-black/" answers/HotspotImage.tsx` leer · Pin auf Grün/Rot sichtbar abgesetzt |
| **WP-3** | `answers/SliderInput.tsx` | B2: `[font-variant-numeric:tabular-nums_slashed-zero]` an die Wertanzeige | Ziffern springen beim Ziehen nicht mehr (visuell geprüft, nicht nur Klasse gesetzt) |
| **WP-4** | `answers/SubmitButton.tsx`, `answers/SentenceBuilderBoard.tsx`, `answers/SequencingBoard.tsx`, `answers/WortartenPicker.tsx` | T2–T5: je `rounded-xl` → `rounded-[var(--radius-theme)]` am Submit-Button. **Nur** diese eine Klasse je Datei | Vier Ein-Zeilen-Diffs, kein weiterer Diff · `pnpm verify` grün |
| **WP-5** | `answers/SlotDropdownBoard.tsx`, `answers/SentenceBuilderBoard.tsx`, `answers/SequencingBoard.tsx` | E1-Sweep: `bg-white` → `bg-[var(--surface)]` in den drei Stage-Antwortflächen. Nur diese Klasse, keine weiteren Änderungen | `grep -rn "bg-white" answers/` leer · Optik unverändert (`--surface` ist `#FFFFFF`) |
| **WP-6** | `design.md` | E1: Guardrail #6 präzisieren (Token statt `bg-white`, Carve-out für fixed Scrims bleibt) · E2: Stage-Focus-Formel in §3·B ergänzen · Verweis auf dieses SDD in §9 | Beide Punkte je eine eindeutige Zeile · keine anderen Abschnitte angefasst |

### Folgewelle (durch E1 freigeschaltet)

| WP | Datei(en) | Inhalt |
|---|---|---|
| **WP-7** | `answers/SentenceBuilderBoard.tsx`, `answers/SequencingBoard.tsx`, `answers/SlotDropdownBoard.tsx` | K1: ein gemeinsames Ablageflächen-Rezept (Surface-Token, Hairline, `--radius-theme`, `--shadow-flat`); gestrichelter Rand nur bei echter Drop-Zone. Läuft **nach** WP-5, gleiche Dateien |
| **WP-8** | `answers/ChoiceGrid.tsx`, `answers/MultiSelectGrid.tsx` | K3: `hover:ring-white/40` → Token-Ring, ohne die Hairline-Ring-Pflicht (Guardrail #3) zu überdecken |
| **WP-9** | `design.md` | K2: `SliderInput` als eigenes Inventar-Element in §3·B dokumentieren (Entscheid: Abweichung bleibt, wird benannt statt angeglichen) |

WP-7 und WP-5 teilen Dateien → **nicht** parallel; WP-7 startet nach dem Merge
von WP-5.

---

## 6. Gates

```bash
pnpm verify
grep -rnE "rounded-(xl|2xl|3xl)" packages/web/src/features/game/components/answers/ \
     packages/web/src/features/game/components/AnswerButton.tsx     # nach WP-1/WP-4 leer
grep -rn "bg-black/" packages/web/src/features/game/components/answers/            # nur fixed Scrims
```

Dazu ein **Sichttest im Spiel** über alle betroffenen Typen (Choice, MultiSelect,
Sentence-Builder, Sequencing, Slot-Dropdown, Drop-Pin, Slider) in drei
Viewports — Klassenänderungen an Radius und Kontrast sind ohne Blick aufs
Ergebnis nicht abgenommen. Ein grüner Testlauf allein zählt nicht.
