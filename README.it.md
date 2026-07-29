<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Schermata di benvenuto di Razzoozle con inserimento PIN e sfondo animato" />

# Razzoozle

### Piattaforma di quiz live self-hosted e open source — un presentatore in stile Kahoot + gioco su telefono con design crema pulito.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · 🌐 **Italiano** · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Demo live](https://rust.razzoozle.xyz)** · **[🌐 Galleria](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documentazione](docs/)** · **[Segnala un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *derivato da [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Cos'è Razzoozle?

Razzoozle è una piattaforma di quiz in tempo reale self-hosted per aule, eventi e serate di gioco. Un conduttore apre una partita sul grande schermo, i giocatori si uniscono dai loro telefoni con un PIN e le risposte corrette più veloci ottengono più punti. È un fork amichevole di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) con una cabina di temi controllata dal conduttore, gamification, gioco in squadra e in solitaria, e immagini IA locali — mantenendo l'esperienza classica del presentatore di tessere colorate + telefono.

> Progetto open source indipendente. Non affiliato a, approvato da, o collegato a Kahoot!® o qualsiasi altra piattaforma commerciale di quiz.

---

## Avvio rapido

### Opzione 1: Sviluppo locale

Richiede Node 22+ e pnpm 11+.

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm dev
```

Apri `http://localhost:3000` (client web). Il server gira su porte separate (hot reload abilitato).

### Opzione 2: Docker (consigliato per la produzione)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

# Costruisci l'immagine Docker (include SPA web + server Rust)
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .

# Esegui con Postgres (richiede variabile di ambiente DATABASE_URL)
# Esempio: imposta una password amministratore predefinita
docker run -d \
  -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='tua-password-sicura' \
  -v razzoozle-config:/config \
  razzoozle:latest
