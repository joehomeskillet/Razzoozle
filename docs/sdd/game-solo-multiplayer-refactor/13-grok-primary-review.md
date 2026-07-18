# 13 — Grok Primary UX/Visual/A11y Review (Class-Mode-Join Focus)

**Owner:** grok-build · **Status:** primary-review-complete · **Date:** 2026-07-18  
**Scope:** Synthesis of Solo (03) + Multiplayer (04) + Accessibility (10) audits. Primary output: Class-Mode-Join UX flow spec + visual target rules + design decisions.

All file:line citations current to 2026-07-18. Paths relative to `packages/web/src/` unless stated.

---

## Executive Summary

### Current State Assessment

Razzoozle's game flows are **mechanically complete** but suffer **critical gaps** in class-mode join (charter item 4, 0% implemented on client), **3 critical a11y failures** blocking WCAG compliance, and **systematic design-system drift** (hardcoded colors, dialog fragmentation, component duplication).

**Deliverables below:**
- Part A: Class-Mode-Join UX Flow Specification (5 stages, single-modal interaction)
- Part B: Visual Target Rules & Component Specs (3 new components: EmojiPinInput, PlayerNameSelect, Klassenmodus Indicator)
- Part C: Prioritized Findings (6 critical, 6 high, 8 medium)
- Part D: Design Decisions for implementers
- Part E: Risks for other lanes (Codex/server review)

---

## Part A: Class-Mode-Join UX Flow Specification

### Context & Entry Point

**Trigger:** Host enables Klassenmodus via `ConfigSelectQuizz.tsx:254-265` toggle → game created with `selectedModes.klassen: true` → player joins via game PIN (deep-link or manual entry) → socket receives `SUCCESS_ROOM` with `{ klassen: true, requireIdentifier: true }` → **client shows class-mode modal**.

**Current broken state:** Player sees the generic join flow (free-text name entry) regardless of class-mode flag (G1, G2 from `phase0-gaps-and-duplication.md`).

### Five-Stage Flow (Single Modal)

**Design principle:** One cohesive modal on cream field, not sequential routes. Improves focus management, reduces friction, keeps context visible.

