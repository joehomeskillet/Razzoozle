# Wave-D Feature SDD — Razzoozle Rust twin (Addendum to wave2-feature-bug-sdd-2026-07-14.md)

## Introduction

The following 4 work packages (WP-DEL, WP-MODI, WP-EDW, WP-KIGEN) constitute Wave D of the Razzoozle Rust migration, commissioned 2026-07-14. They execute *after* the current wave2 plan (A completed; B — Klassen/roles/passwords — completed; C = WP-QT question-type coverage; plus the separate security track from `docs/security/rust-razzoozle-security-audit-2026-07-13.md`). Orchestration follows the established pattern: Fable 5 routes via agent-dispatch; CLI workers (codex-gpt5, grok-build, sonnet-worker) implement; design work (WP-MODI, WP-EDW, WP-KIGEN) proceeds through frontend-design spec → design-validator → implementation gates.

---

## WP-DEL — User Deletion (Admin Console)

**Requirement**
Managers (admins) lack the ability to hard-delete users from the system. Only enable/disable (soft deactivation) is currently available. Hard deletion is required to support account lifecycle management; orphaned owned data (quizzes, results, submissions) is acceptable per existing FK cascade schema.

**Change**
- Backend: Add `DELETE /api/users/:id` endpoint (admin-only guard, self-delete and last-admin validation)
- DB cascades: `sessions`, `user_ai_keys`, `classes`, `students` are purged via `ON DELETE CASCADE`; quiz ownership, game results, submissions remain with `owner_id=NULL`
- Frontend: Add Trash icon to ConfigUsers row-actions; confirmation modal ("Benutzer [name] löschen? Diese Aktion kann nicht rückgängig gemacht werden."); refresh list on success
- No audit schema, no reassignment logic, no new tables

**Files**
- `rust/server/src/http/users.rs` (add delete handler, validation helpers)
- `rust/server/src/http/mod.rs` (register DELETE route, ~line 225)
- `rust/server/src/db/users.rs` (add `delete_user()` and `is_last_admin()` helpers)
- `packages/web/src/features/manager/components/configurations/ConfigUsers.tsx` (row-action icon + modal)

**Cascade — VERIFIED against live DB (orchestrator):** `DELETE FROM users WHERE id=X` runs without FK block. `ON DELETE CASCADE`: `sessions`, `user_ai_keys`, `classes`, `students`. `ON DELETE SET NULL`: `quizzes`, `game_results`, `solo_results`, `assignments`, `submissions`, `catalog_entries`, `media_assets`, `themes`. **Consequence to surface in the confirm dialog: deleting a user (esp. a Lehrkraft) also deletes their classes + student rosters** — the modal copy should warn about this, not just "cannot be undone".

**Contract**
- Route: `DELETE /api/users/:id`
- Responses: 200 OK, 403 Forbidden ("Cannot delete your own user account"), 409 Conflict ("Cannot delete the last admin user"), 404 Not Found, 500 error
- Types unchanged: User, UserRole carry no new fields
- Cascade rules: Sessions, keys, class memberships, student records deleted; quiz metadata, game results orphaned (owner_id → NULL)

**Acceptance**
- User created and deleted as admin → user removed from ConfigUsers list, subsequent login returns 401
- Self-delete attempt returns 403 with message
- Last-admin delete attempt returns 409 with message
- Sessions cascade-purged (existing auth tokens invalid)
- Owned resources orphaned but persist (`SELECT COUNT(*) FROM quiz_versions WHERE owner_id IS NULL` shows orphaned count)
- Confirmation modal displays name, cancels on ESC/backdrop click, confirms on "Löschen" button

**Worker**
codex-gpt5 (primary); escalate to grok-build if Rust CI/clippy fails.

**Wave**
D

---

## WP-MODI — Mode Selector Token Binding (ConfigSelectQuizz)

**Requirement**
The mode selector block in ConfigSelectQuizz.tsx (lines 192–254) uses hardcoded Tailwind colors (`bg-gray-50`, `text-gray-700`, `border-gray-300`, `ring-blue-500`) and lacks visual integration with the Razzoozle design system. Text styling drifts from design.md §3 tokens. Goal: re-bind all colors, shadows, and spacing to the design-token layer, ensuring visual consistency with the manager console.

