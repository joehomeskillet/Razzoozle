# Razzoozle Design System

> **Canonical design-system reference.** Read this at the start of EVERY UI task and check every UI change against it. This document exists to stop "design drift" — the recurring class of bugs where text rendered white on cream, dark/glass surfaces leaked onto the flat design, wrong text colors appeared on filled chips, and hardcoded hex was used instead of tokens.

---

## 1. North Star

Flat **"cream"** design. Two-field system:

- **Cream (front-of-house)** — `--color-field-cream: #F4F1EA`. Landing, lobby, player phone, trophies, join/auth.
- **Ink (stage)** — `--color-field-ink: #0E1120`. Stage token for shared result `/r/:id`. **NOTE (ground truth):** manager / display / podium / recap are now **CREAM-converted** — `GameWrapper` forces ink `--game-fg` + the `cream-field` background for **both player and manager** (`index.css` ~line 551 + `GameWrapper.tsx` ~line 154). The older "manager/kiosk stays dark, `--game-fg` = white" model is **superseded**.

Identity comes from the **violet brand**, the **"Zig" logo motif**, and **motion** — NOT from glass/blur. The app is **flat only**; the glass/liquid-glass theme system was **fully removed** (2026-07-17, deep-removal — see §6). Do not reintroduce it.

**Canonical accent = AMBER `#ff9900`.** The live/canonical accent default is amber `#ff9900`, set by the `packages/common` theme defaults (`types/theme.ts` + `validators/theme.ts` → `accentColor`) and applied at runtime by `applyTheme`. The `#FF2D6E` value in `index.css` (`@theme { --color-accent }`) is an **unused static seed only** — it is NOT the live accent and is overwritten on every theme apply. (Decision: amber stays.)

---

## 2. The Non-Negotiable Guardrails

Check these on every change. The three load-bearing ones first.

- [ ] **1. No `backdrop-blur` / `backdrop-filter` / `@supports backdrop-filter` anywhere in shipped code.** It breaks on cream, on mobile, and on Pi. A code review MUST grep for it and reject any hit.
      `grep -rniE 'backdrop-blur|backdrop-filter|@supports.*backdrop' packages/web/src`
- [ ] **2. No hardcoded hex colors in components.** Every color flows from a CSS custom property / theme token (see §3). Hardcoded `bg-[#...]`, `text-white` on a colored fill, `border-gray-300`, `bg-black/30` are drift.
- [ ] **3. Every answer tile carries a 1px hairline ring** (`border: 1px solid var(--border-hairline)`). The bright answer fills fail WCAG 1.4.11 against cream — the ring + shape icon are the non-color separators. No ring = drift.

Then the rest:

- [ ] **4. In-game foreground text uses `var(--game-fg)`.** `--game-fg` is **STATIC (no theme field)** and is set by the **shell**. The shipped game shells — `GameWrapper` (player **and** manager) and `solo.tsx` — force `--game-fg: #0E1120` (dark ink) because manager/display/podium/recap are now cream-converted. The bare `:root` default is WHITE (`#ffffff`), so any NEW shell that shows text on cream and forgets to set `--game-fg` renders invisible white text. (This exact bug hit solo mode.) **Always set `--game-fg: #0E1120` on a new cream game shell.**
- [ ] **5. Never white text on these cream-side fills** (all fail contrast): state-correct green, state-wrong red, tier gold/silver/diamant, amber accent. Use ink text (`--answer-text: #0B0B12`). White is allowed ONLY on **bronze**, on the **violet primary**, and on the **podium/stage** (accepted STAGE convention).
- [ ] **6. No dark surfaces on the cream field.** On cream use `bg-white` + `--shadow-flat`; on ink use the stage surface. Never `bg-black/X` on an **in-flow cream surface/card**. **Carve-out:** `bg-black/X` is allowed on `position: fixed` full-screen **modal/dialog overlay scrims**.
- [ ] **7. Scrim must be 0 in flat** (`--bg-scrim`). The legacy black scrim over a gradient murks the cream.

---

## 3. Color Tokens

**Source of truth:** `packages/web/src/index.css` (`:root` + `@theme`) + `packages/common/src/validators/theme.ts`.
Components must read the CSS var — **never the literal**.

**RUNTIME-themeable vs STATIC.** Two classes of token exist:

- **RUNTIME-themeable (manager-tunable, applied by `applyTheme`):** brand primary / secondary / text / **accent**, answer fills + answer text, `--radius-theme`, `--bg-scrim`, teams, tiers, state, rank, `--timer-urgent`, streak, `--surface-muted`, footer. Defaults live in `packages/common` (`types/theme.ts` + `validators/theme.ts`); `apply.ts` writes the served theme over the `:root` defaults at runtime.
- **STATIC — `:root`-only, NOT manager-tunable:** `--surface`, `--border-hairline`, `--shadow-flat`, `--color-field-cream`, `--color-field-ink`, `--accent-contrast-text`, `--game-fg`. These have **no theme field**; they are fixed in `index.css` (`--game-fg` is set by the shell — see §3 *Brand / Fields* + §1). Tagged **STATIC** in the tables below.

### Brand / Fields

| Token | Value | Use / Rule |
|---|---|---|
| `--color-primary` | `#7c3aed` | Violet, primary CTA. **White text OK.** |
| `--color-secondary` | `#2e1065` | Dark ink, headings. |
| `--color-accent` (amber) | runtime `#ff9900` | **RUNTIME-themeable.** Canonical accent default `#ff9900` (set in `packages/common` + `applyTheme`). The `#FF2D6E` in `index.css @theme` is an unused static seed, overwritten on apply. Use ink/contrast text on accent fills (`--accent-contrast-text`); **NEVER white-on-accent on cream surfaces** (podium/stage white-on-accent is an accepted STAGE convention — see §7). ⚠️ |
| `--color-field-cream` | `#F4F1EA` | **STATIC (`:root`-only).** Front-of-house background. |
| `--color-field-ink` | `#0E1120` | **STATIC (`:root`-only).** Stage background. |
| `--game-fg` | `:root` default `#ffffff`; **shell sets `#0E1120`** | **STATIC (no theme field).** Set by the shell, not the theme. `GameWrapper` (player **and** manager) and `solo.tsx` force `--game-fg: #0E1120` (ink) for the cream-converted game surfaces. Any NEW cream shell MUST set `--game-fg: #0E1120` itself — the bare `:root` default is white and renders invisible on cream. ⚠️ |