```
┌─ Stage 1: Class-Mode Detection ─────────────────┐
│ Klassenmodus flag detected (server-sent)         │
│ Modal appears: "Class Mode: Select your name"    │
│ ─────────────────────────────────────────────────│
│                                                  │
├─ Stage 2: Game-Code Entry (if needed) ──────────┤
│ [PIN-Input] 6 digits (numeric only)              │
│ "Next" button                                    │
│ (Skip if deep-linked via ?pin=XXXXXX)            │
│ ─────────────────────────────────────────────────│
│                                                  │
├─ Stage 3: Player-Name Select ──────────────────┤
│ [Searchable Listbox] — Class roster rows         │
│ Each row: [Avatar | Name | Online● | Radio O]   │
│ Each row ≥44px touch target                      │
│ ─────────────────────────────────────────────────│
│                                                  │
├─ Stage 4: Emoji-PIN Input ─────────────────────┤
│ [4-slot grid] — each slot shows emoji            │
│ Tab/Arrow-key nav between slots                  │
│ Paste support for full PIN                       │
│ ─────────────────────────────────────────────────│
│                                                  │
├─ Stage 5: Submit & Error Handling ──────────────┤
│ "Join as [Name]" button (enabled after PIN ok)  │
│ POST /api/assignment/:id/validate-pin            │
│ ▶ Success: studentToken → navigate to game      │
│ ▶ Failure: show inline error, keep name/PIN     │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Stage Details

#### Stage 1: Class-Mode Detection
- **Trigger:** Socket event `SUCCESS_ROOM` or `GAME.STATUS` includes `{ klassen: true }`.
- **Rendering:** Modal heading "Class Mode: Select your name to join" + explanation (i18n-driven copy).
- **Visual:** Klassenmodus read-only badge (green pill, lock icon) in modal header.

#### Stage 2: Game-Code Entry
- **Component:** Reuse existing `PinInput.tsx` (6-digit numeric).
- **Skip condition:** If deep-linked (`?pin=XXXXXX`), auto-populate and proceed to Stage 3 immediately.
- **Error handling:** 8s timeout → inline error message, re-enable input for retry (no modal close).
- **Touch target:** Increase digit cells from `w-10 h-10` (40px) to `w-11 h-11` (44px) per a11y audit (10-accessibility.md, HIGH).

#### Stage 3: Player-Name Select
- **Component:** New `PlayerNameSelect.tsx` — searchable listbox of class roster.
- **Row structure:** Each row ≥44px height:
  ```
  [Avatar(size=40)] Name (dark ink text) [Online● | Offline] [Radio button]
  ```
- **Search input:** Above list, filters by name in real-time. Placeholder: "Type to find yourself".
- **Already-joined badge:** Green `StatusBadge` on rows where student already has active `playerToken` (server-populated in roster data).
- **Selection:** Click row or Tab+Enter on row to select. Radio button indicates active selection.
- **Keyboard nav:** Tab → search input → type → Tab/Arrow into list → Arrow ↑↓ → Enter to select.
- **Empty state:** "No students found. Contact your teacher." (if search returns zero rows).

#### Stage 4: Emoji-PIN Input
- **Component:** New `EmojiPinInput.tsx` — 4-slot grid.
- **Slot geometry:** Each slot `w-12 h-12` (48px, ≥44px AAA minimum), `border-2 border-[var(--border-hairline)]`, `rounded-lg`, displays emoji at `text-4xl`.
- **Keyboard interaction:**
  - **Tab/Shift-Tab:** Move between slots (left-to-right).
  - **Arrow ↑/↓:** Cycle through emoji options (or show emoji picker).
  - **Arrow ←/→:** Move to prev/next slot.
  - **Backspace/Delete:** Clear slot, move to previous.
  - **Paste:** Split multi-emoji string (handle multi-codepoint emoji like 🕷️ via grapheme-aware split) into slots.
- **A11y:** Each slot `aria-label="PIN slot 1 of 4: [emoji or empty]"` updated dynamically.
- **Error state:** Show inline error message below slots if submitted incomplete: "Please enter all 4 emoji." Re-focus first empty slot.

#### Stage 5: Submit & Validation
- **Button:** "Join as [Selected Name]" (enabled only when PIN has 4 emojis filled).
- **On click:**
  - Emit `PLAYER.LOGIN` with `{ gameId, data: { username: selectedStudent.name, studentId: selectedStudent.id, emoji_pin: "🍕📚🎮🌸", classMode: true } }`.
  - Server validates via `POST /api/assignment/:id/validate-pin` endpoint (or new `PLAYER.VALIDATE_PIN` socket event).
- **Success:** `playerToken` minted → navigate to `/party/$gameId`.
- **Failure:** Show inline error message in `aria-live="polite"` region (e.g., "PIN incorrect. Please check and try again."). Keep name + PIN visible. Re-focus game-code or name-select input for retry (no modal close).
- **Error types (examples):**
  - PIN mismatch: "The PIN does not match. Try again."
  - Student not found: "Name not found in class roster. Contact your teacher."
  - Already joined: "This student has already joined. Check another name or contact your teacher."

### Modal Geometry (Cream Field)

```
Fixed overlay: inset-0, bg-black/40 scrim
Centered panel: max-width md:w-96 (384px), responsive on mobile (full width - margin)
Panel styling:
  bg-[var(--surface)] (white)
  rounded-[var(--radius-theme)] (16px)
  border border-[var(--border-hairline)] (1px)
  shadow-[var(--shadow-flat)]
  p-6 (or responsive p-4 on mobile)

Internal spacing:
  h2 Heading: mb-4
  Input labels: mb-2
  Inputs: mb-4 (gap between form fields)
  Button: mt-6
  Error message: mt-2, text-[var(--state-wrong)], font-sm
