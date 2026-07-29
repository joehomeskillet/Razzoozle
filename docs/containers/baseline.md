# Docker Baseline: razzoozle:baseline

**Baseline Commit:** `606d131e2a0b050495b3847e0a69a2f1754b1cfc`  
**Measurement Date:** 2026-07-29  
**Status:** Initial baseline, Dockerfile unchanged since commit `ca8c19a17` (Issue #791 noted SHA is now 13 commits ahead due to Rust/TypeScript/Gate changes only)

---

## System Versions

```
Docker version 29.3.0, build 5927d80
github.com/docker/buildx v0.31.1 a2675950d46b2cb171b23c2015ca44fb88607531
node v22.23.1
pnpm 11.5.1
rustc 1.96.1 (31fca3adb 2026-06-26)
cargo 1.96.1 (356927216 2026-06-26)
```

---

## Build Times

### Cold Build (No Cache)

**Command:**
```bash
docker buildx build --no-cache --load -f rust/Dockerfile -t razzoozle:baseline .
```

**Result:** Build completed successfully with the following major component times:
- Debian `bookworm-slim` base pull and setup: ~5-10 seconds
- `apt-get update` and `mold` installation: ~2 seconds
- Web build (`pnpm build` in Node 22.23.1): ~10-20 seconds (cache mounts used)
- **Rust compilation (`cargo build --release`):** **70 seconds** (shown in build logs as `Finished release profile [optimized] target(s) in 1m 10s`)
- Runtime image assembly: <2 seconds

**Total Elapsed Cold Build Time:** Approximately **90-120 seconds** (exact time depends on network for Debian repository downloads)

### Warm Build (With Cached Layers)

**Command:**
```bash
time docker buildx build --load -f rust/Dockerfile -t razzoozle:baseline .
```

**Result:**
```
real	0m1.007s
user	0m0.088s
sys	0m0.061s
```

All layers remained cached (CACHED status for all build steps shown in buildkit output).

---

## Image Specification

### Image Inspect

**Command:**
```bash
docker image inspect razzoozle:baseline
```

**Full Output:**
```json
[
    {
        "Id": "sha256:4f6e57ebfeadb4e401c47788b642a87a4761d9b9c6dd20ed4893b8592f4d807d",
        "RepoTags": [
            "razzoozle:baseline",
            "razzoozle:cold-build"
        ],
        "RepoDigests": [],
        "Comment": "buildkit.dockerfile.v0",
        "Created": "2026-07-29T11:35:33.193197612+02:00",
        "Config": {
            "User": "appuser",
            "ExposedPorts": {
                "3020/tcp": {}
            },
            "Env": [
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "PORT=3020",
                "CONFIG_PATH=/config",
                "WEB_DIST=/app/web"
            ],
            "Cmd": [
                "razzoozle-server"
            ],
            "ArgsEscaped": true
        },
        "Architecture": "amd64",
        "Os": "linux",
        "Size": 107148023,
        "GraphDriver": {
            "Data": {
                "LowerDir": "/nvmetank1/docker-data/overlay2/ygreerd4ruxazw81jowor6j6b/diff:/nvmetank1/docker-data/overlay2/g3q6p9zj2oosgrhq24f7g72jl/diff:/nvmetank1/docker-data/overlay2/1207omm0tm0yuj24mhp4kbbpv/diff:/nvmetank1/docker-data/overlay2/86e5ac80ede94fa4639e6b4e4b57c5e5a75727518f20b73070a1925784669c4e/diff",
                "MergedDir": "/nvmetank1/docker-data/overlay2/v1x39ugq3ql750qpsyersdmet/merged",
                "UpperDir": "/nvmetank1/docker-data/overlay2/v1x39ugq3ql750qpsyersdmet/diff",
                "WorkDir": "/nvmetank1/docker-data/overlay2/v1x39ugq3ql750qpsyersdmet/work"
            },
            "Name": "overlay2"
        },
        "RootFS": {
            "Type": "layers",
            "Layers": [
                "sha256:81f823b9617547261c907396f63f770deaa554748ff739bedfa650e3bb74595a",
                "sha256:5c7f2e63bcb515bdcf53dff535912c5f638ea68838fb72d5f6a719a3af5ff330",
                "sha256:b3d96e44677c5374d8bc2268c07a7521d38c9ed0bb39b9739805571e1a70621e",
                "sha256:b80da1e5407616912db0240a89def055a4743c3f57fd114eb861f7cd34e2fbca",
                "sha256:2e0a560d394635cd969a0421f9a2ac83ebf97d33949b664cf799b774768ec48a"
            ]
        },
        "Metadata": {
            "LastTagTime": "2026-07-29T11:35:44.767657621+02:00"
        }
    }
]
```

**Key Metrics:**
- **Total Image Size:** 107148023 bytes = 102.2 MB
- **Architecture:** amd64
- **Operating System:** linux
- **Layer Count:** 5 layers

### Layer Breakdown

**Command:**
```bash
docker history --no-trunc razzoozle:baseline
```

**Output:**
```
IMAGE                                                                     CREATED              CREATED BY                                                                                                                                       SIZE      COMMENT
sha256:4f6e57ebfeadb4e401c47788b642a87a4761d9b9c6dd20ed4893b8592f4d807d   18 seconds ago       CMD ["razzoozle-server"]                                                                                                                         0B        buildkit.dockerfile.v0
<missing>                                                                 18 seconds ago       EXPOSE [3020/tcp]                                                                                                                                0B        buildkit.dockerfile.v0
<missing>                                                                 18 seconds ago       ENV WEB_DIST=/app/web                                                                                                                            0B        buildkit.dockerfile.v0
<missing>                                                                 18 seconds ago       ENV CONFIG_PATH=/config                                                                                                                          0B        buildkit.dockerfile.v0
<missing>                                                                 18 seconds ago       ENV PORT=3020                                                                                                                                    0B        buildkit.dockerfile.v0
<missing>                                                                 18 seconds ago       USER appuser                                                                                                                                     0B        buildkit.dockerfile.v0
<missing>                                                                 18 seconds ago       RUN /bin/sh -c mkdir -p /config/quizz /config/solo-results /config/media /config/theme && chown -R appuser:appuser /config /app/web # buildkit   7.23MB    buildkit.dockerfile.v0
<missing>                                                                 20 seconds ago       COPY /build/packages/web/dist /app/web # buildkit                                                                                                7.23MB    buildkit.dockerfile.v0
<missing>                                                                 20 seconds ago       COPY /razzoozle-server /usr/local/bin/razzoozle-server # buildkit                                                                                17.9MB    buildkit.dockerfile.v0
<missing>                                                                 About a minute ago   RUN /bin/sh -c useradd -r -u 10001 -m appuser # buildkit                                                                                         8.87kB    buildkit.dockerfile.v0
<missing>                                                                 2 weeks ago          # debian.sh --arch 'amd64' out/ 'bookworm' '@1783900800'                                                                                         74.8MB    debuerreotype 0.17
```

**Layer Summary:**
1. Debian base (`bookworm-slim`): **74.8 MB**
2. Add system user `appuser` (UID 10001): **8.87 kB**
3. Copy Rust binary (`razzoozle-server`): **17.9 MB**
4. Copy web SPA distribution: **7.23 MB**
5. Create config directories and set ownership: **7.23 MB**
6. Environment variables and metadata: **0 B** (5 additional layers)

**Total:** 107.1 MB

---

## Runtime Configuration

### User and Process

**Command:**
```bash
docker run --rm --entrypoint /usr/bin/id razzoozle:baseline
```

**Output:**
```
uid=10001(appuser) gid=999(appuser) groups=999(appuser)
```

**Verification Notes:**
- User is non-root (UID 10001)
- Primary group GID 999
- UID matches Dockerfile specification: `useradd -r -u 10001 -m appuser` (line 46)
- Warning in build logs: `useradd warning: appuser's uid 10001 is greater than SYS_UID_MAX 999` — this is expected and not an error

### Entrypoint and Port

- **Entrypoint:** `razzoozle-server` (CMD in image)
- **Exposed Port:** `3020/tcp`
- **Environment Variables Set:**
  - `PORT=3020`
  - `CONFIG_PATH=/config`
  - `WEB_DIST=/app/web`
  - `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`

### HEALTHCHECK

**Status:** No HEALTHCHECK instruction present in Dockerfile (comment on line 60 indicates future consideration)

**Actual Health Endpoint:** Application listens on `GET /health` and returns JSON status.

---

## Runtime Behavior

### Container Startup

**Test Setup:** Temporary PostgreSQL (v16) container on private Docker network, Razzoozle container with:
- Database connection via `DATABASE_URL=postgresql://razzoozle:[TEST_PASSWORD]@razzoozle-test-db:5432/razzoozle`
- Volume mount: `/tmp/razzoozle-test-config:/config`

**Startup Log Output:**
```
2026-07-29T09:36:55.408392Z  WARN  razzoozle_server::db::media: Failed to fetch media_assets for hydration from database: error returned from database: relation "media_assets" does not exist
Failed to fetch installed_plugins for hydration from database: error returned from database: relation "installed_plugins" does not exist
Failed to check user count during bootstrap: error returned from database: relation "users" does not exist
Failed to fetch quizzes from database: error returned from database: relation "quizzes" does not exist
2026-07-29T09:36:55.411862Z  INFO  razzoozle_server: Snapshot task started
2026-07-29T09:36:55.412833Z  INFO  razzoozle_server: Server listening on http://0.0.0.0:3020
```

**Startup Time to Listening:** ~400 milliseconds (from process start to "Server listening" log)

**Time to HTTP Response on /health:** ~3.2 seconds total from `docker run` command (includes container initialization overhead)

**Health Endpoint Response:**
```json
{"status":"ok","ts":"2026-07-29T09:36:58.428Z"}
```

### SIGTERM Graceful Shutdown

**Test:** Container running, sent `docker kill --signal SIGTERM <cid>`

**Result:** Container stopped cleanly and was removed by `--rm` flag without hanging. Exit was immediate (no observable grace period delay).

**Expected Behavior vs. Observed:**
- Dockerfile specifies no graceful shutdown handler (main.rs lines 420-439: `std::process::exit(0)` after snapshot save)
- Observed behavior matches: immediate exit on SIGTERM, no lingering processes
- No blocking operations detected during shutdown

### Filesystem Write Patterns

**Test Configuration:** Container mount at `/config` (volume), overlay FS for container layers

**Write Verification:**
- **UpperDir (uncommitted container layer writes):** 0 files
- **Config Directory Contents:** Only pre-created directories from Dockerfile (quizz, solo-results, media, theme) — all empty
- **Application Behavior:** Database-first architecture; no file-based persistence to container filesystem

**Conclusion:** Application is stateless within the container (no state written to image layers). All persistent state goes to database (via `DATABASE_URL`) or explicit volume mounts (e.g., `/config` for quiz/theme data).

---

## Reproducibility Commands

To verify or replicate these measurements:

```bash
# System info
docker --version
docker buildx version
node --version
pnpm --version
rustc --version

# Cold build (force no cache)
docker buildx prune -a --force
time docker buildx build --no-cache --load -f rust/Dockerfile -t razzoozle:baseline .

# Warm build (cached)
time docker buildx build --load -f rust/Dockerfile -t razzoozle:baseline .

# Image inspection
docker image inspect razzoozle:baseline
docker history --no-trunc razzoozle:baseline

# UID verification
docker run --rm --entrypoint /usr/bin/id razzoozle:baseline

# Runtime test (requires PostgreSQL)
# Create Docker network, start Postgres, start Razzoozle, measure startup and health check
```

---

## Notes and Deviations

1. **Baseline SHA vs. Issue #791:** Issue #791 referenced commit `ca8c19a17`. The Rust server Dockerfile (`rust/Dockerfile`) has not changed since that commit, but HEAD is now `606d131e2a0b050495b3847e0a69a2f1754b1cfc` (+13 commits with Rust logic, TypeScript, and gate script changes). This baseline captures the **current compiled state**, not the original Issue commit. Future baselines should use the same HEAD or note divergence.

2. **No HEALTHCHECK Instruction:** The Docker image does not include a `HEALTHCHECK` instruction. Orchestrators (e.g., Kubernetes, Docker Compose, Swarm) must probe `/health` manually or wait for the "Server listening" log line. This is noted in Dockerfile line 60 but not implemented.

3. **Non-Graceful Shutdown:** The application exits immediately on SIGTERM (no grace period). Container orchestration systems using graceful shutdown timeouts (e.g., `terminationGracePeriodSeconds` in Kubernetes) should account for this. The `save_snapshot()` call happens on shutdown, but there is no delay built in.

4. **Database Schema Required:** The image requires an external PostgreSQL database with schema pre-initialized. It does not include migration tooling or auto-migration on startup. The application warns on missing tables but continues running (useful for development, not production-safe).

5. **BuildKit Cache Mounts:** The Dockerfile uses BuildKit cache mounts for Cargo registry, git, and compiled Rust targets. This dramatically reduces rebuild times for warm builds but requires BuildKit support (enabled by default in modern Docker Desktop/Docker Engine versions).

---

## Summary Table

| Metric | Value |
|--------|-------|
| **Image SHA256** | `4f6e57ebfeadb4e401c47788b642a87a4761d9b9c6dd20ed4893b8592f4d807d` |
| **Image Size** | 102.2 MB (107,148,023 bytes) |
| **Base Image** | `debian:bookworm-slim` (74.8 MB) |
| **Rust Binary Size** | 17.9 MB |
| **Web SPA Size** | 7.23 MB |
| **Runtime User** | `appuser` (UID 10001, GID 999) |
| **Architecture** | amd64 |
| **Listening Port** | 3020 |
| **Cold Build Time** | ~90–120 seconds (Rust compilation ~70s) |
| **Warm Build Time** | ~1 second |
| **Startup to Listening** | ~400 ms |
| **Startup to /health Response** | ~3.2 seconds (container init overhead) |
| **Layer Count** | 5 layers |
| **HEALTHCHECK** | Not present |
| **Graceful Shutdown** | Immediate exit on SIGTERM (no grace period) |
| **Filesystem Writes** | Database and volume mounts only (no container layer writes) |
