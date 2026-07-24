# Razzoozle Living Design System Specifications

> **Auto-generated living documentation.** Generated automatically from [`design.tokens.json`] (W3C DTCG Format) via `pnpm tokens:doc`. DO NOT EDIT DIRECTLY.

---

## Token Sets Overview

### Group: `brand`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `brand.primary` | `--brand-primary` | `#7c3aed` | `color` | Violet brand color. Primary CTA, pinned in console. White text OK. |
| `brand.secondary` | `--brand-secondary` | `#2e1065` | `color` | Dark ink, headings. Pinned in console. |
| `brand.accent` | `--brand-accent` | `#ff9900` | `color` | Amber accent default. RUNTIME-themeable. Canonical default is amber; set in packages/common/types/theme.ts + validators/theme.ts |

### Group: `fields`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `fields.cream` | `--fields-cream` | `#F4F1EA` | `color` | Front-of-house background. STATIC (:root-only). Cream field for landing, lobby, player phone, trophies, join/auth. |
| `fields.ink` | `--fields-ink` | `#0E1120` | `color` | Stage background (shared result /r/:id). STATIC (:root-only). Manager/display/podium/recap now cream-converted via GameWrapper force. |

### Group: `surfaces`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `surfaces.surface` | `--surfaces-surface` | `#FFFFFF` | `color` | Card/surface fills on cream. STATIC (:root-only). |
| `surfaces.border-hairline` | `--surfaces-border-hairline` | `#E2DDD2` | `color` | 1px answer-tile ring separator (WCAG 1.4.11 distinction). STATIC (:root-only). |
| `surfaces.shadow-flat` | `--surfaces-shadow-flat` | `0 1px 2px rgba(20,18,43,.06), 0 8px 24px rgba(20,18,43,.07)` | `shadow` | Single shadow rung (no elevation ladder). STATIC (:root-only). Recipe, not a ladder. |

### Group: `radius`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `radius.theme` | `--radius-theme` | `16px` | `dimension` | Standard corner radius. RUNTIME-themeable. |
| `radius.compact` | `--radius-compact` | `8px` | `dimension` | Compact radius for chips, badges, tightly-spaced UI. |

### Group: `text`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `text.game-fg` | `--text-game-fg` | `#0E1120` | `color` | In-game foreground text. STATIC (no theme field). Shell sets #0E1120 (ink) for cream-converted surfaces. Bare :root default is WHITE (#ffffff). NEW cream shells MUST set --game-fg: #0E1120 themselves. |
| `text.answer-text` | `--text-answer-text` | `#0B0B12` | `color` | Uniform ink label on answer tiles (all 4 colors). RUNTIME-themeable. Runtime default is ink #0B0B12; previously drifted to white. |
| `text.accent-contrast-text` | `--text-accent-contrast-text` | `#0E1120` | `color` | Ink text on accent fills. STATIC (:root-only). Never white-on-accent on cream surfaces. |

