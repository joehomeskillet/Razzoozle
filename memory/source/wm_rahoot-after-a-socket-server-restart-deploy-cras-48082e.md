---
name: wm_rahoot-after-a-socket-server-restart-deploy-cras-48082e
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,rahoot,socket,auth,crash-recovery,pause
created: 2026-06-14T19:18:08.652378+00:00
description: working-memory instant capture (quarantined until graduated)
---

Rahoot: after a socket-server restart (deploy/crash-recovery), loggedClients (manager auth Set) is in-memory and is NOT restored, and MANAGER.RECONNECT does NOT repopulate it (client never re-sends MANAGER.AUTH on reconnect, only MANAGER.RECONNECT). Result: a reconnected/restored manager regains withGame controls (START/NEXT/SHOW_LEADERBOARD/SET_AUTO have NO auth) but ALL managerAuth.withAuth handlers silently emit MANAGER.UNAUTHORIZED and no-op: PAUSE_GAME/RESUME_GAME, quizz CRUD, theme-template SAVE, catalog, ai, media upload. Host clicks Pause and nothing happens, no error shown, until re-login at /manager. Discovered while live-simulating the pause/reconnect feature (game created by prior clientId 019e8cca, current 019ec169 -> getManagerGame mismatch ALSO reproduces the same UNAUTHORIZED). Fix candidate: on MANAGER.RECONNECT, when getManagerGame(gameId, clientId) resolves a game (clientId proves ownership), call manager.login(socket) to restore privileges (fixes pause + all CRUD at once). Files: packages/socket/src/handlers/game.ts (PAUSE_GAME/RESUME_GAME + MANAGER.RECONNECT), services/manager.ts (loggedClients), services/registry.ts getManagerGame/loadSnapshot.
