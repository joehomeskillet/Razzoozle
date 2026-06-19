<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### Eine selbst-gehostete, quelloffene Live-Quiz-Plattform — mit klarem, flachem **Cream**-Design (und einem optionalen Liquid-Glass-Theme).

🌐 [English](README.md) · **Deutsch** · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592-3DBFA0)

**[▶ Live-Demo](https://razzoozle.joelduss.xyz)** · **[📚 Docs](docs/)** · **[Problem melden](https://github.com/joehomeskillet/Razzoozle/issues)** · *geforkt von [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🧩 Was ist das?

Razzoozle ist ein selbstgehostetes **Quizspiel** in Echtzeit für Klassenzimmer, Events und Spieleabende. Eine Gastgeberin oder ein Gastgeber öffnet ein Spiel auf dem großen Bildschirm, die Spielenden treten per PIN von ihren Handys aus bei, und alle wetteifern um die schnellste Antwort — schnellere richtige Antworten geben mehr Punkte. Es ist ein freundlicher Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), neu aufgebaut rund um ein klares, flaches **Cream**-Design (Liquid-Glass ist jetzt ein optionales Theme), mit einem vom Manager gesteuerten Theming-System, Gamification, Team- und Solo-Modus sowie lokaler KI-Bildgenerierung — und dabei behält es das klassische Kahoot-artige Erlebnis aus Presenter und Handy (farbige Antwortkacheln mit Formen, ein Countdown, ein Siegertreppchen).

> Razzoozle ist ein unabhängiges Open-Source-Projekt. Es steht in keiner Verbindung zu Kahoot!® oder einer anderen kommerziellen Quizplattform, wird von diesen nicht unterstützt und ist nicht mit ihnen verbunden.

---

## 📸 Screenshots

<div align="center">

| Presenter / Host | Spieler-Handy |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/phone.webp" width="200" alt="Player phone" /> |

| Desktop-Spielclient | Manager · Theme-Cockpit |
| :---: | :---: |
| <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> | <img src="docs/screenshots/admin.webp" width="420" alt="Manager theme cockpit" /> |

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## ✦ Was Razzoozle gegenüber Razzia hinzufügt

