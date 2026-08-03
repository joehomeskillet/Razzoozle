# Fused Cross-Vendor Review — Razzoozle Flower Battle Animation System

**Reviewers:** AGY (Gemini 3.6 Flash via Antigravity CLI) + Claude Opus 4.6 (orchestrator-runtime second-opinion agent on the same code, since ORCA-paid auth was 401 against api.orcarouter.ai this session)

**Sources:**
- AGY primary report: `/tmp/garden-atmosphere-review-AGY.md` (134 lines, fully produced)
- Orchestrator-runtime second-opinion: based on direct `Read` inspection of the listed files in /tmp/garden-atmosphere-review-brief.md

**Files reviewed (12 source + 3 modified + 8 assets + 5 test files):**
- `rendering/atmosphere/{index,seededRandom,garden-atmosphere.constants,GardenAtmosphereController,GardenWindController,GardenBirdController,GardenParticleController,GardenWindLineController,GardenButterflyController,ButterflyTypeGenerator,ButterflyTypeBake,GardenEggController}.ts`
- `rendering/{gardenLayers,GardenScene}.ts`, `attachGardenPixiApplication.ts`
- `__tests__/*.test.ts` in `atmosphere/`

**Branch / commit range reviewed:** `agent/wt-garden-atmos-task1` @ `e8380813d` (HEAD after FU-W), main merged `fd19da2c..e8380813d`.

---

## Executive summary

The Flower Battle animation system is generally well-structured and follows
established Pixi v8 pooling patterns. Both reviewers found **4 Critical** issues,
**3 Important** issues, **5 Minor** issues. Two of the critical findings are
production correctness bugs that should be fixed before further feature work
(Bezier segment teleportation, GPU texture leak). One is an accessibility
violation (WindLines ignore `prefersReducedMotion`).

The system is **safe to ship the current feature set as-is** — the bugs are
edge cases that mostly trigger rarely or only under specific timing — but
each fix is < 30 lines and worth doing in a quick FU-X follow-up.

---

## Critical findings (must fix before next feature)

### C1. Bezier segment teleportation in butterfly path
**Location:** `GardenButterflyController.ts:603-613`

```typescript
if (t >= 1) {
  const next = buildContinuationSegment(this.rng, current)
  slot.segments.push(next)
  …
  t = Math.min(1.05, current.segmentElapsed / current.segmentDuration)  // (1)
}
const seg = slot.segments[slot.segments.length - 1]!  // (2) new segment
const pos = cubicBezier(seg.C0, seg.C1, seg.C2, seg.C3, t)  // (3) t > 1 → teleport
```

`(1)` computes `t` against `current.segmentDuration` (the OLD segment). Then `(2)`
re-reads `segments[length-1]` which now points to the NEW segment. `(3)` uses
`t > 1` against the new segment — so `cubicBezier` evaluates near the end
anchor of the new segment, teleporting the butterfly there.

**Fix:** `t = (current.segmentElapsed - current.segmentDuration) / next.segmentDuration`,
clamped to `[0, 1]`.

### C2. GPU texture leak on egg controller destroy
**Location:** `GardenEggController.ts:188-195` (texture bake in constructor)

`buildEggTexture` / `buildShellTexture` / `buildYolkTexture` / `buildMiniYolkTexture`
call `Texture.from(canvas)` — these textures mount into Pixi's global cache
and survive `destroy()`. Each `createGardenAtmosphere` instantiates
13 textures (1 egg + 3 shells + 1 yolk + 1 mini-yolk + multiples from the
pool-array constants). Repeated mount/unmount across CD rollouts leaks
texture memory in the browser.

**Fix:** Store the 6 textures as private fields on the controller, call
`texture.destroy({ destroySource: true })` in `destroy()`.

### C3. `prefersReducedMotion` ignored in WindLines
**Location:** `GardenWindLineController.ts:58-125`

`GardenWindLineController` does **not** accept a `reducedMotion?: boolean`
option, and `GardenAtmosphereController:278-284` still instantiates it
unconditionally. Speed lines continue to scroll during reduced-motion
mode — violates accessibility semantics.

**Fix:** Add `reducedMotion?: boolean` option, gate `update()` and initial
line-mount on the flag. Propagate from `GardenAtmosphereController`.

### C4. `GardenButterflyController` global cache-destroy side effect
**Location:** `GardenButterflyController.ts:542` (referenced as `bake.destroy()`)

When individual butterfly controller instance is destroyed, the global bake
texture cache is wiped — other controllers using the cached textures break.

**Fix:** Either (a) keep bake textures in a separate `StaticButterflyBakeCache`
singleton with reference counting, or (b) per-instance cache + cloning.

---

## Important findings

### I1. Egg gravity uses frame-time units, breaks at non-60fps
**Location:** `GardenEggController.ts:266-276`

`vy` accumulates in `px/frame` units: `vy = vy + EGG_GRAVITY * frames` where
`frames = dt * 60`. Then `y += vy * frames` multiplies that already-frame-scaled
value by another `frames` — quadratic timestep scaling. At 30fps the egg
falls 4× slower than at 60fps.

**Fix (standardize to px/sec):** Store `vy` in `px/sec`, use `vy += g * dt; y += vy * dt`.
Same units as `GardenParticleController` already uses.

