# Drop-Pin Direct Manipulation

**Status:** DESIGN SPEC | **Bezug:** Issue #513 | **Gültig ab:** 2026-07-28

---

## Übersicht

Der Drop-Pin-Editor soll Lehrkräfte bei der Erstellung von Fragen unterstützen, indem die Zielzonen (Rechtecke) mit Zeiger und Tastatur direkt auf dem Bild verschiebbar und in der Größe veränderbar werden. Aktuell funktioniert nur die Eingabe über Zahleneingabefelder; grafische Manipulation fehlt ganz.

**Ziel:** Ein ergonomischer, barrierefreier Editor für Lehrer auf Desktop und Tablet, der die Genauigkeit von Koordinaten durch visuelle Rückmeldung verbessert und Fehleingaben reduziert.

**Nicht in dieser Spec:** Drehung, Multi-Selection, Rückgängig, Ausrichtungshilfen, Copy-Paste von Zonen, Zoom/Pan des Bildes.

---

## A. Bedienung mit dem Zeiger (Maus)

### A1. Anfasser und Trefferflächen

Jede Zone wird als Rechteck (mit Grenze) auf dem Bild gerendert. Zwei Interaktionszonen:

1. **Verschieben (Inneres):** Der zentrale Bereich des Rechtecks, d.h. alles außer den Kanten der letzten 8px von außen. Cursor: `move`.
   - Trefferfläche: visuell unsichtbar (das Rechteck selbst ist das Ziel).
   - Min. Größe zum Verschieben: 16×16px Bildpixel (damit es nicht zu klein wird, um zu fassen).

2. **Größe ändern (Kanten/Ecken):** Ein 8px breiter Streifen an allen vier Kanten und die vier Ecken jeweils mit 12×12px. Cursor: `resize-*` (je nach Ecke/Seite).
   - Trefferfläche für Desktop: 8px breite Grenzzone (CSS `border-width` oder Overlay-Ringe).
   - Trefferfläche für Touch: siehe §C (virtuelle Anfasser).

**Begründung:** 8px ist auf modernen Bildschirmen beim Zeiger gut zu treffen, 12×12px an Ecken erlauben präzises Resize. Die Grenze des Rechtecks ist die Trefferfläche selbst.

### A2. Bildrand und Clipping

- **Verschieben:** Die Zone darf nicht komplett außerhalb des Bildes liegen. Die neue Position wird so gekürzt, dass mindestens 1px des Rechtecks sichtbar bleibt (d.h. `clamp(0, x + w) <= 1` und `clamp(0, y + h) <= 1`).
- **Größe ändern:** Die Zone darf nicht unter die Mindestgröße (w: 0.01, h: 0.01 laut `hotspotValidator`) schrumpfen. Beim Resize wird die Ecke/Kante der neuen Größe entgegengestellt gekürzt, falls die min Größe erreicht wird.
- **Visuelle Ansage:** Während des Drag wird die aktuelle Position live an den Eingabefeldern (x, y, w, h) angezeigt oder—falls die Eingabefelder verschwinden—eine Tooltip oder kleine Koordinaten-Anzeige in der Nähe des Cursors.

**Begründung:** Clipping statt Bounce verhindert "Verschwinden" der Zone. Live-Koordinaten helfen Lehrkräften, die genaue Position zu überprüfen.

### A3. Überlappungen

Überlappungen zwischen Zonen sind erlaubt. Es gibt keine visuelle Sperre oder Warnung für Überlapps. Begründung: Der Fragetyp erlaubt mehrere Zonen; die Scoring-Logik akzeptiert jeden Punkt in einer beliebigen Zone als Treffer.

**Visuelle Unterscheidung:** Falls zwei Zonen überlagern, ist die zuletzt ausgewählte Zone oben (z-index: höher). Die anderen bleiben sichtbar mit reduzierter Deckkraft (opacity: 0.5 im Hover/Idle-Zustand).

### A4. Drag-Feedback während Verschieben und Resize

