<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### Une plateforme de quiz en direct auto-hébergée et open-source — avec un design épuré et plat en **crème** (et un thème optionnel effet-verre liquide).

🌐 [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · **Français** · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust_server-default_backend-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_backend-available-5FA04E?logo=nodedotjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-0055FF?logo=framer&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-433E38)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Démo en direct](https://razzoozle.joelduss.xyz)** · **[🖥️ Razzoozle Desktop — Application Windows (Bêta)](https://github.com/joehomeskillet/razzoozle-desktop)** · **[🛰️ Passerelle](https://github.com/joehomeskillet/razzloo-gateway)** · **[🌐 Vitrine](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Docs](docs/)** · **[Signaler un problème](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🧩 Qu'est-ce que c'est ?

Razzoozle est une plateforme de jeu de quiz en temps réel auto-hébergée et open-source pour les salles de classe, les événements et les soirées jeux. Un animateur ouvre un jeu sur grand écran, les joueurs rejoignent depuis leur téléphone avec un code PIN, et tout le monde se précipite pour répondre — les réponses correctes plus rapides marquent plus de points. C'est un fork sympathique de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), reconstruit autour d'un design épuré et plat en **crème** (l'effet-verre liquide est maintenant un thème optionnel) avec un système de thèmes piloté par le gestionnaire, de la gamification, du jeu en équipe et en solo, et de la génération d'images IA locale — tout en conservant l'expérience classique animateur + téléphone de Kahoot (tuiles de réponse colorées avec formes, compte à rebours, podium).

> Razzoozle est un projet open-source indépendant. Il n'est pas affilié à, approuvé par, ou connecté à Kahoot!® ou à toute autre plateforme de quiz commerciale.

---

## 🚀 Architecture : Serveur dual (Rust est maintenant par défaut)

Razzoozle est livré avec un **serveur Rust performant par défaut**, tout en gardant le serveur Node.js original disponible pour la compatibilité et la migration progressive.

### Pourquoi Rust ?

- **Serveur d'état de jeu sûr en mémoire et vérifié à la compilation** — pas de paniques à l'exécution ni de comportements indéfinis.
- **Serveur temps réel rapide et léger** — socketioxide + axum gèrent 600+ joueurs simultanés avec un surcoût minimal.
- **Un seul binaire statique** — livré sous forme d'une application Tauri ~10 MB (sidecar Rust) au lieu de ~150 MB Electron + runtime Node.
- **Parité comportementale** — utilise le même protocole wire socket.io ; les clients et les joueurs ne voient aucune différence.
- **Source unique de vérité** — les deux serveurs lisent/écrivent la même base de données Postgres, permettant un basculement transparent par client.

### Comment ça fonctionne

Le **serveur Rust** (`rust/` workspace) :
- **`protocol/`** — ~200 types de protocole wire, génère automatiquement les liaisons TypeScript via `ts-rs` (Rust est la source de vérité).
- **`engine/`** — logique de jeu pure (chunking du constructeur de phrases, mélange de Fisher-Yates avec garde anti-identité).
- **`server/`** — HTTP `axum` + serveur temps réel `socketioxide` ; registre de jeu en mémoire ; auth du gestionnaire (token hôte) ; rate-limits + caps de ressources ; chargement du quiz à partir du disque ou de la base de données.

**Les opérations du gestionnaire** sont complètement implémentées en Rust : sauvegarde/mise à jour/suppression/duplication/archivage du quiz, gestion de la configuration, modération des soumissions, catalogue, jeux en cours, basculement de thème — contrôlés par `rust/gate.sh` (cargo build + tests de régression).

**Parité des fonctionnalités** avec le serveur Node : tous les 7 types de questions, cycle de vie des joueurs + reconnexion, contrôle du jeu (kick/skip/abort/timer), bots, kiosque `/display`, IA/médias, endpoints solo, mode d'équipe.

Le **serveur Node** (`packages/socket`) reste disponible pour la compatibilité rétroactive ; basculer dans l'UI du gestionnaire ou via `VITE_DEFAULT_BACKEND`.

**→ Détails, build & test : [`rust/README.md`](rust/README.md)**

---

## 📸 Captures d'écran

<div align="center">

| Animateur / hôte | Client de jeu de bureau |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Écran de l'animateur" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Client de jeu de bureau" /> |

| Téléphone du joueur | Sélection d'avatar |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Téléphone du joueur" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Sélection d'avatar" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Cockpit de thème du gestionnaire" />

<img src="docs/screenshots/start.webp" width="680" alt="Écran de démarrage de l'hôte avec le code PIN du jeu" />

</div>

---

## ✦ Ce que Razzoozle ajoute à Razzia

| | Fonctionnalité |
| --- | --- |
| 🎨 | **Cockpit de thème** — un onglet "Design" en direct du gestionnaire : couleurs, arrière-plans par vue, logo, rayon et un bouton de basculement de style **Plat ⇄ Verre**, avec des présets (un défaut plat en **crème** + un preset violet optionnel **effet-verre liquide**) et des sélecteurs de couleur conscients du contraste. |
| ☕ | **Design plat en crème** — une interface plat et chaleureuse en crème avec un arrière-plan animé vivant (blobs dérivants + icônes flottantes école/connaissance), un logo Zig plat, et des tuiles de réponse encre-sur-crème. |
| 🧊 | **Interface effet-verre liquide** — une variante de thème glassmorphisme optionnelle et héritée (gelée, surfaces floues) qui ne touche jamais à la ligne de base plate. |
| 🎯 | **Écrans de jeu fidèles à Kahoot** — tuiles de réponse avec les icônes de forme classiques (triangle / diamant / cercle / carré), un timer circulaire, un compteur de réponses reçues, et un podium animé. |
| 🧑‍🎨 | **Avatars de joueur** — chaque joueur obtient un avatar généré DiceBear (choisir un style + relancer, ou télécharger le vôtre) ; les avatars flottent autour du hall et apparaissent dans les classements, le podium et les récompenses. |
| 🏆 | **Gamification** — 15 accomplissements, médailles, séries, confettis et chimes sonores, plus une galerie de trophées personnelle. |
| 🥇 | **Récapitulatif des récompenses de fin de jeu** — une séquence de superlatifs animés (doigt le plus rapide, plus grand grimpeur, plus longue série, comeback kid…) montrant l'avatar + le nom de chaque gagnant, autopilotée en lecture automatique. |
| 👥 | **Mode d'équipe** — équipes rouge / bleu / vert / jaune avec un classement d'équipe en direct. |
| 📱 | **Jeu en solo** — pratiquez n'importe quel quiz seul via un lien de partage, avec son propre historique de score. |
| ✍️ | **Plus de types de questions** — sélection multiple, tapez la réponse et curseur, en plus du choix unique classique. |
| 🔌 | **Système de plugin** — modules ZIP installables par le gestionnaire avec leur propre onglet "Plugins". |
| 🧩 | **Modules du gestionnaire** — télécharger, activer et configurer les modules JavaScript depuis la console du gestionnaire (onglet propre, badges de capacité, config persistante) ; livré avec un squelette de démarrage copier-coller (`examples/plugins/starter/`) avec un contrat d'édition. |
| 📦 | **ZIPs de thème squelette** — télécharger/télécharger un thème de jeu complet en tant que ZIP lisible par LLM ("squelette" : tokens de design + CSS + JS + un contrat SKELETON.md). |
| 📳 | **Retour haptique mobile** — vibration facultative sur les téléphones des joueurs (compte à rebours, réponses), conscient du mouvement réduit. |
| 🔗 | **Résultats partageables** — riches liens de résultats par résultat (déploiement Open Graph), une page de résultat avec "jouer vous-même / héberger le vôtre" appels à l'action, et autocollants gagnants téléchargeables. |
| 🤝 | **Questions communautaires** — une page de soumission publique avec une file de modération du gestionnaire, plus un catalogue de questions réutilisable et une archive de quiz. |
| 🖼️ | **Images IA locales** — générer des images de question/thème sur appareil via ComfyUI (Z-Image), ou brancher des fournisseurs cloud — les clés restent du côté serveur. |
| 🌍 | **6 langues + PWA** — anglais, allemand, français, espagnol, italien, chinois ; installable, conscient du mode hors ligne. |
| 📺 | **Kiosque de projecteur + fiabilité** — une vue `/display` projecteur, mode basse latence, récupération de crash, reconnexion, et un serveur MCP pour le contrôle des outils IA. |

Soutenu par **592+ tests automatisés**, une passe de sécurité sur la traversée de chemin + CVE `ws`, une surface non authentifiée durcie (caps de ressources par jeu + éviction de jeu, rate-limits par IP, broyage par force du auth du gestionnaire, auth token hôte menté par le serveur fermant IDOR), et un déploiement Docker contrôlé par santé. Testé en charge à **600 joueurs simultanés**.

---

## 📲 Applications et compagnons

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Bêta)** — la première application native **Windows** pour Razzoozle. Hébergez et gérez des jeux depuis votre machine, pas de navigateur requis.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — un service de rendez-vous léger / découverte qui aide les clients à se trouver. Découverte uniquement — il ne relaye jamais le gameplay.

---

## ⚙️ Prérequis

**Avec Docker (recommandé) :** Docker + Docker Compose.
**Sans Docker :** Node.js 22+ et pnpm 11+.

---

## 📖 Commencer

### 🐳 Docker (recommandé)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```

L'application démarre sur `http://127.0.0.1:3011` (nginx + serveur Rust dans un conteneur par défaut). La configuration et les données utilisateur vivent dans le volume `./config`, créé et semé au premier démarrage. Mettez-le derrière votre propre reverse proxy (Caddy, nginx, Traefik…) pour TLS et un nom d'hôte public.

Pour utiliser le serveur Node à la place, définissez `VITE_DEFAULT_BACKEND=node` avant la compilation, ou basculez dans l'UI du gestionnaire.

### 🛠️ Sans Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # production build
pnpm start        # ou : pnpm dev  (web + serveur Rust, rechargement à chaud)
```

---

## 🎮 Comment jouer

1. Ouvrez `/manager` sur la machine hôte et connectez-vous avec le mot de passe du gestionnaire.
2. Sélectionnez un quiz et démarrez une partie — un code PIN apparaît (affichez-le sur le projecteur via `/display`).
3. Les joueurs ouvrent le site sur leur téléphone, entrent le code PIN et un nom.
4. Répondez aussi vite que vous pouvez — les réponses correctes plus rapides marquent plus.
5. Regardez le classement, les médailles et les confettis entre les rondes.

Préférez jouer seul ? Ouvrez le lien de partage **solo** de n'importe quel quiz et pratiquez à votre rythme.

---

## ⚙️ Configuration

Les données d'exécution vivent dans `config/` (ignoré par git, semé au premier démarrage).

### Paramètres du jeu — `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // CHANGE THIS — the default blocks manager access
  "teamMode": false,             // enable red/blue/green/yellow teams
  "lowLatencyMode": { "enabled": false } // opt-in timing/UX tightening (see docs/LOW-LATENCY-MODE.md)
}
```

### Quiz — `config/quizz/*.json`

Construisez les quiz dans l'éditeur du gestionnaire (recommandé) ou en JSON. Une question supporte plusieurs `type`s (`choice`, `boolean`, `slider`, plus sélection multiple via plusieurs `solutions`, et tapez-la-réponse) :

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

Le fournisseur IA (désactivé / ComfyUI local / cloud) est configuré dans l'onglet **IA** du gestionnaire ; les clés API sont stockées côté serveur dans `config/` et ne sont jamais envoyées aux clients.

---

## 📺 Affichage projecteur / kiosque

`/display` rend la présentation hôte en plein écran pour un projecteur ou une TV (type vh-scaled qui se lit à travers une salle), appariable à partir d'un téléphone. Une route `/satellite/<gameId>` est une vue kiosque sans contrôle qui s'authentifie avec un token (pas de mot de passe du gestionnaire). Une image satellite Raspberry-Pi optionnelle est incluse.

---

## 🧱 Stack technologique

Un monorepo pnpm — **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), un **serveur dual** (Rust `axum` + `socketioxide` par défaut, ou Node + Socket.IO pour la compatibilité), **`@razzoozle/common`** (types validés par Zod partagés, générés automatiquement à partir de Rust via `ts-rs`), et **`@razzoozle/mcp`** (un serveur MCP pour le contrôle des outils IA). Livré comme une seule image Docker avec un endpoint `/healthz` + Docker `HEALTHCHECK`.

**Serveur Rust** (`rust/` workspace) : `razzoozle-protocol` (types wire), `razzoozle-engine` (logique de jeu), `razzoozle-server` (`axum` + `socketioxide`).

---

## 🤝 Contribuer

Les issues et les pull requests sont les bienvenus. Exécutez `pnpm verify` (vérification de type + lint + tests) avant d'ouvrir une PR. Pour les modifications du serveur Rust, exécutez `cargo test` dans `rust/` et vérifiez que la grille CI (test de fumée du jeu réel) réussit.

---

## ⭐ Historique des étoiles

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Historique des étoiles" />
</a>

---

## 📝 Crédits et licence

Razzoozle est un fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — énormes remerciements aux auteurs originaux. Publié sous la **[Licence MIT](LICENSE)** (© 2024 Ralex, © 2026 Contributeurs Razzoozle) ; l'avis MIT en amont est conservé.
