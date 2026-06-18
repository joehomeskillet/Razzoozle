# Razzoozle Design System

> **Canonical design-system reference.** Read this at the start of EVERY UI task and check every UI change against it. This document exists to stop "design drift" — the recurring class of bugs where text rendered white on cream, dark/glass surfaces leaked onto the flat design, wrong text colors appeared on filled chips, and hardcoded hex was used instead of tokens.

---

## 1. North Star

Flat **"cream"** design. Two-field system:

- **Cream (front-of-house)** — `--color-field-cream: #F4F1EA`. Landing, lobby, player phone, trophies, join/auth.
- **Ink (stage)** — `--color-field-ink: #0E1120`. Host presentation/kiosk, podium, shared result `/r/:id`, recap.

Identity comes from the **violet brand**, the **"Zig" logo motif**, and **motion** — NOT from glass/blur. The app is **flat by default**; the glass system is gated/inert and must stay that way.

---

## 2. The Non-Negotiable Guardrails

Check these on every change. The three load-bearing ones first.

- [ ] **1. No `backdrop-blur` / `backdrop-filter` / `@supports backdrop-filter` anywhere in shipped code.** It breaks on cream, on mobile, and on Pi. A code review MUST grep for it and reject any hit.
      `grep -rniE 'backdrop-blur|backdrop-filter|@supports.*backdrop' packages/web/src`
- [ ] **2. No hardcoded hex colors in components.** Every color flows from a CSS custom property / theme token (see §3). Hardcoded `bg-[#...]`, `text-white` on a colored fill, `border-gray-300`, `bg-black/30` are drift.
- [ ] **3. Every answer tile carries a 1px hairline ring** (`border: 1px solid var(--border-hairline)`). The bright answer fills fail WCAG 1.4.11 against cream — the ring + shape icon are the non-color separators. No ring = drift.

Then the rest:

- [ ] **4. In-game foreground text uses `var(--game-fg)`.** Cream / front-of-house shells MUST set `--game-fg: #0E1120` (dark ink). **The default value of `--game-fg` is WHITE (`#ffffff`)** for ink stages — so any NEW shell/section that shows text on cream and forgets to override `--game-fg` renders invisible white text. (This exact bug hit solo mode.) **Always set `--game-fg` on a new game shell.**
- [ ] **5. Never white text on these fills** (all fail contrast): state-correct green, state-wrong red, tier gold/silver/diamant, coral accent. Use ink text (`--answer-text: #0B0B12`). White is allowed ONLY on **bronze** and on the **violet primary**.
- [ ] **6. No dark surfaces on the cream field.** On cream use `bg-white` + `--shadow-flat`; on ink use the stage surface. Never `bg-black/X`.
- [ ] **7. Scrim must be 0 in flat** (`--bg-scrim`). The legacy black scrim over a gradient murks the cream.

---

## 3. Color Tokens

**Source of truth:** `packages/web/src/index.css` (`:root`) + `packages/common/src/validators/theme.ts`.
Components must read the CSS var — **never the literal**. Team / tier / state / rank / timer / streak / surface / footer colors are manager-tunable theme tokens (`packages/common/src/validators/theme.ts` + `theme-tokens.ts`) applied at runtime by `packages/web/src/features/theme/apply.ts`.

### Brand / Fields

| Token | Value | Use / Rule |
|---|---|---|
| `--color-primary` | `#7c3aed` | Violet, primary CTA. **White text OK.** |
| `--color-secondary` | `#2e1065` | Dark ink, headings. |
| `--color-accent` (coral) | `#FF2D6E` | **Ink-text only**, fill-only on light fields. **NEVER white-on-coral.** ⚠️ |
| `--color-field-cream` | `#F4F1EA` | Front-of-house background. |
| `--color-field-ink` | `#0E1120` | Stage background. |
| `--game-fg` | default `#ffffff` | In-game text. **MUST be overridden to `#0E1120` on cream shells.** ⚠️ |

### Surfaces

