# design-sync NOTES — Razzoozle (@razzoozle/web)

Repo-specific gotchas for re-syncs. First sync 2026-07-10, project
`Razzoozle Design System` (e3bef6c9-a88d-4718-a365-6f8423321b99).

## Build / discovery
- App repo, NOT a packaged DS: no `main`/`module`/`exports` → synth-entry mode.
  PKG_DIR resolution needs the self-link `packages/web/node_modules/@razzoozle/web -> ../..`
  (gitignored; **recreate on fresh clone**: `mkdir -p packages/web/node_modules/@razzoozle && ln -sfn ../.. packages/web/node_modules/@razzoozle/web`).
- Because PKG_DIR is that symlink, package-relative cfg paths need FIVE `../` hops
  to reach repo root (see `tsconfig`, `extraEntries` in config.json).
- Components use `export default` → the stock synth entry (`export *`) exports
  nothing; `.design-sync/overrides/source-kit.mjs` fork re-exports defaults by
  basename AND honors `componentSrcMap:null` at the file level (declared in
  `cfg.libOverrides`). Fork needs `.design-sync/node_modules -> ../.ds-sync/node_modules`
  symlink on fresh clones.
- Excluded as app screens (not DS parts): AnimatedErrorPage, ErrorPage,
  ErrorBoundary, NotFound — their `errorQuotes` import chain pulls `src/i18n.ts`,
  whose TOP-LEVEL AWAIT cannot bundle into the IIFE.
- `cfg.cssEntry` points at the HASHED compiled stylesheet `dist/assets/index-<hash>.css`
  — **re-sync risk**: any `pnpm -F @razzoozle/web build` changes the hash; update
  `cssEntry` (and the 6 `extraFonts` woff2 hashes) after rebuilding the app.
  Raw `src/index.css` is NOT usable (needs the Tailwind compiler).

## Bundle bootstrap (.design-sync/i18n-preview.ts, via extraEntries)
- Initializes default i18next with EN `common` + `manager` namespaces (other
  namespaces render raw keys — pass explicit strings in previews).
- Seeds `globalThis.__APP_VERSION__` (Vite define; Background.tsx ReferenceErrors
  without it — React unmounts the whole preview tree, cell renders blank).
- Re-exports `toast` from react-hot-toast: previews/designs MUST import `toast`
  from "@razzoozle/web", never from "react-hot-toast" directly (separate bundled
  copy = separate singleton store = toast never appears in the bundled <Toaster/>).

## Preview gotchas
- Background sizes itself `h-dvh` and centers content — wrapper must be exactly
  `height:"100dvh"` or centered content clips out of the crop.
- Loader accepts only `className` (no style passthrough): size via `size-N` +
  `text-[color:var(--color-primary)]` (classes exist in compiled CSS).
- LanguageSwitcher: only the Closed state renders statically (Radix Select portal
  needs interaction for the open dropdown) — deliberate single-cell preview.
- Overlay overrides in config: AlertDialog `cardMode:single` (Radix portal).
- Known render warns (triaged legitimate): none outstanding — the 4 early
  RENDER_BLANK/THIN (ActionFooter, GithubIcon, LabelRow, Loader) were floor-card
  artifacts, resolved by authored previews.

## Findings for the app team (not sync blockers)
- Input + ToggleField accept `disabled` but render ZERO visible affordance
  (Button does it right: `disabled:opacity-60 disabled:cursor-not-allowed`).
  Worth a follow-up ticket.
- addBots (app, not sync): env-gated by RAHOOT_SIM_MODE=1 on both twins.

## Re-sync 2026-07-16 (W3 dedup components)
- cssEntry re-pinned to `dist/assets/index-BvwGq0AC.css`; all 6 extraFonts hashes UNCHANGED.
- 6 new components synced: manager/ group (Badge, FilterPill, PageHeader) + labels/ group
  (LabelChip, LabelColorPicker, LabelFilterPills) — authored previews, all cells graded good.
  Badge/FilterPill floor-attempts rendered blank-but-not-swapped (children/array props) → the
  authored previews are what fixed the `bad` flags, pattern to expect for future prop-required adds.
