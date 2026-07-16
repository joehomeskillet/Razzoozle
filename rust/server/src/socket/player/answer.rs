use super::HandlerCtx;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::{
    GameStatus, WaitData,
};
use serde_json;
use socketioxide::extract::{Data, SocketRef};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH, Duration};

const SCOREBOARD_THROTTLE_MS: u64 = 100;

pub(super) fn register_selected_answer(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::player::SELECTED_ANSWER, {
        let registry = ctx.registry.clone();
        let io_handle = ctx.io.clone();
        let client_id = ctx.client_id.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = registry.clone();
            let io_handle = io_handle.clone();
            let client_id = client_id.clone();

            tokio::spawn(async move {
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                // Extract all answer fields
                let data_obj = payload.get("data");

                // #6: Validate answer data shape (must be non-null object)
                if data_obj.is_none() || !data_obj.unwrap().is_object() {
                    socket.emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer").ok();
                    return;
                }

                let answer_key_opt = data_obj
                    .and_then(|v| v.get("answerKey"))
                    .and_then(|v| v.as_i64())
                    .map(|v| v as i32);

                let answer_keys_opt = data_obj
                    .and_then(|v| v.get("answerKeys"))
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_i64().map(|n| n as i32))
                            .collect::<Vec<i32>>()
                    });

                // #6: Validate answerKeys array is 1-4 elements if present
                if let Some(ref keys) = answer_keys_opt {
                    if keys.is_empty() || keys.len() > 4 {
                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer").ok();
                        return;
                    }
                }

                let answer_text_opt = data_obj
                    .and_then(|v| v.get("answerText"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // #6: Validate answerText ≤ 400 chars if present
                if let Some(ref text) = answer_text_opt {
                    if text.len() > 400 {
                        socket.emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer").ok();
                        return;
                    }
                }

                // Parse clientMessageId for low-latency ack
                let client_message_id = data_obj
                    .and_then(|v| v.get("clientMessageId"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // SEC-04: Extract playerToken for answer impersonation gate
                let player_token_opt = data_obj
                    .and_then(|v| v.get("playerToken"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // Get current server time (wall-clock) for response_time_ms calculation
                // This must be hoisted ABOVE the lock so it survives to the emit
                let server_now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = registry.read().await;
                        registry.get_game_by_id(game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        let (record_result, low_latency) = {
                            let mut game = game_ref.lock().unwrap();
                            // Use the durable clientId from the socket handshake (captured at
                            // connect). The old code matched `p.id == socket.id`, but p.id is a
                            // generated player id that never equals socket.id — so the answer was
                            // stored under the raw socket id and reveal never found it → 0 points
                            // for every player. clientId is the same key reveal looks answers up by.

                            // Set engine clock to current wall-clock time so record_answer
                            // calculates response_time_ms correctly
                            game.engine.set_clock_ms(server_now_ms);

                            // SEC-04: token↔player-Match für JEDE Antwort. clientId ist client-
                            // kontrolliert (main.rs Handshake) und allein KEIN Auth-Nachweis.
                            let token_ok = match game.players.iter().find(|p| p.client_id == client_id) {
                                Some(p) => answer_token_gate(p.player_token.as_deref(), player_token_opt.as_deref()),
                                None => true,
                            };

                            if !token_ok {
                                drop(game);
                                tracing::warn!("answer denied: playerToken mismatch/missing (game={}, client_id={})", game_id, client_id);
                                socket.emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer").ok();
                                return;
                            }

                            let result = game.engine.record_answer(
                                &client_id,
                                answer_key_opt,
                                answer_keys_opt,
                                answer_text_opt,
                            );

                            // Touch activity on successful answer
                            if result.is_ok() {
                                game.touch();
                            }

                            // Capture low_latency flag for later use outside the lock
                            (result, game.low_latency)
                        };

                        // #6: Handle InvalidAnswerShape error from engine
                        match record_result {
                            Ok(_) => {
                                let game_id = game_id.to_string();

                                // Emit game:playerAnswer (count) to all in room
                                if low_latency {
                                    // Low-latency mode: coalesce via pending flag
                                    let should_spawn = {
                                        let mut game = game_ref.lock().unwrap();
                                        let should_spawn = !game.answer_count_push_pending;
                                        if should_spawn {
                                            game.answer_count_push_pending = true;
                                        }
                                        should_spawn
                                    };

                                    if should_spawn {
                                        let game_ref = game_ref.clone();
                                        let io_handle = io_handle.clone();
                                        let game_id = game_id.clone();

                                        tokio::spawn(async move {
                                            tokio::time::sleep(Duration::from_millis(SCOREBOARD_THROTTLE_MS)).await;

                                            // Re-lock and reset pending flag
                                            let should_emit = {
                                                let mut game = game_ref.lock().unwrap();
                                                game.answer_count_push_pending = false;
                                                // Only emit if still in SelectAnswer phase (not revealed yet)
                                                game.engine.phase == GamePhase::SelectAnswer
                                            };

                                            if should_emit {
                                                let answer_count = {
                                                    let game = game_ref.lock().unwrap();
                                                    game.engine.current_answers.len() as i32
                                                };
                                                io_handle.to(game_id).emit(constants::game::PLAYER_ANSWER, &answer_count).ok();
                                            }
                                        });
                                    }
                                } else {
                                    // Non-LL mode: emit immediately (existing behavior)
                                    let answer_count = {
                                        let game = game_ref.lock().unwrap();
                                        game.engine.current_answers.len() as i32
                                    };
                                    io_handle.to(game_id).emit(constants::game::PLAYER_ANSWER, &answer_count).ok();
                                }

                                // Emit WAIT status to the answering player's OWN socket only —
                                // matches node's `this.send(socket.id, STATUS.WAIT, ...)`
                                // (round-manager.ts selectAnswer()). Broadcasting this to the
                                // whole room (the previous rust behaviour) flipped the
                                // manager's AND every other still-answering player's screen
                                // away from the Answers view (losing the live X/Y count and,
                                // for other players, the answer buttons themselves) as soon as
                                // ONE player answered — which is exactly why the host got
                                // stuck on "0/1" and "all answered" never fired.
                                let wait_status = GameStatus::Wait(WaitData {
                                    text: "game:waitingForAnswers".to_string(),
                                    team_mode: None,
                                });
                                socket
                                    .emit(constants::game::STATUS, &wait_status).ok();

                                // Emit player:answerAck for low-latency mode
                                if low_latency {
                                    let ack = razzoozle_protocol::player::AnswerAck {
                                        accepted: true,
                                        reason: razzoozle_protocol::player::AnswerAckReason::Ok,
                                        server_received_at_ms: server_now_ms,
                                        client_message_id: client_message_id.clone(),
                                    };
                                    socket.emit(constants::player::ANSWER_ACK, &ack).ok();
                                }

                                // #7: Auto-advance if all players (connected + disconnected) have answered
                                let should_auto_advance = {
                                    let game = game_ref.lock().unwrap();
                                    if game.engine.phase != GamePhase::SelectAnswer {
                                        false
                                    } else {
                                        let total_player_count = game.players.len();
                                        let answered_count = game.engine.current_answers.len();

                                        // Fire only if all players (including disconnected) have answered and we have at least 1 player
                                        total_player_count > 0 && answered_count >= total_player_count
                                    }
                                };

                                if should_auto_advance {
                                    // Don't reveal directly here — signal the game-lifecycle
                                    // task's per-question cooldown ticker (socket::lifecycle::
                                    // run_game_lifecycle) to wake immediately instead. It is the
                                    // ONE place that calls engine.reveal()/perform_reveal_and_
                                    // broadcast, so a natural timeout racing this all-answered
                                    // signal can never double-reveal (engine.reveal() is also
                                    // phase-guarded as a second line of defence).
                                    super::lifecycle::request_abort(&game_ref, GamePhase::SelectAnswer);
                                }
                            }
                            Err(_) => {
                                // Engine returned an error (e.g., InvalidAnswerShape)
                                socket.emit(constants::game::ERROR_MESSAGE, "errors:game.invalidAnswer").ok();
                            }
                        }
                    }
                }
            });
        }
    });
}

/// true = answer may be recorded.
///
/// Gate: if player has stored token (all regularly-joined via add_player),
/// supplied token must match exactly. Legacy players (snapshot-restores from
/// pre-token era, player_token = None) are allowed.
pub(crate) fn answer_token_gate(stored: Option<&str>, supplied: Option<&str>) -> bool {
    match stored {
        Some(s) => supplied == Some(s),
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::answer_token_gate;

    #[test]
    fn denies_when_token_missing() {
        assert!(!answer_token_gate(Some("a"), None));
    }

    #[test]
    fn denies_when_token_mismatched() {
        assert!(!answer_token_gate(Some("a"), Some("b")));
    }

    #[test]
    fn allows_when_token_matches() {
        assert!(answer_token_gate(Some("a"), Some("a")));
    }

    #[test]
    fn allows_legacy_player_without_stored_token() {
        assert!(answer_token_gate(None, Some("anything")));
    }
}
