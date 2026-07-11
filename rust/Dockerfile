# syntax=docker/dockerfile:1
# Razzoozle Rust game server — with bundled web SPA + static assets
# built with: DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle-rust:latest .
# Build context: repo root

# ---- WEB BUILDER (builds SPA dist) ----
FROM node:25-alpine AS webbuilder
RUN npm install -g pnpm@11.5.1
WORKDIR /build

# Copy workspace + package files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/common/package.json ./packages/common/
COPY packages/web/package.json ./packages/web/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy all workspace files (including tsconfig.json, vite.config.ts, etc.)
COPY . .

ENV VITE_DEFAULT_BACKEND=rust
RUN cd packages/web && pnpm build

# ---- RUST BUILDER ----
FROM rust:1-bookworm AS builder
# mold is required by rust/.cargo/config.toml (-fuse-ld=mold linker); install it here.
RUN apt-get update && apt-get install -y --no-install-recommends mold \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
# fixture-quiz.json is include_str!'d at compile time, so it must be present
# in rust/server/ during the build (it is — copied with rust/).
COPY rust/ ./rust/
WORKDIR /build/rust
# BuildKit cache mounts persist the cargo registry/git + compiled target/ across
# image builds so dependencies are not recompiled every time. target/ is a cache
# mount (not part of the image layer), so copy the built binary OUT to a real path
# for the runtime stage to COPY.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/rust/target \
    cargo build --release -p razzoozle-server \
    && cp target/release/razzoozle-server /razzoozle-server

# ---- RUNTIME ----
FROM debian:bookworm-slim AS runtime
RUN useradd -r -u 10001 -m appuser
COPY --from=builder /razzoozle-server /usr/local/bin/razzoozle-server
# Bundle web dist from webbuilder stage
COPY --from=webbuilder /build/packages/web/dist /app/web
# Config dirs created empty and owned by appuser. Quizzes are authored at runtime
# via the editor and persisted to the shared Postgres / the CONFIG_PATH volume —
# the image no longer bundles the (gitignored) config/quizz, so a fresh clone
# builds with no host-only runtime data.
RUN mkdir -p /config/quizz /config/solo-results /config/media /config/theme && chown -R appuser:appuser /config /app/web
USER appuser
ENV PORT=3020
ENV CONFIG_PATH=/config
ENV WEB_DIST=/app/web
EXPOSE 3020
# Health: GET /health -> 200
CMD ["razzoozle-server"]
