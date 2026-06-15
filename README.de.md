<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

**Eine selbstgehostete Open-Source-Plattform für Live-Quizze — mit einer violetten Liquid-Glass-Oberfläche.**

🌐 [English](README.md) · **Deutsch** · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

[Live demo](https://razzoozle.joelduss.xyz) · [Report an issue](https://github.com/joehomeskillet/Razzoozle/issues)

</div>

---

## 🧩 Was ist das?

Razzoozle ist ein selbstgehostetes **Quizspiel** in Echtzeit für Klassenzimmer, Events und Spieleabende: Eine Gastgeberin oder ein Gastgeber öffnet ein Spiel auf dem großen Bildschirm, die Spielenden treten per PIN von ihren Handys aus bei, und alle wetteifern um die schnellste Antwort. Es ist ein freundlicher Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), neu aufgebaut rund um einen unverwechselbaren **violetten Liquid-Glass**-Look, ein vom Manager gesteuertes Theming-System, Gamification, Solo-Modus und lokale KI-Bildgenerierung.

> Razzoozle ist ein unabhängiges Open-Source-Projekt. Es steht in keiner Verbindung zu Kahoot!® oder einer anderen kommerziellen Quizplattform, wird von diesen nicht unterstützt und ist nicht mit ihnen verbunden.

<div align="center">
<img src="docs/screenshots/join.webp" width="32%" alt="Join screen" />
<img src="docs/screenshots/solo-question.webp" width="22%" alt="Question screen" />
<img src="docs/screenshots/leaderboard.webp" width="22%" alt="Leaderboard" />
</div>

---

## ✦ Was Razzoozle gegenüber Razzia hinzufügt

Eine kleine, ehrliche Zusammenfassung dessen, was dieser Fork zusätzlich zum Upstream-Razzia mitbringt:

| | Feature |
| --- | --- |
| 🎨 | **Theme-Cockpit** — ein Live-„Design“-Tab im Manager: Farben, Hintergründe pro Ansicht, Logo, Radius und ein **Flat ⇄ Glass**-Stilumschalter, mit Presets (bringt ein violettes **Liquid-Glass**-Preset und einen flachen Standard mit) sowie kontrastbewusste Farbwähler. |
| 🧊 | **Liquid-Glass-UI** — eine optional aktivierbare Glassmorphism-Theme-Variante (mattierte, weichgezeichnete Flächen), die die flache Basis nie antastet. |
| 🏆 | **Gamification** — 15 Erfolge, Medaillen, Serien, Konfetti und Klangsignale, dazu eine persönliche Trophäengalerie. |
| 👥 | **Team-Modus** — rote, blaue, grüne und gelbe Teams mit einer Live-Team-Rangliste. |
| 📱 | **Solo-Modus** — übe jedes Quiz allein über einen Teilen-Link, mit eigener Punkte-Historie. |
| ✍️ | **Mehr Fragetypen** — Mehrfachauswahl und Antwort-eintippen, zusätzlich zur klassischen Auswahl und zum Slider. |
| 🤝 | **Community-Fragen** — eine öffentliche Einreichungsseite mit einer Moderations-Warteschlange im Manager, dazu ein wiederverwendbarer Fragenkatalog und ein Quiz-Archiv. |
| 🖼️ | **Lokale KI-Bilder** — erzeuge Bilder für Fragen und Themes direkt auf dem Gerät über ComfyUI (Z-Image), oder binde Cloud-Anbieter ein — die Schlüssel bleiben serverseitig. |
| 🌍 | **6 Sprachen + PWA** — Englisch, Deutsch, Französisch, Spanisch, Italienisch, Chinesisch; installierbar, offline-fähig. |
| 📺 | **Beamer-Kiosk + Zuverlässigkeit** — eine eigene `/display`-Projektoransicht, Modus mit geringer Latenz, Absturz-Wiederherstellung, Reconnect und ein MCP-Server zur Steuerung durch KI-Tools. |

Alles davon ist durch **350+ automatisierte Tests** und ein health-geprüftes Docker-Deploy abgedeckt.

---

## ⚙️ Voraussetzungen

**Mit Docker (empfohlen):** Docker + Docker Compose.
**Ohne Docker:** Node 22+ und pnpm 11+.

---

## 📖 Erste Schritte

### Docker (empfohlen)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```

Das baut das Image und startet die App unter `http://127.0.0.1:3011` (nginx + der Socket-Server in einem Container). Konfiguration und Nutzerdaten liegen im Volume `./config`, das beim ersten Start angelegt und befüllt wird.

Stelle für TLS und einen öffentlichen Hostnamen deinen eigenen Reverse Proxy davor (Caddy, nginx, Traefik …).

### Ohne Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build
pnpm start
```

Dev-Modus (Web + Socket mit Hot Reload): `pnpm dev`.

---

## 🎮 So wird gespielt

1. Öffne `/manager` auf der Host-Maschine und melde dich mit dem Manager-Passwort an (`config/game.json`).
2. Wähle ein Quiz und starte ein Spiel — eine PIN erscheint auf dem Bildschirm (zeige sie über `/display` auf dem Beamer).
3. Die Spielenden öffnen die Seite auf ihren Handys, geben die PIN und einen Namen ein.
4. Antworte so schnell du kannst — schnellere richtige Antworten geben mehr Punkte.
5. Verfolge die Rangliste, die Medaillen und das Konfetti zwischen den Runden.

Lieber allein spielen? Öffne den **Solo**-Teilen-Link eines beliebigen Quiz und übe in deinem eigenen Tempo.

---

## ⚙️ Konfiguration

Laufzeitdaten liegen in `config/` (von git ignoriert, beim ersten Start befüllt):

- `config/game.json` — Spielregeln + das Manager-Passwort.
- `config/quizz/*.json` — deine Quizze.
- `config/theme/theme.json` — das aktive Theme (oder wähle ein Preset im Design-Tab).
- `config/ai-settings.json` — Auswahl des KI-Anbieters (Schlüssel werden separat gespeichert und nie an Clients gesendet).

Ein Quiz ist schlichtes JSON — zum Beispiel:

```jsonc
{
  "subject": "General knowledge",
  "questions": [
    {
      "question": "What colour is the sky on a clear day?",
      "type": "choice",
      "answers": ["Green", "Blue", "Red", "Yellow"],
      "solution": 1,
      "time": 15,
      "cooldown": 5
    }
  ]
}
```

Du kannst Quizze auch in der Manager-Oberfläche erstellen, Bilder mit KI generieren oder Community-Einreichungen annehmen.

---

## 🧱 Tech-Stack

Ein pnpm-Monorepo: **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), **`@razzoozle/socket`** (Node + Socket.IO + Express), **`@razzoozle/common`** (geteilte, Zod-validierte Typen) und **`@razzoozle/mcp`** (ein MCP-Server zur Steuerung durch KI-Tools). Wird als einzelnes Docker-Image ausgeliefert (nginx + node via supervisord).

---

## 📝 Credits & Lizenz

Razzoozle ist ein Fork von [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — herzlichen Dank an die Upstream-Autoren. Veröffentlicht unter der **[MIT License](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle contributors). Der Upstream-MIT-Hinweis bleibt erhalten.

Beiträge sind willkommen — eröffne ein Issue oder einen Pull Request.
