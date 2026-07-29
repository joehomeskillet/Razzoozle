<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Piattaforma di quiz live self-hosted e open source — un presentatore in stile Kahoot + gioco su telefono.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · 🌐 **Italiano** · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

**[▶ Demo live](https://rust.razzoozle.xyz)** · **[📚 Documentazione](docs/)** · **[Segnala un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork di [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Cos'è Razzoozle?

Una piattaforma di quiz in tempo reale self-hosted per aule e eventi. Un conduttore apre una partita sullo schermo, i giocatori si uniscono dai loro telefoni con un PIN e le risposte corrette più veloci ottengono più punti. Offre 17 tipi di domande (Scelta, Vero/falso, Cursore, Sondaggio, SelezioneMultipla, ScriviviRisposta, CostruttoreDisentenze, Matematica, Wortarten, Sequencing, RiempiSpazi, Abbinamento, AppuntiSuMappa, NuboleParole, Brainstorm, Confidenza, MicroLezione), modalità squadre e solitaria, una console gestionale per temi, gamification, gestione classi e generazione di immagini AI locale.

**Caratteristiche:** [Demo live](https://rust.razzoozle.xyz) · [Elenco completo](docs/README.md) · 592+ test · Docker + server Rust

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
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .
docker run -d -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='change-me' \
  -v razzoozle-config:/config \
  razzoozle:latest
```

L'app gira sulla porta `http://localhost:3020`. Vedi **[Self-Hosting](docs/Self-Hosting.md)** per la configurazione di reverse proxy + TLS.

---

## Prossimi passi

- **Configurazione gestionale:** Apri `/manager`, accedi con la password bootstrap e **cambiarla subito**.
- **Distribuire in produzione:** [Guida Self-Hosting](docs/Self-Hosting.md)
- **Personalizzare l'aspetto:** [Temi](docs/Theming.md)
- **Configurare il gameplay:** [Configurazione](docs/Configuration.md)
- **Interno Rust:** [rust/README.md](rust/README.md)

---

## Contribuire

Issue e pull request sono benvenute. Prima di aprire una PR:

```bash
pnpm verify          # typecheck + lint + test
bash rust/gate.sh    # Test backend Rust (se modificati)
```

---

## Licenza e crediti

Licenza MIT (© 2024 Ralex, © 2026 contributori Razzoozle). Fork di [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia).
