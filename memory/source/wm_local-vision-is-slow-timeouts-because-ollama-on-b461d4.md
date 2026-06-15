---
name: wm_local-vision-is-slow-timeouts-because-ollama-on-b461d4
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,vision,ollama,arc-b50,xpu,openvino,host,image
created: 2026-06-14T14:12:07.281435+00:00
description: working-memory instant capture (quarantined until graduated)
---

Local VISION is slow/timeouts because Ollama on this host is CPU-only (ollama ps shows 100% CPU) — Ollama has no Intel Arc/XPU acceleration. The Arc B50 Pro IS used, but only by ComfyUI (PyTorch-XPU container yanwk/comfyui-boot:xpu) and the OpenVINO coder (:11436). FIX for fast local vision: serve a VLM (e.g. Qwen2.5-VL) via the OpenVINO GenAI stack on the Arc (like :11436) or an IPEX/SYCL build, then repoint @local-vision there. Until then @local-vision falls back to CPU (slow) or direct screenshot read; for one-off UX critiques a cloud vision model is faster.
