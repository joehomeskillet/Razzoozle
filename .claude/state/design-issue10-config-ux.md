# Design Spec — Issue #10: Manager /config UX Polish

> Repo: `agent-claude/rahoot` · root `/nvmetank1/projects/rahoot/source` · warm tree (node_modules installed — NEVER run `pnpm install`).
> Source of truth for all WPs. Locked decisions below — implement against these exactly.
> Stack: React + Vite + Tailwind **v4 CSS-first** (no tailwind.config / postcss config). i18n = i18next, 5 locales `de,en,es,fr,it`.

## Hard constraints (do not violate)
- **NO backend/schema change.** Theme asset values (`theme.logo`, `theme.backgrounds.{auth,managerGame,playerGame}`) are already same-origin relative URLs (`/media/backgrounds/<slot>-<ts>.webp` or legacy `/theme/...`), served by nginx, and render directly as `<img src>` (proven: `Background.tsx:21,45`, `GameWrapper.tsx:87`, `ConfigMedia.tsx:291`). Render the value verbatim — **no URL building, no prefix, no cache-bust query**.
- Do NOT touch the socket contract (`UPLOAD_BACKGROUND`/`BACKGROUND_UPLOADED`/`SET_THEME`/`GET_THEME`) or the `Theme` type.
- WebP-only hosted images stays. Upload `accept` lists are client hints; server transcodes. Pass `accept` through, don't hardcode.
- Accent tokens `--accent-tint` (soft wash) / `--accent-contrast` (AA-safe filled/white-text) are color-mix-derived and exist in **both** `index.css:29-34` AND `console/tokens.css:18-25` by design — never dedupe; if you ever change the formula change both. Use these vars for any new chrome (scrollbar thumb, placeholders), never hardcoded purple.
- Surfaces use `outline-2 -outline-offset-2 outline-gray-200` (NOT `border`); inputs use `border-2`. Keep this split.
- Honour `prefers-reduced-motion` (existing `useReducedMotion` gate); animate only transform/opacity.
- No secrets/passwords in code, tests, logs, screenshots.

## Asset → real surface mapping (for labels/alt)
- `logo` → app logo (small, often transparent → **object-contain**, neutral/checker tile)
- `backgrounds.auth` → Start/Beitritt wallpaper (16:9, object-cover)
- `backgrounds.managerGame` → Host-Bildschirm (16:9, object-cover)
- `backgrounds.playerGame` → Spieler-Handy wallpaper (object-cover; phone-ish aspect acceptable)
- `value === null` → "Standard" placeholder tile (icon + label), NEVER `<img src={null}>`. Add `onError` → swap to placeholder so a deleted file (nginx 404) degrades gracefully.

---

## WP-A — Foundation (lands FIRST; everything else depends on it)
Files: `packages/web/src/features/manager/components/console/` (new files + `index.ts`), `packages/web/src/index.css`, `packages/web/src/features/manager/components/console/ConsoleShell.tsx`, `packages/web/src/locales/{de,en,es,fr,it}/manager.json`.
**Must NOT edit any `Config*.tsx`** (those are other WPs). **Do NOT run build / pnpm -r.**

### A1. Extract/create shared console primitives (export all from `console/index.ts`)
Base the extracted ones on the CURRENT local code in `ConfigTheme.tsx` so behaviour/styling is identical, then ConfigTheme/ConfigAI will switch to import them (their WPs).

1. **`SectionCard`** — extract from `ConfigTheme.tsx:62-90`. Signature **locked**:
   `SectionCard({ icon, title, description?, actions?, children, className? })` where `icon: ReactNode` (rendered inside a `size-9 rounded-lg bg-[var(--accent-tint)] text-[var(--accent-contrast)]` chip), `title: string`, `description?: string`, `actions?: ReactNode` (right side of header), `children: ReactNode`.
   Surface: `space-y-4 rounded-2xl bg-white p-4 shadow-sm outline-2 -outline-offset-2 outline-gray-200`.
