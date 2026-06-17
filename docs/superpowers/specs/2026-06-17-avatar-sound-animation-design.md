# Design — Avatar generator + Manager Sound-Pack + Animation menu

- **Date:** 2026-06-17
- **Branch:** `feat/avatar-sound-animation` (off `feat/admin-skeleton-integration`)
- **Status:** Approved design → implementation
- **Author:** orchestrator (Opus) + Explore map

## Summary

Three independent features for the Razzoozle/Rahoot game, scoped together,
built in sequence (Avatar → Animation → Sound). Each is an **extension** of an
existing subsystem — none is greenfield.

| # | Feature | Decision | Surface |
|---|---------|----------|---------|
| 1 | Avatar "verbessern" | DiceBear-generated avatars (procedural, huge variance) | client-only (`AvatarPicker`) |
| 2 | Sound/Musik menu | Manager-side **sound-pack** (theme-like, applies to all players) | `themeValidator` + manager Design tab + media pipeline |
| 3 | Animation menu | Fine sliders (spring + duration) **persisted**, with live preview | `themeValidator` + `presets.ts`/`useReveal` + manager Design tab |

## The spine (features 2 & 3)

Both "theme-like" features extend **one surface**: `themeValidator`
(`packages/common/src/validators/theme.ts`). That validator already uses the
exact pattern these need — **optional fields with `.default(...)` so old
`theme.json` stays valid and defaults reproduce the current behaviour (audio/
visual no-op when unset)**, identical to the colour-tokenization already
shipped. Both features:

- add a section to **`ConfigTheme.tsx`** (the manager Design tab),
- reuse the **`ThemePreviewPanel`** isolation pattern for live preview,
- ride the existing **skeleton ZIP** export/import (`sounds` assets go in the ZIP).

Feature 1 (avatar) is standalone client work; it touches none of the spine.

---

## Feature 1 — Avatar: DiceBear generated

### Goal
Replace/augment the 4 fixed generic avatars with procedurally-generated avatars
so every player gets a distinctive look without uploading an image.

### Current state
- `Player.avatar` (`packages/common/src/types/game/index.ts:29`), validated by
  `setAvatarValidator` (`packages/common/src/validators/avatar.ts`) — accepts
  **any** string `min(1).max(⌈AVATAR_MAX_BYTES*1.4⌉)` (≈5.6 MB). No MIME gate.
- `AvatarPicker.tsx` (join flow): 4 generic `.webp` (`AVATARS_GENERIC`) + file
  upload → `FileReader` data-URL → `choose(value)` → `setAvatar` + socket
  `PLAYER.SET_AVATAR`. Fallback `Avatar.tsx` renders initials on a hashed colour.
- Rendered in Room (`:226`), Leaderboard (`:408`), Podium (`:159,203,240`).

### Approach (D1 — recommended: DiceBear via npm, local generation)
Add `@dicebear/core` + `@dicebear/collection`. New helper
`packages/web/src/features/game/utils/dicebear.ts`:

```ts
import { createAvatar } from "@dicebear/core"
import { botttsNeutral, thumbs, funEmoji, avataaars } from "@dicebear/collection"
const STYLES = { bottts: botttsNeutral, thumbs, fun: funEmoji, people: avataaars }
export type AvatarStyle = keyof typeof STYLES
export const AVATAR_STYLES = Object.keys(STYLES) as AvatarStyle[]
export function generateAvatar(style: AvatarStyle, seed: string): string {
  return createAvatar(STYLES[style], { seed }).toDataUri() // data:image/svg+xml,...
}
```

`AvatarPicker` gains a **"generate" mode**: a style segmented-control + a
re-roll button (seed = `crypto.randomUUID()` or username+counter). On pick it
calls the existing `choose(dataUri)` — **zero server/validator/type changes**
(SVG data-URI is just a string under the cap; `<img src>` does not execute SVG
script, so no XSS). Keep the 4 generics + upload as additional tabs/rows.

