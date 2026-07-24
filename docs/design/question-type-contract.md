# Question Type Contract — Anti-Wildwuchs-Manifest

**Ziel:** Ein verbindliches Pflichtenheft für jeden neuen Fragetyp, um Wildwuchs zu verhindern und Konsistenz zu erzwingen.

---

## 1. Vollständige Berührungspunkte

Jeder neue Fragetyp muss an den folgenden 13 Orten vollständig implementiert werden. **Keine Ausnahmen — kein Typ ist "fertig", bis alle 13 Pflichtplätze abgehakt sind.**

### 1.1 Kernel (Typ-Definition)

| # | Ebene | Datei | Rolle | Grep-Prüfung |
|---|---|---|---|---|
| **K1** | Contract | `packages/common/src/constants.ts` | Typ in `QUESTION_TYPES[]` registrieren | `grep -n "QUESTION_TYPES" packages/common/src/constants.ts` |
| **K2** | Validator | `packages/common/src/validators/quizz.ts` | Zod-Validator + `superRefine` Branch für Fragetyp | `grep -n "q.type === \"…\"" packages/common/src/validators/quizz.ts` |

### 1.2 Datenmodell & Wire

| # | Ebene | Datei | Rolle | Grep-Prüfung |
|---|---|---|---|---|
| **K3** | Wire-Typ | `rust/protocol/src/quizz.rs` | Payload-Struktur in Rust (serde) | `grep -A 5 "pub enum QuestionType" rust/protocol/src/quizz.rs` |
| **K4** | Common-Typen | `packages/common/src/types/game/index.ts` | TypeScript Mirror des Wire-Typs | `grep -n "type SomeQuestionData" packages/common/src/types/game/index.ts` |

### 1.3 Benutzeroberfläche — Editor

