# docker-bake.hcl — Razzoozle Docker image build definitions
#
# Consolidates all Docker build targets and configuration in a single,
# version-controlled file. Replaces ad-hoc 'docker build' calls across
# CI workflows and scripts.
#
# Usage:
#   docker buildx bake              # Build all targets (default)
#   docker buildx bake rust         # Build only the rust target
#   docker buildx bake -f docker-bake.hcl --dry-run  # Inspect without building
#
# Platforms & tags are defined per target and can be overridden via
# environment variables or --set flags.

variable "REGISTRY" {
  default = "docker.io"
}

variable "IMAGE_NAME" {
  default = "razzoozle"
}

variable "TAG" {
  default = "latest"
}

variable "BUILD_DATE" {
  default = timestamp()
}

# Git revision — captured from environment or HEAD if not set
variable "VCS_REF" {
  default = ""
}

variable "VERSION" {
  default = "0.0.0"
}

# Common base group for all targets
group "default" {
  targets = ["rust"]
}

# Rust game server target
# Multi-stage build: node/pnpm webbuilder → rust builder → debian runtime
# Builds web SPA and bundles it into the runtime image.
#
# BuildKit cache mounts for pnpm and cargo speed up incremental builds;
# cache persistence is managed by the local buildx builder instance.
target "rust" {
  context = "."
  dockerfile = "rust/Dockerfile"

  # Allow overriding tag and registry via environment
  tags = [
    "${REGISTRY}/${IMAGE_NAME}-rust:${TAG}",
    "${REGISTRY}/${IMAGE_NAME}-rust:ci",
  ]

  # Linux/amd64 and arm64 for production; amd64 for local dev
  # Comment out arm64 if cross-compilation time is not worth the coverage
  platforms = ["linux/amd64"]

  # BuildKit options: cache mounts for pnpm and cargo, full inline caching
  args = {
    DOCKER_BUILDKIT = "1"
  }

  # OCI image labels (required by scripts/container/verify-image.sh)
  labels = {
    "org.opencontainers.image.title"    = "razzoozle-rust"
    "org.opencontainers.image.source"   = "https://gitea.joelduss.xyz/joelduss/Razzoozle"
    "org.opencontainers.image.revision" = VCS_REF != "" ? VCS_REF : "HEAD"
    "org.opencontainers.image.version"  = VERSION
    "org.opencontainers.image.created"  = BUILD_DATE
    "org.opencontainers.image.vendor"   = "Razzoozle"
    "org.opencontainers.image.url"      = "https://razzoozle.joelduss.xyz"
  }
}
