/**
 * skeleton-demo.ts — pure generator for the preview/test artifacts shipped inside
 * the downloadable "skeleton" theming ZIP.
 *
 * The skeleton ZIP lets an LLM (or human) author a theme and *visually* test it by
 * opening these files in a browser. Everything here is:
 *   (a) themed by the SAME CSS variables the real game uses (see theme-tokens.ts +
 *       the live applyTheme), built into a :root block from the `theme` argument,
 *   (b) animated with CSS that mirrors the real in-game Motion presets
 *       (packages/web/src/features/game/animation/presets.ts), and
 *   (c) filled with realistic German demo data.
 *
 * Pure: no I/O, no side effects. Returns the file list; the caller writes the ZIP.
 */
import type { Theme } from "@razzoozle/common/types/theme"

// HTML-escape for any value interpolated into text/attribute positions. Theme
// values are colors/numbers (no markup), but we escape demo strings defensively.
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Build the `:root` CSS variable block from the theme — the exact map the real
 * game's applyTheme uses, so editing skeleton.json / theme.css visibly re-themes
 * these demos.
 */
function rootVars(theme: Theme): string {
  const a = theme.answerColors
  const lines: string[] = [
    `--color-primary: ${theme.colorPrimary};`,
    `--color-secondary: ${theme.colorSecondary};`,
    `--color-text: ${theme.colorText};`,
    `--color-accent: ${theme.accentColor};`,
    `--answer-1: ${a[0]};`,
    `--answer-2: ${a[1]};`,
    `--answer-3: ${a[2]};`,
    `--answer-4: ${a[3]};`,
    `--answer-text: ${theme.answerTextColor};`,
    `--radius-theme: ${theme.radius}px;`,
    `--bg-scrim: ${theme.scrim / 100};`,
    `--tier-bronze: ${theme.tierColors.bronze};`,
    `--tier-silver: ${theme.tierColors.silver};`,
    `--tier-gold: ${theme.tierColors.gold};`,
    `--tier-diamant: ${theme.tierColors.diamant};`,
    `--state-correct: ${theme.stateColors.correct};`,
    `--state-wrong: ${theme.stateColors.wrong};`,
    `--rank-up: ${theme.rankColors.up};`,
    `--rank-down: ${theme.rankColors.down};`,
    `--team-red: ${theme.teamColors.red};`,
    `--team-blue: ${theme.teamColors.blue};`,
    `--team-green: ${theme.teamColors.green};`,
    `--team-yellow: ${theme.teamColors.yellow};`,
    `--timer-urgent: ${theme.timerUrgent};`,
    `--streak-color: ${theme.streakColor};`,
    `--surface-muted: ${theme.surfaceMuted};`,
    `--footer-bg: ${theme.footerColors.bg};`,
    `--footer-text: ${theme.footerColors.text};`,
  ]
  return `  :root {\n${lines.map((l) => `    ${l}`).join("\n")}\n  }`
}