**Während Verschieben:**
- Die Rechteck-Grenze wird intensiver (z.B. `--color-primary` statt der normalen Farbe).
- Das Rechteck kann leicht ausgeblendet werden (opacity: 0.8) zum Sichtbarmachen des darunterliegenden Bildes.
- Kleine Koordinaten-Anzeige oben rechts im Bild: `x: 0.25 y: 0.30` (auf zwei Dezimalstellen formatiert).

**Während Resize:**
- Die Grenze wird intensiver, und die Ecke/Kante, die bewegt wird, leuchtet auf (z.B. `--state-correct` Grün zur Durchsichtigkeit).
- Die neuen Dimensionen werden angezeigt: `w: 0.20 h: 0.25`.

### A5. Loslassen außerhalb des Bildes

- Wenn der Zeiger während des Drag **außerhalb des Bild-Bereichs** losgelassen wird, wird die Bewegung abgebrochen, die Zone bleibt in ihrer letzten gültigen Position.
- **Begründung:** Verhindert versehentliche Positionsverluste, wenn die Maus schnell über Fensterränder hinausfährt.

---

## B. Bedienung ohne Maus (Tastatur)

### B1. Zone-Auswahl und Navigation

- **Tab-Reihenfolge:** Alle Zonen sind per Tab erreichbar. Jede Zone erscheint in der Reihenfolge, in der sie im Array gespeichert ist (Top-down, Links-rechts im Bild).
- **Pfeiltasten zum Wechsel (optional):** Pfeiltasten oben/unten oder links/rechts können zwischen Zonen wechseln (falls mehrere auswählar sind). Dies ist **optional—nicht kritisch**.
- **Fokus-Indikator:** Ein 2px Fokus-Ring um die aktuelle Zone (Farbe: `--color-primary`, Offset: 2px extern; Standard aus design.md §3·B D7).

### B2. Verschieben per Tastatur

Nachdem eine Zone ausgewählt ist (Fokus):

- **Pfeiltasten (Stufe 1, Normal):** Pfeiltasten oben/unten/links/rechts bewegen die Zone um 0.01 Einheiten (1% des Bildes).
- **Pfeiltasten + Shift (Stufe 2, Fein):** Verschiebung um 0.001 Einheiten (0.1% des Bildes) für präzise Anpassungen.
- **Pfeiltasten + Alt (Stufe 3, Grob):** Verschiebung um 0.05 Einheiten (5% des Bildes) für schnelle Bewegungen.

**Begründung:** Drei Stufen ähneln der "Zoom-Rollen"-Erfahrung; 0.01 als Standard ist praktisch im 920px-Viewport (≈ 9px-Bewegung), 0.001 ≈ 0.9px für Fein-Einstellung.

### B3. Größe ändern per Tastatur

Nachdem eine Zone ausgewählt ist:

- **`+` / `-` Tasten:** Vergrößern/Verkleinern um 0.01 Einheiten in beiden Dimensionen (symmetrisch vom Mittelpunkt).
- **`+` / `-` + Shift:** Vergrößern/Verkleinern um 0.05 Einheiten (grobe Anpassung).
- **`+` / `-` + Alt:** Vergrößern/Verkleinern um 0.001 Einheiten (feine Anpassung).

**Begründung:** Separate Tasten für Größe vs. Position vermeiden Konflikte. Symmetrisches Skalieren vom Mittelpunkt ist intuitiv.

### B4. Mode-Wechsel (optional)

Ein Tastenkürzel zum Wechsel zwischen "Verschieben" und "Größe ändern":

- **`M` Taste:** Wechsel zwischen den Modi (angezeigt im Fokus-Ring-Label oder im Live-Text: "Zone 1 — Verschieben-Modus" oder "Zone 1 — Resize-Modus").

**Begründung:** Optionale Erleichterung für Power-User; nicht kritisch, falls Pfeiltasten + Operator-Tasten + Shift ausreichen.

### B5. Bestätigung und Verwerfen

