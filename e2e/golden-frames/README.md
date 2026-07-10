# Golden-Frames E2E Harness

Full-game e2e driver supporting all 7 question types with a diff runner for Node vs Rust parity verification.

## Setup

Prerequisites: Node.js with socket.io-client installed (workspace default).

## Usage

### Driver

Run a complete game against one backend:

```bash
E2E_URL=http://127.0.0.1:3011 \
  E2E_PW=$(docker exec razzoozle_postgres psql -U razzoozle -d razzoozle -tAc "SELECT manager_password FROM games_config WHERE id=1") \
  E2E_OUT=/tmp/e2e_log_node.json \
  E2E_PATH=/ws \
  node driver.cjs
```

**Environment variables:**
- `E2E_URL` (required): Backend URL (e.g., `http://127.0.0.1:3011` for Node, `http://127.0.0.1:3012` for Rust)
- `E2E_PW` (required): Manager password from `games_config`
- `E2E_OUT` (required): Output JSON file path
- `E2E_PATH` (optional): Socket.io path (default: `/socket.io/`; use `/ws` for Node twin)

**Output:** JSON log with event stream, gaps, and final status. All 7 question types must be answered and game must reach FINISHED.

### Diff Runner

Compare two driver outputs:

```bash
node diff.cjs /tmp/e2e_log_node.json /tmp/e2e_log_rust.json
```

**Exit codes:**
- 0: No parity drift (time values masked)
- 1: Structural/event ordering differences

**Masking:** Time-ish numeric values (durations, timeouts, epochs) are masked before comparison.

## Question Types & Answer Payloads

Driver supports all 7 types with deterministic, per-type strategies:

| Type | P1 Answer | P2 Answer |
| --- | --- | --- |
| **choice** | `{answerKey: solutions[0]}` | Wrong index (not solution) |
| **boolean** | `{answerKey: solutions[0]}` | Opposite (0↔1) |
| **slider** | `{answerKey: correct}` | Min value |
| **poll** | `{answerKey: 0}` | Index 1 |
| **multiple-select** | `{answerKeys: solutions}` | Different indices |
| **type-answer** | `{answerText: acceptedAnswers[0]}` | "London" |
| **sentence-builder** | `{answerKeys: [0,1,...,N]}` | Reversed indices |

## Important Notes

- **Sequential only:** Driver uses shared Postgres DB; never run two games in parallel.
- **Node twin:** Use `E2E_PATH=/ws` for socket.io via Caddy; Rust uses default `/socket.io/`.
- **Real verification:** All 7 types must answer successfully; claims without captured output are discarded.

## Troubleshooting

- **No manager:config:** Backend not running or password incorrect.
- **GAP: game:successRoom:** Socket connection established but room join failed.
- **SELECT_ANSWER never reached:** Game initialization stalled (check manager logs).
- **FINISHED never reached:** Question loop timeout or backend crash (check game status).

See driver `steps` and `notes` in output JSON for detailed event trace.
