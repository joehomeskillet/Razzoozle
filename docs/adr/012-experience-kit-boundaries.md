# ADR-012 — Experience-Kit Boundaries, Technology, Confetti, and Lifecycle

**Status:** Accepted · **Date:** 2026-07-30

---

## Context

Razzoozle's Experience-Kit (WP-KIT) spans animation, audio, haptics, confetti, visual effects, and canvas-based interactions across game, manager, and console surfaces. The pending work packages (WP-KIT-04 through WP-KIT-14) require clear architectural boundaries to prevent:

1. **Shared vs. mode-specific duplication:** Animation presets, lifecycle patterns, and interaction feedback classes are scattered across game/manager/console with unclear ownership.
2. **Technology scope creep:** Without explicit exclusion rules, future PRs may introduce Phaser, Three.js, Rive, or new game/state-machine libraries that conflict with the canonical motion/react + canvas-confetti stack.
3. **Confetti architecture confusion:** Two systems (canvas-confetti + react-confetti) exist; unclear which is canonical and under what lifecycle rules.
4. **Resource leaks:** Canvas, rAF loops, and audio playback lack consistent unmount/hidden cleanup patterns, risking memory bloat under extended play.

The audit `docs/audit/experience-kit-animation-inventory.md` (143 entries, 2026-07-30) has catalogued all animation, audio, haptics, and effect sites. This ADR codifies decisions already made during that audit.

---

## Decision

### 1. Shared vs. Mode-Specific Boundary

**Principle:** Code belongs in the shared layer if it:
- Is used by **2+ surfaces** (game, manager, console, display) OR
- Encodes a **platform-wide principle** (reduced-motion, lifecycle, z-ordering) with no surface-specific variant.

**Shared Layer Module Structure:**

```
packages/web/src/common/animation/          (New, WP-KIT-05)
  ├── presets.ts                             (reveal, stagger, list-motion, spring configs)
  ├── interactionFeedback.ts                 (PRESS_FEEDBACK_099, PRESS_FEEDBACK_097 consts)
  ├── confetti.ts                            (already exists: fireTierConfetti, fireCenterSalvo)
  ├── lifecycle.ts                           (mount-on-visibility, cleanup-on-unmount patterns)
  └── __tests__/
      └── *.spec.ts                          (unit tests for presets + lifecycle helpers)

packages/web/src/common/audio/               (Existing)
  ├── sfx.ts                                 (SOUND_SLOTS enum, useSoundUrl helpers)
  └── haptics.ts                             (hapticTap, hapticSuccess, etc.)

packages/web/src/features/game/animation/    (Game-specific: actors, scene sequences)
  ├── actors/                                (e.g., Answers.tsx reveal sequences)
  ├── scenes/                                (e.g., podium reveal, leaderboard stagger)
  └── presets.ts                             (game-only: reveal-stagger timing tweaks)

packages/web/src/features/manager/animation/ (Manager-specific: list reveals, transitions)
  ├── listMotion.ts                          (MIGRATE TO SHARED: listContainerMotion, listItemMotion)
  └── presets.ts                             (manager-only: config panel cascades)

packages/web/src/features/console/animation/ (Console-specific: modal slides)
```

**Concrete Decision:**
- `motion/react` Animate/AnimatePresence/variants are surface-specific; no abstraction layer.
- `useReducedMotion()` helper is **globally imported** in all animation sites; not duplicated.
- `listMotion.ts` (currently 6-way duplicate) **moves to `common/animation/presets.ts`** as `listContainerMotion()` / `listItemMotion()`.
- Duplicated PRESS_FEEDBACK string (6 sites) **moves to `common/animation/interactionFeedback.ts`** as named exports (`PRESS_FEEDBACK_099`, `PRESS_FEEDBACK_097`).
- Canvas-confetti fireers (Result.tsx, SoloAnswers.tsx) remain in game surface; central `confetti.ts` is shared backend.

### 2. Technology Specification

**Canonical Technology Stack:**

