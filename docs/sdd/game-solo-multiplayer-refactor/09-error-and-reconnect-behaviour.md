# 09 — Error + Reconnect Behaviour (current state, Phase-0 inventory)

**Status:** phase-0 inventory (read-only). No product code touched.
**Reuse:** builds directly on `docs/design/p2b-reconnect-spec.md` (the reconnect/token
design — implemented, see §2) and `docs/sdd/game-solo-multiplayer-refactor/00-charter.md`
item 4 (class-mode join is a **new, unbuilt** feature — this explains most of the
"Unhandled" verdicts below for class-mode cases).

Scope note: Rust is the only backend (`rust/server/src`); the Node twin referenced by
`p2b-reconnect-spec.md` is gone. All file:line citations below are Rust/`packages/web`.

---

## 1. Per-case current behaviour

| # | Case | Current behaviour | Evidence | Verdict |
|---|------|--------------------|----------|---------|
| 1 | Invalid/expired game PIN | `player:join` requires exactly 6 chars, else rejected before any lookup; unknown/evicted code → same "not found" path (an evicted game is simply absent from `games_by_code`, so "expired" and "invalid" are indistinguishable to the client). | `socket/player/login.rs:9-52` (`register_join`: len-check `:18-22` → `errors:auth.invalidInviteCode`; not-found `:42-46` → `errors:game.notFound`); eviction removes the code index at `state/eviction.rs:100-119` (`remove_game`) | Server-enforced |
| 2 | Game already started / ended | `player:join` (room check) does **not** gate on phase at all — a started game still returns `SUCCESS_ROOM`. Only `player:login` (username submit) gates: `Finished` phase → rejected. A `RUNNING` (started, not finished) game has **no** default gate — a late joiner can still pick a username mid-game unless the host separately enabled the DB `join_locked` config. | `socket/player/login.rs:9-52` (no phase check); `:126-131` (`GamePhase::Finished` → `errors:game.gameEnded`); `:108-141` (`join_locked` read + `errors:game.locked`, only blocks **new** clientIds, `:136-141`) | Server-enforced (Finished + explicit lock only); "started" alone is by-design not an error |
| 3 | Class-mode active but no class | `selectedModes.klassen` is a bare boolean toggle at game-create with **no class-picker** anywhere in the UI, and no server check that a class is attached when `klassen=true`. The class-mode **join** flow itself (student picks name from roster + emoji-PIN) does not exist as a socket handler. | Toggle: `packages/web/src/features/manager/components/configurations/ConfigSelectQuizz.tsx:29,90-91`; validated/snapshotted server-side with no class-existence check: `rust/server/src/socket/game.rs:66-112,143-151`; no `klassen`/emoji-PIN handler under `socket/player/*.rs` | **Unhandled** (feature gap, charter item 4) |
| 4 | Class without students | Same as #3 — no join-time flow exists to reach this state; class CRUD (`ConfigKlassen.tsx`, `useClassManager.ts`) is admin-side roster management only, never consulted at join time. | `packages/web/src/features/manager/components/configurations/klassen/ConfigKlassen.tsx`, `useClassManager.ts` (roster CRUD only, no join linkage) | **Unhandled** |
| 5 | Student without emoji-PIN | No socket path consumes an emoji-PIN at live-game join. The only emoji-PIN consumer in the codebase is the **solo/homework assignment** HTTP flow (`POST .../validate-pin`), unrelated to joining a multiplayer game. | `rust/server/src/http/assignments.rs:178-213` (`handle_validate_pin`); PIN mint-only usage elsewhere is manager-side roster PIN assignment, `socket/manager/classes.rs:717-869` | **Unhandled** for live-game join |
| 6 | Wrong emoji-PIN | Same distinction as #5: wrong PIN is handled **only** in the solo/homework HTTP flow — `validate_student_pin` fails → HTTP 403 `"invalid"` + a failed-attempt is recorded. No equivalent exists for joining a live multiplayer game. | `http/assignments.rs:206-213` | Server-enforced (solo/homework only) / **Unhandled** (multiplayer join) |
| 7 | Too many attempts | Server-enforced, but scoped to two *unrelated* things, neither of which is "class-mode join attempts" (which doesn't exist): (a) solo/homework PIN brute-force guard — 3 failed attempts / 60s per `assignmentId+IP`, HTTP 429; (b) `game:create` — 10 games/hour per authenticated user. No rate-limit exists on `player:login` (username submission) attempts. | (a) `http/assignments.rs:184-193` + `state/rate_limit.rs:208-231` (`check_pin_rate`); (b) `socket/game.rs:49-54` (`check_game_create_rate`) | Server-enforced (narrow scope) / **Unhandled** for class-mode join |
| 8 | Student already joined | Generic (non-class) dedup: `add_player` rejects a `client_id` already present in `game.players` → `errors:game.playerAlreadyConnected`, **unless** that entry is a disconnected "ghost" row from an earlier lobby tab-close in `ShowRoom` phase, which is transparently displaced by ghost-takeover before the dup-check runs. Class-mode has no distinct identity concept (no roster-row binding), so a student re-picking their own name is only deduped if the underlying anonymous `client_id` matches. | `state/game.rs:340-354` (`add_player` dup-guard); `state/game.rs:318-338` (`take_over_ghost_slot`); call site `socket/player/login.rs:143-155` | Server-enforced (generic client_id dedup only) |
| 9 | Same person, two browsers | Different browser ⇒ different `localStorage`/cookie ⇒ a **fresh** `client_id` is minted (no cross-browser identity link exists for anonymous players). `add_player`'s dedup keys only on `client_id`, so two browsers become two independent players — both counted separately on the leaderboard. Nothing rejects or merges them. | `client_id` source: `features/game/contexts/socket-context.tsx:96-126` (`getClientId`: localStorage → cookie → mint uuid); dedup scope: `state/game.rs:352-354` | **Unhandled** (allowed by design — no cross-device identity yet; class-mode's emoji-PIN would be the natural fix but doesn't reach live-join, see #5) |
| 10 | Disconnect during join | Two sub-cases. (a) Transport drop **before** `player:login` completes: the socket was never added to `game.players`, so the phase-aware disconnect handler (`mark_player_disconnected`) finds nothing and silently no-ops — no error surfaced anywhere. (b) Client-side watchdog: if the `player:join` room-check response never arrives within 8s (e.g. the drop happens mid-flight), a client-only timeout fires a toast and re-enables the form. | (a) `socket/game.rs:181-222` (`register_disconnect`) → `state/eviction.rs:131-183` (`mark_player_disconnected`, phase/lobby-aware, `lobby_hard_remove=false` on transport drop, comment `:122-130`); (b) `features/game/components/join/Room.tsx:19-20,42-58` (`JOIN_TIMEOUT_MS=8000`, `toast.error(t("game:joinTimeout"))`) | Mixed: (a) silent no-op server-side (no error), (b) UI-only timeout backstop |
| 11 | Reconnect after join | Full token-based resume — see §2 below for the complete mechanism. | `socket/player/session.rs:163-325` (`register_reconnect`) | Server-enforced |
| 12 | Host changes class / disables class-mode | `selected_modes.klassen` is snapshotted **once**, at `game:create`, into the in-memory `Game` and never mutated again — no socket handler exists to toggle or clear it mid-lobby/mid-game. A host cannot change or disable class-mode on a live game; the only way is to end it and create a new one. | Snapshot: `socket/game.rs:143-151` (`g.selected_modes = SelectedModes{...}`); only other reads are consumers (`team_mode` in `socket/player/session.rs:118-121`), no writer found elsewhere in `socket/**` | **Unhandled** (no such capability exists) |
| 13 | Delayed server response | Two independent client-side watchdogs, both UI-only (no server "still working" ack): `player:join` room-check (8s, `Room.tsx`) and `player:reconnect` (8s, `$gameId.tsx`). `clock:ping`/`clock:pong` exists but is a low-latency **clock-sync** heartbeat gated behind per-game config, not a general join/login liveness signal. | `features/game/components/join/Room.tsx:19-20,42-58`; `pages/party/$gameId.tsx:44-46,54-70`; `socket/clock_ping.rs:31-45` (gate: `low_latency && clockSync`, not a generic ack) | UI-only |
| 14 | Changed student data | Since class-mode join doesn't bind a live player session to a roster row (#3-#6), there is no live-invalidation path to describe: editing a student in `ConfigKlassen` (`useClassManager.ts` `handleUpdateStudent`) has no effect on any in-progress join, because no in-progress class-mode join exists. | `features/manager/components/configurations/klassen/useClassManager.ts` (roster CRUD, no game-session linkage) | **Unhandled** / not applicable given #3-#6 |
| 15 | Long / identical names | Length: enforced both sides but with a **unit mismatch** — server checks UTF-8 **byte** length (`USERNAME_MIN_LEN=4`, `USERNAME_MAX_LEN=20`), client checks JS string length via `maxLength={20}` (UTF-16 code units). A name using multi-byte characters can pass the client's 20-char cap yet still fail the server's 20-byte cap, only surfacing as a post-submit toast. Identical names: **no uniqueness check at all** — `add_player` never compares usernames, so two players can share the exact same display name with no visual disambiguation on the leaderboard/roster. | Server length: `state/registry.rs:107-115` (`validate_username`) + `state/mod.rs:25-26` (`USERNAME_MIN_LEN=4`, `USERNAME_MAX_LEN=20`); client length: `features/game/components/join/Username.tsx:17,106` (`USERNAME_MAX_LENGTH=20`, `maxLength`); no uniqueness check anywhere in `add_player` (`state/game.rs:345-379`) | Server-enforced (length, byte/char mismatch caveat) / **Unhandled** (uniqueness) |
| 16 | Mobile keyboard covering input | No `visualViewport` handling or focus-triggered `scrollIntoView` exists anywhere in the join flow (`Username.tsx`, `Room.tsx`, `PinInput.tsx`). The only viewport-aware CSS in the codebase is `env(safe-area-inset-*)` for iOS notch/home-indicator (unrelated to on-screen-keyboard occlusion); the one `scrollIntoView` usage in the repo belongs to the separate homework-submission form, not the join flow. | Repo-wide check: zero `visualViewport` hits in `packages/web/src`; safe-area-only usages at `components/Toaster.tsx:7`, `components/ui/ActionFooter.tsx:38`, `features/game/components/GameWrapper/GameWrapper.tsx:329`, `features/game/components/solo/SoloShell.tsx:96`; unrelated `scrollIntoView` at `features/submission/SubmitPage/SubmitPage.tsx:122,128` | **Unhandled** (relies on default browser scroll-on-focus only) |
| 17 | Keyboard / screenreader | Mixed. `AnimatedErrorPage` (used by every error surface) has real a11y work: `aria-labelledby` region, heading auto-focus on mount, `aria-expanded`/`aria-controls` on the collapsible detail, ≥44px tap targets, focus-visible rings, reduced-motion variants. `PinInput` has per-digit `aria-label`, full Backspace/ArrowLeft/ArrowRight keyboard nav, `inputMode="numeric"` + `autoComplete="one-time-code"`. `Username`'s text field has a `sr-only` label and `aria-invalid`/`aria-describedby` — but **only** for the client-side "empty username" check; server-rejected usernames (`usernameTooShort`/`TooLong`/`playerAlreadyConnected`) arrive purely as a toast, never wired to the input's own error state, so a screen-reader user gets that failure only if the toast's live region is announced (react-hot-toast default, not customized). | `components/AnimatedErrorPage.tsx:244-253,270-273,298-300`; `components/PinInput.tsx:41-64,98-100`; `features/game/components/join/Username.tsx:88,109-110` (field-level a11y wired only to the local empty-check, not server errors); `components/Toaster.tsx` (library defaults, no custom `role`/`aria-live`) | Partial (explicit a11y for client-detected errors; server errors reach only via un-field-associated toast) |

---

## 2. Reconnect mechanism (implements `p2b-reconnect-spec.md`, evolved into `socket/player/session.rs` + `socket/manager/auth.rs`)

**Identity carried by the client** — two layers, both durable across reload:
- `client_id`: a `uuid v7` minted once, stored in **both** `localStorage["client_id"]` and a
  1-year cookie (whichever survives a private-tab/storage-clear wins), sent as `auth.clientId`
  in the socket.io handshake (not in any payload). `features/game/contexts/socket-context.tsx:96-126,183-196`.
- `player_token`: a 43-char URL-safe random string minted **once per player** by
  `add_player` on the first `player:login`, delivered as `game:successJoin {gameId, playerToken}`
  (an object, not a bare string) and persisted client-side to `localStorage["player_token:<gameId>"]`.
  `state/game.rs:356-368`; delivery `socket/player/login.rs:203-217`; persistence
  `features/game/components/join/Username.tsx:76-79`.
- The token is **never** serialized on any broadcast `Player` (leaderboard, `manager:newPlayer`,
  roster) — it lives only in the `Player.player_token` field the client never receives back
  except at mint-time, and only this player's own socket ever sees it via `successJoin`.

**Server-side resume (`player:reconnect`)** — `socket/player/session.rs:163-325`:
1. Client emits `{gameId, playerToken, lastServerSeq}` on socket `"connect"` (every reconnect,
   including a full page reload) — `pages/party/$gameId.tsx:54-62`.
2. Server looks up by `player_token` first (exact match required); falls back to `client_id`-only
   **only if** the client_id-matched player never had a token minted for them (legacy/pre-token
   path). If a client_id match already holds a token that doesn't equal the supplied one (or none
   was supplied), the match is discarded — anti-spoof, rejects a stolen/guessed client_id from
   hijacking a token-bearing session. `session.rs:196-219`.
