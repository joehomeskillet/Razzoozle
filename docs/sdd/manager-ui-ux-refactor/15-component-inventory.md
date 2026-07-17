# 15 — Component Inventory (Manager)

**Date:** 2026-07-17 · **Sources:** Codex arch audit + Grok element audit (both verified against artifacts).
**Baseline:** #86 shipped the shell + tokens + core primitives. Manager = `packages/web/src/features/manager/` (~85 tsx). This inventory drives the modularization plan (`16-`).

## Existing primitives (keep / extend — do NOT reinvent)

| Group | Component | Path | Status |
|---|---|---|---|
| base | Button (primary/secondary/danger/ghost · sm/md/lg/icon) | `components/Button.tsx` | keep; **fix focus?** no — Button uses D7 already |
| base | Input | `components/Input.tsx` | **extend + fix focus (D7 violation, line 23)** |
| base | Card, AlertDialog, Avatar, Loader, PinInput, Markdown | `components/` | keep |
| ui | ActionFooter, FormSection (×25), ToggleField (×12), LabelRow, ColorPickerField | `components/ui/` | keep; extend ColorPickerField |
| manager | Badge (chipBase), DialogPanel, FilterPill, OverflowMenu, PageHeader | `components/manager/` | keep; **extend PageHeader**; drive adoption |
| console | ConsoleShell, NavItem, ListRow, SectionCard, SubGroup, EmptyState, SelectableRow | `console/` | keep; migrate their raw buttons |

## Missing primitives (verified absent) → create

`Checkbox`, `Radio` (+ RadioGroup), `Select` (native wrapper), `DateInput`, `NumberInput`. (ColorPickerField exists but minimal.)

## Primitive-adoption gap (verified counts)

- **17 files with raw `<button>`** (21 instances): 7 icon-only (ConsoleShell ×2, SelectableRow, AnimationControls, ResultModalTable, ConfigMedia…), 10 form/action (CatalogQuestionForm, ConfigUsers ×2, ClassList ×2, StudentPicker, StudentList, BadgeRow, ConfigTheme, MediaInfoDialog). **`ListRow` body button + `NavItem` role="tab"** stay raw (intentional semantics).
- **19 files with raw `<input>`** (27 instances): ~7 text→Input, 4 date→DateInput, 8 checkbox→Checkbox, 4 radio→Radio, 2 number→NumberInput, 1 color→ColorPickerField.
- **6 raw `<select>`** → Select (ai/ImageSection, ai/TextProviderSection, ConfigSelectQuizz, ConfigUsers, ConfigManageQuizz, submissions/SubmissionCard).

## Hook inventory — 6 CRUD managers share ~70% boilerplate (verified)

`useCatalogManager`, `useClassManager`, `useQuizzManager`, `useLabelManager`, `useSchuelerManager`, `useOptimisticConfigToggle` — each is `state(fromConfig) + effect(sync) + mutation + toast`. → extract `useCrudManager<T>` template (Wave 3, test-guarded). Media hooks (upload/dragdrop/selection) + useConfigTheme stay specialized. Contexts (ConfigContext, ResultModal, ActiveConsoleTab, SelectConsoleTab) are lean — keep.

## Scope verdict
**~60-70% done by #86.** Remaining is surgical (~5 new primitives, 17 button migrations, focus/radius/status unification, 6-hook consolidation, component adoption). NOT a big-bang. Full detail + waves in `16-modularization-plan.md`.