| | Feature |
| --- | --- |
| 🎨 | **Theme-Cockpit** — ein Live-„Design“-Tab im Manager: Farben, Hintergründe pro Ansicht, Logo, Radius und ein **Flat ⇄ Glass**-Stilumschalter, mit Presets (flacher **Cream**-Standard + optionales violettes **Liquid-Glass**-Preset) sowie kontrastbewusste Farbwähler. |
| 🍦 | **Flaches Cream-Design** — warme flache Cream-Oberfläche mit lebendigem animiertem Hintergrund (treibende Blobs + schwebende Schul-/Wissens-Icons), flaches „Zig“-Wortmarke/Logo, Ink-auf-Cream-Antwortkacheln. |
| 🧊 | **Liquid-Glass-UI** — eine optional aktivierbare Glassmorphism-Theme-Variante (mattierte, weichgezeichnete Flächen, Legacy-Look), die die flache Basis nie antastet. |
| 🧑‍🎨 | **Spieler-Avatare** — jeder Spieler bekommt einen generierten DiceBear-Avatar (Stil wählen + neu würfeln, oder eigenes Bild hochladen); Avatare schweben in der Lobby und erscheinen auf Ranglisten, Podest und Auszeichnungen. |
| 🏅 | **End-Auszeichnungen (Recap)** — animierte Superlativ-Sequenz (schnellster Finger, größter Aufsteiger, längste Serie, Comeback-King…) mit Avatar + Name des Gewinners, im Autoplay automatisch getaktet. |
| 🔌 | **Plugin-System** — vom Manager installierbare ZIP-Add-ons mit eigenem „Plugins“-Tab. |
| 🧩 | **Manager-Addons** — lade JavaScript-Addons hoch, aktiviere und konfiguriere sie direkt in der Manager-Konsole (eigener Tab, Capability-Badges, persistierte Konfiguration); bringt ein Copy-paste-Starter-Skeleton (`examples/plugins/starter/`) samt Authoring-Contract mit. |
| 📦 | **Skeleton-Theme-ZIPs** — ganzes Spiel-Theme als LLM-lesbares ZIP herunter-/hochladen („Skeleton“: Design-Tokens + CSS + JS + SKELETON.md-Contract). |
| 📳 | **Mobile Haptik** — optionales Vibrations-Feedback auf Spieler-Handys (Countdown, Antworten), reduced-motion-bewusst. |
| 🔗 | **Teilbare Ergebnisse** — schöne Link-Vorschauen pro Ergebnis (Open-Graph-Unfurl), eine Ergebnisseite mit „Selbst spielen / Selbst hosten“-CTAs und herunterladbare Gewinner-Sticker. |
| 🎯 | **Kahoot-treue Spielbildschirme** — Antwortkacheln mit den klassischen Form-Icons (Dreieck / Raute / Kreis / Quadrat), ein kreisförmiger Countdown-Timer, ein Zähler für eingegangene Antworten und ein animiertes Siegertreppchen. |
| 🏆 | **Gamification** — 15 Erfolge, Medaillen, Serien, Konfetti und Klangsignale, dazu eine persönliche Trophäengalerie. |
| 👥 | **Team-Modus** — rote, blaue, grüne und gelbe Teams mit einer Live-Team-Rangliste. |
| 📱 | **Solo-Modus** — übe jedes Quiz allein über einen Teilen-Link, mit eigener Punkte-Historie. |
| ✍️ | **Mehr Fragetypen** — Mehrfachauswahl, Antwort-eintippen und Slider, zusätzlich zur klassischen Einfachauswahl. |
| 🤝 | **Community-Fragen** — eine öffentliche Einreichungsseite mit einer Moderations-Warteschlange im Manager, dazu ein wiederverwendbarer Fragenkatalog und ein Quiz-Archiv. |
| 🖼️ | **Lokale KI-Bilder** — erzeuge Bilder für Fragen und Themes direkt auf dem Gerät über ComfyUI (Z-Image), oder binde Cloud-Anbieter ein — die Schlüssel bleiben serverseitig. |
| 🌍 | **6 Sprachen + PWA** — Englisch, Deutsch, Französisch, Spanisch, Italienisch, Chinesisch; installierbar, offline-fähig. |
| 📺 | **Beamer-Kiosk + Zuverlässigkeit** — eine `/display`-Projektoransicht, Modus mit geringer Latenz, Absturz-Wiederherstellung, Reconnect und ein MCP-Server zur Steuerung durch KI-Tools. |

Untermauert von **592 automatisierten Tests**, einem Sicherheits-Durchlauf gegen Path-Traversal und die `ws`-CVE, einer gehärteten unauthentifizierten Angriffsfläche (Limits für Spieler pro Spiel und für aktive Spiele, rate-limitierte öffentliche Endpunkte, Brute-Force-Drosselung der Manager-Auth) sowie einem health-geprüften Docker-Deploy. Lasttests bis zu **600 gleichzeitigen Spielenden**.

---

## ⚙️ Voraussetzungen

**Mit Docker (empfohlen):** Docker + Docker Compose.
**Ohne Docker:** Node.js 22+ und pnpm 11+.

---

## 📖 Erste Schritte

### 🐳 Docker (empfohlen)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```

Die App startet unter `http://127.0.0.1:3011` (nginx + der Socket-Server in einem Container). Konfiguration und Nutzerdaten liegen im Volume `./config`, das beim ersten Start angelegt und befüllt wird. Stelle für TLS und einen öffentlichen Hostnamen deinen eigenen Reverse Proxy davor (Caddy, nginx, Traefik …).