3. On match: the player's socket id is swapped in-place (`game.players[pos].id = new socket_id`),
   `connected=true`, the `engine.players` mirror is re-synced, and points/streak are read straight
   from `engine.players` (never reset) — this is precisely the bug `p2b-reconnect-spec.md` fixed.
   `session.rs:221-267`.
4. Response: `player:successReconnect` carries `status` (current game-status snapshot),
   `player.{username,points}`, `currentQuestion.{current,total}`, and — low-latency mode only —
   `alreadyAnswered` (so the answer screen renders already-locked instead of fresh). The manager
   is separately notified via `manager:playerReconnected {id, oldId, username}`.
   `session.rs:283-308`.
5. On no match: `game:reset "errors:game.playerNotFound"` (not a toast-only `errorMessage` — the
   client treats `RESET` as "leave this route"). `session.rs:313-315`. Unknown `gameId` →
   `game:reset "errors:game.notFound"`. `session.rs:317-319`.

**Grace / eviction windows — no per-player timer.** A disconnected player's row is kept
indefinitely (`connected=false`) in both lobby (transport-drop only, not an intentional `leave`)
and started games — `state/eviction.rs:131-183` (`mark_player_disconnected`,
`lobby_hard_remove=false` on transport disconnect). The row is only ever purged as a side effect
of the **game** dying, via two independent reapers:
- `evict_stale_games` (`state/eviction.rs:28-97`): a stale game with **no connected players and
  no live manager socket** is removed outright; a `RUNNING` game whose manager socket is
  unresolvable is evicted immediately (no waiting for players) with a `game:reset
  "errors:game.managerDisconnected"` broadcast first.
