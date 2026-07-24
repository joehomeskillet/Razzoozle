# Answer Reveal SDD (Specification Design Document)

**Ziel:** Einheitliche Lösungsanzeige (Reveal) auf Präsentator und Client für alle 13 Fragetypen. Dieses Dokument definiert die IST-Analyse der bestehenden Reveals, das einheitliche Muster, und Anforderungen für fehlende Implementierungen.

---

## 1. Überblick: Lösungsanzeige-Architektur

Die Lösungsanzeige besteht aus **zwei unabhängigen Schichten:**

### Präsentator (§8·C Design-Fläche)
- **Wo:** `QuestionStage` + `Result.tsx` (beides `audience="presenter"`)
- **Was:** Die richtige Antwort, für alle sichtbar. Gross, deutlich, keine persönlichen Daten.
- **Komponente:** `AnswerRevealPanel` (4 Varianten: `text`, `number`, `chips`, `tokenPos`)
- **Aktivierung:** Nach dem Antwortende (Timer läuft ab / Host drückt "next")

### Client/Spieler (§8·D Design-Fläche)
- **Wo:** `Result.tsx` (beides `audience="player"` oder ungesetzt)
- **Was:** Die eigene Antwort neben der richtigen, Feedback ob richtig/falsch
- **Komponente:** Typ-spezifische Vergleichslogik in `Result.tsx` (Chips-Vergleich, Position-Vergleich, etc.)
- **Aktivierung:** Gleichzeitig mit Präsentator, aber mit persönlichem Feedback

---

## 2. Matrix: 13 Fragetypen — Reveal-Status

| # | Typ | Präsentator-Reveal | Client-Reveal | Ort | Status |
|---|---|---|---|---|---|
| 1 | `choice` | ✅ Text (Antwort A–D) | ✅ Tile-Recoloring | `Result.tsx:333` + Tile-Recoloring | OK |
| 2 | `boolean` | ✅ Text (Ja/Nein) | ✅ Tile-Recoloring | `Result.tsx:333` + Tile-Recoloring | OK |
| 3 | `slider` | ✅ Number | ✅ Keine Rückmelding heute | `Result.tsx:333` | **Unvollständig: Client fehlt** |
| 4 | `poll` | ❌ KEIN Reveal | ❌ KEIN Reveal | `!poll` Gate | N/A (per Design) |
| 5 | `multiple-select` | ✅ Text (mehrere Antworten) | ✅ Tile-Recoloring | `Result.tsx:333` + Tile-Recoloring | OK |
| 6 | `type-answer` | ✅ Text (richtige Antwort) | ⚠️ Teilweise (eigener Text, aber kein Vergleich) | `Result.tsx:333` | **Unvollständig: Client zeigt nur Verdict** |
| 7 | `sentence-builder` | ✅ Chips + Vergleich | ✅ Vergleich (grün/rot pro Wort) | `Result.tsx:215–245` + Chips-Panel | OK |
| 8 | `mathematik` | ✅ Number | ✅ Keine Rückmelding heute | `Result.tsx:333` | **Unvollständig: Client fehlt** |
| 9 | `wortarten` | ✅ tokenPos + Vergleich | ✅ tokenPos-Vergleich (grün/rot pro Token) | `Result.tsx:282–290` + tokenPos-Panel | OK |
| 10 | `sequencing` | ✅ Chips + Vergleich | ✅ Vergleich (grün/rot pro Position) | `Result.tsx:247–280` + Chips-Panel | OK |
| 11 | `fill-blank` | ❌ **FEHLT** | ❌ **FEHLT** | – | **KRITISCH** |
| 12 | `matching` | ❌ **FEHLT** | ❌ **FEHLT** | – | **KRITISCH** |
| 13 | `drop-pin` | ❌ **FEHLT** | ❌ **FEHLT** | – | **KRITISCH** |

**Zusammenfassung:**
- ✅ OK (7 Typen): choice, boolean, multiple-select, sentence-builder, wortarten, sequencing, poll (N/A)
- ⚠️ Unvollständig (3 Typen): slider, type-answer, mathematik
- ❌ Kritisch fehlend (3 Typen): fill-blank, matching, drop-pin

---

## 3. Unified Reveal Pattern

Alle Reveals folgen diesem kanonischen Muster:

### 3.1 Präsentator-Reveal (§8·C)

**Anforderungen:**
1. **Was:** Die richtige Antwort / die Lösung (niemals die Spieler-Antwort)
2. **Wann:** Nach dem Timer-Ende oder Host-„Next"
3. **Wie:** Unified `AnswerRevealPanel` mit 4 Varianten:
   - `variant="text"`: Single-Text-Antwort (choice, boolean, mathematik, slider, type-answer)
   - `variant="number"`: Numerische Antwort (slider mit `number`, mathematik)
   - `variant="chips"`: Mehrere Chips (sentence-builder, sequencing, fill-blank, matching)
   - `variant="tokenPos"`: Token-Position-Paare (wortarten)

