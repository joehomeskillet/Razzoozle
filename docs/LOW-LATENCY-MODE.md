# Low-Latency Mode

Status: design / opt-in feature. Default **OFF**. When disabled, behaviour is
byte-identical to the current Razzia build.

This document describes an **optional** mode that tightens timing fairness, gives
players instant local feedback, smooths reconnects, and adds observability — all
on top of the existing socket.io transport. It does **not** rewrite the game
engine. Every behaviour described here is gated behind one config flag
(`lowLatencyMode.enabled`), and every sub-feature has its own toggle.

---

## 1. What the mode does

When `lowLatencyMode.enabled = true`, the server and client additionally:

1. **Server-authoritative timing** — each `SELECT_ANSWER` payload carries server
   clock anchors (`serverSeq`, `serverNowMs`, `questionStartAtServerMs`,
   `answerDeadlineAtServerMs`). Scoring still uses the **server receive
   timestamp** (`Date.now()` at the answer handler), exactly as today. The
   anchors are for the **client UI only** (countdown that matches reality).
2. **Clock sync (UI only)** — the client measures its offset from the server
   clock via a tiny ping/pong, so the countdown bar is drawn against the real
   deadline instead of drifting from the 1 Hz `COOLDOWN` ticks.
3. **Instant local answer feedback** — the tapped button reacts immediately
   (visual + sound) before any server round-trip; the submit is locked after the
   first tap; the answer is sent once over the existing socket.
4. **Idempotent answers + optional ack** — the server already dedups by durable
   `clientId`; this mode additionally dedups by a per-tap `clientMessageId` and
   can reply with an `answer.ack` so the UI can show "sent / received".
5. **Preload of the next question's media** — the host (and, where the model
   already exposes it, the player) prefetches the upcoming image so the
   transition is instant.
6. **Throttled scoreboard / delta broadcasts** — scoreboard-style chatter is
   coalesced; `question.started` / `question.ended` transitions are **never**
   delayed.
7. **Resume on reconnect** — the client reconnects with `room + clientId + last
   serverSeq`; the server returns the current room state and, if the player
   already answered the live question, the client shows the answered state.
8. **Observability** — RTT, clock-offset, answer-ack latency, reconnect count,
   and rejected-answer counts (by reason) are tracked per room and optionally
   surfaced in a small host "Low Latency Health" widget.

## 2. What the mode does NOT guarantee

- **It is not a fairness oracle.** Scoring remains based on the time the answer
  **arrives at the server**, not the time the player physically tapped. A player
  on a slow uplink is still measured from their packet's arrival. Low-latency
  mode can apply at most a small, **configured** `maxLatencyCompensationMs`
  (default 150 ms, capped) — it never trusts a client-supplied timestamp for
  points. Client time is used **only** to render the countdown.
- **It does not make the network faster.** It removes UI drift and server-side
  jitter; it cannot remove the player's own RTT.
- **It does not change the game model or the scoring formula** when sub-flags are
  off. With `enabled = false` the wire format and the points are identical to
  today.
- **It does not add a hard dependency on any new transport.** See §3.
- **It does not weaken answer secrecy.** Preloading never sends a player
  anything the current model doesn't already send (today the player payload
  carries no solutions; see §8).

## 3. Why WebSocket / socket.io is the default (and WebTransport is not)

**socket.io over WebSocket stays the default transport.** Reasons:

- It is already the entire realtime layer of this app (`packages/socket/src/index.ts`,
  path `/ws`, with tuned `pingInterval`/`pingTimeout`, compression, and an
  Infinity-retry reconnect client in `socket-context.tsx`). It works in every
  browser the audience uses, behind every proxy, on flaky venue wifi.
- The reconnect/resume guarantee this mode needs is built on socket.io's
  reconnection + the durable `clientId` handshake that already exists.

**WebTransport is deliberately NOT the default**, and is not implemented here:

- **Browser compatibility.** WebTransport landed in Safari only from **26.4**;
  before that, every iOS/macOS Safari player would have no transport. For a
  party-quiz audience that is a non-starter as a default.
- **Datagram support is partial.** Even where WebTransport exists, **unreliable
  datagrams** (the part that would actually help latency) are only ~**80%**
  available across the field of devices, and behave differently per engine.
- **Operational complexity.** WebTransport needs HTTP/3 / QUIC termination, a
  valid certificate chain reachable by the QUIC stack, and a parallel server
  path — none of which the current nginx + socket.io deployment has. Adding it
  as a hard dependency would bloat the build and the ops surface for a feature
  most clients can't use.

