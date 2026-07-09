<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Piattaforma di quiz live self-hosted e open source — un presentatore in stile Kahoot + gioco su telefono con un design crema pulito.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · 🌐 **Italiano** · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Demo live](https://razzoozle.joelduss.xyz)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documentazione](docs/)** · **[🖥️ App desktop](https://github.com/joehomeskillet/razzoozle-desktop)** · **[Segnala un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork di [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Cos'è?

Razzoozle è un **quiz game** in tempo reale e self-hosted per aule, eventi e serate di gioco. Un conduttore apre una partita sullo schermo grande, i giocatori si uniscono dai loro telefoni con un PIN e le risposte corrette più veloci ottengono più punti. È un fork amichevole di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) con un cockpit dei temi gestito dal moderatore, gamification, gioco a squadre e in solitaria, plugin e immagini AI locali — mantenendo la classica esperienza di presentatore con caselle colorate + telefono.

> Progetto open source indipendente. Non affiliato, approvato o connesso a Kahoot!® o a qualsiasi altra piattaforma commerciale di quiz.

---

## 📸 Screenshot

<div align="center">

| Presentatore / host | Client desktop |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> |

| Telefono del giocatore | Selezione avatar |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Player phone" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar selection" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager theme cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## Avvio rapido

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

