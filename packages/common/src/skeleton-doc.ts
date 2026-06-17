import type { Theme } from "@razzoozle/common/types/theme"
import { THEME_TOKENS } from "@razzoozle/common/theme-tokens"

// Read a dot-path ("stateColors.correct") off the theme without `any`. Returns
// the value as `unknown`; callers stringify it for the doc table.
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

// Stringify a token value for the markdown table (hex strings stay as-is;
// null/undefined render as the bundled-default marker).
function fmt(value: unknown): string {
  if (value === null || value === undefined) return "_(bundled default)_"
  if (typeof value === "string") return `\`${value}\``
  return `\`${JSON.stringify(value)}\``
}

/**
 * renderSkeletonDoc — pure function. Generates the SKELETON.md LLM contract doc
 * from the live theme + the THEME_TOKENS registry. No side effects, no I/O.
 *
 * Sections: (1) what a skeleton is + ZIP layout; (2) full token table (registry
 * tokens + the bespoke originals with current values); (3) CSS-override selector
 * notes; (4) the window.razzoozle JS surface + XSS warning; (5) asset slots;
 * (6) a worked "ask an LLM to regenerate" prompt.
 */
export function renderSkeletonDoc(theme: Theme): string {
  // Registry token rows (CSS var · controls dot-path · current value).
  const tokenRows = THEME_TOKENS.map((tok) => {
    const current = fmt(getPath(theme, tok.path))
    return `| \`${tok.cssVar}\` | \`${tok.path}\` | ${tok.label} — ${tok.description} | ${current} |`
  }).join("\n")

  // Bespoke originals — kept hand-written (not in THEME_TOKENS) because they are
  // not 1:1 hex CSS vars (radius px, scrim /100, style attr, answer array, …).
  const bespokeRows = [
    [
      "`--color-primary`",
      "`colorPrimary`",
      "Primary brand color.",
      fmt(theme.colorPrimary),
    ],
    [
      "`--color-secondary`",
      "`colorSecondary`",
      "Secondary brand color.",
      fmt(theme.colorSecondary),
    ],
    [
      "`--color-text`",
      "`colorText`",
      "Base foreground text color.",
      fmt(theme.colorText),
    ],
    [
      "`--accent`",
      "`accentColor`",
      "Accent / highlight color.",
      fmt(theme.accentColor),
    ],
    [
      "`--answer-1`",
      "`answerColors[0]`",
      "Answer tile 1 color.",
      fmt(theme.answerColors[0]),
    ],
    [
      "`--answer-2`",
      "`answerColors[1]`",
      "Answer tile 2 color.",
      fmt(theme.answerColors[1]),
    ],
    [
      "`--answer-3`",
      "`answerColors[2]`",
      "Answer tile 3 color.",
      fmt(theme.answerColors[2]),
    ],
    [
      "`--answer-4`",
      "`answerColors[3]`",
      "Answer tile 4 color.",
      fmt(theme.answerColors[3]),
    ],
    [
      "`--answer-text`",
      "`answerTextColor`",
      "Answer tile text color.",
      fmt(theme.answerTextColor),
    ],
    [
      "`--radius`",
      "`radius`",
      "Corner radius in px (0–40).",
      fmt(theme.radius),
    ],
    [
      "`--bg-scrim`",
      "`scrim`",
      "Background scrim opacity (0–100, applied /100).",
      fmt(theme.scrim),
    ],
    [
      "`[data-theme-style]`",
      "`style`",
      "Visual style: `flat` or `glass`.",
      fmt(theme.style),
    ],
    ["—", "`appTitle`", "App title override (or null).", fmt(theme.appTitle)],
    ["—", "`logo`", "Brand logo asset path (or null).", fmt(theme.logo)],
    [
      "—",
      "`backgrounds.auth`",
      "Auth/result screen background.",
      fmt(theme.backgrounds.auth),
    ],
    [
      "—",
      "`backgrounds.managerGame`",
      "Host presentation background.",
      fmt(theme.backgrounds.managerGame),
    ],
    [
      "—",
      "`backgrounds.playerGame`",
      "Player phone in-game background.",
      fmt(theme.backgrounds.playerGame),
    ],
  ]
    .map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`)
    .join("\n")

  return `# Razzoozle Skeleton — Theme Contract

This document is generated from the **live theme** and the token registry. It is
the contract an LLM (or a human) follows to author a new skeleton. The values in
the table below are the *current* theme values — your skeleton overrides any of
them.

## 1. What a skeleton is + ZIP layout

A **skeleton** is a ZIP that restyles the entire Razzoozle game. It can carry:

- **theme tokens** (\`skeleton.json\`) — the JSON theme (colors, radius, style…),
- a free-form **\`theme.css\`** override (full CSS, runs after the base styles),
- a free-form **\`theme.js\`** script that runs on **every connected client**,
- **assets** (logo + per-screen backgrounds).

\`\`\`
skeleton.zip
├─ skeleton.json     { "formatVersion": 1, "name": string, "theme": Theme }
├─ theme.css         (optional) free CSS override
├─ theme.js          (optional) free JS — runs on ALL clients (manager-gated)
├─ SKELETON.md       generated on export; ignored on import
└─ assets/
   ├─ <logo>.svg|png|webp
   └─ backgrounds/{auth,managerGame,playerGame}.webp
\`\`\`

Every token's runtime default equals the current hardcoded value, so a theme
that only changes a few tokens stays visually consistent everywhere else.

## 2. Token table (CSS var · controls · current value)

These tokens are set 1:1 from a hex value in \`skeleton.json\`'s \`theme\`. Editing
the JSON value re-colors every place that reads the CSS var (rings/text/glow/soft
tints are *derived* via \`color-mix\`, so you only set the base).

| CSS var | Theme path | Controls | Current |
|---|---|---|---|
${tokenRows}

### Bespoke (hand-written) theme fields

These are not plain 1:1 hex tokens (px, /100, enum, array, asset paths) but are
still part of the theme JSON you author:

| CSS var | Theme path | Controls | Current |
|---|---|---|---|
${bespokeRows}

## 3. CSS-override notes (\`theme.css\`)

\`theme.css\` is injected as a stylesheet **after** the base styles, so it can
override anything. Useful selectors a skeleton can target:

- \`:root { --team-gold: #...; }\` — override any token var from §2 directly.
- \`[data-theme-style="flat"]\` / \`[data-theme-style="glass"]\` — style variant
  on the document; gate rules per style.
- \`.glass\`, \`.glass-panel\` (and other \`.glass*\` surfaces) — frosted panels.
- Answer button classes — the per-answer tiles (use the \`--answer-1..4\` vars
  rather than re-hardcoding).
- Leaderboard / podium class names — banners, medals, climber/faller chips
  (prefer the \`--tier-*\`, \`--rank-*\` tokens so glows stay derived).

Keep overrides scoped; \`!important\` is rarely needed since this sheet loads last.

## 4. JS surface (\`theme.js\`) + ⚠️ SECURITY WARNING

> ⚠️ **\`theme.js\` is stored-XSS by design.** It runs on **every player's phone
> and on the host screen**, with full DOM access, on every client that loads the
> game. Only paste code you fully trust. This is manager-gated (manager auth
> required to upload), but there is **no sandbox** — a malicious script can read
> input, exfiltrate data, or deface the game. Never paste code from an untrusted
> source.

Your script may read a minimal, documented global the app exposes before
injection:

\`\`\`js
// Available when theme.js runs:
window.razzoozle = {
  theme: { /* the full resolved Theme object (see §2 paths) */ },
  skeletonVersion: ${theme.skeletonVersion} // bumps on every skeleton change
}
\`\`\`

The script is re-injected (with a fresh cache-bust) when \`skeletonVersion\` bumps;
side effects from a previous version persist until a full page reload.

## 5. Asset slots

Put files under \`assets/\` in the ZIP; on import they are persisted and the theme
asset paths are rewritten to the served \`/theme/...\` or \`/media/backgrounds/...\`
URLs. Allowed extensions: \`svg\`, \`webp\`, \`png\`, \`jpg\`, \`jpeg\`, \`woff2\`.

| Slot | ZIP location | Theme path |
|---|---|---|
| Brand logo | \`assets/<logo>.{svg,png,webp}\` | \`logo\` |
| Auth background | \`assets/backgrounds/auth.webp\` | \`backgrounds.auth\` |
| Host background | \`assets/backgrounds/managerGame.webp\` | \`backgrounds.managerGame\` |
| Player background | \`assets/backgrounds/playerGame.webp\` | \`backgrounds.playerGame\` |

## 6. Ask an LLM to regenerate (worked prompt)

Copy the prompt below into any capable LLM, edit the brief, and paste this whole
document as context. Ask it to return a valid \`skeleton.json\`.

\`\`\`text
You are designing a Razzoozle quiz-game skin. I will give you the SKELETON.md
contract (above) which lists every theme token, its dot-path, and the current
value. Produce a single valid skeleton.json:

  { "formatVersion": 1, "name": "<short skin name>", "theme": { ...full Theme... } }

Brief: <describe the vibe — e.g. "neon synthwave: deep purple background, hot-pink
and cyan accents, gold podium, high-contrast answer tiles">.

Rules:
- Every color value MUST be a hex string (#rgb or #rrggbb).
- Keep the same theme shape and field names as the current theme exactly.
- "style" is "flat" or "glass". "radius" is 0–40. "scrim" is 0–100.
- Pick team colors (red/blue/green/yellow) that read as those names but match the
  skin. Tier colors (bronze/silver/gold/diamant) should feel metallic/gem-like.
- Leave logo and backgrounds as their current values (or null) unless I provide
  assets.
- Return ONLY the JSON, no prose.
\`\`\`

Optionally hand-author \`theme.css\` for effects the tokens can't express, and (if
you trust it) \`theme.js\` for behavior — but heed the §4 warning.
`
}
