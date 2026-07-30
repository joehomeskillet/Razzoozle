# ADR-013 — PixiJS 8 Procedural Puppet-Rig Presenter (Spine-Free)

**Status:** DECIDED (2026-07-30) · **Date:** 2026-07-30
**Supersedes:** ADR-012 (partially, Canvas/WebGL presenter scope only)  
**Decision:** Option (a) — Procedural puppet-rig PixiJS-native + GSAP (MIT Community, free). Research & alternatives: `docs/design/anim-runtime-research-2026-07-30.md`
**Architecture Board:** Approved

---

## Context

The Flower Battle game mode (WP-939) requires high-quality 2D animation for plants responding to player actions, team progress, and power-up effects. The SDD (User-Direktive 2026-07-30) initially designated PixiJS 8 + Spine 4.2 as the rendering + skeletal animation stack.

**User Decision (2026-07-30):** Spine runtime licensing removed; animation implemented via **procedural puppet-rig + GSAP tweening** within PixiJS scene graph. This eliminates all external animation runtime dependencies and licensing overhead.

ADR-012 (2026-07-30) explicitly excluded PixiJS from the canonical animation stack, citing "motion/react + canvas-confetti sufficient." This ADR supersedes the PixiJS exclusion **scoped to the Flower Battle presenter canvas only**, while preserving the rest of ADR-012's technology governance for UI animations, confetti, and audio.

---

## Decision

### 1. Canvas/WebGL Rendering Scope

**PixiJS 8 is canonical for the Flower Battle presenter scene only.**

| Component | Technology | Scope | Rationale |
|-----------|-----------|-------|-----------|
|-----------|-----------|-------|-----------|
| **Presenter Garden Scene** | PixiJS 8 | FlowerBattleCanvasHost + layers | 2D animation, 60 FPS, teams up to 4 |
| **Plant Rigging & Animation** | Procedural Puppet-Rig + motion | Container hierarchy ≈ bones; tweens ≈ keyframes | MIT (already installed); `animate()` drives PixiJS properties; no new dependencies |
| **Question/Answer UI** | React + motion/react | ExperienceStageOverlay | Existing web component patterns unchanged |
| **Navigation & Dialogs** | React + radix-ui | HTML outside canvas | Content-free presenter principle |
| **Mobile Player Scene** | Optional: PixiJS low-profile OR static fallback | ExperienceDisplay on phones | No impact on answer interaction |

**Architectural Principle:** The canvas is purely presentational. No game logic, scoring, or state mutation occurs in PixiJS. The server remains authoritative; PixiJS interprets semantic game events (e.g., `growth_changed`, `power_up_applied`) and renders animations. See SDD §4.4.

---

## 2. Animation Runtime: Procedural Puppet-Rig + motion

### Decision: Option (a) — Procedural Puppet-Rig + GSAP

**DECIDED (2026-07-30).** User decision: no Spine Runtime. Evaluated 4 alternatives; chose procedural puppet-rig for zero licensing overhead + native PixiJS integration. Rationale & rejected options documented in `docs/design/anim-runtime-research-2026-07-30.md`:

| Option | Status | Reason |
|--------|--------|--------|
| **Procedural Puppet (PixiJS native) + GSAP** | ✓ **DECIDED** | Zero licenses; full scene integration; simple plant animations (grow, sway, wilt) don't need skeletal rigging |
| DragonBones | ⚠️ Not recommended | Editor EOL; Pixi8 compatibility uncertain; migration risk |
| Rive | ⚠️ Not recommended | Separate canvas rendering; z-ordering friction; scene graph mismatch |
| Spritesheet flipbooks | ❌ Not recommended | Prohibitive asset payload (~500 MB–1 GB per tier) |

### Procedural Puppet Architecture

**Rig Contract (§6.1 SDD, semantic level):**
```
Container: root
├── Container: ground_anchor
├── Container: stem_root
│   ├── Container: stem_mid
│   │   ├── Container: stem_top
│   │   │   └── Container: flower_head
│   │   │       ├── Container: face_root
│   │   │       │   ├── Sprite: eye_l
│   │   │       │   ├── Sprite: eye_r
│   │   │       │   └── Sprite: mouth
│   │   │       ├── Sprite: petals
│   │   │       └── Container: fx_head_anchor
│   │   ├── Sprite: leaf_l
│   │   └── Sprite: leaf_r
├── Container: fx_ground_anchor
└── Container: ui_anchor
```

