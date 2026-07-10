<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Self-hosted, open-source live quiz platform — a Kahoot-style presenter + phone game with a clean cream design.

🌐 **English** · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Live demo](https://razzoozle.joelduss.xyz)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Docs](docs/)** · **[🖥️ Desktop app](https://github.com/joehomeskillet/razzoozle-desktop)** · **[Report an issue](https://github.com/joehomeskillet/Razzoozle/issues)** · *forked from [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## What is it?

Razzoozle is a self-hosted, real-time **quiz game** for classrooms, events and game nights. A host opens a game on the big screen, players join from their phones with a PIN, and faster correct answers score more. It's a friendly fork of [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) with a manager-driven theme cockpit, gamification, team & solo play, and local AI images — keeping the classic colored-tile presenter + phone experience.

> Independent open-source project. Not affiliated with, endorsed by, or connected to Kahoot!® or any other commercial quiz platform.

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

## Quickstart

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

docker compose -f compose.node.yml up -d   # Node backend → http://127.0.0.1:3010
# or
docker compose -f compose.rust.yml up -d   # Rust backend → http://127.0.0.1:3011
```

Each file is self-contained (app + its own Postgres) and independent, so you can run both side by side. Open the app, go to `/manager`, and **change the default manager password**. Put a reverse proxy (Caddy/Traefik/nginx) in front for TLS and a public hostname.

No database wanted? Set `DATABASE_MODE=file` to run without Postgres. Without Docker: `pnpm install && pnpm build && pnpm start` (needs Node 22+ and pnpm 11+).

---

## ✦ What Razzoozle adds over Razzia

| | Feature |
| --- | --- |
| 🎨 | **Theme cockpit** — a live manager "Design" tab: colours, per-view backgrounds, logo, radius and a **Flat ⇄ Glass** style toggle, with presets (a flat **cream** default + an optional violet **liquid-glass** preset) and contrast-aware colour pickers. |
| ☕ | **Flat cream design** — a warm flat cream interface with a living animated backdrop (drifting blobs + floating school/knowledge icons), a flat wordmark/logo, and ink-on-cream answer tiles. |
| 🧊 | **Liquid-glass UI** — an optional, legacy glassmorphism theme variant (frosted, blurred surfaces) that never touches the flat baseline. |
| 🎯 | **Kahoot-faithful game screens** — answer tiles with the classic shape icons (triangle / diamond / circle / square), a circular countdown timer, an answers-received counter, and an animated podium. |
| 🧑‍🎨 | **Player avatars** — each player gets a generated DiceBear avatar (pick a style + reroll, or upload your own); avatars float around the lobby and appear on leaderboards, the podium and the awards. |
| 🏆 | **Gamification** — 15 achievements, medals, streaks, confetti and sound chimes, plus a personal trophy gallery. |
| 🥇 | **End-game awards recap** — an animated superlatives sequence (fastest finger, biggest climber, longest streak, comeback kid…) showing each winner's avatar + name, auto-paced in autoplay. |
| 👥 | **Team mode** — red / blue / green / yellow teams with a live team leaderboard. |
| 📱 | **Solo play** — practise any quiz alone via a share link, with its own score history. |
| ✍️ | **More question types** — multiple-select, type-the-answer and slider, on top of classic single choice. |
| 📳 | **Mobile haptics** — optional vibration feedback on player phones (countdown, answers), reduced-motion aware. |
| 🔗 | **Shareable results** — rich per-result link previews (Open Graph unfurl), a result page with "play it yourself / host your own" calls-to-action, and downloadable winner stickers. |
| 🤝 | **Community questions** — a public submission page with a manager moderation queue, plus a reusable question catalog and a quiz archive. |
| 🖼️ | **Local AI images** — generate question/theme imagery on-device via ComfyUI (Z-Image), or plug in cloud providers — keys stay server-side. |
| 🌍 | **6 languages + PWA** — English, German, French, Spanish, Italian, Chinese; installable, offline-aware. |
| 📺 | **Beamer kiosk + reliability** — a `/display` projector view, low-latency mode, crash-recovery, reconnect, and an MCP server for AI-tool control. |

Backed by **592+ automated tests**, a path-traversal + `ws`-CVE security pass, a hardened unauthenticated surface (per-game resource caps + game eviction, per-IP rate-limits, manager-auth brute-force throttling, server-minted host-token auth closing IDOR), and a health-gated Docker deploy. Load-tested to **600 concurrent players**.

---

## Backends

Razzoozle ships **two interchangeable backends** speaking the same socket.io protocol over one shared Postgres database — switch per client in the manager UI or with `VITE_DEFAULT_BACKEND`. The **Rust** server (`axum` + `socketioxide`, memory-safe and low-footprint) covers all gameplay, manager, player and display flows. The **Node.js** server (`packages/socket`) is fully featured and the self-contained default in `compose.node.yml`. A few peripheral HTTP endpoints (Prometheus metrics, client telemetry, social-share unfurl, the OpenAPI doc) are Node-only.

**→ Rust internals, build & tests: [`rust/README.md`](rust/README.md)**

---

## Agentically developed

Razzoozle is developed almost entirely by AI coding agents, orchestrated by human oversight. A diverse team of specialized models and tools works together to build features, test, review and deploy.

| Agent | Role |
| --- | --- |
| Claude | Orchestration & review |
| Codex (GPT-5.6) | Full-stack implementation |
| Cursor (GPT-5.6) | Code refinement & fix |
| Grok (xAI) | Rust backend implementation |
| Gemini (Google) | Long-context review & judging |
| Open models | Qwen, DeepSeek, Nemotron |
| Local inference | OpenVINO on Intel Arc |
| Browser QA (Playwright) | End-to-end game testing |

Humans review and merge every commit. AI augments speed and quality, not replaces judgment.

---

## Configuration & docs

Runtime data lives in the `config` volume, seeded on first boot. Game settings are in `config/game.json`; quizzes are authored in the manager editor or as `config/quizz/*.json`. See **[docs/](docs/)**: [Self-Hosting](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-latency mode](docs/LOW-LATENCY-MODE.md).

---

## Apps & companions

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Beta)** — a native Windows app to host and manage games without a browser.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — a lightweight discovery service (it never relays gameplay).

---

## Contributing

Issues and pull requests are welcome. Run `pnpm verify` (typecheck + lint + tests) before opening a PR; for Rust changes, run `bash rust/gate.sh`.

---

## Credits & license

A fork of [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — thanks to the upstream authors. Released under the **[MIT License](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle contributors).
