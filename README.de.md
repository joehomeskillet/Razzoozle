<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### Eine selbstgehostete, quelloffene Live-Quiz-Plattform — mit einem sauberen, flachen **Creme**-Design (und einem optionalen Liquid-Glass-Theme).

🌐 [English](README.md) · **Deutsch** · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust_server-default_backend-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_backend-available-5FA04E?logo=nodedotjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-0055FF?logo=framer&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-433E38)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Live-Demo](https://razzoozle.joelduss.xyz)** · **[🖥️ Razzoozle Desktop — Windows-App (Beta)](https://github.com/joehomeskillet/razzoozle-desktop)** · **[🛰️ Gateway](https://github.com/joehomeskillet/razzloo-gateway)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Docs](docs/)** · **[Problem melden](https://github.com/joehomeskillet/Razzoozle/issues)** · *geforkt von [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🧩 Was ist das?

Razzoozle ist ein selbstgehostetes, echtzeitliches **Quiz-Spiel** für Klassenzimmer, Events und Game-Abende. Eine Person öffnet ein Spiel auf dem großen Bildschirm, Spieler treten von ihren Telefonen mit einer PIN bei, und jeder versucht, schneller richtig zu antworten — schnellere korrekte Antworten bringen mehr Punkte. Es ist ein freundlicher Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), neu entwickelt um ein sauberes, flaches **Creme**-Design (Liquid-Glass ist nun ein optionales Theme) mit einem Manager-gesteuerten Theming-System, Gamifizierung, Team- und Einzelspielmodus sowie lokale KI-Bildgenerierung — während die klassische Kahoot-ähnliche Moderator- + Telefon-Erfahrung erhalten bleibt (farbige Antwortkacheln mit Formen, ein Countdown, ein Podium).

> Razzoozle ist ein unabhängiges Open-Source-Projekt. Es ist nicht verbunden mit, nicht bestätigt von, oder nicht verbunden mit Kahoot!® oder einer anderen kommerziellen Quiz-Plattform.

---

## 🚀 Architektur: Duales Backend (Rust ist jetzt Standard)

Razzoozle wird mit einem **leistungsstarken Rust-Backend als Standard** ausgeliefert, während der ursprüngliche Node.js-Server zur Verfügung gestellt bleibt für Kompatibilität und schrittweise Migration.

### Warum Rust?

- **Memory-safe, kompiliergeprüfte Game-State-Machine** — keine Runtime-Paniken oder undefiniertes Verhalten.
- **Schneller, speichereffizienter Echtzeit-Server** — socketioxide + axum verarbeiten 600+ gleichzeitige Spieler mit minimalem Overhead.
- **Einzelnes statisches Binary** — wird als ~10 MB Tauri-App (Rust-Sidecar) statt ~150 MB Electron + Node-Laufzeitumgebung ausgeliefert.
- **Verhaltensparität** — spricht das identische socket.io-Drahtprotokoll; Frontend und Spieler sehen keinen Unterschied.
- **Gemeinsame Wahrheitsquelle** — beide Backends lesen/schreiben die gleiche Postgres-Datenbank, was nahtloses Umschalten pro Client ermöglicht.

### Wie es funktioniert

Das **Rust-Backend** (`rust/`-Workspace):
- **`protocol/`** — ~200 Drahtprotokoltypen, generiert automatisch TypeScript-Bindings über `ts-rs` (Rust ist die Wahrheitsquelle).
- **`engine/`** — reine Spiellogik (Sentence-Builder-Chunking, Fisher-Yates-Shuffle mit Anti-Identity-Guard).
- **`server/`** — `axum` HTTP + `socketioxide` Echtzeit-Server; In-Memory-Spiel-Registry; Manager-Auth (Host-Token); Rate-Limits + Ressourcen-Caps; Quiz-Laden von Festplatte oder Datenbank.

