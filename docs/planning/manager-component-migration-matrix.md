# Manager Component Migration Matrix (WP0 - Correction 3)

**Document:** Component consolidation plan for manager sections  
**Date:** 2026-07-21 (Correction 3)  
**Verified:** All 18 manager sections are BUILTIN_TABS within single /manager/config route (not separate routes)  
**Wave order:** WP1 (Shell) → WP2 (Toolbars) → WP3 (Lists) → WP4 (Media+Labels a11y) → WP5 (Settings) → WP6 (Dev-Tools) → WP7 (Cleanup)  

---

## How to Use This Matrix

Each row represents one manager section (tab). The columns show:
- **Actual files:** Real paths in the repo under configurations/
- **Current primitives:** What components/patterns are actually used now
- **Target primitives:** What SDD §6 recommends using
- **Required changes:** The diff strategy to get there
- **Tests:** What must pass post-migration
- **Status:** Migration readiness

---

## Section: Spielen (Play / Quiz Selection)

| Field | Value |
|---|---|
| **Tab key** | play |
| **Actual files** | `configurations/ConfigSelectQuizz.tsx` (390) |
| **Current primitives** | ConsoleShell (layout), SelectableRow (already adopted), Button (start action) |
| **Target primitives** | ConsoleShell (unchanged), PageHeader, SelectableRow (verified in use), consistent action bar |
| **Required changes** | 1. Add PageHeader title + subtitle (SDD §5.1). 2. Verify radiogroup semantics. 3. Ensure "Spiel starten" disabled until selection made. 4. Keep solo-link secondary. 5. Verify keyboard arrow selection within SelectableRow. |
| **Tests** | E2E #4–5: Select via click + keyboard, start game, cancel flow. Visual: 1920/1440/1024/390 viewports. Keyboard: SelectableRow arrow nav. |
| **Status** | **Partial** — SelectableRow already in place; verify PageHeader + keyboard nav. WP1 (shell) → WP3 validation. |
| **Risk** | Low — SelectableRow pattern proven. |

---

## Section: Laufende Spiele (Running Games)

| Field | Value |
|---|---|
| **Tab key** | running |
| **Actual files** | `components/console/RunningGamesSection.tsx` (177) |
| **Current primitives** | ConsoleShell, Button (end-game/mirror), manual status representation |
| **Target primitives** | ConsoleShell, PageHeader, ListRow (metadata: quiz, PIN, players, status badge, elapsed time), destructive AlertDialog for "Beenden" |
| **Required changes** | 1. Add PageHeader. 2. Replace manual card layout with ListRow + status badge. 3. Implement destructive "Beenden" flow (confirm dialog + Portal-safe pattern). 4. Keep "Mirror"/"Display" secondary actions. 5. Use semantic status badges. |
| **Tests** | E2E #6–7: List games, mirror action, beenden → confirm → cancel restore selection. Visual: row density, status badge, action alignment. Keyboard: focus flows. |
| **Status** | **TODO** — WP3 (list consolidation) |
| **Risk** | Medium — Requires Portal-safe AlertDialog pattern (similar to B3 fix). |

---

## Section: Ergebnisse (Results)

| Field | Value |
|---|---|
| **Tab key** | results |
| **Actual files** | `configurations/ConfigResults.tsx` (252) |
| **Current primitives** | PageHeader, Input (search), FilterPill (filters), ListRow (partial), Button (actions) |
| **Target primitives** | PageHeader (maintained), PageToolbar (search + date range + sort), ListRow (consistent), Badge (metadata) |
| **Required changes** | 1. Verify PageHeader present. 2. Consolidate toolbar: Input (search) + FilterPill (group labels) + sort controls in one container. 3. Ensure all rows use ListRow: date, time, player count, class metadata. 4. Replace oversized cards if present. 5. Verify date control positioning. |
| **Tests** | E2E #8: Search, filter by date/class, sort, click share/delete. Visual: toolbar composition, row density, metadata alignment. |
| **Status** | **Partial** — WP2 (toolbar review) → WP3 (row standardization). |
| **Risk** | Low — Pattern largely established. |

