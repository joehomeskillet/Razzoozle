# Manager Component Migration Matrix (WP0)

**Document:** Component consolidation plan for manager sections  
**Date:** 2026-07-21  
**Wave order:** WP1 (Shell) → WP2 (Toolbars) → WP3 (Lists) → WP4 (Media) → WP5 (Settings) → WP6 (Dev-Tools) → WP7 (Cleanup)  

---

## How to Use This Matrix

Each row represents one manager section. The columns show:
- **Current files:** Exact paths in the repo
- **Current primitives:** What components/patterns are used now
- **Target primitives:** What SDD §6 recommends using
- **Required changes:** The diff strategy to get there
- **Tests:** What must pass post-migration
- **Status:** Migration readiness (blocked, todo, in-progress, done)

---

## Section: Spielen (Game Selection)

| Field | Value |
|---|---|
| **Route** | `/manager/play` |
| **Current files** | `packages/web/src/features/manager/sections/play/GameSelectionPage.tsx`, `GameSessionCard.tsx` |
| **Current primitives** | ConsoleShell (layout), Button (start action), oversized GameSessionCard, manual keyboard handling |
| **Target primitives** | ConsoleShell (unchanged), PageHeader, SelectableRow (radio selection), consistent action bar |
| **Required changes** | 1. Add PageHeader title + subtitle (SDD §5.1: "Spielen" + "Quiz wählen"). 2. Wrap quiz collection in role="radiogroup". 3. Replace GameSessionCard with SelectableRow (metadata: player count, question count, subject/labels). 4. Move "Spiel starten" + "Solo-Link" to sticky action bar (sticky only if needed per viewport). 5. Verify keyboard arrow selection within radiogroup. 6. Maintain solo-link secondary styling. |
| **Tests** | E2E #4–5: Select quiz via click + keyboard (arrow keys), "Spiel starten" disabled until quiz selected, click starts game, cancel on error restores selection. Visual: 1920/1440/1024/390 viewports, selection state consistency. Keyboard: radiogroup arrow nav functional. |
| **Status** | **TODO** — WP1 (shell alignment first) → WP3 (list consolidation) |
| **Risk** | Low — SelectableRow pattern already tested in other sections. Keyboard interaction must preserve existing arrow behavior. |
| **Notes** | Solo-link action remains secondary (do not promote to primary action bar). |

---

## Section: Laufende Spiele (Live Games)

| Field | Value |
|---|---|
| **Route** | `/manager/games` |
| **Current files** | `packages/web/src/features/manager/sections/games/GameRunsPage.tsx`, `GameRunCard.tsx`, `GameRunList.tsx` |
| **Current primitives** | ConsoleShell, PageHeader (partial), Button (end-game/mirror), GameRunCard (oversized), manual status representation |
| **Target primitives** | ConsoleShell, PageHeader (complete), ListRow (metadata: quiz, PIN, player count, status badge, elapsed time), destructive AlertDialog for "Beenden" |
| **Required changes** | 1. Ensure PageHeader present with title + optional subtitle. 2. Replace GameRunCard with ListRow, embed: quiz title (slot="title"), metadata (PIN, player count, elapsed time, status badge), footer with label chips if available. 3. Implement destructive "Beenden" flow: ListRow action → AlertDialog → server confirmation → restore focus. 4. Keep "Mirror"/"Display" secondary actions. 5. Verify status badge uses semantic tokens (connected/disconnected/error). 6. Test row click is disabled or conflicts with action buttons clarified. |
| **Tests** | E2E #6–7: List games, click "Mirror" (display action), click "Beenden" → confirm dialog + cancel restore selection, confirm → game ends + list updates. Visual: row density, status badge consistency, action alignment. Keyboard: focus flows through row and actions. |
| **Status** | **TODO** — WP1 (shell) → WP3 (list consolidation) |
| **Risk** | Medium — Requires careful "Beenden" Portal-safe AlertDialog pattern (similar to B3 fix). Verify existing end-game server interaction preserved. |
| **Notes** | "Beenden" is destructive and final; double-confirm recommended. Do not place secondary actions after delete position. |

---

## Section: Ergebnisse (Results)

