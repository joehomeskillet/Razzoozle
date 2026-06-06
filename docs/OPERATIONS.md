# Operations Runbook — Südhang Kahoot (Razzia fork)

Practical runbook for operating and deploying the Südhang quiz app. Audience: the
operator running it at the event, and future maintainers.

Public URL: `https://rahoot.joelduss.xyz` · Deploy dir: `/nvmetank1/projects/rahoot`
· Container: `razzia` · Image: `rahoot:custom`

---

## 1. Architecture

The whole app ships as **one Docker image** (alpine 3.23) running two processes
under `supervisord`:

- **nginx** (`:3000`) — serves the React SPA static build from `/app/web`, serves
  live theme assets from the config volume at `/theme/`, and reverse-proxies
  `/ws` and `/healthz` to the node socket on `127.0.0.1:3001`.
- **node socket** (`:3001`) — the socket.io game server (`/app/socket/index.cjs`),
  started with `CONFIG_PATH=/app/config`.

In front of the container, **Caddy** terminates TLS (ZeroSSL) and routes
`rahoot.joelduss.xyz → 127.0.0.1:3010`. The container publishes `3000` and compose
maps it to host `127.0.0.1:3010` (loopback only; never exposed directly).

**Host config volume** `./config` is bind-mounted at `/app/config`:

| Path | Purpose |
|---|---|
| `config/game.json` | secrets/config — holds `managerPassword`. **Private**, never served. |
| `config/quizz/personalfest.json` | the quiz (15 questions). |
| `config/theme/theme.json` | live theme (colors, backgrounds, `appTitle`, logo). Served at `/theme/theme.json`, `no-store`. |
| `config/theme/*.{webp,png,mp3}` | theme/quiz images + audio. Served at `/theme/`, 1-day cache. |
| `config/state/registry.json` | **crash snapshot** of in-flight games (auto-written, see §5). |

Client is a React 19 SPA (Vite + TanStack Router + Tailwind v4); realtime is
socket.io over the proxied `/ws` path.

---

## 2. Deploy procedure

Run from `/nvmetank1/projects/rahoot`. The Dockerfile build does **only** vite +
esbuild — it **never typechecks or runs** the socket code, so a build that
"succeeds" can still crash-loop at boot. **Always smoke-test the socket bundle
before deploying.**

```bash
cd /nvmetank1/projects/rahoot

# 0) Tag the currently-deployed image for rollback (pick a short suffix).
docker tag rahoot:custom rahoot:rollback-pre-$(date +%Y%m%d-%H%M)

# 1) Build the new image from the source subdir.
docker build -t rahoot:custom source/

# 2) SMOKE-TEST the socket bundle BEFORE deploy — catches boot crashes the
#    build cannot. Extract the cjs from the freshly-built image and run it.
cid=$(docker create rahoot:custom)
docker cp "$cid:/app/socket/index.cjs" /tmp/index.cjs
docker rm "$cid"
CONFIG_PATH=/tmp/rahoot-smoke timeout 3 node /tmp/index.cjs
#   EXPECT: "Socket server running on port 3001"  (a stack trace = DO NOT DEPLOY)

# 3) Roll it out.
docker compose up -d

# 4) Verify.
docker ps --filter name=razzia                 # STATUS must show (healthy)
curl -fsS https://rahoot.joelduss.xyz/healthz   # -> ok
curl -fsS -o /dev/null -w '%{http_code}\n' https://rahoot.joelduss.xyz/   # -> 200
```

If step 2 prints a stack trace instead of `Socket server running on port 3001`,
**stop** — fix the code and rebuild. Do not run `compose up`.

The container may take ~20 s (`start-period`) before `docker ps` flips to
`(healthy)`. Until then it shows `(health: starting)`.

---

## 3. Rollback

Every deploy in §2 step 0 tags the prior image `rahoot:rollback-pre-<suffix>`. To
roll back, re-point `rahoot:custom` at a known-good tag and restart:

```bash
cd /nvmetank1/projects/rahoot
docker images | grep rahoot              # list available rollback tags
docker tag rahoot:rollback-pre-<suffix> rahoot:custom
docker compose up -d
docker ps --filter name=razzia           # confirm (healthy)
```

Rollback tags currently on the host (newest wave last):

```
rahoot:rollback-pre-perf        rahoot:rollback-pre-kiosk
rahoot:rollback-pre-reconnect   rahoot:rollback-pre-pwa
rahoot:rollback-pre-recovery    rahoot:rollback-pre-security
rahoot:rollback-pre-fsbtn       rahoot:rollback-pre-swnf
```

`rollback-pre-swnf` is the image from immediately before the most recent
(NetworkFirst PWA) deploy — the safest one-step-back target.

The config volume is **not** touched by rollback. The crash snapshot
(`config/state/registry.json`) format is versioned; an older image silently
ignores a snapshot it doesn't recognize, so rolling back never corrupts state.

