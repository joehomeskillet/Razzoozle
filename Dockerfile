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

RUN apk add --no-cache nginx nodejs supervisor

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf /etc/supervisord.conf

COPY --from=builder /app/packages/web/dist /app/web
COPY --from=builder /app/packages/socket/dist/index.cjs /app/socket/index.cjs

# Health check the FULL chain: nginx (3000) proxying to the socket /healthz
# (3001). If either is down the container is marked unhealthy. busybox wget.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

EXPOSE 3000

# Sim mode default OFF. supervisord forwards this to the socket process via
# RAHOOT_SIM_MODE="%(ENV_RAHOOT_SIM_MODE)s"; `docker run -e RAHOOT_SIM_MODE=1`
# overrides it to enable scripted bot opponents. Prod (no -e) sees "0" => bots
# refused at runtime in game.addBots.
ENV RAHOOT_SIM_MODE=0

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
