<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Plateforme de quiz en direct auto-hébergée et open source — un présentateur de style Kahoot et un jeu sur téléphone au design crème épuré.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · 🌐 **Français** · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Démo en direct](https://razzoozle.joelduss.xyz)** · **[🌐 Vitrine](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documentation](docs/)** · **[🖥️ Application Desktop](https://github.com/joehomeskillet/razzoozle-desktop)** · **[Signaler un problème](https://github.com/joehomeskillet/Razzoozle/issues)** · *dérivé de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Qu'est-ce que c'est ?

Razzoozle est un **jeu de quiz** en temps réel et auto-hébergé pour les salles de classe, les événements et les soirées jeux. Un hôte ouvre une partie sur le grand écran, les joueurs rejoignent depuis leur téléphone avec un code PIN, et les bonnes réponses les plus rapides marquent davantage de points. C'est un fork convivial de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) doté d'un cockpit de thème piloté par le manager, de gamification, de jeu en équipe et en solo, de plugins et d'images générées localement par IA — tout en conservant l'expérience classique du présentateur à tuiles colorées et du jeu sur téléphone.

> Projet open source indépendant. Non affilié à, ni approuvé par, ni lié à Kahoot!® ou à toute autre plateforme de quiz commerciale.

---

## 📸 Captures d'écran

<div align="center">

| Présentateur / hôte | Client de jeu Desktop |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> |

| Téléphone du joueur | Sélection d'avatar |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Player phone" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar selection" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager theme cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## Démarrage rapide

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

docker compose -f compose.node.yml up -d   # Node backend → http://127.0.0.1:3010
# or
docker compose -f compose.rust.yml up -d   # Rust backend → http://127.0.0.1:3011
```

Chaque fichier est autonome (l'application et son propre Postgres) et indépendant, ce qui vous permet d'exécuter les deux côte à côte. Ouvrez l'application, rendez-vous sur `/manager` et **changez le mot de passe manager par défaut**. Placez un reverse proxy (Caddy/Traefik/nginx) devant pour le TLS et un nom d'hôte public.

Pas besoin de base de données ? Définissez `DATABASE_MODE=file` pour fonctionner sans Postgres. Sans Docker : `pnpm install && pnpm build && pnpm start` (nécessite Node 22+ et pnpm 11+).

---

## ✦ Ce que Razzoozle ajoute par rapport à Razzia

| | Fonctionnalité |
| --- | --- |
| 🎨 | **Cockpit de thème** — un onglet « Design » en direct dans le manager : couleurs, arrière-plans par vue, logo, rayon et un commutateur de style **Flat ⇄ Glass**, avec des préréglages (un défaut **crème** plat + un préréglage violet **liquid-glass** optionnel) et des sélecteurs de couleurs tenant compte du contraste. |
| ☕ | **Design crème plat** — une interface crème plate et chaleureuse avec un arrière-plan animé vivant (blobs à la dérive + icônes flottantes d'école et de savoir), un logotype/logo plat, et des tuiles de réponse encre-sur-crème. |
| 🧊 | **Interface liquid-glass** — une variante de thème glassmorphism optionnelle et héritée (surfaces givrées et floutées) qui ne touche jamais à la base plate. |
| 🎯 | **Écrans de jeu fidèles à Kahoot** — des tuiles de réponse avec les icônes de formes classiques (triangle / losange / cercle / carré), un minuteur de compte à rebours circulaire, un compteur de réponses reçues, et un podium animé. |
| 🧑‍🎨 | **Avatars des joueurs** — chaque joueur reçoit un avatar DiceBear généré (choisissez un style et relancez, ou importez le vôtre) ; les avatars flottent dans le salon et apparaissent sur les classements, le podium et les récompenses. |
| 🏆 | **Gamification** — 15 succès, médailles, séries, confettis et carillons sonores, ainsi qu'une galerie de trophées personnelle. |
| 🥇 | **Récapitulatif des récompenses de fin de partie** — une séquence animée de superlatifs (doigt le plus rapide, plus grande remontée, plus longue série, champion du retour…) affichant l'avatar et le nom de chaque gagnant, cadencée automatiquement en lecture auto. |
| 👥 | **Mode équipe** — équipes rouge / bleue / verte / jaune avec un classement d'équipe en direct. |
| 📱 | **Jeu en solo** — entraînez-vous seul sur n'importe quel quiz via un lien de partage, avec son propre historique de scores. |
| ✍️ | **Plus de types de questions** — choix multiple, réponse à saisir et curseur, en plus du choix unique classique. |
| 🔌 | **Système de plugins** — des modules complémentaires ZIP installables par le manager avec leur propre onglet « Plugins ». |
| 🧩 | **Modules complémentaires du manager** — importez, activez et configurez des modules JavaScript depuis la console du manager (onglet dédié, badges de capacités, config persistée) ; livré avec un squelette de démarrage à copier-coller (`examples/plugins/starter/`) doté d'un contrat de création. |
| 📦 | **ZIP de thème squelette** — téléchargez/importez un thème de jeu complet sous forme de ZIP lisible par un LLM (« skeleton » : jetons de design + CSS + JS + un contrat SKELETON.md). |
| 📳 | **Retour haptique mobile** — retour de vibration optionnel sur les téléphones des joueurs (compte à rebours, réponses), respectant le mode mouvement réduit. |
| 🔗 | **Résultats partageables** — des aperçus de liens riches par résultat (dépliage Open Graph), une page de résultat avec des appels à l'action « jouez vous-même / organisez la vôtre », et des autocollants de gagnant téléchargeables. |
| 🤝 | **Questions communautaires** — une page de soumission publique avec une file de modération pour le manager, ainsi qu'un catalogue de questions réutilisable et une archive de quiz. |
| 🖼️ | **Images IA locales** — générez des visuels de questions/thèmes en local via ComfyUI (Z-Image), ou branchez des fournisseurs cloud — les clés restent côté serveur. |
| 🌍 | **6 langues + PWA** — anglais, allemand, français, espagnol, italien, chinois ; installable, adaptée au mode hors ligne. |
| 📺 | **Kiosque beamer + fiabilité** — une vue projecteur `/display`, un mode à faible latence, la récupération après plantage, la reconnexion, et un serveur MCP pour le contrôle par outils IA. |

Soutenu par **plus de 592 tests automatisés**, un audit de sécurité path-traversal + CVE `ws`, une surface non authentifiée durcie (plafonds de ressources par partie + éviction de partie, limites de débit par IP, throttling anti-force-brute de l'authentification manager, authentification par host-token émis par le serveur fermant les failles IDOR), et un déploiement Docker sous contrôle de santé. Testé en charge jusqu'à **600 joueurs simultanés**.

---

## Backends

Razzoozle propose **deux backends interchangeables** parlant le même protocole socket.io sur une base de données Postgres partagée — commutez par client dans l'interface du manager ou avec `VITE_DEFAULT_BACKEND`. Le serveur **Rust** (`axum` + `socketioxide`, sûr en mémoire et à faible empreinte) couvre tous les flux de jeu, de manager, de joueur et d'affichage. Le serveur **Node.js** (`packages/socket`) est complet et constitue le défaut autonome dans `compose.node.yml`. Quelques points de terminaison HTTP périphériques (métriques Prometheus, télémétrie client, dépliage de partage social, la documentation OpenAPI) et les hooks JS de plugins côté serveur sont réservés à Node.

**→ Internes, build et tests Rust : [`rust/README.md`](rust/README.md)**

---

## Configuration et documentation

Les données d'exécution résident dans le volume `config`, initialisées au premier démarrage. Les paramètres de jeu se trouvent dans `config/game.json` ; les quiz sont créés dans l'éditeur du manager ou en tant que `config/quizz/*.json`. Voir **[docs/](docs/)** : [Auto-hébergement](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Thématisation](docs/Theming.md) · [Mode faible latence](docs/LOW-LATENCY-MODE.md).

---

## Applications et compagnons

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Bêta)** — une application Windows native pour héberger et gérer des parties sans navigateur.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — un service de découverte léger (il ne relaie jamais le jeu).

---

## Contribuer

Les issues et les pull requests sont les bienvenues. Exécutez `pnpm verify` (typecheck + lint + tests) avant d'ouvrir une PR ; pour les modifications Rust, exécutez `bash rust/gate.sh`.

---

## Crédits et licence

Un fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — merci aux auteurs en amont. Publié sous la **[licence MIT](LICENSE)** (© 2024 Ralex, © 2026 contributeurs Razzoozle).
