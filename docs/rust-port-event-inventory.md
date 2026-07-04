# Rust-Port Event Inventory (Socket Protocol)

**Source Commit:** 136ebc5  
**Generated:** 2026-07-05  
**Accuracy Focus:** Machine-readable tables for Phase-1 Rust struct generation.

---

## Overview

The socket.io protocol is defined by three TypeScript sources:
- `packages/common/src/constants.ts` — Event name constants grouped by domain (GAME, PLAYER, MANAGER, etc.)
- `packages/common/src/types/game/socket.ts` — TypeScript event signatures (ServerToClientEvents, ClientToServerEvents)
- `packages/common/src/types/game/status.ts` — Status-machine state variants and per-state data payloads

**Key Insight:** Events are keyed by EVENTS constants, NOT string literals. The inventory below maps constant → wire name → payload type → handler (grep location in packages/socket/src/handlers).

---

## Part 1: Client → Server Events (ClientToServerEvents)

### GAME Domain

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| GAME.CREATE | game:create | `string` (quizzId) | — | No | game.ts |

### PLAYER Domain

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| PLAYER.JOIN | player:join | `string` (inviteCode) | — | No | game.ts |
| PLAYER.LOGIN | player:login | `MessageWithoutStatus<{username: string; avatar?: string; identifier?: string}>` | avatar.ts (avatar field), auth.ts (identifier field) | No | game.ts |
| PLAYER.RECONNECT | player:reconnect | `{gameId: string; lastServerSeq?: number}` | — | No | game.ts |
| PLAYER.LEAVE | player:leave | `{gameId: string}` | — | No | game.ts |
| PLAYER.SELECTED_ANSWER | player:selectedAnswer | `MessageWithoutStatus<{answerKey: number; answerKeys?: number[]; answerText?: string; clientMessageId?: string}>` | — | No (optional ack via PLAYER.ANSWER_ACK) | game.ts |
| PLAYER.SET_AVATAR | player:setAvatar | `unknown` | avatar.ts | No | game.ts |
| PLAYER.SELECT_TEAM | player:selectTeam | `{teamId: string}` | — | No | game.ts |

### CLOCK Domain (Low-Latency Mode)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| CLOCK.PING | clock:ping | `{clientSendMonoMs: number}` | — | No | game.ts |

### METRICS Domain (Low-Latency Mode)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| METRICS.REPORT | metrics:report | `MetricsReport` (discriminated: `{kind: "rtt"|"clockOffset"|"answerAck"; value: number}`) | — | No | game.ts |
| METRICS.SUBSCRIBE | metrics:subscribe | `MessageGameId` | — | No | game.ts |

### MANAGER Domain

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| MANAGER.AUTH | manager:auth | `string` (password) | auth.ts (managerPassword) | No | manager.ts |
| MANAGER.RECONNECT | manager:reconnect | `{gameId: string}` | — | No | manager.ts |
| MANAGER.LEAVE | manager:leave | `{gameId: string}` | — | No | manager.ts |
| MANAGER.KICK_PLAYER | manager:kickPlayer | `{gameId: string; playerId: string}` | — | No | manager.ts |
| MANAGER.START_GAME | manager:startGame | `MessageGameId` | — | No | manager.ts |
| MANAGER.SET_AUTO | manager:setAuto | `{gameId?: string; auto: boolean}` | — | No | manager.ts |
| MANAGER.ADD_BOTS | manager:addBots | `{gameId?: string; count: number}` | — | No | manager.ts (sim-mode gated) |
| MANAGER.ABORT_QUIZ | manager:abortQuiz | `MessageGameId` | — | No | manager.ts |
| MANAGER.NEXT_QUESTION | manager:nextQuestion | `MessageGameId` | — | No | manager.ts |
| MANAGER.SHOW_LEADERBOARD | manager:showLeaderboard | `MessageGameId` | — | No | manager.ts |
| MANAGER.SKIP_QUESTION | manager:skipQuestion | `MessageGameId` | — | No | manager.ts |
| MANAGER.ADJUST_TIMER | manager:adjustTimer | `{gameId?: string; deltaSeconds: number}` | — | No | manager.ts |
| MANAGER.REVEAL_ANSWER | manager:revealAnswer | `MessageGameId` | — | No | manager.ts |
| MANAGER.GET_CONFIG | manager:getConfig | (no payload) | — | No | manager.ts |
| MANAGER.LOGOUT | manager:logout | (no payload) | — | No | manager.ts |
| MANAGER.PAUSE_GAME | manager:pauseGame | `{gameId?: string}` | — | No | manager.ts |
| MANAGER.RESUME_GAME | manager:resumeGame | `{gameId?: string}` | — | No | manager.ts |
| MANAGER.SET_GAME_CONFIG | manager:setGameConfig | `{teamMode?: boolean; lowLatencyEnabled?: boolean; joinLocked?: boolean; randomizeAnswers?: boolean; scoringMode?: "speed"\|"accuracy"}` | game-config.ts | No | manager.ts |
| MANAGER.SET_ACHIEVEMENTS_CONFIG | manager:setAchievementsConfig | `{config: Record<string, {enabled?: boolean; name?: string; description?: string; threshold?: number}>}` | achievements.ts | No | manager.ts |
| MANAGER.GET_THEME | manager:getTheme | (no payload) | — | No | manager.ts |
| MANAGER.SET_THEME | manager:setTheme | `Theme` | theme.ts | No | manager.ts |
| MANAGER.SET_SKELETON_ASSET | manager:setSkeletonAsset | `{kind: "css"\|"js"; content: string}` | theme.ts | No | manager.ts |
| MANAGER.RESET_SKELETON | manager:resetSkeleton | (no payload) | — | No | manager.ts |
| MANAGER.UPLOAD_BACKGROUND | manager:uploadBackground | `{slot: ThemeSlot; dataUrl: string}` | theme.ts (ThemeSlot) | No | manager.ts |
| MANAGER.UPLOAD_SOUND | manager:uploadSound | `{slot: SoundSlot; dataUrl: string}` | theme.ts (SoundSlot) | No | manager.ts |