### Group: `console`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `console.ink` | `--console-ink` | `#111827` | `color` | Console primary text color. STATIC. |
| `console.ink-muted` | `--console-ink-muted` | `#374151` | `color` | Console muted text color. STATIC. |
| `console.ink-medium` | `--console-ink-medium` | `#4b5563` | `color` | Console medium text color. STATIC. |
| `console.ink-subtle` | `--console-ink-subtle` | `#6b7280` | `color` | Console subtle text color. STATIC. |
| `console.ink-faint` | `--console-ink-faint` | `#9ca3af` | `color` | Console faint text color. STATIC. |
| `console.surface-2` | `--console-surface-2` | `#f9fafb` | `color` | Console surface level 2. STATIC. |
| `console.surface-3` | `--console-surface-3` | `#f3f4f6` | `color` | Console surface level 3. STATIC. |
| `console.surface-4` | `--console-surface-4` | `#e5e7eb` | `color` | Console surface level 4. STATIC. |
| `console.surface-5` | `--console-surface-5` | `#d1d5db` | `color` | Console surface level 5. STATIC. Used for toggle/hover steps. |
| `console.line` | `--console-line` | `#e5e7eb` | `color` | Hairline borders, dividers (ListRow separator, form boundaries). STATIC (:root-only). Contrast on surface-3 = 1.09:1 (fails WCAG for meaning-bearing; acceptable as decorative divider). |
| `console.ring-selected` | `--console-ring-selected` | `rgb(255 255 255 / 0.8)` | `color` | Focus ring on dark backgrounds (rarely used in light console). STATIC (:root-only). |
| `console.status-online-bg` | `--console-status-online-bg` | `#dcfce7` | `color` | Online status background color. STATIC. |
| `console.status-online-text` | `--console-status-online-text` | `#166534` | `color` | Online status text color. Contrast 6.5:1 (AA). STATIC. |
| `console.status-offline-bg` | `--console-status-offline-bg` | `#fee2e2` | `color` | Offline status background color. STATIC. |
| `console.status-offline-text` | `--console-status-offline-text` | `#991b1b` | `color` | Offline status text color. Contrast 6.8:1 (AA). STATIC. |
| `console.status-pending-bg` | `--console-status-pending-bg` | `#fef3c7` | `color` | Pending status background color. STATIC. |
| `console.status-pending-text` | `--console-status-pending-text` | `#92400e` | `color` | Pending status text color. Contrast 6.4:1 (AA). STATIC. |
| `console.accent-tint` | `--console-accent-tint` | `color-mix(in srgb, var(--color-primary), white 88%)` | `color` | Derived from themed primary. Re-derived inside .console-shell from pinned primary, ensuring console stays amber even when game recolors. |
| `console.accent-contrast` | `--console-accent-contrast` | `color-mix(in srgb, color-mix(in srgb, var(--color-primary), black 34%), #1f2937 12%)` | `color` | Derived from themed primary. RUNTIME-themeable. |

### Group: `answer-tiles`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `answer-tiles.answer-1` | `--answer-tiles-answer-1` | `#E69F00` | `color` | Tile fill (orange). Recolors to state-correct (green) or state-wrong (red) on reveal. Ring + ink label retained. |
| `answer-tiles.answer-2` | `--answer-tiles-answer-2` | `#56B4E9` | `color` | Tile fill (blue). Recolors on reveal. |
| `answer-tiles.answer-3` | `--answer-tiles-answer-3` | `#3DBFA0` | `color` | Tile fill (teal). Recolors on reveal. |
| `answer-tiles.answer-4` | `--answer-tiles-answer-4` | `#CC79A7` | `color` | Tile fill (pink). Recolors on reveal. |

### Group: `teams`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `teams.red-base` | `--teams-red-base` | `#ef4444` | `color` | Red team base color. |
| `teams.red-ring` | `--teams-red-ring` | `color-mix(in srgb, var(--team-red), black 32%)` | `color` | Red team derived ring color (black 32%). |
| `teams.red-text` | `--teams-red-text` | `color-mix(in srgb, var(--team-red), black 55%)` | `color` | Red team derived text color (black 55%). |
| `teams.blue-base` | `--teams-blue-base` | `#3b82f6` | `color` | Blue team base color. |
| `teams.blue-ring` | `--teams-blue-ring` | `color-mix(in srgb, var(--team-blue), black 32%)` | `color` | Blue team derived ring color (black 32%). |
| `teams.blue-text` | `--teams-blue-text` | `color-mix(in srgb, var(--team-blue), black 55%)` | `color` | Blue team derived text color (black 55%). |
| `teams.green-base` | `--teams-green-base` | `#22c55e` | `color` | Green team base color. |
| `teams.green-ring` | `--teams-green-ring` | `color-mix(in srgb, var(--team-green), black 32%)` | `color` | Green team derived ring color (black 32%). |
| `teams.green-text` | `--teams-green-text` | `color-mix(in srgb, var(--team-green), black 55%)` | `color` | Green team derived text color (black 55%). |
| `teams.yellow-base` | `--teams-yellow-base` | `#facc15` | `color` | Yellow team base color. |
| `teams.yellow-ring` | `--teams-yellow-ring` | `color-mix(in srgb, var(--team-yellow), black 32%)` | `color` | Yellow team derived ring color (black 32%). |
| `teams.yellow-text` | `--teams-yellow-text` | `color-mix(in srgb, var(--team-yellow), black 55%)` | `color` | Yellow team derived text color (black 55%). |