### Decision gate D1 (the one open call)
My global rules discourage new deps; the user chose "DiceBear/Emoji generated".
Order of preference:
1. **DiceBear-npm** (above) — richest, self-contained, **offline-safe** (matters:
   the game runs on LAN/event networks). Requires `pnpm install` to succeed.
2. **Emoji-on-colour fallback** — if `pnpm install` cannot reach the registry in
   this env: a ~30-line zero-dep generator (pick emoji + hashed bg, render to a
   data-URI via a tiny SVG template). Same `generateAvatar(style, seed)` shape so
   the picker UI is identical.

**Gate:** the Avatar wave first runs `pnpm add` + `pnpm verify`; if install
fails, swap to emoji impl behind the same `generateAvatar` signature. Do NOT use
the DiceBear HTTP API (`api.dicebear.com`) — third-party fetch per render breaks
offline/LAN play and leaks usage.

### Files
- `packages/web/package.json` (+2 deps) — **orchestrator runs install**, not agent.
- `packages/web/src/features/game/utils/dicebear.ts` (new helper).
- `packages/web/src/features/game/components/join/AvatarPicker.tsx` (generate UI).
- i18n: `game:avatar.generate`, `.reroll`, `.style.*` across the 5 locales.

### Acceptance
- `generateAvatar(style, seed)` is deterministic (same seed → same data-URI).
- Picking a generated avatar broadcasts via `SET_AVATAR` and renders in
  Room/Leaderboard/Podium with no new server validation.
- `pnpm verify` green; reduced bundle check (DiceBear collection is tree-shaken
  to the chosen styles).

### Non-goals
No animated avatars, no per-avatar accessories editor, no manager-side avatar
curation (separate future feature).

---

## Feature 2 — Manager Sound-Pack (theme-like) — *largest scope*

### Goal
Let the manager override the game's sound effects with an uploaded sound-pack
that applies to all players, falling back to the bundled defaults per-slot.

### Current state
- `SFX` const map (`packages/web/src/features/game/utils/constants.ts:60-80`):
  13 files under `/sounds/` — `ANSWERS.{MUSIC,SOUND}`,
  `PODIUM.{THREE,SECOND,FIRST,SNEAR_ROOL}`, `RESULTS_SOUND`, `SHOW_SOUND`,
  `BOUMP_SOUND`, `TIERS.{BRONZE,SILVER,GOLD,DIAMANT}`.
- Playback: `use-sound` (Start.tsx, Result.tsx, Podium.tsx, …) + native Audio
  (`firstCorrectSound.ts`). Global mute/haptics toggles in `GameWrapper.tsx`.
- Backgrounds already prove the media pipeline: assetRef → uploaded under
  `config/media/…` → served by nginx at `/media/…`; carried in the skeleton ZIP.

### Approach
Add `sounds` to `themeValidator`: a record keyed by **flat slot ids** (e.g.
`answersMusic`, `answersSound`, `podiumThree`, `podiumSecond`, `podiumFirst`,
`podiumSnearRoll`, `results`, `show`, `boump`, `tierBronze`, `tierSilver`,
`tierGold`, `tierDiamant`) → `assetRef` (`null` = bundled default). Extend the
`assetRef` regex domain to allow `/media/sounds/…` (it already allows `/media/`).

- **Resolver** (`packages/web/src/features/game/utils/sfx.ts`, new):
  `resolveSfx(theme)` → a 13-slot map where each entry is
  `theme.sounds?.[slot] ?? SFX_DEFAULT[slot]` (`SFX_DEFAULT` = the current
  `/sounds/*.mp3` paths). All playback sites read from the resolved map (sourced
  from the active theme store) instead of the frozen `SFX` const.
- **Upload** (server): accept `audio/*` (mp3/ogg/wav) with a size cap (e.g.
  `SOUND_MAX_BYTES`, ~2 MB) in the existing media-upload handler; save under
  `config/media/sounds/<slot>.<ext>`; return the assetRef. Bump `skeletonVersion`.
