# ---- BASE ----
FROM node:25-alpine AS base
RUN npm install -g pnpm

# ---- BUILDER ----
FROM base AS builder
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/common/package.json ./packages/common/
COPY packages/web/package.json ./packages/web/
COPY packages/socket/package.json ./packages/socket/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# ---- RUNNER ----
FROM alpine:3.23 AS runner

# libwebp-tools provides `cwebp` — the socket converts AI-generated PNGs to WebP
# before persisting them (2MB PNG -> ~150KB WebP), consistent with the project's
# webp-only image policy.
RUN apk add --no-cache nginx nodejs supervisor libwebp-tools

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf /etc/supervisord.conf

COPY --from=builder /app/packages/web/dist /app/web
COPY --from=builder /app/packages/socket/dist/index.cjs /app/socket/index.cjs

# AI image-gen blueprint (Z-Image-Turbo). Baked into the image so the socket has
# no host-filesystem dependency; node "6" positive prompt is set at runtime.
COPY docker/comfy-workflow.json /app/comfy-workflow.json

# img2img edit blueprint (Z-Image Omni reference-conditioning). Same loaders as
# the txt2img blueprint above; node "6" prompt + node "12" LoadImage are set at
# runtime. Baked in so the socket has no host-filesystem dependency.
COPY docker/comfy-img2img-workflow.json /app/comfy-img2img-workflow.json

# Health check the FULL chain: nginx (3000) proxying to the socket /healthz
# (3001). If either is down the container is marked unhealthy. busybox wget.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

EXPOSE 3000

# Sim mode default OFF. supervisord forwards this to the socket process via
# RAHOOT_SIM_MODE="%(ENV_RAHOOT_SIM_MODE)s"; `docker run -e RAHOOT_SIM_MODE=1`
# overrides it to enable scripted bot opponents. Prod (no -e) sees "0" => bots
# refused at runtime in game.addBots.
ENV RAHOOT_SIM_MODE=0

# AI image gen via the host's ComfyUI. The socket runs in this container, so it
# reaches ComfyUI through the docker host-gateway (compose maps
# host.docker.internal -> host-gateway). Workflow is the baked blueprint above.
# Defaults must exist so supervisord's %(ENV_*)s expansion never fails.
ENV COMFYUI_URL=http://host.docker.internal:8188
ENV COMFYUI_WORKFLOW=/app/comfy-workflow.json
ENV COMFYUI_IMG2IMG_WORKFLOW=/app/comfy-img2img-workflow.json

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
