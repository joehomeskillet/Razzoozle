# Manager Row System — Visuelle Einheitlichkeit (SDD)

**Gültig ab:** 2026-07-22 · **Zielversion:** Wave 1–6 · **Entscheidungs-Status:** FINAL (R1–R27)

Vereinheitlichung aller Karten/Listenzeilen unter `/manager/config/*` (9 Tabs: play, results, quiz, catalog, submissions, classes, students, labels, users) auf Basis fixer Designentscheidungen.

---

## 1. Scope

- **Ziel:** Alle Manager-Listen wirken als ein konsistentes System.
- **Umfang:** 9 Konfigurations-Tabs, SubmissionCard, alle Listenzeilen-Varianten.
- **Nicht-Ziele (R22):** Kein Dark Mode; Dialog-Redesign; Input-Divergenz akzeptiert; Routing/Gates/REST unverändert; alle data-testid byte-identisch; ClassList-pendingLabelPickerId unverändert; ActionFooter.tsx unverändert; keine neue Dependency.

---

## 2. Bestehende Architektur

| Dokument | Abdeckung |
|---|---|
| `design.md` §8·B | D1–D21, D28: Token-Kanon, Flat-Design-Prinzipien, Typografie-Basis |
| `w6-card-anatomy.md` | D22: Leading-Icon, Meta-Grammatik, Zuweisungs-Affordanz (assignTriggerClass), Aktions-Reihenfolge, footer-Slot, ListRow-Semantik |
| `w7-manager-perfection-sdd.md` | D23–D26 PROPOSED (D27 wird NICHT übernommen): Popover-Kanon, Dialog-Radix-Pflicht, Copy-DE, Gate-Scope |
| `20-visual-consistency-spec.md` | Geometrie-Matrix, Radius-D9 (2 Stufen), Icon-Größen; FilterPill H44 wird durch R10 superseded |

**Phantom-Spec-Mapping:** Ältere Kommentare „spec §4.x" / „SDD §4.5" verweisen auf ein verschollenes Dokument; diese SDD bekommt R-Nummern (keine D-Nummern).

---

## 3. Row-Shell & Contracts (R1–R3, R12–R13)

### 3.1 rowStyles.ts — Exporte (Contract, eingefroren)

**Neue Datei `console/rowStyles.ts` mit genau diesen 15 Konstanten (Export über `console/index.ts`):**

```ts
export const rowShellBase = "rounded-[var(--radius-theme)] outline-2 -outline-offset-2 transition-colors"
export const rowRestState = "bg-[var(--surface)] outline-[var(--line)]"
export const rowShellDensity: Record<ListRowDensity, string> = { default: "p-4", compact: "px-4 py-2" }
export const rowHoverState = "hover:bg-[var(--accent-tint)] hover:outline-[var(--color-primary)]"
export const rowSelectedState = "bg-[var(--accent-tint)] outline-[var(--color-primary)]"
export const rowDisabledState = "opacity-60"
export const rowFocusState = "focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2"
export const rowBodyFocusState = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)]"
export const rowTitleClass = "truncate text-sm leading-5 font-semibold text-[var(--ink)]"
export const rowMetaClass = "text-xs leading-4 font-normal text-[var(--ink-subtle)]"
export const rowLeadingClass = "flex shrink-0 items-center text-[var(--ink-muted)]"
export const rowActionGroupClass = "flex shrink-0 items-center gap-1"
export const rowActionBase = "shrink-0 text-[var(--ink-faint)]"
export const rowActionHover = "hover:bg-[var(--accent-tint)] hover:text-[var(--accent-contrast)]"
export const rowActionDestructiveHover = "hover:bg-[var(--state-wrong-soft)] hover:text-[var(--state-wrong)]"
```

**Wichtig (S4):** `rowShellBase` trägt nur Chrome (radius, outline, transition) und States, KEINE Layout-Achse und KEINE Zustandsfarben (BG/Outline-Farbe). Die setzt jede Komponente selbst via exklusivem State-Branching:
- **ListRow-Shell:** `flex flex-col` + rowShellBase (vertikale Zeilen)
- **SelectableRow:** `flex min-h-11 w-full items-center gap-3 text-left` + rowShellBase (horizontale Button-Row)

Beide nutzen rowShellDensity, rowHoverState, rowSelectedState, rowFocusState identisch.

SelectableRow refaktoriert auf dieselben Konstanten; role=radio, aria-checked, Radio-Indikator + Check bleiben.