| Field | Value |
|---|---|
| **Route** | `/manager/results` |
| **Current files** | `packages/web/src/features/manager/sections/results/ResultsPage.tsx`, `ResultCard.tsx`, `ResultsList.tsx` |
| **Current primitives** | PageHeader, Input (search), FilterPill (filters), ListRow (partial), Button (actions) |
| **Target primitives** | PageHeader (maintained), PageToolbar (search + date range + sort), ListRow (consistent), Badge (status/metadata) |
| **Required changes** | 1. Verify PageHeader present + aligned. 2. Consolidate toolbar: Input (search) + FilterPill (groups: date, class, status if applicable) + sort controls in one visual container. 3. Ensure all result rows use ListRow: metadata (date, time, player count, class), footer (labels if present), actions (share, delete), whole-row click disabled or single primary action only. 4. Replace oversized cards if present. 5. Verify date control positioning (left with search or in filter group). 6. Test pagination or virtualization if result set > 100. |
| **Tests** | E2E #8: Search results, filter by date/class, sort, click share (copy link / open modal), click delete → confirm. Visual: toolbar composition, row density, metadata alignment. |
| **Status** | **Partial** — WP6 already consolidated much; verify alignment of remaining elements. WP2 (toolbar review) → WP3 (row standardization). |
| **Risk** | Low — Pattern largely established. |
| **Notes** | Ensure delete action does not trigger row activation. Share action should have clear outcome (copy vs. modal). |

---

## Section: Achievements (Ranks & Badges)

| Field | Value |
|---|---|
| **Route** | `/manager/config/achievements` |
| **Current files** | `packages/web/src/features/manager/sections/config/achievements/AchievementsPage.tsx`, `AchievementRankTabs.tsx`, `AchievementEditor.tsx` (368 LOC) |
| **Current primitives** | ConsoleShell, PageHeader, Button, Input, rank-selection (tabs or accordion), large edit panel, AlertDialog (partial) |
| **Target primitives** | ConsoleShell, PageHeader, Tabs/Accordion (rank grouping), ListRow or compact achievement row (within selected rank), SettingRow pattern (title, description, control, restart badge), dirty-state save bar (StickyFormActions) |
| **Required changes** | 1. Add/verify PageHeader. 2. Keep rank tabs/accordion (no duplication; use existing pattern). 3. Within each rank, replace oversized cards with compact ListRow or achievement-specific row: name, description, trigger/condition (abbreviated), threshold, bonus points, actions (edit, delete). 4. Replace edit panel with inline expansion, side panel, or modal. 5. Establish SettingRow component (title, description, control aligned right on wide, stacked on narrow) and apply to rank settings. 6. Add restart-required badge if applicable. 7. Implement dirty-state save bar (reset/save buttons). 8. Document reset scope: one achievement, one rank, or all defaults. 9. Preserve achievement logic server-side (no frontend evaluation). |
| **Tests** | Existing structure tests; add SettingRow component unit tests. Visual: rank-tab selection, edit mode toggle, form density. E2E: Edit achievement, change field, verify dirty state, save, reset. Verify rank selection persists. |
| **Status** | **TODO** — WP5 (settings consolidation) after SettingRow established in WP2. |
| **Risk** | Medium — Requires SettingRow abstraction definition. Edit modal/panel decision impacts layout significantly. |
| **Notes** | Large 368 LOC component warrants review for further split post-WP5. |

---

## Section: Quiz

| Field | Value |
|---|---|
| **Route** | `/manager/quiz` |
| **Current files** | `packages/web/src/features/manager/sections/quiz/QuizPage.tsx`, `QuizListRow.tsx`, `QuizCard.tsx` |
| **Current primitives** | PageHeader, Input (search), FilterPill, ListRow (partial), oversized QuizCard, bulk selection (partial) |
| **Target primitives** | PageHeader (create action in header), PageToolbar (search + filter + sort), ListRow (title, question count metadata, labels in footer, consistent actions), SelectableRow or checkbox + ListRow for bulk selection |
| **Required changes** | 1. Verify PageHeader with create + JSON import actions in header. 2. Consolidate toolbar: Input (search) + FilterPill (filters: creator, labels, status) + sort (by date, questions, name). 3. Replace oversized QuizCard with ListRow: quiz title, metadata (question count, last update, creator), labels in footer, actions (open/preview, edit, duplicate, overflow with delete). 4. Implement bulk selection: checkbox in row, bulk toolbar (delete/assign-label actions) appears only when rows selected. 5. Maintain action order: open/edit/duplicate/overflow/delete. 6. Verify nested action clicks do not trigger row selection. |
| **Tests** | E2E #9: Create quiz, search by name, filter by label, sort, select multiple, bulk delete, click edit → editor, verify return to list. Visual: row density, action alignment, bulk toolbar appearance. Keyboard: checkbox focus + arrow nav. |
| **Status** | **TODO** — WP3 (list consolidation) |
| **Risk** | Low–Medium — ListRow pattern established; bulk selection interaction must not conflict with row actions. |
| **Notes** | Bulk actions should only show when ≥1 row selected. Do not show empty bulk bar. |