- Vite now ALSO emits a code-split `dist/assets/tokens-<hash>.css` (`.console-shell` accent
  override). NOT needed in cssEntry: `--accent-tint`/`--accent-contrast`/`--label-*-bg`/
  `--answer-text` are all declared in the main index-*.css (verified by grep).
- The `packages/web/node_modules/@razzoozle/web` self-link vanishes on pnpm install/prune, not
  just fresh clones — ALWAYS re-check + recreate before running the converter.
- LabelFilterPills inactive pills show a currentColor outline (component has unconditional
  `outline-2` class) — faithful to the shipped app render, graded good deliberately.

## Re-sync risks
- `cssEntry`/`extraFonts` hashed filenames go stale on every app rebuild (above).
- The i18n bootstrap inlines EN locale JSONs at bundle time — locale edits need a
  converter rebuild to reach the bundle.
- The two node_modules symlinks (self-link + fork deps) vanish on fresh clones —
  recreate before running the converter.
- Playwright pin: cached chromium-1228 ⇔ playwright@1.61.1 in .ds-sync (a different
  cached build needs the matching playwright release).
- `packages/web` has no Storybook; verification is authored-preview grading only.
# WAVE-GAME learnings

## STOP: capture-harness race blanks any mount-reveal-animated component (Question, Prepared, ScoreToast)

**Status:** blocked, not graded. `Question`, `Prepared`, `ScoreToast` all capture as a fully blank
cream box (no error, no console warning, `pageErrs: []`) despite compiling and mounting
correctly. Root-caused via a standalone Playwright repro (not a defect in the authored preview
files or in the underlying components — confirmed both render correctly when the race is
avoided). `AnswerButton`, `CircularTimer`, `AnimatedPoints` are unaffected and graded `good`.

**Root cause:** `package-capture.mjs`'s per-component flow is: (1) `page.goto(rel)` with no
`?story=` to read `window.__dsCells` (this mounts every export in "grid" mode), then (2) for each
label, `page.goto(rel?story=label, {waitUntil:'networkidle'})` → `settle()` (only
`document.fonts.ready` + `img.decode()`) → `page.screenshot()`. On step (2), the JS bundle/fonts
are **already cache-warm** from step (1)'s load of the same file, so `networkidle` resolves
almost instantly — the screenshot fires before Framer Motion's mount-in reveal
(`useReveal()`'s `container()`/`item()`/`pop()` variants, or `ScoreToast`'s `AnimatePresence`
initial/animate) has run even one frame. The element is captured at its literal `opacity:0`
initial keyframe. `AnimatedPoints` isn't affected because its `motion.span` is never
opacity-gated (only the *number inside* changes over time), so it's visible regardless of timing.

**Empirical proof** (throwaway Playwright script against the built `ds-bundle`, deleted after use —
nothing left in `.ds-sync/`):
- Going straight to `?story=X` (skipping the discover-cells navigation) → renders correctly for
  both `Prepared` and `ScoreToast` (screenshots show the full grid / full toast card).
- Reproducing the real two-navigation sequence → blank, matching the actual pipeline output.
- Adding a plain `page.waitForTimeout(500)` after the second navigation (real two-navigation
  sequence, nothing else changed) → renders correctly. This isolates it to a pure timing race,
  not a permanent stuck-at-hidden state.
- Tried forcing `useReducedMotion()` → `true` via a `window.matchMedia` shim inside the preview
  file (no shared file touched) hoping the shorter `DURATION.instant` (0.12s) tween would avoid
  the race — it did not reliably help (still raced to blank under the real two-navigation
  sequence) and was reverted; not worth the added complexity for an unreliable partial fix.

