# Skeleton System + Haptics — Implementation Contract (Wave 0)

Status: **accepted** · Branch: `feat/skeleton-system-haptics` · Author: orchestrator (Opus)

This is the single source of truth all work-packages implement against. Token
names, file paths, schema fields and defaults defined here are **frozen** — WP
agents must not invent alternatives.

## Decisions (from user)

1. **Skeleton power = Tokens + CSS + JS.** An uploaded skeleton ZIP may carry theme
   tokens (JSON), a free-form `theme.css` override, AND a `theme.js` script that
   runs on every client. Manager-gated. **JS = stored-XSS by design** — accepted,
   manager-auth required, prominent warning in UI.
2. **Full tokenization.** Every hardcoded color across the game (teams, leaderboard
   tiers, podium medals, timer, correct/wrong, footer, muted surface) becomes a CSS
   custom property so a skeleton can restyle the *whole* game incl. leaderboards.
3. **Haptics = separate toggle, default ON.** `navigator.vibrate` on player phones,
   respects `prefers-reduced-motion`, no peer-answer cascade, countdown only last 3s.

## Core principle: tokenization is a visual no-op

Every new CSS custom property's **default equals the current hardcoded value**.
After Wave 1 the UI must look pixel-identical to before with the default theme.
Regression guard: `git stash` + screenshot diff, or visual review.

## Backward compatibility

`Theme = z.infer<themeValidator>`. `applyTheme` does `{...DEFAULT_THEME, ...theme}`
and `fetchTheme` does `{...DEFAULT_THEME, ...parsed}`. The server `setTheme` parses
through `themeValidator` before persisting, so on-disk themes are always complete.
**All new schema fields are optional with Zod `.default(...)`** → old `theme.json`
files and `DEFAULT_THEME` stay valid; nested objects get object-level `.default`.

---

## 1. Theme schema additions

### `packages/common/src/validators/theme.ts`

Add to the `themeValidator` object (reuse the existing `hexColor`):

```ts
teamColors: z
  .object({
    red: hexColor.default("#ef4444"),
    blue: hexColor.default("#3b82f6"),
    green: hexColor.default("#22c55e"),
    yellow: hexColor.default("#facc15"),
  })
  .default({ red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#facc15" }),
tierColors: z
  .object({
    bronze: hexColor.default("#b45309"),
    silver: hexColor.default("#9ca3af"),
    gold: hexColor.default("#eab308"),
    diamant: hexColor.default("#38bdf8"),
  })
  .default({ bronze: "#b45309", silver: "#9ca3af", gold: "#eab308", diamant: "#38bdf8" }),
stateColors: z
  .object({ correct: hexColor.default("#22c55e"), wrong: hexColor.default("#ef4444") })
  .default({ correct: "#22c55e", wrong: "#ef4444" }),
rankColors: z
  .object({ up: hexColor.default("#10b981"), down: hexColor.default("#f43f5e") })
  .default({ up: "#10b981", down: "#f43f5e" }),
timerUrgent: hexColor.default("#ff3b30"),
streakColor: hexColor.default("#b45309"),
surfaceMuted: hexColor.default("#374151"),
footerColors: z
  .object({ bg: hexColor.default("#ffffff"), text: hexColor.default("#1f2937") })
  .default({ bg: "#ffffff", text: "#1f2937" }),
// Skeleton overrides — content lives in files (config/theme/skeleton.css|js),
// theme.json only carries the enable flags + a cache-bust version.
customCssEnabled: z.boolean().default(false),
customJsEnabled: z.boolean().default(false),
skeletonVersion: z.number().int().min(0).default(0),
```

### `packages/common/src/types/theme.ts`

Add the same fields to `DEFAULT_THEME` with the default values above
(`teamColors`, `tierColors`, `stateColors`, `rankColors`, `timerUrgent`,
`streakColor`, `surfaceMuted`, `footerColors`, `customCssEnabled: false`,
`customJsEnabled: false`, `skeletonVersion: 0`). `Theme` stays inferred.

---

## 2. Token registry (single source) — `packages/common/src/theme-tokens.ts` (NEW)

Drives three consumers: `applyTheme` (runtime CSS vars), the SKELETON.md generator
(LLM contract doc), and the manager editor (one field per token). DRY backbone.

