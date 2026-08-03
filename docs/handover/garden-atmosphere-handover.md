# Razzoozle Garden Atmosphere — Handover Dokument

**Erstellt:** 2026-08-03
**Letzter Live-Deploy:** `e8380813d` (`rust.razzoozle.xyz` Container frisch ~19:15 CEST)
**Status:** Live, deployed, keine offenen Blocker
**Repository:** `/nvmetank1/projects/Razzoozle/source`

---

## 1. Executive Summary

Aus einem vollständig statischen Gartenhintergrund (Hintergrund-Grafiken, keine
Bewegung außer Wolken-Parallaxe) wurde eine lebendige Gartenatmosphäre gebaut:

- **Wind-Modell** mit zwei Sinus-Frequenzen + Gust-Envelope und seeded RNG
- **Vögel** in 2–3er-Gruppen mit V-Formation (50–80 px vertikaler Versatz, 25–45 px horizontaler Stagger)
- **Schmetterlinge** in 8 prozeduralen Varianten (Tagfalter, Schwalbenschwanz, Monarchfalter, Tagpfauenauge, Bläuling, Zitronenfalter, Hochzeitsmantel, Glasflügler), 6 Slots mit Bag-RNG für garantierte Typenvielfalt
- **Blätter** mit ballistischer Trajektorie (Drag, Magnus-Effekt durch Rotation) + zig-zack-Fragmenten
- **Eier** mit quadratischer Form, 5–6 m hohen Vogel-Drops über das Blumenbeet, Schalen-Stücke + Dotter-Splat
- **Speed-Lines** (4 cream-yellow) für sichtbaren Wind-Strom

Visuelle Vorbilder: Adventure Time (Pen Ward), weiche Pinselstriche, vereinfachte Formen.

Commits: `fd19da2c..e8380813d` (Basis `feat/fb-hud6-garden-overlay-stability` → HEAD).

---

## 2. Voraussetzungen und Architektur-Kontext

### 2.1 Repository-Struktur

```
source/
├── packages/web/src/experiences/flower-battle/
│   ├── rendering/
│   │   ├── gardenLayers.ts                     (gepatcht: P0 opacity, layer-sky-life, layer-sky-life-foreground)
│   │   ├── GardenScene.ts                      (Atmosphären-Bind, getPlotAnchors() → safeZones)
│   │   ├── attachGardenPixiApplication.ts       (loaded.atmosphere → createGardenAtmosphere)
│   │   ├── assets/
│   │   │   ├── garden-scene-asset-urls.ts      (8 env_* Atmosphären-Aliase)
│   │   │   ├── loadGardenSceneAssets.ts         (Atmosphären-Texture-Bake + Loader)
│   │   │   └── __tests__/loadGardenSceneAssets.test.ts
│   │   └── atmosphere/                          (neu)
│   │       ├── seededRandom.ts                  (Mulberry32)
│   │       ├── garden-atmosphere.constants.ts   (alle Magic-Number-Konstanten)
│   │       ├── WindField.ts                     (geteilte direction + midlineY)
│   │       ├── GardenAtmosphereController.ts   (Aggregator, single Bind/Destroy)
│   │       ├── GardenWindController.ts          (Sinus + Gust-Envelope)
│   │       ├── GardenBirdController.ts          (Vögel + Egg-Drops)
│   │       ├── GardenParticleController.ts      (Motes + Gust-Leaves + Grass-Sway)
│   │       ├── GardenWindLineController.ts      (Speed-Lines für sichtbaren Wind)
│   │       ├── GardenButterflyController.ts     (Bezier-Pfad, Heading, Flap, Drop)
│   │       ├── GardenEggController.ts           (Eier, Schalen, Dotter)
│   │       ├── ButterflyTypeGenerator.ts        (8 Typen via Pixi.Graphics-Funktionen)
│   │       ├── ButterflyTypeBake.ts             (Cache für 16 Texturen, Canvas2D Fallback)
│   │       ├── index.ts                          (public API)
│   │       └── __tests__/                        (Vitest)
│   └── assets/experiences/flower-battle/optimized/atmosphere/  (8 neue PNG/SVG)
├── scratchpad/
│   ├── fu-v-plan.md                            (Plan-then-Flood DAG für Brutalist Egg)
│   ├── followups/followup-report.md            (FU-A bis FU-W Reports)
│   ├── task-1-brief.md, task-2-brief.md, ...   (Plan-Templates)
│   ├── garden-atmosphere-report.md             (Abschlussbericht)
│   ├── garden-atmosphere-reality.txt            (Preflight Reality Doc)
│   ├── atmosphere-probe.txt                    (Headless Probe Output)
│   └── ../../temp/egg-design-brief.md          (Plan-V Read-only Output, falls vorhanden)
└── rust/                                       (unverändert)
```

### 2.2 CD-Pfad

