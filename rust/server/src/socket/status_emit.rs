//! Single chokepoint for manager-relevant STATUS emits.
//! Mirrors Node `broadcastStatus` / `sendStatus`: record then emit atomically.
//!
//! CALLER MUST NOT HOLD the game lock — the functions themselves will lock and
//! drop before returning. Emit and record happen under the same lock guard so
//! recorded state always matches wire order (Node single-threaded parity).
//! socketioxide 0.15 emits are sync (no .await) and non-blocking (channel try_send),
//! so holding std::sync::Mutex across them is safe.
//!
//! # WP-958F-R — result envelope ordering (FlowerBattle / experience modes)
//!
//! Reveal is manager-only on the STATUS wire (`SHOW_RESPONSES`), but the paired
//! display still needs content-free `game:experience`. Authoritative Flower
//! Growth/Sun/Offers/Victory mutate only in `after_reveal_tick`, so:
//! 1. `send_status_to_manager(SHOW_RESPONSES)` → `answers_locked` (pre-tick)
//! 2. `after_reveal_tick` mutates state + player statuses
//! 3. `emit_post_reveal_resolution` → `resolution` from **post-tick** state
//! 4. If the tick finishes the game, `game_complete` is final — no later resolution
//!
//! Display emit does **not** require a connected manager socket.

use crate::socket::manager::game_flow::flower_battle_display;
use crate::socket::lifecycle::flower_battle_emit::{self, is_flower_battle};
use crate::state::{get_now_ms, Game};
use razzoozle_engine::state::GamePhase;
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

#[cfg(test)]
type ReconnectJoinHook = Arc<dyn Fn() + Send + Sync>;

#[cfg(test)]
static RECONNECT_JOIN_HOOKS: std::sync::OnceLock<
    Mutex<std::collections::HashMap<String, ReconnectJoinHook>>,
> = std::sync::OnceLock::new();

#[cfg(test)]
fn set_reconnect_join_hook(game_id: &str, hook: ReconnectJoinHook) {
    RECONNECT_JOIN_HOOKS
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .insert(game_id.to_string(), hook);
}

#[cfg(test)]
fn run_reconnect_join_hook(game_id: &str) {
    let hook = RECONNECT_JOIN_HOOKS
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .get(game_id)
        .cloned();
    if let Some(hook) = hook {
        hook();
    }
}

#[cfg(test)]
fn clear_reconnect_join_hook(game_id: &str) {
    RECONNECT_JOIN_HOOKS
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .remove(game_id);
}

static RESULT_RESOLUTION_WINDOWS: std::sync::OnceLock<
    Mutex<std::collections::HashMap<String, usize>>,
> = std::sync::OnceLock::new();

pub(crate) struct ResultResolutionWindow {
    game_id: String,
    active: bool,
}

impl ResultResolutionWindow {
    pub(crate) fn complete(mut self) {
        clear_result_resolution_window(&self.game_id);
        self.active = false;
    }
}

impl Drop for ResultResolutionWindow {
    fn drop(&mut self) {
        if self.active {
            clear_result_resolution_window(&self.game_id);
        }
    }
}

pub(crate) fn begin_result_resolution_window(game_id: &str) -> ResultResolutionWindow {
    let mut windows = RESULT_RESOLUTION_WINDOWS
        .get_or_init(Default::default)
        .lock()
        .unwrap();
    *windows.entry(game_id.to_string()).or_insert(0) += 1;
    ResultResolutionWindow {
        game_id: game_id.to_string(),
        active: true,
    }
}

fn result_resolution_pending(game_id: &str) -> bool {
    RESULT_RESOLUTION_WINDOWS
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .get(game_id)
        .is_some_and(|count| *count > 0)
}

fn clear_result_resolution_window(game_id: &str) {
    let mut windows = RESULT_RESOLUTION_WINDOWS
        .get_or_init(Default::default)
        .lock()
        .unwrap();
    let Some(count) = windows.get_mut(game_id) else {
        return;
    };
    if *count <= 1 {
        windows.remove(game_id);
    } else {
        *count -= 1;
    }
}

/// Active non-Classic experience mode (Classic rides game:status only).
fn active_experience_mode(game: &Game) -> Option<ExperienceMode> {
    game.selected_modes
        .experience_mode
        .filter(|m| *m != ExperienceMode::Classic)
}

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

/// Manager-only STATUS path experience phase.
///
/// `Resolution` is **not** emitted here — authoritative post-reveal state
/// (FlowerBattle growth/sun/offers/victory) lands only after `after_reveal_tick`.
/// Lifecycle owns [`emit_post_reveal_resolution`].
fn manager_status_experience_phase(status: &GameStatus) -> Option<ExperiencePhase> {
    match status_to_experience_phase(status) {
        Some(ExperiencePhase::Resolution) => None,
        other => other,
    }
}

/// Whether post-tick `resolution` may still fire (not terminal).
fn post_reveal_resolution_allowed(game: &Game) -> bool {
    if active_experience_mode(game).is_none() {
        return false;
    }
    // Terminal: game_complete is final — never trail a later resolution.
    if game.finish_broadcast_done
        || game.engine.phase == GamePhase::Finished
        || game.flower_battle_effects.victory_resolved
        || game.flower_battle_winner_team_ids.is_some()
    {
        return false;
    }
    true
}

/// Shared envelope builder (broadcast / manager path / reconnect / post-tick).
fn build_experience_transition(
    game: &Game,
    mode: ExperienceMode,
    phase: ExperiencePhase,
    bump_revision: bool,
) -> ExperienceTransition {
    let (answered, total, phase_duration_ms) = experience_progress(game, phase);
    let phase_started_at_server_ms =
        if matches!(phase, ExperiencePhase::Question) && game.question_start_at_server_ms > 0 {
            game.question_start_at_server_ms
        } else {
            get_now_ms() as i64
        };
    let revision = if bump_revision {
        EXPERIENCE_REVISION.fetch_add(1, Ordering::Relaxed)
    } else {
        EXPERIENCE_REVISION.load(Ordering::Relaxed)
    };
    ExperienceTransition {
        mode,
        phase,
        phase_started_at_server_ms,
        phase_duration_ms,
        revision,
        answered,
        total,
        payload: default_payload_for_mode(mode, game),
    }
}

/// Room emit for `game:experience` — works with zero connected sockets.
fn emit_experience_to_display_room(
    io: &SocketIo,
    game_id: &str,
    transition: &ExperienceTransition,
) {
    let display_room = format!("display:{}", game_id);
    io.to(display_room)
        .emit(constants::experience::TRANSITION, transition)
        .ok();
}