### MANAGER — Plugin System (Client → Server)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| MANAGER.PLUGIN_INSTALL | manager:pluginInstall | `{zipBase64: string}` | plugin.ts | No | manager.ts |
| MANAGER.PLUGIN_REMOVE | manager:pluginRemove | `{id: string}` | — | No | manager.ts |
| MANAGER.PLUGIN_SET_CONFIG | manager:pluginSetConfig | `{id: string; config: Record<string, unknown>}` | — | No | manager.ts |

### MANAGER — Submissions & Media (Client → Server, Public/Auth)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| MANAGER.SUBMIT_QUESTION | manager:submitQuestion | `unknown` | submission.ts | No | manager.ts |
| MANAGER.LIST_SUBMISSIONS | manager:listSubmissions | (no payload) | — | No | manager.ts |
| MANAGER.APPROVE_SUBMISSION | manager:approveSubmission | `{id: string; quizzId?: string; toCatalog?: boolean}` | submission.ts | No | manager.ts |
| MANAGER.REJECT_SUBMISSION | manager:rejectSubmission | `{id: string; reason?: string; category?: SubmissionCategory}` | submission.ts | No | manager.ts |
| MANAGER.EDIT_SUBMISSION | manager:editSubmission | `unknown` | submission.ts | No | manager.ts |
| MANAGER.GENERATE_IMAGE | manager:generateImage | `{prompt: string}` | media.ts (prompt clamped to PROMPT_MAX_LEN) | No | submitMedia.ts / imageGenThrottle.ts |
| MANAGER.EDIT_IMAGE | manager:editImage | `{baseUrl: string; prompt: string}` | media.ts | No | submitMedia.edit.ts |
| MANAGER.SUBMIT_UPLOAD_IMAGE | manager:submitUploadImage | `{filename: string; dataUrl: string}` | media.ts | No | submitMedia.upload.ts |
| MANAGER.ENHANCE_PROMPT | manager:enhancePrompt | `{prompt: string}` | media.ts | No | submitMedia.enhance.ts |

### MANAGER — Games Admin Panel

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| MANAGER.LIST_GAMES | manager:listGames | (no payload) | — | No | manager.ts |
| MANAGER.END_GAME | manager:endGame | `EndGamePayload` | — | No | manager.ts |

### THEME_TEMPLATE Domain (Auth-Gated)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| THEME_TEMPLATE.LIST | themeTemplate:list | (no payload) | — | No | theme-template.ts |
| THEME_TEMPLATE.SAVE | themeTemplate:save | `unknown` | theme.ts | No | theme-template.ts |
| THEME_TEMPLATE.DELETE | themeTemplate:delete | `{id: string}` | — | No | theme-template.ts |

### THEME_REVISION Domain (Auth-Gated) — WP-18

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| THEME_REVISION.LIST_REVISIONS | themeRevision:list | (no payload) | — | No | theme-revision.ts |
| THEME_REVISION.RESTORE_REVISION | themeRevision:restore | `{id: string}` | — | No | theme-revision.ts |