**Forward-compatibility instead of commitment.** The architecture leaves room for
a *thin*, optional `RealtimeTransport` seam (a type-level interface — `send`,
`on`, `close`) so a WebTransport adapter *could* be slotted in later as an
experiment. That seam is **intentionally not shipped** in this build: nothing in
the codebase abstracts over socket.io today, and inventing the indirection now
would be dead weight. The only transport is the existing socket.io one; if and
when a WebTransport experiment is attempted, the interface gets added at that
point. This doc records the design intent, not an implemented abstraction.

## 4. Config shape

Extends `GameConfig` (loaded from `config/game.json` by
`packages/socket/src/services/config.ts`). Validated with **zod**, fully
defaulted and back-compatible — an existing `game.json` with only
`managerPassword` keeps working and gets `enabled = false`.

```jsonc
{
  "managerPassword": "…",
  "lowLatencyMode": {
    "enabled": false,                      // master switch; OFF = today's behaviour
    "clockSync": true,                     // §6 client offset estimation (UI only)
    "preloadNextQuestion": true,           // §8 prefetch next media
    "answerAck": true,                     // §7 emit answer.ack
    "scoreboardBroadcastThrottleMs": 100,  // §9 coalesce scoreboard chatter
    "maxLatencyCompensationMs": 150        // §5 server-side, capped, never client-authoritative
  }
}
```

`getGameConfig()` parses the file through a `gameConfigValidator` and applies
defaults. Sub-flags only take effect when `enabled` is true; with `enabled`
false the validator still fills defaults but no behaviour changes.

## 5. Server-authoritative timing model

Today (`round-manager.ts`):

- `this.startTime = Date.now()` is captured at the moment `SELECT_ANSWER` is
  broadcast (line 186).
- On answer receipt, `timeToPoint(this.startTime, question.time)` computes points
  from `Date.now()` **at the server** (`utils/game.ts`). This is already
  server-receive-based — the client never sends a timestamp.

Low-latency mode keeps that exactly and **adds anchors to the `SELECT_ANSWER`
payload** (only populated when `enabled`):

| Field                       | Meaning                                                |
|-----------------------------|--------------------------------------------------------|
| `serverSeq`                 | Monotonic per-game question sequence number            |
| `serverNowMs`               | `Date.now()` when the answer window opened             |
| `questionStartAtServerMs`   | `= serverNowMs` (window open instant)                  |
| `answerDeadlineAtServerMs`  | `= serverNowMs + question.time * 1000`                 |

The **client uses these only to draw the countdown** against the real deadline
(combined with the clock offset from §6), so the bar no longer drifts from the
1 Hz `COOLDOWN` ticks. **Scoring is untouched**: still `Date.now()` at server
receive.

`maxLatencyCompensationMs` (default 150) is an *optional, server-side, capped*
grace window. It is applied **only** to the late-answer gate: an answer that
arrives after `answerDeadlineAtServerMs` is still accepted as long as it arrives
within `answerDeadlineAtServerMs + clamp(maxLatencyCompensationMs)`; later than
that it is rejected as `too_late`. The value is read straight from server config,
clamped server-side to **`[0, 2000]` ms** (`Math.min(maxLatencyCompensationMs,
2000)`), and is **never** derived from any client-supplied number — so it cannot
become a scoring cheat vector. The points themselves are still computed from the
server receive time via `timeToPoint`; the compensation only widens the
acceptance window, it does not award extra points.

All new fields are additive and optional in `StatusDataMap["SELECT_ANSWER"]`, so
an old client (or `enabled = false`) simply ignores them. The client must read
them crash-safely (`?? Date.now()`, optional chaining) because the production
docker build does **not** run `tsc`.

## 6. Clock sync — UI only, not a cheat vector

New lightweight events `clock:ping` / `clock:pong`:

1. Client sends `clock:ping { clientSendMonoMs: performance.now() }`.
2. Server replies `clock:pong { clientSendMonoMs, serverNowMs: Date.now() }`
   (echoing the client value so the client can pair request/response).
3. Client computes
   `rtt = performance.now() - clientSendMonoMs`,
   `offsetMs = serverNowMs - (clientSendMonoMs + rtt / 2)`.
4. Repeat **5×**, take the **median** offset and **discard outliers** (drop the
   highest-RTT samples before taking the median).

The offset is used **only** to convert `answerDeadlineAtServerMs` into a local
deadline for the countdown UI. It is never sent back to the server and never
influences scoring — so it is not a cheat vector. Gated by
`lowLatencyMode.clockSync`.

## 7. Answer path — instant feedback, idempotency, ack

Current answer path:

- Client `Answers.tsx` emits `PLAYER.SELECTED_ANSWER { gameId, data: { answerKey } }`
  and plays a pop sound. Multiple-choice buttons are **not** locked after the
  first tap; only the slider locks via `submitted`.
- Server `round-manager.ts:selectAnswer()` keys answers by the durable
  `clientId` and is **already idempotent**: a second answer for the same
  `clientId` in the same question is a no-op (line 404). On accept it sends that
  player `STATUS.WAIT` ("waiting for answers").

Low-latency additions:

- **Instant local feedback:** the tapped button shows its pressed/selected state
  and plays the sound *synchronously on tap*, before any round-trip (already
  partly true — extend to lock the choice buttons too).
- **Lock submit after first click** for multiple-choice as well, so a player
  can't double-fire (the server already ignores the duplicate; this is UX +
  fewer packets).
- **`clientMessageId`** (a uuid generated per tap) added to the answer payload.
  The server dedups by `(clientId, questionId)` as today, and additionally
  treats a repeat `clientMessageId` as the same message — robust against a
  socket-level resend after a blip.
- **`answer.ack`** (gated by `answerAck`): server replies
  `{ accepted, reason, serverReceivedAtMs, clientMessageId }` where `reason ∈
  { ok | duplicate | too_late | invalid_question | invalid_answer }`.
- **No blind resend.** If no ack arrives within ~800 ms, the UI shows
  "wird gesendet…" and waits — it does **not** re-emit (the socket layer already
  handles redelivery, and the server is idempotent anyway).

## 8. Preload

Today `QuestionMedia.tsx` renders `<img>`/`<video>`/`<audio>` with no prefetch.

When `preloadNextQuestion` is on, the **host/display** (which knows the whole
quiz) prefetches the *next* question's image (e.g. an off-DOM `new Image().src`
or `<link rel=prefetch>`) during the current question so the swap is instant.
For **players**, prefetch only what the current model already sends — the player
payload today carries **no solutions** (`SELECT_ANSWER` deliberately omits
`solutions`/`correct`, see `status.ts` comment "must not leak to players"), so
preloading on the player side is limited to media the player will receive
anyway. **Answer secrecy is not weakened.** If a future model ever did ship
answers in the client payload, preloading would not make it worse — that is a
pre-existing exposure to document, not introduce.

## 9. Scoreboard / broadcast throttle

- **Deltas preferred:** scoreboard updates send only what changed where
  practical, rather than the full leaderboard.
- **Throttle:** scoreboard-style broadcasts (e.g. live answer counts via
  `GAME.PLAYER_ANSWER`, leaderboard refreshes) are coalesced to at most one per
  `scoreboardBroadcastThrottleMs` (default 100 ms) per room.
- **Never throttle phase transitions:** `SHOW_QUESTION` / `SELECT_ANSWER`
  (question started) and `SHOW_RESULT` / `SHOW_RESPONSES` (question ended) are
  emitted immediately, never delayed by the throttle.

## 10. Reconnect / resume

The durable identity already exists: `clientId` is stored in localStorage **and**
a 1-year cookie (`socket-context.tsx`), sent in the handshake `auth`, and the
server keys players by it (`findByClientId`). On `connect`, the player page
already emits `PLAYER.RECONNECT { gameId }` and the server replies
`PLAYER.SUCCESS_RECONNECT` with the last status + current question
(`game/index.ts:reconnectPlayer`).

Low-latency mode extends the reconnect payload with **`lastServerSeq`** (and
reuses the existing `clientId` + `gameId`), and the server's resume response adds
**`alreadyAnswered: boolean`** for the live question (derived from
`playersAnswers` keyed by `clientId`). If the player already answered, the client
renders the answered/`WAIT` state instead of re-enabling the buttons. No new
identity mechanism is introduced — `clientId` is reused.

## 11. Observability

Metrics are aggregated **per room** in a small in-memory module
(`packages/socket/src/services/metrics.ts`) — bounded ring buffers plus a
`p50`/`p95` getter, no timers and no new datastore. Three additive events carry
them (`EVENTS.METRICS`, inert in normal mode):

- `metrics:report` (client → server) — the client measures the latency-style
  numbers itself and reports a `{ kind, value }` sample (`kind ∈ rtt |
  clockOffset | answerAck`). The server folds each finite value into the room's
  buffers (`game.recordMetric`). This keeps clocks honest: the *server* still
  never trusts client values for scoring, but for **pure observability** it is
  fine to let the client report the RTT/offset it already computed in §6.
- `metrics:subscribe` (host → server) — the manager opts in to receive snapshots
  for its own game.