- `cleanup_empty_games` (`state/empty_grace.rs:28-66`): once the game is manager-less, a grace
  timer keyed on the **game** (not the player) elapses — 5 min if the game already started,
  1 min if still in the lobby — then the game is reset+removed the same way.

So "how long can a player be offline and still reconnect with score intact" = however long the
*game* survives (manager-dependent), not a fixed player TTL.

**Manager reconnect is a separate, stricter path** (`socket/manager/auth.rs:44-173`,
`manager:reconnect`): requires a valid **DB session token** (`ctx.require_user()`, unauthenticated
→ `manager:unauthorized`), re-verifies ownership via `is_game_host` (user-id match + admin bypass
+ legacy fallback), pulls the game out of empty-grace (`reactivate_game`), and rejects if a
*different* manager socket is still genuinely connected (`errors:game.managerAlreadyConnected`) —
guards against two open manager tabs racing. On success it resends the full `players` snapshot
and current question/status, not just this manager's own state.

**What the UI shows during reconnect:**
- Transport-level: after **3 consecutive** failed connect/reconnect attempts, a persistent
  "Verbindung verloren — versuche neu zu verbinden" loading-toast appears; a success toast fires
  only if the loss toast was actually shown (no false "restored" flash on a clean first connect).
  `socket-context.tsx:210,234-286`. Socket.io itself retries forever
  (`reconnectionAttempts: Infinity`, capped/jittered backoff) — the threshold only governs the
  user-facing notice, not the retry loop. `socket-context.tsx:162-171`.
