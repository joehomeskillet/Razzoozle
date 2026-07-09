# Razzoozle Rust game server (MVP preview) — build context = repo root,
# built with: docker build -f rust/Dockerfile -t razzoozle-rust:latest .
# Runs PARALLEL to the Node server (not a replacement) — lobby + game loop only.

# ---- BUILDER ----
FROM rust:1-bookworm AS builder
WORKDIR /build
# fixture-quiz.json is include_str!'d at compile time, so it must be present
# in rust/server/ during the build (it is — copied with rust/).
COPY rust/ ./rust/
WORKDIR /build/rust
RUN cargo build --release -p razzoozle-server

# ---- RUNTIME ----
FROM debian:bookworm-slim AS runtime
RUN useradd -r -u 10001 -m appuser
COPY --from=builder /build/rust/target/release/razzoozle-server /usr/local/bin/razzoozle-server
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