---

## Section: Achievements

| Field | Value |
|---|---|
| **Tab key** | achievements |
| **Actual files** | `configurations/ConfigAchievements/` (ConfigAchievements.tsx 247 + BadgeRow.tsx 200 + TierHeader.tsx 52 = **499 LOC total**, not 368) |
| **Current primitives** | ConsoleShell, PageHeader, Button, Input, rank-selection (tabs), AlertDialog (partial) |
| **Target primitives** | ConsoleShell, PageHeader, Tabs/Accordion (rank grouping), ListRow or achievement-specific row, SettingRow pattern, dirty-state save bar |
| **Required changes** | 1. Add/verify PageHeader. 2. Keep rank tabs (existing pattern). 3. Within each rank, replace oversized cards with ListRow: name, description, trigger, threshold, bonus points, actions (edit, delete). 4. Establish SettingRow component (title, description, control, restart badge, status). 5. Implement dirty-state save bar (StickyFormActions). 6. Document reset scope: achievement / rank / all defaults. 7. Preserve achievement logic server-side. |
| **Tests** | Add SettingRow unit tests. E2E: Edit achievement, verify dirty state, save, reset. Visual: rank-tab selection, edit mode. |
| **Status** | **TODO** — WP5 (settings consolidation) after SettingRow established in WP2. |
| **Risk** | Medium — Requires SettingRow abstraction definition. |

---

## Section: Quiz

| Field | Value |
|---|---|
| **Tab key** | quizzes |
| **Actual files** | `configurations/quizzes/ConfigManageQuizz.tsx` (246) + QuizzList.tsx + QuizzDialogs.tsx |
| **Current primitives** | PageHeader, Input (search), FilterPill, ListRow (partial), oversized cards, bulk selection (partial) |
| **Target primitives** | PageHeader (create action in header), PageToolbar (search + filter + sort), ListRow (title, question count metadata, labels in footer), bulk selection with bulk toolbar |
| **Required changes** | 1. Verify PageHeader with create + JSON import in header. 2. Consolidate toolbar: Input (search) + FilterPill (filters) + sort. 3. Replace cards with ListRow: quiz title, metadata (question count, last update), labels in footer, actions (open/edit/duplicate/overflow). 4. Implement bulk selection: checkbox + bulk toolbar (delete/assign-label). 5. Verify nested actions do not trigger row selection. |
| **Tests** | E2E #9: Create quiz, search, filter, select multiple, bulk delete, click edit. Visual: row density, action alignment. Keyboard: checkbox focus + arrow nav. |
| **Status** | **TODO** — WP3 (list consolidation) |
| **Risk** | Low–Medium — ListRow proven; bulk selection interaction must not conflict. |

---

## Section: Katalog (Catalog)

| Field | Value |
|---|---|
| **Tab key** | catalog |
| **Actual files** | `configurations/catalog/ConfigCatalog.tsx` (423) + CatalogQuestionForm.tsx + CatalogQuestionModal.tsx |
| **Current primitives** | PageHeader, Input (search), FilterPill (unlabeled), ListRow (partial), oversized item card |
| **Target primitives** | PageHeader (create action), PageToolbar (search + labeled filter groups), ListRow (question preview, type badge, source, labels, usage count, last update) |
| **Required changes** | 1. Add PageHeader. 2. Add group labels to filters (Scope, Subject/Labels); no bare "Alle" clusters. 3. Replace card with ListRow: question type badge, source, labels, usage count, last update. 4. Consolidate footer actions. 5. Test keyboard through labeled filter groups. |
| **Tests** | E2E screenshots + UX validation. Search, filter by type/labels. Keyboard: filter group aria-labels functional. Visual: 1920/1024/390, filter layout. |
| **Status** | **TODO** — WP3 (list consolidation) |
| **Risk** | Low — Filter labeling is key (no bare clusters). |

