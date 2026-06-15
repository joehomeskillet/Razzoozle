---
name: wm_rahoot-public-submit-rate-limit-submissionrateli-5e9d6d
type: finding
author: tool
status: proposed
project: source
tags: working-memory,finding,rahoot,security,ratelimit
created: 2026-06-15T01:18:35.396511+00:00
description: working-memory instant capture (quarantined until graduated)
---

rahoot public /submit rate-limit (submissionRateLimit.ts) is keyed by socket.id + GC'd on disconnect → reconnect resets the quota (queue/GPU spam). Durable clientId (getClientId(socket), already used for manager auth) should key it instead. Backlog: agent-claude/rahoot#21. GENERATE_IMAGE is intentionally unauth on /submit so the same bypass hits the GPU.