// ===========================================================================
// animations.css — mirrors the in-game Motion vocabulary (presets.ts) in CSS.
// ===========================================================================
function animationsCss(): string {
  return `/*
 * animations.css — documents the in-game motion vocabulary and drives the demo
 * previews in this ZIP.
 *
 * NOTE: the LIVE in-game motion is Motion/JS, defined in
 *   packages/web/src/features/game/animation/presets.ts
 * (springs, variant factories, the useReveal() reduced-motion hook). This CSS
 * does NOT run in the game — it MIRRORS the *feel* of those presets so the demo
 * HTML pages (and any LLM/human inspecting the ZIP) can preview a theme with
 * animations that match the real product. Keep these tokens/keyframes in sync
 * with presets.ts if the spring vocabulary changes.
 *
 * Mapping to presets.ts:
 *   --anim-duration-* ........ DURATION.fast / .base / .slow
 *   --anim-ease-out .......... EASE.out  (expo-out, snappy decelerating entrances)
 *   --anim-ease-inout ........ EASE.inOut
 *   --anim-stagger ........... STAGGER.base
 *   --anim-rise .............. RISE (fade-up distance)
 *   reveal-up ................ fadeUp() variant
 *   reveal-in ................ fadeIn() variant
 *   scale-in ................. scaleIn(0.92) variant
 *   pop ...................... popIn() overshoot variant
 *   emphasis ................. rank-change / climber pulse
 *   countdown ................ round timer ring/bar shrink
 */

:root {
  --anim-duration-fast: 0.2s;
  --anim-duration-base: 0.32s;
  --anim-duration-slow: 0.5s;
  /* expo-out — snappy, decelerating entrances (EASE.out) */
  --anim-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --anim-ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
  --anim-stagger: 0.06s;
  --anim-rise: 16px;
}

/* ---- keyframes (mirror the preset variants) ---- */

@keyframes reveal-up {
  from {
    opacity: 0;
    transform: translateY(var(--anim-rise));
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes reveal-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* overshoot pop — medals, result "moment of truth", reward badges (popIn) */
@keyframes pop {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  60% {
    opacity: 1;
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

/* rank-change / climber pulse (emphasis) */
@keyframes emphasis {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.06);
  }
  100% {
    transform: scale(1);
  }
}

/* round timer — width 100% -> 0 over the round */
@keyframes countdown {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

/* SVG ring variant of the countdown (stroke-dashoffset 0 -> full) */
@keyframes countdown-ring {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: var(--ring-circumference, 314);
  }
}

/* ---- utility classes ---- */

.anim-reveal-up {
  animation: reveal-up var(--anim-duration-base) var(--anim-ease-out) both;
}

.anim-reveal-in {
  animation: reveal-in var(--anim-duration-base) var(--anim-ease-out) both;
}

.anim-scale-in {
  animation: scale-in var(--anim-duration-base) var(--anim-ease-out) both;
}

.anim-pop {
  animation: pop var(--anim-duration-base) var(--anim-ease-out) both;
}

.anim-emphasis {
  animation: emphasis var(--anim-duration-slow) var(--anim-ease-inout) both;
}

/*
 * Stagger pattern: set an animation-delay on each list child, e.g.
 *   <li class="anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * 0)">
 *   <li class="anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * 1)">
 * The demo pages do exactly this.
 */

/* reduced motion — collapse to opacity-only / none, matching useReveal()'s rule */
@media (prefers-reduced-motion: reduce) {
  .anim-reveal-up,
  .anim-scale-in,
  .anim-pop {
    animation: reveal-in var(--anim-duration-fast) linear both;
  }
  .anim-emphasis {
    animation: none;
  }
  .countdown-bar,
  .countdown-ring-track {
    animation: none !important;
  }
  * {
    animation-delay: 0s !important;
  }
}
`
}

// ===========================================================================
// Shared HTML head/style scaffold for the demo pages.
// ===========================================================================

const SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'

/** Structural + glass CSS shared by every demo page. */
function baseStyle(theme: Theme): string {
  return `${rootVars(theme)}

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    font-family: ${SYSTEM_FONT};
    color: var(--color-text);
    min-height: 100%;
  }

  /* Background = secondary with a scrim overlay (opacity = --bg-scrim). */
  body {
    position: relative;
    background: var(--color-secondary);
    min-height: 100vh;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    background: #000;
    opacity: var(--bg-scrim);
    pointer-events: none;
    z-index: 0;
  }
  body > * { position: relative; z-index: 1; }

  /* ---- panel: flat by default ---- */
  .panel {
    background: var(--surface-muted);
    border-radius: var(--radius-theme);
    border: 1px solid transparent;
  }

  /* ---- glass treatment (only when html[data-theme-style="glass"]) ---- */
  html[data-theme-style="glass"] .panel {
    background: color-mix(in srgb, var(--surface-muted) 55%, transparent);
    backdrop-filter: blur(16px) saturate(1.6);
    -webkit-backdrop-filter: blur(16px) saturate(1.6);
    border: 1px solid color-mix(in srgb, #ffffff 22%, transparent);
  }
  html[data-theme-style="glass"] .glass {
    background: color-mix(in srgb, var(--color-secondary) 45%, transparent);
    backdrop-filter: blur(16px) saturate(1.6);
    -webkit-backdrop-filter: blur(16px) saturate(1.6);
    border: 1px solid color-mix(in srgb, #ffffff 22%, transparent);
  }

  .muted { color: color-mix(in srgb, var(--color-text) 65%, transparent); }
  .stack { display: flex; flex-direction: column; }

  h1, h2, h3 { margin: 0; line-height: 1.15; }`
}