2. **`SubGroup`** — extract from `ConfigTheme.tsx:93-97`. `SubGroup({ children, className? })` → `rounded-xl bg-gray-50 p-3 outline-1 -outline-offset-1 outline-gray-200`.
3. **`ColorSwatch`** — generalise from `ConfigTheme.tsx:264-282` (`colorField`). Signature **locked**:
   `ColorSwatch({ label, value, onChange, id? })` — label + native `<input type=color>` + hex readout (uppercase, `tabular-nums`), focus-visible ring `var(--color-primary)`, min touch target 44px. `onChange(hex: string)`.
4. **`AssetPreview`** — NEW (headline deliverable). Signature **locked**:
   ```ts
   AssetPreview({
     label: string;            // visible label, also <img alt>
     value: string | null;     // theme asset path, used verbatim as <img src>
     fit?: 'cover' | 'contain';// default 'cover'; logo uses 'contain'
     aspect?: string;          // tailwind aspect class, default 'aspect-video'
     accept: string;           // passed to file input
     uploading?: boolean;
     error?: string;
     hint?: string;            // small caption under label (e.g. dimension hint)
     onUpload(file: File): void;
     onReset?(): void;         // when present + value set, show reset → "Standard"
     defaultLabel: string;     // text shown on the null/placeholder tile (t('manager:theme.default'))
   })
   ```
   Renders: a fixed-aspect tile (`bg-gray-50`, rounded, outline) containing either `<img src={value} alt={label} loading="lazy" className={'size-full object-' + fit}>` (with `onError` → show placeholder) OR a placeholder (ImageIcon + `defaultLabel`) when `value == null`. Below/beside the tile: the `label` + a real upload control (reuse `Button` look via the existing `clsxUpload` idiom or a `Button`+hidden input — do NOT invent a new button style; mirror `ConfigMedia.tsx:185` Button+hidden-input OR the `ConfigTheme` `clsxUpload` label, pick one and keep AA focus ring) and a reset button when applicable. 8 MiB client size guard (mirror `ConfigTheme.tsx:39`/handleUpload size check) → surface `error`. Icon-only buttons (if any) MUST carry `aria-label` + `title`.
   Must render inside the ConsoleShell tree (tokens available) — it always will.

`console/index.ts`: add named re-exports for `SectionCard`, `SubGroup`, `ColorSwatch`, `AssetPreview` alongside existing.

### A2. Themed scrollbar utility (`packages/web/src/index.css`)
No scrollbar styling exists anywhere. Add ONE utility class (precedent: the `.quiz-range` block at `index.css:269-308`):
```css
.console-scroll { scrollbar-width: thin; scrollbar-color: var(--accent-tint) transparent; scrollbar-gutter: stable; }
.console-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.console-scroll::-webkit-scrollbar-track { background: transparent; }
.console-scroll::-webkit-scrollbar-thumb { border-radius: 9999px; background-color: color-mix(in srgb, var(--color-primary), white 60%); border: 2px solid transparent; background-clip: content-box; }
.console-scroll::-webkit-scrollbar-thumb:hover { background-color: color-mix(in srgb, var(--color-primary), white 35%); }
```
(`scrollbar-gutter: stable` kills layout shift when content overflows.)

### A3. ConsoleShell = single scroll owner (`ConsoleShell.tsx`)
- Add the `console-scroll` class to the tabpanel scroll container (`~line 196-197`, the `overflow-y-auto overscroll-contain p-4 sm:p-6` element). Keep it `overflow-y-auto overscroll-contain` — this is THE single scroller after the tab WPs strip their inner ones.
- No `footer` prop (save-bar uses sticky-bottom inside this scroller — see WP-B1). Do not otherwise restructure ConsoleShell.

### A4. i18n keys — add to ALL 5 locales (`locales/*/manager.json`), keep DE "du", warm, no exclamation marks
- `theme.preview` → DE "Vorschau", EN "Preview", ES "Vista previa", FR "Aperçu", IT "Anteprima" (currently `null` in de).
- `theme.templates.emptyHeadline` → DE "Noch keine Vorlagen", EN "No templates yet", ES "Aún no hay plantillas", FR "Aucun modèle pour l’instant", IT "Ancora nessun modello".
- `theme.aria.preview` (img/region context if needed) — optional; only if a tab references it. Prefer reusing existing slot labels (`theme.logo`, `theme.bgSlots.*`) for `alt`.
- Match existing key ORDER/nesting in each file; verify JSON valid.

