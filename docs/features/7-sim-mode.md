# Feature #7 — Simulationsmodus (scripted bot opponents)

> Implementation contract. Gitea issue #7 + its decision-comment are the source of truth; this spec
> operationalizes them against the real code (file:line grounded) and folds in a two-reviewer design
> gate (arch-second-opinion + codex). Build order: #7 first (test aid for #6/#5).

## Goal

A **sim mode** that lets the host add **scripted bot opponents** to a game — to test histograms,
leaderboard, slider evaluation, and the beamer "audience" feel without 80 real phones.

**Two variants (both decided in the issue):**
1. **Server-side bots** (manager button) — virtual players (`isBot:true`, no real socket) that
   auto-answer each question on a script. They have **server-side** access to `solutions`/`correct`,
   so they answer correctly on purpose at a configurable rate. For UX / leaderboard / histogram /
   beamer testing.
2. **CLI load script** — spawns N **real** socket.io clients (random answers — clients never receive
   solutions, anti-cheat). For transport / load / CI. Extends the existing 600-player probe.

## Hard constraints (do not regress)

- **Prod-safe gating, two independent layers:**
  - **Server = runtime env gate.** `game.addBots` refuses unless `process.env.RAHOOT_SIM_MODE === "1"`
    (default off). NOTE: this is a runtime read — the BotManager code **is** in the prod bundle (esbuild
    does not `define` this var); the *ability* is gated, not the code path. Do not try to tree-shake it.
  - **Web = build-time tree-shake.** The `SimControl` button only renders under `import.meta.env.DEV`,
    which Vite replaces with `false` in `vite build` → Rollup strips the branch. No bot UI ships to prod.
- **Crash-recovery untouched — bots NEVER persist.** Filter `isBot` in **three** places (see §2d), not
  one: `PlayerManager.toSnapshot()`, `RoundManager.toSnapshot()` (leaderboard + questionsHistory), and
  the saved-result path. (A reviewer trace proved that filtering only the player list still resurrects
  bot ghosts via the round leaderboard on restore.) A crash during a sim loses the bots — fine for a
  test aid; the prod path stays clean.
- **Reconnect / lobby-grace untouched:** bots keep `connected:true`; never `setPlayerDisconnected` a
  bot; the 45s lobby grace timer never arms for a bot (no transport disconnect ever fires for them).
- **Anti-cheat untouched:** server-bots reuse the **real** `selectAnswer` path (real dedup, real
  scoring, real deadline, real early-advance). No solution leaks to any client. CLI bots answer
  randomly (they have no solutions).
- **No id collisions:** bot `id` and `clientId` are namespaced `bot:<nanoid>` — can never collide with
  a real socket.io id or a browser clientId.
- **No mid-window injection (scope cut):** bots may be added **only outside an open answer window**
  (lobby `SHOW_ROOM` or between questions at the leaderboard). `addBots` rejects during `SELECT_ANSWER`.
  This eliminates the remaining-time race that would otherwise contaminate the next question.

---

## 1. Contract layer — `packages/common`

