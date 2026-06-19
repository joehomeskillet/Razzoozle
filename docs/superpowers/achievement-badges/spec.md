# Spec — Achievement Badge System (Material Symbols)

**Branch:** `feat/achievement-badges-mdi` · **Status:** FROZEN contract for the wave.

Replace emoji achievement icons with a consistent SVG badge system using **Google
Material Symbols** (Apache-2.0). This is the single source every work-package
implements against. Workers **edit files only, do not run git**; the orchestrator
commits centrally and runs the final verify.

## Hard invariants (do not violate)

- **No logic / scoring / achievement-id changes.** IDs and tiers are fixed (SSOT
  = `packages/common/src/achievements.ts`). Touch only the web visual layer.
- Server registry, `round-manager.ts` award logic, i18n names/descriptions: **untouched**.
- **No new npm dependency.** No eager icon-package import. **No runtime CDN.**
- Tree-shaken: vendored SVG `path` strings only (the ~12 glyphs we use).
- Reduced-motion respected via the existing `useReveal()` contract.
- No Motion `layout`/spring on player-scaled lists (badge motion stays self-contained).
- Keep `ACHIEVEMENT_META[id].icon` (emoji) in place — just stop reading it in the
  two re-pointed components. Do not delete it (out of scope).

## Ground truth: 14 achievements → glyph (tier is from the common registry)

| id | tier | Material Symbol glyph | i18n name key |
|---|---|---|---|
| first_correct    | bronze  | `check_circle`           | game:achievements.first_correct |
| participation    | bronze  | `confirmation_number`    | game:achievements.participation |
| lucky_guess      | bronze  | `casino`                 | game:achievements.lucky_guess |
| speed_demon      | silver  | `bolt`                   | game:achievements.speed_demon |
| streak_3         | silver  | `local_fire_department`  | game:achievements.streak_3 |
| sharpshooter     | silver  | `gps_fixed`              | game:achievements.sharpshooter |
| climber          | silver  | `trending_up`            | game:achievements.climber |
| first_responder  | gold    | `military_tech`          | game:achievements.first_responder |
| streak_5         | gold    | `local_fire_department`  | game:achievements.streak_5 |
| underdog         | gold    | `rocket_launch`          | game:achievements.underdog |
| perfect_round    | gold    | `verified`               | game:achievements.perfect_round |
| streak_10        | diamant | `local_fire_department`  | game:achievements.streak_10 |
| speedy_gonzales  | diamant | `speed`                  | game:achievements.speedy_gonzales |
| perfect_game     | diamant | `emoji_events`           | game:achievements.perfect_game |

The three streaks deliberately share the flame glyph; the **tier ring** distinguishes
bronze/silver/gold/diamant. That shared identity IS the badge-system intent.

**Unique glyphs to vendor (12):** `check_circle`, `confirmation_number`, `casino`,
`bolt`, `local_fire_department`, `gps_fixed`, `trending_up`, `military_tech`,
`rocket_launch`, `verified`, `speed`, `emoji_events`.

**Fallback glyph** (unknown / missing id): `emoji_events`. There must be NO empty/missing badge.

## Files

New:
- `packages/web/src/features/game/achievements/iconRegistry.ts`
- `packages/web/src/features/game/achievements/achievementVisuals.ts`
- `packages/web/src/features/game/components/AchievementBadge.tsx`
- `packages/web/THIRD_PARTY_LICENSES.md`

Edit:
- `packages/web/src/features/game/components/AchievementMedal.tsx` (emoji span → `<AchievementBadge>`)
- `packages/web/src/features/game/components/TrophySticker.tsx` (inline `MiniMedal` emoji → static `<AchievementBadge>`)

**No edit (cascade by design):** `TrophyGallery.tsx` and `RewardStack.tsx` render
through `AchievementMedal`, so they inherit automatically. `RecapSequence.tsx` shows
superlative emojis, not achievements — leave it.

## WP1 — `iconRegistry.ts` (+ THIRD_PARTY_LICENSES.md)

A typed registry of vendored Material Symbols path data. NO network at runtime — the
SVG `d` strings are vendored into the file at author time.

