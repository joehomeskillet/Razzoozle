<p align="center">
  <img width="450" height="120" align="center" src=".github/logo.svg">
  <br>
  <div align="center">
    <img alt="Status" src="https://img.shields.io/badge/status-live-FF9900?style=for-the-badge">
    <img alt="Tests" src="https://img.shields.io/badge/tests-125%20passing-FF9900?style=for-the-badge">
    <img alt="TypeScript" src="https://img.shields.io/badge/typecheck-green-FF9900?style=for-the-badge">
    <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-FF9900?style=for-the-badge">
  </div>
</p>

> **Südhang fork** of [Razzia](https://github.com/Ralex91/Razzia) — a hardened,
> branded production deployment for the **Südhang Personalfest**. Live at
> **[rahoot.joelduss.xyz](https://rahoot.joelduss.xyz)**. See
> **[CHANGELOG.md](CHANGELOG.md)** for what this fork carries beyond upstream and
> **[docs/OPERATIONS.md](docs/OPERATIONS.md)** for the deploy/ops runbook.

## 🧩 What is this project?

A self-hosted, open-source Kahoot-style live quiz: the host drives the game from
`/manager` (shown big on a beamer), players join and answer on their phones. This
fork adds native branding/theming, a beamer kiosk, a low-latency mode, five
languages, an installable PWA, and crash-recovery on top of upstream Razzia.

> **Disclaimer**: Razzia is an independent, open-source software project. It is not affiliated with, endorsed by, or sponsored by any third-party quiz platform or service. Any resemblance to other quiz platforms is purely incidental.

<p align="center">
  <img width="30%" src=".github/previews/1.png" alt="Login">
  <img width="30%" src=".github/previews/2.png" alt="Manager Room">
  <img width="30%" src=".github/previews/3.png" alt="Question Screen">
</p>

## ✨ What this fork adds (beyond upstream Razzia)

- **🎨 Native theming** — per-view backgrounds, colours, app title and logo, edited live from a **Design tab** in `/manager` (stored in `config/theme/`, applied via CSS variables; the whole UI recolours, no rebuild). Five languages: **de / en / es / fr / it**.
- **📺 Beamer kiosk + satellite** — a `/display` route renders the game fullscreen for a projector/TV (vh-scaled type that reads across a 4K room), pairable from a phone; optional Raspberry-Pi satellite image.
- **⚡ Low-latency mode** (opt-in) — clock-sync, instant local answer feedback, answer-ack, scoreboard throttle, smoother reconnects — server-authoritative scoring stays intact. See [docs/LOW-LATENCY-MODE.md](docs/LOW-LATENCY-MODE.md).
- **🛡️ Event robustness** — **crash-recovery** (in-flight games are snapshotted to disk and restored on restart — a process crash or redeploy mid-quiz no longer kicks anyone), a `/healthz` endpoint + Docker **HEALTHCHECK** for auto-heal, graceful shutdown, host-blip lobby grace, and a mid-game reconnect banner.
- **📦 Installable PWA** — precached app shell for instant load + add-to-home-screen, with a NetworkFirst HTML shell so deploys land on one reload.
- **♿ Accessibility & polish** — focus rings, `tabular-nums` scores/timers, `prefers-reduced-motion`, ARIA dialogs/tabs, keyboard-reorderable quiz editor.

### 📊 Optimize pass — by the numbers

| Dimension               | Before  | After                                         |
| ----------------------- | ------- | --------------------------------------------- |
| TypeScript (3 packages) | ❌ red  | ✅ green                                      |
| Test suite              | 21      | **125**                                       |
| Player initial payload  | ~3.8 MB | **~1.1 MB** (WebP + route code-split)         |
| Load tested             | —       | **600 concurrent players** @ <10% socket CPU  |
| Crash recovery          | none    | **proven** (kill -9 → restart → state intact) |

Plus a security pass (path-traversal fix, patched `ws` CVE). Full detail in [CHANGELOG.md](CHANGELOG.md).

## ⚙️ Prerequisites

Choose one of the following deployment methods:

### Without Docker

- Node.js : version 22 or higher
- PNPM : version 10.16 or higher (learn more [here](https://pnpm.io/))

### With Docker

- Docker and Docker Compose

## 📖 Getting Started

Choose your deployment method:

### 🐳 Using Docker (Recommended)

Using Docker Compose (recommended):
You can find the docker compose configuration in the repository:
[docker-compose.yml](/compose.yml)

```bash
docker compose up -d
```

Or using Docker directly:

```bash
docker run -d \
  -p 3000:3000 \
  -v ./config:/app/config \
  ralex91/razzia:latest
```

**Configuration Volume:**
The `-v ./config:/app/config` option mounts a local `config` folder to persist your game settings and quizzes. This allows you to:

- Edit your configuration files directly on your host machine
- Keep your settings when updating the container
- Easily backup your quizzes and game configuration

The folder will be created automatically on first run with an example quiz to get you started.

The application will be available at http://localhost:3000

### 🛠️ Without Docker

1. Clone the repository:

```bash
git clone https://github.com/Ralex91/Razzia.git
cd ./Razzia
```

2. Install dependencies:

```bash
pnpm install
```

3. Build and start the application:

```bash
# Development mode
pnpm run dev

# Production mode
pnpm run build
pnpm start
```

## ⚙️ Configuration

The configuration is split into two main parts:

### 1. Game Configuration (`config/game.json`)

Main game settings:

```json
{
  "managerPassword": "PASSWORD"
}
```

Options:

- `managerPassword`: The master password for accessing the manager interface. **Must be changed from the default `"PASSWORD"` value**, otherwise manager access is blocked.

#### Low-Latency Mode (optional, off by default)

An opt-in mode that tightens timing fairness, gives players instant local answer
feedback, smooths reconnects, and adds host-side observability — all on the
existing socket.io transport, with **no rewrite**. It is **disabled by default**:
when off, behaviour is byte-identical to a normal Razzia build, and an existing
`game.json` that only has `managerPassword` keeps working unchanged.

To enable it, add the `lowLatencyMode` block to `config/game.json` (every field
is optional and defaulted, so you can set only the ones you want):

```jsonc
{
  "managerPassword": "PASSWORD",
  "lowLatencyMode": {
    "enabled": false, // master switch; OFF = today's behaviour
    "clockSync": true, // UI-only client clock offset (never scoring)
    "preloadNextQuestion": true, // prefetch the next question's media
    "answerAck": true, // emit an answer ack to the client
    "scoreboardBroadcastThrottleMs": 100, // coalesce scoreboard chatter (ms)
    "maxLatencyCompensationMs": 150, // server-side, capped grace window (ms)
  },
}
```

Scoring always stays **server-authoritative** (the server's receive timestamp,
never client time). See **[docs/LOW-LATENCY-MODE.md](docs/LOW-LATENCY-MODE.md)**
for what it does and does not guarantee, why WebSocket/socket.io stays the
default transport (and why WebTransport is not), the timing model, clock sync,
answer idempotency/ack, preload, scoreboard throttle, reconnect/resume, and the
observability metrics.

### 2. Quiz Configuration (`config/quizz/*.json`)

Quizzes can be created in two ways:

- **Via the Quiz Editor** — use the built-in editor available in the manager dashboard (recommended)
- **Via JSON files** — manually create files in the `config/quizz/` directory

You can have multiple quiz files and select which one to use when starting a game.

Example quiz configuration (`config/quizz/example.json`):

```json
{
  "subject": "Example Quiz",
  "questions": [
    {
      "question": "What is the correct answer?",
      "answers": ["No", "Yes", "No", "No"],
      "solutions": [1],
      "cooldown": 5,
      "time": 15
    },
    {
      "question": "Which of these are primary colors?",
      "answers": ["Red", "Green", "Blue", "Yellow"],
      "solutions": [0, 2, 3],
      "cooldown": 5,
      "time": 20
    },
    {
      "question": "What is the correct answer with an image?",
      "answers": ["No", "Yes", "No", "No"],
      "media": {
        "type": "image",
        "url": "https://placehold.co/600x400.png"
      },
      "solutions": [1],
      "cooldown": 5,
      "time": 20
    }
  ]
}
```

Quiz Options:

- `subject`: Title/topic of the quiz
- `questions`: Array of question objects containing:
  - `question`: The question text
  - `answers`: Array of possible answers (2-4 options)
  - `media`: Optional media object displayed with the question:
    - `type`: `"image"`, `"video"`, or `"audio"`
    - `url`: URL of the media
  - `solutions`: Array of correct answer indices (0-based). Use multiple indices for multi-answer questions
  - `cooldown`: Time in seconds before answers are revealed (3-15)
  - `time`: Time in seconds allowed to answer (5-120)

## 🎮 How to Play

1. Access the manager interface at http://localhost:3000/manager
2. Enter the manager password (defined in `config/game.json`)
3. Share the game URL (http://localhost:3000) and room code with participants
4. Wait for players to join
5. Click the start button to begin the game

## 📺 Kiosk / Satellite Display

The `/satellite/<gameId>` route is a **display-only kiosk** view of the
host/presentation screen, intended for a wall-mounted screen or a Raspberry Pi
wired to a beamer/TV. It renders the manager presentation chrome with **no**
control buttons — the game is still driven from `/manager` on another device.

Because it has no password prompt, this route does **not** use the manager
password. It authenticates over socket.io with a **token** supplied via the URL
(`/satellite/<gameId>?satellite=true&token=<token>`) or a build-time
`VITE_SATELLITE_TOKEN`, validated against the same `MANAGER.AUTH` path. Without a
valid token the kiosk cannot connect.

## 📝 Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](.github/CONTRIBUTING.md) guide before submitting a pull request.

For bug reports or feature requests on this fork, please [create an issue](https://git.joelduss.xyz/agent-claude/rahoot/issues).

## 🙏 Credits

Built on the excellent [Razzia](https://github.com/Ralex91/Razzia) by Ralex91 (open-source). This is the **Südhang fork** — see [CHANGELOG.md](CHANGELOG.md) for the full divergence and [docs/OPERATIONS.md](docs/OPERATIONS.md) for operations.
