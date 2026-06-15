# Self-Hosting

## Docker (recommended)
```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```
The app serves on `http://127.0.0.1:3011` (nginx + the socket server in one container, via supervisord). Runtime data lives in the `./config` volume, created + seeded on first boot. A `/healthz` endpoint + Docker `HEALTHCHECK` allow auto-heal.

## Reverse proxy (TLS + public hostname)
Put it behind your own proxy. Example with **Caddy**:
```caddy
quiz.example.com {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3011 {
        header_up X-Real-IP {remote}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

## Without Docker
```bash
pnpm install
pnpm build && pnpm start   # or: pnpm dev (web + socket, hot reload)
```
Requires Node 22+ and pnpm 11+.

## Beamer / kiosk
- `/display` renders the host presentation fullscreen for a projector/TV (vh-scaled type), pairable from a phone.
- `/satellite/<gameId>?satellite=true&token=<token>` is a control-free kiosk view (token auth, no manager password). An optional Raspberry-Pi satellite image is included.

## Useful environment variables
- `COMFYUI_URL` — ComfyUI endpoint for local AI image generation (default `http://host.docker.internal:8188`).
- `BRANDING_PATH` — where the seed brand assets live in the image (default `/app/branding`).
- `CONFIG_PATH` — config volume root (default `/app/config`).
