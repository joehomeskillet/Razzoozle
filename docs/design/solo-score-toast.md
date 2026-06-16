# Design spec — Solo-Play "Steam-style" score toast

**Slug:** `solo-score-toast` · **Mode:** Solo play only · **Date:** 2026-06-16

## Goal

Replace the flat green/red **result bar above the answers** in solo play with a
polished **Steam/Valve "achievement unlocked"** toast that slides in at the
**top-center of the screen**. The points reveal (`+1000`) should read like an
achievement banner, reusing the existing achievement visual language.

## What changes

1. **Remove** the inline result-feedback bar in
   `packages/web/src/features/game/components/states/SoloAnswers.tsx`
   (the `{resultReady && (<div … bg-green-600/80 … bg-red-600/80 …>)}` block,
   currently lines ~224-239 — the "`{t("game:correct")} +{points}`" / "`{t("game:wrong")}`" bar).
2. **Add** a new component
   `packages/web/src/features/game/components/ScoreToast.tsx` rendered from
   `SoloAnswers` and driven by `lastResult` + `resultReady`.

**Out of scope (do NOT touch):** the `RewardStack` achievement list (stays
inline), the per-answer-button floating `+points` span (lines ~422-438), the
solo store, types, locales, server, the host (non-solo) game flow.

## ScoreToast component contract

```ts
interface Props {
  correct: boolean
  points: number      // server points for this answer
  visible: boolean     // = resultReady (phase === "result" && lastResult !== null)
}
```

- Self-reads `useReducedMotion()`; self-reads `useTranslation()`.
- Renders nothing when `!visible` (wrap body in `<AnimatePresence>` so exit animates).
- **Position:** `fixed`, top-center of the viewport — `fixed left-1/2 top-6 -translate-x-1/2`
  (use a translate that survives the motion transform; apply x-centering via the
  className and animate only `y`/`opacity`/`scale`). `z-[60]` (above the solo
  bottom bar `z-50`). `pointer-events-none` on the wrapper (purely informational).
- **Card** — mirror the achievement language of `RewardRow.tsx`:
  - `bg-black/55 backdrop-blur-md`, `rounded-[var(--radius-theme)]`,
    `ring-1 ring-white/15`, `shadow-2xl`, `borderLeft: 4px solid <accent>`,
    a leading accent wash (`linear-gradient(90deg, <accent>33, transparent)`).
  - Layout: `flex items-center gap-3 px-5 py-3`. Icon circle (size ~11) →
    text column (status label small uppercase tracking-widest + big value).
  - **Correct:** accent = gold `#facc15` (Steam-gold feel; or `var(--color-primary)`),
    icon = lucide `Trophy`, label = `t("game:correct")`, value =
    `+<AnimatedPoints to={points} />` in `text-3xl font-black tabular-nums`
    text-yellow-300/white with `drop-shadow`. Reuse the existing
    `AnimatedPoints` component for the count-up.
  - **Wrong:** accent = red `#ef4444`, icon = lucide `X` (or `Frown`), label =
    `t("game:wrong")`, **no points value**. Muted (smaller/no glow).
- **Motion (Steam unlock feel), full-motion:**
  - Enter: slide down from above + settle — `initial {opacity:0, y:-64, scale:0.9}`
    → `animate {opacity:1, y:0, scale:1}` with a spring (`type:"spring",
    stiffness:320, damping:24`).
  - Exit: `{opacity:0, y:-32}` short tween.
  - A one-shot **sheen sweep** across the card on the correct toast (an absolutely
    positioned skewed white-gradient bar animating `x` left→right, ~0.8s, once)
    for the "unlock shine". Optional soft glow pulse on the icon for correct.
- **Reduced motion (`useReducedMotion()` true):** opacity-only fade in/out, no
  slide/scale/sheen/glow. AnimatedPoints already self-handles reduced motion
  (jumps to final value).
- **Accessibility:** wrapper gets `role="status"` + `aria-live="polite"` so the
  result + points are announced. Icons `aria-hidden`. Text is white on the dark
  surface (contrast safe — same rule as RewardRow: never tint the text).

## Wiring in SoloAnswers.tsx

- Import `ScoreToast` and (already imported) nothing else new besides the component.
- Render `<ScoreToast correct={lastResult?.correct ?? false} points={lastResult?.points ?? 0} visible={resultReady} />`
  once, near the top of the returned JSX (it is `fixed`, so DOM position is free;
  keep it inside the component so it unmounts with the question).
- Delete the old inline bar block. Keep `RewardStack` and everything else intact.

## Constraints / gate

- TypeScript strict, no `any`. Imports use the `@razzoozle/web/...` alias and
  `motion/react` (NOT `framer-motion`), matching the rest of the file.
- Reuse `AnimatedPoints` (`@razzoozle/web/features/game/components/AnimatedPoints`).
- No new dependencies, no new i18n keys, no new theme tokens.
- Must pass: `pnpm -r run types && oxlint && pnpm --filter web run build`.
