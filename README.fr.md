<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Plateforme de quiz en direct auto-hébergée et open source — un présentateur de style Kahoot et un jeu sur téléphone au design crème épuré.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · 🌐 **Français** · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Démo en direct](https://razzoozle.joelduss.xyz)** · **[🌐 Vitrine](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documentation](docs/)** · **[Signaler un problème](https://github.com/joehomeskillet/Razzoozle/issues)** · *dérivé de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Qu'est-ce que c'est ?

Razzoozle est un **jeu de quiz** en temps réel et auto-hébergé pour les salles de classe, les événements et les soirées jeux. Un hôte ouvre une partie sur le grand écran, les joueurs rejoignent depuis leur téléphone avec un code PIN, et les bonnes réponses les plus rapides marquent davantage de points. C'est un fork convivial de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) doté d'un cockpit de thème piloté par le manager, de gamification, de jeu en équipe et en solo, et d'images générées localement par IA — tout en conservant l'expérience classique du présentateur à tuiles colorées et du jeu sur téléphone.

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

docker compose -f compose.rust.yml up -d   # Rust server → http://127.0.0.1:3011
```

La stack est autonome (le serveur Rust + son propre Postgres). Ouvrez l'application, rendez-vous sur `/manager` et **changez le mot de passe manager par défaut**. Placez un reverse proxy (Caddy/Traefik/nginx) devant pour le TLS et un nom d'hôte public.

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
| 🏫 | **Mode classe pour les écoles** — un mode enseignant optionnel : créer des classes, gérer une liste d'élèves (ajouter, déplacer entre classes, retirer), donner à chaque élève son propre code PIN, et assigner un quiz à toute une classe avec une échéance, une limite de tentatives et un suivi des résultats pseudonyme axé sur la confidentialité. |
| ✍️ | **Neuf types de questions** — choix unique, vrai/faux, sondage, curseur, choix multiple, réponse à saisir, constructeur de phrases, saisie mathématique et types de mots (Wortarten), en plus des tuiles de réponse colorées classiques. |
| 📳 | **Retour haptique mobile** — retour de vibration optionnel sur les téléphones des joueurs (compte à rebours, réponses), respectant le mode mouvement réduit. |
| 🔗 | **Résultats partageables** — des aperçus de liens riches par résultat (dépliage Open Graph), une page de résultat avec des appels à l'action « jouez vous-même / organisez la vôtre », et des autocollants de gagnant téléchargeables. |
| 🤝 | **Questions communautaires** — une page de soumission publique avec une file de modération pour le manager, ainsi qu'un catalogue de questions réutilisable et une archive de quiz. |
| 🖼️ | **Images IA locales** — générez des visuels de questions/thèmes en local via ComfyUI (Z-Image), ou branchez des fournisseurs cloud — les clés restent côté serveur. |
| 🌍 | **6 langues + PWA** — anglais, allemand, français, espagnol, italien, chinois ; installable, adaptée au mode hors ligne. |
| 📺 | **Kiosque beamer + fiabilité** — une vue projecteur `/display`, un mode à faible latence, la récupération après plantage, la reconnexion, et un serveur MCP pour le contrôle par outils IA. |

Soutenu par **plus de 592 tests automatisés**, un audit de sécurité path-traversal + CVE `ws`, une surface non authentifiée durcie (plafonds de ressources par partie + éviction de partie, limites de débit par IP, throttling anti-force-brute de l'authentification manager, authentification par host-token émis par le serveur fermant les failles IDOR), et un déploiement Docker sous contrôle de santé. Testé en charge jusqu'à **600 joueurs simultanés**.

---

## Serveur Rust

Le serveur de Razzoozle a été **porté de Node.js vers Rust** — le serveur **Rust** (`axum` + `socketioxide`, sûr en mémoire et à faible empreinte) est désormais le seul backend, couvre tous les flux de jeu, de manager, de joueur et d'affichage et parle socket.io au client React inchangé. L'état est entièrement persisté dans **PostgreSQL** ; il n'y a pas de persistance basée sur des fichiers.

**→ Internes, build et tests Rust : [`rust/README.md`](rust/README.md)**

---

## Développement agentique

Razzoozle est développé presque entièrement par des agents de codage IA, orchestrés par une supervision humaine. Une équipe diversifiée de modèles et d'outils spécialisés collabore pour construire, tester, examiner et déployer des fonctionnalités.

| Agent | Rôle |
| --- | --- |
| Claude | Orchestration et révision |
| Codex (GPT-5.6) | Implémentation full-stack |
| Cursor (GPT-5.6) | Raffinage et correction du code |
| Grok (xAI) | Implémentation du backend Rust |
| Gemini (Google) | Examen et jugement à long contexte |
| Modèles ouverts | Qwen, DeepSeek, Nemotron |
| Inférence locale | OpenVINO sur Intel Arc |
| Browser QA (Playwright) | Tests de jeu end-to-end |

Les humains examinent et fusionnent chaque commit. L'IA améliore la vitesse et la qualité, n'abroge pas le jugement.

---

## Configuration et documentation

Les données d'exécution résident dans le volume `config`, initialisées au premier démarrage. Les paramètres de jeu se trouvent dans `config/game.json` ; les quiz sont créés dans l'éditeur du manager ou en tant que `config/quizz/*.json`. Voir **[docs/](docs/)** : [Auto-hébergement](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Thématisation](docs/Theming.md) · [Mode faible latence](docs/LOW-LATENCY-MODE.md).

---

## Contribuer

Les issues et les pull requests sont les bienvenues. Exécutez `pnpm verify` (typecheck + lint + tests) avant d'ouvrir une PR ; pour les modifications Rust, exécutez `bash rust/gate.sh`.

---

## Crédits et licence

Un fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — merci aux auteurs en amont. Publié sous la **[licence MIT](LICENSE)** (© 2024 Ralex, © 2026 contributeurs Razzoozle).
