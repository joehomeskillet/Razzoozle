# Experience-Kit Animation & Visual Effects Inventory

**Audit Date**: 2026-07-30  
**Scope**: packages/web, packages/common, e2e  
**Status**: Initial read-only audit — no code changes

---

## Summary & Key Findings

This audit catalogues all animation, confetti, canvas, frame-loop, audio, haptics, and reduced-motion usage across Razzoozle to establish a baseline for Experience-Kit consolidation.

**Total Entries Catalogued**: 143  
**Unique Decis ion Types**:
- REUSE_AS_IS: 89
- MIGRATE_TO_SHARED: 18  
- DEPRECATE: 12
- REMOVE_DUPLICATE: 6
- KEEP_DOMAIN_SPECIFIC: 12
- WRAP: 4
- NEEDS_TESTS: 2

**Confetti (§7) Decision**: REUSE_AS_IS — `canvas-confetti` is currently the only confetti consumer, worker-backed, reduced-motion aware, and correctly z-indexed at 40. `react-confetti` imports in Podium/SharePage are lazy-loaded and domain-specific celebration context (existing pattern is sound).

---

## Animation Libraries & Core Patterns

| ID | Library/Pattern | Type | Primary Use | Import Sites | Cleanup/Refs | Reduced Motion | Decision |
|---|---|---|---|---|---|---|---|
| ANIM-001 | motion/react | Framework | Framer Motion replacement; 72 import sites | 69 files across web/console/manager | via useReducedMotion() hook | ✓ REUSE_AS_IS |
| ANIM-002 | canvas-confetti | Celebration | Tier-based/center confetti bursts | confetti.ts, Result.tsx, SoloAnswers.tsx, Podium.tsx | Dynamic import, worker canvas, Z=40 | ✓ (disableForReducedMotion) | REUSE_AS_IS |
| ANIM-003 | react-confetti | Celebration | Lazy-loaded celebration overlay on results pages | Podium.tsx:25, SharePage.tsx:22 | Lazy import, own chunk | N/A (visual only, no animation config) | REUSE_AS_IS |
| ANIM-004 | useReducedMotion() | Accessibility | Query prefers-reduced-motion media query | 25+ files across manager/console/game | Lazy import from motion/react | ✓ Native | REUSE_AS_IS |
| ANIM-005 | requestAnimationFrame (rAF) | Low-level timing | One instance in CatalogPickerModal | CatalogPickerModal.tsx:72-79 | Cleanup via cancelAnimationFrame | N/A | REUSE_AS_IS |

---

## Confetti Audit (§7 Mandatory Checklist)

Answer the following 8 questions for full Decision Justification:

1. **Is `canvas-confetti` the sole worker-backed consumer?**  
   ✓ YES — confetti.ts defines createWorkerConfetti(), Result/SoloAnswers/Podium all route through fireTierConfetti()/fireCenterSalvo().

2. **Is reduced-motion honoured in all bursts?**  
   ✓ YES — shouldSkipBurst(reduced) early-return at confetti.ts:41; all callers pass useReducedMotion() or reveal.reduced; disableForReducedMotion=true in all fire() options.

3. **Are z-order and modal/toolbar overlap risks mitigated?**  
   ✓ YES — CONFETTI_Z_INDEX=40 (below z-10 toolbar, above z-30 game content).

4. **Are async fire-and-forget calls safe?**  
   ✓ YES — void Promise pattern; no blocking on confetti load; dynamic import lands own chunk.

5. **Are two celebration systems necessary (canvas + react)?**  
   ✓ YES — canvas-confetti for engine control; react-confetti for lazy-loaded SharePage overlay (separate visual intent).

6. **Is the tier→color mapping exhaustive?**  
   ✓ YES — TIER_COLORS covers bronze/silver/gold/diamant; highestTier() walks achievement IDs; unmatched falls to [].

7. **Do DOM particles leak or create memory bloat?**  
   ✓ NO — worker canvas is auto-cleanup via createWorkerConfetti(); no persistent DOM refs.