---

## Section: Medien (Media)

| Field | Value |
|---|---|
| **Tab key** | media |
| **Actual files** | `configurations/ConfigMedia/` (ConfigMedia.tsx + MediaCard.tsx + MediaInfoDialog.tsx + useMedia*.ts) |
| **Current primitives** | PageHeader, Input, FilterPill, Badge (usage), responsive grid, AlertDialog (controlled per B3), drag-drop, bulk selection |
| **Target primitives** | Same — preserve all existing. Verify: filter group labels, filename legibility + tooltip, audio/video preview distinction, hover/focus/touch, grid density, dialog stacking fix (B3), bulk toolbar on narrow widths, error states. |
| **Required changes** | **Preserve existing** — only refinements: 1. Verify filter group labels (no bare "Alle" sequences). 2. Ensure filename legible + tooltip. 3. Test audio/video preview distinction. 4. Validate grid density at 1024/1280/1920 (D3 targets 5 cols at 1280). 5. Confirm card actions visible on keyboard focus + touch. 6. Test media-type metadata displayed consistently. 7. Verify info/delete dialogs do NOT stack (B3 Portal fix). 8. Test bulk toolbar layout on 390px. 9. Validate file errors + upload progress clearly shown. |
| **Tests** | Stagehand media-usage spec (T2) validates badges, info-dialog, delete-warning, B1 regression. Post-D3: validate hover zoom + scrim gradient at all widths. Visual: grid density, action visibility at 390/1024/1280/1920. Touch: long-press actions, scroll unblocked. A11Y: keyboard access, aria-labels. |
| **Status** | **DONE** — W6 implementation complete. T2/D3/B3 overhauls verified. Maintenance only. |
| **Risk** | Low — Recent changes + tested. Monitor D3 hover + B3 Portal fix in production. |

---

## Section: Vorschläge (Submissions)

| Field | Value |
|---|---|
| **Tab key** | submissions |
| **Actual files** | `configurations/submissions/ConfigSubmissions.tsx` (shim) → `ConfigSubmissions.tsx` (336) + `SubmissionCard.tsx` (368) |
| **Current primitives** | PageHeader (partial), FilterPill (status filters), bespoke card (368 LOC), public submission link, EmptyState |
| **Target primitives** | PageHeader (title + subtitle), status FilterPill toolbar, ListRow (submission card data → row format), SectionCard (public link), EmptyState per status |
| **Required changes** | 1. Add PageHeader. 2. Replace status-filter cluster with FilterPill toolbar (Accepted, Rejected, Pending with counts). 3. Replace 368 LOC SubmissionCard with ListRow: title/preview, submitter, date, status badge, actions (accept, reject, delete, overflow). 4. Keep public link as compact SectionCard. 5. Implement AlertDialog for delete/reject. 6. Verify EmptyState per selected status. |
| **Tests** | E2E: Filter by status, click accept/reject/delete (confirm if needed). Visual: row density, status badge, action layout. |
| **Status** | **TODO** — WP3 (list consolidation) |
| **Risk** | Medium — Large 368 LOC component warrants careful decomposition. |

---

## Section: Klassen (Classes)

| Field | Value |
|---|---|
| **Tab key** | klassen |
| **Actual files** | `configurations/klassen/ConfigKlassen.tsx` (330) + ClassList.tsx (329) + StudentPicker.tsx |
| **Current primitives** | PageHeader (partial), Input (search), Button, ListRow (partial), oversized cards, label assignment (detached button) |
| **Target primitives** | PageHeader (create action), PageToolbar (search + subject/label filter), ListRow (class name, student count, subject/labels in footer, consistent actions) |
| **Required changes** | 1. Verify PageHeader + create action. 2. Add filter group labels. 3. Replace cards with ListRow: class name (title), student count (metadata), subject/label chips (footer), actions (edit, delete, overflow). 4. Embed label-assignment control as row action (not detached button). 5. Implement delete confirmation. 6. Verify action order: edit/open → delete in overflow. |
| **Tests** | E2E #11: Create class, search by name, filter by subject, click edit, verify changes, delete → confirm. Visual: row density, label chips, action alignment. Keyboard: focus flows. |
| **Status** | **TODO** — WP3 (list consolidation) |
| **Risk** | Low — ListRow pattern established. Label-embedding requires UX review. |

