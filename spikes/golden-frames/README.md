# Golden-Frame Tests: Socket.io Protocol Recording

Record the Node socket-server's wire traffic for 3 core flows to establish a golden baseline that a future Rust server can be compared against frame-by-frame.

## Overview

This spike records **normalized socket.io frames** (engine.io/socket.io level) for three game flows:

1. **Flow 1**: Manager creates room + player joins
2. **Flow 2**: Full question round with one answer submission
3. **Flow 3**: Result/reveal + leaderboard

Each flow captures both manager and player sockets independently, producing two JSON frame logs per flow (6 total).

## Structure

```
spikes/golden-frames/
├── README.md (this file)
├── fixture-quiz.json (minimal 2-question choice quiz for testing)
├── frame-recorder.ts (core recording utility)
├── flow1-manager-create-player-join.ts (manager creates, player joins)
├── flow2-question-answer.ts (manager starts, player answers)
├── flow3-reveal-leaderboard.ts (results and leaderboard)
├── run-golden-tests.ts (orchestrator: start server, run flows)
├── output/ (generated frame logs, normalized)
│   ├── flow1-manager.json
│   ├── flow1-player.json
│   ├── flow2-manager.json
│   ├── flow2-player.json
│   ├── flow3-manager.json
│   └── flow3-player.json
└── compare.ts (utility to replay and diff Rust frames against these)
```

## Field Normalization

Before comparing frames, the following fields are stripped or masked:

- **IDs**: `gameId`, `clientId`, `socketId`, `playerId`, `inviteCode`, `sessionId`
- **Timestamps**: `createdAt`, `timestamp`, `heartbeat`
- **UUIDs**: Any field matching patterns like `*id`, `*Id`

Normalization is applied recursively through the entire frame payload (depth limit 20 to avoid circular references).

## Recording the Flows

### Recorded Run Command (Automated)

The fastest way to record all 6 frame logs is to run the orchestrator:

```bash
cd /nvmetank1/projects/Razzoozle/source
pnpm tsx spikes/golden-frames/run-golden-tests.ts --output-dir ./spikes/golden-frames/output --server-url http://localhost:3310
```

This script:
1. Uses the clean worktree at `/tmp/claude-0/.../golden-wt` (pinned to commit 136ebc5)
2. Starts the socket server on port 3310 (avoiding docker-occupied 3001/3101)
3. Copies `fixture-quiz.json` to the worktree's config directory
4. Orchestrates running all three flows sequentially
5. Stops the server
6. Saves normalized frames to `./spikes/golden-frames/output/`

### Manual Flow Recording (Recommended for Debugging)

**Terminal 1: Start the server from the clean worktree**
```bash
cd /tmp/claude-0/-nvmetank1-projects-Razzoozle/981f5eb0-4942-45ed-b56d-dbc5f396745a/scratchpad/golden-wt
pnpm install  # if node_modules missing
WS_PORT=3310 PORT=3310 pnpm dev:socket
# Wait for "listening on..." message
```

**Terminal 2: Copy fixture and run individual flows**
```bash
# Copy fixture quiz into server's config
cp /nvmetank1/projects/Razzoozle/source/spikes/golden-frames/fixture-quiz.json \
   /tmp/claude-0/-nvmetank1-projects-Razzoozle/981f5eb0-4942-45ed-b56d-dbc5f396745a/scratchpad/golden-wt/config/quizzes/golden-test-quiz.json

# From the main repo
cd /nvmetank1/projects/Razzoozle/source

# Run each flow (they must run in this order to capture gameId from Flow 1)
pnpm tsx spikes/golden-frames/flow1-manager-create-player-join.ts http://localhost:3310 ./spikes/golden-frames/output golden-test-quiz
pnpm tsx spikes/golden-frames/flow2-question-answer.ts http://localhost:3310 ./spikes/golden-frames/output <gameId-from-flow1>
pnpm tsx spikes/golden-frames/flow3-reveal-leaderboard.ts http://localhost:3310 ./spikes/golden-frames/output <gameId-from-flow1>
```

## Frame Format

Each frame log (e.g., `flow1-manager.json`) is a JSON object:

```json
{
  "recordedAt": "2026-07-05T10:30:00.000Z",
  "frameCount": 42,
  "frames": [
    {
      "direction": "send",
      "event": "game:create",
      "data": {
        "quizzId": "[NORMALIZED]"
      }
    },
    {
      "direction": "receive",
      "event": "manager:gameCreated",
      "data": {
        "gameId": "[NORMALIZED]",
        "inviteCode": "[NORMALIZED]"
      }
    }
  ]
}
```

### Frame Fields

