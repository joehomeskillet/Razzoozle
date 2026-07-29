# syntax=docker/dockerfile:1
# Razzoozle Rust game server — with bundled web SPA + static assets
# Built with: DOCKER_BUILDKIT=1 docker buildx build -f rust/Dockerfile -t razzoozle:latest .
# Build context: repo root

# ---- BUILD ARGS (pin base images to specific versions for reproducibility) ----
ARG NODE_VERSION=25-alpine
ARG RUST_VERSION=1-bookworm
ARG DEBIAN_VERSION=bookworm-slim

# ---- WEB BUILDER (builds SPA dist) ----
FROM node:${NODE_VERSION} AS webbuilder
RUN npm install -g pnpm@11.5.1
WORKDIR /build

# Copy workspace + package files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/common/package.json ./packages/common/
COPY packages/web/package.json ./packages/web/

# BuildKit cache mount for pnpm global store across builds
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy all workspace files (including tsconfig.json, vite.config.ts, etc.)
COPY . .

ENV VITE_DEFAULT_BACKEND=rust
RUN cd packages/web && pnpm build

# ---- RUST BUILDER ----
FROM rust:${RUST_VERSION} AS builder
# mold linker is required by rust/.cargo/config.toml (-fuse-ld=mold) for faster linking
RUN apt-get update && apt-get install -y --no-install-recommends \
    mold \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
# fixture-quiz.json is include_str!'d at compile time, must be present during build
COPY rust/ ./rust/
WORKDIR /build/rust

# BuildKit cache mounts persist cargo registry/git + compiled target/ across builds
# so dependencies are not recompiled every time. target/ is a cache mount (not part
# of the final image layer), so the built binary is copied OUT to a real path for
# the runtime stage to COPY.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/rust/target \
    cargo build --release -p razzoozle-server \
    && cp target/release/razzoozle-server /razzoozle-server

# ---- RUNTIME ----
FROM debian:${DEBIAN_VERSION} AS runtime

# OCI image metadata labels (container orchestration and artifact tracking)
LABEL org.opencontainers.image.title="razzoozle-server" \
      org.opencontainers.image.description="Razzoozle Rust game server with bundled web SPA" \
      org.opencontainers.image.vendor="Razzoozle"

# Create non-root application user (UID 10001)
RUN useradd -r -u 10001 -m appuser

# Copy compiled Rust binary from builder stage
COPY --from=builder /razzoozle-server /usr/local/bin/razzoozle-server

# Copy web SPA distribution from webbuilder stage
COPY --from=webbuilder /build/packages/web/dist /app/web

# Create config directories owned by appuser
# These are persisted to a volume or Postgres at runtime (not bundled in image)
RUN mkdir -p /config/quizz /config/solo-results /config/media /config/theme && \
    chown -R appuser:appuser /config /app/web

# Run as non-root user
USER appuser

# Environment configuration
ENV PORT=3020 \
    CONFIG_PATH=/config \
    WEB_DIST=/app/web

# Expose listening port
EXPOSE 3020

# Health check: Verify server is responsive via /health endpoint
# Retry up to 3 times with 30s intervals, 5s timeout, 10s start grace
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3020/health || exit 1

# Start server
CMD ["razzoozle-server"]