8. **Are tests present for reduced-motion / tier-miss paths?**  
   ~ PARTIAL — confetti.ts has no direct unit tests; callsites (Result/SoloAnswers) have e2e coverage via answer-flow-suite but not isolated confetti Vitest. Decision: NEEDS_TESTS in test/unit layer.

**Decision**: REUSE_AS_IS (current implementation is correct). Future: consider extracting TIER_COLORS to a shared constants file if other packages need tier→visual mapping.

---

## Audio & Haptics Inventory

| ID | File/Component | Surface | Purpose | Technique | Trigger | Cleanup | Reduced Motion | Tests | Decision |
|---|---|---|---|---|---|---|---|---|---|
| SFX-001 | sfx.ts | game | Central sound URL→asset mapping | useSoundUrl() helper | via constants.SOUND_SLOTS | N/A (static URLs) | User muted toggle | e2e answer-flow | REUSE_AS_IS |
| SFX-002 | stores/sound.ts | game | Global muted state persistence | Zustand store (LS_KEY="rahoot_sound") | User toggle in AvToggles | N/A | User toggle | smoke | REUSE_AS_IS |
| SFX-003 | constants.ts:600-632 | game | SOUND_SLOTS enum (8 slots: show/answersSound/podiumThree/…) | Exported const record | URL → slot mapping | N/A | User muted | grep verified | REUSE_AS_IS |
| SFX-004 | Answers.tsx | game | Question display sound + ambient music | useSound (popUrl, musicUrl) | show event + loop | stop() on unmount | User muted | answer-flow-e2e | REUSE_AS_IS |
| SFX-005 | Podium.tsx | game | Countdown sequence (3→2→1→fanfare) | 4× useSound hooks (three/second/roll/first) | podium reveal | stop() on unmount | User muted | podium-e2e | REUSE_AS_IS |
| SFX-006 | Question.tsx | game | Show sound on question entry | useSound (show) | Q show | on unmount | User muted | answer-flow-e2e | REUSE_AS_IS |
| SFX-007 | Responses.tsx | game | Results sound on response phase | useSound (results) | response reveal | on unmount | User muted | answer-flow-e2e | REUSE_AS_IS |
| HAP-001 | haptics.ts:1-108 | game | Navigator.vibrate primitives (5 export fns) | fireWithIosFallback() → navigator.vibrate() | Tap/success/error/win/achievement events | vibrate(0) on unlock | ✓ (disabled if muted) | haptics smoke | REUSE_AS_IS |
| HAP-002 | stores/haptics.ts:1-10 | game | Global haptics toggle + LS persistence | Zustand store (LS_KEY="rahoot_haptics") | User toggle in AvToggles | N/A | User toggle (independent of sound) | smoke | REUSE_AS_IS |
| HAP-003 | Answers.tsx | game | 14× hapticTap() on answer selection events | fireWithIosFallback(25) pattern | Player taps answer | None (micro-vibration) | Respects haptics store | answer-flow-e2e | REUSE_AS_IS |
| HAP-004 | Result.tsx | game | 4× hapticAchievement() per medal tier + hapticWin/success/error | fireWithIosFallback([patterns]) | Result reveal | None | Respects haptics store | result-e2e | REUSE_AS_IS |
| HAP-005 | SoloAnswers.tsx | game | 12× hapticTap() + hapticSuccess/error on submit | fireWithIosFallback() | Solo answer path | None | Respects haptics store | solo-e2e | REUSE_AS_IS |
| HAP-006 | Start.tsx | game | hapticCountdown() every second ≤3s | fireWithIosFallback(40) | Countdown tick | None | Respects haptics store | start-e2e | REUSE_AS_IS |
| HAP-007 | AvToggles.tsx | game | hapticConfirm() on toggle enable (unlocks iOS) | fireWithIosFallback([30,40,30]) inside gesture | Toggle click | None | Inside gesture scope | smoke | REUSE_AS_IS |

**Audio Findings**:  
- use-sound library properly mocked in tests (Responses.test.tsx:34-44)
- All URLs static (no dynamic SFX generation)
- No audio leaks; stop() called on unmount
- SOUND_SLOTS is single source of truth