```ts
export interface ThemeTokenDef {
  cssVar: string   // CSS custom property name, e.g. "--state-correct"
  path: string     // dot-path into Theme, e.g. "stateColors.correct"
  label: string    // human label for the editor / doc
  group: string    // editor grouping + doc section
  description: string
}

// Only the COLOR tokens that are set 1:1 from a hex value go here. The bespoke
// originals (radius px, scrim /100, style attr, answer array, title) keep their
// hand-written handling in applyTheme.
export const THEME_TOKENS: ThemeTokenDef[] = [
  { cssVar: "--team-red",      path: "teamColors.red",    label: "Team Red",    group: "Teams",  description: "Red team base color (ring/text derived darker)." },
  { cssVar: "--team-blue",     path: "teamColors.blue",   label: "Team Blue",   group: "Teams",  description: "Blue team base color." },
  { cssVar: "--team-green",    path: "teamColors.green",  label: "Team Green",  group: "Teams",  description: "Green team base color." },
  { cssVar: "--team-yellow",   path: "teamColors.yellow", label: "Team Yellow", group: "Teams",  description: "Yellow team base color." },
  { cssVar: "--tier-bronze",   path: "tierColors.bronze", label: "Bronze",  group: "Tiers", description: "Bronze tier: 3rd podium, bronze achievements, leaderboard banner." },
  { cssVar: "--tier-silver",   path: "tierColors.silver", label: "Silver",  group: "Tiers", description: "Silver tier: 2nd podium, silver achievements." },
  { cssVar: "--tier-gold",     path: "tierColors.gold",   label: "Gold",    group: "Tiers", description: "Gold tier: 1st podium, gold achievements." },
  { cssVar: "--tier-diamant",  path: "tierColors.diamant",label: "Diamant", group: "Tiers", description: "Diamond tier: top achievements." },
  { cssVar: "--state-correct", path: "stateColors.correct", label: "Correct", group: "State", description: "Correct-answer highlight." },
  { cssVar: "--state-wrong",   path: "stateColors.wrong",   label: "Wrong",   group: "State", description: "Wrong-answer highlight." },
  { cssVar: "--rank-up",       path: "rankColors.up",   label: "Rank up",   group: "Rank", description: "Leaderboard climber chip." },
  { cssVar: "--rank-down",     path: "rankColors.down", label: "Rank down", group: "Rank", description: "Leaderboard faller chip." },
  { cssVar: "--timer-urgent",  path: "timerUrgent",  label: "Timer urgent", group: "Misc", description: "Countdown ring color in the final urgent phase." },
  { cssVar: "--streak-color",  path: "streakColor",  label: "Streak badge", group: "Misc", description: "Answer-streak flame badge." },
  { cssVar: "--surface-muted", path: "surfaceMuted", label: "Muted surface", group: "Misc", description: "Neutral panel background (e.g. question-teaser grid)." },
  { cssVar: "--footer-bg",     path: "footerColors.bg",   label: "Footer bg",   group: "Misc", description: "Player score footer background." },
  { cssVar: "--footer-text",   path: "footerColors.text", label: "Footer text", group: "Misc", description: "Player score footer text." },
]
```

---

## 3. CSS variables — `packages/web/src/index.css`

Add to the existing `:root` block (after `--bg-scrim`). Bases = current hardcoded
values; ring/text/glow/track/soft are **derived** so editing one base re-colors all.