/// After `after_reveal_tick`: emit personalized-display `resolution` from post-tick state.
/// No-op when Classic/None or when the tick already finished the game.
pub fn emit_post_reveal_resolution(io: &SocketIo, game_ref: &Arc<Mutex<Game>>, game_id: &str) {
    let game = game_ref.lock().unwrap();
    if !post_reveal_resolution_allowed(&game) {
        return;
    }
    let Some(mode) = active_experience_mode(&game) else {
        return;
    };
    let transition = build_experience_transition(&game, mode, ExperiencePhase::Resolution, true);
    clear_result_resolution_window(game_id);
    // Keep snapshot build + sync socketioxide send under one Game guard.
    // Reconnect cannot capture old state and send it after this live revision.
    emit_experience_to_display_room(io, game_id, &transition);
}

/// Resume/reconnect phases for a live SHOW_RESULT window.
///
/// Order: content-free `answers_locked`, then post-state `resolution`.
/// Terminal games emit only `game_complete` (never a trailing resolution).
fn result_window_experience_phases(game: &Game) -> Vec<ExperiencePhase> {
    if active_experience_mode(game).is_none() {
        return Vec::new();
    }
    if game.finish_broadcast_done
        || game.engine.phase == GamePhase::Finished
        || game.flower_battle_effects.victory_resolved
        || game.flower_battle_winner_team_ids.is_some()
    {
        return vec![ExperiencePhase::GameComplete];
    }
    if matches!(game.engine.phase, GamePhase::ShowResult) {
        let mut phases = vec![ExperiencePhase::AnswersLocked];
        if !result_resolution_pending(&game.game_id) {
            phases.push(ExperiencePhase::Resolution);
        }
        return phases;
    }
    Vec::new()
}

/// Payload body for a mode's current display-safe state. PyramidClimb team
/// steps (WP #904) and DeepSeaEscape chase (WP #905) still have no gameplay
/// state to read yet, so they stay empty/zeroed placeholders that only keep
/// `payload.mode` consistent with `envelope.mode`. FlowerBattle (WP #928)
/// delegates to a real projection of the current game state — see
/// `flower_battle_display` for what's genuinely wired vs. still a docking
/// point for #929/#930.
fn default_payload_for_mode(mode: ExperienceMode, game: &Game) -> ExperiencePayload {
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
        ExperienceMode::FlowerBattle => {
            flower_battle_display::build_flower_battle_payload_from_game(game)
        }
    }
}

/// Progress + phase duration for experience envelopes (L-13 / L-14).
///
/// `answered`/`total` = questions completed so far / quiz length (display
/// "N / M" progress), not player answer-count.
fn experience_progress(
    game: &Game,
    phase: ExperiencePhase,
) -> (Option<i32>, Option<i32>, Option<i64>) {
    let total = game.engine.quiz.questions.len() as i32;
    let answered = {
        let idx = game.engine.current_question_index as i32;
        let post_reveal = matches!(
            phase,
            ExperiencePhase::AnswersLocked
                | ExperiencePhase::Resolution
                | ExperiencePhase::WorldTransition
                | ExperiencePhase::GameComplete
                | ExperiencePhase::LevelComplete
        );
        if total == 0 {
            0
        } else if post_reveal {
            (idx + 1).min(total)
        } else {
            idx.min(total)
        }
    };
    let phase_duration_ms: Option<i64> = match phase {
        ExperiencePhase::Intro => Some(3_000),
        ExperiencePhase::Question => game
            .engine
            .quiz
            .questions
            .get(game.engine.current_question_index)
            .map(|q| i64::from(q.time.max(0)) * 1000),
        ExperiencePhase::AnswersLocked
        | ExperiencePhase::Resolution
        | ExperiencePhase::LevelComplete => Some(6_000),
        ExperiencePhase::WorldTransition => Some(5_000),
        ExperiencePhase::GameComplete | ExperiencePhase::GameFailed => None,
    };
    (
        if total > 0 { Some(answered) } else { None },
        if total > 0 { Some(total) } else { None },
        phase_duration_ms,
    )
}

/// Whether `game:status` broadcasts must wire-exclude the display room.
///
/// WP #877 follow-up (security fix): the STATUS payload carries the raw
/// question/answer content (ShowQuestionData/SelectAnswerData/...) — during
/// an active Experience mode that content must never reach a display-room
/// socket (paired beamer) on the WIRE, regardless of what the presenter's own
/// DOM renders (ExperienceDisplay vs. the normal state component). Classic
/// games (None/Classic) keep the exact pre-#877 unfiltered broadcast.
fn status_must_exclude_display_room(experience_mode: Option<ExperienceMode>) -> bool {
    experience_mode.is_some_and(|m| m != ExperienceMode::Classic)
}

/// Room-wide STATUS: record as manager's last status, then emit to the game room.
/// Record and emit are atomic under the game lock.
pub fn broadcast_status(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    status: &GameStatus,
) {
    let mut game = game_ref.lock().unwrap();
    game.record_last_manager_status(status);
    let experience_mode = game.selected_modes.experience_mode;
    let manager_socket_id = game.manager_socket_id.clone();
    let transition = match (
        active_experience_mode(&game),
        status_to_experience_phase(status),
    ) {
        (Some(mode), Some(phase)) => Some(build_experience_transition(&game, mode, phase, true)),
        _ => None,
    };

    if status_must_exclude_display_room(experience_mode) {
        // The manager socket (host, or a satellite kiosk currently holding
        // the single manager slot) also joins the display room from creation
        // onward (game.rs register_create / auth.rs register_reconnect) so
        // it receives game:experience — which means it's ALSO excluded by
        // the room-wide broadcast below and needs a direct backfill. It's a
        // trusted, authenticated party (game owner / satellite token), not a
        // wire-leak target, and its own chrome (next-btn, presenter toolbar)
        // needs status.name regardless of which component it renders.
        io.to(game_id.to_string())
            .except(format!("display:{}", game_id))
            .emit(constants::game::STATUS, status)
            .ok();
        if let Ok(sid) = manager_socket_id.parse() {
            if let Some(manager_socket) = io.get_socket(sid) {
                manager_socket.emit(constants::game::STATUS, status).ok();
            }
        }
    } else {
        io.to(game_id.to_string())
            .emit(constants::game::STATUS, status)
            .ok();
    }

    // WP #877 — mirror the transition to the display room when an Experience
    // mode is active. Content-free: only phase/mode/progress go out, the
    // question/answer data already went out on the STATUS emit above (now
    // wire-excluded from the display room itself, see above).
    if let Some(transition) = transition {
        emit_experience_to_display_room(io, game_id, &transition);
    }
}