| Layer | Technology | Usage | Freeze Date |
|-------|-----------|-------|-------------|
| **Animation Framework** | motion/react (v19+) | All component transitions, stagger, variants | Canonical |
| **Canvas/Celebration** | canvas-confetti (v1.4+) | Tier-based confetti bursts | Canonical |
| **Low-Level Timing** | requestAnimationFrame | Rare: CatalogPickerModal only | Single-use; cleanup mandatory |
| **Audio** | use-sound (v4.4+) + Web Audio API | SFX playback via SOUND_SLOTS | Canonical |
| **Haptics** | Navigator.vibrate() + iOS audio trick | Touch feedback via haptics store | Canonical |
| **Accessibility** | prefers-reduced-motion @media + useReducedMotion() | All animation gates | Canonical |

**Explicit Exclusion List (Freeze Date: 2026-07-30):**

The following technologies are **NOT introduced** without Architecture Board approval:

- ❌ **Phaser** (game framework — adds redundant physics + render loop)
- ❌ **Three.js** (3D rendering — out of scope for Quiz interaction)
- ❌ **PixiJS** (2D renderer — motion/react + canvas-confetti sufficient)
- ❌ **Rive** (animated illustrations — use SVG + motion/react)
- ❌ **GSAP** (tween engine — motion/react covers all use cases)
- ❌ **New Client State Machine** (Redux/MobX/zustand-extension — current Zustand stores sufficient)
- ❌ **New Game/Logic Library** (custom eval, physics, sequence engines — monolithic eval.rs + socket protocol sufficient)

**Rationale:** The excluded libraries add render-loop coupling, state-machine complexity, or redundant animation capabilities. motion/react + canvas-confetti + rAF covers all demo requirements.

### 3. Confetti (E-01 Consolidation)

**Decision:** canvas-confetti is the canonical backend for all celebration visual effects.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Primary System** | canvas-confetti (`utils/confetti.ts`) | Worker-backed, tier-aware, z-indexed at 40 |
| **Fire API** | `fireTierConfetti()` + `fireCenterSalvo()` | Result.tsx, SoloAnswers.tsx route through these |
| **Legacy Consumer** | react-confetti (Podium.tsx, SharePage.tsx lazy imports) | Existing integration pattern; runs via legacy adapter (separate visual intent for results page) |
| **Reduced Motion** | `disableForReducedMotion=true` in all fire() calls | 8-point confetti audit: ✓ Verified in confetti.ts:41 |
| **Z-Indexing** | CONFETTI_Z_INDEX=40 (below z-10 toolbar, above z-30 game) | Safe modal/toolbar overlap; verified in codebase grep |
| **Removal Decision** | react-confetti removal **delegated to WP-KIT-14** | Not decided now; current state acceptable |

**Implication for WP-KIT-04 ff.:** All new celebration logic (achievement unlocks, milestone markers) routes through `fireTierConfetti()` with explicit tier/color mapping. No new confetti libraries introduced.

### 4. Lifecycle Principle (SDD §18)

**Binding Rule for All Animation, Audio, Haptics, and Canvas Usage:**

#### Mount
- Canvas/rAF/animation initialized **only when component is visible to user** (e.g., Answers.tsx mounts motion/div only inside game surface).
- Audio playback queued to user gesture context when possible (haptic unlock on iOS).
- Null-check guards for audio contexts and haptics store before firing.

#### Active State
- No permanent `requestAnimationFrame()` loops without active animation/effect.
- Animation frames terminate when:
  - Component receives `hidden` CSS class or `visibility:hidden`.
  - Parent surface unmounts.
  - `useReducedMotion()` evaluates to true.
- Audio `stop()` called on component unmount (Responses.test.tsx pattern: stop on cleanup).

#### Cleanup
- `useEffect(() => { return () => { cleanupCanvas(); stopAudio(); } }, [])` mandatory for:
  - Canvas elements (confetti, timer rings)
  - Audio playback (useSound stop())
  - Haptic patterns
  - requestAnimationFrame callbacks (cancelAnimationFrame)