```css
  /* Teams — base set at runtime by applyTheme; ring/text derived. */
  --team-red: #ef4444;  --team-blue: #3b82f6;  --team-green: #22c55e;  --team-yellow: #facc15;
  --team-red-ring:    color-mix(in srgb, var(--team-red), black 32%);
  --team-red-text:    color-mix(in srgb, var(--team-red), black 55%);
  --team-blue-ring:   color-mix(in srgb, var(--team-blue), black 32%);
  --team-blue-text:   color-mix(in srgb, var(--team-blue), black 55%);
  --team-green-ring:  color-mix(in srgb, var(--team-green), black 32%);
  --team-green-text:  color-mix(in srgb, var(--team-green), black 55%);
  --team-yellow-ring: color-mix(in srgb, var(--team-yellow), black 32%);
  --team-yellow-text: color-mix(in srgb, var(--team-yellow), black 55%);

  /* Tiers + derived glow (box-shadow recipe for leaderboard banners). */
  --tier-bronze: #b45309;  --tier-silver: #9ca3af;  --tier-gold: #eab308;  --tier-diamant: #38bdf8;
  --tier-bronze-glow:  0 0 28px color-mix(in srgb, var(--tier-bronze),  transparent 50%);
  --tier-silver-glow:  0 0 28px color-mix(in srgb, var(--tier-silver),  transparent 50%);
  --tier-gold-glow:    0 0 30px color-mix(in srgb, var(--tier-gold),    transparent 45%);
  --tier-diamant-glow: 0 0 34px color-mix(in srgb, var(--tier-diamant), transparent 40%);

  /* State + soft tints (the /20–/30 chip backgrounds). */
  --state-correct: #22c55e;  --state-wrong: #ef4444;
  --state-correct-soft: color-mix(in srgb, var(--state-correct), transparent 78%);
  --state-wrong-soft:   color-mix(in srgb, var(--state-wrong),   transparent 78%);

  /* Rank delta + soft tints. */
  --rank-up: #10b981;  --rank-down: #f43f5e;
  --rank-up-soft:   color-mix(in srgb, var(--rank-up),   transparent 75%);
  --rank-down-soft: color-mix(in srgb, var(--rank-down), transparent 75%);

  /* Timer: urgent base; track derived from text (was rgba(255,255,255,.22)). */
  --timer-urgent: #ff3b30;
  --timer-track:  color-mix(in srgb, var(--color-text) 22%, transparent);

  /* Misc. */
  --streak-color: #b45309;
  --surface-muted: #374151;
  --footer-bg: #ffffff;  --footer-text: #1f2937;
```

`applyTheme` overrides the **base** vars (those in `THEME_TOKENS`) at runtime; the
derived vars (`-ring`/`-text`/`-glow`/`-soft`/`--timer-track`) track them via
`color-mix` with zero JS.

---

## 4. `applyTheme` + skeleton injection — `packages/web/src/features/theme/apply.ts`

1. Keep all existing bespoke lines (primary/secondary/text/accent/answer*/radius/
   scrim/style/title).
2. Add a registry loop:
   ```ts
   import { THEME_TOKENS } from "@razzoozle/common/theme-tokens"
   const get = (obj: any, path: string) => path.split(".").reduce((o, k) => o?.[k], obj)
   for (const tok of THEME_TOKENS) {
     const v = get(t, tok.path) ?? get(DEFAULT_THEME, tok.path)
     if (typeof v === "string") style.setProperty(tok.cssVar, v)
   }
   ```
   (`t` is the already-`{...DEFAULT_THEME, ...theme}` merged object; the `?? DEFAULT`
   fallback also covers a shallow-merged partial nested object.)
3. **Skeleton CSS injection** — idempotent `<link>` keyed by id, version-busted:
   ```ts
   const ensureLink = (enabled: boolean, v: number) => {
     const id = "skeleton-css"
     let el = document.getElementById(id) as HTMLLinkElement | null
     if (!enabled) { el?.remove(); return }
     if (!el) { el = document.createElement("link"); el.id = id; el.rel = "stylesheet"; document.head.appendChild(el) }
     el.href = `/theme/skeleton.css?v=${v}`
   }
   ensureLink(t.customCssEnabled, t.skeletonVersion)
   ```
4. **Skeleton JS injection** — same pattern with a `<script id="skeleton-js">`
   appended to `body`, `src=/theme/skeleton.js?v=${v}`. Re-injecting on version bump
   loads the new file (old side effects persist until full reload — documented
   ceiling). Before injecting, expose a minimal, documented global:
   ```ts
   ;(window as any).razzoozle = { theme: t, skeletonVersion: t.skeletonVersion }
   ```
   Guard everything with `typeof document !== "undefined"`.

No change needed in `__root.tsx` (it already calls `applyTheme` on load + on
`MANAGER.THEME`).

---

## 5. Haptics primitives (Feature 2)

### `packages/web/src/features/game/stores/haptics.ts` (NEW)

Mirror `stores/sound.ts` exactly. `LS_KEY = "rahoot_haptics"`. **Default ON**:
`readEnabled()` returns `localStorage.getItem(LS_KEY) !== "false"` (absent → true).
Shape: `{ enabled: boolean; toggle: () => void }`, export `useHapticsStore`.

### `packages/web/src/features/game/utils/haptics.ts` (NEW)

