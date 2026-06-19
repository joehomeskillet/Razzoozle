# Per-Round Recap — FROZEN Design Contract

Short, energetic award strip shown on the **per-round** Result screen (after the
Kahoot answer verdict), separate from the end-game `RecapSequence` before the
podium. Every file under `features/game/recap/` MUST obey this spec so all files
share ONE design language. Types come from `@razzoozle/common/types/game`
(`RoundRecapKey`, `RoundRecapAward` — FROZEN, already added).

## Frozen types (do not change)

```ts
export type RoundRecapKey =
  | "fastest_finger" | "first_correct" | "streak" | "highest_round_score"
  | "rank_climber" | "achievement_unlock" | "slowest_player" | "most_wrong"

export interface RoundRecapAward {
  key: RoundRecapKey
  winnerName: string
  winnerAvatar?: string
  value?: number   // ms for fastest/slowest; count otherwise; omitted for first_correct/achievement_unlock
}
```
`SHOW_RESULT.roundRecap?: RoundRecapAward[]` is already added (optional, additive).

## Hard constraints (non-negotiable)

- Animation engine: **`motion/react` ONLY**. Never `framer-motion`. Never GSAP.
- All motion through `useReveal()` from
  `@razzoozle/web/features/game/animation/presets`. Never hand-roll spring numbers.
- **opacity + transform only.** No color/filter/layout animation.
- **No `layout` prop**, no Motion layout/spring on the (player-scaled) card list.
- Reveal the strip with `reveal.container()` (stagger) + `reveal.item()` per card,
  `transition={reveal.spring}`.
- **Re-emphasis on an already-visible card** (e.g. a highlight pulse): animate
  `scale: [1, 1.06, 1]` with `transition={reveal.tween()}` — **do NOT use
  `reveal.pop()`** for re-emphasis (pop is for first appearance only).
- **Reduced motion**: gate every pulse/transform on `reveal.reduced`; when reduced,
  cards still render (opacity-only via reveal), NO scale pulse, NO confetti.
- Total animation under **~3 seconds**; **max 3 cards** (server caps at 3, client
  also slices `.slice(0, 3)` defensively).
- TS strict: no `any`, `import type` for type-only, no unused imports (TS6133 fails
  build), `noUncheckedIndexedAccess` is ON.
- Brand-neutral code identifiers. Workers **write files only — no git**.

## Visual language — REUSE RecapSequence.tsx, but shorter & horizontal

Match the existing recap card surface so the round strip looks like a compact
sibling of the end-game cards (see `components/RecapSequence.tsx`):

- Card surface: `rounded-3xl border border-[var(--border-hairline)] bg-white shadow-xl`
  (liquid-glass cream). Smaller padding than the end-game card (`px-4 py-4 md:px-5 md:py-5`).
- Emoji medal disc: `flex size-14 items-center justify-center rounded-full border-4 border-[var(--border-hairline)] bg-gray-100 text-3xl md:size-16 md:text-4xl`.
- Label: `text-base md:text-lg font-extrabold text-[color:var(--color-field-ink)]`.
- Winner: small `Avatar` (`size={40}`) + name `font-black text-[color:var(--color-field-ink)]`.
- Value pill: `rounded-full border border-[var(--border-hairline)] bg-gray-100 px-3 py-1 text-sm md:text-base font-bold tabular-nums text-[color:var(--color-field-ink)]`.
- On-stage text outside cards uses `text-[color:var(--game-fg)]`.
- **Projector-readable + mobile-safe**: no overflow (strip wraps or scrolls
  gracefully — `flex flex-wrap justify-center gap-3 md:gap-4`), no tiny text
  (min `text-sm`), touch targets not required (non-interactive display).
- Avatar import: `import Avatar from "@razzoozle/web/components/Avatar"` props `{ src, name, size }`.

## i18n (labels from i18n; emoji local)

- Label key per award: `t(`game:roundRecap.${key}`, { defaultValue: <German fallback> })`.
  German fallbacks (du-form, no exclamation marks):
  fastest_finger "Schnellster Finger", first_correct "Erste richtige Antwort",
  streak "Serie", highest_round_score "Beste Rundenpunkte",
  rank_climber "Grösster Aufsteiger", achievement_unlock "Bonus freigeschaltet",
  slowest_player "Langsamster", most_wrong "Meisten falschen Antworten".
- Emoji map (local const in formatRoundRecap.ts), one per key:
  fastest_finger ⚡, first_correct ✅, streak 🔥, highest_round_score 💯,
  rank_climber 🧗, achievement_unlock 🏅, slowest_player 🐢, most_wrong 🙈.

## Files & responsibilities

### A. `formatRoundRecap.ts`  (pure `.ts`, no React/JSX)
Export:
- `const ROUND_RECAP_EMOJI: Record<RoundRecapKey, string>` (map above).
- `function formatRoundRecapValue(key: RoundRecapKey, value: number | undefined): string`
  - `fastest_finger` / `slowest_player`: ms → `"X.Xs"` (`(value/1000).toFixed(1)+"s"`).
  - `streak` / `highest_round_score` / `rank_climber` / `most_wrong`: integer count `"${value}"`.
  - `first_correct` / `achievement_unlock` or `value` undefined: return `""` (no pill).
