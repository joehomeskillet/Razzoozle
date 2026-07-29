<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle Willkommensbildschirm mit PIN-Eingabe und animiertem Hintergrund" />

# Razzoozle

### Selbstgehostete, quelloffene Live-Quiz-Plattform — ein Kahoot-Stil-Präsentator + Handyspiel mit warmem Creme-Design.

[English](README.md) · 🌐 **Deutsch** · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Live-Demo](https://rust.razzoozle.xyz)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Dokumentation](docs/)** · **[Problem melden](https://github.com/joehomeskillet/Razzoozle/issues)** · *geforkt von [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Was ist Razzoozle?

Razzoozle ist eine selbstgehostete, echtzeitfähige **Quiz-Plattform** für Klassenzimmer, Events und Spieleabende. Ein Moderator öffnet ein Spiel auf dem großen Bildschirm, Spieler treten von ihren Handys mit einer PIN bei, und schnellere richtige Antworten erzielen mehr Punkte. Es ist ein freundlicher Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) mit einem moderatorgesteuerten Design-Cockpit, Gamification, Team- und Einzelspiel sowie lokalen KI-Bildern — mit dem klassischen Kahoot-Stil aus farbigen Antwort-Kacheln und Handyerlebnis.

> Unabhängiges Open-Source-Projekt. Nicht mit Kahoot!® oder einer anderen kommerziellen Quiz-Plattform verbunden.

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

# Docker-Image bauen (beinhaltet Web-SPA + Rust-Server)
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .

# Mit PostgreSQL ausführen (benötigt DATABASE_URL Umgebungsvariable)
# Beispiel: Standard-Passwort für den Moderator setzen
docker run -d \
  -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='dein-sicheres-passwort' \
  -v razzoozle-config:/config \
  razzoozle:latest