```ts
import { useHapticsStore } from "@razzoozle/web/features/game/stores/haptics"

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

const canVibrate = () =>
  typeof navigator !== "undefined" &&
  "vibrate" in navigator &&
  useHapticsStore.getState().enabled &&
  !reduced()

const fire = (pattern: number | number[]) => { if (canVibrate()) navigator.vibrate(pattern) }

export const hapticTap        = () => fire(25)                 // answer tap / coin
export const hapticSuccess    = () => fire([45])               // correct
export const hapticError      = () => fire([140, 50, 140])     // wrong (stutter rumble)
export const hapticWin        = () => fire([70, 40, 70, 40, 160]) // first-correct / podium
export const hapticCountdown  = () => fire(40)                 // per tick (last 3s only)
export const hapticAchievement = (tier: "bronze" | "silver" | "gold" | "diamant") =>
  fire({ bronze: [40], silver: [40, 30, 40], gold: [60, 40, 60], diamant: [90, 40, 90, 40, 140] }[tier] ?? [45])
```

Module-level fns reading the store (mirrors `firstCorrectSound.ts`) so they work in
tight tap handlers without hooks.

### Toggle UI

Add a haptics toggle next to the existing sound-mute control (find it — it lives in
`GameWrapper.tsx`'s control bar; if there is no player-reachable mute, add the toggle
to a player screen header). Reuse the mute button's styling; lucide `Vibrate` /
`VibrateOff` icon; reads/writes `useHapticsStore`.

---

## 6. Component tokenization map (Wave 1) — replace hardcoded → token

| File | Current | Replace with |
|---|---|---|
| `Leaderboard.tsx` | `TIER_GRADIENT` object (per-tier gradient strings) | gradient built from `--tier-{bronze,silver,gold,diamant}` (e.g. `linear-gradient(...var(--tier-gold)...)`) |
| `Leaderboard.tsx` | `BANNER_GLOW` object (box-shadows) | `var(--tier-{tier}-glow)` |
| `Leaderboard.tsx` | streak `bg-amber-700` | `bg-[var(--streak-color)]` |
| `Leaderboard.tsx` | climber `bg-emerald-500/25 text-emerald-100` | `bg-[var(--rank-up-soft)]` (keep light text) |
| `Leaderboard.tsx` | faller `bg-rose-500/25 text-rose-100` | `bg-[var(--rank-down-soft)]` |
| `Podium.tsx` | medal `bg-yellow-500 / bg-gray-400 / bg-amber-700` | `bg-[var(--tier-gold)] / bg-[var(--tier-silver)] / bg-[var(--tier-bronze)]` |
| `Wait.tsx` | `TEAM_SWATCH` hardcoded `bg-red-500 ring-red-700 text-red-900` ×4 | import shared `teamSwatch(team)` from new `utils/teams.ts` |
| `Room.tsx` | `TEAM_DOT` hardcoded `bg-red-500` ×4 | shared `teamDot(team)` from `utils/teams.ts` |
| `TeamLeaderboard.tsx` | `TEAM_COLORS` hardcoded ×4 | shared `teamColor(team)` from `utils/teams.ts` |
| `CircularTimer.tsx` | urgent `#ff3b30` | `var(--timer-urgent)` |
| `CircularTimer.tsx` | track `rgba(255,255,255,0.22)` | `var(--timer-track)` |
| `SoloAnswers.tsx` | `!bg-green-500` / `!bg-red-500` | `!bg-[var(--state-correct)]` / `!bg-[var(--state-wrong)]` |
| `Responses.tsx` | accepted `bg-green-500/20 text-green-300` etc. | `bg-[var(--state-correct-soft)]` (keep light text) |
| `GameWrapper.tsx` | footer `bg-white text-gray-800` | `bg-[var(--footer-bg)] text-[var(--footer-text)]` |
| `Prepared.tsx` | grid `bg-gray-700` | `bg-[var(--surface-muted)]` |

### `packages/web/src/features/game/utils/teams.ts` (NEW)

Single source for the 4 team color class strings (kills the Wait/Room/TeamLeaderboard
duplication). Export e.g.:
```ts
export const TEAMS = ["red", "blue", "green", "yellow"] as const
export const teamSwatch = (t) => `bg-[var(--team-${t})] ring-[var(--team-${t}-ring)] text-[var(--team-${t}-text)]`
export const teamDot    = (t) => `bg-[var(--team-${t})]`
```
(Match whatever key the components already use to identify a team — read first.)