/** Document shell: doctype, theme.css + animations.css links, page <style>. */
function htmlShell(
  theme: Theme,
  title: string,
  pageStyle: string,
  body: string,
): string {
  return `<!doctype html>
<html lang="de" data-theme-style="${esc(theme.style)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <!-- theme.css + animations.css live at the ZIP root; these demos live in demo/ -->
  <link rel="stylesheet" href="../theme.css" />
  <link rel="stylesheet" href="../animations.css" />
  <style>
${baseStyle(theme)}

${pageStyle}
  </style>
</head>
<body>
${body}
</body>
</html>
`
}

// ===========================================================================
// 1. phone-game.html — player answering on a phone.
// ===========================================================================
function phoneGameHtml(theme: Theme): string {
  const pageStyle = `  .phone {
    max-width: 420px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 14px 14px 0;
  }

  .hud {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
  }
  .hud .counter {
    font-weight: 700;
    font-size: 15px;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--color-text);
  }
  .hud .answered {
    margin-left: auto;
    font-size: 13px;
    font-weight: 600;
  }

  /* circular countdown ring */
  .timer-ring { width: 56px; height: 56px; flex: none; }
  .timer-ring .track { stroke: color-mix(in srgb, var(--color-text) 22%, transparent); }
  .timer-ring .progress {
    stroke: var(--color-accent);
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
    animation: countdown-ring 18s linear forwards;
  }
  .timer-ring.urgent .progress { stroke: var(--timer-urgent); }
  .timer-ring .label {
    font-size: 18px;
    font-weight: 800;
    fill: var(--color-text);
  }

  .question {
    text-align: center;
    font-size: 22px;
    font-weight: 800;
    line-height: 1.2;
    padding: 18px 8px 22px;
  }

  .answers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    flex: 1 1 auto;
    align-content: start;
  }
  .tile {
    color: var(--answer-text);
    border: none;
    border-radius: var(--radius-theme);
    min-height: 96px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
    transition: transform var(--anim-duration-fast) var(--anim-ease-out);
  }
  .tile:active { transform: scale(0.96); }
  .tile .shape { font-size: 22px; line-height: 1; }
  .tile.a1 { background: var(--answer-1); }
  .tile.a2 { background: var(--answer-2); }
  .tile.a3 { background: var(--answer-3); }
  .tile.a4 { background: var(--answer-4); }

  .footer {
    margin: 16px -14px 0;
    background: var(--footer-bg);
    color: var(--footer-text);
    padding: 14px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 700;
    font-size: 16px;
  }
  .footer .score { font-size: 20px; font-weight: 800; }`

  const body = `  <div class="phone">
    <div class="hud panel anim-reveal-in">
      <span class="counter">Frage 3/10</span>
      <svg class="timer-ring" viewBox="0 0 100 100" aria-label="Countdown 12 Sekunden">
        <circle class="track" cx="50" cy="50" r="44" fill="none" stroke-width="8" />
        <circle class="progress" cx="50" cy="50" r="44" fill="none" stroke-width="8"
          stroke-dasharray="276" style="--ring-circumference: 276" />
        <text class="label" x="50" y="50" text-anchor="middle" dominant-baseline="central">12</text>
      </svg>
      <span class="answered">12 geantwortet</span>
    </div>

    <div class="question anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * 1)">
      Was ist die Hauptstadt der Schweiz?
    </div>

    <div class="answers">
      <button class="tile a1 anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * 0)">
        <span class="shape">&#9650;</span><span>Bern</span>
      </button>
      <button class="tile a2 anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * 1)">
        <span class="shape">&#9670;</span><span>Z&uuml;rich</span>
      </button>
      <button class="tile a3 anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * 2)">
        <span class="shape">&#9679;</span><span>Genf</span>
      </button>
      <button class="tile a4 anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * 3)">
        <span class="shape">&#9632;</span><span>Basel</span>
      </button>
    </div>

    <div class="footer anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * 4)">
      <span class="name">Anna</span>
      <span class="score">3 200</span>
    </div>
  </div>`

  return htmlShell(theme, "Razzoozle — Spieler (Handy)", pageStyle, body)
}