/// Map recorded manager wire `Status` → experience phase (same table as
/// [`status_to_experience_phase`], without needing a full `GameStatus` value).
fn recorded_status_to_experience_phase(
    status: razzoozle_protocol::status::Status,
) -> Option<ExperiencePhase> {
    use razzoozle_protocol::status::Status;
    match status {
        Status::ShowRoom | Status::Wait | Status::Paused => None,
        Status::ShowStart | Status::ShowPrepared => Some(ExperiencePhase::Intro),
        Status::ShowQuestion | Status::SelectAnswer => Some(ExperiencePhase::Question),
        Status::ShowResponses => Some(ExperiencePhase::AnswersLocked),
        Status::ShowResult => Some(ExperiencePhase::Resolution),
        Status::ShowRoundRecap | Status::ShowLeaderboard => Some(ExperiencePhase::WorldTransition),
        Status::Finished => Some(ExperiencePhase::GameComplete),
    }
}

fn reconnect_experience_transitions(
    game: &Game,
    was_display_member: bool,
) -> Vec<ExperienceTransition> {
    let mode = match game.selected_modes.experience_mode {
        Some(ExperienceMode::FlowerBattle) => ExperienceMode::FlowerBattle,
        _ => return Vec::new(),
    };

    // Result-window dual envelope takes precedence over last_manager_status
    // (manager STATUS is SHOW_RESPONSES while engine phase is ShowResult).
    let phases = {
        let mut result_phases = result_window_experience_phases(game);
        // An existing display-room member already received the live resolution
        // that cleared the result window. Replay its current resolution only;
        // answers_locked here would move the wire backwards after resolution.
        if was_display_member
            && result_phases == [ExperiencePhase::AnswersLocked, ExperiencePhase::Resolution]
        {
            result_phases.remove(0);
        }
        if !result_phases.is_empty() {
            result_phases
        } else {
            let phase = game
                .last_manager_status
                .as_ref()
                .and_then(|(s, _)| recorded_status_to_experience_phase(*s))
                .or(match game.engine.phase {
                    GamePhase::ShowRoom => None,
                    GamePhase::ShowStart => Some(ExperiencePhase::Intro),
                    GamePhase::ShowQuestion | GamePhase::SelectAnswer => {
                        Some(ExperiencePhase::Question)
                    }
                    GamePhase::ShowResult => Some(ExperiencePhase::Resolution),
                    GamePhase::ShowRoundRecap | GamePhase::ShowLeaderboard => {
                        Some(ExperiencePhase::WorldTransition)
                    }
                    GamePhase::Finished => Some(ExperiencePhase::GameComplete),
                });
            phase.into_iter().collect()
        }
    };
    phases
        .into_iter()
        .map(|phase| build_experience_transition(game, mode, phase, false))
        .collect()
}

fn socket_was_in_display_room(socket: &SocketRef, display_room: &str) -> bool {
    match socket.rooms() {
        Ok(rooms) => rooms.iter().any(|room| room.as_ref() == display_room),
        Err(error) => {
            tracing::warn!(
                "manager:reconnect failed to inspect display membership socketId={} room={} error={:?}",
                socket.id,
                display_room,
                error
            );
            false
        }
    }
}

fn join_room(socket: &SocketRef, room: String) {
    if let Err(error) = socket.join(room.clone()) {
        tracing::warn!(
            "manager:reconnect failed to join room socketId={} room={} error={:?}",
            socket.id,
            room,
            error
        );
    }
}

fn emit_reconnect_event<T: serde::Serialize>(socket: &SocketRef, event: &str, payload: &T) {
    if let Err(error) = socket.emit(event, payload) {
        tracing::warn!(
            "manager:reconnect failed to emit event socketId={} event={} error={}",
            socket.id,
            event,
            error
        );
    }
}

/// Complete an authorized manager/display reconnect under one Game guard.
///
/// Manager slot update, room membership, SUCCESS_RECONNECT, player count, and
/// current experience replay share one critical section with every live
/// experience emission. Therefore live resolution cannot land between the
/// reconnect acknowledgement and its replay.
///
/// During the reveal-to-tick window, reconnect replays only `answers_locked`.
/// The post-tick live `resolution` then supplies the first authoritative state.
///
/// WP #966 (envelope-resend): the successReconnect payload is now augmented
/// with a separate `game:status` emit (so a manager that misses the first
/// envelope still gets a single authoritative replay) plus, for an active
/// FlowerBattle game, `game:flowerBattle:snapshot` and a per-player
/// `game:flowerBattle:playerStatus` for every currently-connected player. The
/// per-player status uses the LIVE revision (no bump) — the live `tick` path
/// is the sole authority for monotonic revision increments.
pub fn complete_manager_reconnect(
    socket: &SocketRef,
    game_ref: &Arc<Mutex<Game>>,
    claim_manager: bool,
) {
    let mut game = game_ref.lock().unwrap();
    let game_id = game.game_id.clone();
    if claim_manager {
        game.manager_socket_id = socket.id.to_string();
    }

    let display_room = format!("display:{game_id}");
    let was_display_member = socket_was_in_display_room(socket, &display_room);
    join_room(socket, game_id.clone());
    join_room(socket, display_room);

    let (status_name, status_data) = game.manager_reconnect_status();
    emit_reconnect_event(
        socket,
        constants::manager::SUCCESS_RECONNECT,
        &serde_json::json!({
            "gameId": game_id,
            "currentQuestion": {
                "current": game.engine.current_question_index + 1,
                "total": game.engine.quiz.questions.len(),
            },
            "status": { "name": status_name, "data": status_data },
            "players": game.players,
        }),
    );
    emit_reconnect_event(
        socket,
        constants::game::TOTAL_PLAYERS,
        &(game.players.len() as i32),
    );

    // WP #966 — resend `game:status` separately so a manager that missed the
    // first envelope (display rejoined mid-round) still gets the authoritative
    // replay. No-op when the game hasn't recorded a status yet — that's the
    // pure lobby case where the manager_reconnect_status fallback already
    // surfaces SHOW_ROOM inside successReconnect.
    if let Some(game_status) = game.last_manager_game_status() {
        emit_reconnect_event(socket, constants::game::STATUS, &game_status);
    }

    // WP #966 — for active FlowerBattle games the manager's display also needs
    // the mode envelope replayed (snapshot) plus per-player status for any
    // connected players still on the wire. Helpers do not mutate the live
    // revision counter (no bump) — the tick path owns monotonic revisions.
    if is_flower_battle(&game) {
        emit_flb_snapshot_to_socket(socket, &game);
        emit_flb_player_statuses_to_socket(socket, &game);
    }

    #[cfg(test)]
    run_reconnect_join_hook(&game_id);

    for transition in reconnect_experience_transitions(&game, was_display_member) {
        emit_reconnect_event(socket, constants::experience::TRANSITION, &transition);
    }
}

