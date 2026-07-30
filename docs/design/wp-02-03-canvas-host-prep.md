# WP-02/03 Preparation: Canvas Host Architecture & Asset Loader Interface

**Document:** Architectural Contracts & Component Boundaries  
**Date:** 2026-07-30  
**Dependent WPs:** WP-02 (Canvas Host Lifecycle) + WP-03 (Asset Manifests & Loader)

---

## Context

WP-01 establishes the overall PixiJS/Spine decision (ADR-013) and documents the existing stack compatibility. WP-02 and WP-03 require clear interface contracts to proceed in parallel without merge conflicts:

- **WP-02:** Builds the PixiJS application lifecycle, resize handling, error boundaries, and static fallback
- **WP-03:** Implements the asset pipeline (manifests, lazy loading, bundle strategy)

Both depend on shared interface definitions but can be implemented independently.

---

## Component Hierarchy

### Current (SVG-based, existing)
```
FlowerBattleDisplay (presenter wrapper)
└── FlowerGardenScene (SVG render)
    ├── GardenBackgroundLayer
    ├── ExperienceLayer[background]
    ├── ExperienceLayer[actors]
    │   └── FlowerPlant (SVG + motion/react)
    ├── ExperienceLayer[effects]
    └── FlowerBattlePresenterHud (HTML overlay)
```

### Target (PixiJS hybrid, WP-02/03 output)
```
FlowerBattleDisplay (presenter wrapper — unchanged)
└── FlowerGardenScene (component composition unchanged)
    ├── GardenBattleCanvasHost (NEW, WP-02)
    │   ├── <canvas> (PixiJS rendering surface)
    │   ├── PixiJS Application (lifecycle: init → resize → destroy)
    │   ├── GardenScene (PixiJS scene graph)
    │   │   ├── BackgroundLayer (PixiJS Container)
    │   │   ├── MidgroundLayer (PixiJS Container)
    │   │   ├── PlotLayer (PixiJS Container — team flowers)
    │   │   ├── EffectsLayer (PixiJS ParticleContainer + geometry)
    │   │   └── ForegroundLayer (PixiJS Container)
    │   ├── Error boundary + static fallback
    │   └── Viewport camera controller
    ├── ExperienceLayer[hud] (HTML overlay, above canvas)
    │   └── FlowerBattlePresenterHud (unchanged)
    └── LoadingIndicator + reconnect state (HTML, WP-02)
```

---

## WP-02 Responsibilities: Canvas Host Lifecycle

### Component: GardenBattleCanvasHost

**Location:** `packages/web/src/experiences/flower-battle/GardenBattleCanvasHost.tsx`

**Responsibilities:**
1. React component wrapping a `<canvas>` element
2. Initialize PixiJS Application on mount
3. Respond to resize events (ResizeObserver or window resize listener)
4. Handle Page Visibility API (pause on tab hidden)
5. Destroy PixiJS application cleanly on unmount
6. Catch WebGL/Spine errors; fallback to static sprite view
7. Export `useGardenPixiApplication()` hook for scene access

**Props Interface:**
```typescript
export interface GardenBattleCanvasHostProps {
  teams: FlowerBattleTeamState[]
  quality?: 'high' | 'medium' | 'low' | 'static'
  onReady?: (app: Application) => void
  onError?: (error: Error) => void
  className?: string
}
```

**Hook Export:**
```typescript
export function useGardenPixiApplication(): {
  app: Application | null
  isReady: boolean
  error: Error | null
  scene: GardenScene | null
}
```

**Lifecycle Contract:**
```
mount
  → init PixiJS Application
  → attach ResizeObserver
  → attach Page Visibility listener
  → call onReady(app)
  → render loop starts

resize event
  → recalculate viewport
  → call renderer.resize()
  → call scene.updateLayout()

tab hidden / visible
  → pause/resume animation loop (requestAnimationFrame)

unmount
  → stop animation loop
  → destroy all Spine skeletons
  → destroy textures
  → destroy PixiJS Application
  → remove listeners
```

**Acceptance Criteria (from SDD §9, WP-02):**
- ✓ 20-cycle mount/unmount without listener leaks
- ✓ 20-cycle mount/unmount without canvas leaks
- ✓ 20-cycle mount/unmount without texture leaks
- ✓ Resize responds within 16 ms (60 FPS)
- ✓ Tab visibility pauses animations (no background render loop)
- ✓ Error does not crash application; static fallback displays

**Test File:** `packages/web/src/experiences/flower-battle/__tests__/GardenBattleCanvasHost.test.tsx`

---

## WP-03 Responsibilities: Asset Pipeline

### Asset Loader Interface (contract between WP-02 and WP-03)

**Location:** `packages/web/src/features/experience/rendering/pixi/assets/`

**Module Exports:**

