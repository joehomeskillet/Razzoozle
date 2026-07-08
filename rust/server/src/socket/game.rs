//! Game lifecycle handlers: CREATE and DISCONNECT
use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use tracing::info;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_create(socket, ctx.clone());
    register_disconnect(socket, ctx);
}

fn register_create(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::game::CREATE, {
        let registry = ctx.registry.clone();
        let socket_id = socket.id.to_string();
        let client_id = ctx.client_id.clone();
        let db_pool = ctx.db_pool.clone();

        move |socket: SocketRef, Data::<String>(quizz_id)| {
            let registry = registry.clone();
            let socket_id = socket_id.clone();
            let client_id = client_id.clone();
            let db_pool = db_pool.clone();
            let quiz_id = if quizz_id.is_empty() {
                None
            } else {
                Some(quizz_id)
            };

            tokio::spawn(async move {
                // Snapshot the current (server-global) low-latency config onto
                // the new Game at creation time, so a later per-ping gate
                // (separate WP) can check game.low_latency synchronously
                // instead of an async DB round-trip on every clock:ping.
                let (_, low_latency_enabled, _, randomize_answers, _) = crate::db::get_game_config(&db_pool).await;
                let low_latency = low_latency_enabled.unwrap_or(false);

                // Fetch achievements config for this game (N3 requirement)
                let ach_rows = crate::db::get_achievements(&db_pool).await;

                let mut registry = registry.write().await;
                // C3 — active-game cap; also rejects an unresolved quizzId
                // (parity with Node — see create_game's own doc comment).
                match registry.create_game(socket_id.clone(), quiz_id, client_id.clone(), low_latency) {
                    Ok((game_id, invite_code, host_token)) => {
                        info!(
                            "Game created: gameId={}, inviteCode={}",
                            game_id, invite_code
                        );

                        // Join socket to the game room
                        socket.join(game_id.clone()).ok();

                        // Inject achievements config via setter (inside the write guard)
                        let overrides = razzoozle_engine::achievements::rows_to_overrides(&ach_rows);
                        let cfg = razzoozle_engine::achievements::merge_config(&overrides);
                        if let Some(game_arc) = registry.get_game_by_id(&game_id) {
                            let mut g = game_arc.lock().unwrap();
                            g.engine.set_achievements_config(cfg);
                            g.engine.set_randomize_answers(randomize_answers.unwrap_or(false));
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