---

## Section: Schülerverwaltung (Student Management)

| Field | Value |
|---|---|
| **Tab key** | schueler |
| **Actual files** | `configurations/schueler/ConfigSchueler.tsx` (157) + StudentList.tsx (198) + CreateStudentDialog.tsx + PinDialog.tsx |
| **Current primitives** | PageHeader, Input (search), FilterPill, ListRow, Button (class assignment), locale keys (verified: no "+ + Klasse" bug; no "Klasse hinzufügen" in code) |
| **Target primitives** | PageHeader, PageToolbar (search + class/status filters), ListRow (name, email, classes, status, actions), consistent action order |
| **Required changes** | 1. Verify PageHeader. 2. Ensure filter group labels (Class, Status). 3. Maintain ListRow format: name, email, class chips, status badge, actions (edit/delete). 4. **Fabricated bug removed:** "+ + Klasse" text does NOT exist in repo. No fix needed. 5. Consolidate class-assignment control (embedded in row actions or modal edit). 6. Test keyboard access. |
| **Tests** | E2E #12: Create student, assign class, search, filter, click edit, verify, delete → confirm. i18n:check: all keys present. Visual: class-chip layout, action alignment. Keyboard: tab through filters + actions. |
| **Status** | **Partial** — Row structure OK; no fabricated bugs to fix. WP3 (list consolidation) to align action order + filter grouping. |
| **Risk** | Low — Existing row pattern; fabricated bug removed = no rework needed. |

---

## Section: Fächer/Labels (Subjects)

| Field | Value |
|---|---|
| **Tab key** | labels |
| **Actual files** | `configurations/labels/ConfigLabels.tsx` (147) |
| **Current primitives** | Button (icon-only WITHOUT aria-label), Input (inline, unguarded), color picker (no accessible control), no delete confirmation, SectionCard (partial) |
| **Target primitives** | PageHeader, ListRow (colour swatch visual + name + usage count + actions), SettingRow pattern (if settings exist), AlertDialog (delete-when-used), accessible color control |
| **Required changes** | **P0 ACCESSIBILITY GAP:** 1. Add aria-label to ALL icon-only buttons (edit, delete, reorder). 2. Implement delete-when-used confirmation (AlertDialog shows impact on quizzes). 3. Decide create flow: modal vs. inline input form; do NOT place submit button at bottom-right. 4. Replace card with ListRow: color swatch (visual + aria-label), label name, usage count, actions (edit, delete). 5. Make color picker accessible (not color-dot-only; label + aria-label). 6. Verify keyboard access + screen-reader announcement for delete confirm. |
| **Tests** | **A11Y CRITICAL:** Accessibility audit required. WAVE + manual: icon button labels functional, color picker keyboard access, delete confirmation accessibility. E2E: Create, search, filter, delete → confirm. Visual: swatch alignment. |
| **Status** | **BLOCKED** — P0 a11y gap must resolve before WP4. |
| **Risk** | **High** — Existing implementation skips accessibility (SDD §12 + WCAG). Do not ship WP4 without resolving. |

---

## Section: Design (Theme Configuration)