### QUIZZ Domain (Auth-Gated)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| QUIZZ.GET | quizz:get | `string` (quizzId) | — | No | quizz.ts |
| QUIZZ.SAVE | quizz:save | `unknown` | quizz.ts | No | quizz.ts |
| QUIZZ.UPDATE | quizz:update | `QuizzWithId` | quizz.ts | No | quizz.ts |
| QUIZZ.DELETE | quizz:delete | `string` (quizzId) | — | No | quizz.ts |
| QUIZZ.DUPLICATE | quizz:duplicate | `string` (quizzId) | — | No | quizz.ts |
| QUIZZ.SET_ARCHIVED | quizz:setArchived | `{id: string; archived: boolean}` | — | No | quizz.ts |

### CATALOG Domain (Auth-Gated Question Bank)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| CATALOG.LIST | catalog:list | (no payload) | — | No | catalog.ts |
| CATALOG.ADD | catalog:add | `unknown` | catalog.ts | No | catalog.ts |
| CATALOG.UPDATE | catalog:update | `unknown` | catalog.ts | No | catalog.ts |
| CATALOG.DELETE | catalog:delete | `{id: string}` | — | No | catalog.ts |

### MEDIA Domain (Auth-Gated Media Manager)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| MEDIA.LIST | media:list | (no payload) | — | No | media.ts |
| MEDIA.UPLOAD | media:upload | `unknown` | media.ts | No | media.ts |
| MEDIA.DELETE | media:delete | `{id: string}` | — | No | media.ts |

### AI Domain (Auth-Gated, Throttled Generation)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| AI.GET_SETTINGS | ai:getSettings | (no payload) | — | No | ai.ts |
| AI.SET_SETTINGS | ai:setSettings | `unknown` | ai.ts | No | ai.ts |
| AI.SET_KEY | ai:setKey | `unknown` | ai.ts | No | ai.ts |
| AI.TEST_PROVIDER | ai:testProvider | `unknown` | ai.ts | No | ai.ts |
| AI.GENERATE_QUESTION | ai:generateQuestion | `unknown` | ai.ts | No | ai.ts |
| AI.GENERATE_DISTRACTORS | ai:generateDistractors | `unknown` | ai.ts | No | ai.ts |
| AI.GENERATE_QUIZ | ai:generateQuiz | `unknown` | ai.ts | No | ai.ts |

### RESULTS Domain

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| RESULTS.GET | results:get | `string` (resultId) | — | No | results.ts |
| RESULTS.DELETE | results:delete | `string` (resultId) | — | No | results.ts |
| RESULTS.GET_SHARED | results:getShared | `string` (resultId, public) | — | No | results.ts |

### DISPLAY Domain (Satellite/Kiosk)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Ack? | Handler(s) |
|----------|-------------|------------------------|---------------|------|-----------|
| DISPLAY.REGISTER | display:register | `{name?: string}?` | — | No | display.ts |
| DISPLAY.PAIR | display:pair | `{code: string; managerPassword: string; gameId: string}` | — | No | display.ts |
| DISPLAY.DISCONNECT | display:disconnect | `{code: string}` | — | No | display.ts |
| DISPLAY.PING | display:ping | `{gameId: string; name?: string}` | — | No | display.ts |

---

## Part 2: Server → Client Events (ServerToClientEvents)

### System Events

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| (standard) | connect | (no payload) | — | socket.io built-in |
| (standard) | disconnect | (no payload) | — | socket.io built-in |

### GAME Domain (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| GAME.STATUS | game:status | `{name: Status; data: StatusDataMap[Status]}` | — | game.ts (state machine) |
| GAME.SUCCESS_ROOM | game:successRoom | `{gameId: string; requireIdentifier?: boolean}` | — | game.ts |
| GAME.SUCCESS_JOIN | game:successJoin | `string` (gameId) | — | game.ts |
| GAME.TOTAL_PLAYERS | game:totalPlayers | `number` (count) | — | game.ts |
| GAME.ERROR_MESSAGE | game:errorMessage | `string` (message) | — | game.ts |
| GAME.START_COOLDOWN | game:startCooldown | (no payload) | — | game.ts |
| GAME.COOLDOWN | game:cooldown | `number` (count) | — | game.ts |
| GAME.RESET | game:reset | `string` (message) | — | game.ts |
| GAME.UPDATE_QUESTION | game:updateQuestion | `{current: number; total: number}` | — | game.ts |
| GAME.PLAYER_ANSWER | game:playerAnswer | `number` (count) | — | game.ts |

### PLAYER Domain (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| PLAYER.SUCCESS_RECONNECT | player:successReconnect | `{gameId: string; status: {name: Status; data: StatusDataMap[Status]}; player: {username: string; points: number}; currentQuestion: GameUpdateQuestion; alreadyAnswered?: boolean}` | — | game.ts |
| PLAYER.UPDATE_LEADERBOARD | player:updateLeaderboard | `{leaderboard: Player[]}` | — | game.ts |
| PLAYER.ANSWER_ACK | player:answerAck | `AnswerAck` (optional low-latency ack) | — | game.ts |