**Exklusives State-Branching (ADR):** Tailwind v4 ordnet base-Utilities im Build unabhängig von clsx-Reihenfolge. Darum NIE additiv stapeln (`rowShellBase` + `rowRestState` + `rowSelectedState` gleichzeitig). Stattdessen exklusiv branchen: `selected ? rowSelectedState : rowRestState` (vgl. Kompositionsbeispiel §5).

Beispiel:
```ts
clsx(
  "flex flex-col",
  rowShellBase,
  rowShellDensity[density],
  disabled ? clsx(rowRestState, rowDisabledState) : selected ? rowSelectedState : rowRestState,
  hoverable && !disabled && rowHoverState
)
```

### 3.2 ListRow-API (R12, Contract eingefroren)

**TypeScript-Interface (contract einfrieren; bestehende Aufrufer müssen kompatibel bleiben):**

```ts
export type ListRowDensity = "compact" | "default"

export interface ListRowAction {
  key: string
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  destructive?: boolean
  className?: string           // NEU: responsive Sichtbarkeit (z.B. "hidden sm:inline-flex")
  "aria-expanded"?: boolean    // NEU: Expand-Trigger (ClassList-Chevron)
}

export interface ListRowProps {
  title: ReactNode
  meta?: ReactNode
  selection?: ReactNode
  leading?: ReactNode
  actions?: ListRowAction[]
  overflow?: ReactNode
  onClick?: () => void
  bodyLabel?: string
  footer?: ReactNode                         // BESTAND: volle Breite unter der Zeile, "mt-3 w-full" (Pills/Chips)
  details?: ReactNode                        // NEU: Expand-Inhalt, in derselben Shell, nach footer, "mt-3 w-full"
  density?: ListRowDensity                   // NEU, default "default"
  hoverable?: boolean                        // NEU, default true
  selected?: boolean                         // NEU
  expanded?: boolean                         // NEU: nur data-state="expanded|collapsed" auf der Shell, keine Style-Änderung
  disabled?: boolean                         // NEU: Shell opacity-60, Hover aus, Body-Button disabled
  className?: string
}
```

**Invarianten:**
- Shell bleibt div; Body wird nur bei onClick ein button.
- Actions/Overflow/selection sind Siblings (kein nested button, kein Bubbling in Body-onClick).
- Bestehende Aufrufer kompilieren unverändert.

---

## 4. Dichtevarianten (R5)

| Variante | Padding | Nutzung |
|---|---|---|
| `default` | `p-4` | play, quiz, catalog, submissions, classes, students, users |
| `compact` | `px-4 py-2` | results, labels, verschachtelte Schülerzeilen |

**Invariante:** Beide teilen Radius, Outline, States, Typografie, Icons; innere Zeile `min-h-11`.

---

## 5. Zustände (Zustandsmatrix)

| Zustand | Shell-Klassen | Notizen |
|---|---|---|
| Default | `rowShellBase + rowRestState + rowShellDensity[density]` (+ Layout-Achse je Komponente) | rowRestState trägt BG+Outline-Farben; State-exklusiv Branching NICHT additiv |
| Hover | `+ hover:bg-[var(--accent-tint)] hover:outline-[var(--color-primary)]` | Cursor pointer, `transition-colors` nur; hoverable & !disabled |
| Selected | `rowShellBase + rowSelectedState + rowShellDensity[density]` | Farben-exklusiv: Selected ERSETZT rowRestState, nicht additiv; Indikator sichtbar; Hover-Variant gewinnt über Base |
| Focus-Shell | `+ focus-visible:outline-offset-2` | Outline nach aussen, auch im Selected |
| Focus-Body | `focus-visible:-outline-offset-2` | Inset-Formel für Body-Button |
| Disabled | `opacity-60` | rowDisabledState additiv ok; Keine Hover-Reaktion; Body-Button disabled; Shell hover-immun |
| Expanded | nur `data-state="expanded\|collapsed"` auf Shell | Keine Style-Änderung, nur Data-Attribut |

---

## 6. Typografie (R4)

| Rolle | Klasse |
|---|---|
| Titel | `truncate text-sm leading-5 font-semibold text-[var(--ink)]` |
| Meta-Zeile | `text-xs leading-4 font-normal text-[var(--ink-subtle)]` |
| Supporting | `text-sm leading-5 text-[var(--ink-subtle)]` |

Lokale Meta-Wrapper (text-xs) in QuizzList, Catalog, ClassList, StudentList werden entfernt.

---

## 7. Badge-/Pill-System (R8–R10, R19)

**Badge-Tones (R8, Badge.tsx):** `tone?: "neutral"|"primary"|"success"|"warning"|"danger"`

