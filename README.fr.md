<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Plateforme de quiz en direct, auto-hébergée et open source — un présentateur de style Kahoot + jeu sur téléphone avec un design crème épuré.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · 🌐 **Français** · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Démo en direct](https://razzoozle.joelduss.xyz)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documentation](docs/)** · **[🖥️ Application de bureau](https://github.com/joehomeskillet/razzoozle-desktop)** · **[Signaler un problème](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Qu'est-ce que c'est ?

Razzoozle est un **jeu de quiz** en direct et auto-hébergé pour les salles de classe, les événements et les soirées jeux. Un animateur ouvre une partie sur le grand écran, les joueurs rejoignent depuis leur téléphone avec un code PIN, et les réponses correctes les plus rapides marquent le plus de points. C'est un fork amical de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) avec un cockpit de thèmes piloté par le gestionnaire, de la gamification, un jeu en équipe et en solo, des plugins et des images IA locales — tout en conservant l'expérience classique du présentateur à tuiles colorées + téléphone.

> Projet open source indépendant. Non affilié à Kahoot!®, non approuvé par Kahoot!® et sans lien avec Kahoot!® ni aucune autre plateforme commerciale de quiz.

<img src="docs/screenshots/presenter.webp" width="640" alt="Presenter view" />

---

## Démarrage rapide

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

docker compose -f compose.node.yml up -d   # Node backend → http://127.0.0.1:3010
# or
docker compose -f compose.rust.yml up -d   # Rust backend → http://127.0.0.1:3011
```

Chaque fichier est autonome (application + son propre Postgres) et indépendant, vous pouvez donc exécuter les deux côte à côte. Ouvrez l'application, accédez à `/manager` et **changez le mot de passe du gestionnaire par défaut**. Placez un proxy inverse (Caddy/Traefik/nginx) devant pour le TLS et un nom d'hôte public.

Pas besoin de base de données ? Définissez `DATABASE_MODE=file` pour fonctionner sans Postgres. Sans Docker : `pnpm install && pnpm build && pnpm start` (nécessite Node 22+ et pnpm 11+).

---

## Fonctionnalités

- **Cockpit de thèmes** — un onglet « Design » en direct : couleurs, arrière-plans par vue, logo, rayon, une bascule Flat ⇄ Glass et des préréglages.
- **Écrans fidèles à Kahoot** — tuiles de réponse à formes, un compte à rebours circulaire, un compteur de réponses reçues et un podium animé.
- **Gamification** — 15 succès, médailles, séries, confettis, un récapitulatif de superlatifs en fin de partie et des avatars de joueur générés.
- **7 types de questions** — choix unique et multiple, vrai/faux, saisie de la réponse et curseur.
- **Équipe et solo** — équipes colorées avec un classement en direct, ou entraînez-vous seul sur n'importe quel quiz via un lien de partage.
- **Plugins et thèmes skeleton** — modules ZIP installables par le gestionnaire et paquets de thème de partie complète téléchargeables.
- **Images IA locales** — générez des visuels de question/thème sur l'appareil via ComfyUI (Z-Image) ; les clés restent côté serveur.
- **6 langues + PWA** — EN/DE/FR/ES/IT/ZH, installable et adaptée au hors ligne, avec une vue vidéoprojecteur `/display`.

Soutenu par plus de 592 tests automatisés, une surface non authentifiée durcie (plafonds de ressources par partie, limites de débit par IP, authentification par jeton d'hôte émis par le serveur) et testé en charge jusqu'à 600 joueurs simultanés.

---

## Backends

Razzoozle propose **deux backends interchangeables** qui parlent le même protocole socket.io sur une base de données Postgres partagée — basculez par client dans l'interface du gestionnaire ou via `VITE_DEFAULT_BACKEND`. Le serveur **Rust** (`axum` + `socketioxide`, sûr en mémoire et à faible empreinte) couvre tous les flux de jeu, gestionnaire, joueur et affichage. Le serveur **Node.js** (`packages/socket`) est complet et constitue la valeur par défaut autonome dans `compose.node.yml`. Quelques points de terminaison HTTP périphériques (métriques Prometheus, télémétrie client, aperçu de partage social, le document OpenAPI) et les hooks JS de plugins côté serveur sont réservés à Node.

**→ Détails internes Rust, build et tests : [`rust/README.md`](rust/README.md)**

---

## Configuration et documentation

Les données d'exécution résident dans le volume `config`, initialisé au premier démarrage. Les paramètres de partie sont dans `config/game.json` ; les quiz sont créés dans l'éditeur du gestionnaire ou en tant que `config/quizz/*.json`. Voir **[docs/](docs/)** : [Self-Hosting](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-latency mode](docs/LOW-LATENCY-MODE.md).

---

## Applications et compagnons

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Bêta)** — une application Windows native pour héberger et gérer des parties sans navigateur.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — un service de découverte léger (il ne relaie jamais le jeu).

---

## Contribuer

Les issues et pull requests sont les bienvenues. Exécutez `pnpm verify` (typecheck + lint + tests) avant d'ouvrir une PR ; pour les modifications Rust, exécutez `bash rust/gate.sh`.

---

## Crédits et licence

Un fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — merci aux auteurs originaux. Publié sous la **[licence MIT](LICENSE)** (© 2024 Ralex, © 2026 contributeurs Razzoozle).
