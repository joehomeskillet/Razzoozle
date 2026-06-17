# Research — Recap stickers · Local Firebase · Claude Code (2026-06-17)

Background research (3 CLI-agent threads → synthesis), cross-checked against the live tree. Decisive verdicts below; full agent output in the workflow transcript.

## (a) Post-game recap + shareable trophy stickers — ADOPT (with the right lib)
- **Image lib:** use the SVG-`foreignObject` approach (clones DOM, lets the browser render) — survives this app's **Tailwind v4 `oklch` palette**. `html2canvas` **CRASHES** on `oklch` ("unsupported color function"); `satori` is overkill (SVG-only + ~0.5–1 MB WASM rasterizer + manual font plumbing + no CSS grid). We use **`modern-screenshot`** (bubkoo's successor to `html-to-image`, same foreignObject approach; `html-to-image` is the validated fallback). Lazy dynamic-import on click (~25–30 KB out of the initial bundle).
- **Capture a STATIC node** — not the animated `SharePage`/podium (motion entrance delays up to ~0.8 s → `toBlob()` would capture a half-opacity frame).
- **Share waterfall (exact order):** L1 `navigator.canShare({files})` → `navigator.share({files})` with **NO text/title** (iOS WhatsApp drops the image if text+files combined); L2 desktop clipboard `navigator.clipboard.write([new ClipboardItem({'image/png': <Promise<Blob>>})])` — pass the **Promise synchronously** (Safari gesture quirk); L3 universal `<a download>` object-URL.
- **LAN gotcha (biggest practical risk):** `http://<lan-ip>` is **not a secure context** → Web Share + clipboard-image silently fail there. The **download fallback is the primary path** on bare-IP LAN. Only `http://localhost` and `https` get share.
- **Superlatives** map onto signals the server **already computes** (streak_3/5/10, speed_demon, climber, underdog) — derive recap titles from existing data, minimal new tracking.

## (b) Local Firebase as a persistence backend — SKIP
- Firebase **Local Emulator Suite is officially dev/test/CI only**; the real backend is **Google-Cloud-only**. It adds a Java JRE + manual import/export and has no self-host/offline production story → wrong for a LAN/offline game.
- **Supabase self-hosted** also SKIP (~12 Docker containers, 4 GB+ RAM — heavy for tens of LAN players). PocketBase is the lightest-with-UI option but duplicates the existing server.
- **Verified:** the repo has **zero DB dependency**; persistence is synchronous JSON files (`config.ts`) + `localStorage` (`rahoot_achievements`). Keep it (YAGNI).
- **When durable cross-game features are actually built** (persistent player profiles, accumulated achievements, cross-game leaderboards): use **`better-sqlite3`** in-process, scoped to NEW tables only — do not migrate the working per-quizz/result JSON.

## (c) Claude Code orchestration + Claude API for the AI question-gen tab — ADOPT
- Orchestration pattern (capability-matched subagents, invokable skills, scoped MCP, wave-based edit-only→orchestrator-commits) already matches this session's workflow — keep it.
- AI question-gen tab: default to a **Sonnet-class** model (reserve Opus for multi-step/long-context), **JSON-schema structured output** (question/options/correctIndex/difficulty→bronze/silver/gold/diamant) + a **separate semantic-validation pass**; prompt-cache the format/example prefix for bulk generation.
- **Honesty flag:** this thread leaned on model knowledge + undated vendor URLs for exact model names/prices and some Claude Code feature names — **re-verify against current official docs** before depending on specifics (use the `claude-api` skill).

## Applied this session
- Recap/stickers research feeds the recap/awards feature build (see `docs/superpowers/specs/` recap spec).
- Firebase verdict: no action — current persistence retained.