**Manager-Operationen** vollständig in Rust implementiert: Quiz speichern/aktualisieren/löschen/duplizieren/archivieren, Konfigurationsmanagement, Submissions-Moderation, Katalog, laufende Spiele, Theme-Wechsel — gated durch `rust/gate.sh` (cargo build + Regressionstests).

**Feature-Parität** mit Node-Server: alle 7 Fragetypen, Spieler-Lebenszyklus + Neuverbindung, Spielkontrolle (kick/skip/abort/timer), Bots, `/display` Kiosk, KI/Medien, Solo-Endpoints, Team-Modus.

Das **Node-Backend** (`packages/socket`) bleibt für Rückwärtskompatibilität verfügbar; Wechsel in der Manager-UI oder über `VITE_DEFAULT_BACKEND`.

**→ Details, Build & Test: [`rust/README.md`](rust/README.md)**

---

## 📸 Bildschirmfotos

<div align="center">

| Moderator / Host | Desktop-Spielclient |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Moderator-Bildschirm" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop-Spielclient" /> |

| Spieler-Telefon | Avatar-Auswahl |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Spieler-Telefon" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar-Auswahl" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager-Theme-Cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host-Startbildschirm mit der Spiel-PIN" />

</div>

---

## ✦ Was Razzoozle über Razzia hinzufügt