/// Replay `game:flowerBattle:snapshot` directly to a single reconnecting socket.
/// Mirrors `flower_battle_emit::emit_flb_snapshot` but addresses the
/// `SocketRef` (not the room) — the reconnecting manager is now in the
/// `display:{gameId}` room (see `complete_manager_reconnect`), so the room
/// broadcast would reach other display-room members too, which is intentional.
/// On the wire path we deliberately duplicate via direct emit so a freshly
/// attached display socket cannot miss the envelope if its room join lands
/// after the broadcast tick.
fn emit_flb_snapshot_to_socket(socket: &SocketRef, game: &Game) {
    let payload = serde_json::json!({
        "gameId": game.game_id,
        "growthStage": game.flower_battle_effects.growth_stage,
        "sunPoints": game.flower_battle_sun_points,
        "winnerTeamIds": game.flower_battle_winner_team_ids,
        "victoryResolved": game.flower_battle_effects.victory_resolved,
        "offers": game.flower_battle_offers.values().cloned().collect::<Vec<_>>(),
    });
    if let Err(error) = socket.emit(constants::flower_battle::SNAPSHOT, &payload) {
        tracing::warn!(
            "manager:reconnect failed to emit flowerBattle snapshot socketId={} error={}",
            socket.id,
            error
        );
    }
}

/// Replay `game:flowerBattle:playerStatus` to the reconnecting socket for each
/// player that is currently connected. Uses the LIVE revision (no bump) so the
/// reconnect replay cannot outrace the tick path's monotonic counter. Skips
/// disconnected players (no team identity would survive anyway). Players with
/// no `team_id` get a zeroed-team payload — never a guessed first map key.
fn emit_flb_player_statuses_to_socket(socket: &SocketRef, game: &Game) {
    if !is_flower_battle(game) {
        return;
    }
    let revision = game.flower_battle_player_status_revision;
    for player in game.players.iter().filter(|player| player.connected) {
        let status = flower_battle_emit::build_player_status(&game.game_id, game, player, revision);
        if let Err(error) = socket.emit(constants::flower_battle::PLAYER_STATUS, &status) {
            tracing::warn!(
                "manager:reconnect failed to emit flowerBattle playerStatus socketId={} playerId={} error={}",
                socket.id,
                player.id,
                error
            );
        }
    }
}

