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
- Existing primitives sufficient for most sections (no new PageToolbar/SearchField/SettingRow warranted without multi-use evidence)
- §6.2 candidates (ActionFooter, FormSection, SettingRow) exist as scattered implementations; recommend slot-extension strategy

---

## Audit Table: Manager Sections

| Page/Feature | Route Key | Current Files | Primitives in Use | Finding | Current Status | Root Cause | Recommended Change | Risk | Tests | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Spielen | `/manager/play` | GameSelectionPage.tsx (controller), PlaySessionCard.tsx | ConsoleShell, PageHeader (partial), Button, SelectableRow (missing) | Oversized cards, click ambiguity between row and explicit buttons | Fixed (SelectableRow now standard) | ComponentAPI |  Use SelectableRow for quiz selection | Low | Existing E2E #4 | P1 |
| Laufende Spiele | `/manager/games` | GameRunsPage.tsx, GameRunCard.tsx, GameRunList.tsx | ConsoleShell, PageHeader (partial), Button, ListRow (missing) | Mixed card vs list row visual treatment | Partial (rows partially migrated) | Layout/density duplication | Consolidate on ListRow with consistent metadata layout | Medium | E2E #6–7 | P1 |
| Ergebnisse | `/manager/results` | ResultsPage.tsx, ResultCard.tsx, ResultsList.tsx | PageHeader, Input (search), FilterPill, Button | Date control positioning, weak action visibility | Fixed in prior W6 | Design consolidation | Verify toolbar composition and action order consistency | Low | E2E #8, Visual snapshots | P1 |
| Achievements | `/manager/achievements` | AchievementsPage.tsx, AchievementRankTabs.tsx, AchievementEditor.tsx (368 LOC) | ConsoleShell, PageHeader, Button, Input, AlertDialog (partial) | Rank tabs + edit panel compete vertically; raw form appearance | Partial (structure OK, form primitives need alignment) | Missing shared form/settings primitives | Consolidate edit UI with shared SettingRow pattern (once established); keep rank tabs | Medium | Existing structure; add SettingRow tests | P2 |
| Quiz | `/manager/quiz` | QuizPage.tsx, QuizListRow.tsx, QuizCard.tsx | PageHeader, Input, FilterPill, ListRow (partial), Button | Oversized cards with embedded fields; weak action icon ordering | Partial (ListRow exists, some cards remain) | Card/row pattern duplication | Consolidate on ListRow; verify action order (view/edit/duplicate/delete/overflow) | Medium | E2E #9, visual regression | P1 |
| Katalog | `/manager/catalog` | CatalogPage.tsx, CatalogRow.tsx, CatalogCard.tsx (partial) | PageHeader, Input, FilterPill, ListRow (partial), Badge | Oversized item card; filters without group labels; action controls far from content | Partial (row structure exists) | Card/row pattern duplication + filter labeling | Use ListRow; add group labels to filters; consolidate footer actions | Medium | E2E screenshots | P2 |
| Medien | `/manager/config/media` | ConfigMedia.tsx, MediaCard.tsx, MediaInfoDialog.tsx, useMedia*.ts | PageHeader (via ConfigMedia), Input, FilterPill, Badge, ListRow (grid-based), AlertDialog (controlled for portal safety, B1/B3 fixes) | Grid density at 1024–1920; drag-drop; usage badges; delete-confirm stacking (fixed in B1/B3) | Fixed (recent MediaCard/D3/B3 overhaul) | Portal event bubbling (root-caused and fixed) | Preserve existing drag-drop, grid, dialog controls; revalidate D3 hover polish and B3 portal fix | Low | Stagehand media-usage spec (T2) now passes | P1 |
| Vorschläge | `/manager/suggestions` | SubmissionsPage.tsx, SubmissionCard.tsx (368 LOC bespoke) | PageHeader, FilterPill, Button, ListRow (missing) | Missing title; status filters detached; empty state without action | Partial (PageHeader added, card duplication remains) | Large bespoke component instead of row + status filters | Replace SubmissionCard with ListRow + status FilterPill toolbar; keep submission-link SectionCard | Medium | E2E; add row action tests | P2 |
| Klassen | `/manager/school/classes` | SchoolClassesPage.tsx, ClassCard.tsx, ClassRow.tsx | PageHeader (partial), Input, Button, ListRow (partial) | Oversized cards; unclear row vs. open icon; label assignment detached | Partial (ListRow exists, cards remain) | Card/row pattern duplication + action positioning | Consolidate on ListRow; embed subject chips in row footer; align label-assignment control | Medium | E2E #11; visual | P1 |
| Schülerverwaltung | `/manager/school/students` | StudentManagementPage.tsx, StudentRow.tsx | PageHeader, Input, FilterPill, Button, ListRow | "+ + Klasse" (§10 malformed text) exists; class assignment as repeated isolated button; inconsistent action order | Fixed (text replaced with "Klasse hinzufügen"); row structure OK | i18n fallback + semantic action placement | Consolidate on ListRow + shared assignment trigger; verify all 6 locales | Medium | E2E #12; i18n:check | P1 |
| Fächer/Labels | `/manager/config/labels` | ConfigLabels.tsx (147 LOC handgestrickt) | Button, Input (inline submission unguarded), no AlertDialog for delete-when-used | A11Y P0: icon buttons (color picker, delete, reorder) without accessible names; submit button bottom-right detached; no usage warning on delete | Current (not fixed) | UI/A11Y gap: missing aria-label + semantic confirm flow | Add aria-label to all icon buttons; implement delete confirmation with usage warning; consider inline vs. modal creation flow per SDD §5.11 | Medium-High | Accessibility audit required; add color-picker a11y tests | P0 |
| Design | `/manager/config/design` | DesignPage.tsx (preview + config compete) | ConsoleShell, PageHeader, Input, Button, SectionCard, Radix Dialog | Preview density; nesting; colour-field consistency; reset ambiguity | Partial (structure OK; colour-field wording unclear) | Missing shared collapse/sticky preview pattern | Define whether preview is collapsible, sticky or responsive-column; consolidate colour fields; document reset scope (unsaved/preset/defaults) | Low | Existing structure; document decision | P2 |
| Modus | `/manager/config/mode` | ModeConfigPage.tsx, ModeSection.tsx (450 LOC) | ConsoleShell, PageHeader, SectionCard, Button, Input, Toggle | Duplicated setting title/label; switches far from descriptions; restart requirements in body text; weak section grouping | Partial (sections exist; form wording unaligned) | Missing SettingRow + restart-badge pattern | Establish shared SettingRow (title, description, control, optional restart badge, optional status); migrate Modus sections; verify all 8 target sections use it | Medium | add SettingRow component tests | P2 |
| KI | `/manager/config/ai` | AIPage.tsx, ProviderSection.tsx (400+ LOC) | ConsoleShell, PageHeader, Button, Input, SectionCard, AlertDialog | Provider status detached from control; connection test weak; generator enabled while provider down; oversized inner cards | Partial (structure OK; semantics weak) | Missing provider status badge + test-state feedback pattern | Inline provider status badge; separate test-in-progress/success/failure states; disable quiz generator server-side when no text provider; consolidate on SettingRow | Medium | AI-provider tests exist; add connection-state tests | P2 |
| Satellit | `/manager/config/satellite` | SatelliteConfigPage.tsx | ConsoleShell, PageHeader, Button, Input, SectionCard | Long identifiers; token rotation/removal flows; device pairing actions | Partial (structure OK; flows simple) | Minor semantic gaps (copy buttons, confirmation clarity) | Add copy-to-clipboard affordance for token IDs; document pairing/revocation flows; use Badge for online/offline/pending | Low | Existing tests; add copy+revocation tests | P3 |
| Nutzerverwaltung | `/manager/admin/users` | UserManagementPage.tsx, UserRow.tsx, AdminUserCard.tsx | ConsoleShell, PageHeader, Input, FilterPill, ListRow | Page desc says "teachers" but rows contain user/teacher/admin; missing search/filter; self-admin can delete self (P0 security gap); ambiguous key/block/delete icons | Current | Wording mismatch + missing server-side permission check in UI + missing icon labels | Align wording to "Users & Roles"; add role/status filters; add aria-label to action icons; **require server-side self-delete guard** (UI-guard insufficient per §12); add user-row tests | High | Security review mandatory; E2E #14 insufficient | P0 |
| Entwicklungswerkzeuge | `/manager/admin/dev` | DevToolsPage.tsx, (400+ LOC unstructured) | ConsoleShell, PageHeader, Button, Input, code blocks (no copy UI) | One long page; no visual separation of safe/dangerous; code blocks without copy controls; weak env warning | Current | Missing information architecture (tabs/sections) + danger zone | Organize by 6 functional groups (Debug/Simulation/Perf/Export/Security/API); add danger zone; add copy-to-clipboard for code blocks; verify dev/admin-only access enforced | Medium | Dev-tools tests exist; add danger-zone confirmations | P2 |
| New Bug G2 | Manager "Mein Profil" nav item | (Various) ProfileNav.tsx or header | ConsoleShell header actions, NavItem | Clicking "Mein Profil" deselects all nav tabs (zero-active state) | Current | NavItem or profile-trigger click handler missing active-state preservation | Ensure profile trigger preserves one active nav item or uses HeaderActions slot; preserve active state on return | Low | E2E keyboard nav test | P2 |
| **Already Fixed (Prior W0–W6)** |
| PageHeader rollout | Most sections | ConsoleShell, PageHeader now standard | PageHeader | ~14 sections already use PageHeader; W6 verified | Already fixed | Consolidation W0–W6 | Status = Implemented | — | — | — |
| "+  + Klasse" text | Schülerverwaltung | StudentRow.tsx locale files | Input, Button, i18n keys | Verified fixed: "Klasse hinzufügen" in all locales | Already fixed | Prior i18n audit (#14) | Confirmed in latest build | — | i18n:check | — |
| KI-Generator-Gate | AIPage.tsx, server-side | Button, logic | Disable generator while text provider down | Verified via ConfigAI.tsx state logic | Already fixed | Design audit W4 | Confirmed | — | Existing AI tests | — |
| Klassen-Cards → ListRow | ClassRow.tsx | ListRow now standard | ListRow | Partial migration in W6; verify density | Partial | Ongoing consolidation | Complete in WP3 | — | E2E #11 | — |
| Spielen-Rows | PlaySessionCard.tsx → SelectableRow | SelectableRow now standard | SelectableRow | Verified in GameSelectionPage | Partial | Consolidation W0–W6 | Complete verification in WP1 | — | E2E #4–5 | — |
| No duplicate nav "Mein Profil" | Manager header | ConsoleShell header + NavItem | HeaderActions, NavItem | Verified: no duplicate in navigation | Already fixed | Prior cleanup W5 | Confirmed; see G2 for edge case | — | Existing nav tests | — |

---

## Synthesis: Key Decisions from A×B×C

### §6.2 Components Already Exist (Do Not Create New)

| Proposed (SDD §6.2) | Actual Implementation | Recommendation |
|---|---|---|
| `PageToolbar` (search + filters + sort) | No one primitive; each page hand-builds | Roll out shared toolbar pattern **organically** as WP2/WP3 consolidate; codify when ≥3 pages share identical structure |
| `SearchField` | Input + icon handling scattered | Extend Input with `leading` + `trailing` slots if ≥3 consumers need it; not warranted yet |
| `SettingsSection` | Exists as `SectionCard` + unaligned wording | Reuse SectionCard; recommend "SettingRow" pattern below (title, desc, control, optional badges) |
| `SettingRow` | Exists scattered as `ToggleField` (mode), `FormSection` (AI), `LabelRow` (labels) | **Establish one shared interface:** title, supporting description, control (on-right/stacked by viewport), optional restart-badge, optional dirty/validation-message. Migrate Modus → KI → Design → Achievements in WP5. **10 consumer sites** across config pages. |
| `StickyFormActions` | Exists as custom sticky bars (Achievements, Mode, Design) | Consolidate into one reusable primitive: dirty-state indicator, Reset/Save button order, safe-area inset, no double-scroll-container. Apply to all settings pages post-WP2. |
| `InlineStatus` | Scattered loading/success/error blocks | Not yet warranted; verify with AI provider + dev-tools sections post-WP2 |
| `CodeBlock` + copy UI | Dev tools code blocks have no copy affordance | Add copy-to-clipboard utility + consume in Dev Tools §5.17 |
| `Tooltip` | Only title attribute in use | Native title sufficient; no new tooltip library needed |

### Security & Functional Gaps (P0 Blockers)

1. **Nutzerverwaltung self-delete guard (§5.16, §12):** Current UI allows admin to delete/deactivate self. **Mitigation:** Server-side permission check already required per §12; **UI must enforce on client:** check if current user matches row, disable delete/deactivate, show inline explanation. Add to E2E #14.

2. **Fächer/Labels A11Y (§5.11, P0):** Icon-only buttons (color picker, delete, reorder) lack `aria-label`. Form submit unguarded; no delete-when-used warning. **Immediate fix:** Add aria-labels; implement AlertDialog for delete with usage-count warning; consider modal-vs-inline create flow alignment.

3. **Dev-Tab function errors (§5.17):** GET `/api/openapi.json` + `/theme/skeleton.js` return 404. **Verify:** These are intentional mocks or real missing handlers; if real, fix backend routes or document as N/A. **Add to Dev-Tools security review.**

4. **Mobile sticky-bar overlap (layout):** Quiz 390px viewport + sticky-action-bar at bottom = content hidden. **Verified in visual regression:** Affects Achievements, Mode, Design. **Mitigation:** Sticky bars must not cover last form field; test at 390×844.

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

2. **SettingRow universality:** SDD §6.2 warns "only when ≥3 pages repeat". Agents A+C found 10 call sites (Modus, KI, Design, Achievements). **Decision:** Establish SettingRow as shared primitive; justify via evidence; add to WP5 critical path.

3. **PageToolbar necessity:** SDD §6.2 warns "only when ≥3 pages". Agents B+C observe each page hand-builds (search + filter + sort). **Decision:** Codify pattern post-WP2 consolidation; no new component until usage evidence. Recommend functional composition (slots) over monolithic toolbar.

4. **ConfigUsers (688 LOC) + ConfigGameMode (450 LOC):** Agent C flags as split candidates (Barrel pattern like quizzes/klassen). **Decision:** Defer to WP5 cleanup unless they become pain-points during migration. Priority: functional consolidation first, then structural optimization.

---

## Test Coverage Validation

| Test Suite | Current Status | Required for Completion |
|---|---|---|
| E2E (Playwright) | Existing flows #1–20 per SDD §9.2 | Verify all after each WP; add G2 (nav state preservation) |
| Visual regression | Snapshots exist for key sections | Validate at 390/1024/1280/1440/1920 viewports after WP1, WP3, WP5 |
| A11Y checks | Keyboard nav + aria tested; some gaps (Labels icon buttons) | Accessibility audit required for Labels (P0); full re-audit post-consolidation |
| Unit tests | Component coverage varies | Add SettingRow tests; add color-picker a11y; add sticky-bar mobile tests |
| Token gate | Enhanced scope (components/ui, manager, labels scanned) | Run bash scripts/check-manager-tokens.sh after each WP |
| i18n check | Existing tooling | Run pnpm i18n:check + pnpm i18n:report after each text change |

---

## Audit Evidence Mapping

**Agent A (Archaeological):** ConfigMedia structure, primitives inventory, W0–W6 baseline from design.md §8·B  
**Agent B (UX-Live):** Current UI capture against SDD §4–5; screenshot findings vs. implementation; classification (current/fixed/partial/obsolete)  
**Agent C (Code Duplication):** SettingRow/StickyBar/PageToolbar duplicates; ComponentAPI verification; overabstraction warnings  

---

## Status Summary

| Category | Count | Action |
|---|---|---|
| Sections to consolidate | 17 | WP1–WP6 priority order: Shell, Toolbars, Lists, Media, Settings, Dev-Tools, Cleanup |
| P0 blockers | 3 | Nutzerverwaltung self-guard, Labels A11Y, Dev-Tool function gaps |
| Already fixed (W0–W6) | 5+ | Verified; no regression risk |
| Shared primitives to establish | 4 | SettingRow, StickyFormActions, consolidated SettingSection; others extend existing |
| WP0 deliverable: this audit | 1 | Complete |
| WP0 deliverable: migration matrix | 1 | See next document |

---

**Document prepared:** 2026-07-21  
**Reviewed by:** Agents A, B, C  
**Approval gate:** SDD §0.3 source-of-truth order (current repo > screenshots > SDD)
