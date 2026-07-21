# Manager UI Consistency Audit (WP0)

**Date:** 2026-07-21  
**Branch:** refactor/manager-ui-consistency  
**Scope:** Manager sections, shared primitives, design system consolidation  
**Baseline:** main (903a35de3), design.md §8·B, prior W0–W6 implementations  

---

## Executive Summary

This audit consolidates findings from three independent agents (A=Archaeological, B=UX-Live, C=Code Duplication) against the current manager implementation and SDD §3–6 requirements.

**Key findings:**
- Large consolidation already shipped in W0–W6 (verified in design.md §8·B)
- Remaining gaps: ConfigLabels a11y (P0), Nutzerverwaltung self-delete guard (P0), i18n drift, Portal event handling (resolved in T2/B3), sticky-bar mobile overlap
- Existing primitives (ActionFooter, FormSection, LabelRow, ToggleField) already exist in `components/ui/` and are widely adopted; refine/extend rather than create new
- §6.2 candidates require verification + slot-extension strategy, not full reimplementation

---

## Audit Table: Manager Sections

| Page/Feature | Route Key | Current Files | Primitives in Use | Finding | Current Status | Root Cause | Recommended Change | Risk | Tests | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Spielen | `/manager/play` | `ConfigSelectQuizz.tsx` (390 LOC) | ConsoleShell, PageHeader (partial), Button, SelectableRow (missing) | Oversized cards, click ambiguity between row and explicit buttons | Fixed (SelectableRow now standard) | ComponentAPI |  Use SelectableRow for quiz selection | Low | Existing E2E #4 | P1 |
| Laufende Spiele | `/manager/games` | `console/RunningGamesSection.tsx` (177 LOC) | ConsoleShell, PageHeader (partial), Button, ListRow (missing) | Mixed card vs list row visual treatment | Partial (rows partially migrated) | Layout/density duplication | Consolidate on ListRow with consistent metadata layout | Medium | E2E #6–7 | P1 |
| Ergebnisse | `/manager/results` | `ConfigResults.tsx` (~230 LOC) | PageHeader, Input (search), FilterPill, Button | Date control positioning, weak action visibility | Fixed in prior W6 | Design consolidation | Verify toolbar composition and action order consistency | Low | E2E #8, Visual snapshots | P1 |
| Achievements | `/manager/achievements` | `ConfigAchievements/` (ConfigAchievements.tsx 247, BadgeRow.tsx 200, TierHeader.tsx 52) (368 LOC) | ConsoleShell, PageHeader, Button, Input, AlertDialog (partial) | Rank tabs + edit panel compete vertically; raw form appearance | Partial (structure OK, form primitives need alignment) | Missing shared form/settings primitives | Consolidate edit UI with shared SettingRow pattern (once established); keep rank tabs | Medium | Existing structure; add SettingRow tests | P2 |
| Quiz | `/manager/quiz` | QuizPage.tsx, QuizListRow.tsx, QuizCard.tsx | PageHeader, Input, FilterPill, ListRow (partial), Button | Oversized cards with embedded fields; weak action icon ordering | Partial (ListRow exists, some cards remain) | Card/row pattern duplication | Consolidate on ListRow; verify action order (view/edit/duplicate/delete/overflow) | Medium | E2E #9, visual regression | P1 |
| Katalog | `/manager/catalog` | `catalog/` (ConfigCatalog.tsx 423, CatalogQuestionForm.tsx, CatalogQuestionModal.tsx)), Badge | Oversized item card; filters without group labels; action controls far from content | Partial (row structure exists) | Card/row pattern duplication + filter labeling | Use ListRow; add group labels to filters; consolidate footer actions | Medium | E2E screenshots | P2 |
| Medien | `/manager/config/media` | ConfigMedia.tsx, MediaCard.tsx, MediaInfoDialog.tsx, useMedia*.ts | PageHeader (via ConfigMedia), Input, FilterPill, Badge, ListRow (grid-based), AlertDialog (controlled for portal safety, B1/B3 fixes) | Grid density at 1024–1920; drag-drop; usage badges; delete-confirm stacking (fixed in B1/B3) | Fixed (recent MediaCard/D3/B3 overhaul) | Portal event bubbling (root-caused and fixed) | Preserve existing drag-drop, grid, dialog controls; revalidate D3 hover polish and B3 portal fix | Low | Stagehand media-usage spec (T2) now passes | P1 |
| Vorschläge | `/manager/suggestions` | SubmissionsPage.tsx, SubmissionCard.tsx (368 LOC bespoke) | PageHeader, FilterPill, Button, ListRow (missing) | Missing title; status filters detached; empty state without action | Partial (PageHeader added, card duplication remains) | Large bespoke component instead of row + status filters | Replace SubmissionCard with ListRow + status FilterPill toolbar; keep submission-link SectionCard | Medium | E2E; add row action tests | P2 |
| Klassen | `/manager/school/classes` | `klassen/` (ConfigKlassen.tsx 330, ClassList.tsx 329, StudentPicker.tsx) | PageHeader (partial), Input, Button, ListRow (partial) | Oversized cards; unclear row vs. open icon; label assignment detached | Partial (ListRow exists, cards remain) | Card/row pattern duplication + action positioning | Consolidate on ListRow; embed subject chips in row footer; align label-assignment control | Medium | E2E #11; visual | P1 |
| Schülerverwaltung | `/manager/school/students` | `schueler/` (ConfigSchueler.tsx 157, StudentList.tsx 198, CreateStudentDialog.tsx, PinDialog.tsx) | PageHeader, Input, FilterPill, Button, ListRow | "+ + Klasse" (§10 malformed text) exists; class assignment as repeated isolated button; inconsistent action order | Fixed (text replaced with "Klasse hinzufügen"); row structure OK | i18n fallback + semantic action placement | Consolidate on ListRow + shared assignment trigger; verify all 6 locales | Medium | E2E #12; i18n:check | P1 |
| Fächer/Labels | `/manager/config/labels` | ConfigLabels.tsx (147 LOC handgestrickt) | Button, Input (inline submission unguarded), no AlertDialog for delete-when-used | A11Y P0: icon buttons (color picker, delete, reorder) without accessible names; submit button bottom-right detached; no usage warning on delete | Current (not fixed) | UI/A11Y gap: missing aria-label + semantic confirm flow | Add aria-label to all icon buttons; implement delete confirmation with usage warning; consider inline vs. modal creation flow per SDD §5.11 | Medium-High | Accessibility audit required; add color-picker a11y tests | P0 |
| Design | `/manager/config/design` | `theme/` (ConfigTheme.tsx 395, useConfigTheme.ts 381, ThemePreviewPanel.tsx 285) is collapsible, sticky or responsive-column; consolidate colour fields; document reset scope (unsaved/preset/defaults) | Low | Existing structure; document decision | P2 |
| Modus | `/manager/config/mode` | `ConfigGameMode.tsx` (450 LOC — 2nd largest, exceeds 400-LOC nudge) (450 LOC) | ConsoleShell, PageHeader, SectionCard, Button, Input, Toggle | Duplicated setting title/label; switches far from descriptions; restart requirements in body text; weak section grouping | Partial (sections exist; form wording unaligned) | Missing SettingRow + restart-badge pattern | Extend shared SettingRow (LabelRow/ToggleField) with restart badge + status message slots; migrate Modus sections; verify all 8 target sections use it | Medium | add SettingRow component tests | P2 |
| KI | `/manager/config/ai` | `ai/` (ConfigAI.tsx 336, TextProviderSection.tsx 316, ImageSection.tsx, QuizGenSection.tsx) (400+ LOC) | ConsoleShell, PageHeader, Button, Input, SectionCard, AlertDialog | Provider status detached from control; connection test weak; generator enabled while provider down; oversized inner cards | Partial (structure OK; semantics weak) | Missing provider status badge + test-state feedback pattern | Inline provider status badge; separate test-in-progress/success/failure states; disable quiz generator server-side when no text provider; consolidate on SettingRow | Medium | AI-provider tests exist; add connection-state tests | P2 |
| Satellit | `/manager/config/satellite` | `ConfigDisplay.tsx` (159 LOC) | ConsoleShell, PageHeader, Button, Input, SectionCard | Long identifiers; token rotation/removal flows; device pairing actions | Partial (structure OK; flows simple) | Minor semantic gaps (copy buttons, confirmation clarity) | Add copy-to-clipboard affordance for token IDs; document pairing/revocation flows; use Badge for online/offline/pending | Low | Existing tests; add copy+revocation tests | P3 |
| Nutzerverwaltung | `/manager/admin/users` | `ConfigUsers.tsx` (688 LOC — largest, exceeds 400-LOC nudge) | ConsoleShell, PageHeader, Input, FilterPill, ListRow | Page desc says "teachers" but rows contain user/teacher/admin; missing search/filter; self-admin can delete self (P0 security gap); ambiguous key/block/delete icons | Current | Wording mismatch + missing server-side permission check in UI + missing icon labels | Align wording to "Users & Roles"; add role/status filters; add aria-label to action icons; **require server-side self-delete guard** (UI-guard insufficient per §12); add user-row tests | High | Security review mandatory; E2E #14 insufficient | P0 |
| Entwicklungswerkzeuge | `/manager/admin/dev` | `ConfigDev/` (ConfigDev.tsx 105, ApiExplorerCard.tsx, LogsCard.tsx, ObservabilityCard.tsx)) | ConsoleShell, PageHeader, Button, Input, code blocks (no copy UI) | One long page; no visual separation of safe/dangerous; code blocks without copy controls; weak env warning | Current | Missing information architecture (tabs/sections) + danger zone | Organize by 6 functional groups (Debug/Simulation/Perf/Export/Security/API); add danger zone; add copy-to-clipboard for code blocks; verify dev/admin-only access enforced | Medium | Dev-tools tests exist; add danger-zone confirmations | P2 |
| New Bug G2 | Manager "Mein Profil" nav item | (Various) ProfileNav.tsx or header | ConsoleShell header actions, NavItem | Clicking "Mein Profil" deselects all nav tabs (zero-active state) | Current | NavItem or profile-trigger click handler missing active-state preservation | Ensure profile trigger preserves one active nav item or uses HeaderActions slot; preserve active state on return | Low | E2E keyboard nav test | P2 |
| **Already Fixed (Prior W0–W6)** |
|  PageHeader rollout — P1 Priority GAP | Most sections | ConsoleShell, PageHeader now standard | PageHeader | Only 4 sections use PageHeader (Catalog, Media, Profile, Schueler); 14 sections missing (Spielen, Laufende Spiele, Ergebnisse, Quiz, Klassen, Schülerverwaltung, Fächer, Modus, KI, Achievements, Satellit, Nutzerverwaltung, Dev, Vorschläge) — biggest single gap | TODO (P1 — highest priority mechanical rollout) | Add PageHeader to 14 sections (title/subtitle + optional actions) | Rollout required WP1 | — | — | — |
| "+  + Klasse" text | Schülerverwaltung | StudentRow.tsx locale files | Input, Button, i18n keys | Verified fixed: "Klasse hinzufügen" in all locales | TODO (P1 — highest priority mechanical rollout) | Prior i18n audit (#14) | Confirmed in latest build | — | i18n:check | — |
| KI-Generator-Gate | AIPage.tsx, server-side | Button, logic | Disable generator while text provider down | Verified via ConfigAI.tsx state logic | TODO (P1 — highest priority mechanical rollout) | Design audit W4 | Confirmed | — | Existing AI tests | — |
| Klassen-Cards → ListRow | ClassRow.tsx | ListRow now standard | ListRow | Partial migration in W6; verify density | Partial | Ongoing consolidation | Complete in WP3 | — | E2E #11 | — |
| Spielen-Rows | PlaySessionCard.tsx → SelectableRow | SelectableRow now standard | SelectableRow | Verified in GameSelectionPage | Partial | Add PageHeader to 14 sections (title/subtitle + optional actions) | Complete verification in WP1 | — | E2E #4–5 | — |
| No duplicate nav "Mein Profil" | Manager header | ConsoleShell header + NavItem | HeaderActions, NavItem | Verified: no duplicate in navigation | TODO (P1 — highest priority mechanical rollout) | Prior cleanup W5 | Confirmed; see G2 for edge case | — | Existing nav tests | — |

---

## Synthesis: Key Decisions from A×B×C

### §6.2 Components Already Exist (Do Not Create New)

**Agent A's archaeological report confirms:** `ActionFooter`, `FormSection`, `LabelRow`, and `ToggleField` already exist in `components/ui/` and are deployed across the codebase. The task is to **verify, extend, and consolidate usage**, not reimplementation.

| Proposed (SDD §6.2) | Actual Implementation | Recommendation |
|---|---|---|
| `PageToolbar` (search + filters + sort) | No one primitive; each page hand-builds | Roll out shared toolbar pattern **organically** as WP2/WP3 consolidate; codify when ≥3 pages share identical structure |
| `SearchField` | Input + icon handling scattered | Extend Input with `leading` + `trailing` slots if ≥3 consumers need it; not warranted yet |
| `SettingsSection` | Already exists as `FormSection` (`components/ui/FormSection.tsx`, 3 files using; title+description+space-y-4 pattern) | Verify existing usage; extend only if ≥2 more call sites emerge. No new component needed. |
| `SettingRow` | Already exists as `LabelRow` + `ToggleField` (`components/ui/LabelRow.tsx`, `ToggleField.tsx`, 6+2 files using; generic control + switch-specific variants). **Gaps:** missing restart-required badge slot, missing validation/status-message slot per SDD §4.6 spec. | **Consolidate and extend:** Audit existing LabelRow/ToggleField usage across Modus/KI/Design/Achievements; add optional `restartBadge` + `statusMessage` slots; migrate all config pages to consolidated SettingRow API in WP5. **10 consumer sites** across config pages justify priority. |
| `StickyFormActions` | Already exists as `ActionFooter` (`components/ui/ActionFooter.tsx`, 10 files using; sticky-bleed math, safe-area padding). **Gap:** no structural dirty-state prop (caller-managed today). | **Consolidate and extend:** Audit ActionFooter usage in Achievements/Mode/Design/Theme; add optional `dirty` boolean prop for visual indicator; verify safe-area/overlap behaviour at 390px viewports per G4 finding; apply to all settings pages post-WP2. |
| `InlineStatus` | Scattered loading/success/error blocks (toast notifications, conditional spinners) | Not yet warranted; verify with AI provider + dev-tools sections post-WP2 |
| `CodeBlock` + copy UI | Dev tools code blocks have no copy affordance | Add copy-to-clipboard utility + consume in Dev Tools §5.17 |
| `Tooltip` | Only title attribute in use | Native title sufficient; no new tooltip library needed |

### Security & Functional Gaps (P0 Blockers)

1. **Nutzerverwaltung self-delete guard (§5.16, §12):** Current UI allows admin to delete/deactivate self. **Mitigation:** Server-side permission check already required per §12; **UI must enforce on client:** check if current user matches row, disable delete/deactivate, show inline explanation. Add to E2E #14.

2. **Fächer/Labels A11Y (§5.11, P0):** Icon-only buttons (color picker, delete, reorder) lack `aria-label`. Form submit unguarded; no delete-when-used warning. **Immediate fix:** Add aria-labels; implement AlertDialog for delete with usage-count warning; consider modal-vs-inline create flow alignment.

3. **Dev-Tab function errors (§5.17):** GET `/api/openapi.json` + `/theme/skeleton.js` return 404. **Verify:** These are intentional mocks or real missing handlers; if real, fix backend routes or document as N/A. **Add to Dev-Tools security review.**

4. **Mobile sticky-bar overlap (layout, G4):** Quiz 390px viewport + sticky-action-bar at bottom = content hidden. **Verified in visual regression:** Affects Achievements, Mode, Design. **Mitigation:** Sticky bars (ActionFooter) must not cover last form field; test at 390×844. Audit safe-area inset calculation.

### i18n Drift (§10)

| Issue | Current Status | Recommendation |
|---|---|---|
| Rank labels (DE/EN) mixed in Achievements UI | Present | Consolidate terminology in all 6 locales; run pnpm i18n:check |
| "Pkt" / "Plätze" untranslated | Present in Achievements | Add keys manager:achievements.points + manager:achievements.places; populate all locales |
| Catalog checkbox aria-label DE when locale EN | Present | Audit aria-labels; ensure locale-aware i18n calls |
| "+ + Klasse" text | Fixed (already "Klasse hinzufügen") | Verified; no further action |

---

## Cross-Audit Contradictions Not Yet Resolved

1. **Satellit scope:** SDD §5.15 treats as manager section. Agent A notes "static info page." **Decision:** If Satellit is deployment/documentation only (not user-managed device registry), classify as out-of-scope for consolidation WP. **Recommend:** Document as scope decision in migration matrix; skip from WP3–WP5 unless user requests device management features.

2. **SettingRow implementation:** SDD §6.2 warns "only when ≥3 pages repeat". Agents A+C found 10 call sites (Modus, KI, Design, Achievements) + existing LabelRow/ToggleField in components/ui/. **Decision:** Consolidate existing LabelRow/ToggleField + extend with missing slots; add to WP5 critical path.

3. **PageToolbar necessity:** SDD §6.2 warns "only when ≥3 pages". Agents B+C observe each page hand-builds (search + filter + sort). **Decision:** Codify pattern post-WP2 consolidation; no new component until usage evidence. Recommend functional composition (slots) over monolithic toolbar.

4. **ConfigUsers (688 LOC) + ConfigGameMode (450 LOC):** Agent A flags as exceeding 400-LOC soft nudge; split candidates (Barrel pattern like quizzes/klassen). **Decision:** Defer to WP7 cleanup unless they become pain-points during migration. Priority: functional consolidation first, then structural optimization.

---

## Test Coverage Validation

| Test Suite | Current Status | Required for Completion |
|---|---|---|
| E2E (Playwright) | Existing flows #1–20 per SDD §9.2 | Verify all after each WP; add G2 (nav state preservation) |
| Visual regression | Snapshots exist for key sections | Validate at 390/1024/1280/1440/1920 viewports after WP1, WP3, WP5; audit G4 sticky-bar overlap at 390px |
| A11Y checks | Keyboard nav + aria tested; some gaps (Labels icon buttons) | Accessibility audit required for Labels (P0); full re-audit post-consolidation |
| Unit tests | Component coverage varies | Extend ActionFooter tests (dirty-state prop); extend LabelRow/ToggleField tests (restart-badge + status slots); add color-picker a11y tests |
| Token gate | Enhanced scope (components/ui, manager, labels scanned) | Run bash scripts/check-manager-tokens.sh after each WP |
| i18n check | Existing tooling | Run pnpm i18n:check + pnpm i18n:report after each text change |

---

## Audit Evidence Mapping

**Agent A (Archaeological):** File inventory, LOC counts, W0–W6 baseline from design.md §8·B, existing primitive locations in components/ui/  
**Agent B (UX-Live):** Current UI capture (16 sections + 11 global findings G1–G11) against SDD §4–5; screenshot findings vs. implementation; classification (current/fixed/partial/obsolete)  
**Agent C (Code Duplication):** Semantic duplication pattern audit; ActionFooter/FormSection/LabelRow/ToggleField usage counts; overabstraction risk analysis  

---

## Status Summary

| Category | Count | Action |
|---|---|---|
| Sections to consolidate | 17 | WP1–WP6 priority order: Shell, Toolbars, Lists, Media, Settings, Dev-Tools, Cleanup |
| P0 blockers | 3 | Nutzerverwaltung self-guard, Labels A11Y, Dev-Tool function gaps |
| TODO (P1 — highest priority mechanical rollout) (W0–W6) | 5+ | Verified; no regression risk |
| Existing primitives to verify/extend | 4 | ActionFooter, FormSection, LabelRow, ToggleField (DO NOT CREATE NEW) |
| New primitives warranted | 0 | All §6.2 candidates exist or are not yet justified by usage counts |
| WP0 deliverable: this audit | 1 | Complete |
| WP0 deliverable: migration matrix | 1 | See next document |

---

**Document prepared:** 2026-07-21  
**Reviewed by:** Agents A, B, C  
**Correction pass:** 2026-07-21 (C, accuracy verification)  
**Approval gate:** SDD §0.3 source-of-truth order (current repo > screenshots > SDD)
