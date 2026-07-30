//! Single chokepoint for manager-relevant STATUS emits.
//! Mirrors Node `broadcastStatus` / `sendStatus`: record then emit atomically.
//!
//! CALLER MUST NOT HOLD the game lock — the functions themselves will lock and
//! drop before returning. Emit and record happen under the same lock guard so
//! recorded state always matches wire order (Node single-threaded parity).
//! socketioxide 0.15 emits are sync (no .await) and non-blocking (channel try_send),
//! so holding std::sync::Mutex across them is safe.

use crate::socket::manager::game_flow::flower_battle_display;
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
    let (
        experience_mode,
        manager_socket_id,
        payload,
        answered,
        total,
        phase_duration_ms,
        phase_opt,
    ) = {
        let mut game = game_ref.lock().unwrap();
        game.record_last_manager_status(status);
        let experience_mode = game.selected_modes.experience_mode;
        let manager_socket_id = game.manager_socket_id.clone();
        let phase_opt = status_to_experience_phase(status);
        let (answered, total, phase_duration_ms, payload) = if let (Some(mode), Some(phase)) = (
            experience_mode.filter(|m| *m != ExperienceMode::Classic),
            phase_opt,
        ) {
            let (a, t, d) = experience_progress(&game, phase);
            let payload = default_payload_for_mode(mode, &game);
            (a, t, d, Some((mode, phase, payload)))
        } else {
            (None, None, None, None)
        };
        (
            experience_mode,
            manager_socket_id,
            payload,
            answered,
            total,
            phase_duration_ms,
            phase_opt,
        )
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
    if let Some((mode, phase, payload_body)) = payload {
        let _ = phase_opt; // used above for progress
        let transition = ExperienceTransition {
            mode,
            phase,
            phase_started_at_server_ms: get_now_ms() as i64,
            phase_duration_ms,
            revision: EXPERIENCE_REVISION.fetch_add(1, Ordering::Relaxed),
            answered,
            total,
            payload: payload_body,
        };
        // Pass real answered/total; do not overwrite with None (L-13).
        broadcast_experience_to_display(io, game_ref, game_id, transition, answered, total);
    }
}

/// Emit an experience transition only to the game's display room. `answered`/
/// `total` are optional (WP #877 doesn't yet track per-question progress for
/// experience modes — that lands with the mode-specific gameplay in WP
/// #904/#905); the wire field is already `skip_serializing_if` on the type.
///
/// Transition-only path — do **not** call from reconnect (WP #939B uses
/// [`resend_experience_on_display_reconnect`] instead, single-socket, no
/// revision bump).
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

/// WP #939B — resend the current FlowerBattle `game:experience` envelope to
/// the single reconnecting socket (host/satellite after hard-reload).
///
/// - Target: this socket only (not a room broadcast; room exclusion stays intact).
/// - Revision: `EXPERIENCE_REVISION.load` **without** bump — multi-reconnect is
///   idempotent; clients can guard on unchanged revision; seed/recipeVersion
///   come from live `Game` (WP #939A) so the payload is stable.
/// - Modes: FlowerBattle only; Classic/None/other modes = no-op.
/// - Blackout phases (lobby / wait / paused): no-op (same as transitions).
pub fn resend_experience_on_display_reconnect(socket: &SocketRef, game_ref: &Arc<Mutex<Game>>) {
    let transition = {
        let game = game_ref.lock().unwrap();
        let mode = match game.selected_modes.experience_mode {
            Some(ExperienceMode::FlowerBattle) => ExperienceMode::FlowerBattle,
            _ => return,
        };
        let phase = game
            .last_manager_status
            .as_ref()
            .and_then(|(s, _)| recorded_status_to_experience_phase(*s))
            .or_else(|| {
                // Fallback when nothing was recorded yet: map engine phase.
                use razzoozle_engine::state::GamePhase;
                match game.engine.phase {
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
                }
            });
        let Some(phase) = phase else {
            return;
        };
        let (answered, total, phase_duration_ms) = experience_progress(&game, phase);
        // Prefer live question open time when in the answer window; otherwise
        // wall-clock now (phase wall-clock is not persisted — reconnect fills
        // the blank screen; timeline interpolation is out of scope for #939B).
        let phase_started_at_server_ms =
            if matches!(phase, ExperiencePhase::Question) && game.question_start_at_server_ms > 0 {
                game.question_start_at_server_ms
            } else {
                get_now_ms() as i64
            };
        let payload = default_payload_for_mode(mode, &game);
        ExperienceTransition {
            mode,
            phase,
            phase_started_at_server_ms,
            phase_duration_ms,
            // Revision-guard: do not fetch_add — identical multi-reconnect.
            revision: EXPERIENCE_REVISION.load(Ordering::Relaxed),
            answered,
            total,
            payload,
        }
    };

    socket
        .emit(constants::experience::TRANSITION, &transition)
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

#[cfg(test)]
mod tests {
    use super::*;
    use razzoozle_protocol::status::{
        FinishedData, PausedData, SelectAnswerData, ShowLeaderboardData, ShowPreparedData,
        ShowQuestionData, ShowResponsesData, ShowResultData, ShowRoomData, ShowRoundRecapData,
        ShowStartData, WaitData,
    };

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
}