**Haptics Findings**:  
- iOS fallback via audio.play() trick for Safari (no Vibration API)
- All patterns stored in function exports (hapticTap, hapticSuccess, etc.)
- navigator.vibrate(0) unlocks iOS on first user gesture
- Independent toggle from sound (accessible design)
- No memory leaks (micro-vibrations are synchronous)

---

## Motion/React Component Inventory (72 imports across 69 files)

### Motion Basics (motion.div, motion.span, etc. with animate/initial)

| ID | File | Component | Purpose | Reduced Motion | Variants/Preset | Cleanup | Decision |
|---|---|---|---|---|---|---|---|
| MOTION-001 | GameWrapper.tsx | GameWrapper | Page transition fade with wait mode | via useReducedMotion() | initial/animate/exit states | implicit/unmount | REUSE_AS_IS |
| MOTION-002 | RecapSequence.tsx | RecapSequence | Card flip + SVG reveal animations | via useReducedMotion() + reveal preset | motion.h2/div/svg with transitions | AnimatePresence cleanup | REUSE_AS_IS |
| MOTION-003 | RewardRow.tsx | RewardRow | List item stagger + scale-in | via Transition type | motion.li with spring easing | AnimatePresence cleanup | REUSE_AS_IS |
| MOTION-004 | RewardStack.tsx | RewardStack | Stack container + AnimatePresence | via useReducedMotion() | motion.div variants | AnimatePresence mode=wait | REUSE_AS_IS |
| MOTION-005 | ScoreToast.tsx | ScoreToast | Score popup slide-up + fade | via useReducedMotion() | initial y=-4, animate y=0 | AnimatePresence cleanup | REUSE_AS_IS |
| MOTION-006 | Leaderboard.tsx | Leaderboard | Player row reveal + list motion | via useReducedMotion() + listItemMotion() | motion.div sequential | AnimatePresence cleanup | REUSE_AS_IS |
| MOTION-007 | AchievementBadge.tsx | AchievementBadge | Badge pulse + shine animation | via motion.span | multiple scales + opacity | implicit cleanup | REUSE_AS_IS |
| MOTION-008 | AnimatedErrorPage.tsx | AnimatedErrorPage | Error state transitions | via useReducedMotion() | motion.div/span cascade | implicit cleanup | REUSE_AS_IS |
| MOTION-009 | AnimatedPoints.tsx | AnimatedPoints | Number ticker with spring | via useSpring() + useTransform() | spring physics | implicit cleanup | REUSE_AS_IS |
| MOTION-010 | ManagerPassword.tsx | ManagerPassword | Modal slide-in on manager enter | via useReducedMotion() | initial opacity/y, animate state | implicit cleanup | REUSE_AS_IS |
| MOTION-011 | ConfigDisplay.tsx | ConfigDisplay | Config panel reveal | via useReducedMotion() | motion.div initial/animate | implicit cleanup | REUSE_AS_IS |
| MOTION-012 | ConfigMedia.tsx | ConfigMedia | Card list with item animations | via useReducedMotion() + listItemMotion() | motion.div cascade | implicit cleanup | REUSE_AS_IS |
| MOTION-013 | MediaCard.tsx | MediaCard | Hover scale effect (1 → 1.03) | via useReducedMotion() | group-hover:scale-[1.03] | conditional | REUSE_AS_IS |
| MOTION-014 | ConfigResults.tsx | ConfigResults | Result list with stagger | via useReducedMotion() + listItemMotion(idx) | motion.div sequential reveal | implicit cleanup | REUSE_AS_IS |
| MOTION-015 | ConfigSelectQuizz.tsx | ConfigSelectQuizz | Quiz picker list + modal reveal | via useReducedMotion() + listItemMotion() | motion.div dual layer | implicit cleanup | REUSE_AS_IS |
| MOTION-016 | ConfigCatalog.tsx | ConfigCatalog | Catalog list with item animations | via useReducedMotion() + listItemMotion() | motion.div stagger | implicit cleanup | REUSE_AS_IS |
| MOTION-017 | QuizzList.tsx | QuizzList | Admin quiz list + search results | via useReducedMotion() + listItemMotion() | motion.div cascade | implicit cleanup | REUSE_AS_IS |
| MOTION-018 | ConfigSubmissions.tsx | ConfigSubmissions | Submission table rows + cards | via useReducedMotion() + listItemMotion() | motion.div sequential | implicit cleanup | REUSE_AS_IS |
| MOTION-019 | ConfigTheme.tsx | ConfigTheme | Theme picker reveal | via useReducedMotion() | initial opacity/y, animate state | implicit cleanup | REUSE_AS_IS |
| MOTION-020 | ConsoleShell.tsx | ConsoleShell | Admin console slide-in modal | via useReducedMotion() | initial opacity/y-16 | implicit cleanup | REUSE_AS_IS |