---

## Section: Katalog (Catalog / Suggestion Library)

| Field | Value |
|---|---|
| **Route** | `/manager/catalog` |
| **Current files** | `packages/web/src/features/manager/sections/catalog/CatalogPage.tsx`, `CatalogRow.tsx`, `CatalogCard.tsx` |
| **Current primitives** | PageHeader (partial), Input (search), FilterPill (unlabeled), ListRow (partial), oversized item card, Badge (missing or weak) |
| **Target primitives** | PageHeader (create action), PageToolbar (search + labeled filter groups), ListRow (question preview, question type badge, source/creator, labels, usage count if available, last update), consistent actions |
| **Required changes** | 1. Add PageHeader with create primary action. 2. Add group labels to filters (Scope, Subject/Labels, Type if applicable); replace bare "Alle" with labeled pills. 3. Replace oversized card with ListRow: question preview (or type icon), metadata (type, source/creator, labels, usage count, last update), actions (open/assign, duplicate if supported, overflow). 4. Use Badge for question-type indicator. 5. Consolidate footer actions alignment. 6. Test keyboard navigation through labeled filter groups. |
| **Tests** | E2E screenshots + UX validation. Search catalog, filter by type/labels, click create, verify new item appears. Keyboard: filter group aria-labels functional. Visual: 1920/1024/390, filter layout, action positioning. |
| **Status** | **TODO** — WP3 (list consolidation) |
| **Risk** | Low — Pattern largely standard. Filter labeling is key (no bare "Alle" clusters). |
| **Notes** | Ensure filter group labels are aria-labeled for screen readers. |

---

## Section: Medien (Media Management)

| Field | Value |
|---|---|
| **Route** | `/manager/config/media` |
| **Current files** | `packages/web/src/features/manager/components/configurations/ConfigMedia/ConfigMedia.tsx`, `MediaCard.tsx`, `MediaInfoDialog.tsx`, `useMediaDragDrop.ts`, `useMediaSelection.ts`, `useMediaUpload.ts` |
| **Current primitives** | PageHeader (via ConfigMedia), Input (search/filter), FilterPill, Badge (usage count), responsive grid, AlertDialog (controlled for Portal safety per B3), drag-drop upload, bulk selection |
| **Target primitives** | Same — media implementation already advanced. Preserve: drag-drop, file picker, source/scope/label filters, bulk selection + delete, usage badges, usage details, delete confirmations, controlled delete dialog (B3), reduced-motion, responsive grid, MediaInfoDialog. Verify: group labels on filters, filename legibility + tooltip, audio/video preview distinction, hover/focus/touch behavior, grid density at all widths. |
| **Required changes** | **Preserve existing** — only refinements: 1. Verify filter group labels (not bare "Alle" sequences). 2. Ensure filename is legible + has tooltip. 3. Test audio/video preview distinction (icon + metadata). 4. Validate grid density at 1024 (4 cols?), 1280 (5 cols?), 1920 (6+ cols?) — current D3 targets 5 cols at 1280. 5. Confirm card actions visible on keyboard focus + touch long-press. 6. Test media-type metadata displayed consistently. 7. Verify info/delete dialogs do NOT stack or click-through (B3 Portal fix validated). 8. Test bulk toolbar layout on narrow widths (390px). 9. Validate file errors + upload progress states clearly shown. |
| **Tests** | Existing Stagehand media-usage spec (T2) already validates badges, info-dialog, delete-warning, B1 regression (no stacking). Post-D3: validate hover zoom + scrim gradient at all widths. Visual: grid density + card action visibility at 390/1024/1280/1920. Touch: long-press opens actions, scroll is not blocked. A11Y: keyboard access to actions, aria-labels on badges. |
| **Status** | **DONE** — W6 implementation complete. T2/D3/B3 overhauls verified. Maintenance only. |
| **Risk** | Low — Changes recent and tested. Monitor D3 hover polish + B3 Portal fix in production. |
| **Notes** | Do not refactor media hooks (useMediaSelection, useMediaDragDrop) into single component — keep modular. Respect existing drag-drop + preview logic. |

