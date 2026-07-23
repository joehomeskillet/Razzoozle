<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Piattaforma di quiz live self-hosted e open source — un presentatore in stile Kahoot + gioco su telefono con un design crema pulito.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · 🌐 **Italiano** · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Demo live](https://razzoozle.joelduss.xyz)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documentazione](docs/)** · **[Segnala un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork di [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Cos'è?

Razzoozle è un **quiz game** in tempo reale e self-hosted per aule, eventi e serate di gioco. Un conduttore apre una partita sullo schermo grande, i giocatori si uniscono dai loro telefoni con un PIN e le risposte corrette più veloci ottengono più punti. È un fork amichevole di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) con un cockpit dei temi gestito dal moderatore, gamification, gioco a squadre e in solitaria, e immagini AI locali — mantenendo la classica esperienza di presentatore con caselle colorate + telefono.

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

# Costruisci l'immagine Docker (include SPA web + server Rust)
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .

# Esegui con Postgres (richiede la variabile d'ambiente DATABASE_URL)
# Esempio: impostare una password admin predefinita per il moderatore
docker run -d \
  -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='your-secure-password' \
  -v razzoozle-config:/config \
  razzoozle:latest

# Avvia Postgres separatamente o aggiungi a docker-compose
# Vedi docs/Self-Hosting.md per le istruzioni complete di distribuzione
```

Il server funziona sulla porta `3020` e richiede un database PostgreSQL. Apri l'app, vai su `/manager` e **cambia la password predefinita del moderatore**. Metti un reverse proxy (Caddy/Traefik/nginx) davanti per il TLS e un hostname pubblico. Vedi **[Self-Hosting](docs/Self-Hosting.md)** per la configurazione dettagliata.

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
| 🏫 | **Modalità classe per le scuole** — una modalità opzionale per insegnanti: creare classi, gestire un elenco studenti (aggiungere, spostare tra classi, rimuovere), dare a ogni studente il proprio PIN e assegnare un quiz a un'intera classe con scadenza, limite di tentativi e tracciamento dei risultati pseudonimo orientato alla privacy. |
| ✍️ | **Nove tipi di domande** — scelta singola, vero/falso, sondaggio, cursore, selezione multipla, digita-la-risposta, costruttore di frasi, input matematico e tipi di parole (Wortarten), oltre alle classiche caselle di risposta colorate. |
| 📳 | **Feedback aptico mobile** — feedback di vibrazione opzionale sui telefoni dei giocatori (conto alla rovescia, risposte), attento al reduced-motion. |
| 🔗 | **Risultati condivisibili** — anteprime di link ricche per risultato (Open Graph unfurl), una pagina di risultato con call-to-action "giocalo tu stesso / ospita la tua" e sticker del vincitore scaricabili. |
| 🤝 | **Domande della community** — una pagina pubblica di invio con una coda di moderazione del moderatore, più un catalogo di domande riutilizzabile e un archivio di quiz. |
| 🖼️ | **Immagini AI locali** — genera grafiche di domande/temi sul dispositivo tramite ComfyUI (Z-Image), oppure collega provider cloud — le chiavi restano lato server. |
| 🌍 | **6 lingue + PWA** — inglese, tedesco, francese, spagnolo, italiano, cinese; installabile, utilizzabile offline. |
| 📺 | **Kiosk proiettore + affidabilità** — una vista proiettore `/display`, modalità a bassa latenza, ripristino dai crash, riconnessione e un server MCP per il controllo tramite strumenti AI. |
| 🎛️ | **Console manager unificata** — una console manager riprogettata con un sistema basato su righe, azioni multi-selezione, operazioni in blocco e controlli coerenti su tutte le schede di gestione. |

Supportato da **oltre 592 test automatizzati**, un pass di sicurezza path-traversal + CVE `ws`, una superficie non autenticata irrobustita (limiti di risorse per partita + espulsione delle partite, limiti di frequenza per IP, throttling anti-forza-bruta sull'auth del moderatore, autenticazione con host-token emesso dal server che chiude l'IDOR) e un deploy Docker con health-gate. Testato sotto carico fino a **600 giocatori simultanei**.

---

## Server Rust

Il backend di Razzoozle è un **server Rust** (`axum` + `socketioxide`, memory-safe e a basso consumo) che copre tutti i flussi di gioco, moderatore, giocatore e display e parla socket.io con il client React invariato. Lo stato è interamente persistito in **PostgreSQL**; non esiste persistenza basata su file.

**→ Dettagli interni Rust, build e test: [`rust/README.md`](rust/README.md)**

---

## Sviluppo agentico

Razzoozle è sviluppato quasi interamente da agenti di codifica IA, orchestrati dalla supervisione umana. Un team diversificato di modelli e strumenti specializzati lavora insieme per costruire, testare, revisionare e distribuire funzionalità.

| Agente | Ruolo |
| --- | --- |
| Claude | Orchestrazione e revisione |
| Codex (GPT-5.6) | Implementazione full-stack |
| Cursor (GPT-5.6) | Raffinamento e correzione del codice |
| Grok (xAI) | Implementazione del backend Rust |
| Gemini (Google) | Revisione a lungo contesto e giudizio |
| Modelli aperti | Qwen, DeepSeek, Nemotron |
| Inferenza locale | OpenVINO su Intel Arc |
| Browser QA (Playwright) | Test di gioco end-to-end |

Gli umani revisionano e uniscono ogni commit. L'IA migliora la velocità e la qualità, non sostituisce il giudizio.

---

## Configurazione e documentazione

I dati di runtime risiedono nel volume `config`, inizializzato al primo avvio. Le impostazioni di partita sono in `config/game.json`; i quiz si creano nell'editor del moderatore o come `config/quizz/*.json`. Vedi **[docs/](docs/)**: [Self-Hosting](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-latency mode](docs/LOW-LATENCY-MODE.md).

---

## Contribuire

Issue e pull request sono benvenute. Esegui `pnpm verify` (typecheck + lint + test) prima di aprire una PR; per le modifiche Rust, esegui `bash rust/gate.sh`.

---

## Crediti e licenza

Un fork di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — grazie agli autori originali. Rilasciato sotto la **[Licenza MIT](LICENSE)** (© 2024 Ralex, © 2026 contributori Razzoozle).