---

## 4. Health & auto-heal

Docker `HEALTHCHECK` probes the **full chain**: it `wget`s
`http://127.0.0.1:3000/healthz`, which nginx proxies to the socket's `/healthz`
on `:3001`. So a green healthcheck means *both* nginx and node are up and talking.

- Interval 15 s, timeout 3 s, 20 s start-period, 3 retries.
- A wedged container (nginx down, or node not answering `/healthz`) is marked
  **unhealthy** after 3 failed probes — visible in `docker ps`.
- `restart: unless-stopped` brings the container back after a host reboot or a
  process exit; supervisord (`autorestart=true`) restarts either inner process if
  it crashes.

Quick checks:

```bash
docker ps --filter name=razzia
docker inspect --format '{{.State.Health.Status}}' razzia
docker logs --tail 50 razzia
curl -fsS http://127.0.0.1:3010/healthz   # bypasses Caddy, hits the container
```

---

## 5. Crash recovery

The socket server snapshots every **stable in-flight game** to
`config/state/registry.json`:

- **every 5 s** (periodic task), and
- **on SIGTERM/SIGINT** (graceful redeploy/shutdown), saving the latest state
  before cleanup.

Writes are atomic (`.tmp` + rename) and fully crash-guarded — a failed save or a
corrupt/missing file is a no-op that never disrupts gameplay or boot.

On **boot**, the server restores those games (detached) *before* arming the
periodic save, then re-binds each browser through the normal **clientId**
reconnect flow. Restored games resume at the **leaderboard** with **autoMode
off**, and are marked empty so they get cleaned up after the normal grace window
if nobody reconnects.

Net effect: **a process crash or a mid-quiz redeploy no longer kicks everyone.**
Players and the manager reconnect by their durable `clientId` and land back in the
running game. (Proven with a `kill -9` test of the socket process mid-quiz.)

Operator note: you do **not** need to do anything special to recover — just bring
the container back (`docker compose up -d`). To start completely fresh instead,
stop the container and delete `config/state/registry.json` before starting.

---

## 6. PWA / deploy freshness

The app is a PWA (`vite-plugin-pwa`, `registerType: autoUpdate`). Caching is tuned
so a deploy lands cleanly:

- **HTML shell** is **NetworkFirst** — an open tab picks up the new version on a
  single reload.
- Hashed JS/CSS/font/image assets are **immutable**-cached (1 year) — safe,
  filenames change every build.
- `index.html`, `sw.js`, `registerSW.js`, `manifest.webmanifest` are **no-cache**
  (always revalidate) so a new deploy reaches phones instead of pinning a stale
  app for a year.
- `theme.json` is **no-store** so live Design-tab edits show immediately.

**After ANY deploy: reload the beamer (`/display`) tab and the manager tab once.**
One reload is enough — it fetches the new shell + the new asset graph.

---

## 7. Config & secrets

**Manager password** lives in `config/game.json` as `managerPassword`. Source of
truth is the secret store — **do not commit it**:

```bash
platform-secret get razzia-manager-password
# put the value into config/game.json -> "managerPassword", then restart:
docker compose -f /nvmetank1/projects/rahoot/compose.yml restart razzia
```

`game.json` is **never served** by nginx (only `/theme/` and the SPA are public),
so the password stays private on the host.

**Theme** (colors, per-view backgrounds, `appTitle` "Südhang Kahoot", logo) is
edited **live from the `/manager` Design tab** and persisted to
`config/theme/theme.json`. No redeploy needed — it's served `no-store`, so a
manager-side save shows on the next page load. Uploaded background/quiz assets land
in `config/theme/` with unique filenames (1-day cacheable).

**Quiz** is `config/quizz/personalfest.json` (15 questions). Edit it on the host
and restart the container, or edit via the manager UI.

---

## 8. Event-day checklist

- [ ] **Container healthy:** `docker ps --filter name=razzia` shows `(healthy)`.
      If not, see §4.
- [ ] **Beamer ready:** open `https://rahoot.joelduss.xyz/display`,
      **hard-reload once** (Ctrl/Cmd-Shift-R), then click the **fullscreen**
      button.
- [ ] **Test join:** from a phone, open the public URL, join with the PIN, and
      confirm the player shows up in the manager lobby; then kick/leave that test
      player.
- [ ] **Manager password works:** log in to `/manager` with the password from
      `platform-secret get razzia-manager-password`.
- [ ] **Wifi/NAT:** players on the venue wifi all share one outbound NAT IP — this
      is fine **by design**, there are no per-IP join rate limits, so a roomful of
      phones behind one router will not trip throttling.
- [ ] **(Optional) Pre-flight reload reminder:** if you deployed today, reload the
      beamer + manager tabs once more (see §6).

Load headroom: proven at **600 concurrent players** with the socket process under
**<10% CPU**, so a normal event has ample margin.
