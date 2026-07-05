# Rust-Port Phase 2 — Feature-Completeness Work-Packages

**Ziel:** den Rust-Server (`rust/server`) von „MVP (Lobby + eine Frage)" zu
**feature-komplett** (Drop-in-Ersatz für den Node-`packages/socket`) bringen.
Zerlegt in **kleine, einzeln abarbeitbare, gegatete Pakete** für die Agent-Fleet.

**Ist-Stand (2026-07-05, live auf `:3012`):** `create → join → login →
startGame → SHOW_START → SHOW_QUESTION` läuft end-to-end gegen den echten
socket.io-client. Engine (`rust/engine/state.rs`): `GamePhase`-Enum + `start()`
+ `show_question()`. Handler registriert (teils Stub): create/join/login/
selectedAnswer/startGame/revealAnswer/showLeaderboard.

**Node-Referenz** (`packages/socket/src`): `services/game/round-manager.ts`
(99K, Kern), `answer-eval.ts`, `text-match.ts`, `player-manager.ts`,
`cooldown-timer.ts`, `bot-manager.ts`, `scoreboard-throttle.ts`; `handlers/
game.ts` (22K), `manager.ts` (24K), `quizz.ts`, `results.ts`, `ai.ts`,
`display.ts`, `submitMedia*.ts`, `theme-*.ts`. Event-Wahrheit:
[`rust-port-event-inventory.md`](rust-port-event-inventory.md).

## Ausführungs-Regeln (pro WP)
- **Klein & gegatet:** jedes WP endet mit `cd rust && cargo build -p razzoozle-server && cargo test -p razzoozle-server` grün + einer konkreten Assertion (Unit-Test oder Smoke-Frame). `fixed:true` nur bei grün.
- **Lane-Wahl** ([[feedback_workflow-model-routing-ladder]]): pure/algorithmische Engine-Logik → **free-Coder** (or-coder-free, cerebras, nebius, qw, sf, zhipu); gekoppelte Socket-Handler / Integration → **CLI** (cursor/grok/codex); harte Design-Entscheidung → **free-fusion**; Anthropic nur Last-Resort.
- **Kopplung:** der Engine-Kern (Batch 1) ist eng gekoppelt → **sequenzielle CLI-Pipeline** (nicht breite free-Flut, sonst Integrations-Chaos). Datei-disjunkte Teile (Batch 2 Eval-Funktionen, Batch 6 Peripherie-Module) → **parallele free-Flut**.
- **Verlustschutz:** nach jedem grünen Gate committen + beide Remotes ([[feedback_regular-github-autosave]]); keine `rust/target`-Stagings ([[feedback_prevent-flood-and-buildir-errors]]).

---

## Batch 1 — Kern-Rundenfluss (macht es zum echten Mehr-Frage-Spiel mit Scoring)
> Sequenzielle CLI-Pipeline (cursor → grok → codex), Engine zuerst, dann Handler.

| WP | Scope | Rust-Ziel | Node-Quelle | Lane | Dep |
|---|---|---|---|---|---|
| 1.1 | SELECT_ANSWER-Phase + Timer | `engine::open_answers()`; nach SHOW_QUESTION-Leadtime SELECT_ANSWER broadcasten (answers tap-bar) | round-manager (question→select) | cursor | — |
| 1.2 | Antwort erfassen | `engine::record_answer(player, answer)` (choice/bool) + `game:playerAnswer`-Count | game.ts selectedAnswer, answer-eval.ts | free-coder | 1.1 |
| 1.3 | Scoring | zeit-gewichtete Punkte + Streak in `engine::score()` | round-manager (Scoring-Block) | free-coder | 1.2 |
| 1.4 | Reveal | `engine::reveal()` → SHOW_RESULT (korrekt + pro-Spieler Punkte/Rang); `manager:revealAnswer` triggert | round-manager showResult | cursor | 1.3 |
| 1.5 | Leaderboard | `engine::leaderboard()` → SHOW_LEADERBOARD (ranked); `manager:showLeaderboard` | round-manager showLeaderboard | free-coder | 1.4 |
| 1.6 | Next / Finish | `engine::next_or_finish()` → nächste Frage oder FINISHED | round-manager nextQuestion | cursor | 1.5 |
| 1.7 | Cooldowns | `game:startCooldown` + `game:cooldown`-Countdown (tokio timer) | cooldown-timer.ts | free-coder | 1.1 |
| 1.8 | Full-Game-Smoke | Smoke: answer→reveal→leaderboard→next→FINISHED, Scoring asserten | — | cursor | 1.6 |

**Batch-1-Gate:** ein echtes 2-Fragen-Spiel läuft end-to-end mit korrektem Scoring + Leaderboard gegen den echten Client.

---

## Batch 2 — Alle Fragetypen (datei-disjunkt → parallele free-Flut)
| WP | Typ | Rust-Ziel | Node-Quelle | Lane |
|---|---|---|---|---|
| 2.1 | choice (single) | eval in `engine::answer` | answer-eval.ts | or-coder-free |
| 2.2 | multiple-select | exact set-match | answer-eval.ts | cerebras |
| 2.3 | boolean | true/false | answer-eval.ts | zhipu |
| 2.4 | slider | numerisch + Toleranz | answer-eval.ts | qw |
| 2.5 | poll | Wertung 0 / Verteilung | round-manager | nebius |
| 2.6 | type-answer | Fuzzy-Text-Match (exact/normalized/fuzzy) | text-match.ts | sf |
| 2.7 | sentence-builder | Chunk-Reihenfolge (razzoozle-engine chunks) | answer-eval.ts | or-qwen3-next |

---

## Batch 3 — Spieler & Zustands-Vollständigkeit
totalPlayers/newPlayer/removePlayer · Disconnect/Reconnect (`player-manager.ts`) ·
SHOW_RESPONSES (Antwort-Verteilung) · SHOW_ROUND_RECAP · WAIT/PAUSED ·
SHOW_PREPARED. Mischung free (Zustands-Payloads) + CLI (Reconnect-Semantik).

## Batch 4 — Quiz-Laden & HTTP-Routen
Quizze von Disk laden (`config/quizzes/`, statt embedded Fixture) · axum-Routen:
Quizz-CRUD, Results, Solo-Score (Server-Recompute), Health/Metrics. CLI + free.

## Batch 5 — Auth & Config
Manager-Passwort-Auth + Host-Token · `manager:config` / `ManagerConfig` ausliefern ·
`loggedClients` (mit Crash-Persist-Lücke aus Design-Audit §4.3 beachten). CLI.

## Batch 6 — Peripherie (eigene Unter-Batches, niedrigere Prio, je parallel-frei)
- **Bots** (`bot-manager.ts`, `bot-names.ts`) — Auto-Spieler.
- **Themes** (`theme-template.ts`, `theme-revision.ts`) — Serve/Save.
- **AI/Media** (`ai-provider`, `comfyui`, `submitMedia*`) — reqwest gegen ComfyUI; SSRF-Guard (Audit).
- **Plugins** — Node-Sidecar (ADR Option C), NICHT in Rust.
- **Low-Latency** (CLOCK/METRICS, answerAck, lastServerSeq) — tokio + prometheus.
- **Display/Kiosk** (`display.ts`) — Satellite-Pairing.

---

## Cutover (Phase 4, nach Batch 1–5)
Shadow-Betrieb (Rust `:3012` neben Node `:3011`), Playwright-E2E gegen Rust,
Lasttest, dann Feature-Flag pro Raum. Node bleibt 4 Wochen Rollback-Pfad.
Node-`packages/socket` wird archiviert, **nicht** gelöscht.