- **Skeleton ZIP**: include `assets/sounds/*` on export; on import, write files +
  set `theme.sounds[slot]`.
- **Manager UI**: a "Sounds" section in `ConfigTheme.tsx` (new
  `SoundControls.tsx`): per-slot row with current name, upload, **test-play**
  (`new Audio(url).play()`), and reset-to-default.

### Files
- `packages/common/src/validators/theme.ts` (+`sounds`, widen `assetRef`),
  `types/theme.ts` (DEFAULT_THEME `sounds: {…null}`), `constants.ts` (`SOUND_SLOTS`).
- `packages/web/src/features/game/utils/sfx.ts` (new resolver + `SFX_DEFAULT`).
- Playback call-sites: `Start.tsx`, `Result.tsx`, `Podium.tsx`,
  `firstCorrectSound.ts`, any other `SFX.` consumer (implementer greps `SFX.`).
- `packages/socket/src/services/…` media-upload handler + ZIP packer
  (`config.ts`/`manager.ts`/`http-routes.ts` — implementer locates the
  background-upload path and mirrors it for audio).
- `packages/web/src/features/manager/components/configurations/SoundControls.tsx`
  (new) + wired into `ConfigTheme.tsx`. i18n strings.

### Acceptance
- Slot set → that URL plays in-game; slot `null` → bundled default plays.
- Old `theme.json` with no `sounds` key validates and behaves identically.
- Upload rejects non-audio / oversize with a toast; ZIP round-trips sounds.
- `pnpm verify` green.

### Non-goals
No new audio engine, no looping-music sequencer, no per-player volume mixer, no
per-event SFX picker beyond the 13 slots.

---

## Feature 3 — Animation menu (fine sliders + preview, persisted)

### Goal
Manager tunes the in-game motion feel (spring + speed) with live preview;
choice persists and applies to all players.

### Current state
- `presets.ts` single source: `SPRING{300/24}`, `SPRING_SOFT{210/26}`,
  `SPRING_SNAP{400/28}`, `SPRING_COUNT{1000/30}`, `DURATION{instant…sheen}`,
  `EASE{out,inOut}`, `STAGGER{fast…slow}`, `RISE 16`, variant factories, and the
  `useReveal()` hook (reduced-motion aware).
- ~19 components consume `useReveal()`. Only **3** import frozen consts directly:
  `ScoreToast`→`SPRING`, `AnimatedPoints`→`SPRING_COUNT`, `Wait`→`EASE`.

### Approach
Add `animation` to `themeValidator`:
`{ springStiffness: 300, springDamping: 24, durationScale: 1, staggerScale: 1 }`
(all `.default(...)` = current values ⇒ no-op when unset). v1 tunes **only the
primary lifecycle `SPRING`** + a global duration/stagger multiplier:

- `useReveal()` reads the active theme's `animation` tokens (from the theme
  store/context the colour vars already come from) and computes:
  - `spring` = `{ type:"spring", stiffness, damping }`
  - `tween(d)` duration = `d * durationScale`
  - `container` stagger = `STAGGER.base * staggerScale`
  - **add an optional override param** `useReveal(override?)` so the preview can
    pass *draft* tokens without touching the live store.
- The only direct-const refactor: **`ScoreToast`** switches `SPRING` →
  `useReveal().spring`. `AnimatedPoints` (`SPRING_COUNT`) and `Wait` (`EASE`) use
  **untuned** tokens → **no change**.
- Reduced-motion still collapses to opacity-only (sliders inert under it).
- **Manager UI**: "Animation" section in `ConfigTheme.tsx` (new
  `AnimationControls.tsx`): 4 sliders + a **live isolated motion-demo box** (a
  small `motion` list that re-reveals on slider change via `useReveal(draft)`),
  reusing the `ThemePreviewPanel` scoped-style discipline.

### Files
- `packages/common/src/validators/theme.ts` (+`animation`), `types/theme.ts`
  (DEFAULT_THEME `animation`).
