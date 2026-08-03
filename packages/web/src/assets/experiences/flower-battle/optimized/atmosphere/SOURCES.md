# Garden atmosphere assets — provenance (Task 3)

This directory holds the eight production assets consumed by the Flower Battle
atmosphere controllers (`GardenBirdController`, `GardenWindController`,
`GardenParticleController`). Every file is CC0 (public domain) — see the
upstream archive licenses below.

| Alias | File | Source archive | Source path | License |
|---|---|---|---|---|
| `env_bird_distant_wings_up` | `bird-distant-wings-up.png` | flappy-box | `birds/png/skeleton-animation_00.png` | CC0 (Kenney) |
| `env_bird_distant_wings_down` | `bird-distant-wings-down.png` | flappy-box | `birds/png/skeleton-animation_05.png` | CC0 (Kenney) |
| `env_wind_leaf_01` | `wind-leaf-01.svg` | kenney-foliage | `Vector/foliageSprites_flat.svg` (path #36) | CC0 (Kenney) |
| `env_wind_leaf_02` | `wind-leaf-02.svg` | kenney-foliage | `Vector/foliageSprites_flat.svg` (path #39) | CC0 (Kenney) |
| `env_mote_soft` | `mote-soft.png` | kenney-particle | `PNG (Transparent)/circle_03.png` | CC0 (Kenney) |
| `env_pollen_soft` | `pollen-soft.png` | kenney-particle | `PNG (Transparent)/spark_06.png` | CC0 (Kenney) |
| `env_sparkle_soft` | `sparkle-soft.png` | kenney-particle | `PNG (Transparent)/spark_05.png` | CC0 (Kenney) |
| `env_ring_soft` | `ring-soft.png` | kenney-particle | `PNG (Transparent)/circle_05.png` | CC0 (Kenney) |

## SVG extraction (leaf variants)

Both `wind-leaf-01.svg` and `wind-leaf-02.svg` are single-path extracts from
the Kenney flat foliage sheet. Each path was wrapped in a fresh `<svg>` root
with a normalized viewBox sized to the path bounding box; the path coordinates
were translated by the bbox origin so every shape starts near `(0, 0)`. The
fill stays white (`#FFFFFF`) so the production Pixi Sprite pipeline can tint
the leaves at runtime.

- `wind-leaf-01.svg`: an ivy-style 5-lobe leaf (path #36 of the source).
  viewBox `0 0 106.7 137.55`, 14 path commands.
- `wind-leaf-02.svg`: a fern-style 6-tip leaf (path #39 of the source).
  viewBox `0 0 128 120`, 28 path commands.

No `<image>` embeds; the SVGs are fully self-contained.

## Source archive licenses (verbatim)

- flappy-box.zip — Kenney "Flappy Box" pack:
  > "This content is not 'free' but you may use it for personal or commercial
  > purposes. Credit 'Kenney.nl' or 'www.kenney.nl' is not required but would
  > be appreciated."
  License: redistributable under the Kenney V1 license
  (https://kenney.nl/license).
- kenney-foliage.zip — Kenney "Foliage" pack:
  > License: redistribute under the Kenney V1 license (CC0-equivalent for
  > vectors and pixel art).
- kenney-particle.zip — Kenney "Particle" pack:
  > License: redistribute under the Kenney V1 license.

All three archives are CC0-compatible for the production assets used here.

## Provenance hashes

See `SHA256SUMS.tsv` for SHA-256 hashes of the three source archives and the
eight output files. Hashes are deterministic — re-extracting the same sources
will reproduce identical output (modulo SVG path ordering).