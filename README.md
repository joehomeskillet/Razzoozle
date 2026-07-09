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

Razzoozle is a self-hosted, real-time **quiz game** for classrooms, events and game nights. A host opens a game on the big screen, players join from their phones with a PIN, and faster correct answers score more. It's a friendly fork of [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) with a manager-driven theme cockpit, gamification, team & solo play, plugins and local AI images — keeping the classic colored-tile presenter + phone experience.

> Independent open-source project. Not affiliated with, endorsed by, or connected to Kahoot!® or any other commercial quiz platform.

<img src="docs/screenshots/presenter.webp" width="640" alt="Presenter view" />

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

## Features

- **Theme cockpit** — a live "Design" tab: colors, per-view backgrounds, logo, radius, a Flat ⇄ Glass toggle and presets.
- **Kahoot-faithful screens** — shape answer tiles, a circular countdown, an answers-received counter and an animated podium.
- **Gamification** — 15 achievements, medals, streaks, confetti, an end-game superlatives recap, and generated player avatars.
- **7 question types** — single & multiple choice, true/false, type-the-answer and slider.
- **Team & solo** — colored teams with a live leaderboard, or practise any quiz alone via a share link.
- **Plugins & skeleton themes** — manager-installable ZIP add-ons and downloadable whole-game theme bundles.
- **Local AI images** — generate question/theme art on-device via ComfyUI (Z-Image); keys stay server-side.
- **6 languages + PWA** — EN/DE/FR/ES/IT/ZH, installable and offline-aware, with a `/display` beamer view.

Backed by 592+ automated tests, a hardened unauthenticated surface (per-game resource caps, per-IP rate limits, server-minted host-token auth) and load-tested to 600 concurrent players.

---

## Backends

Razzoozle ships **two interchangeable backends** speaking the same socket.io protocol over one shared Postgres database — switch per client in the manager UI or with `VITE_DEFAULT_BACKEND`. The **Rust** server (`axum` + `socketioxide`, memory-safe and low-footprint) covers all gameplay, manager, player and display flows. The **Node.js** server (`packages/socket`) is fully featured and the self-contained default in `compose.node.yml`. A few peripheral HTTP endpoints (Prometheus metrics, client telemetry, social-share unfurl, the OpenAPI doc) and server-side plugin JS hooks are Node-only.

**→ Rust internals, build & tests: [`rust/README.md`](rust/README.md)**

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