- **Enter:** Änderungen speichern (Zone bleibt ausgewählt, Fokus-Ring sichtbar).
- **Escape:** Änderungen verwerfen, Zone kehrt zu Ausgangswerte zurück (nur wenn noch nicht bestätigt; sonst Fehler).

**Begründung:** Escape erlaubt schnelles Verwerfen bei Fehlern.

### B6. Screenreader-Ausgabe und ARIA

Für jede Zone muss ein `aria-label` oder `aria-describedby` vorhanden sein:

- **Idle:** `aria-label="Zone 1, x: 0.25, y: 0.30, Breite: 0.20, Höhe: 0.15. Zum Verschieben: Pfeiltasten. Zum Resize: Plus/Minus-Taste."`
- **Fokussiert:** `aria-live="polite"` + Live-Update bei Bewegung: `"Zone 1 verschoben auf x: 0.26"`

**Begründung:** ARIA-Live-Regionen ermöglichen Screenreader, Echtzeitänderungen anzukündigen. Detaillierte Labels helfen Nutzern zu verstehen, welche Tasten welche Effekte haben.

---

## C. Touch & Mobile

### C1. Trefferflächen auf Touch

Auf Touchgeräten (Viewport < 920px) werden die Anfasser vergrößert:

- **Verschieben:** Der zentrale Bereich bleibt draggbar, aber ein visueller Ring (z.B. 20×20px Kreis oder Quadrat) um den Mittelpunkt wird eingeblendet als "Griff".
- **Resize:** An jeder Ecke und Mittelpunkt jeder Kante erscheint ein 24×24px großer Kreis/Quadrat als Anfasser-Handle.

**Begründung:** 44px (Minimum laut design.md §3·B D8) ist zu groß für Edge-Anfasser auf kleineren Bildern; 24px ist ein Kompromiss zwischen Treffbarkeit und Sichtbarkeit. Die Ring-Visualisierung signalisiert, wo man anfassen soll.

### C2. Gesten

- **Single-Finger-Drag:** Zum Verschieben oder Resize (je nachdem, auf welchem Anfasser der Drag startet).
- **Keine Pinch-Geste:** Größenänderung erfolgt nur über Resize-Anfasser, nicht per Zwei-Finger-Geste. Begründung: Simpler Code, weniger Konflikt mit Seiten-Scroll.

### C3. Scroll-Konflikt vermeiden

Der Container, der das Bild + Zonen hält, nutzt CSS `touch-action: none` oder JavaScript-Event-Handling:

```css
.drop-pin-editor-canvas {
  touch-action: none;  /* Verhindert standardmässige Scroll/Pan-Gesten */
}
```

Alternativ: `preventDefault()` auf `pointerdown`/`pointermove` Events, um Browser-Default-Verhalten zu unterbrechen.

**Begründung:** touch-action ist effizienter und verhindert unwillkürliche Seiten-Scrolls.

### C4. Visuelle Unterscheidung Touch-Anfasser

Anfasser auf Touch sind visuell unterscheidbar (optional aber empfohlen):

- Zonen im Idle-Zustand: standard Grenze.
- Zonen auf Touch mit sichtbaren Anfassern: zusätzlicher visueller Ring (z.B. `box-shadow: 0 0 0 4px var(--color-primary)/30`) um die Ecken/Kanten.

**Begründung:** Lehrkräfte sehen sofort, dass die Zone tastbar ist.

---

## D. Zustände (visuell + semantisch)

Jede Zone hat folgende visuelle Zustände. Alle Farben sind Tokens aus `design.md` (keine Hex-Werte).

### D1. Idle (Standard, keine Interaktion)

- **Grenze:** 2px solid `--color-primary` (violett).
- **Füllung:** `--color-primary` mit 15% Deckkraft (`bg-[var(--color-primary)]/15`).
- **Schatten:** `shadow-[var(--shadow-flat)]` (aus design.md, flacher Standard-Schatten).
- **Cursor:** `default`.

### D2. Hover (Zeiger über der Zone, nicht geclickt)