---

## Section: Vorschläge (Submissions / Suggestions)

| Field | Value |
|---|---|
| **Route** | `/manager/submissions` or `/manager/suggestions` |
| **Current files** | `packages/web/src/features/manager/sections/submissions/SubmissionsPage.tsx`, `SubmissionCard.tsx` (368 LOC bespoke) |
| **Current primitives** | PageHeader (partial), FilterPill (status filters), SubmissionCard (bespoke, oversized), public submission link, EmptyState |
| **Target primitives** | PageHeader (title + subtitle), status FilterPill toolbar, ListRow (submission card data → row format), SectionCard (public submission link info), EmptyState per status, AlertDialog for delete/reject confirmations |
| **Required changes** | 1. Add PageHeader (title: "Vorschläge" or locale equiv., subtitle: guidance). 2. Replace status-filter cluster with FilterPill toolbar (Accepted, Rejected, Pending — with counts if available). 3. Replace 368 LOC SubmissionCard with ListRow: submission title/preview, submitter, date, status badge, labels if available, actions (accept, reject, delete, overflow). 4. Keep public submission link as compact SectionCard (copy + configure affordances). 5. Implement AlertDialog for delete/reject actions. 6. Verify EmptyState shown per selected status. 7. Test action order: accept/reject in main area, delete in overflow or destructive zone. |
| **Tests** | E2E: Filter by status, click accept/reject (confirm if needed), verify state update. Click delete → confirm. Copy submission link. Visual: row density, status badge, action layout. |
| **Status** | **TODO** — WP3 (list consolidation) |
| **Risk** | Medium — Large 368 LOC component warrants careful decomposition. Ensure SubmissionCard removal does not hide necessary metadata. |
| **Notes** | Public link section is different semantic purpose (info card, not action row). Keep separate via SectionCard. |

---

## Section: Klassen (Classes)

| Field | Value |
|---|---|
| **Route** | `/manager/school/classes` |
| **Current files** | `packages/web/src/features/manager/sections/school/classes/SchoolClassesPage.tsx`, `ClassCard.tsx`, `ClassRow.tsx` |
| **Current primitives** | PageHeader (partial), Input (search), Button, ListRow (partial), oversized ClassCard, label assignment (detached button) |
| **Target primitives** | PageHeader (create action), PageToolbar (search + subject/label filter), ListRow (class name, student count, subject/labels in footer, actions: edit/delete/assign-label), consistent action order |
| **Required changes** | 1. Verify PageHeader + create action. 2. Add filter group labels (Subjects/Labels). 3. Replace ClassCard with ListRow: class name (title), student count (metadata), subject/label chips (footer), actions (edit, delete, overflow). 4. Embed label-assignment control as action within row or in overflow (not detached button). 5. Implement delete confirmation. 6. Verify action order: edit/open → delete in overflow or destructive zone. 7. Test keyboard: focus flows through row and actions. |
| **Tests** | E2E #11: Create class, search by name, filter by subject, click edit → edit dialog, verify changes, delete → confirm. Visual: row density, label chips, action alignment. Keyboard: radiogroup or checkbox + arrow nav. |
| **Status** | **TODO** — WP3 (list consolidation) |
| **Risk** | Low — ListRow pattern established. Label-assignment embedding (row action vs. detached) requires UX review. |
| **Notes** | Whole-row click should be reserved for "open class"; do not conflict with edit action. |

---

## Section: Schülerverwaltung (Student Management)

