<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Selbstgehostete, quelloffene Live-Quiz-Plattform — ein Kahoot-Stil-Präsentator plus Handyspiel.

[English](README.md) · 🌐 **Deutsch** · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

**[▶ Live-Demo](https://rust.razzoozle.xyz)** · **[📚 Dokumentation](docs/)** · **[Problem melden](https://github.com/joehomeskillet/Razzoozle/issues)** · *geforkt von [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Was ist Razzoozle?

Eine selbstgehostete echtzeitfähige Quiz-Plattform für Klassenzimmer und Events. Ein Gastgeber öffnet ein Spiel auf dem Bildschirm, Spieler treten von ihren Handys mit einer PIN bei, und schnellere richtige Antworten erzielen mehr Punkte. Die Plattform bietet 17 Fragetypen (Choice, Boolean, Slider, Poll, MultipleSelect, TypeAnswer, SentenceBuilder, Mathematik, Wortarten, Sequencing, FillBlank, Matching, DropPin, WordCloud, Brainstorm, Confidence, MicroLesson), Team- und Einzelspiel, ein Manager-Cockpit zum Anpassen des Designs, Gamification, Klassenverwaltung und lokale KI-Bildgenerierung.

**Features:** [Live-Demo](https://rust.razzoozle.xyz) · [Vollständige Funktionsliste](docs/README.md) · 592+ Tests · Docker + Rust-Server

---

## Schnelleinstieg

### Option 1: Lokale Entwicklung

Benötigt Node 22+ und pnpm 11+.

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm dev
```

Öffne `http://localhost:3000` (Web-Client). Der Server läuft auf separaten Ports (Hot-Reload aktiviert).

### Option 2: Docker (empfohlen für Produktion)

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

Die App läuft auf `http://localhost:3020`. Siehe **[Self-Hosting](docs/Self-Hosting.md)** für Reverse-Proxy- und TLS-Setup.

---

## Nächste Schritte

- **Manager-Setup:** Öffne `/manager`, melde dich mit dem Bootstrap-Passwort an und **ändere es sofort**.
- **Deployment für Produktion:** [Self-Hosting-Anleitung](docs/Self-Hosting.md)
- **Design anpassen:** [Theming](docs/Theming.md)
- **Spiel konfigurieren:** [Configuration](docs/Configuration.md)
- **Rust-Interna:** [rust/README.md](rust/README.md)

---

## Mitwirken

Issues und Pull Requests sind willkommen. Vor dem Öffnen eines PRs:

```bash
pnpm verify          # typecheck + lint + tests
bash rust/gate.sh    # Rust-Backend-Tests (falls verändert)
```

---

## Danksagung & Lizenz

MIT-Lizenz (© 2024 Ralex, © 2026 Razzoozle-Mitwirkende). Ein Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia).