### CLOCK Domain (Low-Latency Mode, Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| CLOCK.PONG | clock:pong | `{clientSendMonoMs: number; serverNowMs: number}` | — | game.ts |

### METRICS Domain (Low-Latency Mode, Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| METRICS.HEALTH | metrics:health | `MetricsHealthSnapshot` | — | game.ts |

### MANAGER Domain (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| MANAGER.SUCCESS_RECONNECT | manager:successReconnect | `{gameId: string; status: {name: Status; data: StatusDataMap[Status]}; players: Player[]; currentQuestion: GameUpdateQuestion}` | — | manager.ts |
| MANAGER.CONFIG | manager:config | `ManagerConfig` | — | manager.ts |
| MANAGER.GAME_CREATED | manager:gameCreated | `{gameId: string; inviteCode: string}` | — | manager.ts |
| MANAGER.STATUS_UPDATE | manager:statusUpdate | `{status: Status; data: StatusDataMap[Status]}` | — | manager.ts |
| MANAGER.NEW_PLAYER | manager:newPlayer | `Player` | — | manager.ts |
| MANAGER.REMOVE_PLAYER | manager:removePlayer | `string` (playerId) | — | manager.ts |
| MANAGER.ERROR_MESSAGE | manager:errorMessage | `string` (message) | — | manager.ts |
| MANAGER.PLAYER_KICKED | manager:playerKicked | `string` (playerId) | — | manager.ts |
| MANAGER.UNAUTHORIZED | manager:unauthorized | (no payload) | — | manager.ts |
| MANAGER.PLAYER_RECONNECTED | manager:playerReconnected | `{id: string; username: string}` | — | manager.ts |
| MANAGER.PLUGIN_CONFIG | manager:pluginConfig | `InstalledPlugin[]` | — | manager.ts |

### MANAGER — Theme Events (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| MANAGER.THEME | manager:theme | `Theme` | — | manager.ts |
| MANAGER.SET_THEME_SUCCESS | manager:setThemeSuccess | `Theme` | — | manager.ts |
| MANAGER.SET_SKELETON_ASSET_SUCCESS | manager:setSkeletonAssetSuccess | `{kind: "css"\|"js"}` | — | manager.ts |
| MANAGER.RESET_SKELETON_SUCCESS | manager:resetSkeletonSuccess | (no payload) | — | manager.ts |
| MANAGER.BACKGROUND_UPLOADED | manager:backgroundUploaded | `{slot: ThemeSlot; path: string}` | — | manager.ts |
| MANAGER.SOUND_UPLOADED | manager:soundUploaded | `{slot: SoundSlot; assetRef: string}` | — | manager.ts |
| MANAGER.THEME_ERROR | manager:themeError | `string` (message) | — | manager.ts |

### THEME_TEMPLATE Domain (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| THEME_TEMPLATE.DATA | themeTemplate:data | `ThemeTemplate[]` | — | theme-template.ts |
| THEME_TEMPLATE.SAVE_SUCCESS | themeTemplate:saveSuccess | (no payload) | — | theme-template.ts |
| THEME_TEMPLATE.ERROR | themeTemplate:error | `string` (message) | — | theme-template.ts |

### THEME_REVISION Domain (Server → Client) — WP-18

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| THEME_REVISION.DATA | themeRevision:data | `ThemeRevision[]` | — | theme-revision.ts |
| THEME_REVISION.RESTORE_SUCCESS | themeRevision:restoreSuccess | `Theme` | — | theme-revision.ts |
| THEME_REVISION.ERROR | themeRevision:error | `string` (message) | — | theme-revision.ts |

### QUIZZ Domain (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| QUIZZ.DATA | quizz:data | `QuizzWithId` | — | quizz.ts |
| QUIZZ.SAVE_SUCCESS | quizz:saveSuccess | `{id: string}` | — | quizz.ts |
| QUIZZ.UPDATE_SUCCESS | quizz:updateSuccess | `{id: string}` | — | quizz.ts |
| QUIZZ.ERROR | quizz:error | `string` (message) | — | quizz.ts |

### CATALOG Domain (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| CATALOG.DATA | catalog:data | `CatalogEntry[]` | — | catalog.ts |
| CATALOG.ADD_SUCCESS | catalog:addSuccess | (no payload) | — | catalog.ts |
| CATALOG.ERROR | catalog:error | `string` (message) | — | catalog.ts |

### MEDIA Domain (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| MEDIA.DATA | media:data | `MediaMeta[]` | — | media.ts |
| MEDIA.UPLOAD_SUCCESS | media:uploadSuccess | (no payload) | — | media.ts |
| MEDIA.ERROR | media:error | `string` (message) | — | media.ts |