| Field | Value |
|---|---|
| **Route** | `/manager/school/students` |
| **Current files** | `packages/web/src/features/manager/sections/school/students/StudentManagementPage.tsx`, `StudentRow.tsx` |
| **Current primitives** | PageHeader (partial), Input (search), FilterPill, ListRow, Button (class assignment), locale keys |
| **Target primitives** | PageHeader (create action), PageToolbar (search + class/status filters), ListRow (name, email, classes, status, actions: edit/delete), consistent action order, i18n (verified: no "+ + Klasse" text; uses "Klasse hinzufügen") |
| **Required changes** | 1. Verify PageHeader. 2. Ensure filter group labels (Class, Status). 3. Maintain ListRow format: student name, email (metadata), class chips (footer), status badge, actions (edit/delete). 4. Verify "+ + Klasse" text is corrected to "Klasse hinzufügen" in all 6 locales (SDD §10). 5. Consolidate class-assignment control (if embedded in row actions or modal edit flow). 6. Run i18n:check to verify all keys present. 7. Test keyboard access to row actions and filter groups. |
| **Tests** | E2E #12: Create student, assign class, search by name, filter by class/status, click edit → edit modal, verify state, delete → confirm. i18n:check: no missing keys. Visual: class-chip layout, action alignment. Keyboard: tab through filters + row actions. |
| **Status** | **Partial** — Row structure OK; i18n verified fixed. WP3 (list consolidation) to align action order + filter grouping. |
| **Risk** | Low — Existing row pattern; text fix already confirmed. |
| **Notes** | Ensure i18n keys for class assignment are consistent across all sections. |

---

## Section: Fächer/Labels (Subjects / Subject Categories)

| Field | Value |
|---|---|
| **Route** | `/manager/config/labels` |
| **Current files** | `packages/web/src/features/manager/components/configurations/ConfigLabels/ConfigLabels.tsx` (147 LOC handgestrickt) |
| **Current primitives** | Button (create, reorder, delete — but NO aria-labels), Input (inline submit), color picker, no delete confirmation, SectionCard (partial) |
| **Target primitives** | PageHeader (create action), ListRow (colour swatch visual + name + usage count + actions), SettingRow pattern (if settings exist), AlertDialog (delete-when-used confirmation), accessible color control |
| **Required changes** | **P0 ACCESSIBILITY GAP:** 1. Add aria-label to all icon-only buttons (color picker, delete, reorder). 2. Implement delete-when-used confirmation: AlertDialog shows "Deleting this label will remove it from X quizzes." 3. Decide create flow: modal/dialog vs. inline input form; do NOT place submit button at bottom-right detached. 4. Replace oversized card with ListRow: color swatch (visual + accessible name), label name, usage count, actions (edit, delete). 5. Ensure color-picker accessible (not color-dot-only; label + aria-label required). 6. Verify accessibility: color picker keyboard operable, delete confirmation announced. |
| **Tests** | **A11Y CRITICAL:** Accessibility audit required. WAVE + manual: icon button labels functional, color picker keyboard access, delete flow keyboard access + screen-reader announcement. E2E: Create label, search, filter by label, delete (confirm modal shows count). Visual: swatch + name alignment, action positioning. |
| **Status** | **BLOCKED** — P0 A11Y gap must be resolved before WP4. Recommend: create dedicated a11y task or include in WP4 labels section. |
| **Risk** | **High** — Existing implementation skips accessibility requirements (SDD §12 + WCAG). Do not ship WP4 without resolving. |
| **Notes** | User-facing terminology: "Fächer" (subjects) or "Kategorien" — verify consistent in UI + i18n. Backend = labels; do NOT rename contract casually. |

---

## Section: Design (Theme/Design Configuration)

| Field | Value |
|---|---|
| **Route** | `/manager/config/design` |
| **Current files** | `packages/web/src/features/manager/sections/config/design/DesignPage.tsx` |
| **Current primitives** | PageHeader, Input, Button, color fields (consistency?), live preview (competes with config form), reset button |
| **Target primitives** | PageHeader, SectionCard (or two-column layout), collapsible/sticky preview, shared SettingRow pattern (once defined), consistent color-field UI, clear reset scope (unsaved / preset / defaults) |
| **Required changes** | 1. Decide preview placement: collapsible accordion, sticky within content, or responsive 2-column layout (wide screens). 2. Consolidate color-field pattern: if ≥2 color controls, extract shared component; ensure all use same picker/UI. 3. Document reset button scope: "Discard changes" vs. "Restore preset" vs. "Restore app defaults". 4. Verify no nested scroll containers (form scroll ≠ preview scroll). 5. Maintain live preview immediacy. 6. Test sticky preview does not cover final form field (390px viewport). 7. Document saving semantics (explicit save vs. auto-save). |
| **Tests** | Visual: preview collapsible/sticky layout at 390/1024/1280/1920 viewports. Form fields not hidden by preview. Color pickers match across sections. Reset buttons labeled per scope. E2E: Adjust setting, verify preview updates, reset/save flows. |
| **Status** | **TODO** — WP5 (settings consolidation) after SettingRow + reset-scope decision. |
| **Risk** | Low–Medium — Mainly layout + wording decisions; no complex interaction. |
| **Notes** | Must preserve console-shell token insulation (do NOT change manager-console styling via design config). |