```typescript
// garden-asset-manifest.ts
export interface AssetBundle {
  name: string  // e.g., 'garden-background', 'garden-flower-violet'
  assets: Record<string, string>  // { textureKey: url, ... }
  priority: 'boot' | 'eager' | 'lazy'
  size?: number  // bytes (informational)
}

export const GARDEN_BUNDLES: Record<string, AssetBundle> = {
  boot: { ... },
  'garden-background': { ... },
  'garden-flower-violet': { ... },
  // ... etc
}

// garden-asset-loader.ts (WP-03 implementation)
export async function loadBundle(
  name: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<Assets>

export async function unloadBundle(name: string): Promise<void>

export function preloadBundle(name: string): void
```

**Bundles to Define (SDD §8.1):**
```
boot                    → PixiJS + Spine runtime essentials
garden-background       → Sky, hills, cloud sprites
garden-common           → Particle effects, power-up icons
garden-flower-violet    → Violet plant Spine rig + skins
garden-flower-blue      → Blue plant
garden-flower-orange    → Orange plant
garden-flower-green     → Green plant
garden-effects-low      → Particle textures (low-quality tier)
garden-effects-high     → Advanced particle + weather effects
garden-audio            → Sound effect slots (future)
```

**Integration with WP-02 (GardenBattleCanvasHost):**

1. **Boot Bundle:** Load synchronously on component mount (before scene init)
2. **Team Flowers:** Load lazily when team seating is confirmed (pre-match lobby)
3. **Effects:** Load quality-dependent tier (WP-11 quality profiler)
4. **Error Handling:** If bundle fails, do not crash; use fallback tier

**Loading Progress (HTML overlay, WP-02):**
```typescript
const [loadingProgress, setLoadingProgress] = useState(0)

useEffect(() => {
  loadBundle('boot', (loaded, total) => {
    setLoadingProgress((loaded / total) * 100)
  })
}, [])

if (loadingProgress < 100) {
  return <LoadingIndicator progress={loadingProgress} />
}
```

**Lazy Load Example (when teams are confirmed):**
```typescript
// In GardenBattleCanvasHost, after teams prop updates
useEffect(() => {
  teams.forEach(team => {
    preloadBundle(`garden-flower-${team.colorKey}`)
  })
}, [teams])
```

**Acceptance Criteria (from SDD §9, WP-03):**
- ✓ Boot bundle loads <500 ms on 4G (throttled)
- ✓ Team bundle loads <200 ms (preloaded before round starts)
- ✓ Bundle failure → fallback (static sprite, no crash)
- ✓ No texture memory leak after bundle unload
- ✓ Manifest format is self-documenting (size, priority, dependencies)

**Test File:** `packages/web/src/features/experience/rendering/pixi/assets/__tests__/garden-asset-loader.test.ts`

---

## Spine Asset Registry (WP-04, referenced by WP-02)

**Location:** `packages/web/src/features/experience/rendering/pixi/spine/`

**Minimal Interface (needed by WP-02 for error handling):**
```typescript
export interface SpineAsset {
  key: string
  skeletonData: SkeletonData
  atlas: TextureAtlas
  textures: Record<string, Texture>
}

export class SpineAssetRegistry {
  constructor(assets: Assets)
  
  async loadSkeleton(key: string): Promise<SpineAsset>
  
  getSkeleton(key: string): SpineAsset | null
  
  validateVersion(): { ok: boolean; error?: string }
}
```

**WP-02 Usage in error boundary:**
```typescript
try {
  const registry = new SpineAssetRegistry(assets)
  registry.validateVersion()  // Throws if major.minor mismatch
  // ✓ Proceed to scene init
} catch (err) {
  // ✗ Fall back to static tier
  setQualityTier('static')
}
```

---

## Fallback Strategy (Static Tier, WP-02 + WP-11)

### Static Fallback Rendering

**Trigger Conditions:**
1. PixiJS application fails to init (WebGL context unavailable)
2. Spine skeleton load fails (version mismatch, missing animations)
3. Performance degradation > 3 consecutive frame drops

**Static Tier Implementation:**
```typescript
export interface StaticFallback {
  renderStage(
    teamStates: FlowerBattleTeamState[],
    container: HTMLElement
  ): void
}

// Example: prerendered sprite for each growth stage
const STATIC_SPRITES = {
  seed: 'data:image/svg+xml,...',
  sprout: 'data:image/svg+xml,...',
  young: 'data:image/svg+xml,...',
  budding: 'data:image/svg+xml,...',
  blooming: 'data:image/svg+xml,...',
  full_bloom: 'data:image/svg+xml,...',
}
```

**Responsibility Distribution:**
- WP-02: Catch errors, trigger fallback switch
- WP-11: Monitor FPS, auto-degrade quality (high → medium → low → static)
- WP-02 accepts: `quality` prop (initial) + callback for quality changes

