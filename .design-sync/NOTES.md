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

## Re-sync risks
- `cssEntry`/`extraFonts` hashed filenames go stale on every app rebuild (above).
- The i18n bootstrap inlines EN locale JSONs at bundle time — locale edits need a
  converter rebuild to reach the bundle.
- The two node_modules symlinks (self-link + fork deps) vanish on fresh clones —
  recreate before running the converter.
- Playwright pin: cached chromium-1228 ⇔ playwright@1.61.1 in .ds-sync (a different
  cached build needs the matching playwright release).
- `packages/web` has no Storybook; verification is authored-preview grading only.
