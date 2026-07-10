# nginx-rust-only.conf Reference & Deployment Guide

**Status:** Preparation for W5 Rust-only cutover  
**File:** `docs/design/nginx-rust-only.conf`  
**Current production config:** `docker/nginx.conf` (Node.js backend)

## Overview

This document describes a single-file swap strategy for Razzoozle's static proxy role (nginx):

- **Current state:** nginx proxies game logic to Node.js (:3001)
- **Rust-only state:** nginx proxies game logic to Rust (:3020) instead
- **Strategy:** No image rebuild, no code rebuild — just `cp nginx-rust-only.conf nginx.conf`

## Location-by-Location Diff

| Location | Pattern | Current | Rust-Only | Change |
|----------|---------|---------|-----------|--------|
| /healthz | `=` | `:3001` | `:3020` | Backend swap |
| /ws | `/` | `:3001` | `:3020` | Backend swap |
| /metrics | `=` | `:3001` | `:3020` | Backend swap |
| /api/ | `/` | `:3001` | `:3020` | Backend swap |
| /r/ | `~` regex | `:3001` | `:3020` | Backend swap |
| /_rust/ | `/` | strip prefix, proxy `:3020` | **REMOVED** | No longer needed |
| /theme/ | `^~` | alias `/app/config/theme/` | **unchanged** | Static, backend-agnostic |
| /media/ | `^~` | alias `/app/config/media/` | **unchanged** | Static, backend-agnostic |
| /sw.js | `=` | no-cache | **unchanged** | PWA pinning, backend-agnostic |
| /registerSW.js | `=` | no-cache | **unchanged** | PWA pinning, backend-agnostic |
| /manifest.webmanifest | `=` | no-cache | **unchanged** | PWA pinning, backend-agnostic |
| *.{js,css,fonts,images} | regex | cache forever | **unchanged** | Static assets, backend-agnostic |
| / (SPA fallback) | `/` | → index.html | **unchanged** | SPA shell, backend-agnostic |

**Summary:** 5 locations change backend (`:3001` → `:3020`), 1 location removed (/_rust), 9 locations unchanged.

## Deployment Checklist (W5)

1. **Pre-cutover:**
   - [ ] Rust twin fully deployed and passing all E2E tests on :3020
   - [ ] Load balancer or DNS configured to accept both node.razzoozle.xyz and rust.razzoozle.xyz (or unified domain with backend selection)
   - [ ] Backup current `docker/nginx.conf` (already in git)

2. **Cutover:**
   - [ ] Copy `docs/design/nginx-rust-only.conf` to `docker/nginx.conf` in the production config mount or image
   - [ ] Reload nginx: `docker exec razzoozle_nginx_1 nginx -s reload` (or restart if reload fails)
   - [ ] Health check: curl `http://127.0.0.1:3000/healthz` → expects `ok` from Rust `:3020/healthz`
   - [ ] Smoke test: 1 game creation + 1 player join on rust.razzoozle.xyz
   - [ ] Monitor error logs for 15min: `docker logs razzoozle_nginx_1 -f`

3. **Rollback (if needed):**
   - [ ] Restore original `docker/nginx.conf` (Node variant)
   - [ ] Reload nginx
   - [ ] Re-test on node.razzoozle.xyz

## Architectural Notes

### Why /:3020 is Safe
- Rust HTTP server listens on container port :3020 (maps to :3012 on host)
- nginx container can reach it via 127.0.0.1:3020 (container-internal loopback)
- This is the same pattern as the current Node setup (`:3001`)

### Why /_rust Prefix is Removed
- **Old situation:** Web client built with `VITE_DEFAULT_BACKEND=rust` used path `/socket.io` → nginx rewrites to `/_rust/socket.io` → strips `/_rust` → Rust :3020
- **New situation:** All clients default to Rust; no prefix needed, no rewrite needed
- **Implication:** If you need to run Node.js alongside Rust (e.g., for A/B testing), you'd need a different strategy (e.g., DNS-based or subdomain-based selection, not path-based)

### PWA & Static Asset Caching (Unchanged)
- Service worker (`sw.js`, `registerSW.js`, `manifest.webmanifest`) must revalidate on every request
  - Ensures players get the latest app version after deploy
  - Backend choice does not change this requirement
- Vite-hashed assets (`.js`, `.css`, `.woff2`, `.png`, etc.) cache forever
  - Safe because filenames include content hash
  - Backend choice does not change this
- Config assets (`/theme/`, `/media/`) cache for 1 day
  - Updated by managers; 1-day TTL allows live edits to propagate within a day
  - Backend choice does not change this

## Testing the Config (Before Deployment)

### Local Validation
```bash
# Syntax check (nginx container)
docker run --rm -v $(pwd)/docs/design/nginx-rust-only.conf:/etc/nginx/conf.d/default.conf nginx nginx -t

# Or host-side (if nginx installed)
nginx -t -c $(pwd)/docs/design/nginx-rust-only.conf
```

### Functional Test (After Swap)
```bash
# From host machine
curl -v http://127.0.0.1:3000/healthz
# Expected: 200 OK, body "ok" (from Rust)

curl -v http://127.0.0.1:3000/metrics
# Expected: 200 OK, body "# TYPE ...prometheus text" (from Rust)

curl -v http://127.0.0.1:3000/api/quizzes
# Expected: 200 OK, body JSON array (from Rust)
```

## Version Control & Handoff

- **Current config:** git-tracked at `docker/nginx.conf` (Node)
- **Rust variant:** git-tracked at `docs/design/nginx-rust-only.conf` (this file, non-deployed reference)
- **Handoff:** When W5 cutover begins, operations team swaps files and tests per checklist above

---

**Generated:** W1g verification (2026-07-10)  
**Not deployed.** For W5 cutover planning only.
