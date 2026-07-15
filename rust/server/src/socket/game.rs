//! Game lifecycle handlers: CREATE and DISCONNECT
use super::HandlerCtx;
use razzoozle_protocol::constants;
use razzoozle_protocol::game::GameCreate;
use razzoozle_protocol::game::SelectedModes;
use razzoozle_protocol::game::EndScreen;
use razzoozle_protocol::status::ScoringMode;
use socketioxide::extract::{Data, SocketRef};
use tracing::info;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_create(socket, ctx.clone());
    register_disconnect(socket, ctx);
}

fn register_create(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::game::CREATE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<GameCreate>(create_payload)| {
            let ctx = ctx.clone();

            // Parse payload — handle both legacy string and new CreateGamePayload
            let (quizz_id, selected_modes) = match create_payload {
                GameCreate::Legacy(id) => {
                    // Old client: bare quizzId string → no mode selection
                    let qid = if id.is_empty() { None } else { Some(id) };
                    (qid, None)
                },
                GameCreate::CreatePayload(payload) => {
                    // New client: extract quizzId + validate modes
                    let qid = if payload.quizz_id.is_empty() { None } else { Some(payload.quizz_id) };
                    (qid, payload.selected_modes)
                }
            };

            tokio::spawn(async move {
                // W0-A3: Require authentication to create a game; get owner_user_id from session
                let owner_user_id = match ctx.require_user().await {
                    Some(user) => Some(user.user_id),
                    None => None,
                };

                // Read global config for availability gates
                let (team_mode_avail, low_latency_enabled, _, randomize_answers, scoring_mode_avail,
                     low_latency_config, klassen_enabled, end_screen_modes) =
                    crate::db::get_game_config(&ctx.db_pool).await;

                let low_latency = low_latency_enabled.unwrap_or(false);

                // Validate + snapshot modes against availability
                let (validated_scoring_mode, validated_team_mode, validated_klassen, validated_end_screen) = {
                    let req_scoring = selected_modes.as_ref()
                        .and_then(|m| m.scoring_mode.as_ref())
                        .and_then(|s| if s == "speed" { Some(ScoringMode::Speed) } else if s == "accuracy" { Some(ScoringMode::Accuracy) } else { None });

                    let req_team = selected_modes.as_ref().and_then(|m| m.team_mode).unwrap_or(false);
                    let req_klassen = selected_modes.as_ref().and_then(|m| m.klassen).unwrap_or(false);
                    let req_end_screen = selected_modes.as_ref().and_then(|m| m.end_screen);

                    // Drop unavailable modes: only keep if both requested AND enabled
                    let team = req_team && team_mode_avail.unwrap_or(false);
                    let klassen = req_klassen && klassen_enabled.unwrap_or(false);

                    // Scoring mode: use request if available, else default to Speed
                    let scoring = if let Some(sm) = req_scoring {
                        sm
                    } else {
                        ScoringMode::Speed
                    };

                    // End-screen: validate against CSV allow-list with exact token matching.
                    // Fall back to first allowed mode if requested is not in allow-list.
                    let end_screen = if let Some(es) = req_end_screen {
                        let allow_list_str = end_screen_modes.unwrap_or_else(|| "full,top3,private".to_string());
                        let allowed_tokens: Vec<&str> = allow_list_str.split(',').map(|s| s.trim()).collect();
                        let es_str = format!("{:?}", es).to_lowercase();

                        if allowed_tokens.contains(&es_str.as_str()) {
                            // Requested mode is in allow-list
                            es
                        } else if let Some(first_allowed) = allowed_tokens.first() {
                            // Fall back to first allowed mode
                            match *first_allowed {
                                "top3" => EndScreen::Top3,
                                "private" => EndScreen::Private,
                                _ => EndScreen::Full,
                            }
                        } else {
                            // Fallback to Full if allow-list is empty (should not happen)
                            EndScreen::Full
                        }
                    } else {
                        EndScreen::Full
                    };

                    (scoring, team, klassen, end_screen)
                };

                // Fetch achievements config for this game (N3 requirement)
                let ach_rows = crate::db::get_achievements(&ctx.db_pool).await;

                let mut registry = ctx.registry.write().await;

                // C3 — active-game cap; also rejects an unresolved quizzId
                // (parity with Node — see create_game's own doc comment).
                let create_result = registry.create_game(socket.id.to_string(), quizz_id.clone(), ctx.client_id.clone(), owner_user_id, low_latency, low_latency_config.unwrap_or_else(|| serde_json::json!({"enabled": false, "clockSync": true})));

                match create_result {
                    Ok((game_id, invite_code, host_token)) => {
                        info!(
                            "Game created: gameId={}, inviteCode={}",
                            game_id, invite_code
                        );

                        // Join socket to the game room
                        socket.join(game_id.clone()).ok();

                        // Inject achievements config and mode snapshots via setters (inside the write guard)
                        let overrides = razzoozle_engine::achievements::rows_to_overrides(&ach_rows);
                        let cfg = razzoozle_engine::achievements::merge_config(&overrides);
                        if let Some(game_arc) = registry.get_game_by_id(&game_id) {
                            let mut g = game_arc.lock().unwrap();
                            g.engine.set_achievements_config(cfg);
                            g.engine.set_randomize_answers(randomize_answers.unwrap_or(false));
                            g.engine.set_scoring_mode(validated_scoring_mode);

                            // Snapshot per-game mode selection
                            g.selected_modes = SelectedModes {
                                scoring_mode: Some(
                                    if validated_scoring_mode == ScoringMode::Speed { "speed".to_string() }
                                    else { "accuracy".to_string() }
                                ),
                                team_mode: Some(validated_team_mode),
                                klassen: Some(validated_klassen),
                                end_screen: Some(validated_end_screen),
                            };
                        }

                        // Emit manager:gameCreated with protocol type
                        let payload = razzoozle_protocol::manager::ManagerGameCreated {
                            game_id,
                            invite_code,
                            host_token: Some(host_token),
                        };

                        socket
                            .emit(constants::manager::GAME_CREATED, &payload)
                            .ok();
                    }
                    Err(e) => {
                        socket
                            .emit(constants::game::ERROR_MESSAGE, e)
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_disconnect(socket: &SocketRef, ctx: HandlerCtx) {
    let registry = ctx.registry.clone();
    let io_handle = ctx.io.clone();
    let socket_id = socket.id.to_string();

    socket.on_disconnect(move |_: SocketRef| {
        let registry = registry.clone();
        let io_handle = io_handle.clone();
        let socket_id = socket_id.clone();

        tokio::spawn(async move {
            let removed_player = {
                let mut registry = registry.write().await;
                registry.mark_player_disconnected(&socket_id)
            };

            if let Some((game_id, manager_socket_id, removed_player_id, total_players, removed)) =
                removed_player
            {
                info!(
                    "Player disconnected: gameId={}, clientId={}, totalPlayers={}",
                    game_id, removed_player_id, total_players
                );

                io_handle
                    .to(game_id.clone())
                    .emit(constants::game::TOTAL_PLAYERS, &(total_players as i32))
                    .ok();

                if removed {
                    if let Ok(sid) = manager_socket_id.parse() {
                        if let Some(manager_socket) = io_handle.get_socket(sid) {
                            manager_socket
                                .emit(constants::manager::REMOVE_PLAYER, &removed_player_id)
                                .ok();
                        }
                    }
                }
            } else {
                info!("Client disconnected: socketId={}", socket_id);
            }
        });
    });
}
