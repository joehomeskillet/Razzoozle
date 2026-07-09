<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Selbstgehostete, quelloffene Live-Quiz-Plattform — ein Präsentator im Kahoot-Stil plus Handyspiel mit cleaner Creme-Optik.

[English](README.md) · 🌐 **Deutsch** · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Live-Demo](https://razzoozle.joelduss.xyz)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Dokumentation](docs/)** · **[🖥️ Desktop-App](https://github.com/joehomeskillet/razzoozle-desktop)** · **[Problem melden](https://github.com/joehomeskillet/Razzoozle/issues)** · *geforkt von [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Was ist es?

Razzoozle ist eine selbstgehostete, echtzeitfähige **Quiz-Plattform** für Klassenzimmer, Events und Spieleabende. Ein Gastgeber öffnet ein Spiel auf dem großen Bildschirm, Spieler treten von ihren Handys mit einer PIN bei, und schnellere richtige Antworten erzielen mehr Punkte. Es ist ein freundlicher Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) mit Manager-gesteuertem Theme-Cockpit, Gamification, Team- und Einzelspiel, Plugins und lokalen KI-Bildern — unter Beibehaltung des klassischen Farbkachel-Präsentators und der Handy-Erfahrung.

> Unabhängiges Open-Source-Projekt. Nicht mit Kahoot!® oder einer anderen kommerziellen Quiz-Plattform verbunden, von diesen nicht befürwortet und nicht daran angeschlossen.

<img src="docs/screenshots/presenter.webp" width="640" alt="Presenter view" />

---

## Schnelleinstieg

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

docker compose -f compose.node.yml up -d   # Node backend → http://127.0.0.1:3010
# or
docker compose -f compose.rust.yml up -d   # Rust backend → http://127.0.0.1:3011
```

Jede Datei ist in sich geschlossen (App + eigene Postgres-Instanz) und unabhängig, sodass beide parallel laufen können. App öffnen, zu `/manager` navigieren und **das Standard-Manager-Passwort ändern**. Für TLS und einen öffentlichen Hostnamen einen Reverse-Proxy (Caddy/Traefik/nginx) davorschalten.

Keine Datenbank gewünscht? `DATABASE_MODE=file` setzen, um ohne Postgres zu laufen. Ohne Docker: `pnpm install && pnpm build && pnpm start` (benötigt Node 22+ und pnpm 11+).

---

## Funktionen

- **Theme-Cockpit** — ein Live-„Design"-Tab: Farben, ansichtsspezifische Hintergründe, Logo, Eckenradius, ein Flat ⇄ Glass-Umschalter und Voreinstellungen.
- **Kahoot-getreue Bildschirme** — geformte Antwortkacheln, ein runder Countdown, ein Zähler für empfangene Antworten und ein animiertes Podium.
- **Gamification** — 15 Erfolge, Medaillen, Streaks, Konfetti, eine Superlativ-Übersicht am Spielende und generierte Spieler-Avatare.
- **7 Fragetypen** — Single- und Multiple-Choice, Wahr/Falsch, Textantwort und Schieberegler.
- **Team & Solo** — farbige Teams mit Live-Rangliste, oder jedes Quiz allein über einen Freigabelink üben.
- **Plugins & Skeleton-Themes** — vom Manager installierbare ZIP-Add-ons und herunterladbare Ganzspiel-Theme-Pakete.
- **Lokale KI-Bilder** — Frage-/Theme-Grafiken auf dem Gerät generieren über ComfyUI (Z-Image); Schlüssel bleiben serverseitig.
- **6 Sprachen + PWA** — EN/DE/FR/ES/IT/ZH, installierbar und offline-fähig, mit einer `/display`-Beamer-Ansicht.

Unterstützt von über 592 automatisierten Tests, einer gehärteten unauthentifizierten Oberfläche (Ressourcen-Obergrenzen pro Spiel, Rate-Limits pro IP, serverseitig erzeugte Host-Token-Authentifizierung) und Lasttests bis 600 gleichzeitige Spieler.

---

## Backends

Razzoozle liefert **zwei austauschbare Backends**, die dasselbe socket.io-Protokoll über eine gemeinsame Postgres-Datenbank sprechen — Wechsel pro Client im Manager-UI oder über `VITE_DEFAULT_BACKEND`. Der **Rust**-Server (`axum` + `socketioxide`, speichersicher und ressourcenschonend) deckt alle Gameplay-, Manager-, Spieler- und Display-Flows ab. Der **Node.js**-Server (`packages/socket`) ist voll ausgestattet und der eigenständige Standard in `compose.node.yml`. Einige periphere HTTP-Endpunkte (Prometheus-Metriken, Client-Telemetrie, Social-Share-Unfurl, das OpenAPI-Dokument) und serverseitige Plugin-JS-Hooks sind nur unter Node verfügbar.

**→ Rust-Interna, Build & Tests: [`rust/README.md`](rust/README.md)**

---

## Konfiguration & Dokumentation

Laufzeitdaten liegen im `config`-Volume und werden beim ersten Start initialisiert. Spieleinstellungen stehen in `config/game.json`; Quizze werden im Manager-Editor oder als `config/quizz/*.json` verfasst. Siehe **[docs/](docs/)**: [Self-Hosting](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-latency mode](docs/LOW-LATENCY-MODE.md).

---

## Apps & Begleiter

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Beta)** — eine native Windows-App zum Hosten und Verwalten von Spielen ohne Browser.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — ein leichtgewichtiger Discovery-Service (das Gameplay wird nie weitergeleitet).

---

## Mitwirken

Issues und Pull Requests sind willkommen. Vor dem Öffnen eines PRs `pnpm verify` ausführen (Typprüfung + Linting + Tests); für Rust-Änderungen `bash rust/gate.sh` ausführen.

---

## Danksagung & Lizenz

Ein Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — Dank an die ursprünglichen Autoren. Veröffentlicht unter der **[MIT-Lizenz](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle-Mitwirkende).