### Group: `tiers`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `tiers.bronze-fill` | `--tiers-bronze-fill` | `#b45309` | `color` | Bronze tier fill color. WHITE label OK on bronze (only tier that takes white). Contrast 5.02:1 (AA+). |
| `tiers.bronze-label` | `--tiers-bronze-label` | `#FFFFFF` | `color` | Bronze tier label color (white). Unique to bronze. |
| `tiers.silver-fill` | `--tiers-silver-fill` | `#9ca3af` | `color` | Silver tier fill color. INK label (never white on silver). Contrast 7.39:1 (AA+). |
| `tiers.silver-label` | `--tiers-silver-label` | `#0B0B12` | `color` | Silver tier label color (ink). |
| `tiers.gold-fill` | `--tiers-gold-fill` | `#eab308` | `color` | Gold tier fill color. INK label (never white on gold). Contrast 9.78:1 (AAA). |
| `tiers.gold-label` | `--tiers-gold-label` | `#0B0B12` | `color` | Gold tier label color (ink). |
| `tiers.diamant-fill` | `--tiers-diamant-fill` | `#38bdf8` | `color` | Diamant tier fill color. INK label (never white on diamant). Contrast 8.75:1 (AAA). |
| `tiers.diamant-label` | `--tiers-diamant-label` | `#0B0B12` | `color` | Diamant tier label color (ink). |

### Group: `state`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `state.correct-fill` | `--state-correct-fill` | `#22c55e` | `color` | Correct answer fill color. INK text. Soft wash: color-mix transparent 78%. Contrast 7.8:1 (AAA). |
| `state.correct-text` | `--state-correct-text` | `#0B0B12` | `color` | Correct answer text color (ink). White fails (2.28:1). |
| `state.wrong-fill` | `--state-wrong-fill` | `#ef4444` | `color` | Wrong answer fill color. INK text. Soft wash: color-mix transparent 78%. Contrast 7.2:1 (AAA). |
| `state.wrong-text` | `--state-wrong-text` | `#0B0B12` | `color` | Wrong answer text color (ink). White fails (3.76:1). |

### Group: `misc`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `misc.rank-up` | `--misc-rank-up` | `#10b981` | `color` | Rank-improved indicator. |
| `misc.rank-down` | `--misc-rank-down` | `#f43f5e` | `color` | Rank-dropped indicator. |
| `misc.timer-urgent` | `--misc-timer-urgent` | `#ff3b30` | `color` | Timer urgency color. |
| `misc.timer-track` | `--misc-timer-track` | `color-mix(in srgb, var(--color-text) 22%, transparent)` | `color` | Derived from text color at 22% opacity. |
| `misc.streak-color` | `--misc-streak-color` | `#b45309` | `color` | Streak indicator. |
| `misc.surface-muted` | `--misc-surface-muted` | `#374151` | `color` | Muted surface. |
| `misc.footer-bg` | `--misc-footer-bg` | `#ffffff` | `color` | Footer background. |
| `misc.footer-text` | `--misc-footer-text` | `#1f2937` | `color` | Footer text. |
| `misc.danger-bg` | `--misc-danger-bg` | `color-mix(in srgb, var(--state-wrong), black 10%)` | `color` | Destructive action background (darkened state-wrong). |

