<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Self-hosted, open-source live quiz platform — a Kahoot-style presenter + phone game.

🌐 **English** · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

**[▶ Live demo](https://rust.razzoozle.xyz)** · **[📚 Docs](docs/)** · **[Report an issue](https://github.com/joehomeskillet/Razzoozle/issues)** · *forked from [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## What is Razzoozle?

A self-hosted real-time quiz platform for classrooms and events. A host opens a game on screen, players join from phones with a PIN, and faster correct answers score more. It features 10 question types, team & solo modes, a manager cockpit for theming, gamification, class management, and local AI image generation.

**Features:** [Live demo](https://rust.razzoozle.xyz) · [Full feature list](docs/README.md) · 592+ tests · Docker + Rust server

---

## Quick Start

### Option 1: Local development

Requires Node 22+ and pnpm 11+.

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm dev
```

Open `http://localhost:5173` (web client). The server runs on separate ports (hot reload enabled).

### Option 2: Docker (recommended for production)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .
docker run -d -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='change-me' \
  -v razzoozle-config:/config \
  razzoozle:latest
```

The app serves on `http://localhost:3020`. See **[Self-Hosting](docs/Self-Hosting.md)** for reverse proxy + TLS setup.

---

## Next Steps

- **Manager setup:** Open `/manager`, log in with the bootstrap password, and **change it immediately**.
- **Deploy to production:** [Self-Hosting guide](docs/Self-Hosting.md)
- **Customize appearance:** [Theming](docs/Theming.md)
- **Configure gameplay:** [Configuration](docs/Configuration.md)
- **Rust internals:** [rust/README.md](rust/README.md)

---

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```bash
pnpm verify          # typecheck + lint + tests
bash rust/gate.sh    # Rust backend tests (if changed)
```

---

## License & Credits

MIT License (© 2024 Ralex, © 2026 Razzoozle contributors). A fork of [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia).