- **Grenze:** 3px solid `--color-primary`.
- **Füllung:** `--color-primary` mit 25% Deckkraft.
- **Cursor:** `move` (wenn über Inneres), `resize-*` (wenn über Kanten/Ecken).
- **Zusätzlich:** Die Anfasser (Kanten/Ecken) werden sichtbar gemacht, wenn auf Touch ausgeblendet.

### D3. Ausgewählt / Fokussiert (per Klick oder Tab)

- **Grenze:** 3px solid `--color-primary`, mit zusätzlichem Fokus-Ring (2px offset außen).
- **Füllung:** `--color-primary` mit 30% Deckkraft.
- **Fokus-Ring:** 2px outline offset-2 outline-[var(--color-primary)] (design.md §3·B D7).
- **Cursor:** `default`.

### D4. Wird gerade verschoben (pointerdown + pointermove auf Inneres)

- **Grenze:** 3px solid `--color-primary`.
- **Füllung:** Transparent (opacity: 0) um das Bild darunter zu sehen.
- **Live-Koordinaten:** Small text-overlay oben rechts (z.B. `<div class="absolute top-2 right-2 text-xs font-mono">x: 0.25 y: 0.30</div>`).
- **Cursor:** `grabbing`.
- **Feedback:** Optional: leichte Sättigung der Grenze (z.B. `--color-primary` → brighter variant).

### D5. Wird in der Größe geändert (pointerdown + pointermove auf Anfasser)

- **Grenze:** 3px solid, farbig nach Resize-Richtung:
  - Horizontal: `--color-primary` unten/oben
  - Vertikal: `--color-primary` links/rechts
  - Diagonal: `--color-primary` auf der betroffenen Ecke
- **Füllung:** `--color-primary` mit 20% Deckkraft.
- **Live-Dimensionen:** Small text-overlay `w: 0.20 h: 0.25`.
- **Cursor:** `resize-*` (je nach Richtung).

### D6. Ungültig (zu klein oder außerhalb des Bildes)

- **Grenze:** 2px dashed `--state-wrong` (rot).
- **Füllung:** `--state-wrong` mit 10% Deckkraft.
- **Warning-Icon oder -Text:** Optional ein kleines Warnzeichen neben der Zone oder im Eingabe-Panel.
- **Cursor:** `not-allowed`.

**Bedingungen für "ungültig":**
- `w < 0.01` oder `h < 0.01` (zu klein laut Validator).
- `x < 0` oder `y < 0` oder `x + w > 1` oder `y + h > 1` (außerhalb).

**Hinweis:** Der Validator selbst blockiert die Speicherung; dieser Zustand ist ein **Hinweis**, nicht ein Fehler.

### D7. Mehrfach ausgewählte Zone (falls eine andere Zone auf dieser liegt)

- **Deckkraft:** 0.5 (Hintergrund-Zone).
- **Grenze:** 2px dotted (statt solid).
- **Füllung:** Wie Idle, aber opacity: 0.5.

**Begründung:** Lehrkräfte sehen, welche Zone "oben" ist, ohne eine Zone ganz zu verstecken.

---

## E. Abgrenzung (Nicht in dieser Spec)

Explizit **nicht** enthalten:

1. **Drehung (Rotation):** Zonen sind immer achsenparallel.
2. **Multi-Selection:** Nur eine Zone kann gleichzeitig ausgewählt sein.
3. **Rückgängig/Wiederherstellen (Undo/Redo):** Jede Änderung ist sofort persistiert (via Editor-Context).
4. **Ausrichtungshilfen (Snapping, Guides):** Keine magnetischen Linien oder automatischen Ausrichtungen.
5. **Copy-Paste / Duplikation:** Zonen können nicht dupliziert werden (nur manuell als neue Zone hinzufügen).
6. **Zoom/Pan des Bildes:** Das Bild ist immer 1:1 sichtbar; kein Zoom-in für Details.
7. **Kontextmenü (Rechtsklick):** Keine speziellen Funktionen via Kontextmenü.

---

## F. Testbarkeit

### F1. Test-IDs