| # | Ebene | Datei | Rolle | Grep-Prüfung |
|---|---|---|---|---|
| **E1** | Typ-Auswahl | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorType.tsx` | Radio / Select mit Typ-Label | `grep -n "type.*choice.*boolean" packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorType.tsx` |
| **E2** | Editor-Komponente | `packages/web/src/features/quizz/components/QuestionEditor/[TypeName]Editor.tsx` (neu!) | Eingabemaske für Typ-spezifische Felder (Chunks, Slots, Hotspots, etc.) | `find packages/web/src/features/quizz -name "*Editor.tsx"` |
| **E3** | Editor-Wrapper | `packages/web/src/features/quizz/components/QuestionEditor/index.tsx` | Switch-Case oder Dynamic-Import für Typ | `grep -n "case \"slider\"" packages/web/src/features/quizz/components/QuestionEditor/index.tsx` |
| **E4** | Preview | `packages/web/src/features/quizz/components/QuestionPreview.tsx` | Thumbnail in der Fragenliste | `grep -n "if (type === \"choice\")" packages/web/src/features/quizz/components/QuestionPreview.tsx` |

### 1.4 Benutzeroberfläche — Spieler/Client

| # | Ebene | Datei | Rolle | Grep-Prüfung |
|---|---|---|---|---|
| **C1** | Antwort-UI | `packages/web/src/features/game/components/answers/[TypeName].tsx` | Neue Komponente mit Antwort-Input (Slider, Chips, Grid, etc.) | `find packages/web/src/features/game/components/answers -name "*.tsx" \| wc -l` (sollte ≥13 sein) |
| **C2** | Answers-Dispatcher | `packages/web/src/features/game/components/states/Answers.tsx` | Typ-Check + Komponenten-Rendering | `grep -n "isSlider.*=.*type ===" packages/web/src/features/game/components/states/Answers.tsx` |
| **C3** | SoloAnswers | `packages/web/src/features/game/components/states/SoloAnswers.tsx` | Spiegelung für Solo-Modus (REST statt Socket) | `grep -n "isSentenceBuilder.*=.*type ===" packages/web/src/features/game/components/states/SoloAnswers.tsx` |
| **C4** | Lösungsanzeige-Client | `packages/web/src/features/game/components/states/Result.tsx` | Client-Reveal (Position-Vergleich + Feedback) | `grep -n "correctChunks.*correctOrder" packages/web/src/features/game/components/states/Result.tsx` |

### 1.5 Benutzeroberfläche — Präsentator

| # | Ebene | Datei | Rolle | Grep-Prüfung |
|---|---|---|---|---|
| **P1** | Lösungsanzeige | `packages/web/src/features/game/components/stage/AnswerRevealPanel.tsx` | Unified Reveal-Komponente (variant="text"/"chips"/"tokenPos") | `grep -n "variant:" packages/web/src/features/game/components/stage/AnswerRevealPanel.tsx` |
| **P2** | Präsentator-Reveal | `packages/web/src/features/game/components/states/Result.tsx` | Präsentator-seitige Reveal-Logik (Branch nach Typ) | `grep -n "audience.*presenter" packages/web/src/features/game/components/states/Result.tsx` |

### 1.6 Server-Logik — Bewertung

| # | Ebene | Datei | Rolle | Grep-Prüfung |
|---|---|---|---|---|
| **S1** | Evaluation | `rust/server/src/socket/eval.rs` oder `rust/engine/src/eval.rs` | Scoring-Logik (was ist richtig?) | `grep -n "question_type::slider" rust/engine/src/eval.rs` |
| **S2** | AI-Validierung | `rust/server/src/socket/ai_validate.rs` | KI-Validierung bei der Eingabe (falls nötig) | `grep -n "QuestionType::TypeAnswer" rust/server/src/socket/ai_validate.rs` |

### 1.7 KI & Generierung

| # | Ebene | Datei | Rolle | Grep-Prüfung |
|---|---|---|---|---|
| **AI1** | Question-Builder MCP | `packages/mcp/src/question-builder.ts` | Generierung neuer Fragen (Claude MCP) | `grep -n "type.*choice" packages/mcp/src/question-builder.ts` |

### 1.8 Lokalisierung (i18n)

| # | Ebene | Dateien | Rolle | Grep-Prüfung |
|---|---|---|---|---|
| **i18n** | Strings | `packages/web/src/locales/{de,en,es,fr,it,zh}/*.json` | **6 Sprachen** × Typ-Label, Feldnamen, Reveal-Text, Fehler | `grep -l "slider" packages/web/src/locales/de/*.json` |

### 1.9 Tests

| # | Ebene | Dateien | Rolle | Grep-Prüfung |
|---|---|---|---|---|
| **T1** | Validator-Tests | `packages/common/src/validators/__tests__/quizz.test.ts` | Zod-Validierung testen (Valid + Invalid Cases) | `grep -n "describe.*slider" packages/common/src/validators/__tests__/quizz.test.ts` |
| **T2** | E2E-Tests | `packages/web/e2e/answer-flow.spec.ts` (oder Typ-spezifisch) | Browser-Test: Frage stellen → Spieler antwortet → Reveal prüfen | `grep -n "test.*sentence-builder" packages/web/e2e/` |
| **T3** | Solo-Tests | `packages/web/e2e/answer-flow.spec.ts` | Solo-Modus: Frage → Antwort → Feedback | `grep -n "solo.*slider" packages/web/e2e/` |

---

## 2. Gerüste (Kopierfertige Code-Skelette)

Für jeden Typ, der folgendes Skelett verwenden kann, um Zeit zu sparen:

### 2.1 Validator-Branch (`packages/common/src/validators/quizz.ts`)

```typescript
} else if (q.type === "new-type") {
  // TODO: Add type-specific field validation
  // Example: check if q.typeSpecificField exists and is valid
  if (!q.typeSpecificField) {
    ctx.addIssue({
      code: "custom",
      message: "errors:quizz.typeSpecificFieldRequired",
      path: ["typeSpecificField"],
    })
  }
```

### 2.2 Answer-Component (`packages/web/src/features/game/components/answers/NewTypeInput.tsx`)

```typescript
import type { ReactNode } from "react"
import { motion } from "motion/react"

interface Props {
  submitted: boolean
  onSubmit: (answer: unknown) => void
  testIdPrefix?: string
  // Type-specific props
  typeSpecificProp?: string
}

export const NewTypeInput = ({
  submitted,
  onSubmit,
  testIdPrefix = "",
  typeSpecificProp,
}: Props): ReactNode => {
  const handleSubmit = () => {
    // Validate answer
    // Call onSubmit(answer)
  }

  return (
    <motion.div className="w-full">
      {/* Render UI */}
    </motion.div>
  )
}

