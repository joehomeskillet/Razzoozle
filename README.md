<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

**A self-hosted, open-source live quiz platform — with a violet liquid-glass interface.**

🌐 **English** · [Deutsch](README.de.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

[Live demo](https://razzoozle.joelduss.xyz) · [Report an issue](https://github.com/joehomeskillet/Razzoozle/issues)

</div>

---

## 🧩 What is this?

Razzoozle is a self-hosted, real-time **quiz game** for classrooms, events and game nights: a host opens a game on the big screen, players join from their phones with a PIN, and everyone races to answer. It is a friendly fork of [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), rebuilt around a distinctive **violet liquid-glass** look, a manager-driven theming system, gamification, solo play and local AI image generation.

> Razzoozle is an independent open-source project. It is not affiliated with, endorsed by, or connected to Kahoot!® or any other commercial quiz platform.

<div align="center">
<img src="docs/screenshots/join.webp" width="32%" alt="Join screen" />
<img src="docs/screenshots/solo-question.webp" width="22%" alt="Question screen" />
<img src="docs/screenshots/leaderboard.webp" width="22%" alt="Leaderboard" />
</div>

---

## ✦ What Razzoozle adds over Razzia

A small, honest summary of what this fork brings on top of upstream Razzia:

| | Feature |
| --- | --- |
| 🎨 | **Theme cockpit** — a live manager "Design" tab: colours, per-view backgrounds, logo, radius and a **Flat ⇄ Glass** style toggle, with presets (ships a violet **liquid-glass** preset + a flat default) and contrast-aware colour pickers. |
| 🧊 | **Liquid-glass UI** — an opt-in glassmorphism theme variant (frosted, blurred surfaces) that never touches the flat baseline. |
| 🏆 | **Gamification** — 15 achievements, medals, streaks, confetti and sound chimes, plus a personal trophy gallery. |
| 👥 | **Team mode** — red / blue / green / yellow teams with a live team leaderboard. |
| 📱 | **Solo play** — practise any quiz alone via a share link, with its own score history. |
| ✍️ | **More question types** — multiple-select and type-the-answer, in addition to classic choice + slider. |
| 🤝 | **Community questions** — a public submission page with a manager moderation queue, plus a reusable question catalog and a quiz archive. |
| 🖼️ | **Local AI images** — generate question/theme imagery on-device via ComfyUI (Z-Image), or plug in cloud providers — keys stay server-side. |
| 🌍 | **6 languages + PWA** — English, German, French, Spanish, Italian, Chinese; installable, offline-aware. |
| 📺 | **Beamer kiosk + reliability** — a dedicated `/display` projector view, low-latency mode, crash-recovery, reconnect, and an MCP server for AI-tool control. |

All of it is covered by **350+ automated tests** and a health-gated Docker deploy.

---

## ⚙️ Prerequisites

**With Docker (recommended):** Docker + Docker Compose.
**Without Docker:** Node 22+ and pnpm 11+.

---

## 📖 Getting started

### Docker (recommended)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```

This builds the image and starts the app on `http://127.0.0.1:3011` (nginx + the socket server in one container). Configuration and user data live in the `./config` volume, which is created and seeded on first boot.

Put it behind your own reverse proxy (Caddy, nginx, Traefik…) for TLS and a public hostname.

### Without Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build
pnpm start
```

Dev mode (web + socket with hot reload): `pnpm dev`.

---

## 🎮 How to play

1. Open `/manager` on the host machine and sign in with the manager password (`config/game.json`).
2. Pick a quiz and start a game — a PIN appears on screen (show it on the beamer via `/display`).
3. Players open the site on their phones, enter the PIN and a name.
4. Answer as fast as you can — faster correct answers score more.
5. Watch the leaderboard, medals and confetti between rounds.

Prefer playing alone? Open any quiz's **solo** share link and practise at your own pace.

---

## ⚙️ Configuration

Runtime data lives in `config/` (git-ignored, seeded on first boot):

- `config/game.json` — game rules + the manager password.
- `config/quizz/*.json` — your quizzes.
- `config/theme/theme.json` — the active theme (or pick a preset in the Design tab).
- `config/ai-settings.json` — AI provider selection (keys are stored separately, never sent to clients).

A quiz is plain JSON — for example:

```jsonc
{
  "subject": "General knowledge",
  "questions": [
    {
      "question": "What colour is the sky on a clear day?",
      "type": "choice",
      "answers": ["Green", "Blue", "Red", "Yellow"],
      "solution": 1,
      "time": 15,
      "cooldown": 5
    }
  ]
}
```

You can also build quizzes in the manager UI, generate images with AI, or accept community submissions.

---

## 🧱 Tech stack

A pnpm monorepo: **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), **`@razzoozle/socket`** (Node + Socket.IO + Express), **`@razzoozle/common`** (shared Zod-validated types), and **`@razzoozle/mcp`** (an MCP server for AI-tool control). Ships as a single Docker image (nginx + node via supervisord).

---

## 📝 Credits & license

Razzoozle is a fork of [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — huge thanks to the upstream authors. Released under the **[MIT License](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle contributors). The upstream MIT notice is retained.

Contributions welcome — open an issue or a pull request.
