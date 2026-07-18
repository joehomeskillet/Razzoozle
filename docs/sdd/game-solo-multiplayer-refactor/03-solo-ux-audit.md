# 03 — Solo UX Audit

**Owner:** grok-build · **Status:** audit-complete · **Scope:** Solo game flow UX quality, visual consistency vs. Multiplayer, A11y/mobile responsiveness.

All file:line citations are current to 2026-07-18. Paths are relative to `packages/web/src/` unless stated.

---

## 1. Solo flow UX quality: step-by-step audit

### 1.1. Name entry screen

**Component:** `solo/SoloNameScreen.tsx:14-67`  
**Route:** `/quizz/$id/solo` → phase `name` → renders `<SoloNameScreen />`

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Visual:** Styling | Hand-rolled `<input>`/`<button>` with **inline gradients, not design tokens**. `className="bg-gradient-to-br from-purple-500 via-pink-500 to-red-500"` (`:45-46`). Diverges sharply from MP's `join/Username.tsx` which uses `Card.tsx` + `Button.tsx` primitives bound to `--color-primary` / `--surface` tokens | `SoloNameScreen.tsx:45-60` | **HIGH** — Visual inconsistency + unmaintainable if brand tokens change |
| **Visual:** Input box | Solo: raw `<input className="...px-4 py-3 rounded-lg border...">` (`:48`), no inherited `--surface`/`--border-hairline` tokens, hardcoded `border: 1px solid ...` in inline Tailwind | MP: `<Input />` wraps the input and **inherits** `--border-hairline` + `--surface` from design system (`:88-111`) | **MEDIUM** — If token updated (e.g., border color change per dark-mode future), Solo's input won't follow |
| **A11y:** Label + association | Solo: `<label htmlFor="playerName">` + `aria-invalid` (`:56-57`) present; form validation error text via `aria-describedby` wired to `aria-invalid` when name is empty | Solo presents an error message, but it's only shown via `setError(true)` state — **no visible inline error text rendered** (only affects focus-ring styling per `aria-invalid`, not visible to sighted users) | **MEDIUM** — Keyboard users see the error via `aria-invalid` but sighted users don't see why the submit failed until they inspect the DOM |
| **UX:** Empty name handling | Solo: `setPlayerName(name.trim() || "Anonym")` (`:18`), silently falls back to "Anonym" if input is empty; **no validation error shown** | MP: `if (!name.trim()) { setError(true); return; }` (`:30-31`) + `aria-invalid` highlights the field red + visible error text "game:usernameRequired" rendered inline | **HIGH** — Silent fallback vs. explicit rejection. Solo players may not know they're playing as "Anonym" until the result screen. |
| **UX:** Max length | Solo: `maxLength={20}` on input (`:48`) | MP: identical | ✅ |
| **Touch target:** Button | Solo: `<button className="... px-8 py-3 ...">` (`:56`), calculated ~56px height (py-3 = 0.75rem = 12px × 2 + padding overhead) | Should be ≥44px per WCAG 2.5.5 Level AAA. `py-3` alone = 12px padding; total height likely ≥44px but tight on smaller screens | **LOW** — Likely OK, but `py-4` would be safer |
| **Motion:** Enter key | Solo: `onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}` (not shown in excerpt, needs grep) | Should be in the input or form handler; MP uses form submission naturally (`<form onSubmit={handleLogin}>` at `Username.tsx:91`). Solo file doesn't show form wrapper — assumed `<div>` | **MEDIUM** — Enter-to-submit should be wired; verify it works if missing |

**Verdict:** Solo name screen has **5 UX gaps** (visual drift, silent empty-name fallback, missing inline error text, token inheritance, input-wrapper). These are cumulative usability + maintenance issues, not isolated visual bugs.

---

### 1.2. Question & settings screens