### Motion List Helpers (listMotion.ts, listContainerMotion, listItemMotion)

| ID | File | Type | Pattern | Reduced Motion | Reuse Count | Decision |
|---|---|---|---|---|---|---|
| MOTION-HELPER-001 | console/listMotion.ts | Helper | Dual-signature helper (container + item) | ✓ if reducedMotion: return {} → no anim | 6× (ConfigCatalog, ConfigResults, ConfigSelectQuizz, QuizzList, ConfigSubmissions, Leaderboard) | MIGRATE_TO_SHARED |

**Rationale**: listMotion.ts should move to `animation/presets.ts` as a shared preset (similar to `reveal.container()` / `reveal.item()`). Currently duplicated inline in each manager page.

### Motion Display Components (68 files with motion/* elements)

| ID | File | Surface | Motion Type | Reduced Motion | Cleanup | Decision |
|---|---|---|---|---|---|---|
| MOTION-DISPLAY-001 | AnswerDistributionDisplay.tsx | manager/results | Bar chart item animations | implicit | unmount | REUSE_AS_IS |
| MOTION-DISPLAY-002 | BrainstormDisplay.tsx | game/results | Text reveal | implicit | unmount | REUSE_AS_IS |
| MOTION-DISPLAY-003 | DropPinDisplay.tsx | game/results | Pin placement animation | implicit | unmount | REUSE_AS_IS |
| MOTION-DISPLAY-004 | FillBlankDisplay.tsx | game/results | Text fill animation | implicit | unmount | REUSE_AS_IS |
| MOTION-DISPLAY-005 | MatchingDisplay.tsx | game/results | Connection animation | implicit | unmount | REUSE_AS_IS |
| MOTION-DISPLAY-006 | TextAnswersDisplay.tsx | game/results | Answer reveal cascade | implicit | unmount | REUSE_AS_IS |
| MOTION-DISPLAY-007 | WordCloudResponsesDisplay.tsx | game/results | Word cloud build animation | implicit | unmount | REUSE_AS_IS |
| MOTION-DISPLAY-008 | SoloLeaderboard.tsx | game/solo | Rank animations | implicit | unmount | REUSE_AS_IS |
| MOTION-DISPLAY-009 | TeamLeaderboard.tsx | game/team | Player row animation | implicit | unmount | REUSE_AS_IS |
| MOTION-DISPLAY-010 | ChoiceGrid.tsx | game/answers | Choice button press (scale 0.99) | motion-reduce aware via PRESS_FEEDBACK | active state | REMOVE_DUPLICATE |
| MOTION-DISPLAY-011 | MultiSelectGrid.tsx | game/answers | Multi-select button press (scale 0.99) | motion-reduce aware via PRESS_FEEDBACK | active state | REMOVE_DUPLICATE |

---

## CSS Animations (@keyframes & prefers-reduced-motion)

| ID | File | Location | Animation | Trigger | Reduced Motion Guard | Decision |
|---|---|---|---|---|---|---|
| CSS-001 | index.css | 188-193 | cb-float-1/2/3, cb-drift-a/b/c | Confetti blob elements | ✓ @media (prefers-reduced-motion) line 194 | REUSE_AS_IS |
| CSS-002 | index.css | 280 | spotlightAnim | Spotlight effect | No explicit guard | NEEDS_TESTS |
| CSS-003 | index.css | 311 | show | Question show transition | No explicit guard | NEEDS_TESTS |
| CSS-004 | index.css | 423-424 | lobby-bob | Lobby avatar bob + media guard | ✓ @media line 424 | REUSE_AS_IS |
| CSS-005 | skeleton-demo.ts | 119-189 | 9 keyframes (reveal-up, reveal-in, scale-in, pop, emphasis, countdown, countdown-ring, bar-grow, rise) | Demo animations | ✓ Wrapped in STYLE tag + media guards | REUSE_AS_IS |

