# Garden Atmosphere (Task 2)

Deterministic wind + bird + mote + gust-leaf system for the flower-battle
garden scene. Wired into the existing PixiJS scene ticker; never owns a
ticker of its own.

## Layout

- `GardenAtmosphereController.ts` — aggregator + `createGardenAtmosphere` factory
- `GardenWindController.ts` — wind sample + gust scheduler (pure math, no Pixi)
- `GardenBirdController.ts` — Pixi sprite pool for sky-life
- `GardenParticleController.ts` — motes + gust leaves + grass-tuft sweep
- `garden-atmosphere.constants.ts` — quality tier counts, Y bands, ranges
- `seededRandom.ts` — Mulberry32 PRNG (`createSeededRandom(seed)`)
- `__tests__/` — Vitest suites per module

## Wiring

`GardenScene` constructs the atmosphere via `createGardenAtmosphere` once at
scene creation when the host passes `atmosphere?: { prefersReducedMotion?,
quality?, seed? }`. The aggregator then drives `update(deltaMs)` from the
existing ticker after the cloud parallax loop:

```ts
const deltaMs = Math.min(50, Math.max(0, ticker.deltaTime * (1000 / 60)))
atmosphere.update(deltaMs)
```

`destroy()` is idempotent and tears down every Pixi node owned by the
sub-controllers.

## Determinism

All randomness routes through Mulberry32 seeded by the host's `seed` option.
Two scenes built with the same seed produce identical bird sequences,
gust timing, mote positions, and grass tuft rotations.

No `Math.random()` is used in the animation path.

## Quality tiers

| Tier | Birds | Motes | Gust leaves | Grass tufts |
|------|-------|-------|-------------|-------------|
| high | 2     | 10–12 | 1–3         | 12–18       |
| medium | 1   | 6–8   | 1–2         | 8–10        |
| low  | 0     | 3–4   | 0           | 4–6         |
| static | 0   | 0     | 0           | 0           |

`prefersReducedMotion` globally disables wind, gust leaves, birds, and
grass-tuft rotation. Clouds keep their parallax.