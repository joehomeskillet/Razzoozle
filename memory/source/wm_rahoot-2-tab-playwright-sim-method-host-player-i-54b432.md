---
name: wm_rahoot-2-tab-playwright-sim-method-host-player-i-54b432
type: pattern
author: tool
status: proposed
project: source
tags: working-memory,pattern,rahoot,playwright,e2e,reconnect,testing
created: 2026-06-14T19:18:26.945518+00:00
description: working-memory instant capture (quarantined until graduated)
---

Rahoot 2-tab Playwright sim method (host + player in ONE browser context): both tabs share localStorage -> same client_id -> manager & player COLLIDE (getManagerGame/getPlayerGame ambiguity) AND a full page-navigation away from /party/<id> fires PLAYER.LEAVE which REMOVES the player (so reload-based reconnect fails -> GAME.RESET -> home). To give the player a DISTINCT clientId: app reads localStorage.client_id ONCE at JS module load (socket-context.tsx). So toggle localStorage.setItem('client_id', X) RIGHT BEFORE each page LOAD: host loads with the manager id, player loads with a fresh uuid; an already-loaded tab keeps its captured id (socket.io auth is fixed at io() call time, survives auto-reconnect). Faithful reconnect = TRANSPORT blip, not reload: grab the socket via React fiber walk (find obj with emit+disconnect+'io'), call socket.io.engine.close() -> reconnection:true auto-reconnects in-place -> 'connect' handler re-emits PLAYER.RECONNECT -> SUCCESS_RECONNECT + host toast 'X is back online'. Verified pause/resume + reconnect-feedback live this way (2026-06-14).