4. **Visuell:** 
   - Grösse: `text-4xl md:text-5xl` (Präsentator), `text-2xl md:text-3xl` (Client)
   - Hintergrund: `ANSWER_TILE_SURFACE` (Stage-Surface, dunkel)
   - Ring: 1px `--border-hairline` (§2 Guardrail #3)
   - Text: `--game-fg` (Stage-Ink, weiss im Ink-Modus)
   - Padding: `p-[var(--game-space-4)]`
   - Border-Radius: `rounded-[var(--radius-theme)]`

### 3.2 Client-Reveal (§8·D)

**Anforderungen:**
1. **Was:** 
   - Eigene Antwort im Vergleich zur richtigen
   - Farbcodierung: `--state-correct` (Grün) / `--state-wrong` (Rot) für Position-Vergleiche
   - Für Text-Antworten: der angenommene Text (oder „leer" wenn keine Antwort)

2. **Wann:** Gleichzeitig mit Präsentator-Reveal (nach Timer-Ende)

3. **Layout:**
   - **Für Position-Vergleiche** (sentence-builder, sequencing, wortarten, fill-blank, matching):
     - Oben: „Deine Antwort" (Optional-Label: `t("game:reveal.yourAnswer")`)
     - Chips/Items mit Grün (✅ korrekt) / Rot (❌ falsch)
     - Unten: Canonical Panel mit richtiger Lösung
   
   - **Für Text-Vergleiche** (type-answer, mathematik):
     - Dein Text in Neutral anzeigen
     - Dann die richtige Antwort via `AnswerRevealPanel`
   
   - **Für Slider/Number:**
     - Dein Wert anzeigen (z.B. "Du: 42")
     - Richtige Antwort via `AnswerRevealPanel`

4. **Visuell:**
   - Grösse: Angepasst an Client-Viewport (Mobile-first)
   - Chips: Gleiche Klassen wie Präsentator, aber kleinere Grösse
   - Farben: `--state-correct` / `--state-wrong` für Vergleiche; `--answer-text` für Labels

---

## 4. Fehlende Implementierungen: Detailspezifikation

### 4.1 `fill-blank` (Slot-Auswahl)

**Payload-Struktur** (aus Validator):
```typescript
slots: SlotValidator[] = { options: string[], correctIndex: number }[]
segments: string[] // text[0] + slot[0] + text[1] + slot[1] + … + text[n]
```

**Server sendet in SHOW_RESULT:**
- `correctAnswer` ✅ (wird heute in `Result.tsx:333` angezeigt)
- **FEHLT:** `correctOptions?: string[]` — die richtige Antwort pro Slot

**Präsentator-Reveal:**
1. Segment-Text + Dropdown-Option pro Slot in Reihung
2. Variant: `chips` (der korrekten Optionen, NICHT der Segment-Text)
3. Label: `t("game:fillBlank.correctAnswers")`

**Client-Reveal:**
1. Position-Vergleich: Deine Selections vs. `correctOptions`
2. Grün (✅) für korrekte Slot-Antwort, Rot (❌) für falsche
3. Layout wie sentence-builder (oben „Deine Antwort", unten Canonical Panel)

### 4.2 `matching` (Zuordnung)

**Payload-Struktur:**
```typescript
leftItems: MatchingItemValidator[] = { label, options[], correctIndex }[]
```

**Server sendet in SHOW_RESULT:**
- `correctAnswer` ✅ (heute angezeigt)
- **FEHLT:** `correctMatches?: string[]` — die richtige Option pro Left-Item

**Präsentator-Reveal:**
1. Left-Label + richtige Option per Zeile
2. Variant: `tokenPos` — reuse als `[{token: leftLabel, pos: correctOption}, …]`
3. Label: `t("game:matching.correctMatches")`

**Client-Reveal:**
1. Position-Vergleich: Deine Selection vs. `correctMatches`
2. Grün (✅) für korrekte Zuordnung, Rot (❌) für falsche
3. Layout wie wortarten (positional vergleich mit Icon-Separator)

### 4.3 `drop-pin` (Hotspot)

**Payload-Struktur:**
```typescript
hotspots: HotspotValidator[] = { x, y, w, h }[] // relativ 0–1
media: QuestionMedia // Bild URL
```

**Server sendet in SHOW_RESULT:**
- `correctAnswer` ✅ (heute könnte der Label sein: "Bereich 1" oder "Top-left")
- **FEHLT:** `correctHotspotIndex?: number` — welcher Hotspot die Lösung

**Präsentator-Reveal:**
1. Gleiche Media anzeigen (nicht duplizieren)
2. Korrekter Hotspot mit grüner Hervorhebung / Outline oder Puls-Animation
3. Label via `AnswerRevealPanel variant="text"` (z.B. "Richtige Antwort: Brenner 2")

**Client-Reveal:**
1. Gleiche Media anzeigen
2. Dein angetippter Punkt (falls gespeichert) als rotes `x`
3. Richtiger Hotspot als grüne Hervorhebung/Outline
4. Layout: Media mit Overlays, Label via Text-Panel darunter

---

## 5. Implementierungsordnung (Dependency Chain)

**Wave 0 — Server-Contracts einfrieren (Rust):**
1. `SHOW_RESULT` Payload um `correctOptions` (fill-blank) + `correctMatches` (matching) + `correctHotspotIndex` (drop-pin) erweitern
2. Validator + evaluation-Logic prüfen

**Wave 1 — Präsentator-Reveals:**
1. `fill-blank` `AnswerRevealPanel variant="chips"`
2. `matching` `AnswerRevealPanel variant="tokenPos"`
3. `drop-pin` Media-Overlay + Text-Panel

**Wave 2 — Client-Reveals + Unvollständige:**
1. `fill-blank` Position-Vergleich (grün/rot per Slot)
2. `matching` Position-Vergleich (grün/rot per Zeile)
3. `drop-pin` Punkt-Overlay (rot für dein Punkt, grün für richtig)
4. `slider` Client-Rückmelding (z.B. "Du: 42 | Richtig: 38")
5. `type-answer` Text-Vergleich anzeigen
6. `mathematik` Text/Number-Rückmelding

---

## 6. Flächengrenzen und Guiderails (§2 & §3)

- **Keine Dark Surfaces auf Cream:** Auf Cream-Feldern `bg-white` + `--shadow-flat`; auf Ink (Stage) die `ANSWER_TILE_SURFACE`. Präsentator nutzt immer Ink.
- **Hairline-Ring auf jedem Tile:** `border: 1px solid var(--border-hairline)` ist PFLICHT (Guardrail #3).
- **Ink-Text auf farbigen Fills:** `--answer-text: #0B0B12` auf Grün/Rot (keine weissen Label).
- **Keine Hardcoded-Hex:** Alle Farben via Token (`--state-correct`, `--state-wrong`, `--answer-text`).
- **Radius:** `rounded-[var(--radius-theme)]` durchgehend.

---

## 7. Client-Server-Vertragszeilen

| Typ | Payload | Präsentator-Feld | Client-Feld |
|---|---|---|---|
| choice | `correctAnswer` | ✅ | ✅ Tile-Recoloring |
| boolean | `correctAnswer` | ✅ | ✅ Tile-Recoloring |
| slider | `correctAnswer` | ✅ als number | **✅ NEW: `playerValue?`** |
| poll | – | ❌ | ❌ |
| multiple-select | `correctAnswer` | ✅ | ✅ Tile-Recoloring |
| type-answer | `correctAnswer` | ✅ | **✅ NEW: `playerAnswer?`** |
| sentence-builder | `correctChunks` | ✅ | ✅ |
| mathematik | `correctAnswer` | ✅ als number | **✅ NEW: `playerValue?`** |
| wortarten | `correctTokenPos` | ✅ | ✅ |
| sequencing | `correctOrder` + `items` | ✅ | ✅ |
| fill-blank | `correctAnswer` + **`correctOptions`** | ✅ chips | **✅ NEW** |
| matching | `correctAnswer` + **`correctMatches`** | ✅ tokenPos | **✅ NEW** |
| drop-pin | `correctAnswer` + **`correctHotspotIndex`** | ✅ text | **✅ NEW** |

---

## 8. Lokalisierung (i18n)

Neue Keys für alle 6 Sprachen (de, en, es, fr, it, zh):

```json
{
  "game:reveal.correctAnswer": "Richtige Antwort",
  "game:reveal.yourAnswer": "Deine Antwort",
  "game:fillBlank.correctAnswers": "Richtige Lösungen",
  "game:matching.correctMatches": "Richtige Zuordnungen",
  "game:dropPin.correctLocation": "Richtige Stelle",
  "game:reveal.yourValue": "Dein Wert",
  "game:reveal.correctValue": "Richtiger Wert"
}
```

---

## 9. E2E-Test-Abdeckung

Jeder Typ braucht:
1. **Präsentator-Reveal-Test:** Manager/Presenter sieht richtige Antwort
2. **Client-Reveal-Test:** Player sieht Vergleich (grün/rot für Position-Typen)
3. **Solo-Reveal-Test:** Solo-Mode zeigt Feedback (via `SoloAnswers` → `Result`)
4. **Lokalisierung-Test:** Alle 6 Sprachen laden Reveal-Labels

---

## 10. Status

- **Spezifikation:** ✅ DONE (dieses Dokument)
- **Server-Verträge:** ❌ PENDING (Wave 0, Rust-WP)
- **Präsentator-Reveals:** ❌ PENDING (Wave 1, 3 WPs)
- **Client-Reveals:** ❌ PENDING (Wave 2, 6 WPs)
- **i18n:** ❌ PENDING (parallel zu Wave 1–2)
- **E2E:** ❌ PENDING (nach Wave 2)
