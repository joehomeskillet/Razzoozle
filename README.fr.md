<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Écran de bienvenue Razzoozle avec saisie de code PIN et arrière-plan animé" />

# Razzoozle

### Plateforme de quiz en direct auto-hébergée et open source — un présentateur de style Kahoot + jeu téléphone avec design crème épuré.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · 🌐 **Français** · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Démo en direct](https://rust.razzoozle.xyz)** · **[🌐 Galerie](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documentation](docs/)** · **[Signaler un problème](https://github.com/joehomeskillet/Razzoozle/issues)** · *dérivé de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## Qu'est-ce que Razzoozle ?

Razzoozle est une plateforme de quiz en temps réel auto-hébergée pour salles de classe, événements et soirées jeu. L'animateur ouvre une partie sur l'écran géant, les joueurs se connectent depuis leurs téléphones avec un code PIN, et les bonnes réponses les plus rapides marquent plus de points. C'est un fork bienveillant de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) doté d'un cockpit de thématisation piloté par l'animateur, gamification, jeu en équipe et en solo, et images IA locales — tout en conservant l'expérience classique du présentateur de tuiles colorées + téléphone.

> Projet open source indépendant. Non affilié à, approuvé par, ou connecté à Kahoot!® ou toute autre plateforme commerciale de quiz.

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

# Construire l'image Docker (inclut SPA web + serveur Rust)
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .

# Exécuter avec Postgres (nécessite la variable d'environnement DATABASE_URL)
# Exemple : définir un mot de passe administrateur par défaut
docker run -d \
  -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='votre-mot-de-passe-sécurisé' \
  -v razzoozle-config:/config \
  razzoozle:latest