export default NewTypeInput
```

### 2.3 Answers.tsx Dispatcher Entry

```typescript
const isNewType = type === "new-type" && !!typeSpecificProp

// Inside JSX:
{isNewType && (
  <NewTypeInput
    submitted={submitted}
    onSubmit={() => {
      // Handle answer submission
    }}
    testIdPrefix={testIdPrefix}
    typeSpecificProp={typeSpecificProp}
  />
)}
```

### 2.4 SoloAnswers.tsx Dispatcher Entry

```typescript
const isNewType = question.type === "new-type" && !!question.typeSpecificProp

// Inside state management:
useEffect(() => {
  if (isNewType) {
    // Initialize component state
  }
}, [isNewType, question.typeSpecificProp])

// Inside JSX:
{isNewType && (
  <NewTypeInput
    submitted={submitted}
    onSubmit={() => {
      void submitAnswer(quizzId, { /* format answer */ })
    }}
  />
)}
```

### 2.5 AnswerRevealPanel Variant

```typescript
// In AnswerRevealPanel.tsx, add variant:
{variant === "new-variant" && newVariantData && (
  <div className="space-y-[var(--game-space-2)]">
    {newVariantData.map((item, idx) => (
      <div key={idx} className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{item.label}</span>
        <span className="opacity-50">·</span>
        <span className="text-sm opacity-70">{item.value}</span>
      </div>
    ))}
  </div>
)}
```

### 2.6 Result.tsx Reveal Branch

```typescript
// Präsentator
if (!poll && correctAnswerForType) {
  // Use AnswerRevealPanel with appropriate variant
}

// Client
if (!poll && correctAnswerForType && submittedAnswer) {
  // Render position-by-position comparison (if applicable)
}
```

### 2.7 i18n Keys (Vorlage)

```json
{
  "game:newType.label": "Neuer Typ",
  "game:newType.fieldName": "Feld Name",
  "game:newType.yourAnswer": "Deine Antwort",
  "game:newType.correctAnswer": "Richtige Antwort",
  "game:newType.submit": "Absenden",
  "errors:quizz.newTypeFieldRequired": "Feld ist erforderlich"
}
```

### 2.8 Test-Skelett (Validator)

```typescript
describe("newType", () => {
  it("should accept valid newType question", () => {
    const q = {
      question: "Sample",
      type: "new-type",
      typeSpecificField: "value",
      time: 10,
      cooldown: 3,
    }
    const result = questionValidator.safeParse(q)
    expect(result.success).toBe(true)
  })

  it("should reject newType without required field", () => {
    const q = {
      question: "Sample",
      type: "new-type",
      time: 10,
      cooldown: 3,
    }
    const result = questionValidator.safeParse(q)
    expect(result.success).toBe(false)
  })
})
```

---

## 3. Abnahmekriterien

Ein Fragetyp ist nur dann **abgenommen**, wenn **ALLE** der folgenden Kriterien erfüllt sind:

### 3.1 Funktionale Abnahme

- [ ] **K1 + K2:** Typ in `QUESTION_TYPES` + Validator vollständig
- [ ] **K3 + K4:** Wire-Typ + TypeScript-Types definiert
- [ ] **E1 + E2 + E3 + E4:** Typ im Editor wählbar + Editor-UI + Preview
- [ ] **C1 + C2 + C3:** Antwort-UI auf Client + SoloAnswers-Unterstützung
- [ ] **P1 + P2:** Präsentator-Reveal (via `AnswerRevealPanel` oder Spezialisierung)
- [ ] **C4:** Client-Reveal (Position-Vergleich oder Feedback, wo anwendbar)
- [ ] **S1 + S2:** Server-Evaluation + KI-Validierung (falls nötig)
- [ ] **AI1:** KI-Generierung funktioniert (falls MCP-integriert)

### 3.2 Lokalisierung (i18n)

- [ ] Alle 6 Sprachen vorhanden: de, en, es, fr, it, zh
- [ ] Strings vollständig: Typ-Label, Feld-Labels, Reveal-Text, Fehler-Meldungen
- [ ] Keine Fallbacks auf Englisch oder andere Sprache
- [ ] Gate: `scripts/check-locales.sh` passing für den Typ

### 3.3 Tests

- [ ] **Validator-Tests:** Valide + invalide Fragen testen
- [ ] **E2E-Tests:** Frage erstellen → spielen → Reveal → richtig/falsch
- [ ] **E2E-Solo:** Solo-Modus abdecken (beide Viewports: >920px und <600px)
- [ ] **Lokalisierung-Tests:** Labels in ≥2 Sprachen prüfen
- [ ] Gate: `pnpm test` + `pnpm verify` passing

### 3.4 Code-Qualität

- [ ] Keine Hardcoded-Hex-Farben (alle via CSS-Tokens)
- [ ] Keine `backdrop-blur` (§2 Guardrail #1)
- [ ] Answer-Tiles haben 1px Hairline-Ring (§2 Guardrail #3)
- [ ] Mobile-first Design (responsive)
- [ ] TypeScript strict: keine `any` / `@ts-ignore`

### 3.5 Design-Konsistenz

- [ ] Matches `design.md` §3 Komponenten-Inventar (oder neue Erweiterung dokumentiert)
- [ ] Tokens verwendet (`--game-fg`, `--state-correct`, `--answer-text`, etc.)
- [ ] Auf Cream + Ink getestet (beide Field-Backgrounds)
- [ ] Radius durchgehend `rounded-[var(--radius-theme)]`

---

## 4. Check-Script-Spezifikation (`scripts/check-question-types.sh`)

**Zweck:** Automatische Prüfung, ob ein Fragetyp alle 13 Pflichtplätze erfüllt.

**Verwendung:**
```bash
scripts/check-question-types.sh              # Alle Typen prüfen
scripts/check-question-types.sh slider       # Nur "slider"
scripts/check-question-types.sh --verbose    # Ausführliche Ausgabe
```

**Ausgabe (Matrix):**
```
Question Type Coverage Report
=============================