---

## WP-B1 — ConfigTheme.tsx (the Design-Tab; the big one). File: `ConfigTheme.tsx` ONLY. Depends on WP-A.
1. **Asset previews (core):** replace `assetRow` (315-354) usage with `<AssetPreview>` (from console) for all 4 slots — logo (`fit='contain'`, neutral tile, `accept` keeps svg+png/jpeg/webp), auth/managerGame/playerGame (`fit='cover'`, `aspect-video`). Pass `value`, `onUpload`→ existing handleUpload, `onReset`→ existing reset handler, `defaultLabel={t('manager:theme.default')}`, `label`/`alt` from `theme.logo`/`theme.bgSlots.*`. Remove the local `assetRow`, `colorField`, `SectionCard`, `SubGroup` defs and import `SectionCard`/`SubGroup`/`ColorSwatch`/`AssetPreview` from console. Remove now-dead local helpers (`uploadButton`/`resetSlotButton`/`clsxUpload`) only if fully superseded by AssetPreview — otherwise keep what's still used.
2. **Single scroll:** remove the inner `overflow-y-auto overscroll-contain` at line 365; root becomes a non-scrolling `flex min-h-0 flex-1 flex-col` and the content a `flex flex-col gap-4` (drop the duplicate `p-6` — ConsoleShell already pads). The ConsoleShell tabpanel now scrolls.
3. **Sticky save-bar:** the Save/Reset footer (590-607) becomes `sticky bottom-0 z-10` within the (now single) tabpanel scroll flow. Bleed full width over the tabpanel padding: `-mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 py-3`, `border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80`. Add bottom spacing on content so the last card isn't hidden behind the bar.
4. **Balanced grid:** replace `grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start` (375) with a balanced layout: pair the two short color cards (UI-Farben + Antwort-Farben) in one row; let the now-taller Hintergründe card (with previews) span full width (`xl:col-span-2`). Use `xl:auto-rows-fr` OR explicit col-spans so there are no ragged empty gaps. Branding card sized sensibly.
5. **Vorlagen empty-state:** replace bare `<p>` (534-537) with `<EmptyState icon={BookMarked} headline={t('manager:theme.templates.emptyHeadline')} hint={t('manager:theme.templates.none')} />` (BookMarked already imported).
6. **Grouping tidy:** wrap `showBranding` checkbox (404-414) in `Field`/`SubGroup` so it isn't a stray control; visually separate the answer text-color swatch from the 4 A/B/C/D answer swatches (divider or own SubGroup) using `ColorSwatch`.
7. Keep contrast/`--accent-contrast` logic intact; keep reduced-motion gate; keep all existing functions working (title, logo upload/reset, footer toggle, colors, scrim, bg upload/reset, templates save/apply/delete).

## WP-B2 — ConfigAI.tsx (the rawest tab). File: `ConfigAI.tsx` ONLY. Depends on WP-A. NO provider/price/AI-feature change.
1. **Single scroll + no double-pad:** root (199) and null-state wrapper (181-189) → `flex min-h-0 flex-1 flex-col gap-4` (drop `overflow-y-auto`, drop `bg-gray-50`, drop `p-6`). Let ConsoleShell scroll.
2. **Cards:** replace the 3 hand-rolled `<section>` cards (207/327/353) + bespoke `<header>` (200-205) with `<SectionCard icon title description>` from console (consistent rounded-2xl + shadow + accent icon-chip). Wrap the read-only image-provider list (336-350) and the API-key block (265-308) in `SubGroup` so passive info reads as sunken panels.
3. **Fields:** replace raw `<label><span>…</span><Input/></label>` and the provider `<select>` (217/219/235/250/280/362/372) with `<Field label>` from console.
4. **Inline feedback (a11y):** keep toasts, but also render an inline status row in an `aria-live="polite"` region — under the "Verbindung testen" button wire the existing-but-unused `ai.testOk`/`ai.testFailed` keys (store last test outcome in state, green/gray pill); for generation surface inline "Generiere…" progress + on-success inline confirmation (existing `ai.generate.generated`/`notConfigured`/`openInEditor` keys). No new i18n keys.
5. Null/not-configured first paint → `EmptyState` (icon `Sparkles`).