- `metrics:health` (server → host) — a throttled, compact `p50`/`p95` snapshot.
  **Only the manager socket** ever receives it; players never see metrics.

| Metric                          | Source                                                              |
|---------------------------------|--------------------------------------------------------------------|
| RTT p50 / p95                   | client-measured from `clock:ping`→`clock:pong`, reported via `metrics:report` |
| Clock-offset p50 / p95          | client-computed offset (§6), reported via `metrics:report`         |
| Answer-ack p50 / p95            | client-measured tap→`answer.ack` latency, reported via `metrics:report` |
| Reconnect count                 | server-side, incremented in `reconnectPlayer` (`metrics.recordReconnect`) |
| Rejected-answer count by reason | server-side, tallied at the reject site (`metrics.recordRejected`) by `AnswerAckReason ≠ ok` |

The snapshot is optionally rendered in a host/admin **"Low Latency Health"**
widget (`packages/web/src/features/game/components/LowLatencyHealth.tsx`). With
`enabled = false` nothing is recorded, no host push happens, and the snapshot is
all-`null` (the widget shows "—"). The two server-side counters (reconnect,
rejected) are authoritative; the three latency distributions are best-effort,
client-reported and for diagnostics only — never an input to scoring.

---

## 12. New socket events (appendix)

All additive; in normal mode no side subscribes/emits, so the wire is unchanged.

| Event (`EVENTS.…`)            | Constant value          | Direction        | Payload (all guarded)                                              |
|-------------------------------|-------------------------|------------------|-------------------------------------------------------------------|
| `CLOCK.PING`                  | `clock:ping`            | client → server  | `{ clientSendMonoMs }`                                             |
| `CLOCK.PONG`                  | `clock:pong`            | server → client  | `{ clientSendMonoMs, serverNowMs }`                               |
| `PLAYER.ANSWER_ACK`           | `player:answerAck`      | server → client  | `{ accepted, reason, serverReceivedAtMs, clientMessageId? }`      |
| `METRICS.REPORT`              | `metrics:report`        | client → server  | `{ kind: rtt\|clockOffset\|answerAck, value }`                    |
| `METRICS.SUBSCRIBE`           | `metrics:subscribe`     | host → server    | — (opt-in to health)                                              |
| `METRICS.HEALTH`              | `metrics:health`        | server → host    | `MetricsHealthSnapshot` (p50/p95 + counts)                        |

`reason` is `AnswerAckReason = ok | duplicate | too_late | invalid_question |
invalid_answer`. `PLAYER.SELECTED_ANSWER` gains an optional `clientMessageId`;
`PLAYER.RECONNECT` gains an optional `lastServerSeq`; `PLAYER.SUCCESS_RECONNECT`
gains an optional `alreadyAnswered`; `StatusDataMap["SELECT_ANSWER"]` gains the
four optional anchors from §5.

---

## Build & safety notes

- **Default OFF, byte-identical normal mode.** Every new branch checks the flag;
  with `enabled = false` the payloads, scoring, broadcast timing, and answer/UX
  behaviour are exactly today's. This is asserted by the flag-off scoring tests.
- **No tsc in the docker build.** The build runs vite/esbuild only — **type**
  errors won't fail it, but **runtime** crashes (`.map`/`.includes`/`.length` on
  `undefined`) will. Every new optional field the client reads is crash-guarded
  (`?? default`, optional chaining): `serverNowMs`, `answerDeadlineAtServerMs`,
  `alreadyAnswered`, `clientMessageId`, and the ack fields.
- **Lockfile.** Adding `vitest` changed `pnpm-lock.yaml`; the docker builder
  installs `--frozen-lockfile`. The lockfile was regenerated and re-verified —
  `pnpm install --frozen-lockfile` passes (incl. the supply-chain policy) and
  `pnpm -r run build` builds every package. `vitest` is pinned to **4.1.7** to
  satisfy the 7-day `minimumReleaseAge` gate; the diff is purely the
  vitest + `socket.io-client` ecosystem, no churn on unrelated deps.
- **Tests use Vitest, never Jest** (jest previously broke the pnpm lockfile).
  `pnpm --filter @razzia/socket test` runs the suite: server-receive scoring
  with fake timers, duplicate dedup by `clientId` **and** `clientMessageId`,
  just-before/grace/just-after-deadline, the 2000 ms compensation clamp, the
  flag-off byte-identical path, clock-offset median-of-5 + outlier rejection,
  and a real socket.io integration test (idempotency + ack reasons over the
  wire). See `packages/socket/src/services/game/__tests__/`.
</content>
</invoke>
