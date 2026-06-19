# Celebration Layer — FROZEN Design Contract

Every file under `packages/web/src/features/game/celebration/` MUST conform to
this spec so all independently-written files share ONE design language. Read this
in full before writing any component. Props/types come from `./types.ts` (frozen).

## Hard constraints (non-negotiable)

- Animation engine: **`motion/react` ONLY**. `import { motion } from "motion/react"`.
- **Never** import `framer-motion`. **Never** use GSAP.
- **No `layout` / layout-spring animations on player-scaled lists.** Podium (≤3)
  and the achievement queue (small) use **variants**, not `layout`. Do not put
  `layout` on any `motion.*` here.
- All motion goes through the shared hook `useReveal()` from
  `@razzoozle/web/features/game/animation/presets`. Never hand-roll spring numbers.
- **Reduced motion**: gate every fabricated transform/particle effect on
  `reveal.reduced`. When reduced: opacity-only reveals (handled by `reveal.item`/
  `reveal.pop`), `stagger → 0` (handled by `reveal.container`), **no confetti**,
  **no large transforms**, **no particle bursts**. The fallback must still render
  the podium + badges statically (visible, just unanimated).
- TypeScript strict: no `any`, `import type` for type-only imports, no unused
  imports (TS6133 fails build), `noUncheckedIndexedAccess` is ON — `arr[i]` is
  `T | undefined`, narrow before use.
- Brand-neutral code labels (no "Razzoozle"/"Kahoot" identifiers). Cream look comes
  only from the CSS tokens/classes below.
- Workers: **write files only. Do NOT run git add/commit/push.** The orchestrator
  commits centrally.

## `useReveal()` API (from presets.ts) — canonical usage

```tsx
const reveal = useReveal()
// reveal.reduced   : boolean
// reveal.spring    : Transition  (lifecycle spring; instant fade when reduced)
// reveal.snap      : Transition  (snappy pop spring; instant when reduced)
// reveal.container(stagger?, delayChildren?) : Variants  (stagger→0 when reduced)
// reveal.item(distance?) : Variants  (fade + rise; opacity-only when reduced)
// reveal.pop(from?)      : Variants  (overshoot scale pop; opacity-only when reduced)
// reveal.tween(dur?, ease?) : Transition

<motion.ul variants={reveal.container()} initial="hidden" animate="visible">
  {items.map((it) => (
    <motion.li key={it.id} variants={reveal.item()} transition={reveal.spring}>…</motion.li>
  ))}
</motion.ul>
```
Use `reveal.item(RISE)` for the podium block rise, `reveal.pop()` + `reveal.snap`
for medals/badges, `reveal.container()/item()` for the achievement queue stagger.

## Cream visual language — exact tokens & classes (copy verbatim)

Reuse the SAME tokens the existing `states/Podium.tsx` uses so the new layer is
pixel-consistent:

- Headings / on-stage text: `text-[color:var(--game-fg)]`
- Podium block surface: `glass-2 rounded-t-xl bg-[var(--color-accent)] shadow-2xl`
  with white text inside: `text-white`
- Points number: `text-3xl md:text-4xl font-bold text-white tabular-nums drop-shadow-sm`
- Hairline borders: `border border-[var(--border-hairline)]`
- Ink label color: `text-[color:var(--color-field-ink)]`
- Focus ring: `focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/60 focus-visible:outline-none`
- Touch targets ≥ 44px (`min-h-11`).
- Tier colors come from `@razzoozle/web/features/game/utils/achievements`:
  `TIER_GRADIENT` (Tailwind `from-… to-…` bg gradient), `TIER_RING`, `TIER_TEXT`,
  `TIER_ACCENT` (CSS var), and the medal fill tokens `var(--tier-gold|silver|bronze|diamant)`.
- Use `clsx` for conditional classes (already a dependency).

## Shared primitives to REUSE (do not re-implement, do not add deps)

- Avatar: `import Avatar from "@razzoozle/web/components/Avatar"` — props
  `{ src?, name, size?, className? }`. Use `src={c.avatar} name={c.name}`.
- Achievement meta: `ACHIEVEMENT_META[id]` → `{ id, tier, i18nKey, icon }`;
  `TIER_GRADIENT/TIER_RING/TIER_TEXT` from `utils/achievements`.
- Achievement medal: `import AchievementMedal from "@razzoozle/web/features/game/components/AchievementMedal"`
  props `{ id, tier, size }` (size `"sm"`). Prefer this for badge visuals.
- Confetti: reuse the dynamic-import pattern (canvas-confetti is **already** a dep;
  do NOT add it to package.json). See `confetti.ts` task below.
- i18n: `useTranslation()` from `react-i18next`; achievement label key is
  `meta.i18nKey` with a `defaultValue`. Keep copy German, "du", warm, no
  exclamation marks where text is added.

## Files & responsibilities

### 1. `confetti.ts`
Pure `.ts` (no React). Export:
`export async function fireWinnerConfetti(reduced: boolean): Promise<void>`
- Early-return when `reduced` is true (no-op).
- Dynamic-import canvas-confetti exactly like `utils/confetti.ts`:
  `const confetti = (await import("canvas-confetti")).default`
- Fire a celebratory **two-sided side-cannon** burst (Kahoot-like): two
  `confetti({...})` calls from `origin {x:0,y:0.65} angle:60` and
  `{x:1,y:0.65} angle:120`, `particleCount: 70, spread: 70, startVelocity: 55, ticks: 200`.