- `function roundRecapLabelKey(key: RoundRecapKey): string` → `` `game:roundRecap.${key}` ``.
  (Keep i18n `defaultValue` fallbacks at the call site in the Card, per the map above.)
Import `RoundRecapKey` with `import type`.

### B. `RoundRecapCard.tsx`  (props `{ award: RoundRecapAward; highlight?: boolean }`)
- Default export. Renders ONE compact card per the visual language above:
  emoji disc, label (`t(roundRecapLabelKey(award.key), { defaultValue })`),
  Avatar + winnerName, and the value pill (only when `formatRoundRecapValue` is non-empty).
- First-appearance animation is owned by the parent Strip (the Strip passes the
  reveal item variants); the Card renders a `motion.div` that consumes
  `variants` via props is NOT required — simplest: the Card is a plain element and
  the Strip wraps each card in its own `motion.div`. **Choose ONE**: put the
  `motion.div variants={reveal.item()}` in the STRIP, Card stays presentational.
  (Recommended: Card = presentational, no motion; Strip owns motion.)
- `highlight` (optional, default false): when true AND not reduced, the card plays
  a one-shot emphasis pulse `animate={{ scale: [1, 1.06, 1] }}` `transition={reveal.tween()}`
  — use this ONLY for re-emphasis; it requires the Card to be a `motion.div`. If you
  keep Card presentational, implement the pulse in the Strip instead. Keep it
  consistent and documented in a comment.
- Use i18n German fallbacks from the map. No exclamation marks.

### C. `RoundRecapStrip.tsx`  (props `{ awards: RoundRecapAward[] }`)
- Default export. `return null` when `awards` is empty.
- `const list = awards.slice(0, 3)`.
- `const reveal = useReveal()`.
- Container: `motion.div variants={reveal.container()} initial="hidden" animate="visible"`
  with `className="flex flex-wrap justify-center gap-3 md:gap-4"` (mobile-safe wrap).
- Each award: `motion.div key={award.key} variants={reveal.item()} transition={reveal.spring}`
  wrapping `<RoundRecapCard award={a} />`. **No `layout` prop.**
- Total under ~3s: rely on the default stagger (`reveal.container()` ≈ 0.06/card →
  ≤0.18s + spring settle). Do NOT add long manual delays.
- Reduced motion: handled by `useReveal` (stagger→0, opacity-only). No pulse.
- Optional heading `t("game:roundRecap.title", { defaultValue: "Höhepunkte der Runde" })`
  in `text-[color:var(--game-fg)]` above the strip (small, `text-lg font-bold`).

### D. Wiring — `components/states/Result.tsx`
- Add `roundRecap` to the destructured `data` (it is now an optional field on
  `SHOW_RESULT`).
- Render `<RoundRecapStrip awards={roundRecap ?? []} />` AFTER the existing
  `<RewardStack … />` inside the result `<section>`. Import the Strip. Do not
  remove or alter existing logic. (`RoundRecapStrip` returns null when empty, so
  old payloads render unchanged.)

### E. Server — `packages/socket/src/services/game/round-manager.ts` (`showResults`)
- In `showResults(question)`, compute up to **3** `RoundRecapAward[]` for THIS round
  and attach as `roundRecap` on the SHOW_RESULT payload broadcast to players
  (same array for every player — game-wide highlights). Keep it **additive +
  optional**: never throw, never block the existing emit; if data is missing,
  attach fewer awards or omit the field entirely (old clients keep working).
- Award selection priority (pick the first up-to-3 that have a real winner):
  1. `fastest_finger` — correct answerer with the smallest answer time this round
     (value = ms). Skip if no correct answers.
  2. `first_correct` — the player who answered correctly first this round (no value).
  3. `streak` — highest current streak ≥ 2 (value = streak length).
  4. `highest_round_score` — most points gained THIS round (value = round points).
  5. `rank_climber` — biggest positive rank improvement vs the pre-round order
     (use the existing `oldLeaderboard` snapshot already computed in `showResults`;
     value = spots climbed). Skip if ≤ 0.
  6. `achievement_unlock` — a player who unlocked an achievement this round (no value).
  7. `slowest_player` — answerer with the largest answer time (value = ms). Use as
     filler only if fewer than 3 of the above exist.
  8. `most_wrong` — player with the most wrong answers this round (value = count).
     Filler only.
  De-duplicate so the same player ideally isn't every award (allowed if unavoidable);
  prefer variety. Use the player's `username` for `winnerName` and `avatar` for
  `winnerAvatar`. Read times/correctness/streaks/points/achievements from the
  per-round structures `showResults` already builds (do NOT invent new tracking if
  the data isn't there — attach only the awards you can compute from existing state;
  it is fine to ship fewer than 8 award types if some data is unavailable, but
  fastest_finger / first_correct / streak / highest_round_score / rank_climber
  should be computable from existing round data + oldLeaderboard).
- Mark any deliberate “data not available, skipping” path with a `// ponytail:` note.

## Acceptance (orchestrator verifies)

- `pnpm -r run types` clean (strict `tsc -b`).
- `pnpm -r --if-present run test` passes.
- `pnpm --filter web build` succeeds.
- Reduced motion: no scale pulse, no confetti; cards still visible.
- Old payload (no `roundRecap`) → Result screen unchanged (Strip renders nothing).
- No new dependency.