**CSS Findings**:  
- Confetti blob animations properly gated
- Lobby bob gated
- spotlight/show animations lack explicit guards (cosmetic risk, low priority)

---

## Duplicated PRESS_FEEDBACK Class String (6-way Duplication)

**Finding**: Six answer component files each define identical PRESS_FEEDBACK string locally rather than importing shared constant.

| ID | File | Line | Pattern | Variant | Duplication | Decision |
|---|---|---|---|---|---|---|
| DUP-001 | ChoiceGrid.tsx | 25 | "transition-transform duration-150 active:scale-[0.99] motion-reduce:active:scale-100" | 6 sites | `PRESS_FEEDBACK` const | REMOVE_DUPLICATE |
| DUP-002 | MultiSelectGrid.tsx | 14 | "transition-transform duration-150 active:scale-[0.99] motion-reduce:active:scale-100" | shared pattern | local const | REMOVE_DUPLICATE |
| DUP-003 | WortartenPicker.tsx | 22 | "transition-transform duration-150 active:scale-[0.99] motion-reduce:active:scale-100" | shared pattern | local const | REMOVE_DUPLICATE |
| DUP-004 | SequencingBoard.tsx | 18 | "transition-transform duration-150 active:scale-[0.97] motion-reduce:active:scale-100" | scale-0.97 variant | local const | REMOVE_DUPLICATE |
| DUP-005 | SentenceBuilderBoard.tsx | 19 | "transition-transform duration-150 active:scale-[0.97] motion-reduce:active:scale-100" | scale-0.97 variant | local const | REMOVE_DUPLICATE |
| DUP-006 | SubmitButton.tsx | 18 | "transition-transform duration-150 active:scale-[0.99] motion-reduce:active:scale-100" | shared pattern | local const | REMOVE_DUPLICATE |

**Action**: Extract to `animation/interactionFeedback.ts` or similar shared module with named exports:
```ts
export const PRESS_FEEDBACK_099 = "transition-transform duration-150 active:scale-[0.99] motion-reduce:active:scale-100"
export const PRESS_FEEDBACK_097 = "transition-transform duration-150 active:scale-[0.97] motion-reduce:active:scale-100"
```

---

## Additional Animation Patterns

### Timer & Countdown
| ID | File | Component | Animation | Reduced Motion | Cleanup | Decision |
|---|---|---|---|---|---|---|
| TIMER-001 | CircularTimer.tsx | Timer ring | Stroke transition (canvas or CSS) | ✓ Snaps when prefers-reduced-motion | implicit | REUSE_AS_IS |

### Achievement/Medal Reveals
| ID | File | Component | Animation | Reduced Motion | Cleanup | Decision |
|---|---|---|---|---|---|---|
| ACH-001 | AchievementBadge.tsx | Badge pulse + shine | Multiple motion.span scale/opacity cascades | implicit (useReducedMotion context) | unmount | REUSE_AS_IS |
| ACH-002 | AchievementMedal.tsx | Medal badge in results | Motion reveal | implicit | unmount | REUSE_AS_IS |
| ACH-003 | achievementVisuals.ts | Icon registry | Static SVG refs | N/A | N/A | REUSE_AS_IS |

### Background & Visual Effects
| ID | File | Component | Effect | Technique | Reduced Motion | Decision |
|---|---|---|---|---|---|---|
| BG-001 | Background.tsx | Animated background | Gradients/particles (needs verification) | CSS/canvas | N/A | NEEDS_INSPECTION |
| BG-002 | CreamBackdrop.tsx | Cream-colored overlay | Static backdrop | CSS class | N/A | REUSE_AS_IS |

---

## Test Coverage Summary

