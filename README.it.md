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

<img src="docs/screenshots/presenter.webp" width="640" alt="Presenter view" />

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

## Funzionalità

- **Cockpit dei temi** — una scheda "Design" live: colori, sfondi per-vista, logo, raggio, un interruttore Flat ⇄ Glass e preset.
- **Schermate fedeli a Kahoot** — caselle di risposta sagomate, un conto alla rovescia circolare, un contatore delle risposte ricevute e un podio animato.
- **Gamification** — 15 obiettivi, medaglie, serie, coriandoli, un riepilogo di superlativi a fine partita e avatar dei giocatori generati.
- **7 tipi di domande** — scelta singola e multipla, vero/falso, digita-la-risposta e cursore.
- **Squadre e solitaria** — squadre colorate con una classifica live, oppure esercitati su qualsiasi quiz da solo tramite un link di condivisione.
- **Plugin e temi skeleton** — add-on ZIP installabili dal moderatore e pacchetti di tema per l'intera partita scaricabili.
- **Immagini AI locali** — genera grafiche di domande/temi sul dispositivo tramite ComfyUI (Z-Image); le chiavi restano lato server.
- **6 lingue + PWA** — EN/DE/FR/ES/IT/ZH, installabile e utilizzabile offline, con una vista proiettore `/display`.

Supportato da oltre 592 test automatizzati, una superficie non autenticata irrobustita (limiti di risorse per partita, limiti di frequenza per IP, autenticazione con host-token emesso dal server) e testato sotto carico fino a 600 giocatori simultanei.

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
