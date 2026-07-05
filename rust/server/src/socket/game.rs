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

        move |socket: SocketRef, Data::<String>(quizz_id)| {
            let registry = registry.clone();
            let socket_id = socket_id.clone();
            let quiz_id = if quizz_id.is_empty() {
                None
            } else {
                Some(quizz_id)
            };

            tokio::spawn(async move {
                let mut registry = registry.write().await;
                // C3 — active-game cap
                match registry.create_game(socket_id.clone(), quiz_id) {
                    Ok((game_id, invite_code, host_token)) => {
                        info!(
                            "Game created: gameId={}, inviteCode={}",
                            game_id, invite_code
                        );

                        // Join socket to the game room
                        socket.join(game_id.clone()).ok();

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
