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

---

## 📸 Screenshots

<div align="center">

| Präsentator / Host | Desktop-Spielclient |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> |

| Spieler-Handy | Avatar-Auswahl |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Player phone" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar selection" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager theme cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

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

## ✦ Was Razzoozle gegenüber Razzia bietet

| | Funktion |
| --- | --- |
| 🎨 | **Theme-Cockpit** — ein Live-„Design"-Tab im Manager: Farben, ansichtsspezifische Hintergründe, Logo, Eckenradius und ein **Flat ⇄ Glass**-Umschalter, mit Voreinstellungen (ein flacher **Creme**-Standard + eine optionale violette **Liquid-Glass**-Voreinstellung) und kontrastbewussten Farbwählern. |
| ☕ | **Flaches Creme-Design** — eine warme, flache Creme-Oberfläche mit lebendigem animiertem Hintergrund (driftende Blobs + schwebende Schul-/Wissens-Icons), einer flachen Wortmarke/Logo und Tinte-auf-Creme-Antwortkacheln. |
| 🧊 | **Liquid-Glass-UI** — eine optionale, ältere Glasmorphismus-Theme-Variante (matte, unscharfe Oberflächen), die die flache Basis nie berührt. |
| 🎯 | **Kahoot-getreue Spielbildschirme** — Antwortkacheln mit den klassischen Form-Icons (Dreieck / Raute / Kreis / Quadrat), ein runder Countdown-Timer, ein Zähler für empfangene Antworten und ein animiertes Podium. |
| 🧑‍🎨 | **Spieler-Avatare** — jeder Spieler erhält einen generierten DiceBear-Avatar (Stil wählen + neu würfeln, oder eigenen hochladen); Avatare schweben in der Lobby und erscheinen auf Ranglisten, dem Podium und den Auszeichnungen. |
| 🏆 | **Gamification** — 15 Erfolge, Medaillen, Streaks, Konfetti und Sound-Chimes, plus eine persönliche Trophäen-Galerie. |
| 🥇 | **Auszeichnungs-Recap am Spielende** — eine animierte Superlativ-Sequenz (schnellster Finger, größter Aufsteiger, längste Serie, Comeback-Kid…), die Avatar + Name jedes Gewinners zeigt, im Autoplay automatisch getaktet. |
| 👥 | **Team-Modus** — Teams in Rot / Blau / Grün / Gelb mit einer Live-Team-Rangliste. |
| 📱 | **Einzelspiel** — jedes Quiz allein über einen Freigabelink üben, mit eigener Punkte-Historie. |
| ✍️ | **Mehr Fragetypen** — Mehrfachauswahl, Textantwort und Schieberegler, zusätzlich zur klassischen Einfachauswahl. |
| 🔌 | **Plugin-System** — vom Manager installierbare ZIP-Add-ons mit eigenem „Plugins"-Tab. |
| 🧩 | **Manager-Addons** — JavaScript-Addons aus der Manager-Konsole hochladen, aktivieren und konfigurieren (eigener Tab, Capability-Badges, persistierte Konfiguration); liefert ein Copy-Paste-Starter-Skeleton (`examples/plugins/starter/`) mit einem Authoring-Vertrag. |
| 📦 | **Skeleton-Theme-ZIPs** — ein ganzes Spiel-Theme als LLM-lesbares ZIP herunter-/hochladen („Skeleton": Design-Tokens + CSS + JS + ein SKELETON.md-Vertrag). |
| 📳 | **Mobile Haptik** — optionales Vibrations-Feedback auf Spieler-Handys (Countdown, Antworten), reduced-motion-bewusst. |
| 🔗 | **Teilbare Ergebnisse** — reichhaltige Link-Vorschauen pro Ergebnis (Open-Graph-Unfurl), eine Ergebnisseite mit „selbst spielen / eigenes hosten"-Calls-to-Action und herunterladbare Gewinner-Sticker. |
| 🤝 | **Community-Fragen** — eine öffentliche Einreichungsseite mit einer Manager-Moderationswarteschlange, plus ein wiederverwendbarer Fragenkatalog und ein Quiz-Archiv. |
| 🖼️ | **Lokale KI-Bilder** — Frage-/Theme-Grafiken auf dem Gerät via ComfyUI (Z-Image) generieren, oder Cloud-Anbieter einbinden — Schlüssel bleiben serverseitig. |
| 🌍 | **6 Sprachen + PWA** — Englisch, Deutsch, Französisch, Spanisch, Italienisch, Chinesisch; installierbar, offline-fähig. |
| 📺 | **Beamer-Kiosk + Zuverlässigkeit** — eine `/display`-Projektor-Ansicht, Low-Latency-Modus, Crash-Recovery, Reconnect und ein MCP-Server für KI-Tool-Steuerung. |

Unterstützt von **592+ automatisierten Tests**, einem Path-Traversal- + `ws`-CVE-Security-Pass, einer gehärteten unauthentifizierten Oberfläche (Ressourcen-Obergrenzen pro Spiel + Spiel-Eviction, Rate-Limits pro IP, Brute-Force-Drosselung der Manager-Auth, serverseitig erzeugte Host-Token-Authentifizierung gegen IDOR) und einem health-gated Docker-Deploy. Lastgetestet bis **600 gleichzeitige Spieler**.

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
