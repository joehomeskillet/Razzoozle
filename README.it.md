<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### Una piattaforma di quiz dal vivo self-hosted e open-source — con un design **crema** pulito e piatto (e un tema liquid-glass opzionale).

🌐 [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · **Italiano** · [中文](README.zh.md)

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

**[▶ Demo dal vivo](https://razzoozle.joelduss.xyz)** · **[🖥️ Razzoozle Desktop — App Windows (Beta)](https://github.com/joehomeskillet/razzoozle-desktop)** · **[🛰️ Gateway](https://github.com/joehomeskillet/razzloo-gateway)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documenti](docs/)** · **[Segnala un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *biforcato da [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🧩 Cos'è questo?

Razzoozle è un **quiz game** dal vivo e self-hosted per aule, eventi e serate di gioco. Un presentatore apre una partita sul grande schermo, i giocatori si uniscono dai loro telefoni con un PIN, e tutti gareggiano per rispondere — le risposte corrette più veloci segnano di più. È un fork amichevole di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), ricostruito intorno a un design **crema** pulito e piatto (liquid-glass è ora un tema opzionale) con un sistema di tematizzazione guidato dal manager, gamificazione, modalità team e solo e generazione di immagini con AI locale — mantenendo l'esperienza classica di presentatore + telefono in stile Kahoot (tile di risposta colorate con forme, un conto alla rovescia, un podio).

> Razzoozle è un progetto open-source indipendente. Non è affiliato con, approvato da, o collegato a Kahoot!® o a qualsiasi altra piattaforma di quiz commerciale.

---

## 🚀 Architettura: Dual Backend (Rust è ora il default)

Razzoozle viene fornito con un **backend Rust performante come default**, mantenendo disponibile il server Node.js originale per compatibilità e migrazione graduale.

### Perché Rust?

- **State machine di gioco memory-safe e compile-checked** — nessun panic a runtime o comportamento indefinito.
- **Server real-time veloce e leggero** — socketioxide + axum gestiscono 600+ giocatori simultanei con overhead minimo.
- **Single static binary** — viene fornito come app Tauri di ~10 MB (Rust sidecar) invece di ~150 MB Electron + Node runtime.
- **Parità comportamentale** — parla il protocollo wire socket.io identico; frontend e giocatori non vedono alcuna differenza.
- **Fonte di verità condivisa** — entrambi i backend leggono/scrivono nello stesso database Postgres, abilitando switching seamless per-client.

### Come funziona

Il **backend Rust** (`rust/` workspace):
- **`protocol/`** — ~200 tipi di protocollo wire, auto-genera binding TypeScript via `ts-rs` (Rust è la fonte di verità).
- **`engine/`** — logica di gioco pura (sentence-builder chunking, Fisher-Yates shuffle con anti-identity guard).
- **`server/`** — `axum` HTTP + `socketioxide` server real-time; game registry in-memory; autenticazione manager (host-token); rate-limits + resource caps; caricamento quiz da disco o database.

Le **operazioni di manager** sono completamente implementate in Rust: salvataggio/aggiornamento/eliminazione/duplicazione/archiviazione quiz, gestione della configurazione, moderazione degli invii, catalogo, partite in esecuzione, cambio tema — controllate da `rust/gate.sh` (cargo build + test di regressione).

**Parità delle funzionalità** con il server Node: tutti i 7 tipi di domanda, ciclo di vita del giocatore + riconnessione, controllo del gioco (kick/skip/abort/timer), bot, chiosco `/display`, AI/media, endpoint solo, modalità team.

Il **backend Node** (`packages/socket`) rimane disponibile per compatibilità all'indietro; passa nell'interfaccia utente del manager o tramite `VITE_DEFAULT_BACKEND`.

**→ Dettagli, build & test: [`rust/README.md`](rust/README.md)**

---

## 📸 Schermate

<div align="center">

| Presentatore / host | Client di gioco desktop |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Schermata presentatore" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Client di gioco desktop" /> |

| Telefono del giocatore | Selezione avatar |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Telefono del giocatore" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Selezione avatar" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Cockpit tema manager" />

<img src="docs/screenshots/start.webp" width="680" alt="Schermata di avvio host con Game PIN" />

</div>

---

## ✦ Cosa aggiunge Razzoozle rispetto a Razzia

| | Funzionalità |
| --- | --- |
| 🎨 | **Cockpit tema** — una scheda "Design" del manager dal vivo: colori, sfondi per-view, logo, raggio e un interruttore di stile **Flat ⇄ Glass**, con preset (un default **crema** piatto + un preset **liquid-glass** viola opzionale) e color picker consapevoli del contrasto. |
| ☕ | **Design crema piatto** — un'interfaccia crema piatta e calda con uno sfondo animato vivente (blob alla deriva + icone scuola/conoscenza fluttuanti), un wordmark/logo "Zig" piatto e tile di risposta inchiostro-su-crema. |
| 🧊 | **UI Liquid-glass** — una variante di tema glassmorphism opzionale e legacy (superfici frosted, sfuocate) che non tocca mai il baseline piatto. |
| 🎯 | **Schermate di gioco fedeli a Kahoot** — tile di risposta con le icone di forma classiche (triangolo / diamante / cerchio / quadrato), un timer di conto alla rovescia circolare, un contatore di risposte ricevute e un podio animato. |
| 🧑‍🎨 | **Avatar dei giocatori** — ogni giocatore ottiene un avatar DiceBear generato (scegli uno stile + rilancia, o carica il tuo); gli avatar fluttuano intorno alla lobby e appaiono nelle classifiche, sul podio e nei premi. |
| 🏆 | **Gamificazione** — 15 achievement, medaglie, streak, confetti e campanelli sonori, più una galleria di trofei personale. |
| 🥇 | **Recap premi di fine gioco** — una sequenza di superlativi animata (dito più veloce, scalatore più grande, streak più lungo, ragazzo del ritorno...) che mostra l'avatar + nome di ogni vincitore, auto-pacato in autoplay. |
| 👥 | **Modalità team** — team rossi / blu / verdi / gialli con una classifica del team dal vivo. |
| 📱 | **Gioco solo** — esercitati in qualsiasi quiz da solo tramite un link di condivisione, con la sua storia di punteggi. |
| ✍️ | **Più tipi di domanda** — selezione multipla, digita la risposta e slider, oltre alla scelta singola classica. |
| 🔌 | **Sistema plugin** — add-on ZIP installabili dal manager con la loro propria scheda "Plugin". |
| 🧩 | **Add-on manager** — carica, abilita e configura add-on JavaScript dalla console del manager (scheda propria, badge di funzionalità, configurazione persistente); fornisce uno skeleton di avvio copia-incolla (`examples/plugins/starter/`) con un contratto di authoring. |
| 📦 | **ZIP tema skeleton** — scarica/carica un tema di gioco intero come ZIP leggibile da LLM ("skeleton": design token + CSS + JS + un contratto SKELETON.md). |
| 📳 | **Tattili mobili** — feedback di vibrazione opzionale su telefoni dei giocatori (conto alla rovescia, risposte), consapevole della motion ridotta. |
| 🔗 | **Risultati condivisibili** — ricche anteprime di link per-risultato (Open Graph unfurl), una pagina di risultato con "gioca da solo / ospita il tuo" call-to-action e sticker vincitori scaricabili. |
| 🤝 | **Domande della comunità** — una pagina di invio pubblica con una coda di moderazione del manager, più un catalogo di domande riutilizzabile e un archivio quiz. |
| 🖼️ | **Immagini AI locali** — genera immagini di domande/tema on-device tramite ComfyUI (Z-Image), o collega provider cloud — le chiavi rimangono lato server. |
| 🌍 | **6 lingue + PWA** — inglese, tedesco, francese, spagnolo, italiano, cinese; installabile, offline-aware. |
| 📺 | **Chiosco Beamer + affidabilità** — una vista proiettore `/display`, modalità a bassa latenza, crash-recovery, riconnessione e un server MCP per il controllo dello strumento AI. |

Supportato da **592+ test automatizzati**, un pass di sicurezza path-traversal + `ws`-CVE, una superficie non autenticata indurita (cap risorse per-gioco + eviction del gioco, rate-limit per-IP, throttling brute-force auth-manager, autenticazione host-token coniata dal server che chiude IDOR) e un deploy Docker controllato da salute. Testato in carico fino a **600 giocatori simultanei**.

---

## 📲 App e companion

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Beta)** — la prima app desktop **Windows** nativa per Razzoozle. Ospita e gestisci partite dal tuo computer, nessun browser richiesto.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — un servizio di rendezvous / scoperta leggero che aiuta i client a trovarsi l'un l'altro. Solo scoperta — non relaya mai il gameplay.