```ts
// All Material Symbols use viewBox "0 -960 960 960".
export const ICON_VIEWBOX = "0 -960 960 960" as const;

export type IconName =
  | "check_circle" | "confirmation_number" | "casino" | "bolt"
  | "local_fire_department" | "gps_fixed" | "trending_up" | "military_tech"
  | "rocket_launch" | "verified" | "speed" | "emoji_events";

// glyph name -> SVG path `d` (single path, Material Symbols Rounded, fill1, 24px)
export const ICON_PATHS: Record<IconName, string> = { /* ...vendored... */ };
```

**How to vendor each path (build-time fetch, network is allowed):**
For each glyph `<name>` in the 12 above:
1. List `https://api.github.com/repos/google/material-design-icons/contents/symbols/web/<name>/materialsymbolsrounded`
   and pick the **filled** file (the one whose name contains `fill1` and `24px`; the
   plain `wght400` default, no grade/optical suffix preferred).
2. Fetch its `download_url` (a `raw.githubusercontent.com` URL).
3. Extract the **single `<path d="...">`** string. (Material Symbols are one path. If
   the file has multiple paths, concatenate their `d` values separated by a space.)
4. Confirm the SVG `viewBox` is `0 -960 960 960`; if a glyph differs, normalize/record it.
   (All 12 should be `0 -960 960 960`.)

If a `materialsymbolsrounded` filled file genuinely 404s for one glyph, fall back to
that glyph's `materialsymbols` (classic, viewBox `0 0 24 24`) — but then you MUST store
a per-icon viewBox, not the shared constant. Prefer to avoid this; all 12 exist in Symbols.

`rocket_launch` fallback name if missing: `rocket`.

Also create `packages/web/THIRD_PARTY_LICENSES.md`:
```
# Third-Party Licenses

## Material Symbols / Material Design Icons
- Source: https://github.com/google/material-design-icons
- License: Apache License 2.0
- Used: selected icon path data vendored into
  src/features/game/achievements/iconRegistry.ts for achievement badges.
- Full license text: https://www.apache.org/licenses/LICENSE-2.0
```

Acceptance: file typechecks standalone; 12 keys present; every value a non-empty string
starting with a path command (`M`/`m`). Add a tiny self-check `// @vitest`/assert is NOT
required here (data file) — orchestrator typecheck covers it.

## WP2 — `achievementVisuals.ts` (id → glyph)

```ts
import type { IconName } from "./iconRegistry";
import { ACHIEVEMENT_META } from "../utils/achievements"; // existing SSOT for tier
import type { AchievementTier } from "../utils/achievements"; // reuse existing tier type

export const ACHIEVEMENT_GLYPH: Record<string, IconName> = {
  first_correct: "check_circle",
  participation: "confirmation_number",
  lucky_guess: "casino",
  speed_demon: "bolt",
  streak_3: "local_fire_department",
  sharpshooter: "gps_fixed",
  climber: "trending_up",
  first_responder: "military_tech",
  streak_5: "local_fire_department",
  underdog: "rocket_launch",
  perfect_round: "verified",
  streak_10: "local_fire_department",
  speedy_gonzales: "speed",
  perfect_game: "emoji_events",
};

export const FALLBACK_GLYPH: IconName = "emoji_events";

export function getAchievementVisual(id: string): { glyph: IconName; tier: AchievementTier } {
  return {
    glyph: ACHIEVEMENT_GLYPH[id] ?? FALLBACK_GLYPH,
    tier: ACHIEVEMENT_META[id]?.tier ?? "bronze",
  };
}
```
Do **not** duplicate tier values here — source tier from `ACHIEVEMENT_META` (SSOT).
Confirm the real export names (`ACHIEVEMENT_META`, `AchievementTier`) in
`packages/web/src/features/game/utils/achievements.ts` and import accordingly.

## WP3 — `AchievementBadge.tsx`

The badge primitive. Anatomy (outer → inner): circular shell with **tier gradient**,
**tier ring**, optional **gloss/sparkle** layer, **centered Material Symbol** (white,
`currentColor`). One path SVG via `ICON_PATHS[glyph]` + `ICON_VIEWBOX`.