---

## Section: Modus (Game Mode Configuration)

| Field | Value |
|---|---|
| **Route** | `/manager/config/mode` |
| **Current files** | `packages/web/src/features/manager/sections/config/mode/ModeConfigPage.tsx`, `ModeSection.tsx` (450 LOC) |
| **Current primitives** | ConsoleShell, PageHeader (partial), SectionCard, Button, Input, Toggle, weak form grouping, restart requirements in body text |
| **Target primitives** | PageHeader, shared SettingRow primitive (title, description, control, optional restart badge, optional status message), StickyFormActions (dirty-state save bar), consistent section grouping |
| **Required changes** | **CRITICAL: Establish SettingRow once, use everywhere.** 1. Define SettingRow: title (label), description (optional), control (toggle/select/input aligned right on wide, stacked on narrow), optional restart-required badge, optional status/validation message. Forward refs for focus restoration. 2. Migrate Modus sections (Spielmodus, Team, Low latency, Lobby, Antwortreihenfolge, Wertung, Klassenmodus, Endbildschirm) to use SettingRow. 3. Implement StickyFormActions (Reset/Save buttons, dirty-state indicator). 4. Document reset scope: reset unsaved edits vs. restore preset. 5. Move restart requirements from body text to restart badge (icon + aria-label). 6. Group related settings under SectionCard or explicit subheadings. 7. Verify all required states: dependency-disabled, restart-required, saved, dirty, validation-error. |
| **Tests** | **SettingRow component:** Unit tests for render + focus, toggle/input variants, restart badge, status message. E2E: Modify setting, verify dirty state, reset (undo), save, verify no unsaved on navigate. Keyboard: tab through settings + action buttons. Visual: control alignment, restart badge, status message placement. |
| **Status** | **BLOCKED** — Requires SettingRow component definition in WP2. Then WP5 migration can proceed. |
| **Risk** | **Medium** — SettingRow is foundational for WP5. Must get API right (title/description/control/status/badges). Recommend WP5 kick-off ONLY after SettingRow merged. |
| **Notes** | Modus config is 450 LOC; post-WP5, split into logical feature files if > 400 LOC per file (monolith guard). |

---

## Section: KI (AI Provider Configuration)

| Field | Value |
|---|---|
| **Route** | `/manager/config/ai` |
| **Current files** | `packages/web/src/features/manager/sections/config/ai/AIPage.tsx`, `ProviderSection.tsx` (400+ LOC) |
| **Current primitives** | ConsoleShell, PageHeader, SectionCard, Button, Input, status logic (weak feedback), oversized cards |
| **Target primitives** | PageHeader, SectionCard (per provider: text-generation, image-generation, quiz-generation actions), SettingRow pattern (once defined), inline provider status badge, test-in-progress/success/failure feedback, AlertDialog for connection test failures |
| **Required changes** | 1. Add PageHeader. 2. Organize by section: Text Provider, Image Provider, Quiz Generator, Connection Test, Secrets Management. 3. Use SettingRow for provider configuration fields (API key input, model selection, etc.). 4. Inline provider status badge (online/offline/error, using semantic tokens). 5. Implement connection test flow: Button → Loading state → Success/Failure toast + Badge update. 6. Disable quiz generator server-side when text provider is unavailable (UI redundant check). 7. Secrets must NOT echo back to client. 8. Verify save state (persisted) separate from test state (transient feedback). |
| **Tests** | Connection test UI: Click test → loading spinner → success/failure feedback. E2E: Configure provider, test connection success/fail, verify state persists. Visual: status badge, test-state indicators. Security: verify API keys not rendered back. |
| **Status** | **TODO** — WP5 (settings consolidation) after SettingRow established. |
| **Risk** | Medium — Requires SettingRow abstraction + test-state feedback pattern. |
| **Notes** | Connection test is transient; do not trigger full-page save. Keep separate from field dirty state. |

---

## Section: Satellit (Satellite Device Management)