Für e2e-Tests (Stagehand/Playwright) müssen folgende IDs gesetzt sein:

```
data-testid="drop-pin-zone-{index}"              // Container der Zone
data-testid="drop-pin-zone-{index}-move"         // Move-Bereich (Inneres)
data-testid="drop-pin-zone-{index}-resize-e"     // Resize-Handle East (rechts)
data-testid="drop-pin-zone-{index}-resize-w"     // Resize-Handle West (links)
data-testid="drop-pin-zone-{index}-resize-n"     // Resize-Handle North (oben)
data-testid="drop-pin-zone-{index}-resize-s"     // Resize-Handle South (unten)
data-testid="drop-pin-zone-{index}-resize-ne"    // Resize-Handle North-East (oben-rechts)
data-testid="drop-pin-zone-{index}-resize-nw"    // Resize-Handle North-West (oben-links)
data-testid="drop-pin-zone-{index}-resize-se"    // Resize-Handle South-East (unten-rechts)
data-testid="drop-pin-zone-{index}-resize-sw"    // Resize-Handle South-West (unten-links)

data-testid="drop-pin-input-x-{index}"           // Eingabefeld für x-Koordinate
data-testid="drop-pin-input-y-{index}"           // Eingabefeld für y-Koordinate
data-testid="drop-pin-input-w-{index}"           // Eingabefeld für Breite
data-testid="drop-pin-input-h-{index}"           // Eingabefeld für Höhe

data-testid="drop-pin-canvas"                    // Container für das gesamte Bild + Zonen
```

### F2. Abnahmekriterien

**Zeiger-Tests (Manual + e2e):**

1. Zone verschieben: Mit Drag das Innere einer Zone von `(0.25, 0.30)` nach `(0.35, 0.40)` verschieben. Entsprechende Eingabefelder aktualisieren sich live. Nach Loslassen: Koordinaten speichern.
2. Größe ändern: Mit Drag den Griff oben-rechts (North-East-Ecke) von `w: 0.20, h: 0.20` auf `w: 0.30, h: 0.30` vergrößern. Live-Anzeige zeigt neue Werte.
3. Bildrand-Clipping: Zone bis zum Bildrand verschieben; nicht darüber hinaus.
4. Mindestgröße: Zone auf unter `w: 0.01` schrumpfen versuchen; Eingabefeld zeigt `0.01` Minimum, nicht weniger.
5. Loslassen außerhalb: Zone in Bewegung, Maus über Fenster hinaus, Loslassen → Zone bleibt in letzter gültiger Position.

**Tastatur-Tests (e2e auf Desktop):**

1. Zone mit Tab auswählen, Fokus-Ring sichtbar.
2. Pfeiltaste oben: Zone bewegt sich um 0.01 nach oben. Eingang aktualisiert.
3. Pfeiltaste oben + Shift: Zone bewegt sich um 0.001 nach oben.
4. Plus-Taste: Zone vergrößert sich um 0.01 in beide Richtungen.
5. Escape: Auswahl aufgehoben, nächste Zone fokussierbar (oder nicht, je nach Spezifik).

**Touch-Tests (Tablet 600px Viewport):**

1. Finger auf Anfasser (24×24px Ring), Drag verschieben die Zone. Trefferfläche sollte leicht zu treffen sein.
2. Größe ändern: Finger auf Ecken-Anfasser, Drag vergrößert die Zone.
3. Scroll-Sperre: Versuchtes Drag sollte Seite nicht scrollbar machen (touch-action: none).
4. Überlappung sichtbar: Zwei Zonen auf Touch, Anfasser unterscheidbar.

**i18n-Tests:**

1. Auf DE/EN/ES/etc. umschalten; ARIA-Label für Zonen lokalisiert angezeigt.
2. Live-Text (z.B. "x: 0.25") bleibt englisch / technisch (keine Lokalisierung nötig).

---

## G. Zuschnitt der Implementierung

### Paket-Architektur (Reihung + Abhängigkeiten)

Die Implementierung zerfällt in **6 präzise Work-Packages** (~1 Datei pro WP, <150 LOC Delta):