## 6b. Haptics call-site map (Wave 1) — add after the existing sound call

| File | Site | Add |
|---|---|---|
| `Answers.tsx` | `handleAnswer` / `submitSlider` / `submitMultiSelect` / `submitTextAnswer` (after each `sfxPop()`) | `hapticTap()` |
| `Answers.tsx` | `PLAYER_ANSWER` peer handler | **nothing** (cascade guard) |
| `Result.tsx` | first-correct (`playFirstCorrectSound`) | `hapticWin()` |
| `Result.tsx` | correct (`sfxResults`) | `hapticSuccess()` |
| `Result.tsx` | wrong (`sfxWrong`) | `hapticError()` |
| `Result.tsx` | tier chimes (`sfxDiamant/Gold/...`) | `hapticAchievement(tier)` |
| `Start.tsx` | COOLDOWN tick | `hapticCountdown()` **only when remaining ≤ 3** |
| `Question.tsx` | reveal (`sfxShow`) | nothing (avoid over-buzzing) |
| `SoloAnswers.tsx` | answer taps | `hapticTap()` |
| `SoloAnswers.tsx` | correct / wrong | `hapticSuccess()` / `hapticError()` |

Manager/display screens (Room, Responses, Leaderboard, Podium) get **no** haptics —
guaranteed structurally (no calls there).

---

## 7. Skeleton ZIP format

```
skeleton.zip
├─ skeleton.json     { "formatVersion": 1, "name": string, "theme": Theme }
├─ theme.css         (optional) free CSS override
├─ theme.js          (optional) free JS (runs on all clients — manager-gated)
├─ SKELETON.md       generated on export; ignored on import
└─ assets/
   ├─ <logo>.svg|png|webp
   └─ backgrounds/{auth,managerGame,playerGame}.webp
```

### Persisted on import
- `theme.css` → `config/theme/skeleton.css`, set `customCssEnabled=true`.
- `theme.js`  → `config/theme/skeleton.js`,  set `customJsEnabled=true`.
- assets → `config/theme/<basename>` (logo/brand) or `config/media/backgrounds/<basename>` (backgrounds); rewrite `theme.logo` / `theme.backgrounds.*` to the served `/theme/...` or `/media/backgrounds/...` paths.
- bump `theme.skeletonVersion += 1`; `setTheme(theme)` (snapshots a revision); broadcast `MANAGER.THEME`.
- nginx already serves `config/theme/*` at `/theme/*` — no nginx change.

---

## 8. Backend endpoints — `packages/socket`

Add dep **`jszip`** to `packages/socket/package.json` (pure-JS, no native build).

Two HTTP routes in `services/http-routes.ts`, **manager-gated** (work in prod, not
dev-only). Reuse the timing-safe compare pattern from `authorizeDevRequest`:
require header `X-Manager-Token` === `game.json` `managerPassword` (the manager
client already holds it from login). Also accept the existing dev key when set.

- `GET /api/skeleton/export` → build ZIP in memory (jszip): `skeleton.json` (current
  theme), copy referenced assets from the config volume into `assets/`, include
  `config/theme/skeleton.css|js` if present, generate `SKELETON.md` (see §9). Respond
  `application/zip` + `Content-Disposition: attachment; filename="razzoozle-skeleton.zip"`.
- `POST /api/skeleton/import` → read raw body as zip (**raise the per-route body cap
  to 16 MB**; current global `readBody` cap is 64 KB — add an override param). Then:
  1. `JSZip.loadAsync`; parse `skeleton.json`; `themeValidator.parse(theme)`.
  2. **Security:** total uncompressed size cap (e.g. 32 MB) + entry-count cap
     (zip-bomb guard); each asset filename → `path.basename` only (no traversal);
     extension allowlist `svg|webp|png|jpg|jpeg|woff2`; `theme.css`/`theme.js` size
     cap (e.g. 512 KB each).
  3. Persist assets + css/js, rewrite asset paths, bump version, `setTheme`, broadcast.
  4. Respond `{ ok: true, theme }`.