docker compose -f compose.node.yml up -d   # Node backend → http://127.0.0.1:3010
# or
docker compose -f compose.rust.yml up -d   # Rust backend → http://127.0.0.1:3011
```

Ogni file è autonomo (app + il proprio Postgres) e indipendente, quindi puoi eseguirli entrambi affiancati. Apri l'app, vai su `/manager` e **cambia la password predefinita del moderatore**. Metti un reverse proxy (Caddy/Traefik/nginx) davanti per il TLS e un hostname pubblico.

Non vuoi un database? Imposta `DATABASE_MODE=file` per eseguire senza Postgres. Senza Docker: `pnpm install && pnpm build && pnpm start` (richiede Node 22+ e pnpm 11+).

---

## ✦ Cosa Razzoozle aggiunge rispetto a Razzia

| | Funzionalità |
| --- | --- |
| 🎨 | **Cockpit dei temi** — una scheda "Design" live nel moderatore: colori, sfondi per-vista, logo, raggio e un interruttore di stile **Flat ⇄ Glass**, con preset (un **crema** piatto di default + un preset viola **liquid-glass** opzionale) e selettori di colore attenti al contrasto. |
| ☕ | **Design crema piatto** — un'interfaccia crema piatta e calda con uno sfondo animato vivo (blob alla deriva + icone scolastiche/di conoscenza fluttuanti), un logotipo/logo piatto e caselle di risposta inchiostro-su-crema. |
| 🧊 | **UI liquid-glass** — una variante di tema glassmorphism opzionale ed ereditata (superfici smerigliate e sfocate) che non tocca mai la base piatta. |
| 🎯 | **Schermate di gioco fedeli a Kahoot** — caselle di risposta con le classiche icone di forma (triangolo / rombo / cerchio / quadrato), un conto alla rovescia circolare, un contatore delle risposte ricevute e un podio animato. |
| 🧑‍🎨 | **Avatar dei giocatori** — ogni giocatore riceve un avatar DiceBear generato (scegli uno stile + rilancia, oppure carica il tuo); gli avatar fluttuano nella lobby e appaiono su classifiche, podio e premi. |
| 🏆 | **Gamification** — 15 obiettivi, medaglie, serie, coriandoli e suoni, più una galleria personale di trofei. |
| 🥇 | **Riepilogo dei premi di fine partita** — una sequenza animata di superlativi (dito più veloce, maggior scalatore, serie più lunga, comeback kid…) che mostra l'avatar + il nome di ogni vincitore, con ritmo automatico in autoplay. |
| 👥 | **Modalità squadre** — squadre rossa / blu / verde / gialla con una classifica di squadra live. |
| 📱 | **Gioco in solitaria** — esercitati su qualsiasi quiz da solo tramite un link di condivisione, con la propria cronologia dei punteggi. |
| ✍️ | **Più tipi di domande** — selezione multipla, digita-la-risposta e cursore, oltre alla classica scelta singola. |
| 🔌 | **Sistema di plugin** — add-on ZIP installabili dal moderatore con una propria scheda "Plugins". |
| 🧩 | **Addon del moderatore** — carica, abilita e configura addon JavaScript dalla console del moderatore (scheda dedicata, badge di capacità, configurazione persistita); include uno starter skeleton copia-incolla (`examples/plugins/starter/`) con un contratto di authoring. |
| 📦 | **ZIP di tema skeleton** — scarica/carica un intero tema di gioco come uno ZIP leggibile da un LLM ("skeleton": token di design + CSS + JS + un contratto SKELETON.md). |
| 📳 | **Feedback aptico mobile** — feedback di vibrazione opzionale sui telefoni dei giocatori (conto alla rovescia, risposte), attento al reduced-motion. |
| 🔗 | **Risultati condivisibili** — anteprime di link ricche per risultato (Open Graph unfurl), una pagina di risultato con call-to-action "giocalo tu stesso / ospita la tua" e sticker del vincitore scaricabili. |
| 🤝 | **Domande della community** — una pagina pubblica di invio con una coda di moderazione del moderatore, più un catalogo di domande riutilizzabile e un archivio di quiz. |
| 🖼️ | **Immagini AI locali** — genera grafiche di domande/temi sul dispositivo tramite ComfyUI (Z-Image), oppure collega provider cloud — le chiavi restano lato server. |
| 🌍 | **6 lingue + PWA** — inglese, tedesco, francese, spagnolo, italiano, cinese; installabile, utilizzabile offline. |
| 📺 | **Kiosk proiettore + affidabilità** — una vista proiettore `/display`, modalità a bassa latenza, ripristino dai crash, riconnessione e un server MCP per il controllo tramite strumenti AI. |

Supportato da **oltre 592 test automatizzati**, un pass di sicurezza path-traversal + CVE `ws`, una superficie non autenticata irrobustita (limiti di risorse per partita + espulsione delle partite, limiti di frequenza per IP, throttling anti-forza-bruta sull'auth del moderatore, autenticazione con host-token emesso dal server che chiude l'IDOR) e un deploy Docker con health-gate. Testato sotto carico fino a **600 giocatori simultanei**.

---

## Backend

Razzoozle offre **due backend intercambiabili** che parlano lo stesso protocollo socket.io su un unico database Postgres condiviso — cambia per client nell'interfaccia del moderatore o con `VITE_DEFAULT_BACKEND`. Il server **Rust** (`axum` + `socketioxide`, memory-safe e a basso consumo) copre tutti i flussi di gioco, moderatore, giocatore e display. Il server **Node.js** (`packages/socket`) è completo ed è l'impostazione predefinita autonoma in `compose.node.yml`. Alcuni endpoint HTTP periferici (metriche Prometheus, telemetria client, anteprima di condivisione social, il documento OpenAPI) e gli hook JS dei plugin lato server sono solo Node.

**→ Dettagli interni Rust, build e test: [`rust/README.md`](rust/README.md)**

---

## Configurazione e documentazione

I dati di runtime risiedono nel volume `config`, inizializzato al primo avvio. Le impostazioni di partita sono in `config/game.json`; i quiz si creano nell'editor del moderatore o come `config/quizz/*.json`. Vedi **[docs/](docs/)**: [Self-Hosting](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-latency mode](docs/LOW-LATENCY-MODE.md).

---

## App e companion

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Beta)** — un'app Windows nativa per ospitare e gestire partite senza browser.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — un servizio di discovery leggero (non inoltra mai il gameplay).

---

## Contribuire

Issue e pull request sono benvenute. Esegui `pnpm verify` (typecheck + lint + test) prima di aprire una PR; per le modifiche Rust, esegui `bash rust/gate.sh`.

---

## Crediti e licenza

Un fork di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — grazie agli autori originali. Rilasciato sotto la **[Licenza MIT](LICENSE)** (© 2024 Ralex, © 2026 contributori Razzoozle).