### 1a. `Player` gains `isBot` — `src/types/game/index.ts`
```ts
interface Player {
  id: string; clientId: string; connected: boolean
  username: string; points: number; streak: number
  isBot?: boolean   // NEW — true for sim bots; absent/false for humans
}
```
(`...player` spreads already in scoring/snapshot carry `isBot` along, so it's available to filter on.)

### 1b. New manager event — flat payload (matches the `SET_AUTO` precedent, not the `{data}` envelope)
`src/constants.ts` → `EVENTS.MANAGER`: `ADD_BOTS: "manager:addBots"`.
`src/types/game/socket.ts` → `ClientToServerEvents`:
```ts
[EVENTS.MANAGER.ADD_BOTS](_message: { gameId?: string; count: number }): void
```
`count` is **top-level** (like `SET_AUTO`'s `{ gameId, auto }` at handlers/game.ts:125), NOT nested
under `data`. No server→client event needed — bots surface via the existing `MANAGER.NEW_PLAYER` +
`GAME.TOTAL_PLAYERS` (bots look like real players, per the issue).

### 1c. Bot tuning constants — `src/constants.ts`
```ts
export const BOT = {
  MAX_PER_REQUEST: 50,   // addBots count cap (validator)
  MAX_TOTAL: 200,        // cumulative ceiling per game (repeated clicks stack)
  CORRECT_RATE: 0.6,     // default P(answer correct)
  MIN_DELAY_MS: 1200,    // floor so a fast human can still claim first-correct
  MAX_DELAY_MS: 8000,    // cap; also clamped to question.time*1000*0.85
} as const
```

---

## 2. Socket layer — `packages/socket`

### 2a. `addBotsValidator` — `src/services/validators.ts`
```ts
import { BOT } from "@razzoozle/common/constants"
export const addBotsValidator = z.object({ count: z.number().int().min(1).max(BOT.MAX_PER_REQUEST) })
```

### 2b. `BotManager` — new `src/services/game/bot-manager.ts`
Owns bot identity + the per-question answer scheduler. Constructed by `Game`, given a `submit(stub,
answerId)` callback (→ `game.selectAnswer`) and read access to the live player roster.

- `addBots(count): Player[]` — build `count` bot `Player` records: `{ id:"bot:"+nanoid(),
  clientId:"bot:"+nanoid(), connected:true, isBot:true, username:<unique>, points:0, streak:0 }`.
  Usernames from `BOT_NAMES` (§2e), deduped against **all** current usernames (humans + bots); suffix a
  number if exhausted. Each bot gets a stable private "speed" trait (varies its delay).
- `onQuestionOpen(question)` — for each bot, `setTimeout(delay)` → submit one answer via the stub:
  - `delay = Math.max(BOT.MIN_DELAY_MS, Math.min(BOT.MAX_DELAY_MS, question.time*1000*0.85))`, varied
    per-bot by its speed trait (the `Math.max` guards against range inversion on short questions).
  - `answerId` by `question.type`:
    - **choice/boolean:** `solutions` is `number[] | undefined` at runtime (the validator already
      transforms scalar→array at quizz.ts:23 — **do not** re-normalize, **do not** assume scalar).
      With P=`CORRECT_RATE` pick a random element of `solutions`; else a random index in
      `[0, answers.length)` not in `solutions` (fallback any index if all are solutions).
    - **slider:** `correct`/`min`/`max`/`step` are server-side. With P=`CORRECT_RATE` pick
      `clamp(correct + jitter, min, max)` with `|jitter| <= max(step ?? 0, (max-min)*SLIDER_TOLERANCE_FRACTION)`
      (lands inside tolerance); else a uniform random value in `[min,max]` outside tolerance.
    - **poll:** random index (no correctness).
  - Track each bot's pending timer in a `Map<clientId, Timeout>`.
- `cancelPending()` — clear **all** outstanding timers; idempotent. `cancelPending(clientId)` — clear
  one bot's timer (used on kick).
- `count()`, `isBot(clientId)`, `removeAll()` helpers.

No `removeBot` removal path — bot removal goes through the **existing** `kickPlayer` (§2d) so roster
count + leaderboard stay consistent; `Game.kickPlayer` additionally calls
`botManager.cancelPending(clientId)` to clear that bot's answer timer.

### 2c. Synthetic socket stub (how bots submit)
The BotManager submits by calling the **existing** `game.selectAnswer(stub, answerId)`
(index.ts:437 → round.selectAnswer:560). `selectAnswer` reads the socket only at: `handshake.auth.clientId`
(571), `socket.id` is passed to `opts.send(socket.id, STATUS.WAIT…)` (668, routed via `io.to(id)`, a
no-op room for a bot), and `socket.to(gameId).emit(...)` (677, normal-mode count). LL mode adds
`socket.emit(ANSWER_ACK)` (716). The stub mirrors `helpers.makeSocket` exactly:
```ts
const stub = { id: bot.id, handshake: { auth: { clientId: bot.clientId } },
  emit: () => true, to: () => ({ emit: () => true }) } as unknown as Socket
```
Confirmed sufficient: no `socket.rooms`/`data`/`disconnect`/`join` is read in `selectAnswer`. This
reuses real dedup + `timeToPoint` + LL deadline + early-advance — **no logic duplication**. A bot
integration test (§4.2) exercises the full path so any future field-deref breaks a test.

### 2d. `PlayerManager` — bot insert + snapshot filter — `src/services/game/player-manager.ts`
- `addBot(player: Player): void` — push a pre-built bot directly (bypasses socket-dependent `join()`),
  emit `MANAGER.NEW_PLAYER` for that bot. **Do not** broadcast the count per bot — `Game.addBots`
  calls `broadcastCount()` **once** after inserting the whole batch (avoid N count emits for N bots).
- `toSnapshot()` — **filter bots:** `this.players.filter(p => !p.isBot).map(...)`.
- `kick()` (unchanged) — confirmed socket-less for bots: it uses `io.in(id).socketsLeave` +
  `io.to(id).emit` on the bot's empty room (no `Socket` deref). Safe.

### 2e. Bot name pool — new `src/services/game/bot-names.ts`
`export const BOT_NAMES: string[]` — ~40 plausible Swiss-German first names (Lena, Jonas, Mara, Elias,
Noah, Mia, …). No runtime demo-data call.

### 2f. `RoundManager` — lifecycle hooks + answer-window flag + snapshot filter — `round-manager.ts`
- Track `private answerWindowOpen = false`; set `true` right after the `STATUS.SELECT_ANSWER`
  broadcast (~line 333-348, after `startTime` is set at 303), set `false` at the **top** of
  `showResults()` (359) and in `abortQuestion()` (752). Expose `isAnswerWindowOpen(): boolean`.
- Add optional opts callbacks (passed through from `Game`):
  - `onQuestionOpen?(question)` — invoke right after the `SELECT_ANSWER` broadcast (window now open).
  - `onAnswerWindowClose?()` — invoke at **every** point the window closes: (1) the early-advance
    branch where `cooldown.abort()` is called (685-687), (2) `showResults()` top (359), (3)
    `abortQuestion()` (752). `Game` wires this to `botManager.cancelPending()`. (Critical: `cooldown.abort()`
    only resolves on the next ~1s interval tick — cooldown-timer.ts:23-40 — so cancelling only in
    `showResults` leaves a ~1s window for a late bot timer to fire. Cancel at the abort branch too.)
- `toSnapshot()` (176-190) — **filter bots from the leaderboard**: `leaderboard:
  this.leaderboard.filter(p => !p.isBot)`. Also drop bot entries from `questionsHistory[].playerAnswers`
  (they store `username`; filter the bot names) so saved results don't carry ghosts.
- `onGameFinished`/`saveResult` path (764) — the `GameResult` is built from `this.leaderboard`; with the
  leaderboard filtered above it is already bot-free. Verify the saved result contains no `bot:`/bot
  usernames.

### 2g. `Game` integration — `src/services/game/index.ts`
- Construct a `BotManager` in the constructor; pass `selectAnswer` as the submit callback + the round's
  `onQuestionOpen`/`onAnswerWindowClose` hooks wired to `botManager`.
- `addBots(socket: Socket, count: number): void`:
  - **Sim-mode gate:** `if (process.env.RAHOOT_SIM_MODE !== "1") { socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, "errors:manager.simModeDisabled"); return }`.
  - **Ownership gate:** `if (socket.id !== this._manager.id) return` (same pattern as round.start:232).
  - **Window gate:** `if (this.round.isAnswerWindowOpen()) { socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, "errors:manager.simWindowOpen"); return }`.
  - **Ceiling:** clamp so total bots ≤ `BOT.MAX_TOTAL`.
  - Build bots via `botManager.addBots(n)`, `playerManager.addBot(bot)` each, then `playerManager.broadcastCount()` once.
- `kickPlayer(...)` — after the existing removal, call `botManager.cancelPending(clientId)` if it was a bot.
- **Dispose hook:** there is no `Game.dispose()`; the only teardown is `disposeMetrics()` (550), called
  from `registry.removeGame()`. Add `this.botManager.cancelPending()` to `disposeMetrics()` (or a small
  `dispose()` that `disposeMetrics` delegates to) so removing a game cancels all pending bot timers (no
  leaked `setTimeout` retaining a dead `Game`).

### 2h. Handler — `src/handlers/game.ts` (flat destructure, like `SET_AUTO`)
```ts
socket.on(EVENTS.MANAGER.ADD_BOTS, ({ gameId, count }) =>
  withGame(gameId, socket, (game) => {
    const parsed = addBotsValidator.safeParse({ count })
    if (!parsed.success) return
    game.addBots(socket, parsed.data.count)
  }),
)
```
No `?? msg` hybrid. Register next to `START_GAME`/`SET_AUTO`.

### 2i. Env plumbing — `Dockerfile` + `docker/supervisord.conf` (the real gate location)
The socket process is launched by supervisord, whose `[program:socket]` line **replaces** the child env
with only the listed keys — so `docker run -e RAHOOT_SIM_MODE=1` alone never reaches `node`.
- `docker/supervisord.conf:18` — extend the line to forward the var (with a default so the
  `%(ENV_…)s` interpolation never crashes supervisord when unset):
  ```
  environment=NODE_ENV="production",CONFIG_PATH="/app/config",RAHOOT_SIM_MODE="%(ENV_RAHOOT_SIM_MODE)s"
  ```
- `Dockerfile` — add a default before the supervisord CMD: `ENV RAHOOT_SIM_MODE=0`.
Now `docker run -e RAHOOT_SIM_MODE=1 …` reaches `process.env.RAHOOT_SIM_MODE` in the socket process;
prod (`docker compose` without the var) sees `"0"` → bots refused.

### 2j. CLI load script — `packages/socket/scripts/load-sim.ts`
Standalone tsx/node script using the present `socket.io-client` devDependency; connect pattern from
`__tests__/clock-sync.test.ts:239-261`. Per client: connect `auth:{clientId:"load:"+nanoid()}`,
`transports:["websocket"]`; `PLAYER.JOIN(code)` → on `GAME.SUCCESS_ROOM` `PLAYER.LOGIN({gameId,
data:{username}})`; on each `STATUS.SELECT_ANSWER` schedule a random-answer `PLAYER.SELECTED_ANSWER`
after a random delay. Args `--url --code -n --correct`. Document: CLI bots are inherently random (no
solutions on the client). Add `"load-sim": "tsx scripts/load-sim.ts"` to `packages/socket/package.json`.
Needs **no** server sim-mode flag (ordinary clients).

---

## 3. Web layer — `packages/web`

### 3a. `SimControl` (dev-gated header popover) — `src/features/manager/components/SimControl.tsx`
Follow the `DisplayControl.tsx` popover pattern (`useManagerStore` for `gameId`, `useSocket` for emit,
`useOnClickOutside`, local `useState` for open + count). Button "Bots (Sim)" → popover: numeric count
input + "Add" → `socket.emit(EVENTS.MANAGER.ADD_BOTS, { gameId, count })`. **Disable the Add button when
`status?.name === STATUS.SELECT_ANSWER`** (mirror the server window-gate) with a hint to add bots in the
lobby/between questions.

Mount in `packages/web/src/features/game/components/GameWrapper.tsx` (NOTE: `game/`, not `manager/`),
next to `<DisplayControl />` at the `{manager && controls && …}` row:
```tsx
{manager && controls && import.meta.env.DEV && <SimControl />}
```
Available in all manager states (lobby + between questions); tree-shaken from prod. Bots arrive via the
existing `MANAGER.NEW_PLAYER` listener → roster/count update for free.

### 3b. i18n — `de/manager.json` + `de/errors.json` (+ en/es/fr/it for parity)
`manager:sim.button` ("Bots (Sim)"), `manager:sim.count` ("Anzahl"), `manager:sim.add` ("Hinzufügen"),
`manager:sim.windowHint` ("Bots in der Lobby oder zwischen Fragen hinzufügen"); errors
`errors:manager.simModeDisabled`, `errors:manager.simWindowOpen`. German tone: "du", warm, no "!".
(The 4 non-German copies are dead weight in a DEV-only feature but kept for repo i18n hygiene.)

### 3c. No bot badge — the roster renders bots as ordinary players (the issue wants them to look real).

---

## 4. Tests (`packages/socket`, vitest) — use `__tests__/helpers.ts`; `registry.cleanup()` in before/after

1. **Answer selection** — `CORRECT_RATE=1`: choice/boolean ∈ `solutions`; slider within tolerance of
   `correct`; `CORRECT_RATE=0`: non-solution / out-of-tolerance; poll = valid index.
2. **Bots flow through scoring** — buildRound + bots + openQuestion (fake timers): `playersAnswers`
   contains bot answers, `timeToPoint` points, a correct bot gains points/streak. (Exercises the stub
   end-to-end.)
3. **Early-advance includes bots** — all real+bot answered → `cooldown.abort()` fires.
4. **`cancelPending` on early-advance** — humans answer → abort → assert NO bot timer fires afterward
   (no late `selectAnswer`, no duplicate-reject noise). Covers the ~1s cooldown-tick gap.
5. **Snapshot excludes bots — BOTH lists** — humans+bots, run a full `showResults`, then
   `game.toSnapshot().players` AND `snapshot.round.leaderboard` AND `questionsHistory[].playerAnswers`
   contain ZERO bots; `fromSnapshot` yields no bot ghosts. (Anti-regression for crash-recovery.)
6. **Gates** — `addBots` with `RAHOOT_SIM_MODE` unset → `simModeDisabled`, adds nothing; non-manager
   socket → no-op; during an open window → `simWindowOpen`, adds nothing.
7. **Handler payload** — `ADD_BOTS` with the real flat `{ gameId, count }` adds bots; malformed count → rejected.

Gate: `corepack pnpm -r run types` clean (common/socket/web); `pnpm --filter socket test` green;
`pnpm --filter web build` green. (oxlint ~45-error socket baseline is out of scope.)

## 5. E2E (after unit green)

```
docker build -t razzoozle:e2e -f Dockerfile .
docker run -d --name rahoot-e2e -e RAHOOT_SIM_MODE=1 -p 127.0.0.1:3120:3000 \
  -v ./config:/app/config razzoozle:e2e
```
**First assert the env actually reached the process** (e.g. add N bots and confirm they appear, or log
the flag at boot) BEFORE asserting histogram — a broken supervisord line would otherwise fail at a
misleading step. Then: manager creates a game, adds N bots in the lobby, starts the quiz → bots in
roster/count; histogram fills across choice/boolean/slider; leaderboard ranks bots; a mid-game snapshot
(`config/state/registry.json`) contains **no** `bot:` clientIds and **no** bot usernames in the round
leaderboard. Also run `load-sim.ts` against the same game for a transport smoke.

## 6. Out of scope (explicit)

- Adding bots during an open answer window (add them in the lobby or between questions).
- AFK/never-answering bots (every bot always answers within the window).
- Per-bot UI tuning of correctness/personality (single global `count`; tuning via constants).
- Persisting bots across a crash (deliberately excluded — three-place snapshot filter).
- Hiding bots from the player-visible count (bots are intentionally visible — audience sim).

## 7. Dispatch plan (orchestrator)

1. **common** (1a–1c) — land + typecheck first (socket+web depend on it).
2. **socket** (2a–2j) → `gemini-pro`, against common + this spec. Verify types + test.
3. **web** (3a–3c) → `codex-gpt5`, against common + this spec. Verify types + build.
4. **review** whole diff (reviewer agent) + **E2E** (§5). Commit, PR, close #7.