Manager CSS/JS *text* edits (not full ZIP) go over socket: add
`EVENTS.MANAGER.SET_SKELETON_ASSET { kind: "css" | "js", content: string }` →
writes the file, toggles the matching `*Enabled` flag, bumps version, persists,
broadcasts `MANAGER.THEME`; success via `SET_SKELETON_ASSET_SUCCESS`, errors via
existing `THEME_ERROR`. Add these to `packages/common/src/constants.ts` (Wave 0).

---

## 9. SKELETON.md generator — `packages/common/src/skeleton-doc.ts` (NEW, Wave 0)

`renderSkeletonDoc(theme: Theme): string` — pure fn, generated from `THEME_TOKENS` +
current theme values. Sections: (1) what a skeleton is + the ZIP layout; (2) a token
table (CSS var · controls · current value) from `THEME_TOKENS` + the bespoke ones
(colors, answer 1–4, radius, scrim, style, logo, backgrounds); (3) CSS-override notes
(key selectors a `theme.css` can target: `.glass*`, `[data-theme-style]`, answer
button classes, leaderboard/podium class names); (4) the JS surface
(`window.razzoozle = { theme, skeletonVersion }`, the XSS warning); (5) asset slots;
(6) a worked "ask an LLM to regenerate" prompt. This file is the LLM contract.

---

## 10. Manager editor extension

### `ConfigTheme.tsx` (extend) — all token fields editable
Add registry-driven color pickers: iterate `THEME_TOKENS` grouped by `group`
(Teams / Tiers / State / Rank / Misc), each a color input bound to the dot-path in
the theme draft. Reuse existing `FormSection` / `SectionCard` / color-input controls.
Saving rides the existing `MANAGER.SET_THEME` payload (the full Theme now includes
the new fields). "alles ausgefüllt werden kann" = this.

### `ConfigSkeleton.tsx` (NEW) + register in `configurations/index.tsx`
New "Skeleton" tab (lucide `Download`/`Package` icon). Contains:
- **Download** button → anchor to `GET /api/skeleton/export` (send manager token).
- **Upload** ZIP → file input → `POST /api/skeleton/import` → toast + clients re-apply.
- **CSS editor**: `<textarea>` (plain, no Monaco), prefilled via `fetch('/theme/skeleton.css')`; save → `MANAGER.SET_SKELETON_ASSET {kind:"css"}`.
- **JS editor**: `<textarea>` with a **prominent red warning** ("läuft auf jedem Spieler-Handy — nur vertrauenswürdiger Code"); save → `SET_SKELETON_ASSET {kind:"js"}`.

---

## 11. Wave decomposition (disjoint file ownership)

**Wave 0 — contract (gate with `tsc` before Wave 1):**
- WP0-common: `validators/theme.ts`, `types/theme.ts`, `theme-tokens.ts` (NEW), `skeleton-doc.ts` (NEW), `constants.ts` (EVENTS).
- WP0-css-apply: `index.css`, `features/theme/apply.ts`.
- WP0-haptics: `stores/haptics.ts` (NEW), `utils/haptics.ts` (NEW).

**Wave 1 — components (parallel, disjoint):**
- WP1-leaderboard `Leaderboard.tsx` · WP1-podium `Podium.tsx` · WP1-teams `utils/teams.ts`+`Wait.tsx`+`Room.tsx`+`TeamLeaderboard.tsx` · WP1-timer `CircularTimer.tsx` · WP1-responses `Responses.tsx` · WP1-gamewrapper `GameWrapper.tsx`(footer+haptics toggle)+`Prepared.tsx` · WP1-answers `Answers.tsx` · WP1-result `Result.tsx` · WP1-solo `SoloAnswers.tsx` · WP1-start-question `Start.tsx`+`Question.tsx`.

**Wave 2 — skeleton plumbing (parallel, disjoint):**
- WP2-backend `socket/package.json`+`http-routes.ts`+`config.ts`+`handlers/manager.ts` · WP2-manager-theme `ConfigTheme.tsx` · WP2-manager-skeleton `ConfigSkeleton.tsx`+`configurations/index.tsx`.

**Wave 3 — review + gate:** adversarial review per file → `pnpm verify` + `pnpm build` → fix → commit.

### Hard rules for every WP agent
- Edit **only** the files listed in your WP. Do not touch shared contract files.
- Do **not** run `git`. The orchestrator commits centrally.
- Token names/paths/defaults are frozen by this doc — do not invent.
- Read the file before editing; preserve existing imports, motion, a11y, i18n.
- Tokenization must be a visual no-op with the default theme.