### Group: `labels`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `labels.red` | `--labels-red` | `#ef4444` | `color` | Red label color. |
| `labels.red-bg` | `--labels-red-bg` | `color-mix(in srgb, var(--label-red), white 92%)` | `color` | Red label background (white 92% tint). |
| `labels.blue` | `--labels-blue` | `#3b82f6` | `color` | Blue label color. |
| `labels.blue-bg` | `--labels-blue-bg` | `color-mix(in srgb, var(--label-blue), white 92%)` | `color` | Blue label background (white 92% tint). |
| `labels.green` | `--labels-green` | `#22c55e` | `color` | Green label color. |
| `labels.green-bg` | `--labels-green-bg` | `color-mix(in srgb, var(--label-green), white 92%)` | `color` | Green label background (white 92% tint). |
| `labels.yellow` | `--labels-yellow` | `#facc15` | `color` | Yellow label color. |
| `labels.yellow-bg` | `--labels-yellow-bg` | `color-mix(in srgb, var(--label-yellow), white 92%)` | `color` | Yellow label background (white 92% tint). |
| `labels.purple` | `--labels-purple` | `#a855f7` | `color` | Purple label color. |
| `labels.purple-bg` | `--labels-purple-bg` | `color-mix(in srgb, var(--label-purple), white 92%)` | `color` | Purple label background (white 92% tint). |
| `labels.pink` | `--labels-pink` | `#ec4899` | `color` | Pink label color. |
| `labels.pink-bg` | `--labels-pink-bg` | `color-mix(in srgb, var(--label-pink), white 92%)` | `color` | Pink label background (white 92% tint). |
| `labels.indigo` | `--labels-indigo` | `#6366f1` | `color` | Indigo label color. |
| `labels.indigo-bg` | `--labels-indigo-bg` | `color-mix(in srgb, var(--label-indigo), white 92%)` | `color` | Indigo label background (white 92% tint). |
| `labels.gray` | `--labels-gray` | `#6b7280` | `color` | Gray label color. |
| `labels.gray-bg` | `--labels-gray-bg` | `color-mix(in srgb, var(--label-gray), white 92%)` | `color` | Gray label background (white 92% tint). |

### Group: `typography`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `typography.font-display` | `--typography-font-display` | `Rubik Variable` | `fontFamily` | Display, headings, stage marquee (weight 800). NOT serif, NOT Inter/Roboto/Helvetica. Source: @fontsource-variable/rubik |
| `typography.font-body` | `--typography-font-body` | `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | `fontFamily` | Body text. Tailwind default sans stack. |
| `typography.numerals` | `--typography-numerals` | `font-variant-numeric: tabular-nums slashed-zero` | `typography` | All numerals (score, timer, rank, PIN) to prevent reflow on update. |
| `typography.console-heading-h1` | `--typography-console-heading-h1` | `lg + bold` | `typography` | Console H1 (page titles). Linear scale. |
| `typography.console-heading-h2` | `--typography-console-heading-h2` | `base + semibold` | `typography` | Console H2 (section titles). Linear scale. |
| `typography.console-heading-h3` | `--typography-console-heading-h3` | `sm + semibold` | `typography` | Console H3 (card/group titles). Linear scale. |

### Group: `spacing`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `spacing.note` | `--spacing-note` | `Tailwind defaults apply. No custom spacing ladder defined in tokens. Console row density: default p-4 / compact px-4 py-2.` | `other` | Spacing note. |

### Group: `scrim`

| Token Name | CSS Custom Property | Value | Type | Description |
|---|---|---|---|---|
| `scrim.overlay` | `--scrim-overlay` | `0` | `other` | Dialog/modal overlay scrim. RUNTIME-themeable. MUST stay 0 in flat (legacy black scrim murks cream). bg-black/40 is the only sanctioned dark fill (on position:fixed full-screen modal overlays only). |

---
*Last updated from W3C design.tokens.json on 2026-07-24.*