- **direction**: `"send"` (client → server) or `"receive"` (server → client)
- **event**: Socket.io event name (e.g., `"game:create"`, `"manager:gameCreated"`)
- **data**: Payload (already normalized: random IDs/timestamps replaced with `"[NORMALIZED]"`)

## Flow Details

### Flow 1: Manager Create + Player Join

**Expected events:**
- Manager: `manager:auth` (send) → `manager:config` (receive)
- Manager: `game:create` (send) → `manager:gameCreated` (receive)
- Player: `player:join` (send) → `game:successRoom` (receive)
- Player: `player:login` (send) → `game:status` (receive)
- Manager: `manager:newPlayer` (receive)

### Flow 2: Question Round with Answer

**Expected events:**
- Manager: `manager:startGame` (send) → triggers game question phase
- Player: receives `game:updateQuestion` (receive)
- Player: `player:selectedAnswer` (send)
- Manager: `manager:revealAnswer` (send)
- All: receive various status updates during reveal

### Flow 3: Leaderboard

**Expected events:**
- Manager: `manager:auth` (send) → `manager:config` (receive)
- Manager: `manager:showLeaderboard` (send)
- All: receive leaderboard and results via `player:updateLeaderboard` (receive)

## Comparison Procedure (Rust Server)

When a Rust server implementation is created, use this procedure to verify wire compatibility:

### 1. Record Rust Server Frames

Start the Rust server and run the same flows, capturing frames to `output-rust/`:

```bash
# Terminal 1: Start Rust server
cargo run --release -- --port 3311

# Terminal 2: Record frames
cd /nvmetank1/projects/Razzoozle/source
pnpm tsx spikes/golden-frames/run-golden-tests.ts \
  --output-dir ./spikes/golden-frames/output-rust \
  --server-url http://localhost:3311
```

### 2. Compare Frame Sequences

Use the comparison utility (TBD `compare.ts`):

```bash
pnpm tsx spikes/golden-frames/compare.ts \
  --baseline spikes/golden-frames/output/flow1-manager.json \
  --rust spikes/golden-frames/output-rust/flow1-manager.json
```

### 3. Interpret Differences

Expected differences:
- **Order of events**: May vary if Rust batches or orders broadcasts differently
- **Extra events**: Rust may emit internal events not in Node (log this)
- **Missing events**: Indicates protocol gap — blocker for cutover

Critical invariants:
- **Event names** must match exactly
- **Payload structure** must match (after normalization)
- **Order of events from one sender** must match (broadcasts may batch differently)

## Fixture Quiz

`fixture-quiz.json` defines a minimal 2-question choice quiz:

```json
{
  "id": "golden-test-quiz",
  "type": "choice",
  "questions": [
    {
      "id": "q1",
      "content": "What is 2 + 2?",
      "answers": [
        { "id": "a2", "content": "4", "correct": true },
        // ...
      ],
      "time": 10
    }
  ]
}
```

This is just enough to exercise the question/answer/reveal cycle without being bulky.

## Troubleshooting

### "Connection timeout" during recording

- Ensure the socket server is running and accessible
- Check firewall rules for localhost:3310
- Verify `--server-url` matches the actual server address

### Missing events in output

- Check server logs for errors
- Ensure flows wait long enough for async responses
- Review `frame-recorder.ts` timing constants

### Normalized frames are too aggressive

- Edit `FIELDS_TO_NORMALIZE` in `frame-recorder.ts` to be more selective
- Re-run flows to regenerate frames

### Server won't start from worktree

- Verify the worktree path exists: `/tmp/claude-0/-nvmetank1-projects-Razzoozle/981f5eb0-4942-45ed-b56d-dbc5f396745a/scratchpad/golden-wt`
- Check that the worktree is at commit 136ebc5: `git -C <wt-path> log --oneline -1`
- Ensure `pnpm install` completes without errors in the worktree

## Integration with CI/CD

For future automated testing:

1. Add a workflow step that runs `run-golden-tests.ts` against the Node server
2. Commit normalized frames to `spikes/golden-frames/golden-frames-node.json` (consolidated)
3. When Rust server is ready, run against it and commit to `golden-frames-rust.json`
4. Add a CI check that diffs the two and flags breaking changes

## Notes for Rust Implementation

- This baseline assumes socket.io v4/v5 protocol (no breaking changes during port)
- Event names are constants in `@razzoozle/common/constants.ts` — keep them in sync
- Payload structures are defined in `@razzoozle/common/types/game/` — match these exactly
- Binary attachments (media uploads) are out of scope for golden-frame tests (use separate integration tests)
- Manager authentication requires the password from config; default is "PASSWORD" in dev
- The manager must authenticate before creating a game (see `manager:auth` event)