| Field | Value |
|---|---|
| **Tab key** | theme |
| **Actual files** | `configurations/theme/ConfigTheme.tsx` (395) + `theme/useConfigTheme.ts` (381) + `configurations/theme-preview/ThemePreviewPanel.tsx` (285) |
| **Current primitives** | PageHeader, Input, Button, SectionCard, Radix Dialog (color pickers not centralized) |
| **Target primitives** | PageHeader, SectionCard (or 2-column layout), collapsible/sticky preview, shared SettingRow pattern, consistent color-field UI |
| **Required changes** | 1. Decide preview placement: collapsible, sticky, or responsive 2-column (wide screens). 2. Consolidate color-field pattern: ensure all use same picker/UI. 3. Document reset button scope: "Discard changes" vs. "Restore preset" vs. "Restore defaults". 4. Verify no nested scroll containers. 5. Test sticky preview does not cover final form field (390px). 6. Maintain live preview immediacy. |
| **Tests** | Visual: preview collapsible/sticky at 390/1024/1280/1920 viewports. Form fields not hidden. Color pickers match. Reset buttons labeled per scope. E2E: Adjust setting, verify preview updates, reset/save flows. |
| **Status** | **TODO** — WP5 (settings consolidation) after SettingRow + reset-scope decision. |
| **Risk** | Low–Medium — Layout + wording decisions; no complex interaction. |

---

## Section: Modus (Game Mode Config)

| Field | Value |
|---|---|
| **Tab key** | gamemode |
| **Actual files** | `configurations/ConfigGameMode.tsx` (450) |
| **Current primitives** | ConsoleShell, PageHeader (partial), SectionCard, Button, Input, Toggle, weak form grouping, restart requirements in body text |
| **Target primitives** | PageHeader, shared SettingRow primitive (title, description, control, optional restart badge, status message), StickyFormActions (dirty-state save bar) |
| **Required changes** | **CRITICAL: Establish SettingRow once, use everywhere.** 1. Define SettingRow: title, description, control (aligned right on wide, stacked on narrow), optional restart badge, optional status message. Forward refs for focus restoration. 2. Migrate Modus sections (8 mode settings) to use SettingRow. 3. Implement StickyFormActions (Reset/Save buttons, dirty-state indicator). 4. Document reset scope. 5. Move restart requirements from body text to restart badge (icon + aria-label). 6. Group related settings under SectionCard. 7. Verify all required states: dependency-disabled, restart-required, saved, dirty, validation-error. |
| **Tests** | **SettingRow component:** Unit tests for render + focus, variants (toggle/input/select), restart badge, status message. E2E: Modify setting, verify dirty state, reset (undo), save, verify no unsaved on navigate. Keyboard: tab through settings + action buttons. Visual: control alignment, restart badge, status message placement. |
| **Status** | **BLOCKED** — Requires SettingRow component definition in WP2. Then WP5 can proceed. |
| **Risk** | **Medium** — SettingRow is foundational for WP5. Must get API right. |

---

## Section: KI (AI Provider Config)

| Field | Value |
|---|---|
| **Tab key** | ki |
| **Actual files** | `configurations/ai/ConfigAI.tsx` (336) + `TextProviderSection.tsx` (316) + `ImageSection.tsx` + `QuizGenSection.tsx` |
| **Current primitives** | ConsoleShell, PageHeader, SectionCard, Button, Input, status logic (weak feedback), oversized cards |
| **Target primitives** | PageHeader, SectionCard (per provider), SettingRow pattern, inline provider status badge, test-in-progress/success/failure feedback, AlertDialog for test failures |
| **Required changes** | 1. Add PageHeader. 2. Organize by section: Text Provider, Image Provider, Quiz Generator, Connection Test, Secrets Mgmt. 3. Use SettingRow for provider config fields (API key, model selection). 4. Inline provider status badge (online/offline/error, using semantic tokens). 5. Implement connection test flow: Button → Loading spinner → Success/Failure toast + Badge update. 6. Disable quiz generator server-side when text provider unavailable (UI redundant check OK). 7. Secrets must NOT echo back to client. 8. Verify save state (persisted) separate from test state (transient feedback). |
| **Tests** | Connection test UI: Click test → loading spinner → success/failure feedback. E2E: Configure provider, test connection (success/fail), verify state persists. Visual: status badge, test-state indicators. Security: verify API keys not rendered back. |
| **Status** | **TODO** — WP5 (settings consolidation) after SettingRow established. |
| **Risk** | Medium — Requires SettingRow abstraction + test-state feedback pattern. |