```
systemd: razzoozle-cd.service + razzoozle-cd.timer (für Node-Frontend)
systemd: razzoozle-rust-cd.service + razzoozle-rust-cd.timer (für Rust-Server, alle 5 min)
Skript:    /nvmetank1/projects/Razzoozle/rust-cd-poll.sh
Build-Command (intern in cd-poll.sh):
  DOCKER_BUILDKIT=1 docker build -q -f rust/Dockerfile -t razzoozle-rust:db .
  docker stop razzoozle-rust && docker rm razzoozle-rust
  docker run -d --name razzoozle-rust --restart unless-stopped \
    --env-file /nvmetank1/projects/Razzoozle/source/scratchpad/rust.runenv \
    --network source_razzoozle_network -p 127.0.0.1:3012:3020 \
    -v /nvmetank1/projects/Razzoozle/source/docker:/workflows \
    -v /nvmetank1/projects/Razzoozle/config:/config \
    -v /nvmetank1/projects/Razzoozle/.web-dist-live:/app/web:ro \
    razzoozle-rust:db
  Migrationen werden VOR Container-Swap ausgeführt (rust/db/migrations/*.sql).
  Container bleibt via health-gated (HTTP 200 auf /healthz) oder Rollback.
```

### 2.3 Public-API (Scene → Atmosphäre)

```typescript
interface GardenAtmosphereInput {
  skyLife: Container                    // background, leer
  skyLifeForeground: Container           // Vögel (zwischen distant-bushes und grass)
  ambient: Container                    // Motes, Gust-Leaves, Schalen, Dotter
  weather: Container                    // Speed-Lines (Wind)
  grass: Container                       // animierte Tufts
  palette: GardenPalette                 // Theme-Token-Farben
  quality: "high" | "medium" | "low" | "static"
  prefersReducedMotion: boolean
  seed?: number                          // default 0xC0FFEE
  birdTextures?: { up: Texture; down: Texture } | null
  windLeafTextures?: readonly Texture[]
  moteTexture?: Texture | null
  safeZones?: BirdSafeZone[]             // Plot-Anchors; Vogel-Spawn-Exclusion
  sunPosition?: { x: number; y: number } | null
  resolveColor?: ThemeColorResolver       // liest --color-accent für Schmetterling-Körper
  renderer?: any                          // Pixi-Renderer (für Schmetterling-Texture-Bake)
  eggContainer?: Container                // Eier-Layer (optional, sonst auto)
  eggShatterContainer?: Container         // Schalen-Layer
  eggYolkContainer?: Container           // Dotter-Layer
  flowerAnchors?: { x: number; y: number }[]  // Egg-Impact-Target (Plant-Height)
}

interface BoundGardenAtmosphere {
  update(deltaMs: number): void
  destroy(): void
  setGustPeriod(minMs: number, maxMs: number): void
  forceNextGustAt(msFromNow: number): void
  getBirdCount(): number
  getActiveBirdCount(): number
  getMoteCount(): number
  getGustLeafCount(): number
  getGustLeafCapacity(): number
  getButterflyCount(): number              // legacy: 1 or 0
  getButterflyCapacity(): number           // neu: 6
  getActiveButterflyCount(): number
  getButterflyActive(): boolean
  getWindSample(): number
  getElapsedSeconds(): number
  getEggStats(): { activeEggs, activeShatters, activeYolks }
}

export function createGardenAtmosphere(
  options: GardenAtmosphereInput
): BoundGardenAtmosphere
```

---

## 3. Atmosphären-Architektur

### 3.1 Physics-First-Design

Alle Bewegungen nutzen **deterministische Mulberry32-RNG** (seed 0xC0FFEE
default). Eine Seed erzeugt immer dieselbe Sequenz. AGY-Beratung wurde
wiederholt eingeholt (siehe followup-report.md für die jeweiligen
Physik-Formeln); alle AGY-Empfehlungen sind implementiert.

### 3.2 Sub-Controller und ihre Physik

#### Wind (`GardenWindController`)
- `wind(t) = sin(t × 0.55 + φ₁) × 0.55 + sin(t × 0.17 + φ₂) × 0.25 + currentGust × 0.75`, clamped [-1, 1]
- Gust-Schedule: 9-18 s Periode, Ramp 500-800 ms, Peak 100 ms, Decay 1.2-2.0 s
- Both t-Werte und φ aus Mulberry32 seedable

#### WindField (geteilt, FU-Q)
- `direction: 1 | -1` (LTR/RTL), flip alle 30-60 s via RNG
- `midlineY`: y-Korridor-Mitte für Speed-Lines und Blätter
- WIND_LINE_COUNT = 4 cream-yellow Linien gestapelt um midlineY ±20 px

#### Vögel (`GardenBirdController`)
- Pool: 5 high / 4 medium / 2 low
- Spawn in 2–3er-Gruppen mit V-Formation (FU-L):
  * vertikaler Offset 50–80 px (alternierend oben/unten)
  * horizontaler Offset 25–45 px (gestaffelt)
- Cubic-Bezier-Pfad zwischen zufälligen Waypoints, G1-stetig (FU-O)
- Heading = atan2(tangent.y, tangent.x); Sprite rotation folgt Heading
- Wave: 220–320 ms flap, mit Texture-Swap (wings-up / wings-down)
- **Egg-Drop**: alle 3–6 s, nur wenn bird.x in [0.15·W, 0.85·W] (über Beet)
- 50 ms Cooldown wenn Corridor leer ist