| | Feature |
| --- | --- |
| 🎨 | **Theme-Cockpit** — ein Live-Manager-Tab „Design": Farben, Pro-View-Hintergründe, Logo, Radius und ein **Flat ⇄ Glass**-Style-Toggle, mit Voreinstellungen (ein flaches **Creme**-Standard + ein optionales violettes **Liquid-Glass**-Preset) und kontrastbewussten Farbwählern. |
| ☕ | **Flaches Creme-Design** — eine warme flache Creme-Oberfläche mit einer lebenden animierten Kulisse (treibende Blobs + schwebende Schul-/Wissens-Icons), eine flache „Zig"-Wortmarke/Logo und Tinte-auf-Creme-Antwortkacheln. |
| 🧊 | **Liquid-Glass-UI** — eine optionale, ältere Glassmorphismus-Theme-Variante (matt, verschwommene Oberflächen), die die flache Baseline niemals berührt. |
| 🎯 | **Kahoot-treue Spiel-Bildschirme** — Antwortkacheln mit klassischen Form-Icons (Dreieck / Diamant / Kreis / Quadrat), ein kreisförmiger Countdown-Timer, ein Antwort-erhaltener-Zähler und ein animiertes Podium. |
| 🧑‍🎨 | **Spieler-Avatare** — jeder Spieler erhält einen generierten DiceBear-Avatar (wähle einen Stil + neu würfeln, oder lade den deinen hoch); Avatare schweben in der Lobby und erscheinen auf Leaderboards, dem Podium und den Auszeichnungen. |
| 🏆 | **Gamifizierung** — 15 Achievements, Medaillen, Streaks, Konfetti und Sound-Gongs, plus eine persönliche Trophy-Galerie. |
| 🥇 | **End-Game-Auszeichnungs-Rückblick** — eine animierte Superlativ-Sequenz (schnellster Finger, größter Kletterer, längster Streak, Comeback-Kind…) zeigt Avatare und Namen der Gewinner, automatisch paced in Autoplay. |
| 👥 | **Team-Modus** — rote / blaue / grüne / gelbe Teams mit einem Live-Team-Leaderboard. |
| 📱 | **Einzelspielmodus** — trainiere jedes Quiz allein über einen Share-Link, mit der eigenen Score-Verlauf. |
| ✍️ | **Mehr Fragetypen** — Multiple-Select, Typ-die-Antwort und Schieber, zusätzlich zur klassischen Einfachauswahl. |
| 🔌 | **Plugin-System** — Manager-installierbare ZIP-Add-ons mit ihrem eigenen „Plugins"-Tab. |
| 🧩 | **Manager-Add-ons** — lade hoch, aktiviere und konfiguriere JavaScript-Add-ons aus der Manager-Konsole (eigener Tab, Fähigkeits-Badges, persistente Konfiguration); wird mit einem Copy-Paste-Starter-Skeleton (`examples/plugins/starter/`) mit einem Authoring-Vertrag ausgeliefert. |
| 📦 | **Skeleton-Theme-ZIPs** — lade ein komplettes Spiel-Theme als LLM-lesbares ZIP herunter/hoch („Skeleton": Design-Tokens + CSS + JS + ein SKELETON.md-Vertrag). |
| 📳 | **Mobile-Haptik** — optionales Vibrations-Feedback auf Spieler-Telefonen (Countdown, Antworten), Motion-Reduktion-bewusst. |
| 🔗 | **Teilbare Ergebnisse** — reichhaltige Pro-Ergebnis-Link-Vorschau (Open Graph-Entfaltung), eine Ergebnis-Seite mit „spiele es selbst / hoste deinen eigenen" Calls-to-Action und herunterladbare Gewinner-Aufkleber. |
| 🤝 | **Community-Fragen** — eine öffentliche Submissions-Seite mit einer Manager-Moderations-Warteschlange, plus ein wiederverwendbarer Frage-Katalog und ein Quiz-Archiv. |
| 🖼️ | **Lokale KI-Bilder** — Frage-/Theme-Bilder auf dem Gerät über ComfyUI (Z-Image) generieren oder Cloud-Provider anschließen — Schlüssel bleiben auf der Serverseite. |
| 🌍 | **6 Sprachen + PWA** — Englisch, Deutsch, Französisch, Spanisch, Italienisch, Chinesisch; installierbar, offline-bewusst. |
| 📺 | **Beamer-Kiosk + Zuverlässigkeit** — eine `/display`-Projektor-Ansicht, Low-Latency-Modus, Crash-Wiederherstellung, Neuverbindung und ein MCP-Server für KI-Tool-Kontrolle. |

Unterstützt durch **592+ automatisierte Tests**, einen Path-Traversal + `ws`-CVE-Sicherheits-Pass, eine gehärtete nicht-authentifizierte Oberfläche (Pro-Spiel-Ressourcen-Caps + Spiel-Ausweisung, Pro-IP-Rate-Limits, Manager-Auth-Brute-Force-Drosselung, Server-geprägte Host-Token-Auth-Schließung von IDOR) und ein Health-gated Docker Deploy. Lasttests für **600 gleichzeitige Spieler**.

---

## 📲 Apps & Begleitanwendungen

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Beta)** — die erste native **Windows**-Desktop-App für Razzoozle. Hoste und verwalte Spiele von deinem Computer, kein Browser erforderlich.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — ein leichter Rendezvous-/Discovery-Service, der Clients bei der Findung hilft. Nur Discovery — es leitet nie Gameplay weiter.

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

Die App startet auf `http://127.0.0.1:3011` (nginx + das Rust-Backend in einem Container standardmäßig). Konfiguration und Benutzerdaten leben im `./config`-Volume, erstellt und gesät beim ersten Start. Stelle es hinter deinem eigenen Reverse-Proxy (Caddy, nginx, Traefik…) für TLS und einen öffentlichen Hostname.

Um stattdessen das Node-Backend zu verwenden, setze `VITE_DEFAULT_BACKEND=node` vor dem Build oder wechsle in der Manager-UI.

