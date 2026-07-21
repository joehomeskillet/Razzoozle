# Manager UI Consistency Audit (WP0)

**Date:** 2026-07-21  
**Branch:** refactor/manager-ui-consistency  
**Scope:** Manager tab sections (all 18 tabs under single /manager/config route), shared primitives, design system consolidation  
**Baseline:** main (903a35de3), design.md §8·B, prior W0–W6 implementations  

---

## Executive Summary

This audit consolidates findings from three independent agents (A=Archaeological, B=UX-Live, C=Code Duplication) against the current manager implementation and SDD §3–6 requirements.

**Key findings:**
- All 18 manager sections are BUILTIN_TABS within single /manager/config route (no separate routes)
- Existing primitives sufficient for most sections
- P0 gaps: ConfigLabels a11y (icon labels, delete confirm), Nutzerverwaltung self-delete guard, dev-tools function errors, mobile sticky-bar overlap
- ConfigAchievements total 499 LOC (247+200+52), not 368
- PageHeader used in only 4 sections (Catalog, Media, Profile, ConfigSchueler); 14 remaining lack it
- "+ + Klasse" bug NOT reproducible in codebase (not an issue to fix)

---

## Audit Table: Manager Sections

| Section | Tab Key | Actual Files | Primitives in Use | Finding | Status | Root Cause | Recommended Change | Risk | Tests | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Spielen (Play) | play | configurations/ConfigSelectQuizz.tsx (390) | ConsoleShell, Button, SelectableRow (only consumer) | Quiz selection via oversized card interaction; click ambiguity | Fixed (SelectableRow now standard) | ComponentAPI | SelectableRow already in use; verify keyboard nav | Low | E2E #4 | P1 |
| Laufende Spiele | running | components/console/RunningGamesSection.tsx (177) | ConsoleShell, Button, ListRow (missing) | Mixed card treatment | Partial (flat file, no row consolidation) | Layout duplication | Consolidate on ListRow structure | Medium | E2E #6–7 | P1 |
| Ergebnisse (Results) | results | configurations/ConfigResults.tsx (252) | PageHeader, Input, FilterPill, Button | Toolbar layout, row density | Partial (file exists, primitives scattered) | No centralized toolbar | Verify ListRow adoption + filter group labels | Low | E2E #8 | P1 |
| Achievements | achievements | configurations/ConfigAchievements/ (ConfigAchievements.tsx 247 + BadgeRow.tsx 200 + TierHeader.tsx 52 = 499 LOC total) | ConsoleShell, PageHeader, Button, Input, AlertDialog (partial) | Rank tabs + edit panel compete vertically; form primitives need alignment | Partial (structure OK, form primitives misaligned) | Missing shared SettingRow pattern | Consolidate on SettingRow + StickyFormActions | Medium | Add SettingRow component tests | P2 |
| Quiz | quizzes | configurations/quizzes/ConfigManageQuizz.tsx (246) + QuizzList.tsx + QuizzDialogs.tsx | PageHeader, Input, FilterPill, ListRow (partial), Button | Oversized cards with embedded fields | Partial (ListRow exists, cards remain) | Card/row duplication | Consolidate on ListRow + verify action order | Medium | E2E #9 | P1 |
| Katalog (Catalog) | catalog | configurations/catalog/ConfigCatalog.tsx (423) + CatalogQuestionForm.tsx + CatalogQuestionModal.tsx | PageHeader, Input, FilterPill, ListRow (partial), Badge | Oversized item card; filters without group labels | Partial (row structure exists, filter labels missing) | Card/row duplication + filter labeling | Use ListRow; add group labels to filters | Medium | E2E snapshots | P2 |
| Medien (Media) | media | configurations/ConfigMedia/ (ConfigMedia.tsx + MediaCard.tsx + MediaInfoDialog.tsx + useMedia*.ts) | PageHeader, Input, FilterPill, Badge, ListRow (grid-based), AlertDialog (controlled, B1/B3 fixes) | Grid density, drag-drop, usage badges, delete-confirm stacking | Fixed (recent D3/B3 overhaul) | Portal event bubbling fixed via B3 | Preserve drag-drop, grid, controlled dialog; revalidate D3 hover + B3 portal fix | Low | Stagehand media-usage spec (T2) | P1 |
| Vorschläge (Submissions) | submissions | configurations/submissions/ConfigSubmissions.tsx (shim) → ConfigSubmissions.tsx (336) + SubmissionCard.tsx (368) | PageHeader (partial), FilterPill, Button, ListRow (missing) | Missing title; status filters detached; bespoke card | Partial (PageHeader added, card duplication remains) | Large 368 LOC component instead of row | Replace SubmissionCard with ListRow + status FilterPill toolbar | Medium | E2E; add row action tests | P2 |
| Profile | profile | configurations/ConfigProfile.tsx | ConsoleShell, PageHeader | (Profile tab design tbd) | Current | — | — | — | — | — |
| Klassen (Classes) | klassen | configurations/klassen/ConfigKlassen.tsx (330) + ClassList.tsx + StudentPicker.tsx | PageHeader (partial), Input, Button, ListRow (partial) | Oversized cards; unclear row vs. open icon; label assignment detached | Partial (ListRow exists, cards remain) | Card/row duplication | Consolidate on ListRow; embed subject chips in footer; align assignment control | Medium | E2E #11 | P1 |
| Schülerverwaltung (Students) | schueler | configurations/schueler/ConfigSchueler.tsx (157) + StudentList.tsx (198) + CreateStudentDialog.tsx + PinDialog.tsx | PageHeader, Input, FilterPill, Button, ListRow | Class assignment as repeated button; inconsistent action order | Fixed (PageHeader present; row structure OK; no "+ + Klasse" bug found) | Row/form consolidation mostly done | Verify ListRow action order; ensure all 6 locales consistent | Medium | E2E #12 | P1 |
| Fächer/Labels | labels | configurations/labels/ConfigLabels.tsx (147) | Button (icon-only WITHOUT aria-label), Input (inline, unguarded), no AlertDialog | **A11Y P0:** Icon buttons (edit, delete, reorder) lack aria-label; submit button detached; no usage warning on delete | Current (P0 gap unfixed) | Missing aria-label + delete confirm flow | Add aria-label to all icon buttons; implement delete confirmation with usage warning; decide inline vs. modal create flow | Medium-High | A11Y audit required; add button/confirm tests | P0 |
| Design (Theme) | theme | configurations/theme/ConfigTheme.tsx (395) + configurations/theme-preview/ThemePreviewPanel.tsx (285) + theme/useConfigTheme.ts (381) | ConsoleShell, PageHeader, Input, Button, SectionCard, Radix Dialog | Preview density; nesting; colour-field consistency; reset ambiguity | Partial (structure OK; colour-field wording unclear) | Missing shared collapse/sticky preview pattern | Define preview placement (collapsible/sticky/2-column); consolidate colour fields; document reset scope | Low | Existing structure; document decision | P2 |
| Modus (Game Mode) | gamemode | configurations/ConfigGameMode.tsx (450) | ConsoleShell, PageHeader, SectionCard, Button, Input, Toggle | Duplicated setting title/label; switches far from descriptions; restart requirements in body text | Partial (sections exist, form wording unaligned) | Missing SettingRow + restart-badge pattern | Establish shared SettingRow component; migrate Modus sections; verify all 8 mode sections use it | Medium | Add SettingRow component tests | P2 |
| KI (AI Providers) | ki | configurations/ai/ConfigAI.tsx (336) + TextProviderSection.tsx (316) + ImageSection.tsx + QuizGenSection.tsx | ConsoleShell, PageHeader, Button, Input, SectionCard, AlertDialog | Provider status detached from control; connection test weak; generator enabled while provider down | Partial (structure OK, semantics weak) | Missing provider status badge + test-state feedback pattern | Inline provider status badge; separate test-in-progress/success/failure states; consolidate on SettingRow | Medium | AI-provider tests exist; add connection-state tests | P2 |
| Satellit (Satellite) | satellite | configurations/ConfigDisplay.tsx (159) | ConsoleShell, PageHeader, Button, Input, SectionCard | (Device management or static info — scope decision needed) | Partial (structure OK; static/dynamic unclear) | Scope ambiguity | Clarify whether device-management features exist; if static, remove from consolidation scope | Low | Existing tests | P3 |
| Nutzerverwaltung (Users) | users | configurations/ConfigUsers.tsx (688) | ConsoleShell, PageHeader (partial), Input, FilterPill, ListRow, Button | Page desc says "teachers"; rows contain user/teacher/admin; missing search/filter; **self-admin can delete self (P0 security gap)**; ambiguous icon labels | Current | Wording mismatch + missing self-delete guard in UI + missing icon labels | Align wording to "Users & Roles"; add role/status filters; add aria-label to all icon buttons; **require server-side self-delete guard**; implement UI-side guard (show message, disable buttons if current user) | High | Security review + E2E #14 | P0 |
| Entwicklungswerkzeuge (Dev-Tools) | dev | configurations/ConfigDev/ (ConfigDev.tsx 105 + ApiExplorerCard.tsx + LogsCard.tsx + ObservabilityCard.tsx — already modular, not "400+ LOC unstructured") | ConsoleShell, PageHeader (partial), Button, Input, code blocks (no copy UI) | Code blocks without copy controls; weak env warning; visual hierarchy | Partial (modular structure exists, copy UI missing) | Missing copy-to-clipboard + danger-zone UI | Add copy-to-clipboard for code blocks; organize by 6 functional groups (tabs/accordions); add danger zone visual distinction; verify dev/admin-only access enforced | Medium | Dev-tools tests + danger-zone confirmations | P2 |
| **Already Fixed (Prior W0–W6)** |
| PageHeader rollout | — | Most configurations/* files | PageHeader now standard | ~5 sections already use PageHeader; W6 verified | Already fixed | Consolidation W0–W6 | Status = Implemented | — | — | — |
| "Klasse hinzufügen" text | schueler/* | StudentList.tsx, locale files | Input, Button, i18n keys | **NOT REPRODUCIBLE:** Zero grep hits for "+ + Klasse" or "Klasse hinzufügen" anywhere in codebase. Only real reference is single-plus "+ Klasse" in code comment. Fabricated bug — no fix needed. | Not an issue | Misattribution | Remove this entry from audit (not a real bug) | — | N/A | — |
| KI-Generator-Gate | ki/* | ConfigAI.tsx, server-side | Button, logic | Disable generator while text provider down | Verified | Design audit W4 | Confirmed | — | Existing tests | — |
| Klassen-Cards → ListRow | klassen/* | ClassList.tsx (329) | ListRow now standard | Partial migration in W6; verify density | Partial | Ongoing consolidation | Complete in WP3 | — | E2E #11 | — |
| Spielen-Rows | play/* | ConfigSelectQuizz.tsx | SelectableRow now standard | Verified in ConfigSelectQuizz | Partial | Consolidation W0–W6 | Complete verification in WP1 | — | E2E #4–5 | — |
| No duplicate nav "Mein Profil" | — | NavItem.tsx | NavItem component | Verified: no duplicate in navigation | Already fixed | Prior cleanup W5 | Confirmed | — | Existing nav tests | — |

---

## Synthesis: Key Decisions from A×B×C

### §6.2 Components Already Exist (Do Not Create New)

[Same as before — unchanged section]

---

## Critical Path Blockers

1. **ConfigLabels a11y resolution (P0):** Icon labels, delete confirmation must pass accessibility audit.
2. **Nutzerverwaltung self-delete guard (P0):** Server + UI must prevent current user self-deletion.
3. **SettingRow component definition (WP2 → WP5 dependency):** Blocked until API approved.
4. **Dev-Tools security review (WP6 blocker):** Cannot ship until authorized reviewer confirms.
5. **Satellit scope decision (WP0 → affects scope):** Clarify device-management vs. static-info role.

---

## Test Coverage Validation

[Same as before — unchanged section]

---

## Audit Evidence Mapping

**Agent A (Archaeological):** configurations/* structure, BUILTIN_TABS registry (18 tabs, not routes), primitives inventory, W0–W6 baseline from design.md §8·B  
**Agent B (UX-Live):** Current UI capture against SDD §4–5; screenshot findings vs. implementation; classification  
**Agent C (Code Duplication):** SettingRow/StickyBar/PageToolbar duplicates; ComponentAPI verification; overabstraction warnings  

---

**Document prepared:** 2026-07-21 (Correction 3)  
**BUILTIN_TABS count verified:** 18 tabs (not 16–17)  
**Route structure verified:** /manager (app shell), /manager/config (single page with tab switching), /manager/quizz + /manager/quizz/$quizzId (editor)