---

## Canvas Accessibility (WP-02 + WP-11)

### ARIA & DOM Integration

**Canvas Element (WP-02):**
```typescript
<canvas
  ref={canvasRef}
  role="region"
  aria-label="Flower Battle garden scene"
  aria-describedby="garden-status"
  data-testid="garden-pixi-canvas"
/>
```

**Status Region (HTML overlay, WP-02):**
```typescript
<div id="garden-status" aria-live="polite" aria-atomic="true" className="sr-only">
  {/* Announces events: "Team Orange plant grew" */}
  Team {lastEventTeam} {lastEventType}
</div>
```

**Reduced Motion (WP-02 + WP-11):**
```typescript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

if (prefersReducedMotion) {
  setQualityTier('low')  // Static animations only
  // Spine skeleton init happens, but animations don't loop/play
}
```

---

## Integration Points (No Merge Conflicts)

### Directory Isolation
```
packages/web/src/
├── experiences/flower-battle/              (WP-02 modifies here: Canvas host)
│   ├── FlowerBattleDisplay.tsx
│   ├── FlowerGardenScene.tsx
│   ├── GardenBattleCanvasHost.tsx           (NEW, WP-02)
│   └── __tests__/
│       └── GardenBattleCanvasHost.test.tsx
├── features/experience/                    (WP-03 + WP-04 in here)
│   ├── rendering/pixi/
│   │   ├── GardenPixiApplication.ts         (WP-05)
│   │   ├── assets/
│   │   │   ├── garden-asset-manifest.ts     (WP-03)
│   │   │   ├── garden-asset-loader.ts       (WP-03)
│   │   │   └── __tests__/
│   │   ├── spine/
│   │   │   ├── SpineAssetRegistry.ts        (WP-04)
│   │   │   └── SpineAnimationController.ts  (WP-04)
│   │   └── __tests__/
│   └── application/
│       ├── GardenEventQueue.ts              (WP-07)
│       └── __tests__/
```

### Prop Threading (WP-02 receives from WP-03)
1. WP-02 `GardenBattleCanvasHost` calls WP-03 `loadBundle()`
2. WP-02 passes loaded `Assets` to WP-05 `GardenPixiApplication`
3. WP-05 passes to WP-04 `SpineAssetRegistry`
4. All remain independent modules; no circular imports

---

## Minimal Working Example (WP-02)

```typescript
// GardenBattleCanvasHost.tsx
import { useEffect, useRef, useState } from 'react'
import { Application } from 'pixi.js'

export function GardenBattleCanvasHost({ teams, onReady, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<Application | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return

    const app = new Application({
      canvas: canvasRef.current,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0xf4f1ea,
      antialias: true,
    })

    appRef.current = app
    onReady?.(app)
    setIsReady(true)

    const handleResize = () => {
      app.renderer.resize(window.innerWidth, window.innerHeight)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      app.destroy(true, { children: true, texture: true, baseTexture: true })
    }
  }, [onReady])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%' }}
      role="region"
      aria-label="Garden scene"
    />
  )
}
```

---

## Handoff Checklist

**WP-02 Completion:**
- [ ] GardenBattleCanvasHost component exports
- [ ] useGardenPixiApplication hook stable
- [ ] 20-cycle mount/unmount test passing
- [ ] Resize + visibility tests passing
- [ ] Static fallback renders on error
- [ ] TypeScript strict mode clean

**WP-03 Completion:**
- [ ] GARDEN_BUNDLES manifest defined
- [ ] loadBundle() async function works
- [ ] unloadBundle() + preloadBundle() helpers
- [ ] Progress callback firing
- [ ] Asset loader tests passing
- [ ] Bundle size tracking (informational)

**WP-02 ↔ WP-03 Contract Validated:**
- [ ] GardenBattleCanvasHost calls loadBundle('boot') on mount
- [ ] onProgress callback updates loading indicator
- [ ] Scene init waits for boot bundle load
- [ ] Team load triggered on teams prop update
- [ ] Error from loader triggers static fallback

---

## Parallel Execution Strategy

**Suggested Timeline:**
- **Day 1:** WP-02 and WP-03 branches created; API contracts finalized (this doc)
- **Day 2–3:** WP-02 Canvas Host Lifecycle (Subscriber A)
- **Day 2–3:** WP-03 Asset Manifests (Subscriber B)
- **Day 4:** Merge WP-02; WP-03 resolves conflicts (minimal, isolated to assets/)
- **Day 5:** WP-04 Spine PoC (depends on both; can start stub work)

**No Merge Blocker:** Both WP-02 and WP-03 can ship independently (WP-02 stubs asset loading; WP-03 stubs scene init).