### Surfaces

| Token | Value | Use / Rule |
|---|---|---|
| `--surface` | `#FFFFFF` | **STATIC (`:root`-only).** Cards / surfaces on cream. |
| `--border-hairline` | `#E2DDD2` | **STATIC (`:root`-only).** The WCAG 1.4.11 separator (answer-tile ring). ⚠️ |
| `--shadow-flat` | (recipe) | **STATIC (`:root`-only).** Single shadow rung — a recipe, **not** a ladder of elevations. |
| `--radius-theme` | `16px` | **RUNTIME-themeable.** Standard corner radius. (Radius *utilities* across buttons/inputs are inconsistent — catalog-only, not mass-rewritten this pass; see §7.) |
| `--bg-scrim` | `0` (in flat) | **RUNTIME-themeable.** Keep at 0; legacy scrim murks cream. |
| `--accent-contrast-text` | `#0E1120` | **STATIC (`:root`-only).** Ink text on accent fills. |

### Toast / overlay cards

One shared card recipe: `bg-white` + `rounded-[var(--radius-theme)]` + 1px `--border-hairline` + a 4px **left accent border** + ink text. Used by `ScoreToast` (solo points), `RewardRow` (achievements), and any flat overlay. In solo the two top-center cards must read identically: pass `tone="toast"` to `RewardStack`/`RewardRow` so the achievement card matches `ScoreToast`'s metrics (`px-5 py-3`, `shadow-xl`); the compact `shadow-md` default stays for the multiplayer result stack.

### Answer Tiles

**Rule:** 1px hairline ring + shape icon + ink label on every tile.

| Token | Value | Use / Rule |
|---|---|---|
| `--answer-1` | `#E69F00` | Tile fill. |
| `--answer-2` | `#56B4E9` | Tile fill. |
| `--answer-3` | `#3DBFA0` | Tile fill. |
| `--answer-4` | `#CC79A7` | Tile fill. |
| `--answer-text` | `#0B0B12` | **RUNTIME-themeable.** Uniform ink label across all tiles. Runtime default is now ink `#0B0B12` (`packages/common` `answerTextColor`), matching the static `index.css` `--answer-text`; previously drifted to white. ⚠️ |

