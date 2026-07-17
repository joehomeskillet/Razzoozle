<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Selbstgehostete, quelloffene Live-Quiz-Plattform — ein Präsentator im Kahoot-Stil plus Handyspiel mit cleaner Creme-Optik.

[English](README.md) · 🌐 **Deutsch** · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Live-Demo](https://razzoozle.joelduss.xyz)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Dokumentation](docs/)** · **[Problem melden](https://github.com/joehomeskillet/Razzoozle/issues)** · *geforkt von [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Was ist es?

Razzoozle ist eine selbstgehostete, echtzeitfähige **Quiz-Plattform** für Klassenzimmer, Events und Spieleabende. Ein Gastgeber öffnet ein Spiel auf dem großen Bildschirm, Spieler treten von ihren Handys mit einer PIN bei, und schnellere richtige Antworten erzielen mehr Punkte. Es ist ein freundlicher Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) mit Manager-gesteuertem Theme-Cockpit, Gamification, Team- und Einzelspiel, und lokalen KI-Bildern — unter Beibehaltung des klassischen Farbkachel-Präsentators und der Handy-Erfahrung.

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

docker compose -f compose.rust.yml up -d   # Rust server → http://127.0.0.1:3011
```

Der Stack ist in sich geschlossen (Rust-Server + eigene Postgres-Instanz). App öffnen, zu `/manager` navigieren und **das Standard-Manager-Passwort ändern**. Für TLS und einen öffentlichen Hostnamen einen Reverse-Proxy (Caddy/Traefik/nginx) davorschalten.

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
| 🏫 | **Klassen-Modus für Schulen** — optionaler Lehrermodus: Klassen anlegen, Schülerliste verwalten (Schüler hinzufügen, zwischen Klassen verschieben, entfernen), jedem Schüler eine eigene PIN geben und ein Quiz einer ganzen Klasse zuweisen — mit Frist, Versuchslimit und datenschutzfreundlicher pseudonymer Ergebnisverfolgung. |
| ✍️ | **Neun Fragetypen** — Einfachauswahl, Richtig/Falsch, Umfrage, Schieberegler, Mehrfachauswahl, Textantwort, Satzbau, Mathe-Eingabe und Wortarten, zusätzlich zu den klassischen farbigen Antwortkacheln. |
| 📳 | **Mobile Haptik** — optionales Vibrations-Feedback auf Spieler-Handys (Countdown, Antworten), reduced-motion-bewusst. |
| 🔗 | **Teilbare Ergebnisse** — reichhaltige Link-Vorschauen pro Ergebnis (Open-Graph-Unfurl), eine Ergebnisseite mit „selbst spielen / eigenes hosten"-Calls-to-Action und herunterladbare Gewinner-Sticker. |
| 🤝 | **Community-Fragen** — eine öffentliche Einreichungsseite mit einer Manager-Moderationswarteschlange, plus ein wiederverwendbarer Fragenkatalog und ein Quiz-Archiv. |
| 🖼️ | **Lokale KI-Bilder** — Frage-/Theme-Grafiken auf dem Gerät via ComfyUI (Z-Image) generieren, oder Cloud-Anbieter einbinden — Schlüssel bleiben serverseitig. |
| 🌍 | **6 Sprachen + PWA** — Englisch, Deutsch, Französisch, Spanisch, Italienisch, Chinesisch; installierbar, offline-fähig. |
| 📺 | **Beamer-Kiosk + Zuverlässigkeit** — eine `/display`-Projektor-Ansicht, Low-Latency-Modus, Crash-Recovery, Reconnect und ein MCP-Server für KI-Tool-Steuerung. |

Unterstützt von **592+ automatisierten Tests**, einem Path-Traversal- + `ws`-CVE-Security-Pass, einer gehärteten unauthentifizierten Oberfläche (Ressourcen-Obergrenzen pro Spiel + Spiel-Eviction, Rate-Limits pro IP, Brute-Force-Drosselung der Manager-Auth, serverseitig erzeugte Host-Token-Authentifizierung gegen IDOR) und einem health-gated Docker-Deploy. Lastgetestet bis **600 gleichzeitige Spieler**.

---

## Rust-Server

Der Server von Razzoozle wurde **von Node.js nach Rust portiert** — der **Rust**-Server (`axum` + `socketioxide`, speichersicher und ressourcenschonend) ist jetzt das alleinige Backend, deckt alle Gameplay-, Manager-, Spieler- und Display-Flows ab und spricht socket.io mit dem unveränderten React-Client. Der Zustand wird vollständig in **PostgreSQL** persistiert; es gibt keine dateibasierte Persistenz.

**→ Rust-Interna, Build & Tests: [`rust/README.md`](rust/README.md)**

---

## Agentisch entwickelt

Razzoozle wird fast vollständig von KI-Coding-Agenten entwickelt, orchestriert von menschlicher Aufsicht. Ein vielfältiges Team spezialisierter Modelle und Tools arbeitet zusammen, um Features zu bauen, zu testen, zu reviewen und zu deployen.

| Agent | Rolle |
| --- | --- |
| Claude | Orchestrierung & Review |
| Codex (GPT-5.6) | Full-Stack-Implementierung |
| Cursor (GPT-5.6) | Code-Verfeinerung & Fixes |
| Grok (xAI) | Rust-Backend-Implementierung |
| Gemini (Google) | Long-Context-Review & Judging |
| Open Models | Qwen, DeepSeek, Nemotron |
| Lokale Inferenz | OpenVINO auf Intel Arc |
| Browser QA (Playwright) | End-to-End-Spieltests |

Menschen reviewen und mergen jeden Commit. KI verbessert Geschwindigkeit und Qualität, ersetzt aber nicht das Urteil.

---

## Konfiguration & Dokumentation

Laufzeitdaten liegen im `config`-Volume und werden beim ersten Start initialisiert. Spieleinstellungen stehen in `config/game.json`; Quizze werden im Manager-Editor oder als `config/quizz/*.json` verfasst. Siehe **[docs/](docs/)**: [Self-Hosting](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-latency mode](docs/LOW-LATENCY-MODE.md).

---

## Mitwirken

Issues und Pull Requests sind willkommen. Vor dem Öffnen eines PRs `pnpm verify` ausführen (Typprüfung + Linting + Tests); für Rust-Änderungen `bash rust/gate.sh` ausführen.

---

## Danksagung & Lizenz

Ein Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — Dank an die ursprünglichen Autoren. Veröffentlicht unter der **[MIT-Lizenz](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle-Mitwirkende).