- Route-level: an 8s watchdog on `player:reconnect` bounces the player home with a
  `"Spiel nicht gefunden"` toast if `successReconnect` never arrives. `pages/party/$gameId.tsx:44-70`.
- Mobile-specific: iOS/Android freeze the WebSocket on screen-lock but keep it looking "open" to
  socket.io, so `connect` never re-fires past the ~10s ping interval; a `visibilitychange`/
  `pageshow`/`online` listener forces a hard `disconnect()`+`connect()` on resume when the tab was
  hidden > `STALE_AFTER_MS=10000`, specifically so the token re-emit in the `"connect"` handler
  actually runs. `socket-context.tsx:309-339` (comment references issue #77).

---

## 3. Server-side rules vs UI-only — summary matrix

| Case | Server-enforced | UI-only | Unhandled |
|---|:---:|:---:|:---:|
| Invalid/expired PIN | ✅ | | |
| Game started/ended | ✅ (Finished + explicit lock) | | (started-not-locked = allowed) |
| Class-mode active, no class | | | ✅ |
| Class without students | | | ✅ |
| Student without emoji-PIN (live join) | | | ✅ |
| Wrong emoji-PIN (live join) | | | ✅ |
| Wrong PIN (solo/homework flow) | ✅ | | |
| Too many attempts (solo PIN / game-create) | ✅ | | |
| Too many attempts (class-mode join) | | | ✅ |
| Student already joined (client_id dedup) | ✅ | | |
| Same person, two browsers | | | ✅ (allowed by design) |
| Disconnect before login completes | ✅ (silent no-op, no error) | | |
| Disconnect mid `player:join` | | ✅ (8s timeout) | |
| Reconnect after join | ✅ | | |
| Host changes/disables class-mode mid-game | | | ✅ |
| Delayed server response | | ✅ (8s watchdogs ×2) | |
| Changed student data mid-join | | | ✅ (no linkage exists) |
| Long username | ✅ (byte/char unit mismatch) | ✅ (client pre-check) | |
| Identical usernames | | | ✅ |
| Mobile keyboard covers input | | | ✅ |
| Keyboard/SR — error pages | | ✅ | |
| Keyboard/SR — server-rejected username | | ✅ (toast only, not field-associated) | |

**Reading this table for the wave-planning docs downstream:** every "Unhandled" row that
mentions class-mode is not a regression — it's the exact surface charter item 4 needs to build
(no prior implementation to preserve). The non-class "Unhandled" rows worth carrying into
`06-security-and-identity.md`/`11-implementation-plan.md` are: same-person-two-browsers (design
choice, revisit if class-mode identity binding should also dedup anonymous multi-tab joins),
identical-username collisions, and the mobile-keyboard-occlusion gap.
