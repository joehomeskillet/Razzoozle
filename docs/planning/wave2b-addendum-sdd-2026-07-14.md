# Wave-2b Addendum: 4 New UI/UX Work Packages — Razzoozle Rust Twin

**Author:** Fable (orchestrator)  
**Date:** 2026-07-14  
**Scope:** User request addendum to Wave-2 SDD (`docs/planning/wave2-feature-bug-sdd-2026-07-14.md`)  
**Context:** Extensions to the live Rust-pinned twin (`rust.razzoozle.xyz`, SHA `2d8c70cc`) following Wave A (P0 fix) and Wave B (class/user modules).

This addendum specifies 4 new work packages that can be woven into Wave B or run as Wave C alongside WP-QT (question-type recon). Each is a surgical UI/UX enhancement with minimal backend surface; no new dependencies, no refactors outside named files.

---

## Operating Rules

Same as wave2 SDD:
- Read `AGENTS.md` + this addendum + `docs/security/rust-razzoozle-security-audit-2026-07-13.md` first.
- Subscription-first routing: `codex-gpt5` / `grok-build` primary; escalation to `sonnet-worker` (worktree).
- Every write worker in a `git worktree`; own branch; no main-tree edits.
- Merge discipline: read diffs, `bash rust/gate.sh`, `pnpm verify`, collision-guard, FF-merge, push both remotes, `routing-outcome record`.
- Browser smoke: full flow (login → create × payload variants → start → play → reveal → finish) after every WP.
- YAGNI: no new abstractions, no extra files outside the named list, no refactors outside scope.

---

## Work Packages

### WP-UDEL — Nutzerverwaltung: Benutzer löschen (User Deletion)

**Requirement:** Admin can delete users from the ConfigUsers tab. Deletion must handle owned data gracefully (quizzes, results, catalog entries, media assets, themes, classes, sessions) — either soft-delete or reassign-to-admin.

**Current state (verified against DB + code):**
- `rust/server/src/http/users.rs` has create, list, disable, enable, reset-password — **no delete**.
- DB schema (migration 008): **9 tables have `owner_id` FK to `users(id)` with `ON DELETE SET NULL`** (quizzes, game_results, solo_results, assignments, submissions, catalog_entries, media_assets, themes, plus sessions/classes with similar patterns).
- Deleting a user with `ON DELETE SET NULL` orphans all owned data, making it visible only to admin (owner_id IS NULL).
- Session tokens (`sessions` table) remain in DB; socket refs cached in Rust runtime (see memory `feedback_user-delete-and-session-revocation`).

**Design decision (two options, pick one):**

**Option A: Hard delete only when user owns nothing (strict):**
- Admin clicks "Delete" → backend checks `WHERE owner_id = $1` on all 9 tables.
- If any rows found: return 409 Conflict with hint ("Quiz 'Algebra' must be reassigned or deleted first").
- If empty: hard delete from users table; cascade SET NULL updates; sessions wither naturally on expiry.
- UX: "User can be deleted only after transferring or deleting their quizzes/results/etc."
- Risk: user is stuck in limbo until data is tidied (lower risk for small installs, higher friction for busy teachers).

**Option B: Delete with owned-data reassignment (permissive):**
- Admin clicks "Delete" → backend reassigns all `owner_id = $1` rows to admin (user_id=1) in one transaction.
- Then hard delete user from users table; sessions orphan.
- UX: immediate deletion; admin absorbs the data silently.
- Risk: data provenance lost; admin quota bloats; may hide inactive users' content.

**Recommendation:** Option A for transparency + data integrity (aligns with audit F-07 philosophy). Provide an "Owned data" summary before deletion (e.g., "3 quizzes, 12 results"). If Option B chosen, log the reassignment event for audit trail.

**Change:**
- `rust/server/src/http/users.rs`: add `DELETE /api/users/:id` handler (admin-gated).
  - Option A: count owned rows → return 409 if any found + hint.
  - Option B: reassign all owned data to admin in a single transaction, then delete.