```

<div align="center">
<img src="docs/screenshots/start.webp" width="680" alt="Moderator-Startbildschirm mit Spiel-PIN und QR-Code zum Beitreten" />
</div>

Der Server läuft auf Port `3020` und benötigt eine PostgreSQL-Datenbank. Öffne die App, gehe zu `/manager` und **ändere das Standard-Passwort**. Setze einen Reverse-Proxy (Caddy/Traefik/nginx) davor für TLS und einen öffentlichen Hostnamen. Siehe **[Self-Hosting](docs/Self-Hosting.md)** für detailliertes Setup.

---

## ✦ Was Razzoozle gegenüber Razzia hinzufügt

| | Feature |
| --- | --- |
| 🎨 | **Design-Cockpit** — ein Live-Moderator-„Design"-Tab mit Farben, ansichtenabhängigen Hintergründen, Logo, Radius, Presets und kontrastbewusstem Farbwähler. |
| ☕ | **Flaches Creme-Design** — eine warme, flache Creme-Schnittstelle mit lebendigem animiertem Hintergrund (treibende Blobs + schwebende Schul-/Wissens-Icons), flachem Logo und Tinte-auf-Creme-Antwort-Kacheln. |
| 🎯 | **Kahoot-treue Spielbildschirme** — Antwort-Kacheln mit den klassischen Form-Icons (Dreieck / Diamant / Kreis / Quadrat), zirkulärer Countdown-Timer, Antwort-Zähler und animiertes Podium. |
| 🧑‍🎨 | **Spieler-Avatare** — jeder Spieler erhält einen generierten DiceBear-Avatar (Stil wählen + erneuern oder eigene hochladen); Avatare schweben in der Lobby und erscheinen auf Leaderboards, Podium und Auszeichnungen. |
| 🏆 | **Gamification** — 14 Erfolge, Medaillen, Serien, Konfetti und Soundklingel, plus persönliche Pokalgalerie. |
| 🥇 | **End-Game-Auszeichnungs-Recap** — eine animierte Superlative-Sequenz (schnellster Finger, größter Aufsteiger, längste Serie, Comeback-Kind…) mit Avatar und Namen jedes Gewinner, automatisch im Autoplay-Modus. |
| 👥 | **Teammodus** — rot / blau / grün / gelbe Teams mit Live-Team-Leaderboard. |
| 📱 | **Einzelspiel** — übe jedes Quiz allein über einen Freigabe-Link mit eigener Score-Geschichte. |
| 🏫 | **Klassenmodus für Schulen** — ein optionaler Lehrer-Modus: erstelle Klassen, verwalte Schülerlisten (Schüler hinzufügen, zwischen Klassen verschieben, entfernen), gib jedem Schüler eine eigene PIN und weise ein Quiz einer ganzen Klasse mit Fristablauf, Versuchslimit und datenschutzfreundlichem anonymen Ergebnis-Tracking zu. |
| ✍️ | **Siebzehn Fragetypen** — Einfachwahl, Wahr/Falsch, Umfrage, Schieber, Mehrfachauswahl, Tippe-die-Antwort, Satzbauer, Mathe-Input, Wortarten, Sequencing, Lücke-Füller, Matching, Stift-auf-Karte, Wort-Wolke, Brainstorm, Vertrauen und Mikro-Lektion, auf top der klassischen farbigen Antwort-Kacheln. |
| 📳 | **Mobile Haptik** — optionales Vibrations-Feedback auf Spieler-Handys (Countdown, Antworten), mit Rücksicht auf reduzierte Bewegung. |
| 🔗 | **Teilbare Ergebnisse** — reichhaltige Vorschaulinks pro Ergebnis (Open Graph unfurl), Ergebnis-Seite mit „spiel es selbst / host dein eigenes"-Aufrufen und herunterladbare Gewinner-Sticker. |
| 🤝 | **Community-Fragen** — öffentliche Einreichungsseite mit moderator-gesteuerter Warteschlange, wiederverwendbarer Frage-Katalog und Quiz-Archiv. |
| 🖼️ | **Lokale KI-Bilder** — Frage-/Design-Bilder auf dem Gerät via ComfyUI (Z-Image) generieren oder Cloud-Anbieter einstöpseln — Schlüssel bleiben Server-seitig. |
| 🌍 | **6 Sprachen + PWA** — Englisch, Deutsch, Französisch, Spanisch, Italienisch, Chinesisch; installierbar, offline-bewusst. |
| 📺 | **Beamer-Kiosk + Zuverlässigkeit** — eine `/display`-Projektor-Ansicht, Low-Latency-Modus, Crash-Recovery, Wiederverbindung und MCP-Server für KI-Tool-Steuerung. |
| 🎛️ | **Einheitliche Moderator-Konsole** — eine redesignete Moderator-UI mit zeilen-basiertem System, Multi-Select-Aktionen, Massenoperationen und konsistenten Kontrollen über alle Management-Tabs. |

Unterstützt durch **592+ automatisierte Tests**, einen Path-Traversal- + `ws`-CVE-Sicherheits-Pass, eine gehärtete unauthentifizierte Oberfläche (pro Spiel-Ressourcen-Caps + Spiel-Vertreibung, pro-IP-Rate-Limits, Moderator-Auth Brute-Force-Drosseln, Server-geprägte Host-Token-Auth schließt IDOR), und ein Health-Gate Docker-Deploy. Last-getestet auf **600 gleichzeitige Spieler**.

---

## Spielerlebnis

### Präsentator- & Moderator-Bildschirm

Der Moderator steuert das Spiel auf einem großen Bildschirm mit den klassischen Kahoot-Stil-Antwort-Kacheln:

<div align="center">
<img src="docs/screenshots/presenter.webp" width="680" alt="Präsentator-Bildschirm mit großen Antwort-Kacheln, Timer und Antwort-Zähler" />
</div>

### Spieler-Handys & Desktop-Clients

Spieler treten von mobilen Geräten oder Desktops bei und sehen die gleiche Frage mit Kacheln, ihren aktuellen Score und einen Countdown-Timer:

<div align="center">

| Mobile-Spieler | Desktop-Spieler |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="280" alt="Mobile Spieler-Ansicht mit Frage und Antwort-Buttons" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop Spieler-Ansicht mit Antwort-Kacheln" /> |

</div>

### Avatar-Auswahl

Jeder Spieler wählt oder generiert einen Avatar vor dem Beitreten:

<div align="center">
<img src="docs/screenshots/avatar.webp" width="420" alt="Avatar-Auswahlbildschirm mit DiceBear-Stil-Optionen und Upload-Option" />
</div>

---

## Moderator-Design-Cockpit

Passe das gesamte Aussehen und Verhalten in Echtzeit an — Farben, Hintergründe, Animationen und Typografie — ohne Code zu schreiben:

<div align="center">
<img src="docs/screenshots/admin.webp" width="680" alt="Moderator-Designkontroll-Panel mit Theme-Einstellungen und Live-Vorschau" />
</div>

---

## Rust-Server

Das Backend von Razzoozle ist ein **Rust-Server** (`axum` + `socketioxide`, speichersicher und ressourcenschonend) der alle Spielweise-, Moderator-, Spieler- und Display-Flows abdeckt und über socket.io mit dem unveränderten React-Client kommuniziert. Der Spielzustand wird in **PostgreSQL** persistiert; Quiz-Templates sind unter `config/templates/*.json` datei-gesichert.

**→ Rust-Interna, Build & Tests: [`rust/README.md`](rust/README.md)**

---

## Agentisch entwickelt

Razzoozle wird fast ausschließlich von KI-Coding-Agenten entwickelt, orchestriert durch menschliche Aufsicht. Ein vielfältiges Team spezialisierter Modelle und Tools arbeitet zusammen, um Features zu bauen, zu testen, zu überprüfen und bereitzustellen.

| Agent | Rolle |
| --- | --- |
| Claude | Orchestrierung & Review |
| Codex (GPT-5.6) | Full-Stack-Implementierung |
| Cursor (GPT-5.6) | Code-Verbesserung & Fix |
| Grok (xAI) | Rust-Backend-Implementierung |
| Gemini (Google) | Langkontext-Review & Urteilsfindung |
| Open Models | Qwen, DeepSeek, Nemotron |
| Lokale Inferenz | OpenVINO auf Intel Arc |
| Browser QA (Playwright) | End-to-End-Spieltests |

Menschen überprüfen und mergen jeden Commit. KI verstärkt Geschwindigkeit und Qualität, ersetzt aber nicht das Urteil.

---

## Konfiguration & Dokumentation

Laufzeit-Daten leben im `config`-Volume, seeded beim ersten Boot. Spieleinstellungen sind in `config/game.json`; Quizze werden im Moderator-Editor oder als `config/quizz/*.json` verfasst. Siehe **[docs/](docs/)**: [Self-Hosting](docs/Self-Hosting.md) · [Konfiguration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-Latency-Modus](docs/LOW-LATENCY-MODE.md).

---

## Mitwirken

Issues und Pull Requests sind willkommen. Führe `pnpm verify` aus (Typcheck + Lint + Tests) vor dem Öffnen eines PR; für Rust-Änderungen führe `bash rust/gate.sh` aus.

---

## Danksagung & Lizenz

Ein Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — Danke an die upstream-Autoren. Veröffentlicht unter der **[MIT-Lizenz](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle-Mitwirkende).