Auflösungslogik (exakte Auflösung für Abwärts-Kompatibilität):
```ts
clsx(chipBase, tone ? TONES[tone] : (className ? undefined : defaultTone), className)
```
**Semantik:** Wenn `tone` gesetzt, verwendet die Komponente `TONES[tone]` als Basisklassen. Wenn kein `tone`: nur wenn `className` UND `defaultTone` existieren, wird `defaultTone` nur angewendet, wenn `className` absent ist. Dies bewahrt das Altverhalten, bei dem `className` ohne `tone` den `defaultTone` vollständig ersetzt.

```css
neutral:   bg-[var(--surface-4)] text-[var(--ink-muted)]
primary:   bg-[var(--accent-tint)] text-[var(--accent-contrast)]
success:   bg-[var(--status-online-bg)] text-[var(--status-online-text)]
warning:   bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]
danger:    bg-[var(--status-offline-bg)] text-[var(--status-offline-text)]
```

**assignTriggerClass (R9, Badge.tsx-Export):**
```css
relative inline-flex items-center gap-1 rounded-full 
border border-[var(--border-hairline)] px-2 py-0.5 
text-xs font-medium text-[var(--ink-medium)] 
hover:bg-[var(--accent-tint)] hover:text-[var(--accent-contrast)] 
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] 
before:absolute before:-inset-2.5 before:content-['']
```
Plus-Icon: `size-3` (StudentList wechselt von size-4). MediaInfoDialog-Sonderklassen redundant.

**FilterPill (R10):** Strukturell EINE Basis, zwei Zustandsvarianten.
```css
inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 
text-sm font-semibold 
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]
/* token-ok: toolbar-density-36 */
```
Active: `(activeClassName ?? "bg-[var(--accent-tint)] text-[var(--accent-contrast)]") + outline-2 -outline-offset-2 outline-[var(--color-primary)]`
Inactive: `bg-[var(--surface-3)] text-[var(--ink-medium)] hover:bg-[var(--surface-4)]`

---

## 8. Action-Zone (R6, R7, R16)

**Reihenfolge-Kanon (R6, D22):**
Open/Expand → Edit (SquarePen) → Duplicate → Share/Export → Enable/Disable → Delete (zuletzt)
Overflow ⋮ IMMER letzter Slot.

**Icon-Größe & Spacing:** `size-5`, Click-Area `size-11` (Button ghost/icon), `gap-1`.

**Hover (R6):**
- Nicht-destruktiv: `hover:bg-[var(--accent-tint)] hover:text-[var(--accent-contrast)]`
- Destruktiv (Delete, etc.): `hover:bg-[var(--state-wrong-soft)] hover:text-[var(--state-wrong)]`

**Leading-Icon (R7):** `size-5 shrink-0 text-[var(--ink-muted)]` (D22a: wechselt von ink-faint auf ink-muted).

**Responsive Actions (R16, ConfigUsers):** CSS-Lösung, kein isMobile-State.
```css
className="max-sm:hidden"        // Action inline nur ≥sm (Variant-Regel gewinnt sicher)
<span className="sm:hidden">     // OverflowMenu-Wrapper nur <sm
```
Nie `hidden` + Basis-Display-Klasse mischen — Variant-Regeln (`max-sm:`/`sm:`) statt Base-Utility-Overrides (vgl. ADR rowstyles-zustandsfarben-exklusiv-statt-additiv).

---

## 9. Seiten-Migrationsmatrix (R26 + pro Seite R15–R21)

| Tab | Dichte | Auswahl | Typ-Zeile | Notes |
|---|---|---|---|---|
| play | default | SelectableRow (Radio+Check) | ListRow | R1 Hover-Kanon |
| results | compact | — | ListRow | R15 listMotion |
| quiz | default | Checkbox in ListRow.selection | ListRow | R21: Hover-Label entfällt; selected={checked} |
| catalog | default | Checkbox in ListRow.selection | ListRow | R21: Body-onClick bleibt |
| submissions | default | — | SubmissionCard → rowShellBase-Klassen | R17: StatusBadge tone-API; aria-expanded |
| classes | default | Checkbox in ListRow.selection | ListRow mit Chevron-Action (aria-expanded) | R18: Schüler-Details-Slot mit density="compact"; "+ Schüler"-CTA im details; selected={checked} |
| students | default | Checkbox in ListRow.selection | ListRow mit Klassen-Chips | R19: Klassen Badge chipBase; "+ Klasse" = assignTriggerClass; Trigger stopPropagation; selected={checked} |
| labels | compact | — | ListRow (farbpunkt leading, Name title, Actions) | R20: leading+title+actions statt Eigenbau; Create-Button aria-label |
| users | default | — | ListRow mit Badge-Meta | Badge-Tone-API; responsive Actions (hidden sm:inline-flex) |