#### **Wave 1: Grundlagen (Pointer-Handling)**

**WP-1.1: Pointer-Event-Abstraction**
- **Datei:** `packages/web/src/features/quizz/components/QuestionEditor/drop-pin-drag.ts` (neu, Hook/Util)
- **Scope:** Abstraktions-Utilities für Pointer-Events (Normalisierung, Bounds-Clipping, Live-Koordinaten-Berechnung).
- **Abhängigkeiten:** keine
- **Testen:** Unit-Tests für Koordinaten-Normalisierung.

**WP-1.2: QuestionEditorDropPin mit Pointer-Handler**
- **Datei:** `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorDropPin.tsx` (Update)
- **Scope:** Integriere Pointer-Events für Verschieben und Resize. Rendermodal + Live-Koordinaten.
- **Abhängigkeiten:** WP-1.1
- **Tests:** vitest Drag-Szenarios (verschieben, Resize, Bildrand-Clipping).

#### **Wave 2: Tastatur-Navigation**

**WP-2.1: Keyboard-Handler**
- **Datei:** `packages/web/src/features/quizz/components/QuestionEditor/drop-pin-keyboard.ts` (neu, Hook)
- **Scope:** Tastatur-Input-Handling (Pfeiltasten, Plus/Minus, Modifier-Tasten, Fokus-Management).
- **Abhängigkeiten:** keine
- **Tests:** Unit-Tests für Tastatur-Modi und Schrittweiten.

**WP-2.2: Integration Tastatur in QuestionEditorDropPin**
- **Datei:** `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorDropPin.tsx` (Update)
- **Scope:** Wiring von `drop-pin-keyboard` Hook. ARIA-Label für Zonen.
- **Abhängigkeiten:** WP-2.1, WP-1.2 (erweitert)
- **Tests:** vitest Keyboard-Navigation.

#### **Wave 3: Visuelle Zustände**

**WP-3.1: Styling & Zustands-Klassen**
- **Datei:** `packages/web/src/features/quizz/components/QuestionEditor/drop-pin-styles.css` (neu)
- **Scope:** Tailwind + CSS-Variablen für alle Zustände (Idle, Hover, Selected, Dragging, Resizing, Invalid).
- **Abhängigkeiten:** `design.md` Token (keine neuen Dependencies).
- **Tests:** Visual Review / Screenshot-Test.

**WP-3.2: Zustand-Rendering in QuestionEditorDropPin**
- **Datei:** `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorDropPin.tsx` (Update)
- **Scope:** Zustandsverwaltung (State für aktuelle Zone, Drag-Mode, etc.), CSS-Klassen anwenden.
- **Abhängigkeiten:** WP-3.1, WP-1.2, WP-2.2 (erweitert)
- **Tests:** vitest Zustandsübergänge.

#### **Wave 4: Touch-Unterstützung & Live-Koordinaten**

**WP-4.1: Touch-Anfasser-Rendering**
- **Datei:** `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorDropPin.tsx` (Update)
- **Scope:** Responsive Anfasser (Desktop 8px, Touch 24px). `touch-action: none` CSS.
- **Abhängigkeiten:** WP-3.2 (erweitert)
- **Tests:** vitest Viewport-Breakpoints.

**WP-4.2: Live-Koordinaten-Anzeige**
- **Datei:** `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorDropPin.tsx` (Update, Mini-Component)
- **Scope:** Kleine Overlay-Anzeige während Drag (x: 0.25 y: 0.30, w: 0.20 h: 0.15).
- **Abhängigkeiten:** WP-1.1 (erweitert)
- **Tests:** vitest Live-Text-Updates.

#### **Wave 5: i18n & Accessibility**

**WP-5.1: ARIA-Labels & Live-Regions**
- **Datei:** `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorDropPin.tsx` (Update)
- **Scope:** `aria-label`, `aria-live`, `aria-describedby` für jede Zone + Screenreader-Tests.
- **Abhängigkeiten:** WP-2.2 (erweitert)
- **Tests:** aXe-Audit, vitest ARIA-Check.

