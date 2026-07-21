# Manager UI Consistency Audit (WP0 - Correction 4)

**Date:** 2026-07-21 (Correction 4)  
**Branch:** refactor/manager-ui-consistency  
**Scope:** Manager tab sections (all 18 tabs under single /manager/config route), shared primitives, design system consolidation  
**Baseline:** main (903a35de3), design.md §8·B, prior W0–W6 implementations  
**Source:** Primitives derived via grep (documented in manager-primitive-usage.tsv), Runde-2 critical fixes applied

---

## Executive Summary

This audit consolidates findings from three independent agents (A=Archaeological, B=UX-Live, C=Code Duplication) against the current manager implementation and SDD §3–6 requirements.

**Correction 4 changes:**
- All primitives re-derived via grep against actual component imports (removes 11+ false PageHeader claims)
- PageHeader verified in 4 sections (catalog, media, profile, schueler)
- Tab keys corrected (quizz, design per BUILTIN_TABS registry)
- Running-Games: ListRow status fixed (in use, not missing); Mirror/Display fabrication removed
- KI-Generator-Gate: Flipped from "Verified" to "OPEN BUG" (button.disabled doesn't check textConfigured)
- Labels: AlertDialog delete-confirm already wired; gaps narrowed to icon-labels + usage-count
- Achievements: TierHeader documented as static (not interactive tabs)
- Profile: Added as 18th section (was missing from prior corrections)

**Key findings:**
- All 18 manager sections are BUILTIN_TABS within single /manager/config route (no separate routes)
- Existing primitives mostly complete; consolidation gaps narrow to a few specific patterns
- P0 gaps: ConfigLabels a11y (icon labels, usage-count), Nutzerverwaltung self-delete guard, KI-generator gate
- ListRow adoption: 8 sections (running, dev, users, results, klassen, catalog, quizz, schueler) — see the per-section audit table below / manager-primitive-usage.tsv for the authoritative list
- FilterPill adoption: 5 sections (catalog, media, quizz, gamemode, submissions; not results, not labels) — per the table / TSV
- PageHeader adoption: 4 sections (catalog, media, profile, schueler); the remaining sections lack it — per the table / TSV

---

## Audit Table: Manager Sections (18/18 Complete)

| Section | Tab Key | Actual Files | Primitives in Use | Finding | Status | Root Cause | Recommended Change | Risk | Tests | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Spielen (Play) | play | configurations/ConfigSelectQuizz.tsx (390) | ConsoleShell SelectableRow EmptyState ActionFooter ToggleField | Quiz selection via SelectableRow pattern | Fixed (SelectableRow now standard) | ComponentAPI | Verify keyboard nav | Low | E2E #4 | P1 | 
| Laufende Spiele | running | components/console/RunningGamesSection.tsx (177) | ConsoleShell ListRow EmptyState SectionCard AlertDialog | ListRow in use (not missing); AlertDialog delete-confirm wired | Fixed (ListRow + AlertDialog already implemented) | Layout structure complete | (Verified in code) | Low | E2E #6–7 | P1 | 
| Ergebnisse (Results) | results | configurations/ConfigResults.tsx (252) | ConsoleShell ListRow EmptyState AlertDialog | Toolbar layout, row density | Partial (file exists, primitives scattered) | No centralized toolbar | Verify ListRow adoption + filter group labels | Low | E2E #8 | P1 | 
| Achievements | achievements | configurations/ConfigAchievements/ (ConfigAchievements.tsx 247 + BadgeRow.tsx 200 + TierHeader.tsx 52 = 499 LOC) | ConsoleShell SectionCard Badge ActionFooter | TierHeader is static (not interactive tabs); form primitives need alignment | Partial (structure OK, form primitives misaligned) | Missing shared SettingRow pattern | Consolidate on SettingRow + StickyFormActions | Medium | Add SettingRow tests | P2 | 
| Quiz | quizz | configurations/quizzes/ConfigManageQuizz.tsx (246) | ConsoleShell ListRow EmptyState FilterPill Badge AlertDialog OverflowMenu ActionFooter | Oversized cards with embedded fields | Partial (ListRow exists, cards remain) | Card/row duplication | Consolidate on ListRow + verify action order | Medium | E2E #9 | P1 | 
| Katalog (Catalog) | catalog | configurations/catalog/ConfigCatalog.tsx (423) | ConsoleShell PageHeader ListRow EmptyState FilterPill Badge AlertDialog ActionFooter | Oversized item card; filters without group labels | Partial (row structure exists, filter labels missing) | Card/row duplication + filter labeling | Use ListRow; add group labels to filters | Medium | E2E snapshots | P2 | 
| Medien (Media) | media | configurations/ConfigMedia/ (ConfigMedia.tsx + MediaCard.tsx + MediaInfoDialog.tsx + useMedia*.ts) | ConsoleShell PageHeader EmptyState FilterPill Badge AlertDialog | Grid density, drag-drop, usage badges, delete-confirm fixed | Fixed (recent D3/B3 overhaul) | Portal event bubbling fixed via B3 | Preserve drag-drop, grid, controlled dialog | Low | Stagehand media-usage (T2) | P1 | 
| Vorschläge (Submissions) | submissions | configurations/submissions/ConfigSubmissions.tsx (336) + SubmissionCard.tsx (368) | ConsoleShell EmptyState FilterPill Badge AlertDialog | Status filters detached; bespoke card | Partial (card duplication remains) | Large 368 LOC component instead of row | Replace SubmissionCard with ListRow + status FilterPill toolbar | Medium | E2E; row action tests | P2 | 
| Profile | profile | configurations/ConfigProfile.tsx (388) | ConsoleShell PageHeader EmptyState SectionCard | (Profile tab design tbd) | Current | — | — | — | — | — | 
| Klassen (Classes) | klassen | configurations/klassen/ConfigKlassen.tsx (330) | ConsoleShell ListRow EmptyState Badge AlertDialog DialogPanel OverflowMenu ActionFooter | Oversized cards; label assignment detached | Partial (ListRow exists, cards remain) | Card/row duplication | Consolidate on ListRow; embed subject chips in footer | Medium | E2E #11 | P1 | 
| Schülerverwaltung | schueler | configurations/schueler/ConfigSchueler.tsx (157) | ConsoleShell PageHeader ListRow EmptyState Badge AlertDialog DialogPanel ActionFooter | Class assignment + consistent action order | Fixed (PageHeader present; row structure OK) | Row consolidation mostly done | Verify ListRow action order | Medium | E2E #12 | P1 | 
| Fächer/Labels | labels | configurations/labels/ConfigLabels.tsx (147) | ConsoleShell AlertDialog DialogPanel ActionFooter | **A11Y P0:** Icon buttons (edit, delete) lack aria-label; delete-confirm exists but usage-count not shown | Current (P0 gap unfixed) | Missing aria-label + usage-impact messaging | Add aria-label to all icon buttons; show quiz-usage on delete confirm | Medium-High | A11Y audit + button tests | P0 | 
| Design (Theme) | design | configurations/theme/ConfigTheme.tsx (395) | ConsoleShell EmptyState SectionCard AlertDialog ActionFooter FormSection LabelRow | Preview density; colour-field consistency; reset ambiguity | Partial (structure OK; wording unclear) | Missing shared collapse/sticky preview pattern | Define preview placement; consolidate colour fields | Low | Existing structure | P2 | 
| Modus (Game Mode) | gamemode | configurations/ConfigGameMode.tsx (450) | ConsoleShell FilterPill Badge FormSection ToggleField | Duplicated setting title/label; restart requirements in body text | Partial (sections exist, form wording unaligned) | Missing SettingRow + restart-badge pattern | Establish shared SettingRow component | Medium | Add SettingRow tests | P2 | 
| KI (AI Providers) | ki | configurations/ai/ConfigAI.tsx (336) | ConsoleShell EmptyState SectionCard Badge ActionFooter FormSection LabelRow | **OPEN BUG:** Provider status detached; generator enabled while provider down | Current (BUG CONFIRMED) | Button.disabled omits textConfigured check (QuizGenSection.tsx:88) | Fix button gate to check textConfigured; inline status badge; test-state feedback | Medium | AI-provider state tests | P2 | 
| Satellit | satellite | configurations/ConfigDisplay.tsx (159) | ConsoleShell | (Device management or static info—scope needed) | Partial (structure OK; scope unclear) | Scope ambiguity | Clarify device-management vs. static | Low | Existing tests | P3 | 
| Nutzerverwaltung (Users) | users | configurations/ConfigUsers.tsx (688) | ConsoleShell ListRow EmptyState Badge AlertDialog OverflowMenu ActionFooter | Wording mismatch; **self-admin can delete self (P0)**; icon labels missing | Current | Missing self-delete UI guard + aria-label | Add aria-label; UI self-delete guard; server-side check required | High | Security + E2E #14 | P0 | 
| Dev-Tools | dev | configurations/ConfigDev/ConfigDev.tsx (105) | ConsoleShell ListRow EmptyState SectionCard Badge | Code blocks no copy UI; weak env warning | Partial (modular structure OK) | Missing copy-to-clipboard + danger-zone UI | Add copy UI; organize 6 groups; danger-zone visual | Medium | Dev-tools + danger-zone tests | P2 | 

---

## Critical Path Blockers

1. **ConfigLabels a11y resolution (P0):** Icon labels, delete-usage messaging must pass accessibility audit.
2. **Nutzerverwaltung self-delete guard (P0):** Server + UI must prevent current user self-deletion.
3. **KI-Generator-Gate fix (P2 blocker):** Button.disabled must include textConfigured check.
4. **SettingRow component definition (WP2 → WP5 dependency):** Blocked until API approved.
5. **Dev-Tools security review (WP6 blocker):** Cannot ship until authorized reviewer confirms.

---

**Document prepared:** 2026-07-21 (Correction 4)  
**Primitives source:** manager-primitive-usage.tsv (grep-derived, 18 sections)  
**BUILTIN_TABS count verified:** 18 tabs (not 16–17)  
**Route structure verified:** /manager (app shell), /manager/config (single page with tab switching), /manager/quizz + /manager/quizz/$quizzId (editor)  
**PageHeader reality:** 4 sections (catalog, media, profile, schueler); 14 sections missing lacking