```ts
interface AchievementBadgeProps {
  id: string;                         // resolves glyph + tier via getAchievementVisual
  tier?: AchievementTier;             // optional override (callers may already know it)
  size?: "sm" | "md" | "lg";          // mirror AchievementMedal sizing
  animated?: boolean;                 // default true; false = static resting (export-safe)
  colorOverride?: { gradientFrom?: string; gradientTo?: string; ring?: string; icon?: string }; // literal hex for capture
  className?: string;
}
```

Rules:
- **Color resolution:** live UI uses tier CSS vars / existing tier Tailwind tokens
  (`TIER_GRADIENT`, `TIER_RING` from `utils/achievements.ts`, and/or
  `var(--tier-<tier>)` from `index.css`). When `colorOverride` is provided, use those
  **literal hex** values via inline `style` instead — this is how the PNG-export path
  stays correct (no CSS var / no Tailwind `oklch` in the capture subtree).
- **Icon:** `<svg viewBox={ICON_VIEWBOX}><path d={ICON_PATHS[glyph]} fill="currentColor"/></svg>`,
  icon color white (or `colorOverride.icon`). Always renders a glyph (fallback guarantees it).
- **Animation:** when `animated && !reveal.reduced` → keep the existing entrance feel
  (`reveal.pop()` scale/opacity) + optional one-shot gloss sweep + a small sparkle. When
  `animated === false` OR `reveal.reduced` → **static**, no transform/sweep/sparkle.
  Use `useReveal()` from `../animation/presets`.
- **Self-contained motion only.** No `layout` prop, no shared-layout spring (this renders
  inside `Leaderboard`, a player-scaled list — layout animation there is a known trap).
- Sizing: match `AchievementMedal`'s `EMOJI_SIZE`/disc sizes so the swap is visually 1:1
  in scale. Read the current sizes from `AchievementMedal.tsx` and mirror them.
- Self-check: add a minimal render assertion is not required; orchestrator runs full build.

## WP4 — `AchievementMedal.tsx` edit

Replace the emoji `<span>{icon}</span>` (the `ACHIEVEMENT_META[id].icon ?? "🏅"` read)
with `<AchievementBadge id={id} tier={tier} size={size} animated />`. Keep the existing
props (`id, tier, size, label, pulse, className`), the `label` text, and the outer
layout. The badge now owns the disc/ring/icon; if the medal currently draws its own
gradient disc around the emoji, let `AchievementBadge` own that visual and keep the
medal as the wrapper that adds `label`/`pulse` context. `pulse` should still drive the
gold/diamant emphasis (pass through or keep the existing `PulseRing`). Do not change the
component's public props.

## WP5 — `TrophySticker.tsx` edit

The inline `MiniMedal` (renders `ACHIEVEMENT_META[id].icon` emoji) is inside the
PNG-capture subtree (`#trophy-sticker-capture`, rasterized by `modern-screenshot`).
Replace its emoji with `<AchievementBadge id={id} tier={tier} animated={false}
colorOverride={{ ... literal hex ... }} />`, where the hex comes from the sticker's
existing `safeHex(theme.tierColors?.[tier], FALLBACK.tier[tier])` resolution (it already
computes per-tier hex). **Capture-safety is mandatory:** no animation, no CSS vars, no
Tailwind `oklch`, colors as literal `#rrggbb`/`rgba()` inline. The rank numeral (big
disc) is NOT an achievement — leave it. Keep the export waterfall untouched.

## Tier colors (reference)

`index.css`: `--tier-bronze:#b45309; --tier-silver:#9ca3af; --tier-gold:#eab308; --tier-diamant:#38bdf8;`
`utils/achievements.ts`: `TIER_GRADIENT`, `TIER_RING`, `TIER_TEXT`, `TIER_ACCENT` (Tailwind class maps; `TIER_ACCENT` already uses `var(--tier-*)`).

## Acceptance (orchestrator verifies after merge)

- All 14 achievements render a consistent badge in Result / RewardStack / TrophyGallery.
- TrophySticker still exports a PNG and the badge appears in it (browser-qa check).
- No missing-icon / empty badge (fallback proven).
- `pnpm -r run types` clean.
- `pnpm -r --if-present run test` passes.
- `pnpm --filter web build` succeeds.
- `THIRD_PARTY_LICENSES.md` lists Material Symbols / Material Design Icons (Apache-2.0).