- `packages/web/src/features/manager/components/configurations/ConfigUsers.tsx`: add a "Delete" action per user row (red/danger button); confirm dialog showing owned-data count + choice to proceed or cancel.
- `packages/web/src/locales/{de,en,es,fr,it,zh}/manager.json`: add keys `users.delete.action`, `users.delete.confirm`, `users.delete.ownedData` (German defaults in UI).

**Files:**
- `rust/server/src/http/users.rs` (add delete handler + summary query)
- `rust/server/src/db/users.rs` (new helper: `get_owned_data_summary(pool, user_id)` → counts per table; optional reassign fn per Option B)
- `packages/web/src/features/manager/components/configurations/ConfigUsers.tsx` (render delete button + confirm dialog)
- `packages/web/src/locales/{de,en,es,fr,it,zh}/manager.json` (i18n keys)

**Contract:** none (response is 204 No Content or 409 Conflict; no new types).

**Acceptance:** 
- Admin deletes user with no owned data → 204, user gone from list, login rejects.
- Admin tries to delete user with owned data (Option A) → 409 + hint shows (e.g., "3 quizzes").
- After deletion, owned data is either orphaned (Option A, owner_id NULL, visible to admin) or reassigned to admin (Option B, owner_id=1).
- `rust/gate.sh` GO, `pnpm verify` clean. Full-flow smoke (create user → delete → reconfirm gone) passes.

**Worker:** `codex-gpt5` (REST HTTP + confirmation UX + i18n). Escalation: `grok-build`.

**Wave:** B or C (disjoint from KL/USR/PRF, can run parallel).

---

### WP-MODI-UI — "Verfügbare Modi" im Moduswahl-Dialog optisch besser gestalten (Mode Selector UI Refresh)

**Requirement:** The mode selector in ConfigSelectQuizz.tsx (scoring/team/klassen/endScreen toggles) is currently functional but visually basic. Improve layout, spacing, labels, and visual feedback to match the Scandi design system (warm, readable, touch-friendly on mobile).

**Current state (verified against code):**
- `packages/web/src/features/manager/components/configurations/ConfigSelectQuizz.tsx` lines ~192–255: renders 4 optional toggles (scoring, team, klassen, endScreen).
- Uses `ToggleField` component (reusable, consistent).
- Layout: stacked vertically in a `space-y-2` container inside a gray `bg-gray-50` rounded card.
- Labels via `t("manager:gameMode.*", {defaultValue: "..."})` (German defaults).
- End-screen `<select>` is raw HTML, inconsistent with toggle styling.

**Gaps (visual/UX):**
- Toggles have sufficient spacing, but card padding (p-3) is tight on mobile (< 44px touch targets on 375px screen after 12px margin).
- End-screen select uses generic browser styling (gray border, no focus ring integration).
- No visual grouping/divider between "enablement toggles" (scoring/team/klassen) and "configuration select" (endScreen).
- Mode hint text (description in ToggleField) could be more prominent on mobile where the toggle label + hint wrap awkwardly.

**Design refinement (Scandi + mobile-first):**
1. **Card padding/spacing:** increase to p-4 on sm+ breakpoints; on mobile, ensure 44px min-touch-target (14px font + 30px padding ≈ needed).
2. **Grouping:** add a visual divider (thin border-top, gray-200) between toggles and endScreen select; optional section label "Konfiguration" above the select.
3. **End-screen select:** restyle to match input/toggle aesthetic (rounded-lg, border-2 border-hairline, focus:ring, same size as ToggleField). Reuse Input/Select component from `@razzoozle/web/components/` if available; else inline.
4. **Hint text (ToggleField description):** on mobile, drop the description into a collapsible detail or move to a tooltip; on desktop, keep inline.
5. **Motion:** stagger entry of toggles (already present via motion.div); ensure no jank on slow devices.

**Change:**
- `packages/web/src/features/manager/components/configurations/ConfigSelectQuizz.tsx`:
  - Wrap the mode toggles in a responsive container (tighter on mobile, roomier on desktop).
  - Add a divider/section label before endScreen select.
  - Restyle the endScreen `<select>` to match the Input component (or use Select if available).
  - Adjust ToggleField rendering: on mobile (via media-query or render prop), suppress description or move to aria-describedby tooltip.
  - Keep all i18n keys stable (no key renames).