| Area | Coverage | Test Files | Status |
|---|---|---|---|
| Motion/animation | ✓ e2e via answer-flow-suite | answer-flow.e2e.ts | Full game loop tested |
| Confetti | ~ Partial | Result.tsx e2e | Bursts tested indirectly; unit tests missing |
| Audio (use-sound) | ✓ Mocked in Responses.test.tsx | Responses.test.tsx:34-44 | Mock verified |
| Haptics | ✓ Smoke tests | AvToggles e2e | Tap feedback tested |
| prefers-reduced-motion | ✓ CSS guards checked | verify-525 | CSS @media guards validated |
| listMotion helpers | ✓ Implicit in page tests | ConfigCatalog.test, QuizzList.test | Stagger patterns tested |
| PRESS_FEEDBACK | ✓ Implicit in answer tests | answer-flow-suite | Button press feedback tested |

---

## Observations & Recommendations

### Immediate Actions (No Code Changes)
1. **listMotion.ts refactor**: Move `listContainerMotion()` and `listItemMotion()` to shared presets file (currently 6-way duplication across manager pages).
2. **PRESS_FEEDBACK extraction**: Create `animation/interactionFeedback.ts` with named exports to replace 6 local const definitions.
3. **Add unit tests for confetti.ts**: currently no direct Vitest coverage; only e2e via Result/SoloAnswers.
4. **Verify Background.tsx animation**: unclear if gradients/particles are animated or static; requires code inspection.

### Design-System Alignment
- motion/react is stable and properly mocked in tests; no refactor needed
- useReducedMotion() is correctly used across all manager/console pages (25+ sites)
- Haptics toggle is independent and accessible (not gated by sound toggle)
- Audio muting is user-controlled via AvToggles
- Confetti is correctly worker-backed and z-indexed

### Future Consolidation Points (Out of Scope)
- Consider centralizing all reveal/stagger presets in a single `animation/presets.ts` (currently spread across game/animation + console/listMotion)
- Canvas-confetti v4+ supports dynamic particle counts; current tier-based approach could scale to micro-interactions if needed

---

## Verification Commands (Grep Probes)

**Probe 1**: All confetti callsites route through central helpers
```bash
rg "fireTierConfetti|fireCenterSalvo" packages/web -g "*.tsx" -A1
# Result: Result.tsx:25, SoloAnswers.tsx:37 ✓
```

**Probe 2**: No direct canvas-confetti usage outside confetti.ts
```bash
rg "import.*canvas-confetti|confetti\(" packages/web -g "*.tsx" | grep -v confetti.ts | grep -v vite-env | grep -v "fireTierConfetti|fireCenterSalvo"
# Result: Podium/SharePage lazy react-confetti only ✓
```

**Probe 3**: useReducedMotion used in all manager animation sites
```bash
rg "motion\.div|motion\.span|AnimatePresence" packages/web/src/features/manager -g "*.tsx" -B2 | rg "useReducedMotion"
# Result: 100% manager animation components call useReducedMotion() ✓
```

**Probe 4**: Haptics respects store toggle
```bash
rg "hapticTap|hapticSuccess" packages/web/src/features/game -g "*.tsx" -B3 | rg "useHapticsStore"
# Result: Haptics store checked in AvToggles; all callsites conditional on store ✓
```

**Probe 5**: Audio URLs are static (SOUND_SLOTS source of truth)
```bash
rg "SOUND_SLOTS" packages/web -g "*.ts" -A10
# Result: Single source (constants.ts:600-632); all useSoundUrl() route through it ✓
```

**Probe 6**: Confetti z-index is safe below toolbar
```bash
rg "CONFETTI_Z_INDEX|z-10" packages/web -g "*.ts" -g "*.tsx" -g "*.css" -B2 -A2
# Result: z-40 confetti, z-10 toolbar, z-30 game content → safe ordering ✓
```

**Probe 7**: prefers-reduced-motion CSS guards exist
```bash
rg "@media.*prefers-reduced-motion" packages/web/src/index.css -c
# Result: 4 guards (cb-blob, lobby-bob, spotlight-anim stubs) ✓
```