**Design Approach**
Adopt the **surface card recipe** from design.md §3·B:
- Container: `bg-[var(--surface)]` (white) + `rounded-[var(--radius-theme)]` (16px) + `border border-[var(--border-hairline)]` (1px WCAG hairline) + `shadow-[var(--shadow-flat)]` + `p-4`
- Text (labels, descriptions): all bind to `text-[var(--game-fg)]` (ink; #0E1120). Remove hardcoded `text-gray-700` and `text-gray-500`. Use full opacity (no opacity hacks for muted text).
- Inputs (scoringMode toggle, endScreenModes select): `border-[var(--border-hairline)]`, `ring-[var(--color-primary)]` on focus (no `ring-blue-500`), `text-[var(--game-fg)]` for labels
- Motion: Reuse existing pattern from codebase (check `reducedMotion` hook; conditionally render transitions per site-wide Framer setup)
- No new component additions in this WP (segmented control deferred to separate design-spec phase if needed)

**Change**
- [ ] ConfigSelectQuizz.tsx: Update container `className` from `bg-gray-50 p-3 ...` to full surface card recipe: `bg-[var(--surface)] rounded-[var(--radius-theme)] border border-[var(--border-hairline)] shadow-[var(--shadow-flat)] p-4`
- [ ] ConfigSelectQuizz.tsx: Bind all label/description text colors to `text-[var(--game-fg)]`; remove `text-gray-700` and `text-gray-500`
- [ ] ToggleField.tsx (if separate): Update default `labelClassName` to use `text-[var(--game-fg)]` instead of hardcoded `text-gray-700`; update description color similarly
- [ ] ConfigSelectQuizz.tsx: Update endScreenModes `<select>` element: `border-[var(--border-hairline)]`, `ring-[var(--color-primary)]` on focus, `text-[var(--game-fg)]` for option text; remove `border-gray-300` and `ring-blue-500`

**Files** (paths corrected against the real tree by orchestrator)
- `packages/web/src/features/manager/components/configurations/ConfigSelectQuizz.tsx` (mode selector block ~lines 190–260; container className, label colors, select element)
- `packages/web/src/components/ui/ToggleField.tsx` (shared toggle; update default label/description text color)

**Contract**
None — pure token re-binding. No payload changes, no type changes, no handler changes.

**Acceptance**
- **Visual:** Container displays surface card (white, rounded, hairline border, flat shadow, 16px padding) with no hardcoded gray-* or blue-500 in final markup
- **Contrast:** All label + description text meets APCA 4.5:1 minimum (text-[var(--game-fg)] on white surface = 7:1+)
- **Functional:** Mode toggles + endScreenModes select retain all existing behavior (onChange handlers unchanged, value binding intact)
- **Keyboard a11y:** Tab through all form fields; Enter/Space select toggle; focus visible on select element; no regressions
- **Reduced-motion:** Transitions (if any) guarded by existing `reducedMotion` hook or project-wide Framer setup; no hardcoded `.transition-` classes without guard
- **Cross-browser:** Test sm (mobile), md (tablet), lg/xl/2xl (desktop) for any layout drift from border/shadow changes

**Worker**
@css-bugfixer (token binding + Tailwind class updates). **Prerequisite design-spec phase:** If component redesign beyond token-binding (e.g., segmented control UI) is requested, submit as separate design-spec WP to @frontend-design first.

**Wave**
D

---

## WP-EDW — Quiz Editor Container Width Alignment

**Requirement**
The QuizzEditorShell container width must match the manager console layout on all viewport sizes. Currently, desktop (2xl breakpoint, 1536px+) applies different max-width constraints to the editor, causing misalignment with the ConfigSelectQuizz + ConfigUsers panes.

**Design Approach**
Consolidate container styling to the **surface card recipe** (design.md §3·B) and remove breakpoint-specific width overrides:
- Container: `bg-[var(--surface)]` + `rounded-[var(--radius-theme)]` + `border border-[var(--border-hairline)]` + `shadow-[var(--shadow-flat)]` + consistent margins (`m-2` mobile, `sm:m-3` tablet+)
- Remove `2xl:mx-auto`, `2xl:w-full`, `2xl:max-width-[110rem]` constraints that diverge from manager console layout
- Verify that both editor and manager console share the *same* responsive max-width constraint on 2xl viewports (coordinate with orchestrator on target value)
- Test on ultra-wide displays (27″, 2xl viewport) to confirm no horizontal scroll and readability on both cream field (player views) and neutral background (manager views)

**Change**
- [ ] QuizzEditorShell.tsx line ~27: Update className from `... 2xl:mx-auto 2xl:w-full 2xl:max-w-[110rem] ...` to remove breakpoint overrides and consolidate to: `"relative z-10 m-2 sm:m-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-theme)] bg-[var(--surface)] border border-[var(--border-hairline)] shadow-[var(--shadow-flat)]"`
- [ ] Verify manager console's equivalent className (ConfigSelectQuizz) uses identical max-width strategy; coordinate with worker to confirm both converge to same constraint

**Files** (paths corrected by orchestrator)
- `packages/web/src/features/quizz/components/QuizzEditorShell.tsx` (container className carries `m-3 2xl:mx-auto 2xl:w-full 2xl:max-w-[110rem]` — this is the editor's current width constraint)
- Manager console width lives in `packages/web/src/features/manager/components/console/ConsoleShell.tsx` (reference for comparison; the implementer confirms which of the two carries the divergent max-width and converges them). **Resolved: editor currently pins `2xl:max-w-[110rem]`; converge the manager console to the same value (or vice-versa) — pick one constraint, apply to both.**

**Contract**
None — pure layout/styling. No type changes, no handler changes.

**Acceptance**
- **Width alignment:** Editor and manager console render at identical content width on sm (375px), md (768px), lg (1024px), xl (1280px), 2xl (1536px) breakpoints
- **Scroll behavior:** No horizontal scroll introduced on any breakpoint when resizing editor toolbar, sidebar, or content pane
- **Margin consistency:** Editor margins match manager console (8px mobile `m-2`, 12px tablet+ `sm:m-3`)
- **Color/shadow/radius:** Container uses `bg-[var(--surface)]`, `shadow-[var(--shadow-flat)]`, `rounded-[var(--radius-theme)]` (no hardcoded gray-50/gray-200/rounded-2xl)
- **Context verification:** Visually confirm editor shell on both player view (cream field background) and manager console (neutral background) for surface legibility and intentionality
- **No regressions:** ConfigSelectQuizz appearance unchanged; existing manager layout stable

**Worker**
@css-bugfixer (layout + token binding).

**Wave**
D

---

## WP-KIGEN — AI Generation Modal (Wizard Flow)

**Requirement**
The inline AI control section in QuestionEditorConfig (topic input, distractor slider, button, live preview) clutters the sidebar and obscures the sequential nature of AI-assisted question generation. Collapse this UI into a single "mit KI generieren" button in the editor toolbar; clicking opens a **guided modal wizard** with a streamlined 2-step flow: (1) topic prompt + question type selection, (2) generated question preview with insert/regenerate options. Goal: reduce editor sidebar visual density and establish a clear, discoverable AI workflow.

**Design Approach**
- **Modal Overlay:** Fixed-position scrim (`bg-black/40` WCAG: 40% opacity over black) + surface card (`bg-[var(--surface)] rounded-[var(--radius-theme)] border-[var(--border-hairline)] shadow-[var(--shadow-flat)]`), no blur
- **Focus & Escape:** Focus trap (tab cycles within modal); ESC key and backdrop click both close modal without saving
- **2-Step Flow:**
  - Step 1: Topic text input (max 200 chars with counter), dropdown (question types: choice, boolean, multiple-select, type-answer), "Generieren" CTA (enabled when topic ≥1 char)
  - Step 2: AI-generated question preview (text + answer options, solutions highlighted) + "Übernehmen & schließen" (inserts into editor) + "Neu generieren" (re-calls backend, updates preview in-place)
- **No new components:** Use existing surface card, button recipes, text input patterns from design.md §3·B; button styling: primary CTA (`bg-[var(--color-primary)] text-white`), secondary/ghost fallbacks
- **Accessibility:** APCA contrast verified (text-[var(--game-fg)] on --surface ≥ 7:1 AA), reduced-motion respected (inherit Framer Motion setup from game context), live region for generation status, focus visible on all interactive elements
- **Portal:** Render to `document.body` to avoid z-stack conflicts with editor panel
- **Error Handling:** On `ai:error` broadcast or rate limit: show inline error message in modal, retain Step 1 state, show cooldown timer if applicable, disable "Generieren" until cooldown expires

**Change** (paths corrected by orchestrator — the existing "mit KI generieren" area is `QuestionEditorAIAssist.tsx`, 386 lines, NOT a `QuestionEditorConfig.tsx`)
- [ ] Create sub-components under the existing editor dir `packages/web/src/features/quizz/components/QuestionEditor/` (each <200 LOC per monolith-guard):
  - `AIAssistantModal.tsx` (frame, state routing, portal)
  - `AIStep1.tsx` (topic input, type dropdown, generate button)
  - `AIStep2.tsx` (preview display, insert/regenerate buttons)
- [ ] `packages/web/src/features/quizz/components/QuestionEditorAIAssist.tsx`: collapse the current inline AI control cluster into a single "mit KI generieren" button that opens the modal; move/reuse its existing `ai:generateQuestion` wiring into the modal steps (do not duplicate socket logic).
- [ ] i18n: add keys to `packages/web/src/locales/{de,en,es,fr,it,zh}/quizz.json` (per-namespace locale files — there is NO `src/i18n/de.json`). Keys under a `ai.modal.*` object; translate all 6 locales.
- [ ] Wire existing socket events: `ai:generateQuestion` (step 1 → step 2 preview) + existing backend rate limit (4s cooldown, 20 max per socket)
- [ ] Handle `ai:error` broadcast: display message in modal, disable "Generieren", optionally show retry timer

**Files**
- `/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/QuestionEditor/AIAssistantModal.tsx` (new modal frame, state machine)
- `/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/QuestionEditor/AIStep1.tsx` (new, topic + type input)
- `/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/QuestionEditor/AIStep2.tsx` (new, preview + actions)
- `/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/QuestionEditor/QuestionEditorConfig.tsx` (remove inline section, add modal trigger)
- `/nvmetank1/projects/Razzoozle/source/packages/web/src/i18n/de.json` (i18n keys)

**Contract**
- **Events (reused, no new backend code):**
  - `ai:generateQuestion` payload: `{ topic: string, type: 'choice'|'boolean'|'multiple-select'|'type-answer', answerCount?: number, language: 'de' }` → returns `Question` object (insertion-ready, no ID fixup needed)
  - Backend enforces rate limit: 4s cooldown + 20 max per socket; frontend UI disables button + shows cooldown timer on limit
  - `ai:error` broadcast: `{ error: string }` → modal displays error, retains Step 1 state
- **Types:** No new types; Question contract unchanged (insertion flow handles null questionId)
- **Backend:** No new endpoints, no new Rust code; reuses existing `socket/ai.rs` handlers

**Acceptance**
1. **Button & Modal:** "KI-Assistent" button visible in editor toolbar; opens modal on click
2. **Step 1:** Topic input accepts max 200 chars (counter shown); question type dropdown (4 options); "Generieren" enabled when topic ≥1 char; disabled until response or error
3. **Generation:** Button disabled + spinner shown during `ai:generateQuestion` call; Step 2 displays generated question text + answer options (solutions highlighted per existing UX)
4. **Step 2 Actions:** "Übernehmen & schließen" calls editor's `updateQuestion()` with generated Question, closes modal, enables normal save; "Neu generieren" re-calls `ai:generateQuestion`, updates preview in-place without re-rendering modal frame
5. **Error Handling:** If `ai:error` or rate limit triggered: show inline error message in modal (e.g., "KI nicht verfügbar. Bitte XX Sekunden warten."), disable "Generieren", optionally show countdown timer, retain Step 1 input
6. **Close:** Modal closes on "Übernehmen & schließen", ESC key, or backdrop click (no unsaved prompt loss)
7. **Accessibility:** Focus trap (tab loops within modal without escaping); focus visible on all interactive elements; text meets APCA 4.5:1 minimum (text-[var(--game-fg)] on --surface); motion disabled on `prefers-reduced-motion: reduce` (inherit Framer Motion setup or check `reducedMotion` hook)
8. **Responsive:** Modal centers and scales on sm/md/lg/xl/2xl viewports; no horizontal scroll; backdrop covers entire viewport
9. **Component structure:** Each sub-component (AIStep1, AIStep2) <200 LOC; no new npm dependencies; reuses existing socket client, state hooks, i18n

**Worker**
**Prerequisite design-spec:** Submit to @frontend-design first for modal frame spec (scrim, surface card recipe, button placement, typography, spacing per design.md §3·B). After design spec approved: grok-build or sonnet-worker for implementation (modal routing + event wiring + error handling).

**Wave**
D

---

## Waves & Routing

| WP | Primary Worker | Escalation | Task Class | Design Gate | Notes |
|---|---|---|---|---|---|
| WP-DEL | codex-gpt5 | grok-build (CI/clippy) | backend + frontend | — | Owns DELETE /api/users/:id + ConfigUsers row action; cascade rules verified; no design changes |
| WP-MODI | @css-bugfixer | — | frontend (token binding) | design-validator | Token-bind existing components to design.md §3·B; no new UI components in this WP; segmented control deferred to separate design-spec if needed |
| WP-EDW | @css-bugfixer | — | frontend (layout) | design-validator | Align editor + manager console widths; consolidate to surface card recipe; test all breakpoints |
| WP-KIGEN | grok-build / sonnet-worker | — | frontend (modal + socket) | **frontend-design spec** | Modal frame + button placement + typography spec required before implementation; design-validator gate after build; reuses socket events (no Rust code) |

**Design Gate Requirements:**
- **WP-MODI, WP-EDW:** Before merging, run `design-validator` (configured for project); verify all Tailwind classes reference tokens (no hardcoded color/radius/shadow classes); confirm APCA contrast on all text.
- **WP-KIGEN:** Before coding modal, @frontend-design produces spec (scrim style, surface card recipe, button tokens, typography, spacing, focus/error states). After implementation, run design-validator on modal + AIStep components.

---

## Definition of Done (Wave D)

- [ ] **WP-DEL:** DELETE /api/users/:id tested (self-delete → 403, last-admin → 409, cascade-purge verified), ConfigUsers row action + modal implemented, user delete confirmed via SELECT, no regressions in User/UserRole types
- [ ] **WP-MODI:** All label/description text bound to `text-[var(--game-fg)]`, container uses surface card recipe, endScreenModes select uses token-bound styling, design-validator passes (no hardcoded Tailwind classes in output), a11y contrast verified (APCA 4.5:1+), scoringMode toggle + endScreenModes select behavior unchanged
- [ ] **WP-EDW:** Editor + manager console widths match on sm/md/lg/xl/2xl, no horizontal scroll introduced, color/shadow/radius drift closed (surface card recipe applied), design-validator passes, visual check on both player (cream) and manager (neutral) contexts, no ConfigSelectQuizz regressions
- [ ] **WP-KIGEN:** Frontend-design spec produced and approved by orchestrator; modal frame implemented (2-step flow, focus trap, portal to body), AIStep1 + AIStep2 components each <200 LOC, socket event wiring verified (ai:generateQuestion reused, rate limit UI working), error handling + rate-limit timer shown, design-validator passes, a11y contrast + reduced-motion verified, no new backend code
- [ ] **All WPs:** Committed to worktree branch, PR created with spec link, CI passes (TS typecheck, Rust clippy if applicable), code review approved, merged to main by orchestrator, deployed to staging, smoke tested (WP-DEL: user delete flow; WP-MODI/WP-EDW: visual regression check; WP-KIGEN: modal open/generate/insert flow)
- [ ] **Regular autosave:** Wave D branch pushed to GitHub (`origin/<branch>`) after each WP completion; git log shows individual commits per WP (not squashed)

---

## Open Decisions for Orchestrator

1. **WP-KIGEN 2-step vs. 4-step flow:** Current spec proposes 2-step (topic/type → preview/insert). Original draft included Step 4 (distractor refinement). Confirm: Is distractor refinement *post-insertion* (separate "Edit Distractors" button) or *in-modal*? This affects modal complexity and component splitting strategy.

2. **WP-EDW target width:** ~~open~~ **RESOLVED (orchestrator):** editor `QuizzEditorShell.tsx` pins `2xl:max-w-[110rem]`; converge the manager console (`ConsoleShell.tsx`) to the same `110rem`. Single constraint = `2xl:max-w-[110rem]`.

3. **WP-MODI segmented control:** If future waves request scoringMode segmented UI (instead of toggle), is this a separate design-spec + implementation WP, or in-scope for a follow-up token-binding pass? Current spec defers segmented control to post-WP-MODI design work.

4. **WP-KIGEN backend rate-limit UX:** Backend enforces 4s cooldown + 20 max per socket. Frontend should show countdown timer on limit. Confirm: Is a persistent cooldown timer acceptable, or should modal close + re-open button when limit clears? Current spec opts for in-modal timer + disabled button.