---

## ⚙️ Prerequisiti

**Con Docker (consigliato):** Docker + Docker Compose.
**Senza Docker:** Node.js 22+ e pnpm 11+.

---

## 📖 Per iniziare

### 🐳 Docker (consigliato)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```

L'app si avvia su `http://127.0.0.1:3011` (nginx + il backend Rust in un contenitore per impostazione predefinita). La configurazione e i dati utente risiedono nel volume `./config`, creati e seminati al primo avvio. Mettilo dietro il tuo proxy inverso (Caddy, nginx, Traefik…) per TLS e un nome host pubblico.

Per utilizzare il backend Node, imposta `VITE_DEFAULT_BACKEND=node` prima della compilazione, o attiva/disattiva nell'interfaccia utente del manager.

### 🛠️ Senza Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # production build
pnpm start        # o: pnpm dev  (web + backend Rust, hot reload)
```

---

## 🎮 Come giocare

1. Apri `/manager` sulla macchina host e accedi con la password del manager.
2. Scegli un quiz e avvia una partita — appare un PIN (mostralo sul beamer tramite `/display`).
3. I giocatori aprono il sito sui loro telefoni, inseriscono il PIN e un nome.
4. Rispondi il più velocemente possibile — le risposte corrette più veloci segnano di più.
5. Guarda la classifica, le medaglie e i coriandoli tra i turni.

Preferisci giocare da solo? Apri qualsiasi link di condivisione **solo** del quiz e allenati al tuo ritmo.

---

## ⚙️ Configurazione

I dati di runtime risiedono in `config/` (git-ignorato, seminato al primo avvio).

### Impostazioni del gioco — `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // CAMBIA QUESTO — il default blocca l'accesso al manager
  "teamMode": false,             // abilita team rossi/blu/verdi/gialli
  "lowLatencyMode": { "enabled": false } // opt-in timing/UX tightening (vedi docs/LOW-LATENCY-MODE.md)
}
```

### Quiz — `config/quizz/*.json`

Crea quiz nell'editor del manager (consigliato) o come JSON. Una domanda supporta diversi `type`s (`choice`, `boolean`, `slider`, più selezione multipla tramite diverse `solutions` e digita la risposta):

```jsonc
{
  "subject": "Python Basics",
  "questions": [
    {
      "question": "Which keyword defines a function in Python?",
      "type": "choice",
      "answers": ["func", "def", "function", "fun"],
      "solutions": [1],          // 0-based indices; multiple = multi-select
      "time": 20,                 // seconds to answer (5–120)
      "cooldown": 5,              // seconds before the answer is revealed (3–15)
      "media": { "type": "image", "url": "https://placehold.co/600x400.png" } // optional
    }
  ]
}
```

Il provider AI (spento / ComfyUI locale / cloud) è configurato nella scheda **AI** del manager; le chiavi API sono memorizzate lato server in `config/` e non vengono mai inviate ai client.

---

## 📺 Display Beamer / chiosco

`/display` rendering della presentazione dell'host a schermo intero per un proiettore o TV (tipo vh-scalato che legge attraverso la stanza), accoppiabile da un telefono. Un percorso `/satellite/<gameId>` è una vista chiosco senza controllo che si autentica con un token (nessuna password del manager). Un'immagine satellite Raspberry-Pi opzionale è inclusa.

---

## 🧱 Stack tecnologico

Un monorepo pnpm — **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), un **dual backend** (Rust `axum` + `socketioxide` per impostazione predefinita, o Node + Socket.IO per compatibilità), **`@razzoozle/common`** (tipi validati Zod condivisi, auto-generati da Rust tramite `ts-rs`), e **`@razzoozle/mcp`** (un server MCP per il controllo dello strumento AI). Viene fornito come una singola immagine Docker con un endpoint `/healthz` + Docker `HEALTHCHECK`.

**Backend Rust** (`rust/` workspace): `razzoozle-protocol` (tipi wire), `razzoozle-engine` (logica di gioco), `razzoozle-server` (`axum` + `socketioxide`).

---

## 🤝 Contribuzione

I problemi e le richieste pull sono benvenuti. Esegui `pnpm verify` (typecheck + lint + test) prima di aprire una PR. Per le modifiche del backend Rust, esegui `cargo test` in `rust/` e verifica che il gate CI (test di fumo del gioco reale) passi.

---

## ⭐ Storico stelle

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Storico stelle" />
</a>

---

## 📝 Crediti e licenza

Razzoozle è un fork di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — un enorme grazie agli autori upstream. Rilasciato sotto la **[Licenza MIT](LICENSE)** (© 2024 Ralex, © 2026 Contributori Razzoozle); l'avviso MIT upstream è conservato.