- Fire-and-forget (`void confetti(...)`). No colors array needed (defaults fine),
  but you MAY pass the gold tier palette `["#eab308","#facc15","#fef08a"]`.
- Keep it a few lines. This complements (does not replace) the host screen's
  existing react-confetti rain.

### 2. `AchievementBurst.tsx`  (props: `AchievementBurstProps`)
The genuinely-new piece: an animated **queue** of newly-unlocked achievements.
- Map `ids` → `{ id, meta: ACHIEVEMENT_META[id] }`, **filter out** ids with no meta
  (`noUncheckedIndexedAccess`: `ACHIEVEMENT_META[id]` is `AchievementMeta | undefined`).
- Render nothing (`return null`) if the filtered list is empty.
- Layout: a centered vertical stack / toast-column overlay. Each badge: a pill/card
  with `TIER_GRADIENT[tier]` bg gradient, `TIER_RING[tier]` ring, `TIER_TEXT[tier]`
  text, rounded-full, the `meta.icon` emoji, and the i18n label
  (`t(meta.i18nKey, { defaultValue: id })`).
- Animation: stagger the badges in with `reveal.container()` + `reveal.pop()` +
  `reveal.snap` (overshoot pop), gated by `active` (default true). Reduced motion →
  badges still render (opacity-only via reveal), no scale pop, no stagger.
- When all badges have appeared, call `onComplete?.()` once (e.g. a single
  `useEffect` with a timer cleared on unmount; respect strict effect cleanup).
- Container is `pointer-events-none` so it never blocks the podium beneath.
- Cap visible badges at a sane number (e.g. first 8) to bound work; if more, that's
  fine to drop silently.

### 3. `WinnerPodium.tsx`  (props: `WinnerPodiumProps`)
Brand-neutral, reusable podium matching the existing cream podium look.
- Order: **1st center, 2nd left, 3rd right on desktop; stack vertically on mobile.**
  (Use a responsive flex/grid: `flex-col md:flex-row md:items-end md:justify-center`,
  render order [2nd, 1st, 3rd] with the 1st block tallest/`md:order-*` so center.)
- Each block: `Avatar` (1st `size={72}`, others `size={56}`), the name in
  `text-[color:var(--game-fg)] font-bold`, then the block surface
  `glass-2 rounded-t-xl bg-[var(--color-accent)] shadow-2xl` containing a rank
  medal circle, the points (`text-white tabular-nums`), and up to 3 of the
  celebrant's `achievements` as `<AchievementMedal size="sm" .../>`.
- Block heights convey rank (1st tallest): e.g. `md:h-[60%]`/`md:h-[50%]`/`md:h-[40%]`.
- Reveal: each block via `motion.div variants={reveal.item(RISE)}` (`RISE = 96`)
  `initial="hidden" animate={active ? "visible" : "hidden"} transition={reveal.spring}`,
  medal via `reveal.pop()` + `reveal.snap`. `active` default true.
- Handle `top.length` of 1, 2, or 3 gracefully (guard `top[1]`/`top[2]` —
  they are `Celebrant | undefined` under noUncheckedIndexedAccess).
- Brand-neutral medal: a circle `rounded-full` with the tier fill
  `bg-[var(--tier-gold)]` (1st) / `bg-[var(--tier-silver)]` (2nd) /
  `bg-[var(--tier-bronze)]` (3rd) and the rank number.

### 4. `CelebrationOverlay.tsx`  (props: `CelebrationOverlayProps`)
Composes the celebration; the single entry point wired into the final screen.
- `const { renderPodium = true, fireConfetti = true } = props`.
- `const reveal = useReveal()`.
- On mount, if `fireConfetti` and not `reveal.reduced`: call
  `void fireWinnerConfetti(reveal.reduced)` once (a `useEffect([], )` with a ran-once
  guard; clear nothing/no timers leaked).
- If `renderPodium`: render `<WinnerPodium top={data.podium} />`.
- Always render `<AchievementBurst ids={data.newAchievements ?? []} />`
  as an absolutely-positioned overlay (`pointer-events-none`, e.g.
  `absolute inset-0 flex items-start justify-center`), so it layers over whatever
  podium is on screen.
- Forward `onComplete` from AchievementBurst (or call after confetti when there are
  no achievements). Keep it simple.
- Reduced motion: still renders podium (static) + badges (static), fires no confetti.
- Root element: a `<div className="pointer-events-none">` wrapper so it never
  blocks interaction with the host screen's share buttons.

### 5. Wiring — `states/Podium.tsx` (orchestrator/last WP)
Add `<CelebrationOverlay data={...} renderPodium={false} />` near the top of the
returned fragment (the host screen already draws its own podium, so
`renderPodium={false}`). Map: `podium = data.top.map(p => ({ id: p.username, name:
p.username, points: p.points, avatar: p.avatar, achievements: p.achievements }))`,
`newAchievements = data.top[0]?.achievements ?? []`. Do not remove existing podium
code. (This WP is done by the orchestrator after the components land.)

## Acceptance (orchestrator verifies)

- `pnpm -r run types` clean (strict `tsc -b`).
- `pnpm --filter web build` succeeds.
- Reduced motion: no confetti, no scale/translate bursts; podium + badges still
  visible statically.
- No new dependency added (canvas-confetti already present).