// ===========================================================================
// 2. lobby.html — the room / lobby screen.
// ===========================================================================
function lobbyHtml(theme: Theme): string {
  const players: {
    name: string
    team?: "red" | "blue" | "green" | "yellow"
  }[] = [
    { name: "Anna", team: "red" },
    { name: "Ben", team: "blue" },
    { name: "Cleo", team: "green" },
    { name: "David", team: "yellow" },
    { name: "Emma", team: "red" },
    { name: "Finn" },
    { name: "Greta", team: "blue" },
    { name: "Hugo", team: "green" },
  ]

  const chips = players
    .map((p, i) => {
      const dot = p.team
        ? `<span class="dot" style="background: var(--team-${p.team})"></span>`
        : ""
      return `      <li class="chip panel anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * ${i})">${dot}<span>${esc(
        p.name,
      )}</span></li>`
    })
    .join("\n")

  // 5x5 QR placeholder pattern (1 = filled cell).
  const qrPattern = [
    1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1,
  ]
  const qrCells = qrPattern
    .map((on) => `<span class="qr-cell${on ? " on" : ""}"></span>`)
    .join("")

  const pageStyle = `  .lobby {
    max-width: 980px;
    margin: 0 auto;
    padding: 32px 20px 48px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .join {
    display: flex;
    align-items: center;
    gap: 32px;
    flex-wrap: wrap;
    justify-content: center;
    text-align: center;
  }
  .join .pin-block { display: flex; flex-direction: column; gap: 8px; }
  .join .pin-label { font-size: 14px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
  .join .pin {
    font-size: clamp(48px, 11vw, 96px);
    font-weight: 900;
    letter-spacing: 0.06em;
    color: var(--color-accent);
  }
  .join .url { font-size: 16px; font-weight: 600; }

  .qr {
    width: 132px;
    height: 132px;
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    grid-template-rows: repeat(5, 1fr);
    gap: 3px;
    background: #fff;
    border-radius: var(--radius-theme);
  }
  .qr-cell { background: transparent; border-radius: 2px; }
  .qr-cell.on { background: #111; }

  .section-title { font-size: 16px; font-weight: 800; margin-bottom: 12px; opacity: 0.9; }

  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 11px 18px;
    font-weight: 700;
    font-size: 16px;
  }
  .chip .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }

  .teams { display: flex; gap: 14px; flex-wrap: wrap; }
  .swatch {
    width: 96px;
    height: 96px;
    border-radius: var(--radius-theme);
    border: 3px solid transparent;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 10px;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0,0,0,0.45);
    cursor: pointer;
  }
  .swatch.red { background: var(--team-red); }
  .swatch.blue { background: var(--team-blue); }
  .swatch.green { background: var(--team-green); }
  .swatch.yellow { background: var(--team-yellow); }
  .swatch.selected {
    border-color: var(--color-text);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 70%, transparent);
  }`

  const body = `  <div class="lobby">
    <div class="join glass panel anim-pop" style="padding: 26px 30px;">
      <div class="pin-block">
        <span class="pin-label">Beitreten mit PIN</span>
        <span class="pin">123 456</span>
        <span class="url muted">razzoozle.app &middot; PIN 123456</span>
      </div>
      <div class="qr" aria-label="QR-Code zum Beitreten">${qrCells}</div>
    </div>

    <div>
      <div class="section-title">Spieler im Raum (${players.length})</div>
      <ul class="roster">
${chips}
      </ul>
    </div>

    <div>
      <div class="section-title">Team w&auml;hlen</div>
      <div class="teams">
        <button class="swatch red anim-scale-in" style="animation-delay: calc(var(--anim-stagger) * 0)">Rot</button>
        <button class="swatch blue selected anim-scale-in" style="animation-delay: calc(var(--anim-stagger) * 1)">Blau</button>
        <button class="swatch green anim-scale-in" style="animation-delay: calc(var(--anim-stagger) * 2)">Gr&uuml;n</button>
        <button class="swatch yellow anim-scale-in" style="animation-delay: calc(var(--anim-stagger) * 3)">Gelb</button>
      </div>
    </div>
  </div>`

  return htmlShell(theme, "Razzoozle — Lobby", pageStyle, body)
}