**Recommended fix (belongs in `.ds-sync/package-capture.mjs`, out of preview-author scope):**
add a short fixed delay (empirically 500ms was reliable) after the per-story `page.goto` and
before `page.screenshot()`, or force `page.emulateMedia({ reducedMotion: 'reduce' })` for the
whole page up front (matches this app's own supported reduced-motion path) combined with a
smaller buffer. Either fixes it for every future component that uses `useReveal()` or an
`AnimatePresence` mount reveal — likely several more in later waves (recap sequence, podium,
achievements per `componentSrcMap`), so worth fixing once at the harness level rather than per
preview file.

**What's already confirmed correct**, pending the harness fix, so re-capture + grade should be
a formality once fixed (no preview rework needed):
- `Prepared`: both `FourAnswers` (4-tile grid) and `TwoAnswers` (2-tile grid) render a
  legible dark `--surface-muted` card with correctly-colored/labeled answer tiles on the cream
  field, once the race is avoided.
- `ScoreToast`: `Correct` renders a polished toast (trophy icon, "CORRECT" label, amber
  `+<points>` count-up, accent left-border + icon wash) once the race is avoided; did not
  separately re-verify `Wrong` this way but it shares the same markup/gating.
- `Question` was not independently re-verified beyond the DOM confirming `opacity:1`/full
  content once mounted (same root cause, not separately screenshotted cold) — same class of fix
  applies.

**Note (unrelated, not a bug):** `i18next` "game" namespace isn't loaded in this bundle, so
`Prepared`'s `t("game:questionPrefix")` renders the raw key (`questionPrefix3`) rather than
translated text once visible — expected per existing guidance (pass explicit strings for
non-`common`/`manager` namespaces); not fixable from `Prepared.tsx` itself since the string comes
from the real component's own `useTranslation()` call, only from choosing a different i18n key
prop if one existed (it doesn't — `questionNumber` is a plain number).

**Not a bug (design-sync-wide, confirmed against precedent):** `CircularTimer` and `ScoreToast`
both read `var(--color-accent)`, which resolves to the compiled `:root` static seed
`#FF2D6E` (pink/magenta), not the app's live amber `#ff9900` default — because this whole
harness never runs the runtime `applyTheme()` JS that overwrites it. `design.md` itself documents
`#FF2D6E` as "an unused static seed only... NOT the live accent." Confirmed same behavior already
accepted in wave 1's `CreamBackdrop` (also reads `--color-accent`, graded `good` with no note)
— so grading these components as `good` against what the DS bundle's own compiled CSS actually
ships is consistent with established precedent, not something introduced by this wave.

## Cells graded good this wave
- `AnswerButton`: `Unrevealed` (4-color grid, shape badges + labels), `Revealed` (correct/wrong states).
- `CircularTimer`: `Full`, `MidCountdown`, `Urgent` (color/arc/number all shift correctly at the 25% threshold).
- `AnimatedPoints`: `LeaderboardRow` (real Leaderboard.tsx row markup), `ScoreGain` (real ScoreToast.tsx `+points` markup).

## Capture-harness reveal workaround (folded from WAVE-GAME, applied orchestrator-side)
- Playwright's clock.setFixedTime freezes rAF too → motion/useReveal mount
  animations never leave opacity 0. Preview-level fix: RevealAll <style> with
  `opacity:1/transform:none !important` (scoped .ds-reveal-all, or `body *`
  for PORTALED components like ScoreToast). Applied to: Podium, Leaderboard,
  TeamLeaderboard, SoloLeaderboard, Question, Prepared, ScoreToast, RoundRecapStrip.
- usePodiumAnimation gates 3+-entry podium behind setInterval — only <3-entry
  podiums render statically (previews use 2 entries deliberately).
- Bundle bootstrap now ALSO: applies DEFAULT_THEME via applyTheme (canonical
  amber accent — static @theme seed is pink and NOT live), exports MotionConfig
  + toast, loads game/results i18n namespaces.

## Folded from WAVE-ACHIEVE (staggerChildren:0 trap)
- Forcing prefers-reduced-motion via a window.matchMedia shim collapses
  useReveal().container()'s staggerChildren to exactly 0 — which freezes the
  ENTIRE subtree at opacity:0 under the capture harness. Don't use the
  matchMedia shim; the RevealAll CSS !important override is the reliable
  pattern for capture-safe entrances.
