Der Architectural Review Report für das **Razzoozle Flower Battle Animation System** wurde erstellt und unter [`/tmp/garden-atmosphere-review-AGY.md`](file:///tmp/garden-atmosphere-review-AGY.md) gespeichert.

### Zusammenfassung der Haupterkenntnisse

1. **Kritische Bugs**:
   - **Bezier-Teleportation** ([`GardenButterflyController.ts:603-613`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenButterflyController.ts#L603-L613)): Auf Segmentgrenzen (`t >= 1`) wird `t` fälschlicherweise auf dem *neuen* Bezier-Segment ausgewertet, was den Schmetterling sofort an das Segmentende teleportiert.
   - **Fehlendes `reducedMotion` in WindLines** ([`GardenWindLineController.ts:58-125`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenWindLineController.ts#L58-L125)): `GardenWindLineController` akzeptiert kein `reducedMotion`-Flag und bewegt Speed-Lines auch bei reduzierter Bewegung weiter.

2. **Performance & Leaks**:
   - **GPU-Texture-Leak in Egg-Controller** ([`GardenEggController.ts:188-195`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenEggController.ts#L188-L195)): `GardenEggController` erstellt bei jedem Bind 13 neue Pixi-Texturen ohne sie bei `destroy()` freizugeben.
   - **Globaler Cache-Destroy-Nebeneffekt** ([`GardenButterflyController.ts:542`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenButterflyController.ts#L542)): Das Löschen einer einzelnen `GardenButterflyController`-Instanz zerstört den globalen Texturcache.

3. **Test-Suite & Operatives**:
   - **Stale Assertions** ([`attachGardenPixiApplication.quality.test.ts:186-230`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/__tests__/attachGardenPixiApplication.quality.test.ts#L186-L230)): Die 2 Fehlschläge resultieren aus veralteten Tests, die noch auf den alten Layer `skyLife` (statt `skyLifeForeground`) und veraltete `BIRD_COUNTS` prüfen.

### Top-3 Empfehlungen (Priorisiert)

1. **Fix Bezier-Segment-Transition** in [`GardenButterflyController.ts:603-613`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenButterflyController.ts#L603-L613) (Segment-Fortschritt auf dem neuen Segment bei 0 verankern).
2. **`reducedMotion`-Support** in [`GardenWindLineController.ts:58-125`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenWindLineController.ts#L58-L125) einbauen & alte Assertions in [`attachGardenPixiApplication.quality.test.ts`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/__tests__/attachGardenPixiApplication.quality.test.ts#L186-L230) aktualisieren.
3. **GPU-Texture-Leak** in [`GardenEggController.ts:188-195`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenEggController.ts#L188-L195) beheben (Texturen bei `destroy()` freigeben).
Der Architectural Review Report unter [`/tmp/garden-atmosphere-review-AGY.md`](file:///tmp/garden-atmosphere-review-AGY.md) ist vollständig abgeschlossen und alle Testabläufe wurden verifiziert.
reateSeededRandom(seed)`. Determinism is 100% preserved given identical initial seeds.
- **Suggested Fix**: None required for RNG. Maintain strict linter rules preventing `Math.random()` imports in `rendering/atmosphere/`.

### A4. Physics & Delta Time Clamping
- **Severity**: Important
- **Location**: [`GardenEggController.ts:266-276`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenEggController.ts#L266-L276)
- **Problem**: In `GardenEggController`, gravity integration uses `const frames = dt * 60` where `egg.vy = Math.min(egg.vy + EGG_GRAVITY * frames, EGG_TERMINAL_VEL)` and `egg.y += egg.vy * frames`. Because `egg.vy` accumulates in units of `px/frame` and is then multiplied by `frames` again, frame rate fluctuations (e.g. 30 fps vs 60 fps) produce divergent total fall displacements (quadratic timestep scaling).
- **Suggested Fix**: Standardize `vy` units to `logical-px/sec` across all controllers (`vy += EGG_GRAVITY_PX_SEC2 * dt; y += vy * dt`), matching the ballistic model used in `GardenParticleController`.

### A5. Reduced-Motion Non-Compliance in Wind Lines
- **Severity**: Critical
- **Location**: [`GardenWindLineController.ts:58-125`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenWindLineController.ts#L58-L125)
- **Problem**: `GardenWindLineController` does not accept or respect `prefersReducedMotion`. When reduced motion is enabled globally, `GardenAtmosphereController` still instantiates `GardenWindLineController`, and its `update()` method continues scrolling 6 speed lines across the screen at `alpha = 0.55`. This violates accessibility semantics (`prefersReducedMotion === true` must suspend motion).
- **Suggested Fix**: Add `reducedMotion?: boolean` to `GardenWindLineControllerOptions`, pass `options.prefersReducedMotion` from `GardenAtmosphereController`, and short-circuit `update()` and initial line rendering when `reducedMotion` is true.

### A6. Empty `flowerAnchors` Edge Case in Egg Shatter
- **Severity**: Minor (Verified Safe)
- **Location**: [`GardenEggController.ts:352-367`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenEggController.ts#L352-L367)
- **Problem**: When `flowerAnchors` is empty (`[]`), `resolveImpactY` cleanly falls back to `ATMOSPHERE_HEIGHT * EGG_IMPACT_Y_FRACTION` (842.4 px).
- **Suggested Fix**: None required. Code handles empty arrays correctly.

### A7. Z-Ordering Verification
- **Severity**: Minor
- **Location**: [`gardenLayers.ts:32-59`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/gardenLayers.ts#L32-L59), [`GardenScene.ts:332`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/GardenScene.ts#L332)
- **Problem**: Birds mount into `layer-sky-life-foreground` (index 4), which correctly places them above background hills/bushes and behind trees/fence/plots. Falling eggs mount into `layer-ambient` (index 14), placing them above `flower-teams` (index 11) and `soil-plots` (index 10). This makes egg shatters correctly visible over plants, but causes falling eggs to render in front of `near-trees` (index 8).
- **Suggested Fix**: If strict tree occlusion is required, split egg rendering into `layer-weather` (for falling eggs behind foreground trees) and `layer-ambient` (for ground splats).

---

## B. Code Quality

### B1. Module Line Count Hard-Cap Exceedances
- **Severity**: Important
- **Location**:
  - [`GardenEggController.ts`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenEggController.ts) (764 lines)
  - [`ButterflyTypeBake.ts`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/ButterflyTypeBake.ts) (682 lines)
  - [`GardenButterflyController.ts`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenButterflyController.ts) (675 lines)
  - [`GardenParticleController.ts`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenParticleController.ts) (596 lines)
- **Problem**: Three files exceed the repository's 600-line hard cap (`GardenEggController.ts`, `ButterflyTypeBake.ts`, `GardenButterflyController.ts`), and `GardenParticleController.ts` sits at 596 lines. This violates `AGENTS.md` monorepo refactoring guidelines.
- **Suggested Fix**:
  - Extract Canvas2D texture generation helpers from `GardenEggController.ts` into `GardenEggTextures.ts`.
  - Extract Canvas2D fallback wing drawers from `ButterflyTypeBake.ts` into `ButterflyCanvasDrawers.ts`.
  - Extract Bezier Math & Segment Generators from `GardenButterflyController.ts` into `butterflyBezierHelpers.ts`.

### B2. Public API Surface Leakage
- **Severity**: Minor
- **Location**: [`index.ts:61-67, 88-140`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/index.ts#L61-L67)
- **Problem**: `index.ts` re-exports internal testing/diagnostic utilities like `clearButterflyTextureCache`, `getButterflyTextureCacheSource`, and dozens of internal numeric range constants (e.g. `BIRD_SCALE_RANGE`, `GUST_LEAF_PEACH`).
- **Suggested Fix**: Restrict exports in `index.ts` to public facade types and factories (`createGardenAtmosphere`, `BoundGardenAtmosphere`, `CreateGardenAtmosphereOptions`). Keep internal constants accessible via direct module imports for unit tests.

### B3. Dead Code in `GardenBirdController`
- **Severity**: Minor
- **Location**: [`GardenBirdController.ts:205-212`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenBirdController.ts#L205-L212)
- **Problem**: Lines 205-212 check `if (this.reducedMotion)` inside the `GardenBirdController` constructor. However, line 176 (`if (this.reducedMotion) return`) already returned from the constructor, making lines 205-212 unreachable dead code.
- **Suggested Fix**: Remove the duplicate `reducedMotion` block.

---

## C. Performance

### C1. Un-Cached Texture Leaks in `GardenEggController`
- **Severity**: Critical
- **Location**: [`GardenEggController.ts:188-195, 322-340`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenEggController.ts#L188-L195)
- **Problem**: Every instantiation of `GardenEggController` constructs fresh Pixi textures (`buildEggTexture()`, `buildShardTexture()`, `buildYolkTexture()`, `buildMiniYolkTexture()`). In `destroy()`, only the child `Sprite` nodes are destroyed; the underlying 13 `Texture` instances are never destroyed and remain in GPU memory, causing a leak every time the scene rebinds.
- **Suggested Fix**: Store generated textures in an array on the instance (`this.generatedTextures`) and explicitly invoke `texture.destroy(true)` during `destroy()`, or cache them globally.

### C2. Global Texture Cache Destruction Side-Effects in Butterfly Controller
- **Severity**: Important
- **Location**: [`GardenButterflyController.ts:542`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenButterflyController.ts#L542), [`ButterflyTypeBake.ts:656-666`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/ButterflyTypeBake.ts#L656-L666)
- **Problem**: `GardenButterflyController.destroy()` calls `clearButterflyTextureCache()`, which destroys all textures in the global `cache` map (`entry.up.destroy(true)`). If multiple `GardenButterflyController` instances exist or if a secondary scene references cached textures, destroying one controller invalidates textures in active use elsewhere.
- **Suggested Fix**: Do not clear global shared texture caches inside an individual instance's `destroy()` method. Let texture caches persist for the app session or clear them only at application unmount.

### C3. Micro-Allocation Churn in Butterfly Path Updates
- **Severity**: Minor
- **Location**: [`GardenButterflyController.ts:225-260, 613`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenButterflyController.ts#L225-L260)
- **Problem**: `cubicBezier` and `cubicBezierDerivative` allocate new `{ x, y }` objects per frame per active slot (360 allocations/sec for 6 slots at 60 fps).
- **Suggested Fix**: Mutate an in-place output point object or use primitive coordinates to eliminate per-frame object allocation.

---

## D. Live-State / Operational

### D1. Layer Positioning of `eggContainer`
- **Severity**: Minor / Design Choice
- **Location**: [`GardenScene.ts:332`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/GardenScene.ts#L332)
- **Problem**: Mounting `eggLayer`, `eggShatterLayer`, and `eggYolkLayer` inside `layers.ambient` (layer 14) correctly renders yolk splats over soil/plants, but forces falling eggs to render above `near-trees` (layer 8).
- **Suggested Fix**: Acceptable for current art direction; if strict tree depth is required, mount falling eggs in `weather` layer (layer 12) and splats in `ambient` layer.

### D2. Pre-Existing Test Failures in `attachGardenPixiApplication.quality.test.ts`
- **Severity**: Critical (Breaks CI Test Suite)
- **Location**: [`attachGardenPixiApplication.quality.test.ts:186-189, 227-230`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/__tests__/attachGardenPixiApplication.quality.test.ts#L186-L189)
- **Problem**: Two tests fail in `attachGardenPixiApplication.quality.test.ts`:
  1. The test checks `scene.layers.skyLife.children` for bird sprites, but FU-I moved bird sprite mounting to `scene.layers.skyLifeForeground`.
  2. The test asserts expected lengths of `1` (for medium) and `2` (for high), but FU-J updated `BIRD_COUNTS` to `medium: 4` and `high: 5`.
- **Suggested Fix**: Update `attachGardenPixiApplication.quality.test.ts` to probe `scene.layers.skyLifeForeground.children` and update expected array length assertions to `4` (for medium) and `5` (for high).

---

## E. Recommendations & Top-3 Follow-ups

### Top-3 Follow-ups (Ranked by Impact-to-Risk Ratio)

1. **Fix Critical Bezier Teleportation Bug in `GardenButterflyController.ts`**
   - **File:Line**: [`GardenButterflyController.ts:603-613`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenButterflyController.ts#L603-L613)
   - **Rationale**: Eliminates visual butterfly teleportation on segment boundaries. High user-facing impact with minimal refactoring risk.

2. **Enforce `reducedMotion` Compliance in `GardenWindLineController.ts` & Update Failing Quality Tests**
   - **File:Line**: [`GardenWindLineController.ts:58-125`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenWindLineController.ts#L58-L125), [`attachGardenPixiApplication.quality.test.ts:186-230`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/__tests__/attachGardenPixiApplication.quality.test.ts#L186-L230)
   - **Rationale**: Fixes accessibility non-compliance for speed lines and restores 100% green test suite status across the repo.

3. **Plug GPU Texture Memory Leaks in `GardenEggController.ts` & Refactor Global Cache Cleanup**
   - **File:Line**: [`GardenEggController.ts:188-195, 322-340`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenEggController.ts#L188-L195), [`GardenButterflyController.ts:542`](file:///nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1/packages/web/src/experiences/flower-battle/rendering/atmosphere/GardenButterflyController.ts#L542)
   - **Rationale**: Prevents GPU memory leaks during garden scene rebinds and avoids accidental destruction of shared butterfly textures.