**Invariante Multi-Select-Checkboxen:** ListRow-basierte Managerlisten tragen ihre Multi-Select-Checkboxen innerhalb der Karten-Shell im `selection`-Slot (Checkbox in einem `size-11`-`label`-Wrapper, Muster wie QuizzList). Externe Checkbox-Spalten neben ListRow sind nicht zulässig.

**R15 listMotion (neue Datei `console/listMotion.ts`):**
```ts
listContainerMotion(reducedMotion)   // Opacity-Fade 0.3s easeOut
listItemMotion(index, reducedMotion) // opacity+y10, 0.28s, delay Math.min(index,8)*0.04s
```
Konsumenten (≥3-Duplikate): ConfigSelectQuizz, ConfigResults, QuizzList, ConfigCatalog, ConfigSubmissions.

---

## 10. Accessibility (R27)

- Icon-only Buttons: `aria-label` pflicht.
- Hit-Areas: ≥44px (Ausnahmen: R10-Marker `token-ok`).
- Semantik: `role=radiogroup/radio`, `aria-checked` auf SelectableRow; `aria-expanded` auf Preview/Reject/Approve/Edit/Klassen-Chevron.
- Status nie nur über Farbe; Badges tragen Text.
- Keine Touch-Flächen durch overflow-hidden abgeschnitten.

---

## 11. Testplan (R23, R24)

**Neue Datei:** `console/__tests__/row-system.test.tsx` (renderToStaticMarkup, node-env, KEIN jsdom)

**Abdeckung:**
- Shell default/compact, hoverable an/aus, selected, disabled, footer/details
- Action aria-labels + destructive-Klassen, Body-Button nur bei onClick, keine verschachtelten Buttons
- SelectableRow role=radio/aria-checked/Indikator
- Badge-Tones + Legacy-className-Verhalten
- FilterPill beide Varianten + Count
- assignTriggerClass-Inhalt (Pseudo-Element)

**Gates pro Wave (R24):** `pnpm -r run types`, `oxlint`, `pnpm --filter web run test`, `bash scripts/check-manager-tokens.sh`, `bash scripts/check-locales.sh`, `pnpm --filter web run build`

**E2E Stagehand:** manager-console, quiz-title-mobile, manager-deeplink nach Deploy pro Wave.

---

## 12. Akzeptanzkriterien & Nicht-Ziele

**Checkliste:**
- [ ] Architektur: rowStyles.ts (R13) zentralisiert; ListRow-API (R12) Contract eingefroren
- [ ] Visuell: Alle 9 Tabs optisch konsistent; Dichte-Invarianten eingehalten; Hover/Selected/Focus/Disabled-Zustände pixel-identisch
- [ ] Funktional: SelectableRow + ListRow + SubmissionCard teilen Shell-Basis; keine nested Buttons; Actions respektieren Reihenfolge-Kanon (R6)
- [ ] A11y: aria-labels, aria-expanded, ≥44px Hit-Areas, role=radio
- [ ] Qualität: rowStyles.test.tsx grün; existing Tests (settingrow-slots, configurations/index) bleiben grün; locale-check 0 Fehlalarme

**Nicht-Ziele (R22 explizit akzeptiert):**
- Dark Mode (0 Treffer prefers-color-scheme)
- Dialog-Redesign (Dialoge behalten Struktur)
- Input-Divergenz aufgelöst (existierende Override-Akzeptanz)
- Routing, Gates, REST-Verträge, data-testid-Byte-Identität, ActionFooter-Geometrie
- ClassList-pendingLabelPickerId-Logik, handleOpenEdit-Reject-Timing

---

**Wellen-Übersicht (kleine WPs, breiter Fan-out):**

| Welle | Branch | WPs | Dateien | Parallelität |
|---|---|---|---|---|
| **W1** | wp/w1-* | 1a rowStyles.ts+console/index.ts · 1b Badge.tsx · 1c FilterPill.tsx · 1d listMotion.ts | 4 Dateien | 4 parallel |
| **W2** | wp/w2-* | 2a ListRow.tsx · 2b SelectableRow.tsx · 2c __tests__/row-system.test.tsx | 3 Dateien | 3 parallel |
| **W3** | wp/w3-* | results · labels · users · play | 4 Seiten | 4 parallel |
| **W4** | wp/w4-* | quiz · catalog · students · classes | 4 Seiten | 4 parallel |
| **W5** | wp/w5-* | SubmissionCard.tsx · ConfigSubmissions.tsx | 2 Dateien | 2 parallel |
| **W6** | wp/w6-* | Cleanup (MediaInfoDialog-Sonderklassen, design.md-§8·B-Amendment, e2e-Specs) | — | 1 |