Typ           | K1  K2  K3  K4  E1  E2  E3  E4  C1  C2  C3  C4  P1  P2  S1  S2  AI1 i18n T1  T2  T3 | Status
-------------|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|-----|---|---|---
choice        | ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅   ✅  ✅  ✅ | OK
slider        | ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ⚠️   ✅  ✅  ✅  ✅  ✅  ✅   ✅  ✅  ✅ | INCOMPLETE
fill-blank    | ✅  ✅  ✅  ✅  ❌  ❌  ❌  ❌  ❌  ❌  ❌  ❌  ❌  ❌  ✅  ❌  ⚠️  ❌   ❌  ❌  ❌ | MISSING

Legend: ✅ Present | ⚠️ Partial | ❌ Missing
```

**Implementierung (Pseudocode):**
```bash
#!/bin/bash

TYPES=$(grep "QUESTION_TYPES = \[" packages/common/src/constants.ts -A 20 | grep -oE '"[^"]*"' | tr -d '"')

echo "Question Type Coverage Report"
echo "============================="
echo ""

for TYPE in $TYPES; do
  echo -n "$TYPE | "
  
  # K1: In QUESTION_TYPES
  grep -q "\"$TYPE\"" packages/common/src/constants.ts && echo -n "✅ " || echo -n "❌ "
  
  # K2: In validator
  grep -q "q.type === \"$TYPE\"" packages/common/src/validators/quizz.ts && echo -n "✅ " || echo -n "❌ "
  
  # K3: In rust/protocol
  grep -q "\"$TYPE\"" rust/protocol/src/quizz.rs && echo -n "✅ " || echo -n "❌ "
  
  # E1: In QuestionEditorType.tsx
  grep -q "$TYPE" packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorType.tsx && echo -n "✅ " || echo -n "❌ "
  
  # E2: Dedicated Editor component
  [ -f "packages/web/src/features/quizz/components/QuestionEditor/$(echo $TYPE | sed 's/-//g;s/^./\U&/')Editor.tsx" ] && echo -n "✅ " || echo -n "❌ "
  
  # C1: Answer component
  find packages/web/src/features/game/components/answers -name "*$TYPE*" | grep -q . && echo -n "✅ " || echo -n "❌ "
  
  # C2: In Answers.tsx
  grep -q "type === \"$TYPE\"" packages/web/src/features/game/components/states/Answers.tsx && echo -n "✅ " || echo -n "❌ "
  
  # C3: In SoloAnswers.tsx
  grep -q "type === \"$TYPE\"" packages/web/src/features/game/components/states/SoloAnswers.tsx && echo -n "✅ " || echo -n "❌ "
  
  # P1: In AnswerRevealPanel (or has custom reveal)
  grep -q "$TYPE" packages/web/src/features/game/components/states/Result.tsx && echo -n "✅ " || echo -n "❌ "
  
  # i18n: In de.json
  grep -q "$TYPE" packages/web/src/locales/de/game.json && echo -n "✅ " || echo -n "❌ "
  
  # T1: Validator test
  grep -q "$TYPE" packages/common/src/validators/__tests__/quizz.test.ts && echo -n "✅ " || echo -n "❌ "
  
  # T2: E2E test
  grep -q "$TYPE" packages/web/e2e/answer-flow.spec.ts && echo -n "✅ " || echo -n "❌ "
  
  echo ""