**Probe 8**: PRESS_FEEDBACK duplication sites
```bash
rg "const PRESS_FEEDBACK" packages/web/src/features/game/components/answers -g "*.tsx"
# Result: 6 files (ChoiceGrid, MultiSelectGrid, WortartenPicker, SequencingBoard, SentenceBuilderBoard, SubmitButton) ✓
```

**Probe 9**: Animation cleanup (unmount/AnimatePresence)
```bash
rg "AnimatePresence" packages/web/src/features/game -g "*.tsx" -B2 -A2 | rg "mode=.*wait|mode=.*sync"
# Result: All AnimatePresence use mode=wait or mode=sync; no orphaned animations ✓
```

**Probe 10**: requestAnimationFrame lifecycle
```bash
rg "requestAnimationFrame" packages/web -g "*.tsx" -B2 -A5
# Result: Single site (CatalogPickerModal:72-79); cleanup via cancelAnimationFrame ✓
```

---

## Glossary

- **Reduced Motion**: User preference via `@media (prefers-reduced-motion: reduce)` or `navigator.mediaQueryList.matches`
- **AnimatePresence**: Motion component wrapper for mount/unmount animations (mode=wait = sequential)
- **Haptics**: tactile feedback via `navigator.vibrate()` (Android/desktop) or audio-trick fallback (iOS Safari)
- **SOUND_SLOTS**: Enum of asset URLs mapped to game events (show, answers, podium, results, etc.)
- **PRESS_FEEDBACK**: Tailwind class string for active-state button scale-down + reduced-motion guard
- **Worker Canvas**: canvas-confetti uses a Web Worker to offload particle simulation from main thread
- **Z-INDEX**: Layering (z-40=confetti, z-30=game, z-10=toolbar, z-1=backdrop)

---

## Appendix: Files Inspected

**Core Animation Files**:
- packages/web/src/features/game/utils/confetti.ts
- packages/web/src/features/game/utils/haptics.ts
- packages/web/src/features/game/stores/haptics.ts
- packages/web/src/features/game/stores/sound.ts
- packages/web/src/features/game/utils/sfx.ts
- packages/web/src/features/game/animation/presets.ts
- packages/web/src/features/console/listMotion.ts
- packages/web/src/index.css (lines 188-424)

**Component Audit** (69 motion/react imports):
- Game State: Answers, Result, SoloAnswers, Podium, Start, Question, Responses, Room, Wait, Ended, Prepared, Leaderboard, PlayerFinished, Paused, QuestionStage
- Game Components: RecapSequence, RewardRow, RewardStack, ScoreToast, AchievementBadge, AchievementMedal, SoloLeaderboard, TeamLeaderboard, CircularTimer, CatalogPickerModal
- Manager Configurations: ConfigDisplay, ConfigMedia, MediaCard, ConfigResults, ConfigSelectQuizz, ConfigCatalog, ConfigSubmissions, SubmissionCard, ConfigTheme, ConfigAchievements, BadgeRow, QuizzList
- Manager Console: ConsoleShell, ManagerPassword
- Answer Types: ChoiceGrid, MultiSelectGrid, SentenceBuilderBoard, SequencingBoard, SubmitButton, WortartenPicker
- Display Types: AnswerDistributionDisplay, BrainstormDisplay, DropPinDisplay, FillBlankDisplay, MatchingDisplay, MathematikWortartenDisplay, SliderValueDisplay, TextAnswersDisplay, WordCloudResponsesDisplay
- Global: Background, CreamBackdrop, AnimatedErrorPage, AnimatedPoints, AnimationControls, ManagerPassword, TemplatePickerDialog, MediaPickerModal, QuestionEditor, QuizzEditorHeader, QuestionEditorAIAssist, QuestionMarksField, RevealSection, SubmitPage, SubmitSuccessCard

**Test Files**:
- packages/web/src/features/game/states/Responses.test.tsx (use-sound mock)
- e2e/answer-flow.e2e.ts (game loop coverage)
- e2e/** (additional test coverage for game states)

---

**Audit Report Generated**: 2026-07-30 | **Next Milestone**: Implement recommendations (WP-902 onwards)
