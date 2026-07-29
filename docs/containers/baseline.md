# Docker Baseline: razzoozle:baseline

**Baseline Commit:** `606d131e2a0b050495b3847e0a69a2f1754b1cfc`  
**Measurement Date:** 2026-07-29 (cold build re-measured 2026-07-29 11:42–11:44)  
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

### Cold Build (Truly No Cache)

#### Isolation Method

The Dockerfile uses four BuildKit cache mounts (lines 16, 38–40):

```dockerfile
#16  --mount=type=cache,id=pnpm,target=/pnpm/store
#38  --mount=type=cache,target=/usr/local/cargo/registry
#39  --mount=type=cache,target=/usr/local/cargo/git
#40  --mount=type=cache,target=/build/rust/target
```

**Important:** `docker buildx build --no-cache` invalidates **Docker layers only**, not BuildKit persistent cache mounts. A cold build requires isolation of the builder instance itself.

**Method:** Create isolated BuildKit builder instance with no existing cache:

```bash
# Create new, isolated builder (empty cache)
docker buildx create --name razzoozle-coldbuild --driver docker-container --use

# Perform cold build (cache mounts empty in new builder)
time docker buildx build --load -f rust/Dockerfile -t razzoozle:coldtest .

# Optional: Inspect cache state before build
docker buildx du --verbose

# Cleanup: Remove the isolated builder after measurement
docker buildx rm razzoozle-coldbuild
```

#### Cold Build Measurement

**Command (with isolated builder):**
```bash
docker buildx create --name razzoozle-coldbuild --driver docker-container --use
/usr/bin/time -v docker buildx build --load -f rust/Dockerfile -t razzoozle:coldtest .
```

**Result (measured):**
```
Elapsed (wall clock) time (h:mm:ss or m:ss): 1:36.93
```

**Total Cold Build Time: 96.93 seconds**

**Breakdown (from BuildKit output):**
- BuildKit container boot: 3.4 seconds
- Image metadata resolution: ~2 seconds
- Debian base layer: ~5 seconds
- Rust toolchain and `apt-get` updates: ~8 seconds
- **Cargo compilation (`cargo build --release`):** 77.6 seconds
- Web bundle COPY and runtime assembly: ~2 seconds
- Docker image export/import: ~1.5 seconds

**Key Finding:** Cargo dominates the cold build (~77.6s of 96.93s total = 80%). This is expected for a release build of a Rust server with full dependency compilation. The cache mount `/build/rust/target` reduces subsequent builds to ~1 second by preserving compiled artifacts.

### Warm Build (Cached Layers and Cache Mounts)

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

All layers remained cached; cache mounts also persisted.

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

### Startup Time to /health Response

**Measurement Method:** Server listening timestamp and health endpoint response timestamp extracted from logs:
- Server listening: `2026-07-29T09:36:55.412833Z`
- Health endpoint response: `2026-07-29T09:36:58.428Z`
- **Calculated delta: 3.016 seconds** (abgeleitet aus Logstempeln, nicht mit Systemzähler gemessen)

**Health Endpoint Response:**
```json
{"status":"ok","ts":"2026-07-29T09:36:58.428Z"}
```

**Note:** This timing is derived from application log timestamps (server-side clock), not from wall-clock measurement. The delta includes network latency and logging latency but does not account for container initialization overhead before the first log line.

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

# Cold build with isolated builder (true cold)
docker buildx create --name razzoozle-coldbuild --driver docker-container --use
/usr/bin/time -v docker buildx build --load -f rust/Dockerfile -t razzoozle:coldbuild .
docker buildx rm razzoozle-coldbuild

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

2. **BuildKit Cache Mounts and `--no-cache`:** `docker buildx build --no-cache` clears Docker layer cache but does NOT clear BuildKit persistent cache mounts. To measure a true cold build, an isolated BuildKit builder instance must be created (see "Isolation Method" section). This Dockerfile's cache mounts (`/pnpm/store`, `/usr/local/cargo/registry`, `/usr/local/cargo/git`, `/build/rust/target`) are significant performance optimizations for warm builds but must be cleared for cold-build baseline measurements.

3. **No HEALTHCHECK Instruction:** The Docker image does not include a `HEALTHCHECK` instruction. Orchestrators (e.g., Kubernetes, Docker Compose, Swarm) must probe `/health` manually or wait for the "Server listening" log line. This is noted in Dockerfile line 60 but not implemented.

4. **Non-Graceful Shutdown:** The application exits immediately on SIGTERM (no grace period). Container orchestration systems using graceful shutdown timeouts (e.g., `terminationGracePeriodSeconds` in Kubernetes) should account for this. The `save_snapshot()` call happens on shutdown, but there is no delay built in.

5. **Database Schema Required:** The image requires an external PostgreSQL database with schema pre-initialized. It does not include migration tooling or auto-migration on startup. The application warns on missing tables but continues running (useful for development, not production-safe).

6. **Startup Time Measurement Caveat:** The 3.0-second startup time is derived from application log timestamps, not from a precise wall-clock measurement before the container process begins. It represents the delta between "Server listening" and "/health responds", which does not include container initialization overhead before the first log line. A more precise measurement would require instrumenting the container entrypoint or using a dedicated startup profiling tool.

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
| **Cold Build Time (isolated builder)** | 96.93 seconds |
| **Warm Build Time (cached)** | 1.007 seconds |
| **Startup to /health Response** | 3.0 seconds (log-derived) |
| **Layer Count** | 5 layers |
| **HEALTHCHECK** | Not present |
| **Graceful Shutdown** | Immediate exit on SIGTERM (no grace period) |
| **Filesystem Writes** | Database and volume mounts only (no container layer writes) |