### MANAGER — Submissions & Media (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| MANAGER.SUBMISSIONS_DATA | manager:submissionsData | `Submission[]` | — | manager.ts |
| MANAGER.SUBMISSION_ERROR | manager:submissionError | `string` (message) | — | manager.ts |
| MANAGER.SUBMIT_SUCCESS | manager:submitSuccess | (no payload) | — | manager.ts |
| MANAGER.IMAGE_GENERATED | manager:imageGenerated | `{url: string}` | — | submitMedia.ts / imageGenThrottle.ts |
| MANAGER.IMAGE_ERROR | manager:imageError | `string` (message) | — | submitMedia.ts |
| MANAGER.UPLOAD_IMAGE_SUCCESS | manager:uploadImageSuccess | `{url: string}` | — | submitMedia.upload.ts |
| MANAGER.PROMPT_ENHANCED | manager:promptEnhanced | `{prompt: string}` | — | submitMedia.enhance.ts |

### MANAGER — Games Admin Panel (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| MANAGER.GAMES_DATA | manager:gamesData | `GamesDataPayload` | — | manager.ts |

### AI Domain (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| AI.SETTINGS | ai:settings | `AISettingsPublic` (keyConfigured only, never secrets) | — | ai.ts |
| AI.SET_SETTINGS_SUCCESS | ai:setSettingsSuccess | (no payload) | — | ai.ts |
| AI.TEST_RESULT | ai:testResult | `AITestResult` | — | ai.ts |
| AI.QUESTION_GENERATED | ai:questionGenerated | `{question: Question}` | — | ai.ts |
| AI.DISTRACTORS_GENERATED | ai:distractorsGenerated | `{distractors: string[]}` | — | ai.ts |
| AI.QUIZ_GENERATED | ai:quizGenerated | `{quizz: Quizz}` | — | ai.ts |
| AI.ERROR | ai:error | `string` (message) | — | ai.ts |

### RESULTS Domain (Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| RESULTS.DATA | results:data | `GameResult` | — | results.ts |
| RESULTS.SHARED_DATA | results:sharedData | `SharedResult` (questions STRIPPED) | — | results.ts |

### DISPLAY Domain (Satellite/Kiosk, Server → Client)

| Constant | Wire String | Payload Shape (TS Type) | Zod Validator | Source Handler(s) |
|----------|-------------|------------------------|---------------|--------------------|
| DISPLAY.REGISTERED | display:registered | `{code: string}` | — | display.ts |
| DISPLAY.PAIR_SUCCESS | display:pairSuccess | `{gameId: string}` | — | display.ts |
| DISPLAY.PAIR_ERROR | display:pairError | `string` (message) | — | display.ts |
| DISPLAY.STATUS | display:status | `{displays: Array<{socketId: string; name: string; lastPingAt: number}>}` | — | display.ts |

---

## Part 3: Status Sub-Machine (StatusDataMap)

The `game:status` event (GAME.STATUS) carries a discriminated union of state variants. Each status is a key in StatusDataMap; the handler emits `{name: Status; data: StatusDataMap[Status]}`.

### Common States (Player + Manager)

| State | Data Shape | Notable Fields | Handler Emits | Port Hint |
|-------|-----------|-----------------|---------------|-----------|
| SHOW_ROOM | `{text: string; teamMode?: boolean}` | Lobby UI text | game.ts | Manager-specific variant also carries `inviteCode` |
| SHOW_START | `{time: number; subject: string}` | Quiz subject + countdown | game.ts | — |
| SHOW_PREPARED | `{totalAnswers: number; questionNumber: number}` | UI readiness flag | game.ts | — |
| SHOW_QUESTION | `{question: string; answers?: string[]; displayOrder?: number[]; media?: QuestionMedia; cooldown: number; submittedBy?: string}` | Full question + anti-cheat (no solutions) | game.ts | `displayOrder` for randomizeAnswers mode; `submittedBy` for public submissions |
| SELECT_ANSWER | `{question: string; answers?: string[]; media?: QuestionMedia; time: number; totalPlayer: number; type?: QuestionType; min?: number; max?: number; step?: number; unit?: string; shuffledChunks?: string[]; serverSeq?: number; serverNowMs?: number; questionStartAtServerMs?: number; answerDeadlineAtServerMs?: number; submittedBy?: string}` | Answer-submission window + timer anchors (low-latency mode) | game.ts | `shuffledChunks` for sentence-builder; `serverSeq`/timestamps for low-latency mode |
| SHOW_RESULT | `{correct: boolean; message: string; points: number; myPoints: number; rank: number; aheadOfMe: string\|null; streak?: number; streakBonus?: boolean; bonus?: boolean; firstCorrect?: boolean; poll?: boolean; achievements?: string[]; bonusPoints?: number; playerCount?: number; correctAnswer?: string; correctChunks?: string[]; autoAdvanceMs?: number; roundRecap?: RoundRecapAward[]; scoringMode?: "speed"\|"accuracy"}` | Per-player result card (achievements new) | game.ts | `achievements` post-round; `roundRecap` for per-round awards; `correctChunks` for sentence-builder |
| SHOW_LEADERBOARD | (Player: inherited CommonStatusDataMap) | — | — | — |
| SHOW_LEADERBOARD | (Manager: `{oldLeaderboard: Player[]; leaderboard: Player[]; teamStandings?: TeamStanding[]; autoAdvanceMs?: number; roundRecap?: RoundRecapAward[]}`) | Leaderboard delta + team standings | game.ts | Manager sees deltas + team mode standings |
| FINISHED | `{subject: string; top: Player[]; rank?: number; teamStandings?: TeamStanding[]; recap?: ManagerRecap\|PlayerRecap; autoMode?: boolean}` | Game-end summary | game.ts | `recap` carries WP-A awards; differs by recipient (manager sees full, player sees own) |
| WAIT | `{text: string; teamMode?: boolean}` | Generic interstitial | game.ts | — |
| PAUSED | `{reason?: string}` | Pause reason (optional) | game.ts | New state (Phase 4) |