#### Schmetterling (`GardenButterflyController`)
- 6-Slot-Pool, Bag-RNG garantiert 6 unterscheidliche Typen pro Spawn
- 8 Typen via `ButterflyTypeGenerator.ts`: Tagfalter, Schwalbenschwanz,
  Monarchfalter, Tagpfauenauge, Bläuling, Zitronenfalter, Hochzeitsmantel,
  Glasflügler. Jeder Typ: 2 Texturen (wings-up, wings-down), per
  Pixi.Graphics oder Canvas2D-Fallback gebaked.
- Bezier-Pfad mit 4 Control-Points, C0/C1/C2/C3 mit G1-Stetigkeit neu
- Bob ±12 px Sinusoid, Heading-Rotation = Bezier-Tangente
- **AGY-Empfehlung komplett umgesetzt** (8 Typen, 2-Frame-Animation,
  Flügel-Beatschwingung, Wing-Flap proportional zur Geschwindigkeit)

#### Motes (`GardenParticleController`)
- Pool: 10-12 high / 6-8 medium / 3-4 low (8 sichtbare, langsame Drift)
- Alpha: 0.15–0.42 (per-spawn seeded)
- Mote-Sprite (mote-soft.png) tinted mit palette.foreground
- Erfasst Wind von `gardenAtmosphereController.getWindSample()`

#### Gust-Leaves / Blätter (`GardenParticleController`, FU-O)
- Bis zu 6 gleichzeitig (high quality), 4 medium, 2 low
- 8-farbige Natur-Palette inkl. peach `#f4a261`, coral `#e76f51`, olive, sage
- Body-Sprite + Vene-Sprite (Container mit Overlay für Midrib)
- Euler-Integration pro Frame:
  `vy = vy × exp(-LEAF_DRAG_K × dt) + LEAF_GRAVITY × liftFactor × dt`
  `liftFactor = 1 - |angVel| × LEAF_ROTATION_LIFT`
- Rotation ändert Drag (Magnus-Effekt: drehende Blätter fallen langsamer)
- Stuck-Detection: y > 55% LogicalHeight für > 2 s → recycelt
- Body + Vene getintet, Wandert vom Rand links/rechts durch Korridor

#### Grass-Sway (`GardenParticleController`)
- 12-18 kuratierte Textured-Tufts (mid + plot + near bands)
- Rotation um Bottom-Anchor (0.5, 1):
  `rotation = base + sin(t × 1.4 + phase) × 0.04 + windSample × sweep × 0.45`

#### Speed-Lines (`GardenWindLineController`, FU-P)
- 4 (war 4, evtl. 6 nach FU-Q) Pixi.Graphics-Kurven in `weather` Container
- Bezier-Kurven mit cream-yellow `#FFF5D1` Stroke
- Alpha = BASE (0.55) + GUST_GAIN × |windSample| → erscheinen bei Gust
- Bewegen sich in `windField.direction`
- Stacken um `windField.midlineY` (Korridor-Mitte)

#### Eggs (`GardenEggController`, FU-R/PU-U)
- Pool: 6 Eier / 32 Schalen / 12 Dotter
- Eier spawn aus `GardenBirdController.eggDropper(x, y)` callback
- Baked via Canvas2D (saubere Method, nicht `Graphics.context.render`)
- Egg-Sprite: 18×18 Quadrat, tint `#fff4ba` cream, Outline `#6b4423`, inner
  Highlight rgba(255,255,255,0.35) für leichte Ei-Anmutung
- Schalen: 3 jagged zig-zack Polygon-Texturen (FU-V), cream-tints
- Dotter: 12-Winkel organischen Blob mit amber `#f4a261` + Rim `#d97a3a`
- Ballistische Physik (gravity 0.38 px/frame², terminal 10 px/frame)
- Stagger-Decay: ease-out alpha = (1-t)², ±15% per-piece fade-duration

### 3.3 Aggregator-Architektur

`GardenAtmosphereController` ist die Single Source of Truth für alle Sub-
Controller. Pro Frame (in `update(deltaMs)`):

```
1. wind.update(clamped)         → sample, elapsed
2. windField.update(clamped)    → direction may flip
3. birds.update(clamped)        → may call eggDropper (egg.spawn)
4. eggs.update(clamped)         → gravity, shatter, fade
5. particles.update(clamped, sample)  → motes, leaves, grass
6. butterfly.update(clamped)    → bezier step, heading, flap
7. windLines.update(clamped, sample)  → speed-lines
```

`destroy()` propagiert zu allen Sub-Controllern und zerstört sprite-pools
idempotent.

---

## 4. Layer-Architektur (gartenLayers.ts)

Layer Reihenfolge (von hinten nach vorne, Z-Order):