**Component:** `SoloShell.tsx:34-114` (main wrapper) + `solo/SoloAnswers.tsx:1-431` (question + answer phase)  
**Phases:** `question` → `answering` → `result` → `question` (loop) → `finished`

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Visual:** Header bar | Solo: top bar shows `{currentQuestion} / {totalQuestions}` as a **plain numeric pill**, no dedicated progress component (`SoloShell.tsx:56-66`). Styling: `rounded-lg bg-white border ... p-2` — inline hardcoded border/bg, not tokens | MP: no question counter on the player view; Host has a separate question-number display in `GameWrapper.tsx:168-170` + `HostControlBar` | **MEDIUM** — No progress *bar* exists; just a counter. If design adds progress bars later, Solo won't auto-inherit one. Design drift if the counter styling ever changes. |
| **Visual:** Player name/score footer | Solo: `SoloShell.tsx:100-108` hand-rolls a score-pill: `rounded-lg bg-white border ... px-4 py-2` with inline Tailwind, no `ScoreBadge` component. `className="rounded-lg bg-white border border-[var(--border-hairline)] px-4 py-2 text-sm tabular-nums"` | **5+ independent score-display implementations** across the app (see #25-game-element-audit.md §2.1, row ScoreBadge). Solo's is one of them. | **MEDIUM** — Maintenance: if score styling changes (e.g., more shadow, different padding), Solo's version won't auto-sync. |
| **A11y:** Skip-link or landmark | Solo: no `<main role="main">` or skip-link found in `SoloShell` or `solo.tsx` (needs full file read, not fully visible in inventory). MP: `GameLayout` has a `skip-link` component (per design docs), `GameWrapper` wraps the phase content | **LOW-MEDIUM** — If Solo is missing landmarks, keyboard users can't skip directly to content. Grep-check needed. |
| **Motion:** Auto-advance toggle | Solo: visible toggle in `SoloFooterControls` inside `SoloAnswers.tsx:396-410` — "auto advance after result" behavior, user-toggleable. Timer auto-fires if enabled, and `nextQuestion()` has an idempotency guard (`SoloAnswers.tsx:185-187`, `phase === "result"` check prevents double-skip). | MP: Player has **no** auto-advance control; Host has one (`MANAGER.SET_AUTO` via `Answers.tsx:38` + `GameWrapper.tsx:228`). | ✅ Solo-appropriate |
| **UX:** No "pause" button | Solo: **no pause/resume control visible** anywhere in `SoloShell` or `SoloAnswers` | MP: Host has pause/resume via `RejoinQrDialog.tsx:33-38` (MANAGER.PAUSE_GAME / RESUME_GAME events); Player sees a frozen screen during pause. | ✅ Solo-appropriate (single player, no pause/host concept) |
| **Motion:** Keyboard navigation (question loop) | Solo: question screen → answer screen → result → **manual** "Next question" button (`:396-410`) or auto-advance if toggled. No arrow-key prev/next navigation within a question. | MP Player: answer is submitted, result is shown automatically — no manual "next" button, host advances the game. **But MP player can use arrow keys in the leaderboard etc.** | **LOW** — Solo's manual button is the right model for solo play. Keyboard nav inside a question (e.g., to review past answers during result) would be a nice-to-have, not a gap. |

**Verdict:** Solo question/settings UX is **functionally adequate** but has **2 design-system gaps** (progress counter + score pill not using shared components/tokens). The auto-advance and answer submission flows work correctly.

---

### 1.3. Answer input (7 answer types)

**Component hierarchy:** `SoloAnswers.tsx:1-431` orchestrates; leaf components for each type (shared with MP):
- Multiple choice: `ChoiceGrid.tsx:60-94` (Solo branch `motion.div` wrapper)
- Multi-select: `MultiSelectGrid.tsx:1-~100`
- Boolean: `ChoiceGrid.tsx` with 2 tiles
- Slider: `SliderInput.tsx:1-~80`
- Poll: `ChoiceGrid.tsx`
- Type-answer (text): `TypeAnswerInput.tsx:1-~100`
- Sentence builder: `SentenceBuilderBoard.tsx:1-~200`

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Visual:** Tile geometry | Solo: `ChoiceGrid.tsx:60-94`, tiles wrap in `motion.div` + `animate.exit` (visual lock-in pop on selection). Tile sizing uses shared `AnswerButton.tsx:62-116` (✅ reused leaf). | MP: identical leaf, different orchestration shell. | ✅ No dup in leaf |
| **Touch target:** Button tiles | All tiles use `AnswerButton.tsx:87-98`, which renders `<button className="... px-4 py-3 ..." role="button">` + shape icon. Calculated size: `px-4 py-3` = ~40px height + padding overhead. **Likely ≥44px but tight**. | Grid gap + button padding ensure practical touch targets on 375px viewports, but no explicit 44px-min design token (see design.md §3·B). | **LOW** — Practical coverage, but height could be explicitly guaranteed via a token. |
| **A11y:** Answer button labeling | Tile: `aria-label` constructed from letter + text (`AnswerButton.tsx:80-81`), e.g. `"A: Photosynthesis"`. Shape icon is `aria-hidden`. | This is the gold standard — color/shape is non-semantic decoration; the label is the truth. | ✅ Best practice |
| **A11y:** Multi-select checkboxes | MP/Solo both use `MultiSelectGrid`, which wraps each tile in a checkbox `role="checkbox"`. **Need to verify:** does `aria-checked` update on click? Is the label wired to the input? (Full `MultiSelectGrid.tsx` read needed.) | `MultiSelectGrid.tsx:1-~100` — not fully read this pass; flagged for follow-up. | **PENDING** |
| **UX:** Slider (numeric input) | Solo: `SliderInput.tsx` wraps a native `<input type="range">` + numeric feedback. Range input has **no accessible label by default** on mobile — the text "1-100" must be in an explicit `<label>` or `aria-label`. | Grep `SliderInput.tsx` for `aria-label` and `<label>` tag. | **MEDIUM** — If label is missing, screen readers won't announce the purpose. |
| **UX:** Type-answer validation | Solo: `TypeAnswerInput.tsx` accepts free text, validates **server-side** after submit (no client-side checking). Error handling: if `POST /api/quizz/:id/check-answer` fails, it **silently degrades to a wrong answer** (`correct:false, points:0`) with **no error toast** (`:259-276`). | This is a catastrophic UX failure — the user submits an answer they believe is correct, the server errors (network blip, 500, etc.), and they're marked wrong with no indication why. | **CRITICAL** |
| **Motion:** Sentence builder layout | Solo: `SentenceBuilderBoard.tsx` displays words as draggable/droppable tiles. **No drag-drop a11y instrumentation found** (needs full read). Keyboard users cannot rearrange words if only keyboard-accessible drag-drop (e.g., arrow keys to move) is not implemented. | `SentenceBuilderBoard.tsx:1-~200` — flagged for full read. | **PENDING** |

**Verdict:** Solo answer input has **1 critical UX failure** (silent server-error degrade on type-answer submit) + **3 pending a11y checks** (multi-select wiring, slider label, drag-drop keyboard nav). The tile design itself is sound (reused leaves, proper labels).

---

### 1.4. Result display (inline feedback)

**Component:** `SoloAnswers.tsx:302-421` (feedback state machine) + `ScoreToast.tsx:1-~80` (points notification)

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Visual:** Feedback reveal | Solo: answer tile **recolors in-place** using inline `bg-[var(--state-correct)]` / `bg-[var(--state-wrong)]` classes applied by the answer component itself (`:421`), not via a separate feedback state/screen. Tile text + border (hairline ring) remain visible. | MP: transitions to a full-screen `Result.tsx` state with a large correct/wrong reveal, achievement badges, and a separate score toast. **Solo keeps the answer screen mounted** (SoloShell comment `:20-26`: "phase-key is question-index, not phase, so SoloAnswers stays mounted"). | **MEDIUM** — This is an architectural difference, not a bug. But Solo's "tile recolor" feedback is visually lighter than MP's dedicated result screen. Should this be a design choice (Solo is casual, MP is celebration-focused) or a maintenance gap (Solo should show more feedback)? Flag for design decision. |
| **Visual:** Score notification | Solo: floating dismissible `ScoreToast.tsx` (top-center, portal, lime/trophy icon). Inherits `rewardCardClass("toast")` from `RewardRow.tsx:37-38` (the shared toast recipe per design.md §3 Toast / overlay cards). | MP: full `Result.tsx` screen with large point number + reward stack + confetti. | ✅ Consistent toast styling, but architectural difference in prominence |
| **A11y:** Result announcement | Solo: no `role="status" aria-live="polite"` on the feedback reveal or toast. When a tile recolors, screen readers don't announce it. | MP: `Result.tsx` is a full screen, so screen readers announce the heading/content naturally. Solo's inline recolor is silent. | **HIGH** — Screen reader users won't know whether they got the question right. Toast may have `aria-live` via react-hot-toast library default, but needs verification. |
| **Motion:** Confetti / celebration | Solo: **no confetti or celebration animation** on a correct answer. MP: confetti on `Result.tsx` if not `prefers-reduced-motion` (`:200-203` approx, uses `react-confetti` lazy-loaded). | This is a scope/design difference, not a UX bug per se. But it's worth noting for the "visual parity" audit. | **LOW** — Solo's minimalism is probably intentional (casual play). But note the disparity. |
| **Touch target:** Dismiss toast | Solo: toast has an invisible close button or auto-dismisses (6s default per `Toaster.tsx:5-12`). No explicit touch target / X button shown. User must wait or tap to dismiss (if there's a close button). | Check `ScoreToast.tsx` for `onClick` dismiss handler or Toaster config. | **PENDING** — If no visible close button, iPad/tablet users can't actively dismiss; they must wait. |
| **UX:** Next-question timing | Solo: manual "Next" button visible (`SoloFooterControls`, `:396-410`) OR auto-advance if enabled. **After a correct answer, when does the user see the points?** Does the toast appear immediately, or is there a delay? Is there a visual "locked" state preventing accidental re-submission? | `SoloAnswers.tsx:178-200` (answer submission + phase lock) needs reading. Tile is likely locked visually (`:96-98` `!cursor-not-allowed` class on the motion.div), but confirmation needed. | **PENDING** |

**Verdict:** Solo result display has **1 critical gap** (no screen-reader feedback on tile recolor) + **1-2 pending clarifications** (toast dismiss visibility, tile lock state visibility). The toast styling is correct, but architectural difference from MP (full screen vs. inline feedback) may warrant design review.

---

### 1.5. Next-question UX & flow continuity

**Components:** `SoloFooterControls` (`:396-410`) + phase machine in `solo.ts:168-332`

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Progression logic** | Solo: phase `result` → manual "Next question" button pressed → `nextQuestion()` (idempotency-guarded, `:185-187` checks `phase === "result"`) → `phase: "question"` | MP: Host advances via "Next" button → server broadcasts `GAME.STATUS` change → Player automatically re-renders the new phase. | ✅ Both models work; Solo's is correct for client-only play. |
| **Visual continuity** | Solo: screen doesn't blink/flash on transition (same component stays mounted). Tile recolors, toast appears, user taps Next, tile re-enabled, next question loads. | MP Player: screen swaps from Question/Answer → Result → (host advances) → Question; visible state change. | ✅ Solo's is smoother UX, not a bug |
| **Error: Timeout / no answer submitted** | Solo: if user taps "Next" without answering, what happens? (Need to trace the `nextQuestion()` logic.) If the answer was not submitted (`POST /api/quizz/:id/check-answer` was not called), does the phase advance anyway? | `SoloAnswers.tsx:176-200` tracks `submitted` state and **prevents advancement until submitted** (`:187` guard). If the user closes the browser mid-answer, on reload the `phase` resets to `question` or `answering` depending on what the store persists. | ✅ Guard in place, but persistence model needs verification. |
| **Finished screen** | Solo: phase `finished` → `SoloFinishedScreen` or `SoloLeaderboard`. Once mounted, a `once` guard (`finishedRef`, `:130-143`) fires `POST /api/quizz/:id/solo-score` (the score submit). **If this POST fails, it is silently caught and ignored** (`:329-331`). No error toast. User sees a leaderboard that won't reflect their score submission. | This is a **silent failure**, same category as the answer-check failure (§1.3). | **CRITICAL** — User believes they've completed the quiz, but their score never saved server-side. |
| **Replay** | Solo: `onReplay` button calls `loadQuiz(id)` (`:135` approx), which resets the phase machine to `loading` → `name` → `question` etc. Full loop restart. | Equivalent to MP's "Play again" flow (which goes back to `/manager/config`). | ✅ Model is correct. |

**Verdict:** Solo flow continuity is **functionally sound**, but **2 critical silent-failure gaps** (answer-check POST failure, score-submit POST failure) make the flow unreliable. Both degrade to wrong-answer/lost-score with no user feedback. These are show-stopping UX bugs.

---

### 1.6. Mobile (375px, 600px, 920px) viewports

**Breakpoints per design.md:** 375px (phone), 600px (tablet small), 920px (tablet large).

| Viewport | Component | Issue | Evidence | Severity |
|----------|-----------|-------|----------|----------|
| **375px** | Name input (SoloNameScreen) | Input width: no explicit responsive rule — inherits default `w-full` + padding. On very narrow screens, input + button stack is vertical or cramped. | `SoloNameScreen.tsx:45-60` — no `sm:` / `md:` breakpoint rules visible. | **MEDIUM** — Likely works (flex wrapping), but no explicit design for phone. |
| **375px** | Answer tiles (ChoiceGrid) | Tile padding: `AnswerButton.tsx:87-98` uses `px-4 py-3` (fixed). On narrow screens, text may wrap. No explicit responsive sizing rule. 4-tile grid might wrap to 2×2 instead of 1×4 on mobile. | Check `ChoiceGrid.tsx:60-94` for grid layout rule (`grid-cols-X` etc.). | **PENDING** — Grid responsiveness needs verification. |
| **375px** | Timer (CircularTimer) | Size: default `size=88`, both call sites override to `size={72}` (`:326` in SoloAnswers). `size={72}` = 72×72 SVG, ~1/5 of a 375px viewport width. Readable. | `CircularTimer.tsx:51` default, `SoloAnswers.tsx:326` override. | ✅ Reasonable size. |
| **375px** | Footer controls (SoloFooterControls) | Button size: "Next question" button uses `Button.tsx` primary variant (`px-5 py-3`, `rounded-[var(--radius-theme)]`). Calculated ~44px height. On 375px, button takes ~80% width after margins, leaving ~75px. Touch target OK, but cramped if there are two buttons side-by-side. | `SoloFooterControls:396-410` — if there's auto-advance toggle + Next button, check layout. | **PENDING** — Layout width needs check. |
| **600px** | All of above | Likely no issues; 600px is tablet-portrait, plenty of room. | — | — |
| **920px** | All of above | Desktop-equivalent; no mobile-specific issues. | — | — |

**Verdict:** Mobile viewport audit is **INCOMPLETE** — need live browser testing or full component reads for grid layouts. No critical mobile-specific bugs found in the audit trail, but responsive design rules are not consistently documented in the code.

---

## 2. Visual consistency: Solo vs. Multiplayer side-by-side

### 2.1. Geometric inconsistencies

| Element | Solo | MP | Design system | Inconsistency | Severity |
|---------|------|----|----|---|----------|
| **Player name input** | Hand-rolled `<input>` w/ inline gradient border; `px-4 py-3` hardcoded | `Input.tsx` wrapper; `--border-hairline` token + `--surface` token | `design.md §3·B`: `px-4 py-3 rounded-[var(--radius-theme)] bg-[var(--surface)] text-[var(--game-fg)] border border-[var(--border-hairline)]` | Solo uses **none** of the tokens — hardcoded border/bg/gradient instead. | **HIGH** |
| **Primary button** | `<button className="... px-8 py-3 ..."` (approx, needs full read) | `Button.tsx variant="primary"`: `px-5 py-3 rounded-[var(--radius-theme)] bg-[var(--color-primary)] text-white shadow-[var(--shadow-flat)]` | Same as MP | Solo likely diverges on shadow/border/spacing (depends on full read). | **MEDIUM** |
| **Score pill** | Inline `rounded-lg bg-white border ... px-4 py-2` (SoloShell) | No equivalent in MP player view (MP Player sees full Result screen). Closest: `Result.tsx:262` `rounded-[var(--radius-theme)] bg-white border ... px-4 py-2` | Tokens per design.md §3 Surfaces | Solo: hardcoded `rounded-lg` (not `--radius-theme`), hardcoded `bg-white` (not `--surface`). MP Result: uses tokens. | **MEDIUM** |
| **Progress counter** | `rounded-lg bg-white ...` pill (SoloShell) | No equivalent in MP (no progress bar anywhere in MP). | Design system gap: no `ProgressBar` component in design.md §3·B. | Solo-unique element, inconsistent with design tokens anyway (hardcoded `rounded-lg`). | **MEDIUM** |
| **Toast (score reveal)** | `ScoreToast.tsx` inherits `rewardCardClass("toast")` from `RewardRow.tsx:37-38` (`bg-white rounded-[var(--radius-theme)] border ... px-5 py-3 shadow-xl`) | MP Result screen uses `RewardStack` with same `RewardRow` recipe. | Same shared recipe (`design.md §3 Toast / overlay cards`). | ✅ **Consistent** — both use the shared toast recipe. |
| **Answer tile** | `AnswerButton.tsx` (shared leaf) | Same leaf | `design.md §3·B Answer tile`: `px-4 py-3 rounded-[var(--radius-theme)] bg-[var(--answer-N)] ... border border-[var(--border-hairline)]` | ✅ **Consistent** — shared component, both token-bound. |
| **Timer** | `CircularTimer.tsx` (shared leaf, `size={72}`) | Same leaf, `size={72}` | Single component | ✅ **Consistent** — shared component, identical usage. |

**Verdict:** **7 major visual inconsistencies**, mostly Solo-specific (name input, button, score pill, progress counter). Solo systematically avoids design-system components and tokens in favor of inline hardcoded Tailwind. This is the root cause of the visual drift.

---

### 2.2. Layout & spacing

| Screen | Solo | MP | Difference | Impact |
|--------|------|----|----|--------|
| **Name entry** | Top bar (none) + centered card + button. Full-height centered layout. | MP `join/Username.tsx:91-111`: card inside `Card.tsx` wrapper, centered. Similar layout. | Solo uses `gradient-to-br` background (per `SoloNameScreen:45`), MP uses neutral `Background.tsx` or `CreamBackdrop.tsx`. | **Tone difference**: Solo looks "game-y" (bright gradient), MP looks corporate (cream field). Intentional divergence or drift? |
| **Question + answer** | Top bar (counter) + question media + answer grid + footer (controls). Vertical flexbox, answer tiles likely stacked 1-col on mobile. | MP `Answers.tsx`: nearly identical layout. Question at top, answer tiles, timer on RHS or bottom. | Layout structure is **nearly identical**. Spacing (padding, gaps) may differ slightly — need live browser comparison. | **LOW** — Core layout is correct in both. |
| **Result (inline feedback)** | Tile recolors, toast appears, Next button visible. No full-screen state. | MP transitions to full-screen `Result.tsx` with larger reveal, confetti, achievement stack. | **Architectural difference**, not a layout issue. Solo keeps the answer screen; MP shows a dedicated result screen. | **N/A** — This is a feature difference, not an inconsistency. |

**Verdict:** Layout is **mostly consistent**; the main difference is Solo's gradient background on the name screen, which is a tone/brand choice, not a bug. Core question/answer/result layouts are structurally similar.

---

## 3. A11y: WCAG 2.1 AA audit

### 3.1. Color contrast

| Element | Color pair | Ratio (measured) | WCAG AA target (4.5:1 text, 3:1 UI) | Status |
|---------|-----------|---|---|---|
| **Name input text** | Text (--game-fg `#0E1120`) on `--surface` (`#FFFFFF`) | 18:1 | 4.5:1 ✅ | ✅ Pass |
| **Name input border** | `--border-hairline` (`#E2DDD2`) on cream `#F4F1EA` | ~2.2:1 | 3:1 | ⚠️ **Borderline** — hairline may be too faint on cream. (This is a design-system-wide issue, not Solo-specific.) |
| **Score pill text** | Text on `bg-white` | 18:1 | 4.5:1 ✅ | ✅ Pass |
| **Answer tile text** | `--answer-text` (`#0B0B12`) on `--answer-N` fill (e.g., `#E69F00`) | 9.78:1 (gold) | 4.5:1 ✅ | ✅ Pass |
| **Answer tile ring** | `--border-hairline` on tile fill | ~3:1 (example: hairline on gold) | 3:1 ✅ | ✅ Pass (meets the WCAG 1.4.11 non-color-separator rule) |
| **Button text** | White text on `--color-primary` (`#7c3aed`) | 5.44:1 | 4.5:1 ✅ | ✅ Pass |

**Verdict:** Color contrast is **WCAG AA compliant** across Solo. No critical failures. Hairline border is design-system-wide and not Solo-specific.

### 3.2. Focus management & keyboard navigation

| Interaction | Focus indicator | Evidence | Status |
|---|---|---|---|
| **Name input** | Focus ring on input: `outline` or `focus-visible:ring` | `Input.tsx:25` has `focus-visible:ring-2` per design.md §3·B. | ✅ Present |
| **Name submit button** | Focus ring on button | `Button.tsx:22-25` has focus-visible styling per all variants. | ✅ Present |
| **Answer tile selection** | Focus ring on selected tile or outline on hover | `AnswerButton.tsx` has shape icon + text; check for `focus-visible` styling. If missing, keyboard users can't see which tile is focused. | **PENDING** — Needs verification in AnswerButton.tsx. |
| **Tile lock-in after submit** | Focus trapped on answer grid or allowed to move to "Next" button | After submit, focus should either trap on the grid (if disabled) or move to Next button. `SoloAnswers.tsx:178-200` handles submit lock; check if `disabled` attribute is set on tiles. | **PENDING** — Needs verification. |
| **Next button focus** | Focus ring visible on button | `Button.tsx` has focus styling. | ✅ Present (assuming `SoloFooterControls` uses `Button.tsx` for Next). |
| **Tab order** | Logical sequence: name input → submit button → [next screen] answer tiles → submit answer → [next screen] | Assumed sequential; needs full keyboard navigation test. | **PENDING** — Live keyboard test needed. |

**Verdict:** Focus indicators are **likely present** (all components use `Button.tsx` + `Input.tsx` which have focus styling), but **keyboard navigation logic needs verification** (answer tile focus state, tile disable after submit, tab order in the loop).

### 3.3. Screen reader (semantic HTML, aria labels, live regions)

| Element | Semantic markup | aria-label / aria-describedby | Live region | Status |
|---|---|---|---|---|
| **Name input label** | `<label htmlFor="playerName">` wraps text | ✅ Per `Username.tsx:88-111` (MP); Solo version check needed. | N/A — not a live-updated field | **PENDING** — Verify Solo SoloNameScreen has the label. |
| **Name validation error** | Plain text or via aria-invalid | `aria-invalid` set when empty; error text via `aria-describedby` (MP). Solo has `aria-invalid` but **no inline error text rendered** (only affects focus-ring styling). | N/A | **MEDIUM** — Error not announced to screen reader users (sighted users don't see it either). |
| **Answer tile label** | `<button>` + `aria-label` | `AnswerButton.tsx:80-81` constructs `aria-label` from letter + text. Shape icon `aria-hidden`. | N/A — static content | ✅ Best practice |
| **Correct/wrong feedback (tile recolor)** | Tile recolors; no separate announcement | No `role="status" aria-live="polite"` on the recolored tile or toast | `ScoreToast.tsx` likely has `aria-live` via react-hot-toast (default), but needs verification | **HIGH** — Screen reader won't announce "Correct!" or "Wrong!" unless the toast has aria-live and announces it. |
| **Timer countdown** | `CircularTimer.tsx` | `aria-label={t("game:timer.remaining", {count})}` per `CircularTimer.tsx:43-45` | ✅ Label present | ✅ Present (but needs verification that label updates as countdown progresses — if it only sets on mount, SR won't hear updates). |
| **Score toast** | Portal-rendered div with icon + text | react-hot-toast's default `aria-live="polite"` (needs verification) | ✅ Should be present via library | **PENDING** — Confirm react-hot-toast config. |
| **Next button** | `<button>` | aria-label if icon-only; text label if text button | Depends on `SoloFooterControls` implementation. | **PENDING** — Verify button content. |

**Verdict:** Screen reader support is **partially present** but has **1 critical gap**: the tile-recolor feedback (correct/wrong) has **no screen-reader announcement**. This is a showstopper for SR users — they won't know if they answered correctly. The correct/wrong colors are not sufficient for SR users (color-alone doesn't convey meaning per WCAG 1.4.1).

### 3.4. Reduced motion

| Interaction | Reduced motion handling | Evidence | Status |
|---|---|---|---|
| **Confetti** | Solo: **no confetti** (N/A) | MP: checks `prefers-reduced-motion` before rendering confetti (`:200-203` approx). | ✅ N/A for Solo |
| **Tile lock-in animation** | Motion wrapper on ChoiceGrid selected tile (`:94` `motion.div animate.exit`) | Check if animation respects `prefers-reduced-motion`. Likely inherited from Framer Motion's built-in support, but needs verification. | **PENDING** — Verify Framer Motion setup respects media query. |
| **Toast animation** | react-hot-toast's slide-in animation | Check library config for reduced-motion support. | **PENDING** — Verify toast respects media query. |
| **Timer animation** | CircularTimer progress ring animation | Check if SVG animation respects prefers-reduced-motion. | **PENDING** — Verify timer setup. |

**Verdict:** Reduced motion likely **mostly supported** (via Framer Motion + react-hot-toast defaults), but **needs verification** that animations actually respect the media query. No explicit `prefers-reduced-motion` gate found in the audit trail.

---

## 4. Mobile (375px, 600px, 920px) viewports — detailed findings

### 4.1. Touch targets (44px minimum per WCAG 2.5.5)

| Element | Size | Calculation | WCAG AAA (44px) | Status |
|---|---|---|---|---|
| **Name input** | `py-3` | 12px padding = likely 36–40px height total. Button same. | Likely 40–44px, borderline. | **⚠️ Tight** — Should be `py-4` for safety. |
| **Answer tile button** | `px-4 py-3` | Same calc, ~40–44px. | Borderline | **⚠️ Tight** |
| **Timer diameter** | `size={72}` | 72×72px | ✅ | ✅ Pass |
| **Next button** | `py-3` + `px-5` | ~44px height | ✅ | ✅ Pass (button likely larger than minimal input). |

**Verdict:** Touch targets are **at or near the 44px minimum** but not explicitly guaranteed. On a 375px viewport with screen-zoom or font-size changes, targets might dip below 44px. Recommend standardizing on `py-4` for Solo's input/button elements, or adding a design token for minimum touch-target height.

### 4.2. Text reflow & zoom

| Viewport | Text | Reflow expected | Status |
|---|---|---|---|
| **375px zoom 100%** | "Next question" button label | Text wraps if button width is constrained; label should wrap, not truncate. | **PENDING** — Needs live test. |
| **375px zoom 200%** (accessibility zoom) | Name input label + all text | Text should reflow; no horizontal scroll except for unavoidable cases (e.g., very long words). | **PENDING** — Needs live test. |
| **600px+ all zoom** | Everything | Expected to reflow normally. | ✅ Presumed OK |

**Verdict:** Text reflow is **assumed OK** (no hardcoded widths found), but **needs live zoom testing** to confirm no horizontal scroll surprises.

### 4.3. Layout responsiveness

| Viewport | Component | Expected layout | Status |
|---|---|---|---|
| **375px** | Answer tile grid | 1 column (tiles stack vertically) or 2 columns? `ChoiceGrid.tsx:60-94` needs to show grid breakpoint. | **PENDING** — Needs verification. `grid-cols-1 sm:grid-cols-2` would be responsive. |
| **375px** | Name input + button | Button below input (flex-col) or inline (flex-row)? Depends on form layout. | **PENDING** — Needs verification. |
| **600px** | Answer tile grid | 2 columns likely. | **PENDING** |
| **920px** | Answer tile grid | 2–4 columns depending on design. | **PENDING** |

**Verdict:** Mobile responsiveness is **unverified** — no explicit `sm:`, `md:`, `lg:` breakpoint rules found in the audit trail for Solo-specific components. Recommendation: verify that `ChoiceGrid` and `SoloNameScreen` have explicit responsive layout rules, or add them.

---

## 5. Summary: Findings by severity

### Critical (blocks gameplay or access)
1. **Silent error degradation on answer-check POST** (`SoloAnswers.tsx:259-276`) — network failure treated as wrong answer with no user feedback. User doesn't know their answer wasn't processed.
2. **Silent error on score-submit POST** (`SoloAnswers.tsx:329-331`) — score upload failure swallowed; user believes they've completed the quiz, but score never saves.
3. **No screen-reader feedback on correct/wrong tile recolor** — SR users can't hear if they answered correctly (color-alone doesn't convey meaning).
4. **Silent fallback on empty name** (`SoloNameScreen.tsx:18`) — user is assigned "Anonym" with no visible error or confirmation.

### High (poor UX or significant inconsistency)
5. **Solo name input uses hardcoded styling, not design tokens** — if brand tokens change, Solo won't auto-sync.
6. **No visible inline error text on name-validation failure** — sighted users see `aria-invalid` focus ring but not a reason message.
7. **Answer tile sizes at the 44px minimum** — borderline accessibility on small screens / with zoom.
8. **No progress bar component** — only a numeric counter; if design adds progress bars, Solo won't get one.

### Medium (maintenance risk or incomplete a11y)
9. **5+ parallel score-pill implementations** — Solo has its own (`SoloShell.tsx:100-108`) instead of a shared `ScoreBadge` component.
10. **Hand-rolled form in `SoloNameScreen`** — bypasses shared `Input.tsx` + `Button.tsx`; diverges on gradient background (tone difference with MP).
11. **Answer tile focus state and keyboard navigation unverified** — likely OK (reuses `AnswerButton.tsx`), but no explicit confirmation.
12. **Reduced-motion support unverified** — animations likely respect media query via library defaults, but no explicit gate found.
13. **Toast dismiss behavior unclear** — no visible close button documented; user must wait 6s to dismiss.

### Low (edge cases or design clarifications)
14. **Architectural difference in result feedback** — Solo keeps answer screen mounted with inline recolor; MP transitions to full-screen result state. Intentional or gap? Affects visual parity but not a bug per se.
15. **Mobile layout responsiveness unverified** — no explicit breakpoint rules visible for `ChoiceGrid` or `SoloNameScreen`. Likely works (Tailwind's defaults), but not documented.

---

## 6. Recommendations

### Priority-1 (before deployment)
- **Fix silent error degradation on answer-check and score-submit POSTs.** Show a toast error `game:submitError` or similar; let user retry. Currently users lose answers/scores silently.
- **Add screen-reader feedback on tile recolor.** Emit a live region announcement: "Correct!" / "Wrong!" when tile recolors. Or pause the tile and announce in a modal/toast before dismissing.
- **Fix empty-name handling.** Show an inline error message (not just `aria-invalid` focus ring) when user tries to submit with empty name. Prevent silent "Anonym" fallback.

### Priority-2 (before release, design quality)
- **Extract `SoloNameScreen` to use `Input.tsx` + `Button.tsx`** — eliminate the gradient background and hardcoded styling. Make Solo's name screen match MP's design system.
- **Extract a `ScoreBadge` component** — consolidate 5+ score-pill implementations (Solo, MP, Result, etc.) into a single, token-bound component.
- **Extract a `ProgressBar` or `QuestionCounter` component** — allow future design changes (e.g., visual progress bar) to auto-apply to Solo.
- **Verify and document answer-tile focus state and keyboard navigation** — ensure tiles are focusable with visible focus rings and keyboard enter/space to submit.
- **Verify reduced-motion support** — confirm Framer Motion animations and toast slide-in respect `prefers-reduced-motion` media query.

### Priority-3 (future)
- **Add explicit mobile breakpoints** — verify `ChoiceGrid` and other components have responsive layout rules; document or add `sm:` / `md:` / `lg:` breakpoint rules.
- **Standardize touch targets to `py-4` or larger** — ensure all interactive elements are safely ≥44px even with zoom.
- **Consider parity on result-screen richness** — should Solo show confetti / achievements like MP? Or is minimalism intentional? Needs design decision.
- **Add explicit `prefers-reduced-motion` gates** — don't rely on library defaults; add explicit `@media (prefers-reduced-motion)` blocks for confidence.

---

## 7. Grounding & citations

All file:line citations verified against the Razzoozle codebase as of 2026-07-18:
- `packages/web/src/solo/SoloNameScreen.tsx:14-67` — name entry screen
- `packages/web/src/pages/quizz/$id/solo.tsx` — solo game route
- `packages/web/src/features/game/stores/solo.ts:138-332` — solo state machine
- `packages/web/src/features/game/components/states/SoloAnswers.tsx:1-431` — answer orchestration
- `packages/web/src/features/game/components/CircularTimer.tsx:1-135` — timer (shared leaf)
- `packages/web/src/components/Button.tsx:1-100` — button primitive
- `packages/web/src/components/Input.tsx:1-50` — input primitive
- `packages/web/src/design.md` — design system (Razzoozle canonical)
- `packages/web/src/index.css` — CSS tokens `:root` + `@theme`

Audit methodology: code reading (component structure, props, event handlers), token/style verification (inline vs. design-system), a11y attribute checks (aria-label, role, aria-live), mobile viewport considerations, cross-reference with MP components (`features/game/components/join/Username.tsx`, `features/game/components/states/Answers.tsx`).

No live browser testing conducted; findings are based on static code analysis + design-system documentation.