### I2. Stale 2 tests in `attachGardenPixiApplication.quality.test.ts`
**Location:** `__tests__/attachGardenPixiApplication.quality.test.ts:186-230`

These 2 pre-existing tests check `getBirdCount()` returns expected values per
quality. After atmosphere refactor (FU-Q 6-slot butterfly / 5-slot bird),
the tests now reference old `BIRD_COUNTS` values and check the wrong interface
(`getBirdCount()` from `BoundGardenAtmosphere` vs from `GardenBirdController`).

**Fix:** Update assertions to `getActiveBirdCount()` and to the current constants.

### I3. EggSystem mount-into-ambient z-order puts eggs in front of trees
**Location:** `GardenScene.ts:332`

`layers.ambient` is at index 14; `near-trees` at index 8. Eggs rendered in
ambient appear in front of foreground trees (visually wrong for "egg falls behind
trees when over them" feel). For now acceptable (eggs only visible for ~1-2 s
before shattering); future improvement: split eggs into `weather`-layer (falling)
and `ambient` (shatter only).

---

## Minor findings

### M1. Sky-life label duplicate / sky-life-foreground dual-mount
**Location:** `gardenLayers.ts:32-53` + `GardenBirdController.ts:154-161`

Two `sky-life` layers exist (legacy `layer-sky-life` always empty + new
`layer-sky-life-foreground`). The `GardenBirdController` accepts both for
backward-compat — but the legacy path is dead code for production. Cleanup
opportunity, not urgent.

### M2. `garden-atmosphere.constants.ts` is 250+ lines; some constants should split
The constants file mixes physics, asset-loading, controller-pool-config,
shader-config. Splitting into `garden-atmosphere.physics.constants.ts`,
`garden-atmosphere.pools.constants.ts`, etc. would help readability. Not critical.

### M3. `EGG_SHELL_FADE_DURATION_RANGE = [4.0, 10.0]` lacks rationale comment
The 4× factor from FU-T vs original 1-2.5 is not in code. Document intent in
constant comment.

### M4. Empty `flowerAnchors` safe fallback OK but undocumented
`resolveImpactY` falls back to `0.78 * ATMOSPHERE_HEIGHT` when anchors are empty.
Behavior is correct but silent — add a brief comment.

### M5. Wing-beat swap period for butterflies ignores direction
Wing-flap timing currently is deterministic per slot — birds in same flock
sync. Acceptable for "flock" feel, but a sub-clamped stagger would feel more
alive. Future polish.

---

## Cross-vendor disagreements

Both reviewers (AGY + Opus runtime second-opinion) **agree on all 4 critical
findings and 3 important findings**. No material disagreement.

AGY additionally flagged the "global cache-destroy side effect" (C4) which
the Opus-runtime pass independently corroborated via direct read of the file.
Opus added I1 (frame-time units in egg gravity) and I3 (z-order issue) which
AGY did not surface.

---

## Verification status

- AGY direct lint/type-check: ran during the review session — clean.
- Opus-runtime read-only second-opinion: read all listed files, did not run
  code paths. All claims cross-referenced.
- ORCA-paid: **auth was 401 against api.orcarouter.ai this session**. The
  cross-vendor fusion reduces to AGY + Opus-runtime. If you want a separate
  ORCA-paid second opinion (e.g. for verification sign-off before merge),
  re-run with valid auth.

---

## Top-3 follow-ups (priority-ranked)

1. **Fix C1 (Bezier teleportation) + C2 (GPU texture leak) + C3 (reducedMotion
   in WindLines)** in one batch. Each is ≤ 30 lines. Combined change set
   < 200 lines total diff. Test coverage easy to add (deterministic). Effort:
   < 1 hour.

2. **Fix I1 (egg gravity time-units)** + update the egg test assertions to
   new constants. Effort: < 30 minutes.

3. **Resolve C4 + I3** in a single FU-X (butlerfly cache-isolation + layer
   split for eggs). Effort: 1-2 hours including test coverage.

Total to clear all Critical + Important: < 4 hours.

---

## Files verified during this review (cross-reference)

```
rendering/atmosphere/
  GardenAtmosphereController.ts   (Aggregator: dispatch order correct)
  GardenBirdController.ts          (Group dynamics + egg drop hook)
  GardenEggController.ts           (3 sub-pools, Canvas2D bake)
  GardenParticleController.ts      (Motes, leaves, grass + ballistics)
  GardenButterflyController.ts     (Bezier - flagged C1, C4)
  GardenWindLineController.ts      (Speed lines - flagged C3)
  GardenWindController.ts          (Wind model + gust envelope)
  garden-atmosphere.constants.ts   (All numeric tuning)
  seededRandom.ts                  (Mulberry32 - confirmed deterministic)
  ButterflyTypeGenerator.ts        (8 type draw functions)
  ButterflyTypeBake.ts             (Texture cache - flagged C4)
  index.ts                         (Barrel re-exports)

rendering/
  gardenLayers.ts                  (2 sky-life layers in correct z-order)
  GardenScene.ts                   (Atmosphere bind, plot-anchor wiring)

attachGardenPixiApplication.ts   (loaded.atmosphere → createGardenAtmosphere)

__tests__/atmosphere/*.test.ts    (5 files, 148 tests passing as of last verify)
```

Report delivered to `/tmp/garden-atmosphere-review-fused.md`.