// ===========================================================================
// 3. presentation.html — the host / projector screen.
// ===========================================================================
function presentationHtml(theme: Theme): string {
  const bars: { label: string; pct: number; cls: string }[] = [
    { label: "Bern", pct: 62, cls: "a1" },
    { label: "Zürich", pct: 21, cls: "a2" },
    { label: "Genf", pct: 11, cls: "a3" },
    { label: "Basel", pct: 6, cls: "a4" },
  ]
  const barRows = bars
    .map(
      (
        b,
        i,
      ) => `        <div class="bar-row anim-reveal-up" style="animation-delay: calc(var(--anim-stagger) * ${i})">
          <span class="bar-label">${esc(b.label)}</span>
          <div class="bar-track">
            <div class="bar-fill ${b.cls}" style="width: ${b.pct}%"></div>
          </div>
          <span class="bar-pct">${b.pct}%</span>
        </div>`,
    )
    .join("\n")

  const rows: {
    rank: number
    name: string
    score: string
    leader?: boolean
    delta?: "up" | "down"
  }[] = [
    { rank: 1, name: "Anna", score: "9 840", leader: true },
    { rank: 2, name: "Cleo", score: "8 210", delta: "up" },
    { rank: 3, name: "Ben", score: "7 560", delta: "down" },
    { rank: 4, name: "Emma", score: "6 990", delta: "up" },
    { rank: 5, name: "David", score: "6 120" },
  ]
  const leaderRows = rows
    .map((r, i) => {
      const streak = r.leader ? '<span class="streak">&#128293; 7</span>' : ""
      const delta =
        r.delta === "up"
          ? '<span class="delta up">&#9650;</span>'
          : r.delta === "down"
            ? '<span class="delta down">&#9660;</span>'
            : ""
      const climber = r.delta === "up" ? " anim-emphasis" : ""
      const initial = r.name.slice(0, 1)
      return `        <li class="lb-row panel anim-reveal-up${climber}" style="animation-delay: calc(var(--anim-stagger) * ${i})">
          <span class="lb-rank">${r.rank}</span>
          <span class="lb-avatar">${esc(initial)}</span>
          <span class="lb-name">${esc(r.name)}${streak}</span>
          <span class="lb-score">${r.score}${delta}</span>
        </li>`
    })
    .join("\n")

  const pageStyle = `  .stage {
    max-width: 1200px;
    margin: 0 auto;
    padding: 36px 32px 56px;
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .q-head { text-align: center; }
  .q-head .q-text { font-size: clamp(30px, 4vw, 52px); font-weight: 900; line-height: 1.1; }

  .chart { display: flex; flex-direction: column; gap: 14px; padding: 26px; }
  .bar-row { display: flex; align-items: center; gap: 16px; }
  .bar-label { width: 96px; font-weight: 800; font-size: 20px; text-align: right; }
  .bar-pct { width: 64px; font-weight: 800; font-size: 20px; }
  .bar-track {
    flex: 1;
    height: 38px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-text) 14%, transparent);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 999px;
    width: 0;
    animation: bar-grow var(--anim-duration-slow) var(--anim-ease-out) both;
    animation-delay: 0.15s;
  }
  /* bar-grow animates from 0 to the inline width via a CSS var snapshot */
  .bar-fill.a1 { background: var(--answer-1); }
  .bar-fill.a2 { background: var(--answer-2); }
  .bar-fill.a3 { background: var(--answer-3); }
  .bar-fill.a4 { background: var(--answer-4); }
  @keyframes bar-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .bar-fill { transform-origin: left center; }

  .celebrate {
    text-align: center;
    padding: 20px 28px;
    border-radius: var(--radius-theme);
    background: color-mix(in srgb, var(--tier-gold) 30%, var(--surface-muted));
    border: 2px solid var(--tier-gold);
    box-shadow: 0 0 28px color-mix(in srgb, var(--tier-gold) 75%, transparent);
    font-size: 22px;
    font-weight: 800;
  }
  .celebrate .tier { color: var(--tier-gold); }

  .columns { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 30px; align-items: start; }
  @media (max-width: 860px) { .columns { grid-template-columns: 1fr; } }

  .leaderboard { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .lb-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    font-size: 18px;
  }
  .lb-rank { width: 28px; font-weight: 900; opacity: 0.8; }
  .lb-avatar {
    width: 42px; height: 42px; border-radius: 50%;
    background: var(--color-primary);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800;
  }
  .lb-name { flex: 1; font-weight: 700; display: flex; align-items: center; gap: 10px; }
  .lb-score { font-weight: 800; display: flex; align-items: center; gap: 8px; }
  .streak {
    font-size: 13px; font-weight: 800;
    color: #fff;
    background: var(--streak-color);
    padding: 2px 9px; border-radius: 999px;
  }
  .delta { font-size: 13px; }
  .delta.up { color: var(--rank-up); }
  .delta.down { color: var(--rank-down); }

  /* podium */
  .podium { display: flex; align-items: flex-end; justify-content: center; gap: 14px; }
  .pod { width: 120px; border-radius: var(--radius-theme); padding: 14px 10px; text-align: center; color: #111; }
  .pod .medal { font-size: 30px; }
  .pod .pod-name { font-weight: 800; font-size: 17px; margin-top: 4px; }
  .pod .pod-score { font-weight: 700; font-size: 14px; opacity: 0.8; }
  .pod.first { height: 200px; background: var(--tier-gold); }
  .pod.second { height: 158px; background: var(--tier-silver); }
  .pod.third { height: 128px; background: var(--tier-bronze); color: #fff; }`

  const body = `  <div class="stage">
    <div class="q-head anim-reveal-up">
      <div class="q-text">Was ist die Hauptstadt der Schweiz?</div>
    </div>

    <div class="chart panel">
${barRows}
    </div>

    <div class="celebrate anim-pop">
      <span class="tier">&#9733; Gold-Serie!</span> Anna knackt 7 in Folge
    </div>

    <div class="columns">
      <div>
        <ul class="leaderboard">
${leaderRows}
        </ul>
      </div>

      <div class="podium">
        <div class="pod second anim-pop" style="animation-delay: calc(var(--anim-stagger) * 1)">
          <div class="medal">&#129352;</div>
          <div class="pod-name">Cleo</div>
          <div class="pod-score">8 210</div>
        </div>
        <div class="pod first anim-pop" style="animation-delay: calc(var(--anim-stagger) * 0)">
          <div class="medal">&#129351;</div>
          <div class="pod-name">Anna</div>
          <div class="pod-score">9 840</div>
        </div>
        <div class="pod third anim-pop" style="animation-delay: calc(var(--anim-stagger) * 2)">
          <div class="medal">&#129353;</div>
          <div class="pod-name">Ben</div>
          <div class="pod-score">7 560</div>
        </div>
      </div>
    </div>
  </div>`

  return htmlShell(theme, "Razzoozle — Präsentation", pageStyle, body)
}