---

## Section: Satellit (Satellite Device Management)

| Field | Value |
|---|---|
| **Tab key** | satellite |
| **Actual files** | `configurations/ConfigDisplay.tsx` (159) |
| **Current primitives** | ConsoleShell, PageHeader, SectionCard, Button, Input, long identifiers (no copy affordance) |
| **Target primitives** | PageHeader, ListRow or compact row (per device), Badge (online/offline/pending status), copy-to-clipboard for identifiers, AlertDialog for pairing/revocation |
| **Required changes** | **SCOPE DECISION REQUIRED:** If Satellit is static deployment info (read-only page), classify as out-of-scope for UI consistency. If user-managed device registry: 1. Add PageHeader. 2. List paired devices in rows (name, status badge, last-seen, identifier with copy button). 3. Implement pairing action (QR code modal or link copy). 4. Implement revocation action (AlertDialog confirms, removes, restores focus). 5. Use semantic status badges (online, offline, pending). 6. Add copy-to-clipboard utility for token IDs. |
| **Tests** | If in-scope: Pair device, verify list updates, revoke device, confirm flow. Copy token ID to clipboard. Status badge reflects connection state. If out-of-scope: document as deployment-info section, no consolidation required. |
| **Status** | **BLOCKED on scope decision** — Is Satellit a user-managed registry or static info page? |
| **Risk** | Low if out-of-scope. Medium if user-managed features added. |

---

## Section: Nutzerverwaltung (User Management)

| Field | Value |
|---|---|
| **Tab key** | users |
| **Actual files** | `configurations/ConfigUsers.tsx` (688) |
| **Current primitives** | ConsoleShell, PageHeader (partial), Input (search), FilterPill (weak), ListRow, Button (action icons without aria-labels), no self-delete guard in UI |
| **Target primitives** | PageHeader (create action), PageToolbar (search + role/status filter groups), ListRow (name, email, role badge, status, actions), AlertDialog for delete |
| **Required changes** | **P0 SECURITY GAP:** 1. Align page wording (description says "teachers"; rows contain user/teacher/admin roles). Update to "Users & Roles". 2. Add role filter (User, Teacher, Admin) + status filter (Active, Deactivated). 3. **UI self-delete guard:** If current user matches row, disable delete + deactivate buttons, show inline message "Cannot modify your own account." 4. Ensure server-side permission check authoritative (UI is defensive per §12). 5. Add aria-label to ALL icon-only action buttons (reset key, activate/deactivate, delete). 6. Implement delete confirmation (AlertDialog shows role + consequences). 7. Verify action order: edit/reset-key/activate → delete in overflow. 8. Test keyboard access + filter groups. |
| **Tests** | **E2E #14 + Security review:** As current admin, attempt to delete self → UI prevents, shows message. As current admin, delete another user → confirm flow works. Reset key action labeled + functional. Filter by role/status. Visual: row density, action alignment. A11Y: icon-label testing. |
| **Status** | **BLOCKED** — P0 security gap (self-delete guard) + P0 a11y gap (icon labels) must resolve before deployment. |
| **Risk** | **HIGH** — Security issue (self-delete bypass in UI). Must have server-side check + UI guard. |

---

## Section: Entwicklungswerkzeuge (Developer Tools)