**Files:**
- `packages/web/src/features/manager/components/configurations/ConfigSelectQuizz.tsx` (layout + styling).
- Optional: `packages/web/src/components/ui/` (if adding a Select component to match Input; reuse existing if available).
- No i18n changes (use existing keys; defaults remain as-is).

**Contract:** none (no type or payload changes; UI-only).

**Acceptance:**
- On iPhone 8 (375×667, DPR 2): all toggles + select have ≥ 44px touch targets; no text wrapping if avoidable.
- On iPhone 13 (390×844, DPR 3): hints are readable; spacing is balanced.
- End-screen select visually consistent with other form controls (rounded, focused state has ring, same color palette).
- Divider or grouping label clarifies the difference between mode-enablement and end-screen choice.
- Full-flow smoke on all three viewports (create game with all modes → select all toggles + endScreen variant → start → play → finish) passes without layout regressions.
- `pnpm verify` clean, no new dependencies.

**Worker:** `or-coder-free` (pure UI/CSS, no logic). Escalation: `local-coder-ov`.

**Wave:** B or C (disjoint from other WPs; can run in parallel).

---

### WP-BREITE — Editor-Breite und Responsivität (Editor Width Refinement)

**Requirement:** The quiz editor (QuizzEditorShell.tsx) has a 2xl max-width on desktop (110rem ≈ 1760px). On ultra-wide displays (> 2560px, e.g., 4K monitors or split-screen), the editor is centered with large margins. Expand max-width and refine responsive breakpoints to use more of the available space (especially on the question canvas) while keeping text readable.

**Current state (verified against code):**
- `packages/web/src/features/quizz/components/QuizzEditorShell.tsx` lines 25–27:
  ```tsx
  <div className="relative z-10 m-2 flex min-h-0 flex-1 flex-col overflow-hidden 
                 rounded-2xl bg-gray-50 shadow-lg sm:m-3 2xl:mx-auto 2xl:w-full 2xl:max-w-[110rem]">
  ```
- On desktop (md+): 3-column layout (sidebar, canvas, config) with `flex-row`.
- Max-width only applies at `2xl` breakpoint (1536px), and is capped at 110rem (1760px).
- On screens > 1760px, margins grow symmetrically (mx-auto centers it).

**Gaps:**
- The question canvas (middle column) squeezes when sidebar + config are both visible (md + config rail on xl+).
- On a 4K display (3840px), the canvas is still bounded, limiting visibility of complex questions (multi-row answers, long text).
- Responsive breakpoints could be finer (e.g., 3xl for 1920px+ monitors).

**Refinement (canvas-focused, text readability preserved):**
1. **Extend max-width:** change `2xl:max-w-[110rem]` to `3xl:max-w-[120rem]` or `4xl:max-w-full` + set a per-column width ceiling instead (sidebar capped at 280px, config capped at 320px, canvas flexible).
2. **Sidebar width:** constrain to max-w-xs (320px) or max-w-sm (384px) on xl+ to prevent it from hogging space.
3. **Config panel width:** if visible on xl+, cap at 24rem (384px) instead of flexible.
4. **Canvas breathing room:** remove or loosen max-width on md breakpoint; let it grow to fill available space minus sidebar/config, with a soft limit on line length (e.g., prose-like 65ch for question text).
5. **Margins:** reduce m-2 / sm:m-3 on ultra-wide (e.g., 2xl:m-4) to keep the surface edge-grounded.

**Change:**
- `packages/web/src/features/quizz/components/QuizzEditorShell.tsx`: adjust max-width, add 3xl breakpoint, cap sidebar/config widths.
- `packages/web/src/features/quizz/components/QuestionEditor.tsx`: if it has internal width constraints, review for ultra-wide compat (e.g., answer grid should reflowed, not squashed).
- Optional: `packages/web/src/features/quizz/components/QuizzEditorSidebar.tsx`: add max-w constraint (e.g., max-w-xs).