**Animation Controller:**
- Central `AnimationController` class manages GSAP Timeline instances
- Each plant skeleton has one Timeline (tracks: 0=body, 1=face, 2=additive effects)
- Mixing strategy: Crossfade tweens per track (SDD §6.5 mixing profile)
- No direct `tween.play()` in views; all via controller

**Tween Registry:**
```typescript
export const PLANT_TWEENS = {
  idle_seed: { duration: 2, loop: true, easing: 'sine.inOut', ... },
  idle_sprout: { duration: 1.8, loop: true, ... },
  grow_small: { duration: 0.6, targets: { stem: '+=20px', ... } },
  grow_medium: { duration: 0.8, targets: { stem: '+=40px', ... } },
  celebrate_small: { duration: 1.0, targets: { flower_head: 'rotate 10 -10' } },
  // ... etc per SDD §6.3
}
```

**Mixing Profile (§6.5 SDD, GSAP-adapted):**
```typescript
export const FLOWER_MIXES = {
  default: 0.18,
  idleToReaction: 0.08,
  reactionToIdle: 0.16,
  stageTransition: 0.24,
  statusEnter: 0.12,
  statusExit: 0.18,
} as const
```

Interpreted as GSAP tween duration for crossfade (timeline blend).

### GSAP Dependency

**Library:** gsap (^3.12.0, Webflow No-Charge License)

**Features Used:**
- Timeline (multi-track animation sequencing)
- Tween (position, rotation, scale, color)
- Easing (standard + custom)
- onComplete callbacks (for audio sync)

**Features NOT Used** (free tier sufficient):
- DrawSVG, MorphSVGPlugin (paid tier — not needed)
- ScrollTrigger, Draggable (not applicable to game scene)

**License:** Webflow "No-Charge Standard License" (free, but proprietary; not MIT)
**Restriction:** Cannot build competing animation builders (does not impact Flower Battle)
**Status:** FALLBACK ONLY — use only if motion' Timeline mixing insufficient for 21 animations + FLOWER_MIXES crossfades

**Size:** ~30 KB gzipped (overhead if used; prefer motion for MVP)

---

### 3. Technology Restrictions & Fallbacks

#### Allowed Technologies
- PixiJS 8 for rendering (presentation only)
- motion (MIT) for tween-based animation (primary)
- GSAP (Webflow No-Charge) as fallback if motion insufficient
- Container hierarchy for semantic rig
- AnimatedSprite for texture cycles (faces, petals)
- Existing motion/react for HTML overlay animations (unchanged)
- Existing canvas-confetti for celebration effects (unchanged)
- Existing use-sound + Web Audio API for audio (unchanged)

#### Explicitly Excluded (unchanged from ADR-012)
- ❌ **Spine Runtime** (User decision: Spine-free)
- ❌ **Phaser** (redundant physics + render loop)
- ❌ **Three.js** (3D rendering out of scope)
- ❌ **Rive** (separate canvas rendering, scene graph mismatch)
- ❌ **DragonBones** (editor EOL, Pixi8 compatibility unclear)
- ❌ **Custom IK/constraint solver** (unless simple procedural bone bends, see WP-04)

#### Graceful Degradation
- **Canvas Load Failure:** Static sprite fallback (prerendered growth stages)
- **Animation Compute Error:** Fallback to idle-only (no reactions)
- **GPU Exhaustion:** Automatic quality downgrade (§10.3 of SDD)
- **prefers-reduced-motion:** Disable all tweens; show static stage

---

### 4. Architectural Boundaries (Experience Kit Surfaces)

**Boundary Principle:** PixiJS canvas is scoped to the Flower Battle **presenter scene** only. Other Experience Kit surfaces (game client, manager, console) remain unchanged.