### Manager-Only States

| State | Data Shape | Notable Fields | Handler Emits | Port Hint |
|-------|-----------|-----------------|---------------|-----------|
| SHOW_RESPONSES | `{question: string; responses: Record<number, number>; solutions: number[]; answers: string[]; media?: QuestionMedia; type?: QuestionType; correct?: number; unit?: string; averageGuess?: number; textResponses?: Record<string, number>; acceptedAnswers?: string[]; matchMode?: "exact"\|"normalized"\|"fuzzy"; correctChunks?: string[]; roundRecap?: RoundRecapAward[]}` | Answer analytics (never to players) | game.ts | `textResponses` + `matchMode` for type-answer; `correctChunks` for sentence-builder; `roundRecap` for awards |
| SHOW_ROUND_RECAP | `{roundRecap: RoundRecapAward[]}` | Per-round awards (full-screen) | game.ts | New interstitial (Phase 2); manager only |

**Key Insights for Rust Port:**
- All states except SHOW_RESPONSES, SHOW_ROUND_RECAP, and manager-specific SHOW_LEADERBOARD/SHOW_ROOM variants are sent to both players and managers.
- Status is the **state machine spine** — the game engine's output is a Status transition + its data payload.
- Low-latency mode adds optional timing fields (`serverSeq`, `serverNowMs`, `questionStartAtServerMs`, `answerDeadlineAtServerMs`) to SELECT_ANSWER.
- WP-A (achievements) adds `achievements?: string[]` to SHOW_RESULT and `roundRecap?: RoundRecapAward[]` to result states.

---

## Summary Counts

| Metric | Count |
|--------|-------|
| **Total Events (C2S + S2C)** | **145** |
| Client → Server (C2S) | 81 |
| Server → Client (S2C) | 62 |
| System (connect/disconnect) | 2 |
| **Status States** | **14** (11 common + 3 manager-only) |
| **Payload Types (Distinct)** | ~60 (excluding `unknown` catch-alls) |
| **Zod Validators Present** | ~12 files in packages/common/src/validators/ |
| **Handler Files** | 12 (game.ts, manager.ts, quizz.ts, catalog.ts, media.ts, ai.ts, results.ts, display.ts, theme-template.ts, theme-revision.ts, submitMedia*.ts) |
| **Low-Latency Mode Events** | 5 (CLOCK.PING/PONG, METRICS.REPORT/SUBSCRIBE/HEALTH) |

---

## Port-Order Hint (Phase 2 Parallelization)

### Group A: Core Game Engine (Highest Priority, Interdependent)

**Order:** game.ts → manager.ts → quizz.ts

1. **game.ts** (19K LoC)
   - Events: GAME.*, PLAYER.*, CLOCK.*, METRICS.*, Status machine (SHOW_ROOM through FINISHED)
   - Tests: `__tests__/` vitest suite
   - Rust Module: `src/game/state_machine.rs` (pure state transitions) + `src/game/handlers.rs` (socket bindings)
   - Dependencies: StatusDataMap (status.ts), GameUpdateQuestion, Player types

2. **manager.ts** (23K LoC)
   - Events: MANAGER.* (auth, theme, config, plugin system)
   - Tests: manager-specific tests
   - Rust Module: `src/manager/auth.rs`, `src/manager/config.rs`, `src/manager/plugin.rs`
   - Dependencies: game.ts (broadcast STATUS), ManagerConfig

