<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### A self-hosted, open-source live quiz platform — with a clean, flat **cream** design (and an optional liquid-glass theme).

🌐 **English** · [Deutsch](README.de.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/tests-500%2B-3DBFA0)

**[▶ Live demo](https://razzoozle.joelduss.xyz)** · **[📚 Docs](docs/)** · **[Report an issue](https://github.com/joehomeskillet/Razzoozle/issues)** · *forked from [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🧩 What is this?

Razzoozle is a self-hosted, real-time **quiz game** for classrooms, events and game nights. A host opens a game on the big screen, players join from their phones with a PIN, and everyone races to answer — faster correct answers score more. It is a friendly fork of [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), rebuilt around a clean, flat **cream** design (liquid-glass is now an optional theme) with a manager-driven theming system, gamification, team & solo play and local AI image generation — while keeping the classic Kahoot-style presenter + phone experience (colored answer tiles with shapes, a countdown, a podium).

> Razzoozle is an independent open-source project. It is not affiliated with, endorsed by, or connected to Kahoot!® or any other commercial quiz platform.

---

## 📸 Screenshots

<div align="center">

| Presenter / host | Desktop game client |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> |

| Player phone | Avatar selection |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Player phone" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar selection" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager theme cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## ✦ What Razzoozle adds over Razzia

| | Feature |
| --- | --- |
| 🎨 | **Theme cockpit** — a live manager "Design" tab: colours, per-view backgrounds, logo, radius and a **Flat ⇄ Glass** style toggle, with presets (a flat **cream** default + an optional violet **liquid-glass** preset) and contrast-aware colour pickers. |
| ☕ | **Flat cream design** — a warm flat cream interface with a living animated backdrop (drifting blobs + floating school/knowledge icons), a flat "Zig" wordmark/logo, and ink-on-cream answer tiles. |
| 🧊 | **Liquid-glass UI** — an optional, legacy glassmorphism theme variant (frosted, blurred surfaces) that never touches the flat baseline. |
| 🎯 | **Kahoot-faithful game screens** — answer tiles with the classic shape icons (triangle / diamond / circle / square), a circular countdown timer, an answers-received counter, and an animated podium. |
| 🧑‍🎨 | **Player avatars** — each player gets a generated DiceBear avatar (pick a style + reroll, or upload your own); avatars float around the lobby and appear on leaderboards, the podium and the awards. |
| 🏆 | **Gamification** — 15 achievements, medals, streaks, confetti and sound chimes, plus a personal trophy gallery. |
| 🥇 | **End-game awards recap** — an animated superlatives sequence (fastest finger, biggest climber, longest streak, comeback kid…) showing each winner's avatar + name, auto-paced in autoplay. |
| 👥 | **Team mode** — red / blue / green / yellow teams with a live team leaderboard. |
| 📱 | **Solo play** — practise any quiz alone via a share link, with its own score history. |
| ✍️ | **More question types** — multiple-select, type-the-answer and slider, on top of classic single choice. |
| 🔌 | **Plugin system** — manager-installable ZIP add-ons with their own "Plugins" tab. |
| 📦 | **Skeleton theme ZIPs** — download/upload a whole-game theme as an LLM-readable ZIP ("skeleton": design tokens + CSS + JS + a SKELETON.md contract). |
| 📳 | **Mobile haptics** — optional vibration feedback on player phones (countdown, answers), reduced-motion aware. |
| 🔗 | **Shareable results** — rich per-result link previews (Open Graph unfurl), a result page with "play it yourself / host your own" calls-to-action, and downloadable winner stickers. |
| 🤝 | **Community questions** — a public submission page with a manager moderation queue, plus a reusable question catalog and a quiz archive. |
| 🖼️ | **Local AI images** — generate question/theme imagery on-device via ComfyUI (Z-Image), or plug in cloud providers — keys stay server-side. |
| 🌍 | **6 languages + PWA** — English, German, French, Spanish, Italian, Chinese; installable, offline-aware. |
| 📺 | **Beamer kiosk + reliability** — a `/display` projector view, low-latency mode, crash-recovery, reconnect, and an MCP server for AI-tool control. |

Backed by **500+ automated tests**, a path-traversal + `ws`-CVE security pass, and a health-gated Docker deploy. Load-tested to **600 concurrent players**.

---

## ⚙️ Prerequisites

**With Docker (recommended):** Docker + Docker Compose.
**Without Docker:** Node.js 22+ and pnpm 11+.

---

## 📖 Getting started

### 🐳 Docker (recommended)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```

The app starts on `http://127.0.0.1:3011` (nginx + the socket server in one container). Configuration and user data live in the `./config` volume, created and seeded on first boot. Put it behind your own reverse proxy (Caddy, nginx, Traefik…) for TLS and a public hostname.

### 🛠️ Without Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # production build
pnpm start        # or: pnpm dev  (web + socket, hot reload)
```

---

## 🎮 How to play

1. Open `/manager` on the host machine and sign in with the manager password.
2. Pick a quiz and start a game — a PIN appears (show it on the beamer via `/display`).
3. Players open the site on their phones, enter the PIN and a name.
4. Answer as fast as you can — faster correct answers score more.
5. Watch the leaderboard, medals and confetti between rounds.

Prefer playing alone? Open any quiz's **solo** share link and practise at your own pace.

---

## ⚙️ Configuration

Runtime data lives in `config/` (git-ignored, seeded on first boot).

### Game settings — `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // CHANGE THIS — the default blocks manager access
  "teamMode": false,             // enable red/blue/green/yellow teams
  "lowLatencyMode": { "enabled": false } // opt-in timing/UX tightening (see docs/LOW-LATENCY-MODE.md)
}
```

### Quizzes — `config/quizz/*.json`

Build quizzes in the manager's editor (recommended) or as JSON. A question supports several `type`s (`choice`, `boolean`, `slider`, plus multiple-select via several `solutions`, and type-the-answer):

```jsonc
{
  "subject": "Python Basics",
  "questions": [
    {
      "question": "Which keyword defines a function in Python?",
      "type": "choice",
      "answers": ["func", "def", "function", "fun"],
      "solutions": [1],          // 0-based indices; multiple = multi-select
      "time": 20,                 // seconds to answer (5–120)
      "cooldown": 5,              // seconds before the answer is revealed (3–15)
      "media": { "type": "image", "url": "https://placehold.co/600x400.png" } // optional
    }
  ]
}
```

The AI provider (off / local ComfyUI / cloud) is configured in the manager's **AI** tab; API keys are stored server-side in `config/` and never sent to clients.

---

## 📺 Beamer / kiosk display

`/display` renders the host presentation fullscreen for a projector or TV (vh-scaled type that reads across a room), pairable from a phone. A `/satellite/<gameId>` route is a control-free kiosk view that authenticates with a token (no manager password). An optional Raspberry-Pi satellite image is included.

---

## 🧱 Tech stack

A pnpm monorepo — **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), **`@razzoozle/socket`** (Node + Socket.IO + Express, crash-recovery snapshots), **`@razzoozle/common`** (shared Zod-validated types), and **`@razzoozle/mcp`** (an MCP server for AI-tool control). Ships as a single Docker image (nginx + node via supervisord) with a `/healthz` endpoint + Docker `HEALTHCHECK`.

---

## 🤝 Contributing

Issues and pull requests are welcome. Run `pnpm verify` (typecheck + lint + tests) before opening a PR.

---

## ⭐ Star history

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Star history" />
</a>

---

## 📝 Credits & license

Razzoozle is a fork of [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — huge thanks to the upstream authors. Released under the **[MIT License](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle contributors); the upstream MIT notice is retained.