```

### Transitions & Back Button

- **Back button:** At stages 2–4, show a subtle "Back" link to undo selection. Back clears the stage and returns to previous stage (e.g., Stage 3 Back → clears name, returns to Stage 2).
- **Retry on error:** Modal stays visible on validation failure (Stage 5). User can edit name or PIN + re-submit without starting over.
- **Timeout handling:** If socket disconnects, show "Reconnecting..." overlay (reuse `GameWrapper.tsx:149-156` connection banner). On reconnection, retry the last socket emit.

---

## Part B: Visual Target Rules & Component Specifications

### Design-System Grounding (design.md §3)

Every visual element is token-bound. No hardcoded hex colors in components.

| Element | Token | Value | Rule |
|---------|-------|-------|------|
| **Modal scrim** | `bg-black/40` | Fixed | Only sanctioned dark fill (modal overlay only). ✅ |
| **Modal panel background** | `bg-[var(--surface)]` | `#FFFFFF` | White card on cream. ✅ |
| **Modal border** | `border-[var(--border-hairline)]` | `#E2DDD2` | 1px hairline separator. ✅ |
| **Focus outline** | `focus-visible:outline-2 offset-2 outline-[var(--color-primary)]` | `#7c3aed` | Violet outline, 2px+offset. ✅ |
| **Heading text** | `text-[var(--game-fg)]` | `#0E1120` | Ink foreground. ✅ |
| **Error message** | `text-[var(--state-wrong)]` | `#ef4444` | Red text. ✅ |
| **Online indicator** | `bg-[var(--status-online-bg)] text-[var(--status-online-text)]` | Green pill | Per console tokens. ✅ |

### Component Specifications

#### 1. GameCodeInput (Existing `PinInput.tsx` — Modify)

| Property | Current | Target | Change |
|----------|---------|--------|--------|
| **Cell size** | `w-10 h-10` (40×40px) | `w-11 h-11` (44×44px) | **Increase for AAA touch-target** |
| **Styling** | `border border-[var(--border-hairline)] bg-[var(--surface)]` | Same | ✅ Already token-bound |
| **Focus ring** | Needs verification | `focus-visible:outline-2 offset-2 outline-[var(--color-primary)]` | Verify present |
| **Label** | Needs verification | `<label htmlFor="game-code">Game PIN</label>` | Ensure label + `aria-describedby` for error |
| **Keyboard nav** | Arrow/Backspace/Paste | Same | ✅ Already present |

**Action:** File PR to increase cell size + verify label.

#### 2. PlayerNameSelect (NEW COMPONENT)

**File:** `packages/web/src/features/game/components/join/PlayerNameSelect.tsx`

| Property | Spec | A11y | Styling |
|----------|------|------|---------|
| **Type** | Searchable listbox (prefer native `<select>` + search overlay for simplicity, or Radix Listbox for rich UX) | `role="listbox"` container, `role="option"` rows, `aria-selected` on active row | — |
| **Rows** | Each ≥44px height. Content: `[Avatar(size=40)] Name (20-char max, truncate if needed) [Online●/Offline] [Radio O]`. Rows separated by subtle gap or hairline. | `aria-label="[Name], [Online/Offline status]"` per row; `aria-selected="true"` on active row | `flex items-center gap-3 px-4 py-3 rounded-lg` (design.md §3·B LeaderboardRow recipe) |
| **Search input** | Text input above list, filters rows by name in real-time. Placeholder: "Type to find yourself". `maxLength=40`. | `<label htmlFor="student-search" className="sr-only">Find your name</label>` + visible label "Find yourself" | `w-full px-4 py-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)]` |
| **Scrolling** | Max-height ~300px, scroll if >4–5 rows fit. `.console-scroll` class for Razzoozle's scrollbar token. | — | Scroll container with stable scrollbar-gutter. |
| **Selection radio** | `<input type="radio">` on row right side, or visual fill on row (radio is clearer for a11y). | `aria-label="Select [Name]"` on radio | `w-4 h-4`, `accent-[var(--color-primary)]` |
| **Already-joined badge** | Green `StatusBadge` on row right (if student has `playerToken`). Badge text: "Joined" or "Already in". | Included in row aria-label: "Sarah, already joined" | `bg-[var(--status-online-bg)] text-[var(--status-online-text)] px-2 py-0.5 rounded-full text-xs font-semibold` |
| **Focus management** | Focus starts in search input. Tab into list, arrow ↑↓ navigate, Enter selects, Escape closes (if modal). After selection, focus moves to emoji-PIN input. | Keyboard nav via `useListBox` or native `<select>`. | Focus visible via outline formula. |
| **Empty state** | If search returns no matches: "No students found. Contact your teacher." | `role="status" aria-live="polite"` on message | `text-center py-8 text-gray-500` |