// admin.html — the manager console. Deliberately uses FIXED colors (the real
// console palette), NOT the theme tokens and NOT ../theme.css: the admin UI is
// theme-INDEPENDENT — an uploaded skeleton must never restyle it (the live
// console pins these via .console-shell in console/tokens.css). This page shows
// that fixed look so an LLM knows the admin interface is off-limits for theming.
function adminHtml(): string {
  return `<!doctype html>
<html lang="de" data-reduced="false">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Razzoozle — Admin (Konsole)</title>
<style>
  :root {
    --brand: #7c3aed; --brand-tint: #ece7fb; --brand-deep: #4c1d95;
    --ink: #111827; --text: #374151; --muted: #6b7280;
    --panel: #ffffff; --app: #f9fafb; --line: #e5e7eb;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--app); color: var(--text); }
  .notice {
    display: flex; gap: .5rem; align-items: center; justify-content: center;
    background: var(--brand-tint); color: var(--brand-deep);
    font-size: .85rem; font-weight: 600; padding: .55rem 1rem; text-align: center;
  }
  .shell {
    margin: .75rem; background: var(--app); border-radius: 1rem; overflow: hidden;
    box-shadow: 0 10px 30px rgb(17 24 39 / .12); border: 1px solid var(--line);
    animation: rise .32s cubic-bezier(.16,1,.3,1) both;
  }
  .head {
    display: flex; align-items: center; gap: 1rem;
    padding: .85rem 1.25rem; border-bottom: 1px solid var(--line);
    background: linear-gradient(90deg, var(--brand-tint), var(--panel));
  }
  .wordmark { font-weight: 800; color: var(--brand); font-size: 1.15rem; }
  .head .sep { width: 1px; height: 1.25rem; background: var(--line); }
  .head h1 { margin: 0; font-size: 1rem; font-weight: 600; color: var(--text); }
  .head .actions { margin-left: auto; display: flex; gap: .5rem; }
  .btn {
    border: 1px solid var(--line); background: var(--panel); color: var(--text);
    border-radius: .55rem; padding: .5rem .85rem; font-size: .85rem; font-weight: 600;
    cursor: pointer; display: inline-flex; align-items: center; gap: .4rem;
  }
  .btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
  .body { display: flex; min-height: 540px; }
  .nav { width: 220px; border-right: 1px solid var(--line); padding: .75rem; background: var(--panel); }
  .nav a {
    display: block; padding: .5rem .7rem; border-radius: .55rem; color: var(--text);
    text-decoration: none; font-size: .9rem; font-weight: 500; margin-bottom: .15rem;
  }
  .nav a.active { background: var(--brand-tint); color: var(--brand-deep); font-weight: 700; }
  .main { flex: 1; padding: 1.5rem 1.75rem; background: var(--app); }
  .main h2 { margin: 0 0 .35rem; color: var(--ink); }
  .main p.sub { margin: 0 0 1.25rem; color: var(--muted); font-size: .9rem; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: .85rem; padding: 1.1rem 1.25rem; margin-bottom: 1.1rem; }
  .card h3 { margin: 0 0 .9rem; font-size: .95rem; color: var(--ink); }
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .6rem; }
  .swatch { display: flex; align-items: center; gap: .6rem; font-size: .85rem; }
  .chip { width: 28px; height: 28px; border-radius: .5rem; border: 1px solid rgb(17 24 39 / .12); flex: none; }
  .swatch .hex { color: var(--muted); font-variant-numeric: tabular-nums; }
  .row { display: flex; flex-wrap: wrap; gap: .6rem; }
  @keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .shell { animation: none; } }
</style>
</head>
<body>
  <div class="notice">🔒 Admin-Oberfläche — vom Skeleton NICHT verändert (theme-independent)</div>
  <div class="shell">
    <header class="head">
      <span class="wordmark">Razzoozle</span>
      <span class="sep"></span>
      <h1>Konfiguration</h1>
      <div class="actions">
        <button class="btn">Vorschau</button>
        <button class="btn primary">Spiel starten</button>
      </div>
    </header>
    <div class="body">
      <nav class="nav">
        <a>Spiel</a>
        <a>Quizze</a>
        <a>Spielmodus</a>
        <a>Katalog</a>
        <a>Medien</a>
        <a>KI</a>
        <a>Trophäen</a>
        <a>Ergebnisse</a>
        <a class="active">Design</a>
        <a>Anzeige</a>
        <a>Einsendungen</a>
      </nav>
      <main class="main">
        <h2>Design</h2>
        <p class="sub">Farben, Stil und das Skeleton — alles an einem Ort. Die Konsole selbst bleibt unverändert.</p>
        <div class="card">
          <h3>Theme-Farben</h3>
          <div class="swatches">
            <div class="swatch"><span class="chip" style="background:#7c3aed"></span> Primär <span class="hex">#7C3AED</span></div>
            <div class="swatch"><span class="chip" style="background:#ff9900"></span> Akzent <span class="hex">#FF9900</span></div>
            <div class="swatch"><span class="chip" style="background:#ef4444"></span> Team Rot <span class="hex">#EF4444</span></div>
            <div class="swatch"><span class="chip" style="background:#3b82f6"></span> Team Blau <span class="hex">#3B82F6</span></div>
            <div class="swatch"><span class="chip" style="background:#22c55e"></span> Team Grün <span class="hex">#22C55E</span></div>
            <div class="swatch"><span class="chip" style="background:#facc15"></span> Team Gelb <span class="hex">#FACC15</span></div>
            <div class="swatch"><span class="chip" style="background:#eab308"></span> Tier Gold <span class="hex">#EAB308</span></div>
            <div class="swatch"><span class="chip" style="background:#9ca3af"></span> Tier Silber <span class="hex">#9CA3AF</span></div>
            <div class="swatch"><span class="chip" style="background:#b45309"></span> Tier Bronze <span class="hex">#B45309</span></div>
          </div>
        </div>
        <div class="card">
          <h3>Skeleton</h3>
          <div class="row">
            <button class="btn primary">Skeleton herunterladen</button>
            <button class="btn">Skeleton hochladen (ZIP)</button>
            <button class="btn">Auf Standard zurücksetzen</button>
          </div>
        </div>
      </main>
    </div>
  </div>
</body>
</html>
`
}

// ===========================================================================
// Public API.
// ===========================================================================
export function renderSkeletonDemo(
  theme: Theme,
): { path: string; content: string }[] {
  return [
    { path: "animations.css", content: animationsCss() },
    { path: "demo/phone-game.html", content: phoneGameHtml(theme) },
    { path: "demo/lobby.html", content: lobbyHtml(theme) },
    { path: "demo/presentation.html", content: presentationHtml(theme) },
    { path: "demo/admin.html", content: adminHtml() },
  ]
}