done
```

**Exit-Code:**
- `0`: Alle Typen vollständig
- `1`: ≥1 Typ hat fehlende Elemente (Matrix zeigt ❌)

---

## 5. Workflow beim Hinzufügen eines neuen Typs

1. **Planung (PRE-WP):**
   - Was ist der Fragetyp? (z.B. "Drag-and-Drop Sortierung")
   - Welche Payload-Struktur braucht er?
   - Sketche: Editor + Player + Reveal

2. **WP 0 — Kernel (Server + Contracts):**
   - K1: `QUESTION_TYPES` + Constant
   - K2: Zod-Validator
   - K3 + K4: Rust + TypeScript Types
   - S1: Evaluation-Logik (was ist richtig?)

3. **WP 1 — Editor (Admin-UI):**
   - E1 + E2 + E3: Editor-Komponente + Dispatcher
   - E4: Preview in der Fragenliste

4. **WP 2 — Player-UI (Client):**
   - C1: Antwort-Komponente
   - C2 + C3: Dispatcher in Answers + SoloAnswers
   - Lokalisierung (i18n) inline

5. **WP 3 — Reveal (Präsentator + Client):**
   - P1 + P2: Präsentator-Reveal
   - C4: Client-Reveal + Position-Vergleich

6. **WP 4 — KI + Tests:**
   - AI1: Generierung (optional, aber empfohlen)
   - T1 + T2 + T3: Validator + E2E + Solo

7. **Gate vor Merge:**
   - `scripts/check-question-types.sh <typ>` → ✅
   - `pnpm verify` + `pnpm test` → ✅
   - `scripts/check-locales.sh` → ✅
   - E2E auf >920px und <600px

---

## 6. Kein Wildwuchs: Anti-Patterns

| Fehler | Symptom | Fix |
|---|---|---|
| Typ in `QUESTION_TYPES` aber kein Validator | "Unknown type" Error | K2 sofort hinzufügen |
| Editor vorhanden, aber nicht in `QuestionEditorType` | Typ wählbar, aber falsche UI | E1 + E3 überprüfen |
| Answer-Component in Answers.tsx aber nicht in SoloAnswers | Solo-Modus zeigt nichts / Fehler | C3 spiegeln |
| Reveal-Logik nur auf Präsentator | Client sieht nichts | C4 hinzufügen |
| Keine i18n für neue Felder | "game:reveal.unknownType" angezeigt | Alle 6 JSON-Dateien updaten |
| E2E-Test fehlt | Regression unentdeckt | T2 + T3 vor Merge schreiben |

---

## 7. Refresh des Check-Scripts nach neuer Typ-Hinzufügung

Nach jedem neuen Typ:
```bash
scripts/check-question-types.sh --verbose > docs/design/question-type-coverage-report.txt
git add docs/design/question-type-coverage-report.txt
```

Der Report wird nach jedem Merge automatisch aktualisiert (CI-Hook).

---

## 8. Status Anfrage

`scripts/check-question-types.sh` nach einer Implementierung ausführen:
```
✅ = Stelle erfüllt (Grep-Match)
❌ = Stelle fehlt (kein Match)
⚠️ = Stelle teilweise (z.B. nur Präsentator, Client fehlt)
```

Jedes ❌ oder ⚠️ blockiert die Merge.