| Field | Value |
|---|---|
| **Route** | `/manager/config/satellite` or deployment-specific |
| **Current files** | `packages/web/src/features/manager/sections/config/satellite/SatelliteConfigPage.tsx` |
| **Current primitives** | ConsoleShell, PageHeader, SectionCard, Button, Input, long identifiers (no copy affordance) |
| **Target primitives** | PageHeader, ListRow or compact row (per device), Badge (online/offline/pending status), copy-to-clipboard for identifiers, AlertDialog for pairing/revocation confirmations |
| **Required changes** | **SCOPE DECISION REQUIRED:** If Satellit is static deployment info (read-only page), classify as out-of-scope for UI consistency consolidation. If user-managed device registry: 1. Add PageHeader. 2. List paired devices in rows (device name, status badge, last-seen, identifier with copy button). 3. Implement pairing action (QR code modal or link copy). 4. Implement revocation action (AlertDialog confirms, then removes device, restores focus). 5. Use semantic status badges (online, offline, pending). 6. Add copy-to-clipboard utility for token IDs. |
| **Tests** | If in-scope: Pair device, verify list updates, revoke device, confirm flow. Copy token ID to clipboard. Status badge reflects connection state. If out-of-scope: Document as deployment-info section, no consolidation required. |
| **Status** | **BLOCKED on scope decision** — Is Satellit a user-managed device registry or static info page? Recommend: scope decision in WP0 audit → document in migration matrix. |
| **Risk** | Low if out-of-scope. Medium if user-managed features added. |
| **Notes** | Defer to WP0 scope clarification or user feature request. Current implementation may be sufficient as-is. |

---

## Section: Nutzerverwaltung (User Management)

| Field | Value |
|---|---|
| **Route** | `/manager/admin/users` |
| **Current files** | `packages/web/src/features/manager/sections/admin/users/UserManagementPage.tsx`, `UserRow.tsx`, `AdminUserCard.tsx` |
| **Current primitives** | ConsoleShell, PageHeader (partial), Input (search), FilterPill (weak), ListRow, Button (action icons without aria-labels), no self-delete guard in UI |
| **Target primitives** | PageHeader (create action), PageToolbar (search + role/status filter groups), ListRow (name, email, role badge, status, actions: edit/reset-key/activate/delete), AlertDialog for delete, UI self-delete guard + server-side authorization check |
| **Required changes** | **P0 SECURITY GAP:** 1. Align page wording (description says "teachers"; rows contain user/teacher/admin roles). Update to "Users & Roles" with clear role terminology. 2. Add role filter (User, Teacher, Admin) + status filter (Active, Deactivated). 3. **UI self-delete guard:** If current user matches row, disable delete + deactivate buttons, show inline message "Cannot modify your own account." 4. Ensure server-side permission check authoritative (UI is defensive only per §12). 5. Add aria-label to all icon-only action buttons (reset key, activate/deactivate, delete). 6. Implement delete confirmation: AlertDialog shows user role + consequences. 7. Verify action order: edit/reset-key/activate → delete in overflow. 8. Test keyboard access to all actions + filter groups. |
| **Tests** | **E2E #14 + Security review:** As current admin, attempt to delete self → UI prevents, shows message. As current admin, delete another user → confirm flow works. Reset key action labeled + functional. Filter by role/status. Visual: row density, action alignment, role badge consistency. A11Y: icon-label testing. |
| **Status** | **BLOCKED** — P0 security gap (self-delete guard) + P0 A11Y gap (icon labels) must resolve before deployment. |
| **Risk** | **HIGH** — Security issue (self-delete bypass in UI). Must have server-side check + UI guard. A11Y labels required for icon-only actions. Recommend: critical-path task post-WP1. |
| **Notes** | Server-side authorization is source-of-truth; UI guard is defense-in-depth (SDD §12). Do not skip either. |

---

## Section: Entwicklungswerkzeuge (Developer Tools)

