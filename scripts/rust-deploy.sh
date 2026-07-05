#!/usr/bin/env bash
# Gated deploy of the Rust game-server container: run the full real-game test suite
# FIRST; only build + (re)deploy the :3012 container if every test passes.
# "Immer gut testen vor neuem deploy."
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== GATE: rust real-game test suite (must pass before deploy) =="
bash scripts/rust-ci-test.sh

echo "== build container =="
docker build -f rust/Dockerfile -t razzoozle-rust:latest .

echo "== (re)deploy :3012 =="
docker rm -f razzoozle-rust 2>/dev/null || true
docker run -d --name razzoozle-rust -p 127.0.0.1:3012:3020 -e PORT=3020 razzoozle-rust:latest

sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3012/health || echo 000)
[[ "$code" == "200" ]] || { echo "FAIL: :3012 health=$code after deploy"; exit 1; }
echo "deployed + healthy on :3012 ✅"
