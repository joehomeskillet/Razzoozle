STATUS — Cross-Vendor Architecture Review (FU-X Setup)

REVIEWERS:
[✓] AGY (Gemini 3.6 Flash via Antigravity CLI) — /tmp/garden-atmosphere-review-AGY.md
[✗] ORCA-paid (Claude Sonnet 5) — auth 401 (OPENROUTER_API_KEY); siehe Hinweis unten
[✓] Fused: AGY + Opus-runtime second-opinion — /tmp/garden-atmosphere-review-fused.md

LOCATIONS (alle gepusht zu origin + github):
- /tmp/garden-atmosphere-handover.md            (31 KB, 412 Zeilen — detail-Code-Übergabe)
- /tmp/garden-atmosphere-review-AGY.md           (17 KB, 134 Zeilen — AGY primary)
- /tmp/garden-atmosphere-review-fused.md         (10 KB, 223 Zeilen — fusioniert, prioritisiert)
- /nvmetank1/projects/Razzoozle/source/docs/handover/  (gleiche Dateien, commited)
- main HEAD: commit 73b7ae30a "docs(garden): handover + AGY + fused cross-vendor review"

CRITICAL FINDINGS (4):
- C1: Bezier-Teleportation in GardenButterflyController.ts:603-613 (Butterfly springt zum Segmentende statt zu interpolieren)
- C2: GPU-Texture-Leak in GardenEggController.ts:188-195 (Texturen werden bei destroy() nicht freigegeben)
- C3: prefersReducedMotion ignoriert in GardenWindLineController.ts:58-125 (Accessibility)
- C4: Globaler Butterfly-Bake-Cache wird durch einzelne Controller-Destroy invalidiert

IMPORTANT FINDINGS (3):
- I1: Egg-Gravity nutzt Frame-Units statt Sekunden — fps-abhängig
- I2: 2 stale Tests in attachGardenPixiApplication.quality.test.ts
- I3: Egg-Layer im ambient-Layer mounted — fliegt vor Bäumen statt dahinter

MINOR (5):
- M1: sky-life Layer-Doppelung (legacy vs neu)
- M2: garden-atmosphere.constants.ts 250+ Zeilen — Splittung möglich
- M3: Doc-Comments für Tuning-Faktoren fehlen
- M4: Empty-flowerAnchors Fallback undokumentiert
- M5: Wing-Swap-Sync pro Slot (keine Sub-Stagger)

TOP-3 PRIO-FOLLOW-UPS:
1. C1 + C2 + C3 in einem FU-X batch (≤ 200 LoC total, < 1h)
2. I1 + Test-Assertion-Update (< 30min)
3. C4 + I3 in einer separaten Runde (1-2h)

GESAMT-AUFWAND ZUM CLEAR: < 4 Stunden.

ORCA-PAID HINWEIS:
Der OPENROUTER_API_KEY in /root/.config/mini-swe-agent/.env ist gültig
für openrouter.ai direkt, aber NICHT für api.orcarouter.ai (orca-router).
opencode auth.json enthält nur minimax-m3-Token-Plan. Falls ORCA-paid
via orcarouter.ai genutzt werden soll: dedizierte ORCAROUTER_API_KEY in
~/.config/opencode/auth.json unter provider "orca-paid" hinterlegen,
dann mit `opencode run --pure --model orca-paid/anthropic/claude-sonnet-5`
erneut ausführen.

GitHub-Mirror: https://github.com/joehomeskillet/Razzoozle.git
Gitea-Origin:    https://git.joelduss.xyz/agent-claude/Razzoozle.git