| Field | Value |
|---|---|
| **Route** | `/manager/admin/dev` |
| **Current files** | `packages/web/src/features/manager/sections/admin/dev/DevToolsPage.tsx` (400+ LOC unstructured) |
| **Current primitives** | ConsoleShell, PageHeader (partial), Button, Input, code blocks (no copy affordance), weak visual hierarchy |
| **Target primitives** | PageHeader, Tabs/Accordions for 6 sections, code blocks with copy-to-clipboard, AlertDialog for destructive actions, danger-zone visual distinction |
| **Required changes** | 1. Reorganize unstructured page by 6 sections (tabs or accordions): Debug & Diagnostics, Test Data & Simulation, Performance & Metrics, Data Export, Security & Tokens, API & Documentation. 2. Add environment marker (prominent dev/staging/production warning). 3. Create danger-zone section: operations that delete, reset state, rotate credentials, terminate games, expose sensitive diagnostics. Require explicit confirmation. 4. Add copy-to-clipboard UI for code blocks + tokens. 5. Inline success/error feedback for test operations (connection test, export validation). 6. Verify development/admin-only access enforced by existing authorization. 7. Never render secrets in full (redact API keys if shown for copy). 8. Add aria-labels to all code-copy buttons. 9. Security review mandatory (SDD §12). |
| **Tests** | **Security review + authorization:** Verify non-admin users cannot access dev tab (403 or hidden). Run diagnostic commands, verify output format. Copy code blocks, verify clipboard. Execute destructive action (data export reset) → confirm flow. Visual: danger zone visual distinction (red/warning color), environment marker prominence. |
| **Status** | **BLOCKED** — Requires security review before any changes. Recommend: schedule security audit → then WP6. |
| **Risk** | **HIGH** — Developer tools are security-sensitive. Misconfigurations can expose secrets or enable unintended modifications. Require authorized review + sign-off. |
| **Notes** | Do not assume existing access control is sufficient; audit all endpoints + UI state per role. Dangerous operations should require multi-step confirmation. |

---

## Migration Wave Summary

| Wave | Sections | Primary Task | Blocker Removal | Estimated Effort |
|---|---|---|---|---|
| **WP1** (Shell) | ConsoleShell, NavItem, header actions, "Mein Profil" deselection (G2) | Fix active-item logic, align header actions, remove duplicate profile entry | None | Low |
| **WP2** (Toolbars) | PageHeader rollout, PageToolbar pattern (if warranted), shared SettingRow + StickyFormActions definition | Define SettingRow + StickyFormActions component API, apply to ≥3 settings pages | SettingRow API review (dependency for WP5) | Medium |
| **WP3** (Lists) | Spielen, Laufende Spiele, Ergebnisse, Quiz, Klassen, Schülerverwaltung, Katalog, Vorschläge | Consolidate on ListRow + SelectableRow, fix action ordering, implement destructive confirmations | P0 gaps in Nutzerverwaltung self-guard (but does not block consolidation, can proceed in parallel) | Medium–High |
| **WP4** (Media & Labels) | Medien (preserve + validate), Fächer/Labels (P0 A11Y fix) | **CRITICAL:** Resolve Fächer A11Y gaps (icon labels, delete confirmation, color-picker access) before shipping | Labels A11Y audit + remediation | Medium (A11Y focus) |
| **WP5** (Settings) | Modus, KI, Design, Achievements, Satellit | Migrate all settings pages to SettingRow + StickyFormActions (WP2 blockers must resolve first) | SettingRow component + API (WP2 dependency), Satellit scope decision | High (largest scope) |
| **WP6** (Dev-Tools) | Entwicklungswerkzeuge | Reorganize, add danger zone, copy UI, security review, enforce authorization | **MANDATORY:** Security review sign-off before merge | Medium (security-gated) |
| **WP7** (Cleanup) | Remove unused legacy components, dead variants, unused i18n keys, verify all migrations | Final verification, regression testing, visual snapshots, e2e full run | All prior WPs shipped | Low |

---

## Critical Path Blockers

1. **SettingRow component definition (WP2 → WP5 dependency):** Must be approved before Modus/KI/Design/Achievements can migrate. Recommend component unit tests + usage example.
2. **Labels A11Y resolution (WP4 → deployment blocker):** Icon labels, delete confirmation, color-picker access must pass accessibility audit.
3. **Nutzerverwaltung self-delete guard (P0):** Server + UI must prevent current user self-deletion. Does not block other lists but is critical for security.
4. **Dev-Tools security review (WP6 blocker):** Cannot ship until authorized reviewer confirms access control + secret handling.
5. **Satellit scope decision (WP0 → affects WP5 scope):** Clarify whether device-management features exist; if static info, remove from consolidation scope.

---

**Prepared:** 2026-07-21  
**Reviewed by:** Agents A, B, C  
**Next phase:** WP0 SDD approval → WP1 kickoff