**WP-5.2: Lokalisierungs-Keys**
- **Datei:** `packages/common/src/locales/*.json` (×6 Sprachen)
- **Scope:** i18n Keys für Zone-Labels, Mode-Strings, etc.
- **Abhängigkeiten:** keine
- **Tests:** `check-locales.sh` 100% coverage.

#### **Wave 6: Testabdeckung**

**WP-6.1: E2E-Tests**
- **Datei:** `e2e/drop-pin-editor.spec.ts` (neu)
- **Scope:** Stagehand Tests für Desktop + Tablet:
  - Drag Verschieben + Größe ändern
  - Tastatur-Navigation
  - Touch-Gesten
  - 3 Viewports (375px, 600px, 920px)
  - Bildrand-Clipping, Mindestgröße
- **Abhängigkeiten:** WP-1.2, WP-2.2, WP-4.1, WP-5.2 (alle ready)
- **Tests:** `pnpm test:e2e drop-pin-editor`.

**WP-6.2: Visual Regression Tests**
- **Datei:** `e2e/drop-pin-editor-visual.spec.ts` (neu, optional)
- **Scope:** Screenshot-Vergleiche für alle Zustände.
- **Abhängigkeiten:** WP-3.2
- **Tests:** `pnpm test:e2e --update-snapshots`.

---

### Parallelisierungsgruppen

| Welle | WPs | Abhängigkeit | Parallelisierbar? |
|-------|-----|-------------|--------------------|
| **Wave 1** | 1.1, 1.2 | — | 1.1 solo, dann 1.2 |
| **Wave 2** | 2.1, 2.2 | Wave 1 | 2.1 solo, dann 2.2 |
| **Wave 3** | 3.1, 3.2 | Wave 1 | 3.1 solo, dann 3.2 |
| **Wave 4** | 4.1, 4.2 | Wave 3 | 4.1 + 4.2 parallel |
| **Wave 5** | 5.1, 5.2 | Wave 2 + 4 | 5.1 + 5.2 parallel |
| **Wave 6** | 6.1, 6.2 | Wave 1–5 (all) | 6.1 + 6.2 parallel |

**Kritischer Pfad:** Wave 1 → Wave 2 → Wave 5 → Wave 6 (~4 Wellen sequenziell).  
**Parallelarbeit:** Wave 3–4 können parallel zu Wave 2 laufen.

---

## H. Offene Fragen / Annahmen

1. **Undo/Redo:** Diese Spec verlässt sich auf die Persistent-via-Editor-Context. Falls eine Lehrkraft ein Resize oder Drag abbricht (Escape), werden alte Werte nicht automatisch wiederhergestellt (das müsste ein separates Feature sein).

2. **Touch-Pinch für Größe:** Ich habe Pinch ausgeschlossen (single-Finger-Drag nur). Wenn Pinch-Geste gewünscht ist, müsste WP-4 erweitert werden.

3. **Snap-to-Grid:** Nicht in dieser Spec. Falls Lehrkräfte Zonen auf einem Raster ausrichten sollen, wäre das ein separates Feature.

4. **Live-Eingabefelder-Update:** Die Zahlenfelder aktualisieren sich während Drag. Dies könnte zu Performance-Problemen bei vielen Zonen führen (e.g. 20+ Zonen). Falls kritisch, könnte das Update auf "Loslassen" verschoben werden.

5. **Überlappungs-Warnung:** Diese Spec erlaubt Überlappungen ohne Warnung. Falls das zu Verwirrung führt, könnte eine optionale Warnung in einer späteren Version hinzugefügt werden.

6. **Zoom-Level des Browsers:** Falls ein Lehrer den Browser auf 150% oder 50% zoomt, sind alle Pixel-Größen (8px, 24px) relativ zum Zoom. Dies wird automatisch vom Browser gehandhabt; keine Spezial-Logik nötig.

---

**Dokument verfasst am:** 2026-07-28  
**Gültig für Implementation Waves 1–6**
