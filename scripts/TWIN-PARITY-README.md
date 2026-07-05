# Twin-Parity Test Harness

This harness boots Node and Rust backend instances concurrently (or individually), runs identical scripted flows against both, records normalized socket.io frames, and produces a parity report showing whether both backends handle the same operations identically.

## Scripts

- **twin-parity.sh** — Main orchestrator (bash). Boots backends, runs flows, generates report.
- **twin-parity-orchestrator.cjs** — Flow runner (Node.js). Handles actual flow execution, frame recording, and diff.

## Usage

```bash
# Full parity test (Node + Rust)
scripts/twin-parity.sh

# Test only Node backend
scripts/twin-parity.sh --target node

# Test only Rust backend
scripts/twin-parity.sh --target rust

# Custom output location
scripts/twin-parity.sh --output /tmp/my-report.json

# Custom quiz
scripts/twin-parity.sh --quiz-id my-quiz-id

# Verbose logging
VERBOSE=1 scripts/twin-parity.sh

# Combined options
scripts/twin-parity.sh --target both --output report.json --quiz-id custom-quiz --verbose
```

## Flows

The harness runs 3 flows per backend:

1. **Flow 1: Manager Auth + Game Create**
   - Manager connects and authenticates
   - Manager creates a game
   - Records all manager socket.io frames

2. **Flow 2: Player Join + Login**
   - Player connects to the server
   - Player joins the game with the invite code from Flow 1
   - Player logs in with username and avatar
   - Records all player socket.io frames

3. **Flow 3: Full Game Lifecycle**
   - Manager creates game
   - Player joins and logs in
   - Manager starts the game
   - Player answers questions (auto-answers first option)
   - Manager reveals answers and shows leaderboard
   - Records full game progression

## Frame Normalization

Before comparison, frames are normalized to remove session-specific data:

**Normalized fields** (replaced with `[NORMALIZED]`):
- `gameId`, `clientId`, `socketId`, `playerId`
- `inviteCode`, `sessionId`, `nonce`, `id`
- `createdAt`, `timestamp`, `heartbeat`, `connectionId`
- `playerToken`, `token`
- Numeric strings matching `/^[0-9]{5,6}$/` (invite codes)

**Preserved fields** (compared as-is):
- Event names and sequences
- Critical payloads (answers, leaderboard structure, scoring)
- State transitions

## Output

The harness generates `parity-report.json` with structure:

```json
{
  "recordedAt": "2026-07-06T...",
  "summary": {
    "critical_pass": true,
    "divergences": 0,
    "warnings": 0,
    "failures": 0
  },
  "divergences": [
    // array of divergence objects (if any)
  ],
  "flows": {
    "flow1": { "node": {...}, "rust": {...} },
    "flow3": { "node": {...}, "rust": {...} }
  }
}
```

Exit codes:
- **0** — critical_pass=true (all flows matched expected behavior)
- **1** — critical_pass=false (divergences detected) or error

## Recorded Frames

Frame files are saved to `tmp/parity-output/{node,rust}/flowN-{role}.json`:

```
tmp/parity-output/
├── node/
│   ├── flow1-manager.json
│   ├── flow2-player.json
│   ├── flow3-manager-full.json
│   └── flow3-player-full.json
├── rust/
│   ├── flow1-manager.json
│   ├── flow2-player.json
│   ├── flow3-manager-full.json
│   └── flow3-player-full.json
├── node.boot.log
├── rust.boot.log
└── parity-report.json
```

Each frame file contains:

```json
{
  "recordedAt": "ISO timestamp",
  "frameCount": 42,
  "frames": [
    {
      "direction": "send|receive",
      "event": "event-name",
      "data": { /* normalized event data */ }
    }
  ]
}
```

## Ports

- **Node backend**: Port 3310 (default `WS_PORT=3310`, can override via env)
- **Rust backend**: Port 3311 (default `PORT=3311`, can override via env)

Both backends use the same `CONFIG_PATH` (defaults to `./config`).

## Configuration

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_URL` | `http://127.0.0.1:3310` | Node backend URL |
| `RUST_URL` | `http://127.0.0.1:3311` | Rust backend URL |
| `OUTPUT_DIR` | `./tmp/parity-output` | Output directory |
| `QUIZ_ID` | `example-qu--GZoYZWM` | Quiz ID to test with |
| `VERBOSE` | `0` | Enable detailed logging (set to `1`) |
| `CONFIG_PATH` | `./config` | Config directory for both backends |

## CI Integration

### GitHub Actions example:

```yaml
- name: Run parity harness
  run: |
    scripts/twin-parity.sh --target both --output parity-report.json
    
- name: Check parity report
  if: failure()
  run: |
    jq . parity-report.json
    exit 1
```

### Local development:

```bash
# Quick sanity check (both backends)
pnpm verify:parity   # (if alias added to package.json)

# Detailed inspection
scripts/twin-parity.sh --verbose
cat tmp/parity-output/parity-report.json
```

## Limitations & Future

- **Current**: Offline comparison (record both, diff locally)
- **Future**: Live concurrent monitoring (both backends running simultaneously in real-time)
- **Flows**: Currently 3 flows; expand to 7 as per parity-plan.md (reconnect, solo mode, theme customization, achievements)
- **Diff algorithm**: Structural (event names + frame counts); does not yet verify critical field values (e.g., leaderboard scoring correctness)

## Troubleshooting

### Port already in use

```bash
# Kill processes on ports 3310 and 3311
lsof -ti:3310 | xargs kill -9
lsof -ti:3311 | xargs kill -9
```

### Node backend fails to start

Check `tmp/parity-output/node.boot.log` for details. Common causes:
- `socket.io-client` not installed: `pnpm add socket.io-client`
- Config files missing: verify `./config/quizz/*.json` exist
- Port in use: see above

### Rust backend fails to start

Check `tmp/parity-output/rust.boot.log`. Common causes:
- Binary not built: `cargo build --release -p razzoozle-server`
- Old PORT variable: `unset PORT RUST_CI_PORT`
- Config path wrong: verify `CONFIG_PATH` points to `./config`

### Frames don't match

Inspect individual frame files in `tmp/parity-output/{node,rust}/`. Use `jq` to filter:

```bash
jq '.frames[] | select(.event == "game:status")' \
  tmp/parity-output/node/flow3-manager-full.json
```

Look for:
- Missing or extra events
- Different event order
- Unexpected data payload structure

## Notes for Developers

- **Reusable FrameRecorder**: The `FrameRecorder` class in the orchestrator is self-contained and can be extracted for other testing scenarios
- **Paths**: Socket.io connection paths differ between backends:
  - Node: `/ws` (or custom)
  - Rust: `/_rust`
  - Orchestrator auto-detects based on URL port
- **Idempotency**: Flows use deterministic clientIds and quiz IDs, allowing repeated runs without interference

