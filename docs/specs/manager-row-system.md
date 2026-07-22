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

## 3. Row-Shell (R1–R3, R13)

**Base-Klasse (rowShellBase):**
```css
flex flex-col rounded-[var(--radius-theme)] 
bg-[var(--surface)] outline-2 -outline-offset-2 outline-[var(--line)] 
transition-colors
```

**Hover-Kanon (R1):** Gesamte Shell, nicht nur Body.
```css
hover:bg-[var(--accent-tint)] hover:outline-[var(--color-primary)]
```
Innerer Body-Hover `hover:bg-[var(--surface-2)]` wird ersatzlos entfernt.

**Selected (R2):** Persistent auf Shell.
```css
bg-[var(--accent-tint)] outline-[var(--color-primary)]
```
+ Indikator (SelectableRow: gefüllter Radio+Check; ListRow: `selected`-Prop → Checkbox im selection-Slot).

**Focus-Shell (R3, Buttons auf Shell z.B. SelectableRow):**
```css
focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2
```

**Focus-Body-Button (ListRow onClick-Button, existierende Formel):**
```css
focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)]
```

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
| Default | `rowShellBase + rowShellDensity[density]` | Outline `[var(--line)]`, BG weiß |
| Hover | `+ hover:bg-[var(--accent-tint)] hover:outline-[var(--color-primary)]` | Cursor pointer, `transition-colors` nur |
| Selected | `bg-[var(--accent-tint)] outline-[var(--color-primary)]` | Persistent; Indikator sichtbar; überlagert Hover |
| Focus-Shell | `+ focus-visible:outline-offset-2` | Outline nach aussen, auch im Selected |
| Focus-Body | `focus-visible:-outline-offset-2` | Inset-Formel für Body-Button |
| Disabled | `opacity-60` | Keine Hover-Reaktion; Body-Button disabled; Shell hover-immun |
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
```css
neutral:   bg-[var(--surface-4)] text-[var(--ink-muted)]
primary:   bg-[var(--accent-tint)] text-[var(--accent-contrast)]
success:   bg-[var(--status-online-bg)] text-[var(--status-online-text)]
warning:   bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]
danger:    bg-[var(--status-offline-bg)] text-[var(--status-offline-text)]
```
Abwärts-kompatibel: `tone` setzt Default, `className` überschreibt.

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
className="hidden sm:inline-flex"  // sekundäre Action auf Mobile verstecken
```

---

## 9. Seiten-Migrationsmatrix (R26 + pro Seite R15–R21)

| Tab | Dichte | Auswahl | Typ-Zeile | Notes |
|---|---|---|---|---|
| play | default | SelectableRow (Radio+Check) | ListRow | R1 Hover-Kanon |
| results | compact | — | ListRow | R15 listMotion |
| quiz | default | Checkbox in ListRow.selection | ListRow | R21: Hover-Label entfällt; selected={checked} |
| catalog | default | Checkbox in ListRow.selection | ListRow | R21: Body-onClick bleibt |
| submissions | default | — | SubmissionCard → rowShellBase-Klassen | R17: StatusBadge tone-API; aria-expanded |
| classes | default | — | ListRow mit Chevron-Action (aria-expanded) | R18: Schüler-Details-Slot mit density="compact"; "+ Schüler"-CTA im details |
| students | default | — | ListRow mit Klassen-Chips | R19: Klassen Badge chipBase; "+ Klasse" = assignTriggerClass; Trigger stopPropagation |
| labels | compact | — | ListRow (farbpunkt leading, Name title, Actions) | R20: leading+title+actions statt Eigenbau; Create-Button aria-label |
| users | default/compact* | — | ListRow mit Badge-Meta | Badge-Tone-API; responsive Actions (hidden sm:inline-flex) |

*users: Inhalt bestimmt Dichte, aber Default bevorzugt wegen Badge-Meta.

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

**Wellen-Übersicht:**
- **W1:** Chips/Styles (rowStyles, Badge, FilterPill, listMotion) — 1 WP
- **W2:** ListRow+SelectableRow+Unit-Tests — 1 WP
- **W3:** Einfache Seiten (results, labels, users, play) — 4 parallel WPs
- **W4:** Komplexe Seiten (quiz, catalog, students, classes) — 4 parallel WPs
- **W5:** Submissions — 1 WP
- **W6:** Cleanup + Design-Amendment + E2E — 1 WP
