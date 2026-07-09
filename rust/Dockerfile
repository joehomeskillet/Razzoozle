# syntax=docker/dockerfile:1
# Razzoozle Rust game server (MVP preview) — build context = repo root,
# built with: DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle-rust:latest .
# Runs PARALLEL to the Node server (not a replacement) — lobby + game loop only.

# ---- BUILDER ----
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
# Config dirs created empty and owned by appuser. Quizzes are authored at runtime
# via the editor and persisted to the shared Postgres / the CONFIG_PATH volume —
# the image no longer bundles the (gitignored) config/quizz, so a fresh clone
# builds with no host-only runtime data.
RUN mkdir -p /config/quizz /config/solo-results && chown -R appuser:appuser /config
USER appuser
ENV PORT=3020
ENV CONFIG_PATH=/config
EXPOSE 3020
# Health: GET /health -> 200
CMD ["razzoozle-server"]