| Field | Value |
|---|---|
| **Tab key** | dev |
| **Actual files** | `configurations/ConfigDev/` (ConfigDev.tsx 105 + ApiExplorerCard.tsx + LogsCard.tsx + ObservabilityCard.tsx — **already modular, not "400+ LOC unstructured"**) |
| **Current primitives** | ConsoleShell, PageHeader (partial), Button, Input, code blocks (no copy UI), weak visual hierarchy |
| **Target primitives** | PageHeader, Tabs/Accordions for 6 sections, code blocks with copy-to-clipboard, AlertDialog for destructive actions, danger-zone visual distinction |
| **Required changes** | 1. Add PageHeader. 2. Organize by 6 functional groups (tabs or accordions): Debug & Diagnostics, Test Data & Simulation, Performance & Metrics, Data Export, Security & Tokens, API & Documentation. 3. Create danger-zone section: operations that delete, reset state, rotate credentials, terminate games, expose diagnostics. Require explicit confirmation. 4. Add copy-to-clipboard UI for code blocks + tokens. 5. Inline success/error feedback for test operations. 6. Verify development/admin-only access enforced by existing authorization. 7. Never render secrets in full (redact API keys if shown for copy). 8. Add aria-labels to all code-copy buttons. 9. Security review mandatory (SDD §12). |
| **Tests** | **Security review + authorization:** Verify non-admin users cannot access dev tab. Run diagnostic commands, verify output format. Copy code blocks, verify clipboard. Execute destructive action (data export reset) → confirm flow. Visual: danger zone visual distinction (red/warning color), environment marker prominence. |
| **Status** | **BLOCKED** — Requires security review before any changes. Recommend: schedule security audit → then WP6. |
| **Risk** | **HIGH** — Developer tools are security-sensitive. Do not assume existing access control is sufficient. |

---

## Migration Wave Summary

| Wave | Sections | Primary Task | Blocker Removal | Estimated Effort |
|---|---|---|---|---|
| **WP1** (Shell) | ConsoleShell, NavItem, header actions | Fix active-item logic, align header actions | None | Low |
| **WP2** (Toolbars + SettingRow) | PageHeader rollout, PageToolbar pattern, SettingRow + StickyFormActions definition | Define SettingRow + StickyFormActions component API, apply to ≥3 settings pages | SettingRow API review (dependency for WP5) | Medium |
| **WP3** (Lists) | Spielen, Laufende Spiele, Ergebnisse, Quiz, Klassen, Schülerverwaltung, Katalog, Vorschläge | Consolidate on ListRow + SelectableRow, fix action ordering, implement destructive confirmations | P0 gaps in Labels a11y + Nutzerverwaltung (parallel, do not block) | Medium–High |
| **WP4** (Media + Labels a11y) | Medien (preserve + validate), Fächer/Labels (P0 a11y fix) | **CRITICAL:** Resolve Labels a11y gaps (icon labels, delete confirm, color-picker access) before shipping | Labels a11y audit + remediation | Medium (a11y-focused) |
| **WP5** (Settings) | Modus, KI, Design, Achievements, Satellit (if in-scope) | Migrate all settings pages to SettingRow + StickyFormActions | SettingRow component + API (WP2 dependency), Satellit scope decision | High (largest scope) |
| **WP6** (Dev-Tools) | Entwicklungswerkzeuge | Reorganize, add danger zone, copy UI, security review, enforce authorization | **MANDATORY:** Security review sign-off before merge | Medium (security-gated) |
| **WP7** (Cleanup) | Remove unused legacy components, dead variants, unused i18n keys, verify all migrations | Final verification, regression testing, visual snapshots, e2e full run | All prior WPs shipped | Low |

---

## Critical Path Blockers

1. **SettingRow component definition (WP2 → WP5 dependency):** Must be approved before Modus/KI/Design/Achievements can migrate. Recommend component unit tests + usage example.
2. **Labels a11y resolution (WP4 blocker):** Icon labels, delete confirmation, color-picker access must pass accessibility audit.
3. **Nutzerverwaltung self-delete guard (P0):** Server + UI must prevent current user self-deletion. Does not block other lists but is critical for security.
4. **Dev-Tools security review (WP6 blocker):** Cannot ship until authorized reviewer confirms access control + secret handling.
5. **Satellit scope decision (WP0 → affects WP5 scope):** Clarify whether device-management features exist; if static, remove from consolidation scope.

---

**Prepared:** 2026-07-21 (Correction 3)  
**Verified:** BUILTIN_TABS = 18 tabs, route structure = /manager + /manager/config, all actual file paths confirmed via repo find