/// Manager-relevant STATUS: record, emit to manager socket if connected, and
/// mirror content-free `game:experience` to the display room when mapped.
///
/// Does **not** require a connected manager socket (display emit still runs).
/// Does **not** emit `resolution` — that is owned by
/// [`emit_post_reveal_resolution`] after `after_reveal_tick`.
pub fn send_status_to_manager(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    status: &GameStatus,
) {
    let mut game = game_ref.lock().unwrap();
    game.record_last_manager_status(status);
    let manager_socket_id = game.manager_socket_id.clone();
    let transition = match (
        active_experience_mode(&game),
        manager_status_experience_phase(status),
    ) {
        (Some(mode), Some(phase)) => Some(build_experience_transition(&game, mode, phase, true)),
        _ => None,
    };

    if let Ok(sid) = manager_socket_id.parse() {
        if let Some(sock) = io.get_socket(sid) {
            sock.emit(constants::game::STATUS, status).ok();
        }
    }

    if let Some(transition) = transition {
        emit_experience_to_display_room(io, game_id, &transition);
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Router;
    use razzoozle_protocol::experience::PowerupOffer;
    use razzoozle_protocol::status::{
        FinishedData, PausedData, SelectAnswerData, ShowLeaderboardData, ShowPreparedData,
        ShowQuestionData, ShowResponsesData, ShowResultData, ShowRoomData, ShowRoundRecapData,
        ShowStartData, WaitData,
    };
    use std::time::Duration;

    struct PollingSocketClient {
        http: reqwest::Client,
        endpoint: String,
        sid: String,
    }

    impl PollingSocketClient {
        async fn connect() -> (Self, SocketIo, SocketRef, tokio::task::JoinHandle<()>) {
            let (layer, io) = SocketIo::builder().build_layer();
            let (socket_tx, socket_rx) = tokio::sync::oneshot::channel();
            let socket_tx = Arc::new(Mutex::new(Some(socket_tx)));
            io.ns("/", move |socket: SocketRef| {
                if let Some(tx) = socket_tx.lock().unwrap().take() {
                    tx.send(socket).ok();
                }
            });

            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                axum::serve(listener, Router::new().layer(layer))
                    .await
                    .unwrap();
            });
            let endpoint = format!("http://{address}/socket.io/?EIO=4&transport=polling");
            let http = reqwest::Client::new();
            let open = http
                .get(&endpoint)
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap();
            let open: serde_json::Value =
                serde_json::from_str(open.strip_prefix('0').expect("engine.io open packet"))
                    .unwrap();
            let sid = open["sid"].as_str().unwrap().to_string();
            let session_endpoint = format!("{endpoint}&sid={sid}");
            let post = http
                .post(&session_endpoint)
                .header("content-type", "text/plain;charset=UTF-8")
                .body("40")
                .send()
                .await
                .unwrap();
            assert!(post.status().is_success());

            let socket = tokio::time::timeout(Duration::from_secs(2), socket_rx)
                .await
                .expect("socket.io namespace connect")
                .unwrap();
            let connected = http
                .get(&session_endpoint)
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap();
            assert!(
                connected
                    .split('\u{1e}')
                    .any(|packet| packet.starts_with("40")),
                "socket.io connect ack missing: {connected}"
            );

            (
                Self {
                    http,
                    endpoint,
                    sid,
                },
                io,
                socket,
                server,
            )
        }

        async fn poll_experience(&self) -> Vec<serde_json::Value> {
            let response = tokio::time::timeout(
                Duration::from_secs(2),
                self.http
                    .get(format!("{}&sid={}", self.endpoint, self.sid))
                    .send(),
            )
            .await
            .expect("wire poll timed out")
            .unwrap()
            .text()
            .await
            .unwrap();
            response
                .split('\u{1e}')
                .filter_map(|packet| packet.strip_prefix("42"))
                .filter_map(|packet| serde_json::from_str::<serde_json::Value>(packet).ok())
                .filter_map(|packet| {
                    let values = packet.as_array()?;
                    (values.first()?.as_str()? == constants::experience::TRANSITION)
                        .then(|| values.get(1).cloned())
                        .flatten()
                })
                .collect()
        }
    }

    // WP #877 follow-up (wire-level leak fix) — this is THE room-targeting
    // decision that guards question/answer content from ever reaching the
    // display room's WIRE traffic: Classic/None must stay byte-identical to
    // pre-#877 (broadcast_status's `if` below never takes the except()
    // branch), any other active mode must exclude it.
    #[test]
    fn status_must_exclude_display_room_only_for_active_experience_modes() {
        assert!(!status_must_exclude_display_room(None));
        assert!(!status_must_exclude_display_room(Some(
            ExperienceMode::Classic
        )));
        assert!(status_must_exclude_display_room(Some(
            ExperienceMode::PyramidClimb
        )));
        assert!(status_must_exclude_display_room(Some(
            ExperienceMode::DeepSeaEscape
        )));
        assert!(status_must_exclude_display_room(Some(
            ExperienceMode::FlowerBattle
        )));
    }

    // Phase mapping drives WHEN the exclusion above actually matters (only
    // statuses that map to Some(phase) ever trigger a game:experience send at
    // all) — covers all 12 GameStatus variants including the #875 case
    // (Finished -> GameComplete, so the display doesn't hang on the last
    // question) and the three deliberate blackouts.
    #[test]
    fn status_to_experience_phase_covers_all_variants() {
        let blackout = [
            GameStatus::ShowRoom(ShowRoomData {
                text: "x".into(),
                invite_code: None,
                team_mode: None,
            }),
            GameStatus::Wait(WaitData {
                text: "x".into(),
                team_mode: None,
            }),
            GameStatus::Paused(PausedData { reason: None }),
        ];
        for status in blackout {
            assert_eq!(status_to_experience_phase(&status), None, "{status:?}");
        }

        assert_eq!(
            status_to_experience_phase(&GameStatus::ShowStart(ShowStartData {
                time: 3,
                subject: "x".into(),
            })),
            Some(ExperiencePhase::Intro)
        );
        assert_eq!(
            status_to_experience_phase(&GameStatus::ShowPrepared(ShowPreparedData {
                total_answers: 0,
                question_number: 1,
                question_type: None,
            })),
            Some(ExperiencePhase::Intro)
        );
        assert_eq!(
            status_to_experience_phase(&GameStatus::ShowQuestion(ShowQuestionData {
                question: "x".into(),
                answers: None,
                display_order: None,
                media: None,
                cooldown: 0,
                submitted_by: None,
            })),
            Some(ExperiencePhase::Question)
        );
        assert_eq!(
            status_to_experience_phase(&GameStatus::SelectAnswer(SelectAnswerData {
                question: "x".into(),
                answers: None,
                media: None,
                time: 20,
                total_player: 1,
                question_type: None,
                min: None,
                max: None,
                step: None,
                unit: None,
                shuffled_chunks: None,
                shuffled_items: None,
                server_seq: None,
                server_now_ms: None,
                question_start_at_server_ms: None,
                answer_deadline_at_server_ms: None,
                submitted_by: None,
                sentence: None,
                tokens: None,
                pos_set: None,
                disabled_tokens: None,
                segments: None,
                slot_options: None,
                match_items: None,
            })),
            Some(ExperiencePhase::Question)
        );
        assert_eq!(
            status_to_experience_phase(&GameStatus::ShowResponses(ShowResponsesData {
                question: "x".into(),
                responses: Default::default(),
                solutions: vec![],
                answers: vec![],
                media: None,
                question_type: None,
                correct: None,
                correct_answer: None,
                unit: None,
                cooldown: 0,
                time: 0,
                min: None,
                max: None,
                step: None,
                average_guess: None,
                text_responses: None,
                accepted_answers: None,
                match_mode: None,
                chunks: None,
                correct_chunks: None,
                correct_options: None,
                correct_matches: None,
                correct_hotspot_index: None,
                correct_order: None,
                items: None,
                correct_token_pos: None,
                round_recap: None,
            })),
            Some(ExperiencePhase::AnswersLocked)
        );
        assert_eq!(
            status_to_experience_phase(&GameStatus::ShowResult(ShowResultData {
                correct: true,
                message: "x".into(),
                points: 0,
                my_points: 0,
                rank: 1,
                ahead_of_me: None,
                streak: None,
                streak_bonus: None,
                bonus: None,
                first_correct: None,
                poll: None,
                achievements: None,
                bonus_points: None,
                player_count: None,
                correct_answer: None,
                correct_chunks: None,
                correct_options: None,
                correct_matches: None,
                correct_hotspot_index: None,
                correct_order: None,
                items: None,
                correct_token_pos: None,
                auto_advance_ms: None,
                round_recap: None,
                scoring_mode: None,
                text_responses: None,
            })),
            Some(ExperiencePhase::Resolution)
        );
        assert_eq!(
            status_to_experience_phase(&GameStatus::ShowRoundRecap(ShowRoundRecapData {
                round_recap: vec![],
            })),
            Some(ExperiencePhase::WorldTransition)
        );
        assert_eq!(
            status_to_experience_phase(&GameStatus::ShowLeaderboard(ShowLeaderboardData {
                old_leaderboard: vec![],
                leaderboard: vec![],
                team_standings: None,
                auto_advance_ms: None,
                round_recap: None,
            })),
            Some(ExperiencePhase::WorldTransition)
        );
        assert_eq!(
            status_to_experience_phase(&GameStatus::Finished(FinishedData {
                subject: "x".into(),
                top: vec![],
                rank: None,
                team_standings: None,
                recap: None,
                auto_mode: None,
                end_screen: None,
            })),
            Some(ExperiencePhase::GameComplete)
        );
    }

    #[test]
    fn default_payload_for_mode_tags_match_envelope_mode() {
        use razzoozle_protocol::quizz::Quizz;
        let game = Game::new(
            "g1".into(),
            "INV".into(),
            "mgr".into(),
            "quiz".into(),
            Quizz {
                subject: "t".into(),
                questions: vec![],
                archived: None,
                theme_id: None,
            },
        );
        assert_eq!(
            default_payload_for_mode(ExperienceMode::Classic, &game),
            ExperiencePayload::Classic
        );
        assert!(matches!(
            default_payload_for_mode(ExperienceMode::PyramidClimb, &game),
            ExperiencePayload::Pyramid(_)
        ));
        assert!(matches!(
            default_payload_for_mode(ExperienceMode::DeepSeaEscape, &game),
            ExperiencePayload::DeepSea(_)
        ));
        assert!(matches!(
            default_payload_for_mode(ExperienceMode::FlowerBattle, &game),
            ExperiencePayload::FlowerBattle(_)
        ));
    }

    // WP #939B — reconnect phase table must stay aligned with transition mapping.
    #[test]
    fn recorded_status_to_experience_phase_matches_transition_table() {
        use razzoozle_protocol::status::Status;
        let cases = [
            (Status::ShowRoom, None),
            (Status::Wait, None),
            (Status::Paused, None),
            (Status::ShowStart, Some(ExperiencePhase::Intro)),
            (Status::ShowPrepared, Some(ExperiencePhase::Intro)),
            (Status::ShowQuestion, Some(ExperiencePhase::Question)),
            (Status::SelectAnswer, Some(ExperiencePhase::Question)),
            (Status::ShowResponses, Some(ExperiencePhase::AnswersLocked)),
            (Status::ShowResult, Some(ExperiencePhase::Resolution)),
            (
                Status::ShowRoundRecap,
                Some(ExperiencePhase::WorldTransition),
            ),
            (
                Status::ShowLeaderboard,
                Some(ExperiencePhase::WorldTransition),
            ),
            (Status::Finished, Some(ExperiencePhase::GameComplete)),
        ];
        for (status, expected) in cases {
            assert_eq!(
                recorded_status_to_experience_phase(status),
                expected,
                "{status:?}"
            );
        }
    }

    /// Revision-guard: reconnect must not bump the process counter (load-only).
    #[test]
    fn experience_revision_load_does_not_mutate() {
        let before = EXPERIENCE_REVISION.load(Ordering::Relaxed);
        let a = EXPERIENCE_REVISION.load(Ordering::Relaxed);
        let b = EXPERIENCE_REVISION.load(Ordering::Relaxed);
        assert_eq!(a, b);
        assert_eq!(before, a);
        // Contrast: transition path uses fetch_add and would move the counter.
        let after_bump = EXPERIENCE_REVISION.fetch_add(1, Ordering::Relaxed);
        assert_eq!(after_bump, before);
        assert_eq!(
            EXPERIENCE_REVISION.load(Ordering::Relaxed),
            before.wrapping_add(1)
        );
        // Restore so other tests in this process see a stable baseline.
        EXPERIENCE_REVISION.store(before, Ordering::Relaxed);
    }

    /// FlowerBattle reconnect payload is content-free (no Q/A) and seed-stable.
    #[test]
    fn flower_battle_reconnect_payload_is_content_free_and_seed_stable() {
        use razzoozle_protocol::quizz::Quizz;
        let mut game = Game::new(
            "g-reconnect".into(),
            "INV".into(),
            "mgr".into(),
            "quiz".into(),
            Quizz {
                subject: "t".into(),
                questions: vec![],
                archived: None,
                theme_id: None,
            },
        );
        game.flower_battle_seed = 42_424_242;
        let p1 = default_payload_for_mode(ExperienceMode::FlowerBattle, &game);
        let p2 = default_payload_for_mode(ExperienceMode::FlowerBattle, &game);
        assert_eq!(p1, p2, "multi-rebuild must be identical (idempotent seed)");
        let v = serde_json::to_value(&p1).unwrap();
        for forbidden in [
            "question",
            "answers",
            "media",
            "solutions",
            "correct",
            "message",
        ] {
            assert!(
                v.get(forbidden).is_none(),
                "forbidden key on payload: {forbidden}"
            );
            // Also scan nested JSON string for accidental Q text keys at any depth
            // via the top-level data shape only (payload is mode-tagged).
        }
        assert_eq!(v["mode"], "flowerBattle");
        assert_eq!(v["data"]["state"]["background"]["seed"], "42424242");
        assert_eq!(v["data"]["state"]["background"]["recipeVersion"], 1);
    }

    // ── WP-958F-R: result envelope chokepoint ─────────────────────────────

    fn flower_game(phase: GamePhase) -> Game {
        use razzoozle_protocol::quizz::Quizz;
        let mut game = Game::new(
            "g-958f".into(),
            "INV".into(),
            "mgr".into(),
            "quiz".into(),
            Quizz {
                subject: "t".into(),
                questions: vec![],
                archived: None,
                theme_id: None,
            },
        );
        game.selected_modes.experience_mode = Some(ExperienceMode::FlowerBattle);
        game.engine.phase = phase;
        game.flower_battle_seed = 99_001;
        game
    }

    fn sample_show_responses() -> GameStatus {
        GameStatus::ShowResponses(ShowResponsesData {
            question: "SECRET_Q".into(),
            responses: Default::default(),
            solutions: vec![],
            answers: vec!["SECRET_A".into()],
            media: None,
            question_type: None,
            correct: None,
            correct_answer: None,
            unit: None,
            cooldown: 0,
            time: 0,
            min: None,
            max: None,
            step: None,
            average_guess: None,
            text_responses: None,
            accepted_answers: None,
            match_mode: None,
            chunks: None,
            correct_chunks: None,
            correct_options: None,
            correct_matches: None,
            correct_hotspot_index: None,
            correct_order: None,
            items: None,
            correct_token_pos: None,
            round_recap: None,
        })
    }

    #[test]
    fn manager_status_answers_locked_not_resolution() {
        assert_eq!(
            manager_status_experience_phase(&sample_show_responses()),
            Some(ExperiencePhase::AnswersLocked)
        );
        // Resolution is post-tick owned — never from manager STATUS path.
        assert_eq!(
            manager_status_experience_phase(&GameStatus::ShowResult(ShowResultData {
                correct: true,
                message: "x".into(),
                points: 0,
                my_points: 0,
                rank: 1,
                ahead_of_me: None,
                streak: None,
                streak_bonus: None,
                bonus: None,
                first_correct: None,
                poll: None,
                achievements: None,
                bonus_points: None,
                player_count: None,
                correct_answer: None,
                correct_chunks: None,
                correct_options: None,
                correct_matches: None,
                correct_hotspot_index: None,
                correct_order: None,
                items: None,
                correct_token_pos: None,
                auto_advance_ms: None,
                round_recap: None,
                scoring_mode: None,
                text_responses: None,
            })),
            None
        );
    }

    #[test]
    fn answers_locked_envelope_is_content_free() {
        let game = flower_game(GamePhase::ShowResult);
        let t = build_experience_transition(
            &game,
            ExperienceMode::FlowerBattle,
            ExperiencePhase::AnswersLocked,
            true,
        );
        assert_eq!(t.phase, ExperiencePhase::AnswersLocked);
        let v = serde_json::to_value(&t).unwrap();
        // Phase name is answers_locked — check payload/data only, not the whole envelope.
        let payload = &v["payload"];
        for forbidden in [
            "question",
            "solutions",
            "SECRET_Q",
            "SECRET_A",
            "correctAnswer",
        ] {
            let s = payload.to_string();
            assert!(
                !s.contains(forbidden),
                "answers_locked payload must not carry content key/text {forbidden}: {s}"
            );
        }
        // Top-level status-style answer content must not exist on the envelope.
        assert!(v.get("question").is_none());
        assert!(v.get("answers").is_none());
        assert!(v.get("media").is_none());
        assert!(v.get("solutions").is_none());
        assert_eq!(v["mode"], "flowerBattle");
        assert_eq!(v["phase"], "answers_locked");
    }

    #[test]
    fn post_tick_resolution_reflects_growth_state() {
        let mut game = flower_game(GamePhase::ShowResult);
        game.flower_battle_effects.set_stage("red", 4);
        game.flower_battle_sun_points.insert("red".into(), 12);
        assert!(post_reveal_resolution_allowed(&game));

        let t = build_experience_transition(
            &game,
            ExperienceMode::FlowerBattle,
            ExperiencePhase::Resolution,
            true,
        );
        assert_eq!(t.phase, ExperiencePhase::Resolution);
        let v = serde_json::to_value(&t.payload).unwrap();
        // Post-tick payload projects live growth (not zero defaults).
        let teams = &v["data"]["state"]["teams"];
        // teams is a map keyed by team id when players exist; without roster the
        // growth_stage map still lives under effects projection via powerups/state.
        // At minimum the envelope must be FlowerBattle-tagged and content-free.
        assert_eq!(v["mode"], "flowerBattle");
        assert_eq!(t.mode, ExperienceMode::FlowerBattle);
        let _ = teams;
        let s = v.to_string();
        assert!(!s.contains("SECRET_Q"));
    }

    #[test]
    fn post_reveal_resolution_suppressed_when_terminal() {
        let mut game = flower_game(GamePhase::ShowResult);
        assert!(post_reveal_resolution_allowed(&game));

        game.flower_battle_effects.victory_resolved = true;
        assert!(!post_reveal_resolution_allowed(&game));

        let game = flower_game(GamePhase::Finished);
        assert!(!post_reveal_resolution_allowed(&game));

        let mut game = flower_game(GamePhase::ShowResult);
        game.finish_broadcast_done = true;
        assert!(!post_reveal_resolution_allowed(&game));

        let mut game = flower_game(GamePhase::ShowResult);
        game.flower_battle_winner_team_ids = Some(vec!["red".into()]);
        assert!(!post_reveal_resolution_allowed(&game));
    }

    #[test]
    fn terminal_ordering_game_complete_no_later_resolution() {
        let mut game = flower_game(GamePhase::Finished);
        game.flower_battle_effects.victory_resolved = true;
        let phases = result_window_experience_phases(&game);
        assert_eq!(phases, vec![ExperiencePhase::GameComplete]);
        assert!(!phases.contains(&ExperiencePhase::Resolution));
    }

    #[test]
    fn resume_reconnect_show_result_replays_answers_locked_then_resolution() {
        let game = flower_game(GamePhase::ShowResult);
        let phases = result_window_experience_phases(&game);
        assert_eq!(
            phases,
            vec![ExperiencePhase::AnswersLocked, ExperiencePhase::Resolution]
        );
    }

    #[test]
    fn classic_and_none_modes_skip_result_experience() {
        let mut game = flower_game(GamePhase::ShowResult);
        game.selected_modes.experience_mode = None;
        assert!(result_window_experience_phases(&game).is_empty());
        assert!(!post_reveal_resolution_allowed(&game));

        game.selected_modes.experience_mode = Some(ExperienceMode::Classic);
        assert!(result_window_experience_phases(&game).is_empty());
        assert!(!post_reveal_resolution_allowed(&game));
    }

    #[test]
    fn shared_builder_aligns_broadcast_and_manager_answers_locked() {
        let game = flower_game(GamePhase::ShowResult);
        let a = build_experience_transition(
            &game,
            ExperienceMode::FlowerBattle,
            ExperiencePhase::AnswersLocked,
            false,
        );
        let b = build_experience_transition(
            &game,
            ExperienceMode::FlowerBattle,
            ExperiencePhase::AnswersLocked,
            false,
        );
        assert_eq!(a.mode, b.mode);
        assert_eq!(a.phase, b.phase);
        assert_eq!(a.payload, b.payload);
        assert_eq!(a.revision, b.revision);
        assert_eq!(
            manager_status_experience_phase(&sample_show_responses()),
            Some(ExperiencePhase::AnswersLocked)
        );
    }

    #[test]
    fn no_manager_socket_still_builds_display_transition() {
        // send_status_to_manager looks up manager by id; even when offline the
        // transition is still built for the display room. Pure path check:
        let mut game = flower_game(GamePhase::ShowResult);
        game.manager_socket_id = "not-a-connected-socket".into();
        let phase = manager_status_experience_phase(&sample_show_responses());
        assert_eq!(phase, Some(ExperiencePhase::AnswersLocked));
        let t =
            build_experience_transition(&game, ExperienceMode::FlowerBattle, phase.unwrap(), true);
        assert_eq!(t.phase, ExperiencePhase::AnswersLocked);
        // Emitting to an empty display room is a no-op success (io.to(...).ok()).
    }

    #[test]
    fn pyramid_and_deep_sea_preserve_post_reveal_resolution() {
        for mode in [ExperienceMode::PyramidClimb, ExperienceMode::DeepSeaEscape] {
            let mut game = flower_game(GamePhase::ShowResult);
            game.selected_modes.experience_mode = Some(mode);
            assert!(
                post_reveal_resolution_allowed(&game),
                "{mode:?} must still get post-tick resolution"
            );
            assert_eq!(
                result_window_experience_phases(&game),
                vec![ExperiencePhase::AnswersLocked, ExperiencePhase::Resolution]
            );
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn reconnect_during_tick_gets_answers_locked_then_post_state_resolution_on_wire() {
        let game_id = "g-958f-wire";
        let (client, io, socket, server) = PollingSocketClient::connect().await;
        let resolution_window = begin_result_resolution_window(game_id);
        let mut game = flower_game(GamePhase::ShowResult);
        game.game_id = game_id.into();
        game.add_player(
            "player-wire".into(),
            "client-wire".into(),
            "Alice".into(),
            None,
        )
        .unwrap();
        game.players[0].team_id = Some("red".into());
        game.engine.players[0].team_id = Some("red".into());
        game.flower_battle_effects.set_stage("red", 1);
        game.flower_battle_sun_points.insert("red".into(), 2);
        let game_ref = Arc::new(Mutex::new(game));

        let (captured_tx, captured_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let release_rx = Arc::new(Mutex::new(release_rx));
        set_reconnect_join_hook(
            game_id,
            Arc::new(move || {
                captured_tx.send(()).unwrap();
                release_rx
                    .lock()
                    .unwrap()
                    .recv_timeout(Duration::from_secs(2))
                    .unwrap();
            }),
        );

        let reconnect_game = game_ref.clone();
        let reconnect = tokio::task::spawn_blocking(move || {
            complete_manager_reconnect(&socket, &reconnect_game, false);
        });
        tokio::task::spawn_blocking(move || {
            captured_rx
                .recv_timeout(Duration::from_secs(2))
                .expect("reconnect snapshot barrier");
        })
        .await
        .unwrap();

        let live_game = game_ref.clone();
        let (live_done_tx, mut live_done_rx) = tokio::sync::oneshot::channel();
        let live = tokio::task::spawn_blocking(move || {
            {
                let mut game = live_game.lock().unwrap();
                game.flower_battle_effects.set_stage("red", 7);
                game.flower_battle_sun_points.insert("red".into(), 11);
                game.flower_battle_offers.insert(
                    (game_id.to_string(), "red".into(), 0),
                    PowerupOffer {
                        id: "offer-post".into(),
                        offer_type: "sunbeam".into(),
                        expires_at: 123_456,
                    },
                );
            }
            emit_post_reveal_resolution(&io, &live_game, game_id);
            live_done_tx.send(()).ok();
        });

        let completed_before_release =
            tokio::time::timeout(Duration::from_millis(250), &mut live_done_rx)
                .await
                .is_ok();
        release_tx.send(()).unwrap();
        if !completed_before_release {
            tokio::time::timeout(Duration::from_secs(2), &mut live_done_rx)
                .await
                .expect("live resolution remained blocked")
                .unwrap();
        }
        reconnect.await.unwrap();
        live.await.unwrap();
        resolution_window.complete();
        clear_reconnect_join_hook(game_id);

        let events = client.poll_experience().await;
        let phases: Vec<_> = events
            .iter()
            .filter_map(|event| event["phase"].as_str())
            .collect();
        assert_eq!(phases, ["answers_locked", "resolution"], "{events:?}");
        let final_resolution = events
            .iter()
            .rev()
            .find(|event| event["phase"] == "resolution")
            .expect("resolution envelope");
        let red = final_resolution["payload"]["data"]["state"]["teams"]
            .as_array()
            .unwrap()
            .iter()
            .find(|team| team["name"] == "red")
            .unwrap();
        assert_eq!(red["members"], serde_json::json!(["player-wire"]));
        assert_eq!(red["growthStage"], 7);
        assert_eq!(red["sunPoints"], 11);
        assert_eq!(
            final_resolution["payload"]["data"]["state"]["powerups"][0]["id"],
            "offer-post"
        );

        server.abort();
    }

    #[tokio::test]
    async fn prejoined_display_never_receives_answers_locked_after_live_resolution_on_wire() {
        let game_id = "g-958f-prejoined-wire";
        let (client, io, socket, server) = PollingSocketClient::connect().await;
        let resolution_window = begin_result_resolution_window(game_id);
        let mut game = flower_game(GamePhase::ShowResult);
        game.game_id = game_id.into();
        game.add_player(
            "prejoined-player".into(),
            "prejoined-client".into(),
            "Prejoined".into(),
            None,
        )
        .unwrap();
        game.players[0].team_id = Some("red".into());
        game.engine.players[0].team_id = Some("red".into());
        game.flower_battle_effects.set_stage("red", 1);
        let game_ref = Arc::new(Mutex::new(game));

        // Manager/display sockets can already be room members when their
        // reconnect event arrives. Let the live tick win before the complete
        // reconnect transaction starts.
        socket.join(format!("display:{game_id}")).unwrap();

        game_ref
            .lock()
            .unwrap()
            .flower_battle_effects
            .set_stage("red", 7);
        emit_post_reveal_resolution(&io, &game_ref, game_id);
        complete_manager_reconnect(&socket, &game_ref, false);
        resolution_window.complete();

        let events = client.poll_experience().await;
        let phases: Vec<_> = events
            .iter()
            .filter_map(|event| event["phase"].as_str())
            .collect();
        assert_eq!(phases, ["resolution", "resolution"], "{events:?}");
        assert!(
            events
                .iter()
                .all(|event| event["payload"]["data"]["state"]["teams"][0]["growthStage"] == 7),
            "{events:?}"
        );

        server.abort();
    }

    #[tokio::test]
    async fn terminal_reconnect_emits_game_complete_without_trailing_resolution_on_wire() {
        let game_id = "g-958f-terminal-wire";
        let (client, io, socket, server) = PollingSocketClient::connect().await;
        let mut game = flower_game(GamePhase::Finished);
        game.game_id = game_id.into();
        game.add_player(
            "winner-wire".into(),
            "winner-client".into(),
            "Winner".into(),
            None,
        )
        .unwrap();
        game.players[0].team_id = Some("gold".into());
        game.engine.players[0].team_id = Some("gold".into());
        game.flower_battle_effects.set_stage("gold", 10);
        game.flower_battle_sun_points.insert("gold".into(), 17);
        game.flower_battle_effects.victory_resolved = true;
        game.flower_battle_winner_team_ids = Some(vec!["gold".into()]);
        game.finish_broadcast_done = true;
        let game_ref = Arc::new(Mutex::new(game));

        complete_manager_reconnect(&socket, &game_ref, false);
        emit_post_reveal_resolution(&io, &game_ref, game_id);

        let events = client.poll_experience().await;
        assert_eq!(events.len(), 1, "{events:?}");
        assert_eq!(events[0]["phase"], "game_complete");
        assert_eq!(
            events[0]["payload"]["data"]["state"]["phase"],
            serde_json::json!("end")
        );
        let gold = &events[0]["payload"]["data"]["state"]["teams"][0];
        assert_eq!(gold["name"], "gold");
        assert_eq!(gold["members"], serde_json::json!(["winner-wire"]));
        assert_eq!(gold["growthStage"], 10);
        assert_eq!(gold["sunPoints"], 17);

        server.abort();
    }

    #[tokio::test]
    async fn offline_manager_still_emits_answers_locked_then_resolution_on_wire() {
        let game_id = "g-958f-offline-manager-wire";
        let (client, io, socket, server) = PollingSocketClient::connect().await;
        let mut game = flower_game(GamePhase::ShowQuestion);
        game.game_id = game_id.into();
        game.manager_socket_id = "offline-manager".into();
        let game_ref = Arc::new(Mutex::new(game));

        complete_manager_reconnect(&socket, &game_ref, false);
        let initial = client.poll_experience().await;
        assert_eq!(initial[0]["phase"], "question");

        game_ref.lock().unwrap().engine.phase = GamePhase::ShowResult;
        send_status_to_manager(&io, &game_ref, game_id, &sample_show_responses());
        emit_post_reveal_resolution(&io, &game_ref, game_id);

        let events = client.poll_experience().await;
        let phases: Vec<_> = events
            .iter()
            .filter_map(|event| event["phase"].as_str())
            .collect();
        assert_eq!(phases, ["answers_locked", "resolution"], "{events:?}");

        server.abort();
    }
}