**Files:**
- `packages/web/src/features/quizz/components/QuizzEditorShell.tsx`
- `packages/web/src/features/quizz/components/QuizzEditorSidebar.tsx` (if needed)
- `packages/web/src/features/quizz/components/QuestionEditor.tsx` (review for word-wrapping, grid responsiveness)

**Contract:** none (layout-only).

**Acceptance:**
- On a 1920px desktop (FHD + external monitor): canvas width increases visibly; no text reflow regression.
- On 3840px (4K split-screen): editor surfaces ≥ 75% of canvas; question text is readable without scrolling horizontally.
- On mobile (375px): layout stays stacked, no regressions.
- Edit a multi-answer question on all three viewports; answers are not squashed, text wraps naturally.
- Full-flow smoke (create → edit → view in game) on desktop + mobile passes.
- `pnpm verify` clean.

**Worker:** `codex-gpt5` (responsive layout, Tailwind expertise). Escalation: `grok-build`.

**Wave:** B or C (disjoint; can run in parallel).

---

### WP-KI-ASSIST — KI-Overlay-Assistent: Generate-Panel UX Refinement (AI Assistant Overlay)

**Requirement:** The AI assistance panel in QuestionEditorAIAssist.tsx is functional but minimally designed. Refine the visual presentation, feedback during generation, and result preview to feel more integrated with the editor (less "overlay", more "sidebar assistant"). Add a small loading indicator, clearer action labeling, and better visual hierarchy.

**Current state (verified against code):**
- `packages/web/src/features/quizz/components/QuestionEditorAIAssist.tsx` (~320 lines): renders a 2-part UI:
  1. **Generation inputs:** topic field (for full Q generation) + distractor count (for distractor generation).
  2. **Pending result preview:** if AI has responded, shows the generated question or merged distractors; user can "Übernehmen" (apply) or "Verwerfen" (discard).
- Uses `Button`, `Input`, generic form controls.
- No loading spinner during generation; UX is "button clicked, then result appeared" (unclear if in-flight).
- Result preview is plain text/raw JSX (no visual polish).
- Pending state is modal-like (occupies the same space, covers inputs).

**Gaps (UX/visual):**
- Missing visual feedback during generation (button state, spinner, estimated time).
- "Übernehmen" / "Verwerfen" buttons appear only after result; no clear affordance for discarding result to generate another.
- Preview area doesn't visually distinguish from the input area (no card, border, or background).
- On mobile, the pending preview can push action buttons off-screen (small viewport).
- No animation between input → loading → result states (abrupt transitions).

**Refinement (incremental, low-risk):**
1. **Loading state:** while `genQuestion` or `genDistractors` is true, render a spinner (e.g., Loader component) + dim the inputs (opacity-50 + disabled). Show button loading state (spinner inside button + disabled).
2. **Result preview card:** wrap result in a `bg-blue-50 border-2 border-blue-200 rounded-lg p-4` card (subtle highlight, not intrusive). Add a small "Vorschau" (Preview) label or icon.
3. **Action buttons:** "Übernehmen" (green, primary) and "Verwerfen" (gray, secondary) always visible below the preview (or sticky footer on mobile); clarify intent with icon + label (e.g., `<CheckCircle2 />` for apply).
4. **Divider:** add a subtle `border-t border-gray-200` between input section and preview section to visually partition the UI.
5. **Motion:** add a smooth fade-in for the preview card (motion.div with duration 0.2s) so the result doesn't pop in abruptly.
6. **i18n:** verify all labels have i18n keys (currently using `t("manager:ai.generate.applied")` etc.). Add keys for "Preview" / "Action buttons" if missing.

**Change:**
- `packages/web/src/features/quizz/components/QuestionEditorAIAssist.tsx`:
  - Wrap the component's state (genQuestion, genDistractors) to render a loading overlay or dim the input section.
  - Restructure JSX: inputs (always visible, disabled during loading) → divider → preview card (with motion) + action buttons.
  - Import `Loader` component if not already imported.
  - Ensure all visible text has i18n keys (audit for hardcoded German/English).

