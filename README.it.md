<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### Una piattaforma di quiz dal vivo, self-hosted e open-source — con un design **cream** pulito e flat (e un tema liquid-glass opzionale).

🌐 [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · **Italiano** · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![Rust](https://img.shields.io/badge/Rust_server-rewrite_in_progress-CE422B?logo=rust&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-0055FF?logo=framer&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-433E38)
![Tests](https://img.shields.io/badge/tests-592-3DBFA0)

**[▶ Demo dal vivo](https://razzoozle.joelduss.xyz)** · **[🖥️ Razzoozle Desktop — App Windows (Beta)](https://github.com/joehomeskillet/razzoozle-desktop)** · **[🛰️ Gateway](https://github.com/joehomeskillet/razzloo-gateway)** · **[🌐 Vetrina](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Docs](docs/)** · **[Segnala un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork da [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🦀 Riscrittura in Rust — anteprima feature-complete (non è l'impostazione predefinita)

Il server di gioco Node.js (`packages/socket`) è ancora quello che esegue la **produzione**
su [razzoozle.joelduss.xyz](https://razzoozle.joelduss.xyz) — ogni funzionalità in
questo README, tutti i tipi di domande, temi/scheletri, gamification, gioco a squadre e in solitaria,
avatar DiceBear, immagini IA locali, haptic mobile, 6 lingue, ~592 test,
testato sotto carico fino a 600 giocatori simultanei.

In parallelo, una **riscrittura da zero in Rust** del server di gioco (`axum` +
`socketioxide 0.15`) parla il protocollo socket.io *identico*, così il
frontend non se ne accorge. È ora **feature-complete**: una partita completa con scoring
con più domande, tutti i 7 tipi di domande, ciclo di vita dei giocatori + riconnessione,
autenticazione del manager, quiz da disco, endpoint HTTP + solitaria, controllo di gioco
(espulsione/saltare/interruzione/timer), bot, il kiosk `/display` e IA/media. I tipi condivisi
sono generati da Rust tramite `ts-rs` — i tipi di rete Rust sono la fonte della verità. Viene eseguito come **container parallelo su `:3012`** insieme a Node su `:3011` e viene testato ad ogni deploy da un gate CI di gioco reale (una partita da 100 giocatori giocata fino al completamento + un test di riconnessione) — ma **non è ancora l'impostazione predefinita**; Node rimane il percorso di produzione fino a un cutover shadow.

**Perché Rust:** spedire l'app desktop come **~10 MB app Tauri** (sidecar Rust)
invece di un bundle Electron ~150 MB, una macchina di stato del gioco verificata al compile e
un singolo binario statico.

Uno sforzo parallelo di **v2.0 hardening** — una caccia ai bug multi-modello avversariale (19
findings confermati) — sta sbarcando correzioni su entrambi i gemelli: limiti di risorse per partita +
evizione di partite, limiti di frequenza per IP, un elenco consentiti di traversal di percorsi, corrispondenza di testo Unicode-corretta e
autenticazione host-token coniata dal server che chiude un buco di controllo incrociato di gioco
(IDOR). Un refactor di modularizzazione / actor-per-gioco è pianificato in seguito.

**→ Dettagli, tabella di stato, build & run: [`rust/README.md`](rust/README.md)**

---

## 🧩 Di cosa si tratta?

Razzoozle è un **gioco a quiz** in tempo reale e self-hosted per aule, eventi e serate di giochi. Un host apre una partita sul grande schermo, i giocatori si uniscono dai loro telefoni con un PIN e tutti gareggiano per rispondere — le risposte corrette più veloci guadagnano più punti. È un fork amichevole di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), ricostruito attorno a un design **cream** pulito e flat (il liquid-glass è ora un tema opzionale) con un sistema di temi guidato dal manager, gamification, modalità a squadre e solo e generazione di immagini con IA locale — mantenendo al contempo la classica esperienza in stile Kahoot tra presentatore e telefono (caselle di risposta colorate con forme, un conto alla rovescia, un podio).

> Razzoozle è un progetto open-source indipendente. Non è affiliato, approvato o collegato a Kahoot!® né ad alcun'altra piattaforma di quiz commerciale.

---

## 📸 Screenshot

<div align="center">

| Presentatore / host | Client di gioco desktop |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> |

| Telefono del giocatore | Selezione dell'avatar |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Player phone" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar selection" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager theme cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## ✦ Cosa aggiunge Razzoozle rispetto a Razzia

| | Funzionalità |
| --- | --- |
| 🎨 | **Cockpit dei temi** — una scheda "Design" dal vivo nel manager: colori, sfondi per ciascuna vista, logo, raggio e un selettore di stile **Flat ⇄ Glass**, con preset (un **cream** flat predefinito + un preset viola **liquid-glass** opzionale) e selettori di colore consapevoli del contrasto. |
| ☕ | **Design cream flat** — un'interfaccia cream calda e flat con uno sfondo animato e vivo (blob alla deriva + icone fluttuanti di scuola/conoscenza), un logo/wordmark "Zig" flat e caselle di risposta inchiostro-su-cream. |
| 🧊 | **Interfaccia liquid-glass** — una variante di tema glassmorphism opzionale e legacy (superfici smerigliate e sfocate) che non tocca mai la base flat. |
| 🎯 | **Schermate di gioco fedeli a Kahoot** — caselle di risposta con le classiche icone di forme (triangolo / rombo / cerchio / quadrato), un timer circolare di conto alla rovescia, un contatore delle risposte ricevute e un podio animato. |
| 🧑‍🎨 | **Avatar dei giocatori** — ogni giocatore riceve un avatar DiceBear generato (scegli uno stile + rilancia, oppure carica il tuo); gli avatar fluttuano nella lobby e compaiono nelle classifiche, sul podio e nei premi. |
| 🏆 | **Gamification** — 15 obiettivi, medaglie, serie, coriandoli e suoni cristallini, oltre a una galleria di trofei personale. |
| 🥇 | **Riepilogo dei premi di fine partita** — una sequenza animata di superlativi (dito più veloce, più grande scalatore, serie più lunga, re della rimonta…) che mostra l'avatar + il nome di ogni vincitore, ritmata automaticamente in autoplay. |
| 👥 | **Modalità a squadre** — squadre rossa / blu / verde / gialla con una classifica di squadra dal vivo. |
| 📱 | **Modalità solo** — esercitati da solo su qualsiasi quiz tramite un link condivisibile, con la propria cronologia dei punteggi. |
| ✍️ | **Più tipi di domande** — scelta multipla, digita-la-risposta e cursore, oltre alla classica scelta singola. |
| 🔌 | **Sistema di plugin** — add-on ZIP installabili dal manager con la propria scheda "Plugins". |
| 🧩 | **Addon del manager** — carica, abilita e configura addon JavaScript dalla console del manager (scheda dedicata, badge di capacità, configurazione persistente); include uno scheletro di partenza da copia-incolla (`examples/plugins/starter/`) con un contratto di authoring. |
| 📦 | **ZIP di tema scheletro** — scarica/carica un intero tema di gioco come ZIP leggibile da LLM ("scheletro": design token + CSS + JS + un contratto SKELETON.md). |
| 📳 | **Feedback aptico mobile** — feedback opzionale tramite vibrazione sui telefoni dei giocatori (conto alla rovescia, risposte), consapevole del movimento ridotto. |
| 🔗 | **Risultati condivisibili** — ricche anteprime dei link per ciascun risultato (unfurl Open Graph), una pagina dei risultati con inviti all'azione "giocaci tu stesso / ospita il tuo" e adesivi del vincitore scaricabili. |
| 🤝 | **Domande della community** — una pagina di invio pubblica con una coda di moderazione lato manager, oltre a un catalogo di domande riutilizzabile e un archivio di quiz. |
| 🖼️ | **Immagini con IA locale** — genera immagini per domande/temi sul dispositivo tramite ComfyUI (Z-Image), oppure collega provider cloud — le chiavi restano lato server. |
| 🌍 | **6 lingue + PWA** — inglese, tedesco, francese, spagnolo, italiano, cinese; installabile, consapevole della modalità offline. |
| 📺 | **Kiosk beamer + affidabilità** — una vista proiettore `/display`, modalità a bassa latenza, ripristino dopo i crash, riconnessione e un server MCP per il controllo da strumenti IA. |

Supportato da **592 test automatizzati**, un controllo di sicurezza contro il path-traversal e la CVE di `ws`, una superficie non autenticata irrobustita (limiti di giocatori per partita e di partite attive, endpoint pubblici a frequenza limitata, throttling del brute-force sull'autenticazione del manager) e un deploy Docker controllato dallo stato di salute. Testato sotto carico fino a **600 giocatori simultanei**.

---

## 📲 App e companion

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Beta)** — la prima app desktop nativa per **Windows** di Razzoozle. Ospita e gestisci le partite dal tuo computer, senza bisogno del browser.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — un leggero servizio di rendezvous / discovery che aiuta i client a trovarsi a vicenda. Solo discovery — non inoltra mai il gameplay.

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

L'applicazione si avvia su `http://127.0.0.1:3011` (nginx + il server socket in un unico container). La configurazione e i dati utente risiedono nel volume `./config`, creato e popolato al primo avvio. Mettila dietro il tuo reverse proxy (Caddy, nginx, Traefik…) per il TLS e un hostname pubblico.

### 🛠️ Senza Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # production build
pnpm start        # or: pnpm dev  (web + socket, hot reload)
```

---

## 🎮 Come giocare

1. Apri `/manager` sulla macchina host e accedi con la password del manager.
2. Scegli un quiz e avvia una partita — appare un PIN (mostralo sul beamer tramite `/display`).
3. I giocatori aprono il sito sui loro telefoni, inseriscono il PIN e un nome.
4. Rispondi il più velocemente possibile — le risposte corrette più veloci guadagnano più punti.
5. Osserva la classifica, le medaglie e i coriandoli tra un turno e l'altro.

Preferisci giocare da solo? Apri il link di condivisione **solo** di un qualsiasi quiz ed esercitati al tuo ritmo.

---

## ⚙️ Configurazione

I dati di runtime risiedono in `config/` (ignorato da git, popolato al primo avvio).

### Impostazioni di gioco — `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // CHANGE THIS — the default blocks manager access
  "teamMode": false,             // enable red/blue/green/yellow teams
  "lowLatencyMode": { "enabled": false } // opt-in timing/UX tightening (see docs/LOW-LATENCY-MODE.md)
}
```

### Quiz — `config/quizz/*.json`

Crea i quiz nell'editor del manager (consigliato) o come JSON. Una domanda supporta diversi `type` (`choice`, `boolean`, `slider`, oltre alla scelta multipla tramite più `solutions` e digita-la-risposta):

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

Il provider di IA (disattivato / ComfyUI locale / cloud) si configura nella scheda **AI** del manager; le chiavi API sono memorizzate lato server in `config/` e non vengono mai inviate ai client.

---

## 📺 Display beamer / kiosk

`/display` rende la presentazione dell'host a schermo intero per un proiettore o una TV (tipografia ridimensionata in vh, leggibile attraverso una stanza), abbinabile da un telefono. La rotta `/satellite/<gameId>` è una vista kiosk priva di comandi che si autentica con un token (nessuna password del manager). È inclusa un'immagine satellite opzionale per Raspberry Pi.

---

## 🧱 Stack tecnologico

Un monorepo pnpm — **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), **`@razzoozle/socket`** (Node + Socket.IO + Express, snapshot di ripristino dopo i crash), **`@razzoozle/common`** (tipi condivisi validati da Zod) e **`@razzoozle/mcp`** (un server MCP per il controllo da strumenti IA). Distribuito come una singola immagine Docker (nginx + node tramite supervisord) con un endpoint `/healthz` + un `HEALTHCHECK` Docker.

---

## 🤝 Contribuire

Issue e pull request sono benvenute. Esegui `pnpm verify` (typecheck + lint + test) prima di aprire una PR.

---

## ⭐ Cronologia delle stelle

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Star history" />
</a>

---

## 📝 Crediti e licenza

Razzoozle è un fork di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — un enorme grazie agli autori upstream. Rilasciato sotto la **[licenza MIT](LICENSE)** (© 2024 Ralex, © 2026 Razzoozle contributors); l'avviso MIT upstream è mantenuto.
