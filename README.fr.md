<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Plateforme de quiz en direct auto-hébergée et open source — un présentateur de style Kahoot et un jeu téléphone.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · 🌐 **Français** · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

**[▶ Démo en direct](https://rust.razzoozle.xyz)** · **[📚 Documentation](docs/)** · **[Signaler un problème](https://github.com/joehomeskillet/Razzoozle/issues)** · *dérivé de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Qu'est-ce que Razzoozle ?

Plateforme de quiz en temps réel auto-hébergée pour salles de classe et événements. L'hôte ouvre une partie sur écran, les joueurs rejoignent depuis leur téléphone avec un PIN, et les bonnes réponses les plus rapides marquent le plus de points. Elle propose 17 types de questions (Choix, Booléen, Curseur, Sondage, Sélection multiple, Réponse à saisir, Constructeur de phrases, Mathématik, Wortarten, Séquençage, Remplissage, Appairage, Dépose d'épingle, Nuage de mots, Brainstorm, Confiance, MicroLeçon), modes équipe et solo, un cockpit manager pour thématisation, gamification, gestion de classe, et génération locale d'images IA.

**Caractéristiques :** [Démo en direct](https://rust.razzoozle.xyz) · [Liste complète](docs/README.md) · 592+ tests · Docker + serveur Rust

---

## Démarrage rapide

### Option 1 : Développement local

Nécessite Node 22+ et pnpm 11+.

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm dev
```

Ouvrez `http://localhost:3000` (client web). Le serveur fonctionne sur des ports séparés (rechargement à chaud activé).

### Option 2 : Docker (recommandé pour production)

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

L'application s'exécute sur `http://localhost:3020`. Voir **[Auto-hébergement](docs/Self-Hosting.md)** pour configuration reverse proxy + TLS.

---

## Étapes suivantes

- **Configuration manager :** Ouvrez `/manager`, connectez-vous avec le mot de passe d'amorçage, et **changez-le immédiatement**.
- **Déployer en production :** [Guide d'auto-hébergement](docs/Self-Hosting.md)
- **Personnaliser l'apparence :** [Thématisation](docs/Theming.md)
- **Configurer le jeu :** [Configuration](docs/Configuration.md)
- **Rust internes :** [rust/README.md](rust/README.md)

---

## Contribuer

Issues et pull requests sont bienvenues. Avant d'ouvrir une PR :

```bash
pnpm verify          # typecheck + lint + tests
bash rust/gate.sh    # Tests backend Rust (si modifiés)
```

---

## Licence et crédits

Licence MIT (© 2024 Ralex, © 2026 contributeurs Razzoozle). Un fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia).