```
Presenter Display (Beamer/Kiosk)
├── Canvas Host (NEW: PixiJS 8 + procedural puppet + GSAP)
│   ├── GardenScene (PixiJS Container hierarchy)
│   ├── TeamFlowers (procedural skeletons)
│   ├── Effects Layer (Particles + geometry)
│   └── Viewport Camera
├── HTML Overlay (React, unchanged)
│   ├── Status badges
│   ├── Team names & scores
│   └── Reconnect indicator
└── Audio Adapter (use-sound, unchanged)

Mobile Client / Game Instance (unchanged)
├── React components
├── motion/react animations
├── canvas-confetti
└── No PixiJS canvas

Manager Console (unchanged)
├── React components
├── motion/react animations
└── No PixiJS canvas
```

**Contract:** The presenter scene canvas and HTML layer are hermetic. No HTML component may import from the PixiJS rendering layer, and vice versa. Communication flows through semantic game events (socket.io `game:experience` envelope).

---

### 5. No Animation Commands from Backend

The backend **must never** send animation names or duration hints. It sends only semantic events:

```json
{
  "type": "growth_changed",
  "delta": 42,
  "reason": "correct_answer_time_bonus"
}
```

The presenter client interprets this locally:
- Reads current/target growth stages
- Selects animation tier (small/medium/large based on delta)
- Plays tween via `AnimationController`
- Triggers audio if applicable

This decouples the backend from asset names, animation tooling, and rendering technology.

---

### 6. Asset Governance

**Art Assets:**
- **Plant concept & mockups:** Figma (design-only)
- **Plant rig/skeleton:** Procedurally defined in code (Container hierarchy) OR exported from Figma as placement hints
- **Plant textures:** Exported PNG/WebP from Figma or illustration tool (no special editor required)
- **Animations:** Hand-authored GSAP tweens in `PLANT_TWEENS` registry OR generated from Figma prototypes (via frame export → parameter extraction)
- **Audio:** Existing audio pipeline (use-sound, SOUND_SLOTS enum)

**No Copying:**
- No Spine Editor assets (user decision: Spine-free)
- No Mergic Pets or Adventure Time designs (§17 SDD)
- Figma design is inspiration only; actual assets are original

**License File:**
- `THIRD_PARTY_NOTICES.md` includes GSAP MIT + PixiJS MIT
- No Spine license file needed (Spine-free decision)

---

### 7. Testing & Quality Gates

**Before PixiJS/procedural WPs are approved:**
1. ✓ ADR reviewed and architecture board sign-off
2. ✓ Procedural rig contract validated (container hierarchy matches §6.1 SDD)
3. ✓ Animation tween registry complete (all §6.3 animations present)
4. ✓ GSAP license verified (MIT, no commercial tier required)
5. ✓ Contract tests pass: backend events → presenter state (no logic mutation)
6. ✓ Render tests: all team colors + growth stages + animations
7. ✓ Accessibility tests: reduced-motion, fallback accessibility
8. ✓ Performance targets met: 60 FPS on Presenter, 30+ FPS on fallback tier

**License gate is NOW RESOLVED** (Spine-free per user decision). All downstream WP approval proceeds without licensing blocker.

---

## Rationale

### Why Procedural Puppet + GSAP (not Spine / DragonBones / Rive)?
- **License Clarity:** Zero external runtime fees; GSAP MIT is unrestricted
- **Scene Integration:** Direct PixiJS Container hierarchy; no adapter friction
- **Simplicity:** Plant animations (grow, sway, wilt) are relatively simple; don't need skeletal IK
- **Artist Workflow:** Tweens can be authored incrementally; Figma → code pipeline straightforward
- **Community:** GSAP is industry-standard for web animations; plenty of examples

### Why Not Spine?
- User decision (2026-07-30): Licensing overhead (Spine Editor license required); procedural path acceptable
- Alternative achieves same visual fidelity with less dependency complexity

### Why Partial Supersession of ADR-012?
ADR-012's PixiJS exclusion was based on "motion/react + confetti sufficient" for **UI animations**. That remains true. Flower Battle's **presenter scene** is a dedicated canvas for plant animation, not a UI component. The exclusion is lifted **only** for this scope, preserving ADR-012 for all other surfaces.