```

<div align="center">
<img src="docs/screenshots/start.webp" width="680" alt="Schermata di avvio dell'host che mostra il PIN della partita e il codice QR per i giocatori" />
</div>

Il server gira sulla porta `3020` e richiede un database PostgreSQL. Apri l'app, vai a `/manager` e **cambia la password amministratore predefinita**. Metti un proxy inverso (Caddy/Traefik/nginx) davanti per TLS e un nome host pubblico. Vedi **[Self-Hosting](docs/Self-Hosting.md)** per la configurazione dettagliata.

---

## ✦ Cosa aggiunge Razzoozle rispetto a Razzia

| | Caratteristica |
| --- | --- |
| 🎨 | **Cabina di temi** — una scheda "Design" dell'host dal vivo con colori, sfondi per vista, logo, raggio, preset e selettori di colore consapevoli del contrasto. |
| ☕ | **Design crema piatto** — un'interfaccia crema piatta calda con uno sfondo animato vivente (gocce alla deriva + icone di scuola/conoscenza galleggianti), un logo piatto e tessere di risposta inchiostro-su-crema. |
| 🎯 | **Schermi di gioco fedeli a Kahoot** — tessere di risposta con le icone di forma classiche (triangolo / diamante / cerchio / quadrato), timer di conto alla rovescia circolare, contatore di risposte ricevute e podio animato. |
| 🧑‍🎨 | **Avatar dei giocatori** — ogni giocatore ottiene un avatar DiceBear generato (scegli uno stile + rinnova o carica il tuo); gli avatar galleggiano intorno alla lobby e appaiono su classifiche, podio e premi. |
| 🏆 | **Gamification** — 14 successi, medaglie, serie, coriandoli e campanelli sonori, più una galleria di trofei personale. |
| 🥇 | **Riepilogo premi di fine partita** — una sequenza animata di superlativi (dito più veloce, scalatore più grande, serie più lunga, bambino che ritorna…) che mostra avatar e nome di ogni vincitore, auto-ritmo in autoplay. |
| 👥 | **Modalità squadra** — squadre rosso / blu / verde / giallo con classifica squadra dal vivo. |
| 📱 | **Gioco in solitaria** — pratica qualsiasi quiz da solo tramite un link condiviso, con il tuo proprio storico dei punteggi. |
| 🏫 | **Modalità classe per le scuole** — una modalità insegnante facoltativa: crea classi, gestisci un elenco di studenti (aggiungi studenti, spostali tra le classi, rimuovi), dai a ogni studente il loro proprio PIN e assegna un quiz a un'intera classe con scadenza, limite di tentativi e tracciamento dei risultati pseudonimo consapevole della privacy. |
| ✍️ | **Diciassette tipi di domande** — scelta singola, vero/falso, sondaggio, slider, selezione multipla, digita la risposta, costruttore di frasi, input matematico, tipi di parole (Wortarten), sequenziamento, riempi i vuoti, abbinamento, rilascia spillo, nube di parole, brainstorm, confidenza e micro-lezione, in aggiunta alle tessere di risposta colorate classiche. |
| 📳 | **Aptica mobile** — feedback tattile opzionale su telefoni di giocatori (conto alla rovescia, risposte), consapevole del movimento ridotto. |
| 🔗 | **Risultati condivisibili** — anteprime di link per risultato ricche (dispiegamento Open Graph), pagina dei risultati con chiamate a "gioca da solo / ospita il tuo" e adesivi vincitori scaricabili. |
| 🤝 | **Domande comunitarie** — pagina di invio pubblica con coda di moderazione dell'host, più catalogo di domande riutilizzabile e archivio quiz. |
| 🖼️ | **Immagini IA locali** — genera immagini di domanda/tema sul dispositivo via ComfyUI (Z-Image), o collega provider cloud — le chiavi rimangono lato server. |
| 🌍 | **6 lingue + PWA** — inglese, tedesco, francese, spagnolo, italiano, cinese; installabile, offline-aware. |
| 📺 | **Chiosco proiettore + affidabilità** — una vista proiettore `/display`, modalità bassa latenza, recupero da crash, riconnessione e server MCP per il controllo degli strumenti AI. |
| 🎛️ | **Console dell'host unificata** — un'interfaccia host riprogettata con sistema basato su righe, azioni multi-selezione, operazioni di massa e controlli coerenti in tutte le schede di gestione. |

Supportato da **592+ test automatizzati**, un controllo di sicurezza traversal di percorso + CVE `ws`, una superficie non autenticata indurita (cap risorse per partita + sfratto partita, limiti di velocità per IP, acceleratore di brute force auth dell'host, auth token host coniato da server che chiude IDOR) e un deploy Docker controllato per la salute. Carico testato fino a **600 giocatori simultanei**.

---

## Esperienza di gioco

### Schermata di presentatore e host

L'host controlla il gioco su uno schermo grande con le tessere di risposta in stile Kahoot classiche:

<div align="center">
<img src="docs/screenshots/presenter.webp" width="680" alt="Schermata del presentatore con grandi tessere di risposta, timer e contatore di risposte ricevute" />
</div>

### Telefoni dei giocatori e client desktop

I giocatori si uniscono da dispositivi mobili o desktop e vedono la stessa domanda con tessere, il loro punteggio attuale e un timer di conto alla rovescia:

<div align="center">

| Giocatore mobile | Giocatore desktop |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="280" alt="Visualizzazione giocatore mobile con domanda e pulsanti di risposta" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Visualizzazione giocatore desktop con tessere di risposta" /> |

</div>

### Selezione avatar

Ogni giocatore sceglie o genera un avatar prima di unirsi:

<div align="center">
<img src="docs/screenshots/avatar.webp" width="420" alt="Schermata di selezione avatar con opzioni di stile DiceBear e opzione di caricamento" />
</div>

---

## Cabina di temi dell'host

Personalizza completamente l'aspetto e la sensazione in tempo reale — colori, sfondi, animazioni e tipografia — senza toccare il codice:

<div align="center">
<img src="docs/screenshots/admin.webp" width="680" alt="Pannello di controllo della progettazione dell'host con impostazioni di tema e anteprima dal vivo" />
</div>

---

## Server Rust

Il backend di Razzoozle è un **server Rust** (`axum` + `socketioxide`, sicuro per la memoria e leggero) che copre tutti i flussi di gioco, host, giocatore e display e parla socket.io al client React invariato. Lo stato del gioco è persistente in **PostgreSQL**; i modelli di quiz sono supportati da file sotto `config/templates/*.json`.

**→ Interna Rust, build & test: [`rust/README.md`](rust/README.md)**

---

## Sviluppato in modo agentico

Razzoozle è sviluppato quasi interamente da agenti di codifica AI, orchestrati da supervisione umana. Un team diversificato di modelli e strumenti specializzati lavora insieme per costruire funzionalità, testare, rivedere e distribuire.

| Agente | Ruolo |
| --- | --- |
| Claude | Orchestrazione e revisione |
| Codex (GPT-5.6) | Implementazione full-stack |
| Cursor (GPT-5.6) | Raffinamento e correzione del codice |
| Grok (xAI) | Implementazione backend Rust |
| Gemini (Google) | Revisione contesto lungo e giudizio |
| Modelli aperti | Qwen, DeepSeek, Nemotron |
| Inferenza locale | OpenVINO su Intel Arc |
| QA Browser (Playwright) | Test di gioco end-to-end |

Gli umani revisionano e uniscono ogni commit. L'IA aumenta la velocità e la qualità, non sostituisce il giudizio.

---

## Configurazione e documentazione

I dati di runtime vivono nel volume `config`, seminati al primo avvio. Le impostazioni di gioco sono in `config/game.json`; i quiz sono creati nell'editor dell'host o come `config/quizz/*.json`. Vedi **[docs/](docs/)**: [Self-Hosting](docs/Self-Hosting.md) · [Configurazione](docs/Configuration.md) · [Temi](docs/Theming.md) · [Modalità bassa latenza](docs/LOW-LATENCY-MODE.md).

---

## Contribuire

Issue e pull request sono benvenute. Esegui `pnpm verify` (typecheck + lint + tests) prima di aprire una PR; per i cambiamenti Rust, esegui `bash rust/gate.sh`.

---

## Crediti e licenza

Un fork di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — grazie agli autori originali. Rilasciato sotto la **[Licenza MIT](LICENSE)** (© 2024 Ralex, © 2026 contributori Razzoozle).