### 🛠️ Ohne Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # Produktions-Build
pnpm start        # oder: pnpm dev  (Web + Socket, Hot Reload)
```

---

## 🎮 So wird gespielt

1. Öffne `/manager` auf der Host-Maschine und melde dich mit dem Manager-Passwort an.
2. Wähle ein Quiz und starte ein Spiel — eine PIN erscheint (zeige sie über `/display` auf dem Beamer).
3. Die Spielenden öffnen die Seite auf ihren Handys und geben die PIN und einen Namen ein.
4. Antworte so schnell du kannst — schnellere richtige Antworten geben mehr Punkte.
5. Verfolge die Rangliste, die Medaillen und das Konfetti zwischen den Runden.

Lieber allein spielen? Öffne den **Solo**-Teilen-Link eines beliebigen Quiz und übe in deinem eigenen Tempo.

---

## ⚙️ Konfiguration

Laufzeitdaten liegen in `config/` (von git ignoriert, beim ersten Start befüllt).

### Spieleinstellungen — `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // ÄNDERE DAS — der Standardwert blockiert den Manager-Zugang
  "teamMode": false,             // rote/blaue/grüne/gelbe Teams aktivieren
  "lowLatencyMode": { "enabled": false } // optionale Timing-/UX-Straffung (siehe docs/LOW-LATENCY-MODE.md)
}
```

### Quizze — `config/quizz/*.json`

Erstelle Quizze im Editor des Managers (empfohlen) oder als JSON. Eine Frage unterstützt mehrere `type`s (`choice`, `boolean`, `slider`, dazu Mehrfachauswahl über mehrere `solutions` und Antwort-eintippen):

```jsonc
{
  "subject": "Python Basics",
  "questions": [
    {
      "question": "Which keyword defines a function in Python?",
      "type": "choice",
      "answers": ["func", "def", "function", "fun"],
      "solutions": [1],          // 0-basierte Indizes; mehrere = Mehrfachauswahl
      "time": 20,                 // Sekunden zum Antworten (5–120)
      "cooldown": 5,              // Sekunden, bevor die Antwort enthüllt wird (3–15)
      "media": { "type": "image", "url": "https://placehold.co/600x400.png" } // optional
    }
  ]
}
```

Der KI-Anbieter (aus / lokales ComfyUI / Cloud) wird im **KI**-Tab des Managers konfiguriert; API-Schlüssel werden serverseitig in `config/` gespeichert und nie an Clients gesendet.

---

## 📺 Beamer- / Kiosk-Anzeige

`/display` rendert die Host-Präsentation im Vollbild für einen Projektor oder Fernseher (vh-skalierte Schrift, die quer durch den Raum lesbar ist) und lässt sich von einem Handy aus koppeln. Die Route `/satellite/<gameId>` ist eine bedienelementfreie Kiosk-Ansicht, die sich per Token authentifiziert (kein Manager-Passwort). Ein optionales Raspberry-Pi-Satellite-Image liegt bei.

---

## 🧱 Tech-Stack

Ein pnpm-Monorepo — **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), **`@razzoozle/socket`** (Node + Socket.IO + Express, Snapshots für die Absturz-Wiederherstellung), **`@razzoozle/common`** (geteilte, Zod-validierte Typen) und **`@razzoozle/mcp`** (ein MCP-Server zur Steuerung durch KI-Tools). Wird als einzelnes Docker-Image ausgeliefert (nginx + node via supervisord) mit einem `/healthz`-Endpunkt + Docker-`HEALTHCHECK`.

---

## 🤝 Mitwirken

Issues und Pull Requests sind willkommen. Führe `pnpm verify` (Typecheck + Lint + Tests) aus, bevor du einen PR eröffnest.

---

## ⭐ Star-Verlauf

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Star history" />
</a>

---

## 📝 Credits & Lizenz

Razzoozle ist ein Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — herzlichen Dank an die Upstream-Autoren. Veröffentlicht unter der **[MIT License](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle contributors); der Upstream-MIT-Hinweis bleibt erhalten.