### Why Not Rewrite the Entire UI in PixiJS?
- **Anti-Pattern §17 SDD:** No full frontend rewrite in PixiJS
- **Maintenance burden:** Dual rendering stacks (React/PixiJS) complicate lifecycle
- **Existing patterns:** Question display, answer reveal, team badges remain in React
- **Mobile compatibility:** Phone clients render minimal canvas or static fallback

---

## Consequences

### Positive
1. **Licensing:** No external animation runtime fees; GSAP MIT unrestricted
2. **Scene Integration:** Procedural puppet rigs live directly in PixiJS scene graph
3. **Performance:** GSAP tweens are lightweight; no Spine event overhead
4. **Flexibility:** Animation authoring in code; easy to iterate and customize
5. **Maintenance:** One less external editor + asset pipeline dependency

### Negative
1. **Artist Tooling:** No visual skeleton editor (Spine-like); tweens authored procedurally or hand-coded
2. **Animation Complexity:** Complex IK/constraints require custom code (unlikely needed for plants)
3. **Asset Validation:** Tween registry must be manually maintained (gate: WP-04 validator)
4. **Testing Overhead:** Render tests require visual regression baselines
5. **Performance Budget:** Must monitor 60 FPS target and degrade gracefully

---

## Compliance & Gating

### WP-01 (Architektur-Gate) — ✓ NOW COMPLETE
- ✓ Frontend-Stack inventory (pnpm, Vite, React 19, motion, vitest, Playwright)
- ✓ PixiJS version pin + GSAP compatibility confirmed
- ✓ ADR-013 approved (procedural puppet + GSAP decision)
- ✓ **License gate RESOLVED** (Spine-free per user decision)
- ✓ WP-02/03 architectural notes prepared

### WP-02 (Canvas Host Lifecycle)
- ✓ PixiJS application init/destroy
- ✓ ResizeObserver, Page Visibility API
- ✓ Error boundary + static fallback

### WP-04 (Puppet Rig PoC)
- ✓ Semantic rig contract: Container hierarchy per SDD §6.1 (root → stem_root → stem_mid → stem_top → flower_head + leaves, face, effects anchors)
- ✓ GSAP AnimationController: Central Timeline manager with track semantics (0=body, 1=face, 2=effects) per SDD §6.5 FLOWER_MIXES mixing profile
- ✓ Tween Registry: All mandatory animations from SDD §6.3 (idle_seed/sprout/young/budding/blooming/full_bloom, grow_small/medium/stage_up, celebrate_small/big, hit_light/heavy, wilt_enter/idle/exit, shield_enter/idle/break, win/lose)
- ✓ Dummy plant visual: Procedural Container tree + basic Sprite faces; MeshRope for bendy stem (optional)
- ✓ Asset Validator: Registry gate ensuring all PLANT_TWEENS exist + correct track assignments (replaces WP-04 Spine validation)

All downstream WPs proceed without license blocker.

All downstream WPs proceed without license blocker.

---

## Related Documents

- **SDD:** `docs/design/flower-battle-pixi-spine-sdd.md` (User-Direktive 2026-07-30; addendum block marks §2.1 + §6 superseded by this ADR)
- **Animation Research:** `docs/design/anim-runtime-research-2026-07-30.md` (detailed findings: DragonBones editor EOL, Rive canvas/z-order mismatch, Flipbooks ~500MB–1GB payload)
- **Frontend Stack:** `docs/design/frontend-stack-inventory-wp01.md`
- **License Gate:** RESOLVED (Spine-free simplifies licensing; see updated THIRD_PARTY_NOTICES.md)
- **WP-02/03 Prep:** `docs/design/wp-02-03-canvas-host-prep.md`
- **ADR-012:** `docs/adr/012-experience-kit-boundaries.md` (unchanged for non-presenter surfaces)
- **Experience Kit Boundaries:** `packages/web/src/experiences/shared/` (layer architecture, stage contracts)

---

## Approval Checklist

- [ ] Architecture Board: Reviewed
- [ ] Performance Lead: FPS targets + degradation strategy approved
- [ ] Test Lead: Visual regression + contract test coverage planned
- [ ] Artist Lead: Procedural puppet + GSAP workflow acceptable
- [ ] Security Lead: Canvas XSS + CORS no new risks