3. **quizz.ts** (question/quiz CRUD)
   - Events: QUIZZ.*
   - Tests: CRUD tests
   - Rust Module: `src/quizz/mod.rs` (file I/O + persistence)
   - Dependencies: Quizz, QuizzWithId types

### Group B: Game Sub-Features (Parallel After A)

**Handlers:** results.ts, catalog.ts, media.ts (independent branches)

4. **results.ts** (game result analytics)
   - Events: RESULTS.* (get, delete, getShared)
   - Rust Module: `src/results/mod.rs`

5. **catalog.ts** (question bank)
   - Events: CATALOG.* (list, add, update, delete)
   - Rust Module: `src/catalog/mod.rs`

6. **media.ts** (background/sound/avatar uploads)
   - Events: MEDIA.* (list, upload, delete)
   - Rust Module: `src/media/mod.rs`

### Group C: AI & Generation (Parallel, IO-Bound)

**Handlers:** ai.ts, submitMedia*.ts, imageGenThrottle.ts (may be combined)

7. **ai.ts** (provider config + generation)
   - Events: AI.* (text gen, quiz gen, distractors)
   - Rust Module: `src/ai/mod.rs` (reqwest → ComfyUI/Claude/OpenAI)
   - Dependencies: AISettings, AITestResult

8. **submitMedia.ts** (image gen + enhancement)
   - Events: MANAGER.GENERATE_IMAGE, EDIT_IMAGE, ENHANCE_PROMPT, UPLOAD_IMAGE_SUCCESS
   - Rust Module: `src/media/image_gen.rs` (throttle + ComfyUI orchestration)

### Group D: Observability & Display (Parallel, Low Priority)

**Handlers:** display.ts, theme-template.ts, theme-revision.ts

9. **display.ts** (satellite display pairing + live status) — WP-15
   - Events: DISPLAY.*
   - Rust Module: `src/display/mod.rs`

10. **theme-template.ts** (preset theme templates)
    - Events: THEME_TEMPLATE.*
    - Rust Module: `src/theme/template.rs`

11. **theme-revision.ts** (theme undo ring) — WP-18
    - Events: THEME_REVISION.*
    - Rust Module: `src/theme/revision.rs`

### Group E: Satellite/Async (Optional, Low-Frequency)

12. **submitMedia.upload.ts**, **submitMedia.edit.ts**, **submitMedia.enhance.ts** (can be merged into one AI sub-module)
    - Consider merging into `src/media/` or `src/ai/` module to avoid fragmentation

---

## Port-Order Dependencies (DAG)

```
game.ts (core state machine)
  ├─→ manager.ts (auth + config broadcast)
  ├─→ results.ts (per-game results)
  ├─→ quizz.ts (question fetching)
  └─→ display.ts (big-screen sync)

manager.ts
  ├─→ ai.ts (generation)
  ├─→ submitMedia.ts (images)
  ├─→ theme-template.ts (preset UI)
  └─→ theme-revision.ts (undo ring)

catalog.ts (independent)
  └─→ media.ts (background/asset store)
```

**Parallelizable After game.ts:**
- manager.ts, quizz.ts (core dependencies)
- results.ts, catalog.ts, media.ts (parallel)

**After manager.ts:**
- ai.ts, submitMedia.ts, display.ts, theme-*.ts (parallel)

---

## Validator Mapping Reference

| Validator File | Events / Fields | Notes |
|----------------|-----------------|-------|
| auth.ts | MANAGER.AUTH, PLAYER.LOGIN (identifier field) | Manager password + identifier hash |
| avatar.ts | PLAYER.SET_AVATAR, PLAYER.LOGIN (avatar field) | SVG data-URI + WebP upload |
| theme.ts | MANAGER.SET_THEME, MANAGER.UPLOAD_BACKGROUND/SOUND, THEME_TEMPLATE.SAVE | ThemeSlot, SoundSlot, Theme shape |
| game-config.ts | MANAGER.SET_GAME_CONFIG | teamMode, lowLatencyEnabled, joinLocked, randomizeAnswers, scoringMode |
| achievements.ts | MANAGER.SET_ACHIEVEMENTS_CONFIG | Achievement config patch schema |
| media.ts | MANAGER.GENERATE_IMAGE, EDIT_IMAGE, ENHANCE_PROMPT, SUBMIT_UPLOAD_IMAGE | Prompt length (PROMPT_MAX_LEN=300), image size caps |
| submission.ts | MANAGER.SUBMIT_QUESTION, APPROVE_SUBMISSION, REJECT_SUBMISSION, EDIT_SUBMISSION | Question submission schema |
| quizz.ts | QUIZZ.SAVE, QUIZZ.UPDATE | Full Quizz shape with questions/answers/solutions |
| catalog.ts | CATALOG.ADD, CATALOG.UPDATE | CatalogEntry shape |
| plugin.ts | MANAGER.PLUGIN_INSTALL, PLUGIN_REMOVE, PLUGIN_SET_CONFIG | Base64 ZIP + config record |
| ai.ts | AI.SET_SETTINGS, AI.SET_KEY, AI.TEST_PROVIDER, AI.GENERATE_* | Provider kind + API key shape |
| assignment.ts | — | Possibly future use; not currently active in events |
| solo.ts | RESULTS.GET_SHARED (future solo play) | Solo mode result schema |
| client-events.ts | (telemetry, not socket events) | Client → HTTP POST /api/v1/client-events |

