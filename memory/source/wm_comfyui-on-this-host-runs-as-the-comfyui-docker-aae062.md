---
name: wm_comfyui-on-this-host-runs-as-the-comfyui-docker-aae062
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,comfyui,docker,image-gen,rahoot,host
created: 2026-06-14T13:23:10.022299+00:00
description: working-memory instant capture (quarantined until graduated)
---

ComfyUI on this host runs as the 'comfyui' docker container (yanwk/comfyui-boot:xpu, Intel Arc B50). Its executor can FREEZE (HTTP API alive, returns 200, but jobs stuck in queue_pending, never queue_running; /interrupt no-op). Fix: 'docker restart comfyui' (~24s to boot, clears the stuck queue). Sandboxed image agents can't see/restart it (no process/systemd in their sandbox) — the orchestrator must restart it via host docker.