## WP-B3a — Media + Catalog. Files: `ConfigMedia.tsx`, `ConfigCatalog.tsx` ONLY. Depends on WP-A (EmptyState exists already).
- **ConfigMedia:** remove the grid's `overflow-y-auto overscroll-contain` (255) — let ConsoleShell scroll (keep the grid, keep `auto-rows-min`/responsive cols). Replace the bare no-results `<p>` (263-265) with `<EmptyState icon={SearchX} headline={t('manager:media.noResults')||…} hint action={clear filters}>`. (Reuse existing media i18n; only add a key if truly missing — prefer existing.)
- **ConfigCatalog:** remove BOTH inner scrollers (115 outer + 416 inner) — collapse to a single non-scrolling `flex min-h-0 flex-1 flex-col`; the list area no longer self-scrolls. Replace the filtered-empty raw gray `<p>` (423-426) with `<EmptyState icon={SearchX} headline={t('manager:catalog.noResults')} hint=…/>`. For the Edit/Delete row actions (474-496) switch to the ListRow icon-action visual language: `Button variant='ghost' size='icon'` with BOTH `aria-label` + `title` (destructive red hover for delete); keep the delete inside its AlertDialog trigger (do not call socket delete directly).
- Optional widescreen: wrap catalog cards in `grid-cols-1 2xl:grid-cols-2` (only catalog; not submissions). Keep it simple if risky.

## WP-B3b — remaining tabs scroll + small polish. Files: `ConfigSubmissions.tsx`, `ConfigResults.tsx`, `ConfigDisplay.tsx`, `ConfigSelectQuizz.tsx`, `ConfigManageQuizz.tsx` ONLY. Depends on WP-A.
- Remove the redundant inner `overflow-y-auto overscroll-contain` so ConsoleShell is the sole scroller, in: `ConfigSubmissions.tsx:289`, `ConfigResults.tsx:86`, `ConfigDisplay.tsx:22`, `ConfigSelectQuizz.tsx:67`, `ConfigManageQuizz.tsx:155`. Keep `min-h-0 flex-1 flex-col` so panels still fill. (These tabs' inner list uses `p-0.5` for focus-ring clearance — that's fine, only drop the overflow utilities.)
- **ConfigSubmissions:** add an `action` to the empty-state (274-284) pointing to the Katalog tab (reuse an existing label key — do NOT add new i18n). Add `title=` to any icon-only action that has only `aria-label`. Preserve the two-source meta/full merge (line 163 meta vs 171/186 full fetch) and inline edit/preview/approve flows.
- **ConfigResults:** clamp the entrance stagger to `Math.min(index, 8) * 0.04` (101). Optionally add an empty-state `action` to the Play tab (reuse label). Don't modify ListRow.
- **ConfigManageQuizz / ConfigSelectQuizz / ConfigDisplay:** scroll-removal only (+ ConfigDisplay may keep its steps list; no EmptyState rewrite required).

---

## Verify recipe (orchestrator gates centrally — workers do NOT build)
1. `corepack pnpm -r run types`
2. `corepack pnpm --filter socket test`
3. `corepack pnpm --filter web build`
4. Ad-hoc E2E (MCP Playwright) on dev/preview :3000 (no in-repo Playwright config): login `/manager` → `/manager/config`, Design-tab: scroll, all 4 asset previews visible, sticky Save/Reset usable, no horizontal scrollbar at mobile width, console scrollbar themed; check KI/Media/Catalog/Submissions/Results render + no new console errors.

## Acceptance (from issue #10)
Balanced Design-tab @1440 + wide; mobile 1-col no horizontal scroll; save-bar never hides fields; single integrated themed scrollbar (no nested trap); real previews for logo + auth/managerGame/playerGame (or clear "Standard"); existing theme functions intact; Media/Design share asset URLs, no broken images, no private-file exposure; icon-only actions have aria-label + tooltip; no secrets leaked.