---

## Implementation Checklist for Phase 1

- [ ] **Extract Status enum + StatusDataMap** into Rust `enum GameStatus` with derive(Serialize, Deserialize, TS)
- [ ] **Create event payload structs** for each C2S and S2C event (81 C2S + 62 S2C = 143 structs minimum; dedup where possible)
- [ ] **Use ts-rs for TS code generation:** `cargo build --features ts-rs` → emit TS types to `../../packages/common/src/types/game/socket.rs` (overwrite or merge)
- [ ] **Implement zod → validator/garde equivalents** (12 validator files to port or wrap with serde)
- [ ] **Wire phase 0 golden-test events:** Verify byte-equivalence on PLAYER.JOIN, PLAYER.SELECTED_ANSWER, GAME.STATUS (SHOW_RESULT + SHOW_LEADERBOARD)
- [ ] **Handler stub registration:** Socket.io-based `on()` / `emit()` wrappers for each event group (game, manager, etc.)
- [ ] **Low-latency mode support:** Ensure CLOCK.PING/PONG and METRICS.* can be noop'd on server-side if `lowLatencyEnabled` is false

---

## Wire Protocol Notes (Safety & Edge Cases)

1. **Ack Semantics:** Only PLAYER.ANSWER_ACK is optional (low-latency mode). Most other C2S events expect no ack from the server (fire-and-forget semantics), but STATUS broadcasts are the server's acknowledgement.

2. **Binary Attachments:** None in the wire protocol. All payloads are JSON-serializable (avatar/image data is base64-wrapped in dataUrl strings, bounded by AVATAR_SVG_MAX_CHARS and MEDIA_UPLOAD_MAX_BYTES).

3. **Idempotency:** PLAYER.SELECTED_ANSWER includes `clientMessageId` (low-latency mode only) for dedup. Normal mode relies on server-side question/player state to detect duplicates.

4. **Reconnect Semantics:** Both PLAYER.RECONNECT and MANAGER.RECONNECT carry `gameId`. Server must restore state from the in-memory game registry (no persistence layer).

5. **Auth Gating:** Manager events check password during MANAGER.AUTH; subsequent events inherit the socket-level auth state. No per-event re-validation (performance).

6. **Theme Atomicity:** MANAGER.UPLOAD_BACKGROUND / MANAGER.UPLOAD_SOUND / MANAGER.SET_THEME are separate operations; no transaction, so a client crash mid-upload leaves a partial state. Server-side hygiene (not a protocol issue).

7. **Error Handling:** Generic `_ERROR` events (GAME.ERROR_MESSAGE, MANAGER.ERROR_MESSAGE, THEME_ERROR, SUBMISSION_ERROR, IMAGE_ERROR, AI.ERROR, etc.) carry human-readable i18n keys (strings like "errors:game.notFound"). Client must resolve these via i18n.

---

## Example ts-rs Export (Phase 1 Template)

```rust
// src/game/types.rs (conceptual)
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/common/src/types/game/socket.rs")]
pub struct GameStatusPayload {
    pub name: Status,
    pub data: StatusDataValue, // discriminated union of all Status variants
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "name", content = "data")]
pub enum StatusDataValue {
    ShowRoom { text: String, team_mode: Option<bool> },
    ShowStart { time: i32, subject: String },
    // ... all 14 states
}
```

Then build exports TS types usable by packages/web in real-time (no manual duplication).

---

## References & Linked Issues

- **Phase 0 Spike:** socketioxide Golden-Tests (wire-traffic capture)
- **Phase 1:** This inventory feeds struct generation
- **Phase 2:** vitest → Rust test migration (per game.ts, manager.ts, quizz.ts handlers)
- **WP-15:** Display pairing + heartbeat (DISPLAY.PING, DISPLAY.STATUS)
- **WP-18:** Theme revision ring (THEME_REVISION.*)
- **WP-A:** Achievements system (MANAGER.SET_ACHIEVEMENTS_CONFIG, SHOW_RESULT.achievements)
- **Low-Latency Mode (WP-??):** CLOCK.*, METRICS.*, PLAYER.ANSWER_ACK (optional ack)