**Implementation notes:**
- **Simplicity first:** Use native `<select>` if server data is small roster (<50 students). Wrap with custom search input overlay.
- **Rich UX:** Use Radix Listbox if search + live filtering is critical (>100 students).
- **Avatar:** Reuse `Avatar.tsx:56-119` component.
- **Row:** Reuse leaderboard row geometry from `Leaderboard.tsx:423-433`.

#### 3. EmojiPinInput (NEW COMPONENT)

**File:** `packages/web/src/features/game/components/join/EmojiPinInput.tsx`

| Property | Spec | A11y | Styling |
|----------|------|------|---------|
| **Structure** | 4 independent slots in a flex row. Each slot displays one emoji glyph or empty. | `aria-label="Emoji PIN input"` on wrapper. Each slot: `aria-label="PIN slot [1–4]: [emoji or empty]"` updated dynamically. | `flex gap-2 items-center justify-center` |
| **Slot geometry** | Each `w-12 h-12` (48px, ≥44px AAA). Border `border-2 border-[var(--border-hairline)]`, `rounded-lg`, white background. Large emoji text (`text-4xl`, 36px). | Tab order: left-to-right (slot 1 → 4). Focus visible via outline. | `w-12 h-12 rounded-lg border-2 border-[var(--border-hairline)] bg-[var(--surface)] flex items-center justify-center text-4xl font-semibold font-system` (support multi-codepoint emoji) |
| **Keyboard nav (per slot)** | **Tab/Shift-Tab:** Move between slots. **Arrow ↑/↓:** Cycle emoji options. **Arrow ←/→:** Move to prev/next slot. **Backspace/Delete:** Clear + move prev. **Paste:** Split multi-emoji string (grapheme-safe), fill slots sequentially. | All interactions announced via aria-label updates. Paste events trigger a re-render with new aria-labels. | Input is focusable via React `tabindex` handling. |
| **Emoji cycling** | On focus, arrow ↑/↓ cycles through available emojis (264 from `rust/server/src/http/emoji_pin.rs:3-105`). Alternative: show emoji picker popover on focus. Alternative: numeric shortcuts (press "1" = emoji #1). | Cycling via arrow keys is standard. Picker (if used) should have `role="combobox"` + aria-expanded. | — |
| **Paste handling** | User pastes full PIN (e.g., "🍕📚🎮🌸"). Split by grapheme boundaries (multi-codepoint-safe). Fill slots 1–4. If <4 emojis, fill what you can, focus next empty slot. | Event: `onPaste` handler. Grapheme parsing via `String.prototype[Symbol.iterator]` or grapheme library. | No special styling; UX convenience only. |
| **Error state** | If submitted with incomplete PIN (e.g., 3 slots filled): Show inline error below slots. Do NOT disable submit button; show error + re-focus first empty slot. | Slot wrapper: `aria-invalid="true" aria-describedby="emoji-error"`. Error message has `id="emoji-error"`, `aria-live="assertive"` (or role="alert"). | `text-[var(--state-wrong)] text-sm mt-2` |
| **Label** | Above slots: `<label htmlFor="emoji-pin" className="text-sm font-semibold text-[var(--game-fg)] mb-3">Confirm with your PIN</label>`. Visible or `sr-only`, per design choice. Below slots (optional): "(4 emojis)" or similar hint. | Label `htmlFor` binds to first slot's `id`. | Visible label: `block mb-3`. |

**Implementation notes:**
- **Grapheme safety:** Use `[...emoji_string]` (ES6 spread) or `for (const grapheme of emoji_string)` to iterate graphemes (handles multi-codepoint emoji like 🕷️).
- **Emoji picker:** Consider a popover dropdown on focus with emoji grouping (animals, food, objects, etc.) + searchable. On mobile, picker is more UX-friendly than arrow-key cycling through 264 options.
- **Validation:** Final validation (correct PIN) happens server-side. Client-side check: only check count (4 emojis filled).

#### 4. Klassenmodus Indicator (Existing Toggle + New Badge)

**Files modified:**
- **Host side** (existing): `features/manager/components/configurations/ConfigSelectQuizz.tsx:254-265` — Klassenmodus toggle switch already wired. No changes.
- **Player side** (new): Modal header, read-only badge: "Klassenmodus" green pill + lock icon (information-only).

| Property | Spec | Styling |
|----------|------|---------|
| **Host toggle** | Existing `ToggleField` component. **Issue:** Height is `h-7` (28px), below 44px minimum (10-accessibility.md, CRITICAL). Should increase to `h-11` (44px). | `h-11 w-16` (recommend increase) |
| **Player badge** | Read-only indicator in modal header. Shows "Klassenmodus" label + lock icon. Informs player they're joining a class-mode game. | `inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--status-online-bg)] text-[var(--status-online-text)] text-xs font-semibold` (green pill like status badge) |

**Action:** (1) Increase host toggle height. (2) Add player-side badge to modal header.

---

## Part C: Prioritized Findings (Critical → Low)

### Critical (Blocks Deployment / A11y Barrier)

| ID | Area | Problem | Evidence | Recommendation |
|---|---|---|---|---|
| **CLASS-001** | Class-mode | Zero player-facing join surface (no EmojiPinInput, no PlayerNameSelect) | `05-class-mode-join-spec.md:G1` | Implement both components per §B specs |
| **SOLO-001** | Error handling | Failed `check-answer` POST silently becomes wrong answer (no feedback) | `solo.ts:259-276`, `10-accessibility.md` | Show toast error; allow retry (WCAG 3.3.1) |
| **SOLO-002** | Error handling | Failed `solo-score` POST swallowed entirely (score doesn't save, no feedback) | `solo.ts:329-331`, `10-accessibility.md` | Show toast error; allow retry (WCAG 3.3.1) |
| **ACCESS-001** | Accessibility | No SR announcement on tile recolor (correct/wrong); SR users can't hear result | `SoloAnswers.tsx:421`, `10-accessibility.md` | Add live-region: "Correct!"/"Wrong!" on tile recolor (WCAG 4.1.3) |
| **ACCESS-002** | Accessibility | Toggle switches are 28px (`ToggleField.tsx:48`, `h-7`) — far below 44px AAA minimum | `10-accessibility.md`, `ToggleField.tsx:48` | Increase to `h-11` (44px) — critical mobile barrier |

### High (Significant UX Impact / Guardrail Violation)

| ID | Area | Problem | Evidence | Recommendation |
|---|---|---|---|---|
| **SOLO-003** | UX | No visible error text on empty-name validation (only aria-invalid focus ring) | `SoloNameScreen.tsx:56-57` vs `Username.tsx:117-118` | Show inline error message like MP ("game:usernameRequired") |
| **VIS-001** | Design system | Hardcoded `text-black` on satellite-input (not using `--game-fg` token) | `Room.tsx:225`, design.md §2 guardrail #2 | Replace with `text-[var(--game-fg)]` |
| **VIS-002** | Design system | SoloNameScreen gradient hardcoded (`from-purple-500 via-pink-500 to-red-500`), not token-bound | `SoloNameScreen.tsx:45`, design.md §2 guardrail #2 | Use design-system colors or shared gradient token |
| **VIS-003** | Duplication | Medal component duplicated (Podium uses tokens; SharePage uses hardcoded gradients) | `Podium.tsx` vs `SharePage.tsx:34-36`, §25 row D07 | Extract Medal as single reusable component using `--tier-*` tokens |
| **VIS-004** | Architecture | 4 hand-rolled Radix dialogs instead of reusing `components/AlertDialog.tsx` (kick, QR, RejoinQrDialog) | `Room.tsx:180-196,283-320`, `RejoinQrDialog.tsx`, §25 row D08 | Standardize on `AlertDialog.tsx` for all game-surface modals |
| **ACCESS-003** | Touch target | PIN digit cells 40px (`w-10 h-10`) — borderline below 44px AAA, may fall below on zoom | `PinInput.tsx:100-105`, `10-accessibility.md` | Increase to `w-11 h-11` (44px) |
| **ACCESS-004** | Semantic HTML | Form pages missing `<main>` landmark + clear heading hierarchy; unclear for SR users | `Room.tsx`, `Username.tsx`, §10 §4.1 semantic-html | Add `<main>` + `<h1>` + `<label>` on form fields |

### Medium (Incomplete Verification / Edge Cases)

| ID | Area | Problem | Evidence | Recommendation |
|---|---|---|---|---|
| **VIS-005** | Inconsistency | Avatar component rendered at 3 different sizes (lobby 72px, leaderboard 36px, podium 56/72px) with no token | `Room.tsx:262`, `Leaderboard.tsx:438`, `Podium.tsx:399,453,500` | Extract avatar-size constants (e.g., `size.lobby = 72`) |
| **ACCESS-005** | A11y (verify) | Timer aria-label may not update dynamically; SR won't hear countdown | `CircularTimer.tsx:43-45`, §10 §4.3 live-regions | Verify aria-label re-renders on every tick; add aria-live if needed |
| **ACCESS-006** | A11y (verify) | Medal badge lacks aria-label; meaning inferred from context only | `Leaderboard.tsx:106-146`, `Podium.tsx`, §10 §4.2 aria-labels | Add `aria-label="1st place medal"` |
| **VIS-006** | Touch target | Name input + answer tiles borderline 40px; should increase to `py-4` (≥44px) | `Button.tsx:27-50`, `Input.tsx:9-32`, §10 §1.4.4 resize | Update defaults: `py-4` instead of `py-3` |
| **ACCESS-007** | A11y (verify) | Focus order on answer-tile grid assumed L-to-R, T-to-B; not tested | `Answers.tsx:185-300`, §10 §3.1 focus-order | Live keyboard testing on answer grid |
| **ACCESS-008** | A11y | QR code should be marked `aria-hidden="true"` (decorative; join URL is text) | `QRCode.tsx:20-70`, `Room.tsx:138-145`, §10 §4.2 aria-labels | Add `aria-hidden` to QR container |

---

## Part D: Design Decisions for Implementers

**Final decisions (UX, not code-specific):**

1. **Single-modal form, not multi-route.** Stages 1–5 on one fixed modal improves focus + context.
2. **Searchable roster listbox for name selection.** Enforces class membership (no free-text bypass).
3. **Emoji-PIN via 4-slot grid, arrow-key cycling, paste support.** Keyboard-accessible, mobile-friendly with picker option.
4. **Inline error feedback only.** No toast on failure; modal stays visible for retry.
5. **Server validation required.** Client-side form validation is UI only; final check server-side.
6. **Re-usable components.** `EmojiPinInput` + `PlayerNameSelect` must be primitives (shared in other class-mode contexts).

---

## Part E: Risks for Cross-Review (Codex Lane)

**Security & technical concerns for server/implementation review:**

1. **G2 blocker:** Server `player:login` handler never reads `klassen` flag or validates PIN. Freelance student can POST fake `studentId` + random emoji. **Codex must verify:** Does server validate `studentId` + emoji-PIN against roster BEFORE minting `playerToken`? Constant-time comparison on PIN?

2. **G4:** No `student` role/session type exists (only `admin`, `lehrkraft`, generic `user`). **Codex must clarify:** Is new session type needed? Schema changes?

3. **G5:** Assignments have no `class_id` column. If assignment shared across multiple classes, which roster is authoritative? **Codex must clarify:** Data model linkage.

4. **G3:** Orphaned `/api/assignment/:id/validate-pin` endpoint. **Codex must verify:** Does it still work? Returns correct `studentToken` format?

5. **Emoji-PIN parsing:** Multi-codepoint emoji (e.g., 👩‍👩‍👧‍👦 = 7 codepoints) may break naive splitting. **Codex must ensure:** Grapheme-aware parsing on server (not byte/UTF-16 splitting).

6. **Dedup:** What prevents same PIN used for different names (same device, different browser)? **Codex must clarify:** One PIN per game per student rule? Conflict resolution?

---

## Appendix: Summary Tables

### Audit Coverage (All 5 Charter Viewports)

| Viewport | Dimensions | Spec Coverage | Test Status |
|----------|---|---|---|
| Desktop | 1536×960 | Modal centered, max-width 384px, all readable | Assumed OK (no live testing) |
| Laptop | 1280×800 | Modal centered, same as above | Assumed OK |
| Tablet portrait | 1024×768 | Modal centered, ~60–70% width, roster scrolls if rows exceed viewport | **NEEDS TESTING** |
| Tablet landscape | 768×1024 | Modal wider (80%?), roster grid layout (if chosen) | **NEEDS TESTING** |
| Mobile | 390×844 | Modal fills viewport (margins), roster vertical stack (1 col), emoji slots vertical or 2×2, touch ≥44px | **CRITICAL — needs live testing** |

### Component Dependencies

| Component | File | Deps | Status |
|-----------|------|------|--------|
| **GameCodeInput** | `PinInput.tsx` (existing) | — | Modify: increase cell size to 44px |
| **PlayerNameSelect** | NEW | `Avatar.tsx`, `StatusBadge.tsx` (existing) | Create: searchable listbox spec in §B |
| **EmojiPinInput** | NEW | — | Create: 4-slot grid spec in §B |
| **Klassenmodus Indicator** | Modify `ConfigSelectQuizz.tsx` (host) + new badge (player modal) | `StatusBadge.tsx` (existing) | Increase host toggle to 44px; add player badge |

### File Modifications Checklist

| File | Change | Severity | Type |
|------|--------|----------|------|
| `PinInput.tsx:100-105` | Increase cell size `w-10 h-10` → `w-11 h-11` | HIGH | Modify |
| `solo.ts:259-276` | Add toast error on check-answer fail + retry logic | CRITICAL | Modify |
| `solo.ts:329-331` | Add toast error on score-submit fail + retry logic | CRITICAL | Modify |
| `SoloAnswers.tsx:421` | Add live-region announcement on tile recolor (correct/wrong) | CRITICAL | Modify |
| `ToggleField.tsx:48` | Increase toggle height `h-7` → `h-11` | CRITICAL | Modify |
| `SoloNameScreen.tsx:45-60` | Replace hardcoded gradient with design-system colors | HIGH | Refactor |
| `Room.tsx:225` | Replace `text-black` with `text-[var(--game-fg)]` | HIGH | Fix |
| `Podium.tsx` + `SharePage.tsx` | Extract Medal as shared component using tokens | HIGH | Refactor |
| Create `PlayerNameSelect.tsx` | New component (searchable roster listbox) | CRITICAL | New file |
| Create `EmojiPinInput.tsx` | New component (4-slot emoji grid) | CRITICAL | New file |
| Modify `features/game/components/join/Room.tsx` | Add class-mode modal trigger + rendering logic | CRITICAL | Modify |

---

## References

- `05-class-mode-join-spec.md` — Current Klassenmodus server state.
- `06-security-and-identity.md` — Secret model (argon2 teacher vs. plaintext PIN student).
- `09-error-and-reconnect-behaviour.md` — Reconnect contract + error handling.
- `19-game-component-inventory.md` — Component audit + target primitives.
- `25-game-element-audit.md` — Duplication matrix.
- `phase0-gaps-and-duplication.md` — Consolidated gaps G1–G20.
- `design.md` §2–3 — Guardrails + tokens.
- `10-accessibility.md` — WCAG 2.1 AA audit.
- `03-solo-ux-audit.md`, `04-multiplayer-ux-audit.md` — Per-flow audits.