```

<div align="center">
<img src="docs/screenshots/start.webp" width="680" alt="Écran de démarrage animateur affichant le code PIN de la partie et le code QR pour que les joueurs se joignent" />
</div>

Le serveur fonctionne sur le port `3020` et nécessite une base de données PostgreSQL. Ouvrez l'application, allez à `/manager` et **changez le mot de passe administrateur par défaut**. Placez un proxy inverse (Caddy/Traefik/nginx) devant pour TLS et un nom d'hôte public. Consultez **[Auto-hébergement](docs/Self-Hosting.md)** pour la configuration détaillée.

---

## ✦ Ce que Razzoozle ajoute par rapport à Razzia

| | Fonctionnalité |
| --- | --- |
| 🎨 | **Cockpit de thématisation** — un onglet « Conception » animateur en direct avec couleurs, arrière-plans par vue, logo, rayon, présets et sélecteurs de couleur conscients du contraste. |
| ☕ | **Design crème plat** — une interface crème plat chaleureuse avec arrière-plan animé vivant (blobs flottants + icônes scolaires/savoir flottantes), logo plat et tuiles de réponse encre-sur-crème. |
| 🎯 | **Écrans de jeu fidèles à Kahoot** — tuiles de réponse avec les icônes de forme classiques (triangle / diamant / cercle / carré), minuteur de compte à rebours circulaire, compteur de réponses reçues et podium animé. |
| 🧑‍🎨 | **Avatars de joueurs** — chaque joueur obtient un avatar DiceBear généré (choisir un style + renouvelez ou téléchargez le vôtre); les avatars flottent autour du hall et apparaissent sur les tableaux de classement, podium et prix. |
| 🏆 | **Gamification** — 14 succès, médailles, séries, confettis et carillons sonores, plus une galerie de trophées personnelle. |
| 🥇 | **Récapitulatif des prix de fin de partie** — une séquence de superlatifs animée (doigt le plus rapide, plus grand grimpeur, plus longue série, enfant qui revient…) montrant l'avatar et le nom de chaque gagnant, rythme automatique en lecture automatique. |
| 👥 | **Mode équipe** — équipes rouge / bleu / vert / jaune avec tableau de classement d'équipe en direct. |
| 📱 | **Jeu en solo** — entraînez-vous sur n'importe quel quiz seul via un lien partagé, avec son propre historique de scores. |
| 🏫 | **Mode classe pour les écoles** — un mode enseignant facultatif : créer des classes, gérer une liste d'élèves (ajouter des élèves, les déplacer entre les classes, supprimer), donner à chaque élève son propre code PIN et attribuer un quiz à une classe entière avec date limite, limite de tentatives et suivi des résultats pseudonyme respectueux de la vie privée. |
| ✍️ | **Dix-sept types de questions** — choix unique, vrai/faux, sondage, curseur, sélection multiple, tapez la réponse, constructeur de phrases, saisie mathématique, types de mots (Wortarten), séquençage, remplissage lacunaire, appairage, dépôt d'épingle, nuage de mots, remue-méninges, confiance et microleçon, en plus des tuiles de réponse de couleur classiques. |
| 📳 | **Haptique mobile** — retour haptique optionnel sur les téléphones des joueurs (compte à rebours, réponses), conscient du mouvement réduit. |
| 🔗 | **Résultats partageables** — aperçus de lien par résultat riches (déploiement Open Graph), page de résultats avec appels à « jouez-le vous-même / hébergez le vôtre » et autocollants de gagnants téléchargeables. |
| 🤝 | **Questions communautaires** — page de soumission publique avec file d'attente de modération animateur, plus catalogue de questions réutilisable et archive de quiz. |
| 🖼️ | **Images IA locales** — générer les images de question/thème sur l'appareil via ComfyUI (Z-Image), ou brancher des fournisseurs cloud — les clés restent côté serveur. |
| 🌍 | **6 langues + PWA** — anglais, allemand, français, espagnol, italien, chinois; installable, conscient du mode hors ligne. |
| 📺 | **Kiosque projecteur + fiabilité** — une vue projecteur `/display`, mode faible latence, récupération après sinistre, reconnexion et serveur MCP pour contrôle des outils d'IA. |
| 🎛️ | **Console animateur unifiée** — une interface animateur redessinée avec système basé sur les lignes, actions multi-sélection, opérations en masse et contrôles cohérents sur tous les onglets de gestion. |

Soutenu par **592+ tests automatisés**, une vérification de sécurité traversée de chemin + `ws` CVE, une surface non authentifiée durcie (plafonds de ressources par partie + expulsion de partie, limites de débit par IP, accélérateur de force brute d'authentification animateur, auth de jeton hôte frappée par serveur fermant IDOR) et un déploiement Docker vérifié en santé. Test de charge jusqu'à **600 joueurs simultanés**.

---

## Expérience de jeu

### Écran de présentateur et animateur

L'animateur contrôle le jeu sur un grand écran avec les tuiles de réponse de style Kahoot classiques :

<div align="center">
<img src="docs/screenshots/presenter.webp" width="680" alt="Écran du présentateur avec grandes tuiles de réponse, minuteur et compteur de réponses reçues" />
</div>

### Téléphones des joueurs et clients de bureau

Les joueurs se connectent depuis des appareils mobiles ou de bureau et voient la même question avec tuiles, leur score actuel et un minuteur de compte à rebours :

<div align="center">

| Joueur mobile | Joueur bureau |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="280" alt="Vue joueur mobile avec question et boutons de réponse" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Vue joueur bureau avec tuiles de réponse" /> |

</div>

### Sélection d'avatar

Chaque joueur choisit ou génère un avatar avant de se joindre :

<div align="center">
<img src="docs/screenshots/avatar.webp" width="420" alt="Écran de sélection d'avatar avec options de style DiceBear et option de téléchargement" />
</div>

---

## Cockpit de thématisation animateur

Personnalisez complètement l'apparence et la convivialité en temps réel — couleurs, arrière-plans, animations et typographie — sans toucher au code :

<div align="center">
<img src="docs/screenshots/admin.webp" width="680" alt="Panneau de contrôle de conception animateur avec paramètres de thème et aperçu en direct" />
</div>

---

## Serveur Rust

Le backend de Razzoozle est un **serveur Rust** (`axum` + `socketioxide`, sûr en mémoire et léger) couvrant tout le jeu, animateur, joueur et affiche des flux et parle socket.io au client React inchangé. L'état du jeu est persisté dans **PostgreSQL** ; les modèles de quiz sont soutenus par fichier sous `config/templates/*.json`.

**→ Rust internes, construction & tests : [`rust/README.md`](rust/README.md)**

---

## Développé par des agents

Razzoozle est développé presque entièrement par des agents de codage IA, orchestrés par supervision humaine. Une équipe diversifiée de modèles et d'outils spécialisés travaille ensemble pour construire des fonctionnalités, tester, examiner et déployer.

| Agent | Rôle |
| --- | --- |
| Claude | Orchestration et examen |
| Codex (GPT-5.6) | Implémentation full-stack |
| Cursor (GPT-5.6) | Affinement et correction du code |
| Grok (xAI) | Implémentation du backend Rust |
| Gemini (Google) | Examen du contexte long et jugement |
| Modèles ouverts | Qwen, DeepSeek, Nemotron |
| Inférence locale | OpenVINO sur Intel Arc |
| QA du navigateur (Playwright) | Tests de jeu de bout en bout |

Les humains examinent et fusionnent chaque commit. L'IA augmente la vitesse et la qualité, elle ne remplace pas le jugement.

---

## Configuration et documentation

Les données d'exécution vivent dans le volume `config`, ensemencé au premier démarrage. Les paramètres de jeu sont dans `config/game.json` ; les quiz sont créés dans l'éditeur animateur ou sous `config/quizz/*.json`. Consulter **[docs/](docs/)** : [Auto-hébergement](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Thématisation](docs/Theming.md) · [Mode faible latence](docs/LOW-LATENCY-MODE.md).

---

## Contribuer

Les issues et les pull requests sont bienvenues. Exécutez `pnpm verify` (typecheck + lint + tests) avant d'ouvrir une PR ; pour les modifications Rust, exécutez `bash rust/gate.sh`.

---

## Crédits et licence

Un fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — merci aux auteurs originaux. Publié sous la **[Licence MIT](LICENSE)** (© 2024 Ralex, © 2026 contributeurs Razzoozle).