- Modal/Overlay unmount automatically clears z-indexed layers (no lingering confetti or audio).
- Browser `beforeunload` event calls no animation callbacks (tab unload, refresh).

**Consequence:** No memory leaks under extended play; battery/CPU usage scales with active effects, not session duration.

### 5. Acceptance Gate for Wave 1 (WP-KIT-04 through WP-KIT-08)

The following are treated as **given constraints** during Wave 1 implementation:

| Gate | Asset | Status | Notes |
|------|-------|--------|-------|
| **E-01** | Confetti strategy (canvas-confetti + react-confetti) | Locked ✓ | See §3 above |
| **E-02** | Reduced-motion compliance (@media + useReducedMotion) | Locked ✓ | Audit verified; no new gates required |
| **E-03** | Audio/haptics store toggles (independent) | Locked ✓ | LS persistence, AvToggles UI, game-only surface scope |
| **#876-Envelope** | Manager event routing (skipQuestion, adjustTimer, revealAnswer) | Locked ✓ | Backend handlers exist; UI buttons in WP-KIT-07 |

**Non-Goals for Wave 1:**
- Phaser/Three.js/PixiJS introduction.
- New state-machine frameworks (Zustand stores sufficient).
- Confetti react-library removal (deferred to WP-KIT-14).
- CSS animation refactor (spotlight/show animations; low priority from inventory audit).

---

## Safeguards (Mandatory for All Wave 1 WPs)

### Pre-Implementation
1. **Module placement:** If extracting a helper (presets, lifecycle, etc.), verify it belongs in `common/animation/` by checking call sites (single surface = stays local; 2+ surfaces = shared).
2. **Confetti calls:** All `fireTierConfetti()` invocations must pass explicit `tier` and verify tier→color mapping is exhaustive.
3. **Lifecycle guards:** New canvas/rAF/audio usage must have test coverage for mount (visible), active (not reduced-motion), and cleanup (unmount/hidden).

### Code Review (WP-KIT-04 ff.)
- **Confetti audit:** grep `fireTierConfetti|fireCenterSalvo|canvas-confetti` to ensure no new direct imports outside confetti.ts.
- **Animation framework:** grep `import.*\(Phaser\|Three\|PixiJS\|Rive\|GSAP\)` to enforce exclusion list.
- **Lifecycle:** Verify all rAF/canvas components have cancelAnimationFrame/cleanup in useEffect return.
- **Reduced-motion:** All motion.div animations must call `useReducedMotion()` upstream or gate variant selection.

---

## Consequences

### Positive
- **Clarity:** Developers know exactly which animation/audio code is shared (common/animation/) vs. surface-specific (game/manager/console).
- **Maintainability:** 6-way PRESS_FEEDBACK duplication eliminated; listMotion centralized; single confetti backend for all celebrations.
- **Accessibility:** Reduced-motion compliance built into shared lifecycle layer; no per-surface re-implementation.
- **Performance:** Canvas/rAF lifecycle gates prevent memory leaks and battery drain under extended play.
- **Extensibility:** New animation features route through canonical motion/react + confetti.ts, preventing library fragmentation.

### Constraints
- **Tech freeze:** Phaser/Three.js/Rive/GSAP not available without board approval (ADR change required).
- **Confetti workflow:** All celebration logic funnels through `fireTierConfetti(tier)` with explicit tier enums (bronze/silver/gold/diamant/custom).
- **Lifecycle rigor:** No rAF/canvas without cleanup tests; violations caught in Wave 1 code review.

---

## References

- **Inventory:** `docs/audit/experience-kit-animation-inventory.md` (143 entries, 2026-07-30)
- **SDD §2.1, §9, §18:** `docs/wave6-7-sdd.md` (technology + boundary principles)
- **Issue #876:** Manager event routing (given constraint for Wave 1)
- **Templates:** `common/animation/` (motion/react patterns), `common/audio/` (SOUND_SLOTS, haptics store), `features/game/animation/` (game surface presets)