**On reveal — answer tiles recolor by correctness.** The tile fill switches to the **state colors**: `--state-correct` (green) if correct, `--state-wrong` (red) if wrong. The **ink label** (`--answer-text`) and the **hairline ring** are retained (white on green/red fails contrast — guardrail #5). Host reveal (`Responses.tsx`) drives this through `AnswerButton`'s `correct` prop; the solo picked tile (`SoloAnswers.tsx`) applies `!bg-[var(--state-correct)]` / `!bg-[var(--state-wrong)]` directly. Answer tiles must **not** disappear on reveal — they recolor in place.

### Teams

Derived: `-ring` = `color-mix` black 32%, `-text` = `color-mix` black 55%.

| Team | Base | Use / Rule |
|---|---|---|
| red | `#ef4444` | Team color; use derived `-text` for labels. |
| blue | `#3b82f6` | Team color; use derived `-text` for labels. |
| green | `#22c55e` | Team color; use derived `-text` for labels. |
| yellow | `#facc15` | Team color; use derived `-text` for labels. |

### Tiers — CRITICAL label colors

**Never white on gold / silver / diamant.**

| Tier | Fill | Label | Contrast |
|---|---|---|---|
| bronze | `#b45309` | **WHITE** label | 5.02:1 ✅ |
| silver | `#9ca3af` | **INK** label | 7.39:1 ✅ ⚠️ |
| gold | `#eab308` | **INK** label | 9.78:1 ✅ ⚠️ |
| diamant | `#38bdf8` | **INK** label | 8.75:1 ✅ ⚠️ |

### State — ink text only

| State | Fill | Rule |
|---|---|---|
| correct | `#22c55e` | **INK text.** White fails (2.28:1). ⚠️ |
| wrong | `#ef4444` | **INK text.** White fails (3.76:1). ⚠️ |

`--state-correct-soft` / `--state-wrong-soft` (`color-mix`, 78% transparent) are the soft washes for distribution bars and backgrounds. On answer reveal the tile fill itself switches to the solid state colors — see **Answer Tiles** above.

### Rank / Misc

| Token | Value | Use / Rule |
|---|---|---|
| `--rank-up` | `#10b981` | Rank-improved indicator. |
| `--rank-down` | `#f43f5e` | Rank-dropped indicator. |
| `--timer-urgent` | `#ff3b30` | Timer urgency color. |
| `--streak-color` | `#b45309` | Streak indicator. |
| `--surface-muted` | `#374151` | Muted surface. |
| `--footer-bg` | `#ffffff` | Footer background. |
| `--footer-text` | `#1f2937` | Footer text. |

---

## 3·B Component Inventory (Tailwind)

Pre-planned components — **compose UI from these, never freehand.** Every class is
a **Tailwind 4 utility bound to a §3 token** (no `tailwind.config`; tokens live in
`index.css @theme` + `:root`). Read a token via arbitrary value
(`bg-[var(--answer-1)]`), never a literal hex. All entries already obey §2.

**Buttons**
- Primary CTA — `inline-flex items-center justify-center px-5 py-3 rounded-[var(--radius-theme)] bg-[var(--color-primary)] text-white shadow-[var(--shadow-flat)]` · white text OK here only (violet) + bronze + stage.
- Accent — `… bg-[var(--color-accent)] text-[var(--accent-contrast-text)] …` · ink text on amber, never white-on-accent on cream.
- Ghost — `… bg-[var(--surface)] text-[var(--game-fg)] border border-[var(--border-hairline)] shadow-[var(--shadow-flat)]`.

**Surface card (cream)** — `bg-[var(--surface)] rounded-[var(--radius-theme)] border border-[var(--border-hairline)] shadow-[var(--shadow-flat)] text-[var(--game-fg)]` · no `bg-black/X` in flow, no `backdrop-blur`.

**Toast / overlay card** — the one shared recipe: `bg-white rounded-[var(--radius-theme)] border border-[var(--border-hairline)] border-l-4 border-l-[var(--color-accent)] px-5 py-3 shadow-xl text-[var(--answer-text)]`. Solo top-center cards (`ScoreToast`, achievement `RewardRow` `tone="toast"`) must match; portal to `document.body`, `fixed` top-center.

**Answer tile** — `relative flex items-center gap-3 px-4 py-3 rounded-[var(--radius-theme)] bg-[var(--answer-N)] text-[var(--answer-text)] border border-[var(--border-hairline)]` + a shape icon (the non-color separator). On reveal: swap fill to `bg-[var(--state-correct)]` / `bg-[var(--state-wrong)]` **in place**, keep ring + ink label — never animate out.

**Input** — `w-full px-4 py-3 rounded-[var(--radius-theme)] bg-[var(--surface)] text-[var(--game-fg)] border border-[var(--border-hairline)]`; PIN/numerals add `[font-variant-numeric:tabular-nums_slashed-zero]`.

**Modal / dialog** — `fixed inset-0` scrim `bg-black/40` (the **only** sanctioned dark fill — fixed overlays only) + centered panel = the surface card. No blur.

**Leaderboard row** — `flex items-center justify-between px-4 py-2 rounded-[var(--radius-theme)] bg-[var(--surface)] border border-[var(--border-hairline)] text-[var(--game-fg)]`; rank delta `text-[var(--rank-up)]` / `text-[var(--rank-down)]`; numerals tabular.

**Tier badge** — `inline-flex px-2 py-0.5 rounded-full text-sm` + fill per §3 tier token: bronze → `text-white`; silver / gold / diamant → `text-[var(--answer-text)]` (ink, **never white**).

**Team chip** — `bg-[var(--team-…)] text-[var(--team-…-text)]` — the derived ink label, never the raw base for text. (Exact token names per §3 Teams / `index.css @theme`.)

**Timer** — `[font-variant-numeric:tabular-nums_slashed-zero]`; at urgency swap to `text-[var(--timer-urgent)]`.

**Footer** — `bg-[var(--footer-bg)] text-[var(--footer-text)]`.

> Mockups (`stack-plan` §4) compose **only** from this list, in Tailwind, using
> these token-bound classes — so a wireframe is on-brand and on-spec by
> construction. New component? Add it here first (token-bound, guardrail-clean),
> then use it. The idea is BeerCSS / DaisyUI "every element ready" — but
> self-hosted, your tokens, your guardrails. The libraries are the *example*,
> not a dependency.

---

## 4. Typography

- **Font: Rubik Variable** (`@fontsource-variable/rubik`), via `--font-display`. Body uses the Tailwind sans default; display/headings use Rubik; stage marquee uses Rubik weight 800. **No serif, no Inter/Roboto/Helvetica.**
- **All numerals** (score, timer, rank, PIN) use `font-variant-numeric: tabular-nums slashed-zero` to prevent reflow on update.

---

## 5. Tailwind 4 Note

There is **no `tailwind.config` file** — config lives in the `@theme` block in `packages/web/src/index.css`. New brand colors go **there** or as `:root` custom properties — **not inline**.

---

## 6. Glass System — Removed (flat only)

The violet liquid-glass theme system has been **fully removed** (2026-07-17, deep-removal; SDD `docs/sdd/manager-ui-ux-refactor/`). What was deleted:

- the gated `[data-theme-style="glass"]` CSS block in `index.css` (`.glass`, `.glass-1/2/3`, `.glass-bg`, `.glass-interactive`, frost tokens);
- the theme `style` field (validator enum + `DEFAULT_THEME`) — a `Theme` no longer has `.style`;
- the glass treatment + glass docs in the skeleton engine (`skeleton-demo.ts` / `skeleton-doc.ts`);
- the dead `manager.theme.style` (flat/glass) picker labels in all 6 locales.

**Flat is the only style.** `applyTheme` keeps a **constant** `document.documentElement.dataset.themeStyle = "flat"` on `<html>` — a stable, documented `[data-theme-style="flat"]` author hook that matches the constant the skeleton demo/doc emit. There is no glass value or toggle anywhere.

**Back-compat:** an old persisted `theme.json` carrying `style: "glass"` still parses — zod strips the now-unknown key (no `.strict()`) — and renders flat. Verified by `packages/common/src/validators/theme.test.ts`.

**Do not reintroduce** `backdrop-filter`, `.glass*` classes, or a `data-theme-style="glass"` value on any surface (§2 guardrail #1 still applies).

---

## 7. Drift Anti-Patterns — Review Checklist

| Anti-pattern | Why it breaks | The rule (+ grep) |
|---|---|---|
| White text on cream (forgot `--game-fg`) | Default `--game-fg` is white → invisible text on cream (hit solo mode) | Set `--game-fg: #0E1120` on every cream shell. |
| `backdrop-blur` in shipped code | Breaks on cream, mobile, Pi | Zero hits. `grep -rniE 'backdrop-blur\|backdrop-filter' packages/web/src` |
| Hardcoded hex in component | Bypasses theme engine; can't be retuned at runtime | Read the CSS var. `grep -rnE 'bg-\[#\|text-\[#\|#[0-9a-fA-F]{6}' packages/web/src/**/*.tsx` |
| White label on gold/silver/diamant/state/coral | All fail WCAG | Ink label (`--answer-text: #0B0B12`); white only on bronze + violet primary. |
| Missing hairline on answer tiles | Bright fills fail 1.4.11 against cream | `border: 1px solid var(--border-hairline)` + shape icon on every tile. |
| Dark `bg-black/X` on an **in-flow cream surface/card** | Dark surface leaks onto flat field | `bg-white` + `--shadow-flat` on cream; stage surface on ink. **Carve-out:** `bg-black/X` IS allowed on `position: fixed` full-screen **modal/dialog overlay scrims** — forbidden only on in-flow cream surfaces/cards. `grep -rn 'bg-black/' packages/web/src` then exclude fixed full-screen overlay scrims. |
| Unbound scrim | Legacy black scrim murks cream | `--bg-scrim: 0` in flat. |
| `glass-*` class or `data-theme-style="glass"` | The glass system is **removed** (§6) — any reintroduction is drift | Zero glass in shipped code. `grep -rniE 'backdrop-filter\|\.glass-\|data-theme-style="glass"' packages/web/src packages/common/src` (only the `logo.svg` brand comment + the back-compat test's `style:"glass"` input are allowed). |
| Meta/copy still saying "liquid-glass" | Stale brand language contradicts flat North Star | Component comments cleaned (2026-07-17); the gated-glass `index.css` banner no longer exists (block deleted). The remaining `assets/logo.svg` "liquid-glass edge-highlight" comment describes a permanent brand highlight (not the removed theme) — leave it. |
| `position: fixed` overlay placed inside `SoloShell` | SoloShell's transformed / overflow-hidden wrapper becomes the containing block → the toast clips or its `z-index` is re-scoped (the in-flow achievement-badge regression) | Portal solo overlays to `document.body`. Both `ScoreToast` (points) and `SoloRewardToast` (achievements) do this, fixed top-center; the achievement stack sits just below the points card. |
| Answer tile vanishes on reveal | Tiles must recolor in place (green/red), not animate out | On reveal the tile keeps its position + ring and only swaps fill to `--state-correct` / `--state-wrong`. See §3 Answer Tiles. |

**Accepted / future-work (not drift):**
- **Podium / stage white-on-accent** is an accepted intentional **STAGE** convention (ink-text rule is for *cream* surfaces).
- **Radius utilities** across buttons/inputs are inconsistent — catalogued, **not** mass-rewritten this pass.
- **Emoji-as-icons** in recap / landing is **future work**, not a current guardrail failure.
- **Modal/dialog overlay scrims** (`bg-black/X` on `position: fixed` full-screen overlays) are allowed — only in-flow cream surfaces/cards must avoid dark fills.

---

## 8. Before You Merge UI (quick gate)

1. Set `--game-fg` on any new cream shell (`#0E1120`).
2. Grep `backdrop-blur` / `backdrop-filter` → must be **zero**.
3. No component-level hex — everything via token.
4. Answer tiles have the 1px hairline ring + shape icon.
5. Tier / state / coral use **ink** text (white only on bronze + violet primary).
6. Preview on **BOTH** cream and ink fields.
7. Verify against this document.

---

## 8·B Console (Backstage)

The admin console is the **backstage manifestation** of the same flat design language as the stage. It applies identical focus, radius, status, and spacing rules — but with its own isolated light-violet surface palette. The `.console-shell` wrapper pins the brand tokens (violet primary / secondary / amber accent) to fixed Razzoozle defaults, ensuring that uploaded game themes never recolor the admin interface.

**North Star:** Hierarchy through depth (surface layers), not glass or blur. All interactive elements follow stage guardrails. Backwards-compatible with the flat-field system (§1).

> **Normative surface contract — Manager / Console**
>
> **Allowed component families:** ListRow, SectionCard, Badge, BulkActionToolbar, LabelRow, ToggleField, FilterPill, OverflowMenu, NavItem, EmptyState
>
> **Tokens:** Console-pinned (`--color-primary` `#7c3aed`, `--color-accent` `#ff9900`), console surfaces (`--surface-*`, `--ink-*`)
>
> **Explicit prohibition:** Manager components (ListRow, console tokens, SectionCard) NEVER appear in Game views (Player, Lobby, Leaderboard, Results). Game-answer-tiles, Game-tokens (`--answer-N`, state colors) NEVER used in Manager. The two palettes are incompatible.

---

### Console Tokens

**Source of truth:** `packages/web/src/features/manager/components/console/tokens.css` (derived from `--color-primary` via `color-mix`) + `packages/web/src/index.css` (`:root` base).

**RUNTIME-themeable vs PINNED.** Two classes of token within the console:

- **RUNTIME-themeable (elsewhere in app):** `--accent-tint`, `--accent-contrast` auto-derive from the themed `--color-primary` on the stage. **Inside `.console-shell`**, these re-derive from the **pinned primary `#7c3aed`** instead, staying amber even when the design tab recolors the game.
- **STATIC (`:root`-only, never themed):** Ink family, surface family, line, ring-selected, state colors. The `.console-shell` mechanism does NOT re-pin these — they remain the console's light palette everywhere.

#### Brand / Fields (Console-Pinned)

| Token | Value | Use / Rule |
|---|---|---|
| `--color-primary` (pinned) | `#7c3aed` (fixed in `.console-shell`) | Violet, primary CTA. White text OK. **NOT themed.** |
| `--color-secondary` (pinned) | `#2e1065` (fixed in `.console-shell`) | Dark ink, headings. **NOT themed.** |
| `--color-accent` (pinned) | `#ff9900` (fixed in `.console-shell`) | Amber accent default. **NOT themed.** Use ink/contrast text on fills; white-on-amber violates §2 Guardrail #5. ⚠️ |
| `--accent-tint` | `color-mix(in srgb, var(--color-primary), white 88%)` | Soft wash for active nav rows + header band. Re-derived from pinned primary. |
| `--accent-contrast` | `color-mix(in srgb, color-mix(in srgb, var(--color-primary), black 34%), #1f2937 12%)` | Darkened primary for white text + icon legibility on nav fills. Re-derived from pinned primary. |

#### Surfaces / Line (Console Palette)

| Token | Value | Use / Rule |
|---|---|---|
| `--ink` | `#111827` | **STATIC.** Primary text on all console surfaces (NavItem labels, card headings, body copy). Equivalent of `--game-fg` on stage. |
| `--ink-muted` | `#374151` | **STATIC.** Secondary labels (metadata, muted rows). |
| `--ink-medium` | `#4b5563` | **STATIC.** Mid-tone text (form hints, timestamps). |
| `--ink-subtle` | `#6b7280` | **STATIC.** Tertiary text (disabled states, footer copy). |
| `--ink-faint` | `#9ca3af` | **STATIC.** Lightest text (placeholder, very subtle accents). |
| `--surface-2` | `#f9fafb` | **STATIC.** Subtle background wash (list row hover, alternating row fills). Replaces `bg-gray-50`. |
| `--surface-3` | `#f3f4f6` | **STATIC.** Filled card surface (SectionCard base, ListRow default). Replaces `bg-gray-100`. |
| `--surface-4` | `#e5e7eb` | **STATIC.** Elevated surface (modal panels, popovers, inset cards). Replaces `bg-gray-200`. |
| `--surface-5` | `#d1d5db` | **STATIC.** Toggle / interactive hover step. Replaces `bg-gray-300` for toggle tracks, badge hover, and stepwise-elevation surfaces. Use for hover-state fills where `--surface-4` is the idle state. ⚠️ |
| `--line` | `#e5e7eb` | **STATIC.** Hairline borders, dividers (ListRow separator, form boundaries). ⚠️ Contrast `--line` on `--surface-3` = 1.09:1 — fails WCAG 1.4.11 for meaning-bearing distinctions; acceptable only as decorative divider. Meaning-bearing boundaries require additional spacing or fill contrast. |
| `--ring-selected` | `rgb(255 255 255 / 0.8)` | **STATIC.** Focus ring on dark backgrounds; console surfaces are light, so this is rarely needed. Replaces `ring-white/80`. |

#### State Colors (W0-2, defined in console/tokens.css)

Used for status badges, indicators, and distribution. All pass AA for normal text.

| State | Fill | Text | Contrast |
|---|---|---|---|
| Online | `--status-online-bg: #dcfce7` | `--status-online-text: #166534` | 6.5:1 ✅ |
| Offline | `--status-offline-bg: #fee2e2` | `--status-offline-text: #991b1b` | 6.8:1 ✅ |
| Pending | `--status-pending-bg: #fef3c7` | `--status-pending-text: #92400e` | 6.4:1 ✅ |

Pattern: always pair `-bg` with `-text`; never white text. `--status-*` replaces scattered `bg-green-*`, `bg-red-*`, `bg-amber-*` in the console today (F7, F8 from SDD).

**Reference:** `--state-wrong-soft` and `--state-correct-soft` (from stage §3, used for distribution bars + soft hover backgrounds on console form rows) resolve to `color-mix(in srgb, var(--state-wrong/correct), transparent 78%)`.

---

### Normative Design Rules (D1–D18)

**D1 — Token-only colors.** Every color in the console flows via CSS custom property. Forbidden Tailwind classes in the manager tree (grep-gated in W0-3): `*-gray-*` · `*-red-*` · `*-green-*` · `*-amber-*` · `*-blue-*` · `bg-white` · `text-white` (except documented scrims, see D10). All palette remnants migrate to token names (`--surface-*`, `--ink-*`, `--status-*`). ⚠️

**D2 — EINE Schreibweise: arbitrary-value token syntax.** `bg-[var(--surface)]`, `text-[var(--ink)]`, etc. Short utilities like `bg-primary` or `focus-visible:border-primary` (auto-generated by Tailwind v4 from `@theme`) function but are **standardized to var-syntax** for grep-clarity and consistency with stage. One token, one canonical class. Migrate 28 existing short-form uses.

**D3 — Status-token family covers all state badges.** DisplayStatusCard, StatusBadge, ConfigAI, ResultModalAnswers, and any indicator replace hardcoded green/red/amber with `bg-[var(--status-online-bg)] text-[var(--status-online-text)]` (and offline/pending variants). Status indicators must always pair fill + text (never color-only).

**D4 — Destruktive standard (hover intent).** Rows, cards, and form inputs that delete/archive/reset apply `hover:bg-[var(--state-wrong-soft)] hover:text-[var(--state-wrong)]` on hover (using the soft wash from stage). This signals destructive intent without brightening to crimson. Documented exception-marker: `token-ok: destructive-intent` if special hover UX is justified.

**D5 — Surface hierarchy, never `bg-white`.** Use only `bg-[var(--surface)]` (the white-level base, used sparingly), `bg-[var(--surface-2)]` (list row hover), `bg-[var(--surface-3)]` (card fills), `bg-[var(--surface-4)]` (modals/popovers). All token-driven; no literal `bg-white` in flow. **Carve-out:** fixed modal/dialog scrims (D10) are allowed `bg-black/40`.

**D6 — Ink-on-fill rule (Guardrail #5 adapted for console).** Never white text on colored fills. On status badges (green/red/amber) and accent fills, use `text-[var(--ink)]` or the dedicated status `-text` token. White text is allowed **only** on the pinned violet primary (`--color-primary: #7c3aed`), on `--accent-contrast` (darkened primary, intentionally lowered for AA white-text legibility; see Console Tokens table), or on stage (accepted STAGE convention, not console).

**D7 — EINE Focus-Formel für ALLE interaktiv.** Every button, input, select, date, nav item, and icon button carries:
```
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]
```
Legacy ring variants (`:ring`, `:ring-primary`, etc.) migrate to this outline formula. Scrims + date pickers + multi-select get the same treatment. One formula, tested on light + dark, keyboard-navigable.

**D8 — Touch-targets ≥44px on mobile.** `min-h-11 min-w-11` (44px) for all interactive elements in mobile viewports (<600px). Desktop-dense toolbars (NavBar, filter pills) may use 36px (`min-h-9`) only with documented exception (`token-ok: toolbar-density-36`). Label/FilterPill, close buttons, and select heights enforce minimum. ⚠️

**D9 — Radius scale, 2 levels.** Primary surfaces (cards, dialogs, large buttons) use `rounded-[var(--radius-theme)]` (16px, pinned in console). Compact rows, chips, badges, and tightly-spaced UI use `rounded-lg` (8px). No xl/2xl. Migrate 161 existing lg/xl/2xl occurrences into this two-level system.

**D10 — Dialog standard = Radix Dialog + uniform scrim.** All modal/dialog overlays use Radix Dialog (focus-trap, Escape-to-close, return-focus) with `bg-black/40` scrim (the only sanctioned dark fill, fixed overlay only). Replaces custom div + manual escape handlers + scattered `bg-black/50` / `bg-black/30` inconsistency. (See §2 Guardrail #6 carve-out.)

**D11 — Primitives mandatory.** Compose from existing inventory: ListRow (table rows), SectionCard (section containers), EmptyState (zero-state screens), FilterPill (filter/tag UI), Badge/StatusBadge (labels), PageHeader (page titles), NavItem (navigation), SubGroup (nav grouping). No handmade row lookalikes or card re-implementations. Adopt vs. refactor; migrate ClassList + StudentList to ListRow (D13, W5).

**D12 — Mobile-nav grouping (IA structure).** Below 600px breakpoint: Drawer/Sheet navigation with 4 grouped sections + SubGroup primitive. **Groups + Items (exact ordering for W0-1 documentation):**
1. **Spielbetrieb/Operations** — Play, Running Games, Results, Achievements
2. **Inhalte/Content** — Quiz, Catalog, Media, Suggestions
3. **Schule/School** — Classes, Student management, Fächer (Labels)
4. **System** — Design, Mode, AI, Satellite, User Management, My Profile, Dev

The **Schule/School** group renders **only when Klassen-Modus (System → Mode) is active**; its three items (Classes, Student management, Labels) are `gated: "klassenEnabled"`, so the empty group auto-hides when the mode is off. **User Management moved to System (2026-07-17) and is ungated — always visible, independent of Klassen-Modus** (it is a general admin function, not a school-only one).

18 flat nav items collapse into this 4-group hierarchy. Desktop rail preserves grouping via SubGroup primitive.

**D13 — List-action pattern (<600px).** Rows in lists show max. 1–2 primary actions inline; overflow goes to ⋮ menu. **Title stays always visible** (`min-w-0 flex-1 truncate` + guaranteed minimum row width). Mobile screenshot in `manager-uiux-review/03-quiz--mobile.png` shows the problem (title vanished, width:0). Fixes W3-1 + W1-4.

**D14 — Primary-action placement = ActionFooter.** Every tab-level screen docks its primary actions (Create, Import, Start, Save, bulk actions) into the shared `ActionFooter` (`components/ui/ActionFooter.tsx`) at the bottom — the pattern the Play tab establishes (Start game / Copy solo link). Top-of-list creation bars or header-corner create buttons are a D14 violation; list content scrolls with `scroll-padding-bottom: 5rem` above the footer. Actions must never float **over** content (F5 regression: Play-Tab buttons obscured cards) — the rule bans floating overlays, not placement: header actions that sit in normal document flow (in-flow, non-floating) are conformant ONLY for secondary/utility actions (refresh, filter, view toggles), never for the screen's primary action. Fixes W3-3; re-affirmed 2026-07-17 (Quiz tab violated this with a top creation bar — every list screen migrates to ActionFooter in wave P3).

**D15 — Form standard.** All inputs, selects, date pickers follow D7-focus + hairline borders (`border border-[var(--line)]`) idle state. Native `<input type=date>` (no date-picker library). Error states use adjacent error message + `aria-invalid=true` on control + focus first invalid field. Never color-only signals. Replaces custom focus-rings + divergent input heights.

**D16 — States (empty/loading/error).** Use EmptyState primitive (icon + headline + explanation + CTA) for zero-state, no results, and error screens. Loading screens carry `aria-live=polite` messaging (no dead-ends). Never leave a screen without state coverage.

**D17 — Doku canonical.** The Console (Backstage) section in `design.md` (this document, inserted before §9 Reference Docs) becomes the single source of truth for console tokens + D1–D18. Never maintain a parallel console design in CLAUDE.md or elsewhere. Judge-suggestion to put it in CLAUDE.md was **overridden** — `design.md` is the app's design constitution.

**D18 — Heading scale (linear, no skips).** Console headings follow: **h1** `lg` + `bold` · **h2** `base` + `semibold` · **h3** `sm` + `semibold`. No h1→h3 jumps (F17: SectionCard was h3, should be h2). Page titles = h1, section titles = h2, card/group titles = h3. Enables heading-based nav + screen-reader outline. **Carve-out:** Dialog/modal titles are a separate semantic layer (`text-lg font-semibold`, same as h1) — applied app-wide via the Radix Dialog title element, outside the page-section hierarchy. Dialog headings do not participate in outline navigation and do not reset the h-level count.

---

### Enforcement

**Gate script** `scripts/check-manager-tokens.sh` (W0-3) enforces D1, D2, and D10 scrim whitelist via grep. Colors forbidden by D1 fail CI unless marked with inline `token-ok: <reason>` comment. Example:
```tsx
// On a stage modal, white-on-primary is OK:
<button className="… text-white bg-[var(--color-primary)] …" /> {/* token-ok: stage-white-on-primary */}
```
Documented exceptions (D8 toolbar-density, D4 destructive-intent, etc.) require 1-line rationale + reviewer sign-off.

### W4 Amendments — Chip/Pill Canon (2026-07-16)

**D19 — Chip canon.** Every metadata chip/pill in the console is built on `Badge` (`components/manager/Badge.tsx`), whose exported `chipBase` owns structure (inline-flex, rounded-full, px-2.5 py-0.5, text-xs font-semibold). Color/tone variants pass ONLY color classes via `className` (merged, never replacing structure). Never hand-roll an inline chip `<span>` — that duplication caused the 2026-07-16 drift across Users/Catalog/Students. `LabelChip` builds on `chipBase` too (adds palette, hairline border, remove-X).

**D20 — Filter-pill canon.** Every filter pill uses `FilterPill` (`components/manager/FilterPill.tsx`). Active-state color deviations (e.g. label palettes) go through the `activeClassName` prop only; base, outline, and focus styles are fixed.

**D21 — Overflow menu canon.** Row overflow menus use the shared `OverflowMenu` (`components/manager/OverflowMenu.tsx`) — never a local copy. It owns the WAI-ARIA behavior (Escape on wrapper, focus into first menuitem on open, focus return on close).

**D28 — Scrollbar canon.** Every in-app scroll surface (console content, navigation rail, drawers, any `overflow-y-auto` panel) uses the themed scrollbar treatment (`.console-scroll` / `.nav-scroll`: `scrollbar-width: thin`, primary-tint rounded thumb, transparent track) — never the raw OS scrollbar. New scroll containers add the shared class; do not hand-roll per-container scrollbar CSS. `scrollbar-gutter: stable` only where layout-shift on overflow toggle matters (main content), not on narrow rails.

*Follow-up note (not enforced yet):* list wrapper spacing drifts (`space-y-3` / `space-y-2` / `gap-2`) — recommendation is `space-y-2` as the standard; alignment is a future amendment.

---

### W6 Amendments — Row-System Kanon (2026-07-22)

**Row-System-Kanon (SDD: docs/specs/manager-row-system.md R1–R27).** Vereinheitlichung aller Manager-Listenzeilen (9 Tabs) unter einheitlichen Design-Entscheidungen. Neue normative Punkte:

1. **Violetter Card-Hover-Kanon.** JEDE Manager-Listenkarte hovert `bg-[var(--accent-tint)] + outline-[var(--color-primary)]` auf der GESAMTEN Shell; neutrale Inner-Body-Hovers sind abgeschafft. Selected = persistent gleiche Farben + Indikator.

2. **`console/rowStyles.ts` = Single Source.** 15 exportierte Konstanten; State-Farben EXKLUSIV branchen (nie additiv stapeln). `selected ? rowSelectedState : rowRestState` — Tailwind v4 ordnet Base-Utilities im Build unabhängig von clsx-Reihenfolge.

3. **Dichte-Kanon: genau 2 Varianten.** `default` p-4 / `compact` px-4 py-2; Typografie zentral (Titel text-sm/leading-5/font-semibold, Meta text-xs/leading-4). Beide teilen Radius, Outline, States.

4. **Leading-Icons + Aktions-Hover.** Icons `text-[var(--ink-muted)]` (D22a bestätigt); Action-Hover violett accent-tint/accent-contrast; destruktiv bleibt D4 (`hover:bg-[var(--state-wrong-soft)] hover:text-[var(--state-wrong)]`).

5. **`assignTriggerClass` kompakt.** ~24px statt früherer min-h-11; Touch ≥44 via `before:-inset-2.5` Pseudo-Element (unsichtbarer Hotspot). Ersetzt die alte Fassung aus D22c.

6. **FilterPill `min-h-9` mit Exception.** Marker `token-ok: toolbar-density-36` — supersedes die H44-Zeile der 20-visual-consistency-matrix (D8 Ausnahme-Regel bleibt gültig).

7. **`console/listMotion.ts` = Bewegungs-Kanon.** Container nur Opacity, Items y-Offset + Stagger. Alle Listen verwenden dieselbe Ein-/Ausfahrts-Kurve.

8. **W7-D27 wurde NICHT übernommen.** Checkbox bleibt im selection-Slot, ⋮ bleibt letzter Action-Slot — Bestand über Perfektionismus.

9. **SettingRow-Grid-Kanon.** Alle Einstellungszeilen (LabelRow/ToggleField) nutzen `sm:grid-cols-[15rem_minmax(0,1fr)]` — Label-Spalte FIX 15rem (== pl-60-Beschreibungslinie), Controls beginnen exakt dort. Mobile: flex-col-Stacking. Verbot: `sm:max-w-60`-Label-Breiten verursachen Switch-Drift.

10. **Bulk-Toolbar-Kanon.** Genau EINE Komponente (BulkActionToolbar), rendert sich selbst mit `mb-3 w-full`. Slot IMMER direkt nach Filter-/Suchzeile, vor Select-all/Liste. Button-Reihenfolge: [Aktivieren][Deaktivieren][…][Löschen], Löschen letzte Aktion, variant="danger", Label immer manager:bulk.deleteSelected. Kein View-eigener Wrapper.

11. **Selection-Kanon.** Zeilen-Checkboxen IMMER als Sibling AUSSERHALB klickbarer Karten-/Zeilen-Wrapper (ListRow: selection-Prop bzw. Sibling-Div); die Karte daneben trägt `min-w-0 flex-1`. Header-Checkbox mit indeterminate; Auswahl-Scope = gefilterte IDs (useEntitySelection).

12. **Chip/Label-Kanon.** Zuordnungs-Chips (z.B. Klassen an Schülern) nutzen Badge-Komponente: ~28px Höhe, text-xs, px-2 py-0.5, flex-wrap. Keine 44px-Pills pro Zuordnung. Entfernen-× mit sichtbarem Fokus + aria-label.

13. **Dialog-Kanon (Bulk).** AlertDialog immer mit title + description (Namens-Vorschau max 5 + manager:bulk.andNMore) + confirmDisabled während laufender Operation. Loading-Flags via Settled-Callbacks zurückgesetzt.

14. **Select-Breiten.** Formulare/Settings-Selects nie full-width auf Desktop — `w-full sm:w-72` (bzw. max-w-sm) rechtsbündig in der Control-Spalte.

15. **i18n.** Keine neuen defaultValue-Fallbacks; Bulk-Vokabular aus manager:bulk.*.

---

**This section consolidates the manager console into the flat design system.** Read it alongside §1–7 (the stage guardrails apply equally). When in doubt, ask: "Is this token-driven? Is the focus formula D7? Are ink colors on fills?" — those three gates catch 80% of drift.

---

## 8·C Game-Präsentator (Host / Display Screens)

Host/Display facing screens (Lobby, Question Display, Leaderboard, Podium/Recap) use the stage flat-design language with cream-field backgrounds. Applies identical token set and guardrails as stage (§1–§7).

### Allowed Component Families

- AnswerButton / AnswerTile (hairline ring + shape icon per §3)
- LeaderboardRow (§3·B)
- TierBadge (§3·B, ink labels only)
- TeamChip (§3·B, derived -text)
- Timer (tabular numerals, §3·B)
- Modal / Dialog (§3·B fixed scrim)
- Button (primary, accent, ghost — stage versions)
- EmptyState (stage version, cream field)

### Token Set (Stage Only)

- Brand: `--color-primary`, `--color-secondary`, `--color-accent` (runtime-themeable, NOT console-pinned)
- Answer tiles: `--answer-1` through `--answer-4`, `--answer-text`
- State: `--state-correct`, `--state-wrong`
- Fields: `--game-fg` (set to `#0E1120` on cream shells by GameWrapper)
- All tokens via `color-mix` or CSS vars; never console tokens

### Critical Prohibition: No Console Contamination

**Manager/Console tokens and components MUST NOT appear in Presenter views.** Forbidden:

- Console tokens: `--surface-*`, `--ink-*`, `--line`, `--ring-selected`
- Console components: ListRow, SectionCard, BulkActionToolbar, LabelRow, ToggleField, FilterPill (console version), NavItem (console nav)
- Console palette / pinned tokens: `--color-primary` (console `#7c3aed` pin) is conceptually different from stage primary (runtime-themed)

The shell (`GameWrapper.tsx`) forces `--game-fg: #0E1120` + cream background; the stage guardrails (§2 Guardrail #5, ink labels on colored tiles) apply in full.

---

## 8·D Game-Client (Player)

Player-facing views (Join flow, answer submission, results) use the same stage tokens and guardrails as the Presenter. No separate palette.

### Allowed Component Families

- Input (PIN, username — §3·B)
- Button (primary, accent, ghost — stage)
- AnswerTile (§3·B)
- Modal / Dialog (§3·B)
- TierBadge (§3·B)
- EmptyState (stage)

### Token Set (Stage, Identical to Presenter)

- Inherits all stage tokens from §3 (answer tiles, state, brand, fields)
- `--game-fg: #0E1120` set by stage shell
- Cream field background via GameWrapper

### Critical Prohibition: No Console or Presenter Cross-Leakage

**The Player client is strictly stage-domain.** Forbidden:

- Any console token or component (§8·B family)
- Mixing Presenter-specific logic (leaderboard, display-only views) into Client views
- Manager-facing strings or controls in Player UI

The client and Presenter share the stage design system; they differ in PURPOSE, not tokens.

---

## Surface-Family Sanity Check

| Surface | Tokens | Allowed Components | Forbidden |
|---------|--------|-------------------|-----------|
| Manager / Console | Console-pinned: `--color-primary` (#7c3aed), `--surface-*`, `--ink-*` | ListRow, SectionCard, Badge, BulkActionToolbar, NavItem, LabelRow, ToggleField, OverflowMenu | Game tokens, stage components, game-tiles |
| Presenter (Host / Display) | Stage: `--answer-N`, `--state-correct/wrong`, `--game-fg`, runtime-primary | AnswerButton, LeaderboardRow, TierBadge, Timer, Modal, Button | Console tokens, Manager components |
| Client (Player) | Stage (identical to Presenter) | Input, Button, AnswerTile, Modal, EmptyState | Console, Manager, Presenter-specific logic |

**Golden rule:** A component built for the Manager uses `--surface-*` / `--ink-*` tokens and NEVER appears in a game view. A stage component uses answer-tile tokens or state colors and NEVER imports a console component. The three families are hermetically sealed at the token level.

---

## 9. Reference Docs

This `design.md` is the **canonical summary**. The deep-dive sources live in `docs/design/`:

- `docs/design/razzoozle-flat-design-decisions.md` — D1–D8 decisions.
- `docs/design/razzoozle-flat-palette-verified.md` — WCAG contrast proofs.
- `docs/design/razzoozle-flat-design-gap-analysis.md` — audit + brand pillars.
