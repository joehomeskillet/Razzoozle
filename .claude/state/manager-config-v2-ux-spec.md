# Manager Config V2 — UX Polish Spec (issue rag-stack#494 → rahoot)

**Source:** `git.joelduss.xyz/ubuadmin/rag-stack#494` ("[Rahoot UX Epic] Manager Config V2"). Code lives in `agent-claude/rahoot` (`/nvmetank1/projects/rahoot/source`). Live: `https://rahoot.joelduss.xyz/manager/config`.

**Audited 2026-06-15** (5-agent ultracode audit workflow). Built on the already-shipped issue #10 config-UX foundation (`main @ f218d2b`).

## Orientation — what #10 already shipped (DO NOT rebuild)

The #10 wave already delivered most of #494's primitive/scroll/empty-state asks:

- **SectionCard** (= #494 ConfigCard/ConfigSectionHeader), **EmptyState** (= ConfigEmptyState, empty-vs-no-search-hit split done at call sites), **Field** (= ConfigFieldRow), **ColorSwatch** (label + native `input[type=color]` + hex), **AssetPreview** (verbatim relative `<img>`, `onError`→placeholder, 8 MiB guard, uploading spinner, per-tile `aspect` prop), **ListRow/ListRowAction** (= ConfigIconAction: tooltip `title` + `aria-label` + 44px + destructive variant), **SelectableRow** (strong selected state + `meta` slot).
- **Single-scroll-owner**: `ConsoleShell` tabpanel is the sole `overflow-y-auto` + themed `.console-scroll` (index.css). Cockpit lives INSIDE this scroller — do NOT re-architect scrolling.
- **Sticky save/reset bar** (inline in ConfigTheme — V2 only EXTRACTS it).
- **Live recolor**: `draft` local form-state + `preview()` = `setDraft` + `applyTheme` (writes CSS vars on `<html>`). New Live-Preview panel only READS `draft`.
- **Theme template system** (server-persisted, `THEME_TEMPLATE.*`, AlertDialog confirm) — V2 only restyles to cards.
- **WebP-only same-origin asset contract** (server transcodes, returns `/media/...`; `assetRef` regex + `assertSafeId`). Backend/socket contract MUST NOT change.
- Cross-tab already polished: Results report-cards + share-link; Media grouped footer + danger-behind-AlertDialog; ConfigAI inline test/save/generate `aria-live` notices + keyConfigured pill.

## Locked scope decisions (user, 2026-06-15)

1. **Scrim = single global value, previewed on tiles.** NO per-slot scrim schema change. AssetPreviewCard renders a black overlay at the existing global `draft.scrim` %; the one existing global slider stays. → zero schema/back-compat/deploy risk, client-only wave. (WP4 dropped.)
2. **Cross-tab polish IS in this wave** (WP7/8/9).
3. Live-Preview = **lightweight static mock** fed only by `draft` theme (spec endorses "darf statisch sein"). No game state, no secrets.
4. Templates color strip = compact `primary + accent + 4 answers`.
5. Submissions empty-state surfaces the public `/submit` URL as copyable text (public route, no secret).

## The genuine DELTA (what this wave builds)

1. **Design-tab cockpit layout** — settings-left `minmax(0,1fr)` / sticky-preview-right `minmax(320px,420px)` at `xl`, single-column below. Five existing SectionCards move into the LEFT column (content unchanged).
2. **ThemePreviewPanel** (new) — isolated Join/Question/Leaderboard mock from `draft`, theme vars scoped to its OWN subtree via inline style (NOT `applyTheme` on `<html>`). Sticky in right column.
3. **AssetPreviewCard** (new, wraps AssetPreview) — per-slot aspect (join/auth=landscape, host/managerGame=16:9, player/playerGame=phone-portrait) + black scrim overlay at global `scrim` %. Adds a minimal `overlay?` slot to AssetPreview.
4. **ColorSwatchField** (new, wraps ColorSwatch) — WCAG contrast badge (new pure-TS `contrast.ts`) + answer-button mini chip (bg = color, text = answerTextColor).
5. **Templates-as-preset-cards** — replace bottom name-form + flat list with preset cards (name + color strip + apply + delete-with-confirm). Reuses the THEME_TEMPLATE data/socket layer + AlertDialog.
6. **StickyActions** (extract) — the inline sticky save/reset bar → shared primitive.
7. **Cross-tab**: ConfigCatalog rows → shared ListRow; ConfigAI tri-state provider badge (Aus/Bereit/Fehler); ConfigSelectQuizz `meta` slot fed; ConfigSubmissions copyable `/submit` link.

## Work-package DAG (disjoint files; warm `source/` tree; central gate)

| WP | Files (disjoint) | Depends |
|----|------------------|---------|
| WP1 ColorSwatchField + contrast | `console/ColorSwatchField.tsx`, `console/contrast.ts` | — |
| WP2 AssetPreviewCard + overlay slot | `console/AssetPreviewCard.tsx`, `console/AssetPreview.tsx` | — |
| WP3 StickyActions | `console/StickyActions.tsx` | — |
| WP5 ThemePreviewPanel | `configurations/theme-preview/ThemePreviewPanel.tsx` | — |
| WP7 Catalog→ListRow | `configurations/ConfigCatalog.tsx` | — |
| WP8 ConfigAI badge | `configurations/ConfigAI.tsx` | — |
| WP9 SelectQuizz meta + Submissions link | `configurations/ConfigSelectQuizz.tsx`, `configurations/ConfigSubmissions.tsx` | — |
| WP-I18N | `locales/{de,en,es,fr,it}/manager.json` | — |
| WP-EXPORTS | `console/index.ts` | WP1,2,3 |
| WP6 ConfigTheme cockpit (integration) | `configurations/ConfigTheme.tsx` | WP1,2,3,5,EXPORTS |
| WP-TESTS | `console/__tests__/*`, `configurations/__tests__/ThemePreviewPanel.test.tsx` | WP1,2,5 |

## Hard constraints / regression risks

- WP6 must carry over **verbatim** every `draft`/`preview()`/`applyTheme`/`handleSave`/`handleReset`/template handler + socket events (SET_THEME, BACKGROUND_UPLOADED, SET_THEME_SUCCESS, THEME_ERROR, THEME_TEMPLATE.*). A dropped handler silently breaks save/upload.
- ThemePreviewPanel MUST scope to its own subtree — **never** write `document.documentElement.style` (would permanently recolor the real app on navigate-away-without-save). Asserted by a test.
- **No secrets via preview** — colors/logo/appTitle/bg only; no game state, player names, API keys, ConfigAI provider data.
- Do NOT touch the `--accent-tint`/`--accent-contrast` CSS tokens (intentional index.css + tokens.css duplication). New `contrast.ts` is pure-TS for badge display only.
- Keep rendering asset `value` **verbatim** (reuse AssetPreview) — no client-side URL building (would break `assetRef` regex + 404 fallback). There is NO `resolveAssetUrl`; server returns ready paths.
- Cockpit grid must not introduce a nested scroller that breaks the single-scroll-owner on mobile.
- WP7 ListRow migration must keep the AlertDialog delete-confirm (wire it from the action's `onClick`).

## Gate / deploy

`corepack pnpm -r run types` · `pnpm --filter @razzia/web build` · `pnpm --filter @razzia/socket test` → adversarial review → orchestrator merge → `scripts/deploy.sh` (smoke + health) → live smoke on `/manager/config` (all tabs, design save/reset, asset preview + fallback, 0 new console errors, mobile no h-scroll) → re-enable `rahoot-deploy.timer`.