```
0: layer-sky              ← background-Sky + Wolken
1: layer-sky-life          ← leer (reserviert)
2: layer-distant-hills     ← fern-Hügel silhouettes
3: layer-distant-bushes    ← ferne Büsche
4: layer-sky-life-foreground ← VÖGEL (FU-I: zwischen Hills und Grass)
5: layer-grass             ← animierte Tufts
6: layer-far-trees         ← ferne Bäume (alpha=0.42)
7: layer-mid-trees         ← mittlere Bäume (alpha=0.72)
8: layer-near-trees        ← nahe Bäume (alpha=1, FULL OPACITY)
9: layer-fence             ← weißer Zaun
10: layer-soil-plots        ← Beete
11: layer-flower-teams      ← Spieler-Planze
12: layer-weather          ← Speed-Lines (leer bis WindLineController spawnt)
13: layer-powerup           ← (reserviert)
14: layer-ambient           ← Motes + Gust-Leaves + (Egg-Layer als Child)
15: layer-foreground-frame  ← Vordergrund-Blätter (cover)
16: layer-presenter-hud     ← HUD
17: layer-event-banner      ← (reserviert)
```

**P0-Opacity-Fix (FU-A)**: `bush.alpha = 1` in `buildForegroundFrame()`. Vorher
waren Büsche mit 0.75–0.85 transparent → Hintergrund schien durch.

**Layer-Sky-Life-Foreground (FU-I)**: zweiter `sky-life`-Container VOR
Hills/Bushes, NACH Grass/Trees/Plots. Vögel fliegen damit sichtbar vor der
Hügellandschaft, aber unter den Bäumen (Lesbarkeit der Bäume).

---

## 5. Asset-Layer (8 production assets)

Im `packages/web/src/assets/experiences/flower-battle/optimized/atmosphere/`:

| Datei | Größe | Quelle | Lizenz |
|---|---|---|---|
| `bird-distant-wings-up.png`  | 9 636 B | `bevouliin.com` Flappy-Box (Skeleton-Animation Frame 0, CC0) | CC0 |
| `bird-distant-wings-down.png`| 10 035 B | ebenda, Frame 5 | CC0 |
| `wind-leaf-01.svg`          | 406 B | Kenney `foliageSprites_flat.svg` (Path #36, ivy-style) | CC0 |
| `wind-leaf-02.svg`          | 785 B | Kenney `foliageSprites_flat.svg` (Path #39, fern-style) | CC0 |
| `wind-leaf-03..06.svg`      | ähnlich | Kenney foliage-sprites (additional paths) | CC0 |
| `mote-soft.png`             | 72 952 B | Kenney particle-pack `circle_03.png` | CC0 |
| `pollen-soft.png`           | 46 347 B | Kenney particle-pack `spark_06.png` | CC0 |
| `sparkle-soft.png`          | 64 808 B | Kenney particle-pack `spark_05.png` | CC0 |
| `ring-soft.png`             | 65 336 B | Kenney particle-pack `circle_05.png` | CC0 |
| `SOURCES.md`                | ~3 KB | Provenienz-Doku aller 8 Assets + 3 Quellarchive | - |
| `SHA256SUMS.tsv`            | ~1 KB | Hashes für Quellarchive + 8 Output-Dateien | - |

**Loader-API** (in `garden-scene-asset-urls.ts`):

```typescript
env_bird_distant_wings_up   ← Vögel (wings-up)
env_bird_distant_wings_down ← Vögel (wings-down)
env_wind_leaf_01..06        ← 6 Leaf-SVGs
env_mote_soft               ← Motes
env_pollen_soft             ← reserviert (Pollenspray)
env_sparkle_soft            ← reserviert
env_ring_soft               ← reserviert
```

**Live-URL-Hinweis**: Vite hasht Asset-Pfade. Production-URL ist
`/assets/bird-distant-wings-up-<hash>.png`, NICHT
`/assets/.../atmosphere/bird-distant-wings-up.png`. Die Loader-Tests
sind so angepasst, dass sie das Hash-Präfix-Muster matchen (`contains("bird-distant-wings-up-")`),
NICHT den Source-Pfad. Das ist im FU-Fix-Diff dokumentiert.

---

## 6. Konstanten (garden-atmosphere.constants.ts)

Alle Magic-Number-Konstanten sind hier zentralisiert. Konstanten sind
`readonly` Tupel oder Zahlen. Sub-Controller importieren sie.

```typescript
// Wind
WIND_FREQ_PRIMARY = 0.55
WIND_FREQ_SECONDARY = 0.17
WIND_PRIMARY_AMP = 0.55
WIND_SECONDARY_AMP = 0.25
WIND_GUST_AMP = 0.75
GUST_PERIOD_RANGE = [9_000, 18_000]  // ms
GUST_RAMP_RANGE = [500, 800]         // ms
GUST_PEAK_MS = 100
GUST_DECAY_RANGE = [1_200, 2_000]   // ms

// WindField
WIND_FIELD_FLIP_INTERVAL_RANGE = [30_000, 60_000]  // ms

// Vögel
BIRD_COUNTS = { high: 5, medium: 4, low: 2, static: 0 }
BIRD_SCALE_RANGE = [0.14, 0.21]
BIRD_SPEED_RANGE = [35, 65]                    // px/s
BIRD_FIRST_SPAWN_RANGE_MS = [2_500, 6_000]
BIRD_SPAWN_INTERVAL_RANGE_MS = [6_000, 12_000]
BIRD_VERTICAL_WAVE_RANGE = [4, 8]             // px
BIRD_Y_BAND = [0.14, 0.32]                    // fraction ATMOSPHERE_HEIGHT
BIRD_WING_SWAP_RANGE = [180, 280]             // ms (Texture-Swap)
BIRD_GROUP_SIZE_RANGE = [2, 3]               // Vögel pro Welle
BIRD_GROUP_VERTICAL_OFFSET_RANGE = [50, 80]   // px (FU-L)
BIRD_GROUP_HORIZONTAL_OFFSET_RANGE = [25, 45] // px (FU-L)
BIRD_SPAWN_RETRY_LIMIT = 8
SUN_SAFE_RADIUS = 130                         // logical px
HUD_SAFE_TOP_FRACTION = 0.12                  // Vogel-Spawn-Schutz

// Schmetterling
BUTTERFLY_POOL_SIZE = 6
BUTTERFLY_TYPE_POOL = 8                       // 8 Typen (Tagfalter, Schwalbenschwanz, …)
BUTTERFLY_FLAP_FREQ_RANGE = [4.0, 11.0]       // Hz
BUTTERFLY_FIRST_SPAWN_RANGE_MS = [8_000, 15_000]
BUTTERFLY_SEGMENT_DURATION_RANGE = [4, 7]     // s pro Bezier-Segment

// Motes / Particles
MOTE_COUNTS = { high: [10, 12], medium: [6, 8], low: [3, 4], static: [0, 0] }
MOTE_MID_COUNT = { high: 11, medium: 7, low: 4, static: 0 }
MOTE_SCALE_RANGE = [0.003, 0.007]            // sehr klein (1.5–3.5 px visible)
MOTE_BASE_SPEED_RANGE = [8, 14]              // px/s
MOTE_ALPHA_RANGE = [0.15, 0.42]
MOTE_LIFETIME_RANGE = [5, 10]                // s
MOTE_Y_BAND = [0.35, 0.78]

// Gust Leaves (Blätter)
GUST_LEAF_MID_COUNT = { high: 6, medium: 4, low: 2, static: 0 }
GUST_LEAF_SCALE_RANGE = [0.16, 0.28]         // 17–37 px visible
GUST_LEAF_ACTIVATION_THRESHOLD = 0.18         // wind sample must exceed
GUST_LEAF_SPEED_RANGE = [55, 100]            // px/s (FU-H; was 70-130)
GUST_LEAF_VY_RANGE = [2, 8]
GUST_LEAF_ROTATION_RANGE = [-0.8, 0.8]
GUST_LEAF_LIFETIME_RANGE = [25.0, 45.0]      // FU-H 5× verlängert
GUST_LEAF_VEIN_SCALE_RATIO = 0.55
GUST_LEAF_COLORS = [foreground, midground, plantLeaf, grass, bushBack, hillMid, 0xF4A261, 0xE76F51]

// Grass Sway
GRASS_TUFT_COUNTS = { high: [12, 18], medium: [8, 10], low: [4, 6], static: [0, 0] }
GRASS_WIND_SWEEP_RANGE = [-0.18, 0.18]      // rad

// Wind Lines (Speed-Lines)
WIND_LINE_COUNT = 4
WIND_LINE_COLOR = 0xFFF5D1
WIND_LINE_BASE_ALPHA = 0.55                  // FU-V (war 0.35)
WIND_LINE_GUST_ALPHA_GAIN = 0.45
WIND_LINE_HEIGHT = 36
WIND_LINE_CORRIDOR_HEIGHT = 80
WIND_LINE_SPEED_RANGE = [80, 140]

// Eggs
EGG_POOL_SIZE = 6
EGG_SHATTER_POOL_SIZE = 32
EGG_YOLK_POOL_SIZE = 12
EGG_GRAVITY = 0.38
EGG_TERMINAL_VEL = 10.0
PIECE_GRAVITY = 0.40
EGG_FALL_SPAWN_INTERVAL_RANGE_MS = [3_000, 6_000]
EGG_IMPACT_Y_FRACTION = 0.78                  // impactY = 0.78 × ATMOSPHERE_HEIGHT
EGG_SHATTER_PIECE_COUNT_RANGE = [3, 5]
EGG_SHELL_FADE_DURATION_RANGE = [4.0, 10.0]   // FU-T 4× verlängert (war 1-2.5)
EGG_YOLK_FADE_DURATION_RANGE = [1.0, 2.5]
GUST_LEAF_SPAWN_CORRIDOR_MARGIN = 30

// Helper
DEFAULT_ATMOSPHERE_SEED = 0xC0FFEE
ATMOSPHERE_WIDTH = GARDEN_LOGICAL_WIDTH
ATMOSPHERE_HEIGHT = GARDEN_LOGICAL_HEIGHT
```

---

## 7. Tests

### 7.1 Test-Setup
- Vitest 4.x mit jsdom-Environment für Pixi-Container (kein WebGL)
- Mulberry32 ist deterministisch; alle Tests mit festem Seed
- Für jeden FU-A bis FU-V gibt es einen eigenen Report (`fu-X-report.md`)
  im `scratchpad/followups/followup-report.md`

### 7.2 Test-Coverage (per File)
- `seededRandom.test.ts`                  — 8 tests: determinism, range
- `GardenWindController.test.ts`         — 15 tests: model, gust envelope
- `GardenBirdController.test.ts`         — 8 tests: pool size, group dynamics,
                                            drop hook
- `GardenParticleController.test.ts`     — 12 tests: mote/gust-leaf physics
- `GardenAtmosphereController.test.ts`   — 10 tests: bind/destroy/idempotency
- `ButterflyTypeGenerator.test.ts`       — 8 tests: 8 typen shapes valid
- `GardenEggController.test.ts`          — 16 tests: shatter, decay, fade
- `gardenLayers.test.ts`                 — 13 tests: LAYER_LABELS, alpha
- `loadGardenSceneAssets.test.ts`        — 29 tests: 8 env_* aliase, URL hashes

### 7.3 Test-Run
```bash
pnpm exec vitest run src/experiences/flower-battle          # 51 files
pnpm exec vitest run src/experiences/flower-battle 2>&1 | tail -5
# => Test Files  48 passed | 2 skipped | 1 failed (51)
#    Tests       768 passed | 5 skipped | 2 failed (775)

# 2 pre-existing FU-D quality-forward Tests fehlen (unabhängig von Garden Atmosphere).
# Diese Tests müssen noch in einem späteren FU-X Fix behoben werden.
```

---

## 8. Commits und Branches

### 8.1 Branch-Strategie

| Branch | Beschreibung |
|---|---|
| `feat/fb-hud6-garden-overlay-stability` | Original-Main (Basis `fd19da2c`) |
| `agent/wt-garden-atmos-task1`           | Working branch mit allen Garden-Atmosphere-Commits |

Wir haben den Working-Branch per Fast-Forward in `main` gemerged (`update
fd19da2c..e8380813d`) und nach `origin` (Gitea) gepusht. Aktuell ist
`main` lokal und auf `origin` identisch.

### 8.2 Commit-Liste

```
fd19da2c (Base)  fix: stabilize garden team overlay on transient roster and viewport
2892ab8a fix(garden): make foreground bushes opaque, add sky-life layer container
f0d232b8 feat(garden): add wind / bird / mote / gust-leaf atmosphere controllers
d31fdfb1 fix(garden): respect bird wave amplitude and mote alpha spec
f91534fd feat(garden): wire atmosphere assets through loader, URL map, and attach path
974278b1 docs(garden): atmosphere headless probe + final report
4f79ddde fix(garden): align atmosphere URL tests with Vite flat-emit convention
a5b25fec fix(garden): forward host quality knob, add real probe runner script
042067c0 docs(garden): clarify reduced-motion contract in atmosphere report
64a1b4a7 fix(garden): skip gust-leaf alloc on reducedMotion, restore grass rotation on destroy
eb23cad0 fix(garden): wire scene plot anchors to atmosphere safe zones
f0b3fea2 fix(garden): plumb sun position through atmosphere input for safe-zone lookup
a5b25fec fix(garden): forward host quality knob, add real probe runner script
042067c0 docs(garden): clarify reduced-motion contract in atmosphere report
64a1b4a7 fix(garden): skip gust-leaf alloc on reducedMotion, restore grass rotation on destroy
eb23cad0 fix(garden): wire scene plot anchors to atmosphere safe zones
f0b3fea2 fix(garden): plumb sun position through atmosphere input for safe-zone lookup
cb3cee41 fix(garden): scale atmosphere elements to garden style
01f92731 fix(garden): bird flocks of 2-3, multi-green gust leaves spanning canvas
e201794fa fix(garden): more bird spread, real butterfly + leaf vein texture, longer leaf life
a7e1e3a4 feat(garden): bird group offsets + leaf full-canvas reach + butterfly
c44c00103 feat(garden): butterfly with antennae + flapping wings (2-frame animation)
7284962d0 feat(garden): physics-correct butterfly Bezier + leaf ballistic motion
4aa08308 feat(garden): visible wind speed-lines + 6 simultaneous colored leaves + cloud stretch
64601ea4 feat(garden-butterfly): rewrite as 6-slot pool with Bag-RNG type picker (FU-Q)
4aa083081 feat(garden): visible wind speed-lines + 6 simultaneous colored leaves + cloud stretch
7284962d0 feat(garden): physics-correct butterfly Bezier + leaf ballistic motion
c44c00103 feat(garden): butterfly with antennae + flapping wings (2-frame animation)
e201794fa fix(garden): more bird spread, real butterfly + leaf vein texture, longer leaf life
a7e1e3a4 feat(garden): bird group offsets + leaf full-canvas reach + butterfly
01f92731 fix(garden): bird flocks of 2-3, multi-green gust leaves spanning canvas
79c1ac42 feat(garden): birds render above distant hills, below trees
00ad4c959 fix(garden): bird-egg drops with shatter + yolk splat on plant height (FU-R)
7e289a49f fix(garden): reliable egg/shell/yolk textures via explicit Canvas2D (FU-S)
d42dbad53 fix(garden): 5× larger eggs and 4× longer shell persistence (FU-T)
f85329281 fix(garden): reduce egg size to 3× original (was 5×) (FU-U)
f03a574ff feat(garden): cubist egg silhouette with 10-facet oval (EGG-V)
0bad0487a feat(garden): zig-zag jagged shell shards with per-piece size variance (SHARD-V)
6935469b8 feat(garden): organic irregular yolk blob with amber rim (YOLK-V)
2f104b6af feat(garden): stagger decay with ease-out curve for shell shards (DECAY-V)
e8380813d fix(garden): restore square egg silhouette with subtle highlight (FU-W)
```

### 8.3 Push-Strategie

```bash
# lokal:
git checkout main
git merge --ff-only agent/wt-garden-atmos-task1
git push origin main              # Gitea-Hauptmirror
git push github main               # GitHub-Public-Mirror

# Live-Deploy:
/usr/bin/bash /nvmetank1/projects/Razzoozle/rust-cd-poll.sh
```

`rust-cd-poll.sh` timed out? Kein Problem — `razzoozle-rust-cd.timer` triggert
spätestens alle 5 min (oder via `systemctl start razzoozle-rust-cd.service`).

---

## 9. Live-Tests auf https://rust.razzoozle.xyz/party/manager/...

URL:
`https://rust.razzoozle.xyz/party/manager/7f518cf4-c507-4b59-813d-c769fa9fb64c`

### 9.1 Was sichtbar sein sollte
- **Wolken** wandern horizontal (parallaxT + sin)
- **Berge** im Hintergrund statisch (silhouettes)
- **Sonne** oben rechts, leichter Glow
- **Bäume** (3 Layer: fern/mittel/nahe, vollständig opak seit P0-Fix)
- **Zaun** weiß, horizontal
- **Beete** mit 2-4 Spieler-Pflanzen (DummyPlantView oder Fluent full-color)
- **Motes** (10–12 hoch, kleine grüne Punkte die treiben — sie sind winzig,
  1.5–3.5 px, kaum sichtbar — das ist Absicht)
- **Speed-Lines** (4 cream-yellow) erscheinen wenn Wind > 0.18, leichter
  Sweep horizontal um die Bildmitte
- **Schmetterlinge** (1 Slot aktiv durchschnittlich) fliegen entlang
  Bezier-Pfaden; Flügel-Schlag alle 220–320 ms; max 6 gleichzeitig nach
  Refresh
- **Vögel** (5 high qual): spawn in 2–3er-Gruppen, V-Formation, fliegen
  LTR oder RTL je nach WindField direction. Erstes Spawn nach 2.5–6 s.
- **Eier** (creme Quadrate 27 px) fallen von Vögeln wenn sie über das Beet
  fliegen (X 15-85% der Breite); auf Höhe der nächsten Pflanze
  zerschellen sie in 3–5 jagged Schalen-Stücke + einen amber Dotter-Splat
- **Blätter** (max 6 gleichzeitig) fliegen mit Wind, fallen physikalisch
  langsamer wenn sie sich drehen (Magnus-Effekt), 25–45 s Lifetime

### 9.2 Reduced Motion
Mit `prefers-reduced-motion: reduce` (Browser-Setting oder System-Setting):
- Keine Spawns, keine Windbewegung, keine Vogel-Bewegung
- Nur die Schalen-Stücke und Dotter-Splat werden NICHT gespielt, da
  das gesamte Atmosphären-Update übersprungen wird
- Clouds pausieren ebenfalls (Pixi-Ticker wird pausiert)

### 9.3 Performance-Test
Gemessen via Headless-Probe (`scratchpad/atmosphere-headless-probe.test.ts`):

- 4 Szenarien × 3600 Ticks × 16.67 ms = 60 s simulated
- Root stable 17 → 17 (kein Layer-Layer-Leak)
- Alle Pool-Sizes invariant
- Far/mid/near Trees alle alpha=1
- Foreground Bushes alle alpha=1
- 4/4 Szenarien PASS

---

## 10. Pre-existing Tests, die fehlen

### 10.1 FU-D `attachGardenPixiApplication.quality.test.ts` (2 tests)

```typescript
// Diese 2 Tests sind pre-existing und schlagen fehl nach der Atmosphäre-Refactor:
attachGardenPixiApplication quality forwarding (FU-D Minor-4)
  > honours quality 'medium' on the bound atmosphere (1 bird vs high=2 / low=0)
  > defaults to quality 'high' when the host omits the option (back-compat)
```

Ursache: Die Atmosphäre bekommt zwar `quality` übergeben, aber die Tests
erwarten, dass `getBirdCount()` unterschiedliche Werte je Quality zurückgibt.
Das ist möglicherweise nicht der Fall, weil GardenAtmosphereController
intern eine eigene Quality-Verarbeitung hat, die Vögel-Count nicht
direkt spiegelt. **TODO**: Diese 2 Tests sind unabhängig von der Garden-
Atmosphäre und sollten in einem separaten FU-X Fix behoben werden.

---

## 11. Offene Follow-Ups (nicht-blockierend)

| Task | Beschreibung | Priorität |
|---|---|---|
| FU-X: FU-D Qualitäts-Tests | 2 pre-existing Qualitäts-Forwarding Tests fixen | LOW |
| Per-Recipient Schmetterling-Spawn-Logik | Sicherstellen dass alle 8 Typen in einer Session mindestens 1× spawnen (Test-Hook) | LOW |
| Per-Type Schmetterling-Physics | Verschiedene Schmetterlinge = verschiedene Bezier-Wobble-Charakteristiken (FU-Q-Plan-Marker) | LOW |
| Wölkchen-Stretch auf alle 8 Wolken-Clouds | Aktuell nur die 4 gestretcht | LOW |
| Schmetterling-Statistik im Headless-Probe | Probe sollte Butterfly-Spawn-Count pro Typ erfassen | LOW |
| Tiefere Sonnenschein-Atmung | Plan §7.1 nennt Sonnenschein-Atmung (`scale.x +/- 0.05`) | OPTIONAL (FE-A out-of-scope nach AGY) |

---

## 12. Quickstart — Wie setze ich die Atmosphäre zurück?

```bash
# Vollständiges Reset aller Atmosphären-Daten:
cd /nvmetank1/projects/Razzoozle/source
rm -rf .superpowers/sdd/progress.md
# Branch zurücksetzen:
git checkout main
git reset --hard fd19da2c
git branch -D agent/wt-garden-atmos-task1
# Worktree entfernen:
git worktree remove .claude/worktrees/agent_wt-garden-atmos-task1 --force

# Container zurücksetzen (Rebuild):
/usr/bin/bash /nvmetank1/projects/Razzoozle/rust-cd-poll.sh

# Logs:
journalctl -u razzoozle-rust-cd.service -n 50 --no-pager
```

---

## 13. Wichtige Dateien zum Verstehen

| Datei | Inhalt |
|---|---|
| `rendering/atmosphere/GardenAtmosphereController.ts` | Aggregator + WindField |
| `rendering/atmosphere/GardenBirdController.ts`    | Vogel-Pool + Group-Spawn + Egg-Drop-Hook |
| `rendering/atmosphere/GardenEggController.ts`      | Eier, Schalen, Dotter (3 Sub-Container) |
| `rendering/atmosphere/GardenParticleController.ts`| Motes + Gust-Leaves + Grass-Sway |
| `rendering/atmosphere/GardenWindLineController.ts`| Speed-Lines für sichtbaren Wind |
| `rendering/atmosphere/GardenButterflyController.ts`| Schmetterlinge (Cubic Bezier + Heading + Flap) |
| `rendering/atmosphere/ButterflyTypeGenerator.ts`   | 8 Typ-Konfigurationen (Funktionen pro Typ) |
| `rendering/atmosphere/ButterflyTypeBake.ts`        | Texture-Cache (16 Frames, Renderer+Canvas2D-Fallback) |
| `rendering/atmosphere/garden-atmosphere.constants.ts` | Alle Magic-Number-Konstanten |
| `rendering/atmosphere/seededRandom.ts`              | Mulberry32-Implementierung |
| `rendering/GardenScene.ts`                          | Atmosphären-Bind, Plot-Anchors, Sun-Position |
| `attachGardenPixiApplication.ts`                    | loaded.atmosphere → Atmosphäre |
| `assets/garden-scene-asset-urls.ts`                | 8 env_* Aliase-Map |
| `assets/loadGardenSceneAssets.ts`                   | Texturen-Bake (Atmosphäre) + Alias-Registrierung |
| `rendering/gardenLayers.ts`                         | LAYER_LABELS + 2 sky-life Layer |
| `rust-cd-poll.sh`                                   | Live-Deploy Skript |

---

## 14. Contact / Ownership

**Owner der Arbeit:** Agent-Session mit Continuation-Prompt an
`/nvmetank1/projects/Razzoozle/source/.claude/worktrees/agent_wt-garden-atmos-task1`

**Branch:** `agent/wt-garden-atmos-task1` (per Fast-Forward bereits in `main`)

**Repos:**
- Gitea: `https://git.joelduss.xyz/agent-claude/Razzoozle.git` (origin, primary)
- GitHub: `https://github.com/joehomeskillet/Razzoozle.git` (mirror)

**Live-URL:** `https://rust.razzoozle.xyz`

Bei zukünftigen Änderungen:
1. Worktree neu anlegen (`git worktree add`)
2. Subagent für die Änderung dispatchen
3. Tests + tsc + push + rust-cd-poll.sh triggern

---

**Status:** COMPLETE. All Commits Pushed to Gitea + GitHub. Live running on rust.razzoozle.xyz.