| Token | Value | Use / Rule |
|---|---|---|
| `--surface` | `#FFFFFF` | Cards / surfaces on cream. |
| `--border-hairline` | `#E2DDD2` | The WCAG 1.4.11 separator (answer-tile ring). ⚠️ |
| `--shadow-flat` | (recipe) | Single shadow rung — a recipe, **not** a ladder of elevations. |
| `--radius-theme` | `16px` | Standard corner radius. |
| `--bg-scrim` | `0` (in flat) | Keep at 0; legacy scrim murks cream. |
| `--accent-contrast-text` | `#0E1120` | Ink text on accent fills. |

### Answer Tiles

**Rule:** 1px hairline ring + shape icon + ink label on every tile.

| Token | Value | Use / Rule |
|---|---|---|
| `--answer-1` | `#E69F00` | Tile fill. |
| `--answer-2` | `#56B4E9` | Tile fill. |
| `--answer-3` | `#3DBFA0` | Tile fill. |
| `--answer-4` | `#CC79A7` | Tile fill. |
| `--answer-text` | `#0B0B12` | Uniform ink label across all tiles. ⚠️ |

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

## 4. Typography

- **Font: Rubik Variable** (`@fontsource-variable/rubik`), via `--font-display`. Body uses the Tailwind sans default; display/headings use Rubik; stage marquee uses Rubik weight 800. **No serif, no Inter/Roboto/Helvetica.**
- **All numerals** (score, timer, rank, PIN) use `font-variant-numeric: tabular-nums slashed-zero` to prevent reflow on update.

---

## 5. Tailwind 4 Note

There is **no `tailwind.config` file** — config lives in the `@theme` block in `packages/web/src/index.css`. New brand colors go **there** or as `:root` custom properties — **not inline**.

---

## 6. The Gated Glass System (leave it inert)

A full frost/blur system exists, scoped to `[data-theme-style="glass"]` (`.glass`, `.glass-1/2/3`, `.glass-bg`, `.glass-interactive`). It is **inert under the default flat style** and kept only for zero-deletion safety.

- Do **NOT** add new glass classes to live surfaces.
- Do **NOT** enable the glass attribute on shipped screens.

**Historical note:** glass classes left on flat surfaces rendered invisible/illegible — a major drift source.

---

## 7. Drift Anti-Patterns — Review Checklist

| Anti-pattern | Why it breaks | The rule (+ grep) |
|---|---|---|
| White text on cream (forgot `--game-fg`) | Default `--game-fg` is white → invisible text on cream (hit solo mode) | Set `--game-fg: #0E1120` on every cream shell. |
| `backdrop-blur` in shipped code | Breaks on cream, mobile, Pi | Zero hits. `grep -rniE 'backdrop-blur\|backdrop-filter' packages/web/src` |
| Hardcoded hex in component | Bypasses theme engine; can't be retuned at runtime | Read the CSS var. `grep -rnE 'bg-\[#\|text-\[#\|#[0-9a-fA-F]{6}' packages/web/src/**/*.tsx` |
| White label on gold/silver/diamant/state/coral | All fail WCAG | Ink label (`--answer-text: #0B0B12`); white only on bronze + violet primary. |
| Missing hairline on answer tiles | Bright fills fail 1.4.11 against cream | `border: 1px solid var(--border-hairline)` + shape icon on every tile. |
| Dark `bg-black/X` on cream | Dark surface leaks onto flat field | `bg-white` + `--shadow-flat` on cream; stage surface on ink. `grep -rn 'bg-black/' packages/web/src` |
| Unbound scrim | Legacy black scrim murks cream | `--bg-scrim: 0` in flat. |
| `glass-*` on a flat surface | Renders invisible/illegible | No glass classes on live surfaces. `grep -rn 'glass' packages/web/src` |
| Meta/copy still saying "liquid-glass" | Stale brand language contradicts flat North Star | Replace with flat/cream language. `grep -rni 'liquid-glass\|liquid glass' packages/web/src` |

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

## 9. Reference Docs

This `design.md` is the **canonical summary**. The deep-dive sources live in `docs/design/`:

- `docs/design/razzoozle-flat-design-decisions.md` — D1–D8 decisions.
- `docs/design/razzoozle-flat-palette-verified.md` — WCAG contrast proofs.
- `docs/design/razzoozle-flat-design-gap-analysis.md` — audit + brand pillars.
