//! Single chokepoint for manager-relevant STATUS emits.
//! Mirrors Node `broadcastStatus` / `sendStatus`: record then emit atomically.
//!
//! CALLER MUST NOT HOLD the game lock — the functions themselves will lock and
//! drop before returning. Emit and record happen under the same lock guard so
//! recorded state always matches wire order (Node single-threaded parity).
//! socketioxide 0.15 emits are sync (no .await) and non-blocking (channel try_send),
//! so holding std::sync::Mutex across them is safe.

use crate::state::{get_now_ms, Game};
use razzoozle_protocol::constants;
use razzoozle_protocol::experience::{
    ChaseState, DeepSeaPayload, ExperiencePayload, ExperiencePhase, ExperienceTransition,
    PyramidPayload,
};
use razzoozle_protocol::game::ExperienceMode;
use razzoozle_protocol::status::GameStatus;
use socketioxide::{extract::SocketRef, SocketIo};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::{Arc, Mutex};

// WP #877 — monotonic revision counter for `game:experience` envelopes. The
// display client doesn't currently compare revisions (last-write-wins render),
// so a process-global counter is enough; a per-game counter would need a new
// Game field + snapshot roundtrip support for no behavioural gain today.
static EXPERIENCE_REVISION: AtomicI32 = AtomicI32::new(0);

/// Map a `game:status` transition to its content-free `game:experience` phase.
/// `None` = deliberate blackout (no envelope sent, display keeps its last frame):
/// lobby (nothing to show yet) and the two player-only holds (Wait/Paused).
fn status_to_experience_phase(status: &GameStatus) -> Option<ExperiencePhase> {
    match status {
        GameStatus::ShowRoom(_) | GameStatus::Wait(_) | GameStatus::Paused(_) => None,
        GameStatus::ShowStart(_) | GameStatus::ShowPrepared(_) => Some(ExperiencePhase::Intro),
        GameStatus::ShowQuestion(_) | GameStatus::SelectAnswer(_) => {
            Some(ExperiencePhase::Question)
        }
        GameStatus::ShowResponses(_) => Some(ExperiencePhase::AnswersLocked),
        GameStatus::ShowResult(_) => Some(ExperiencePhase::Resolution),
        GameStatus::ShowRoundRecap(_) | GameStatus::ShowLeaderboard(_) => {
            Some(ExperiencePhase::WorldTransition)
        }
        // #875: FINISHED must reach the display too, or it hangs on the last
        // question forever (display never gets told the game ended).
        GameStatus::Finished(_) => Some(ExperiencePhase::GameComplete),
    }
}

/// Placeholder payload body for a mode until its mode-specific gameplay state
/// exists (PyramidClimb team steps land in WP #904, DeepSeaEscape chase in
/// WP #905, FlowerBattle body in WP #927). Keeps the envelope's `payload.mode`
/// tag consistent with `envelope.mode` in the meantime.
fn default_payload_for_mode(mode: ExperienceMode) -> ExperiencePayload {
    match mode {
        ExperienceMode::Classic => ExperiencePayload::Classic,
        ExperienceMode::PyramidClimb => {
            ExperiencePayload::Pyramid(PyramidPayload { team_steps: vec![] })
        }
        ExperienceMode::DeepSeaEscape => ExperiencePayload::DeepSea(DeepSeaPayload {
            chase: ChaseState {
                distance: 0.0,
                level: 0,
                level_count: 0,
                correct_ratio: 0.0,
            },
        }),
        ExperienceMode::FlowerBattle => ExperiencePayload::FlowerBattle,
    }
}

/// Room-wide STATUS: record as manager's last status, then emit to the game room.
/// Record and emit are atomic under the game lock.
pub fn broadcast_status(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    status: &GameStatus,
) {
    let experience_mode = {
        let mut game = game_ref.lock().unwrap();
        game.record_last_manager_status(status);
        io.to(game_id.to_string())
            .emit(constants::game::STATUS, status)
            .ok();
        game.selected_modes.experience_mode
    };

    // WP #877 — mirror the transition to the display room when an Experience
    // mode is active. Content-free: only phase/mode/progress go out, the
    // question/answer data already went out on the STATUS emit above.
    if let (Some(mode), Some(phase)) = (
        experience_mode.filter(|m| *m != ExperienceMode::Classic),
        status_to_experience_phase(status),
    ) {
        let transition = ExperienceTransition {
            mode,
            phase,
            phase_started_at_server_ms: get_now_ms() as i64,
            phase_duration_ms: None,
            revision: EXPERIENCE_REVISION.fetch_add(1, Ordering::Relaxed),
            answered: None,
            total: None,
            payload: default_payload_for_mode(mode),
        };
        broadcast_experience_to_display(io, game_ref, game_id, transition, None, None);
    }
}

/// Emit an experience transition only to the game's display room. `answered`/
/// `total` are optional (WP #877 doesn't yet track per-question progress for
/// experience modes — that lands with the mode-specific gameplay in WP
/// #904/#905); the wire field is already `skip_serializing_if` on the type.
pub fn broadcast_experience_to_display(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    mut experience: ExperienceTransition,
    answered: Option<i32>,
    total: Option<i32>,
) {
    let _game = game_ref.lock().unwrap();
    experience.answered = answered;
    experience.total = total;
    let display_room = format!("display:{}", game_id);
    io.to(display_room)
        .emit(constants::experience::TRANSITION, &experience)
        .ok();
}

/// Manager-socket STATUS: record, then emit to that socket only.
/// Record and emit are atomic under the game lock.
pub fn send_status_to_manager(sock: &SocketRef, game_ref: &Arc<Mutex<Game>>, status: &GameStatus) {
    let mut game = game_ref.lock().unwrap();
    game.record_last_manager_status(status);
    sock.emit(constants::game::STATUS, status).ok();
}

/// Emit lifecycle events for a game state transition — Node parity:
/// Node's emitLifecycle iterates only LOADED plugins, and loadPlugin gates on the
/// SERVER_HANDLER capability (plugin-runtime.ts:271) — UI-only plugins get NO
/// lifecycle events. Emits `plugin:<id>:lifecycle:<hook>` GLOBALLY (io.emit, all
/// sockets — Node uses ioRef.emit, not a room) with payload {gameId, status, data}.
/// Non-fatal: errors are logged but never break the game round (crash-guarded).
pub fn emit_plugin_lifecycle(io: &SocketIo, game_id: &str, hook_name: &str, status_str: &str) {
    let plugins = crate::socket::manager::plugins::read_plugins_index();

    for plugin in plugins {
        // Node parity gate: enabled AND SERVER_HANDLER capability (= would be
        // loaded by Node's runtime). UI-only plugins are skipped like on Node.
        if !plugin.enabled || !plugin.capabilities.iter().any(|c| c == "SERVER_HANDLER") {
            continue;
        }

        let event_name = format!("plugin:{}:lifecycle:{}", plugin.id, hook_name);
        let payload = serde_json::json!({
            "gameId": game_id,
            "status": status_str,
            "data": {}
        });

        match io.emit(&event_name, &payload) {
            Ok(()) => {}
            Err(e) => {
                tracing::warn!(
                    "failed to emit plugin lifecycle event {} for game {}: {}",
                    event_name,
                    game_id,
                    e
                );
            }
        }
    }
}