**Files:**
- `packages/web/src/features/quizz/components/QuestionEditorAIAssist.tsx`
- `packages/web/src/locales/{de,en,es,fr,it,zh}/manager.json` (i18n keys for "Preview", action labels if missing).

**Contract:** none (pure UX refinement; no API/socket payload changes).

**Acceptance:**
- During AI generation (socket listening, before result), inputs are dimmed + button shows loading spinner.
- After AI responds, preview appears in a card with motion; "Übernehmen" and "Verwerfen" are clearly labeled and interactive.
- On iPhone 8 (375px): result preview doesn't push buttons off-screen; mobile UX is smooth.
- i18n audit: no hardcoded text leaks to UI (all via `t()`).
- Full-flow test: create question → open AI assist → generate Q → preview appears → apply → Q updates in editor. Repeat with distractors.
- `pnpm verify` clean, no new dependencies.

**Worker:** `codex-gpt5` (React/Tailwind UX refinement, motion). Escalation: `grok-build`.

**Wave:** B or C (disjoint; can run in parallel).

---

## Routing & Scheduling

| WP | Primary | Escalation | Task class | Suggested Wave |
|---|---|---|---|---|
| WP-UDEL | `codex-gpt5` | `grok-build` | REST HTTP + UX | B/C parallel |
| WP-MODI-UI | `or-coder-free` | `local-coder-ov` | CSS/responsive UI | B/C parallel |
| WP-BREITE | `codex-gpt5` | `grok-build` | layout/Tailwind | B/C parallel |
| WP-KI-ASSIST | `codex-gpt5` | `grok-build` | React UX + motion | B/C parallel |

**Recommended scheduling:**
- Run **WP-MODI-UI** + **WP-BREITE** + **WP-KI-ASSIST** in parallel (all pure UI, file-disjoint, no backend changes).
- **WP-UDEL** can run in parallel if HTTP + users.rs don't collide with other in-flight Wave B changes (WP-USR/PRF already merged).
- If running with Wave B sequence (USR → PRF): defer WP-UDEL to C1 (after B merges).
- Deploy all four together in a single Wave C if kept separate from Wave B security/class work.

---

## Definition of Done (Addendum)

- All 4 WPs' acceptance criteria met; diffs read and verified (not self-reported).
- `bash rust/gate.sh` GO (if touching Rust; WP-UDEL does); `CI=true pnpm --filter @razzoozle/web run types` clean; `pnpm verify` green.
- No new dependencies introduced.
- i18n audit complete (all visible text via `t()`, no hardcoded strings).
- Full-flow browser smoke on all three viewports (375/390/440 px) passes:
  - WP-UDEL: create user → delete user → reconfirm gone.
  - WP-MODI-UI: select game → enable all modes → adjust endScreen → start game → play → finish.
  - WP-BREITE: edit question on 4K virtual display + mobile; no layout regressions.
  - WP-KI-ASSIST: generate question via AI → preview → apply; generate distractors → apply.
- Both remotes (gitea + github) at final SHAs; `routing-outcome record` per worker.
- No security regressions (F-01 to F-14 remain mitigated; no new auth gaps introduced by delete endpoint).

---

## Non-Goals (YAGNI)

- Do NOT refactor the ToggleField component; reuse as-is for WP-MODI-UI (UI composition only, no new abstraction).
- Do NOT introduce a Select component if Input can be reused; use native `<select>` with Tailwind styling if needed.
- Do NOT migrate ConfigUsers to a data table library; keep it as a simple list (delete action is one more button per row).
- Do NOT change the AI provider routing, quotas, or cost model; WP-KI-ASSIST is UX only.
- Do NOT add tests beyond what `pnpm verify` already covers (regression tests are optional; full-flow smoke is the gate).

---

## Freshness Notes

Reconnaissance conducted against live deployed SHA `2d8c70cc` (2026-07-14, 18:00 UTC). If main has drifted significantly (new users.rs endpoints, QuizzEditorShell refactors), re-verify file line numbers before dispatch.

Timestamp fields (created_at) verified in 007/008 migrations; session model conforms to `sessions` table schema (user_id, token_hash, expires_at).