### 🛠️ Ohne Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # production build
pnpm start        # oder: pnpm dev  (web + Rust backend, hot reload)
```

---

## 🎮 Wie man spielt

1. Öffne `/manager` auf dem Host-Computer und melde dich mit dem Manager-Passwort an.
2. Wähle ein Quiz und starte ein Spiel — eine PIN erscheint (zeige sie auf dem Beamer über `/display`).
3. Spieler öffnen die Website auf ihren Telefonen, geben die PIN und einen Namen ein.
4. Antworte so schnell wie du kannst — schnellere korrekte Antworten bringen mehr Punkte.
5. Beobachte das Leaderboard, Medaillen und Konfetti zwischen den Runden.

Lieber allein spielen. Öffne den **Solo**-Share-Link eines beliebigen Quiz und trainiere in deinem eigenen Tempo.

---

## ⚙️ Konfiguration

Laufzeitdaten leben in `config/` (git-ignoriert, beim ersten Start gesät).

### Spieleinstellungen — `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // ÄNDERE DIES — der Standard blockiert den Manager-Zugriff
  "teamMode": false,             // aktiviere rote/blaue/grüne/gelbe Teams
  "lowLatencyMode": { "enabled": false } // Opt-in Timing/UX-Verschärfung (siehe docs/LOW-LATENCY-MODE.md)
}
```

### Quiz — `config/quizz/*.json`

Erstelle Quiz im Editor des Managers (empfohlen) oder als JSON. Eine Frage unterstützt mehrere `type`s (`choice`, `boolean`, `slider`, plus Multiple-Select über mehrere `solutions` und Typ-die-Antwort):

```jsonc
{
  "subject": "Python Basics",
  "questions": [
    {
      "question": "Which keyword defines a function in Python?",
      "type": "choice",
      "answers": ["func", "def", "function", "fun"],
      "solutions": [1],          // 0-basierte Indizes; mehrfach = Multi-Select
      "time": 20,                 // Sekunden zum Antworten (5–120)
      "cooldown": 5,              // Sekunden bevor die Antwort offenbart wird (3–15)
      "media": { "type": "image", "url": "https://placehold.co/600x400.png" } // optional
    }
  ]
}
```

Der KI-Anbieter (aus / lokal ComfyUI / Cloud) wird im **KI**-Tab des Managers konfiguriert; API-Schlüssel werden serverseitig in `config/` gespeichert und nie an Clients gesendet.

---

## 📺 Beamer-/Kiosk-Display

`/display` rendert die Host-Präsentation im Vollbildmodus für einen Projektor oder Fernseher (vh-skalierter Typ, der über den Raum lesbar ist), vom Telefon aus koppelbar. Eine `/satellite/<gameId>`-Route ist eine kontrollfreie Kiosk-Ansicht, die sich mit einem Token authentifiziert (kein Manager-Passwort). Ein optionales Raspberry-Pi-Satelliten-Image ist enthalten.

---

## 🧱 Tech-Stack

Ein pnpm-Monorepo — **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), ein **duales Backend** (Rust `axum` + `socketioxide` standardmäßig oder Node + Socket.IO für Kompatibilität), **`@razzoozle/common`** (gemeinsam Zod-validierte Typen, automatisch generiert von Rust über `ts-rs`), und **`@razzoozle/mcp`** (ein MCP-Server für KI-Tool-Kontrolle). Wird als einzelnes Docker-Image mit einem `/healthz`-Endpoint + Docker `HEALTHCHECK` ausgeliefert.

**Rust-Backend** (`rust/`-Workspace): `razzoozle-protocol` (Drahttypen), `razzoozle-engine` (Spiellogik), `razzoozle-server` (`axum` + `socketioxide`).

---

## 🤝 Beitragen

Issues und Pull-Requests sind willkommen. Führe `pnpm verify` (typecheck + lint + Tests) aus, bevor du einen PR öffnest. Für Rust-Backend-Änderungen, führe `cargo test` in `rust/` aus und überprüfe, dass das CI-Gate (echtes Spiel-Smoke-Test) bestanden hat.

---

## ⭐ Star-Verlauf

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Star history" />
</a>

---

## 📝 Credits & Lizenz

Razzoozle ist ein Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — vielen Dank an die upstream-Autoren. Veröffentlicht unter der **[MIT License](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle-Beiträger); die Upstream-MIT-Mitteilung wird beibehalten.