- `packages/web/src/features/game/animation/presets.ts` (`useReveal` reads
  tokens + override param), `ScoreToast.tsx` (hook swap).
- `packages/web/src/features/manager/components/configurations/AnimationControls.tsx`
  (new, with demo preview) + wired into `ConfigTheme.tsx`. i18n strings.

### Acceptance
- Slider change → live demo re-animates with new feel; Save persists to
  `theme.json`; in-game `useReveal` consumers pick it up.
- Old `theme.json` (no `animation`) validates and animates exactly as today.
- Reduced-motion → opacity-only regardless of slider values.
- `pnpm verify` green.

### Non-goals
v1 leaves `SPRING_SOFT/SNAP/COUNT` and `EASE` as fixed presets (no per-spring
sliders); no keyframe editor, no per-component overrides.

---

## Implementation orchestration (WP-DAG)

**Execution model** (per warm-tree lessons — see `WORKING_MEMORY`/HANDOFF):
- **No git worktrees** (fresh-worktree `pnpm install` hangs on this host).
  Free-tier CLI coders edit **disjoint files** in the warm `source/` tree,
  **edit-only / no git**. The **orchestrator runs `pnpm install`/`pnpm verify`
  and commits centrally** after each wave.
- Open `claude-route-override "<reason>" --ttl 7200` before each wave so
  delegated agents' Write/Edit on `packages/*` is allowed; `--clear` after.
- razzoozle-cd deploys from a **separate cd-src clone** — the dev `source/` tree
  is never `git reset`, so **no deploy-timer stop needed** (corrects the older
  rahoot caveat).
- Each feature = its own Workflow + verify + commit checkpoint, fanning out to
  free CLI agents (codex-gpt5 / or-coder-free / gemini-pro / local-coder-ov),
  with an adversarial review stage. Build order: **A → B → C**.

### Wave A — Avatar
- **A1** deps + `dicebear.ts` helper (`package.json`, new helper) — *agent edits
  package.json; orchestrator installs.*
- **A2** `AvatarPicker` generate UI + i18n (depends A1).
- Review → orchestrator `pnpm install` + `pnpm verify` → commit.

### Wave B — Animation
- **B1** (common) `themeValidator` + `DEFAULT_THEME` `animation` tokens.
- **B2** (web) `useReveal` token-read + override param; `ScoreToast` hook swap.
- **B3** (manager) `AnimationControls.tsx` + preview, wire into `ConfigTheme`.
- B2 ∥ B3 after B1 (disjoint files). Review → verify → commit.

### Wave C — Sound
- **C1** (common) `themeValidator.sounds` + `SOUND_SLOTS` + widen `assetRef`.
- **C2** (web) `sfx.ts` resolver + repoint playback call-sites.
- **C3** (server) audio upload handler + skeleton-ZIP sound packing.
- **C4** (manager) `SoundControls.tsx` + wire into `ConfigTheme`.
- C2 ∥ C3 ∥ C4 after C1 (disjoint). Review → verify → commit.

### Agent routing
- zod/types/common → `codex-gpt5` or `or-coder-free` (precise, typed).
- React/TS UI (picker, controls, preview) → `codex-gpt5` / `local-coder-ov`.
- socket/server → `codex-gpt5` / `gemini-pro` (long ctx).
- review → `pr-diff-reviewer` + a free reasoner (`or-reasoner-free`).

## Risks
- **DiceBear install** (D1) — mitigated by emoji fallback behind same signature.
- **Theme store wiring for animation** — `useReveal` must read the *active* theme
  client-side; if the active theme isn't in a hook-reachable store, B2 wires a
  minimal selector (defaults = current presets ⇒ safe no-op until wired).
- **`ConfigTheme.tsx` touched by B3 and C4** — sequential waves (B before C)
  avoid concurrent edits; central commit between.
- **Audio asset size** — cap + mime gate server-side; ZIP can grow (acceptable).
