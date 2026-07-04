mod game;
mod types;

use axum::{
    http::StatusCode,
    routing::get,
    Router,
};
use game::GameRegistry;
use socketioxide::extract::{Data, SocketRef};
use socketioxide::SocketIo;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use types::*;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let registry = Arc::new(RwLock::new(GameRegistry::new()));

    // Create Socket.IO instance
    let (layer, io) = SocketIo::builder().build_layer();

    // Configure socket handlers
    let io_handle = io.clone();
    io.ns("/", {
        let registry = Arc::clone(&registry);
        move |socket: SocketRef, Data(auth): Data<serde_json::Value>| {
            let registry = Arc::clone(&registry);
            let io_handle = io_handle.clone();

            // Extract clientId from auth
            let client_id = auth
                .get("clientId")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            info!("Client connected: client_id={}", client_id);

            // Handle GAME.CREATE event
            socket.on(events::GAME_CREATE, {
                let registry = Arc::clone(&registry);
                let socket_id = socket.id.to_string();

                move |socket: SocketRef, Data::<String>(_quizz_id)| {
                    let registry = Arc::clone(&registry);
                    let socket_id = socket_id.clone();

                    tokio::spawn(async move {
                        let mut registry = registry.write().await;
                        let (game_id, invite_code) = registry.create_game(socket_id.clone());

                        info!(
                            "Game created: gameId={}, invite_code={}",
                            game_id, invite_code
                        );

                        // Join socket to the game room
                        socket.join(game_id.clone()).ok();

                        // Emit MANAGER.GAME_CREATED
                        let payload = GameCreatedPayload {
                            gameId: game_id,
                            inviteCode: invite_code,
                        };

                        socket
                            .emit(events::MANAGER_GAME_CREATED, &payload)
                            .ok();
                    });
                }
            });

            // Handle PLAYER.JOIN event
            socket.on(events::PLAYER_JOIN, {
                let registry = Arc::clone(&registry);

                move |socket: SocketRef, Data::<String>(invite_code)| {
                    let registry = Arc::clone(&registry);

                    tokio::spawn(async move {
                        let registry = registry.read().await;
                        let game_opt = registry.get_game_by_code(&invite_code);

                        match game_opt {
                            Some(game) => {
                                let game_data = game.lock().unwrap();
                                let payload = SuccessRoomPayload {
                                    gameId: game_data.gameId.clone(),
                                    requireIdentifier: false,
                                };
                                drop(game_data);

                                info!("Player checking game: invite_code={}", invite_code);

                                socket.emit(events::GAME_SUCCESS_ROOM, &payload).ok();
                            }
                            None => {
                                info!("Game not found: invite_code={}", invite_code);
                                socket
                                    .emit(events::GAME_ERROR_MESSAGE, "errors:game.notFound")
                                    .ok();
                            }
                        }
                    });
                }
            });

            // Handle PLAYER.LOGIN event
            socket.on(events::PLAYER_LOGIN, {
                let registry = Arc::clone(&registry);
                let socket_id = socket.id.to_string();
                let client_id = client_id.clone();

                let io_handle = io_handle.clone();

                move |socket: SocketRef, Data::<PlayerLoginPayload>(payload)| {
                    let registry = Arc::clone(&registry);
                    let socket_id = socket_id.clone();
                    let client_id = client_id.clone();
                    let io_handle = io_handle.clone();

                    tokio::spawn(async move {
                        // Find the game
                        let game_opt = {
                            let registry = registry.read().await;
                            registry.get_game_by_id(&payload.gameId)
                        };

                        match game_opt {
                            Some(game_ref) => {
                                let (game_id, manager_socket_id, player, total_players) = {
                                    let mut game = game_ref.lock().unwrap();
                                    let player = game.add_player(
                                        socket_id.clone(),
                                        client_id.clone(),
                                        payload.data.username.clone(),
                                        payload.data.avatar.clone(),
                                    );

                                    let game_id = game.gameId.clone();
                                    let manager_socket_id = game.manager_socket_id.clone();
                                    let total_players = game.players.len();

                                    (game_id, manager_socket_id, player, total_players)
                                };

                                info!(
                                    "Player joined game: gameId={}, username={}",
                                    game_id, payload.data.username
                                );

                                // Join the socket to the game room
                                socket.join(game_id.clone()).ok();

                                // Emit SUCCESS_JOIN to the player
                                socket
                                    .emit(events::GAME_SUCCESS_JOIN, &game_id)
                                    .ok();

                                // Emit NEW_PLAYER to the manager socket directly.
                                // ponytail: socketioxide (unlike Node socket.io) does NOT
                                // auto-join sockets into their own sid-room, so
                                // socket.to(<sid>) silently reaches nobody — resolve the
                                // socket by Sid instead. Port-relevant finding for Phase 3.
                                if let Ok(sid) = manager_socket_id.parse() {
                                    if let Some(mgr) = io_handle.get_socket(sid) {
                                        mgr.emit(events::MANAGER_NEW_PLAYER, &player).ok();
                                    }
                                }

                                // Broadcast TOTAL_PLAYERS to all in the room
                                socket
                                    .to(game_id)
                                    .emit(events::GAME_TOTAL_PLAYERS, &(total_players as u32))
                                    .ok();
                            }
                            None => {
                                info!(
                                    "Game not found for login: gameId={}",
                                    payload.gameId
                                );
                                socket
                                    .emit(events::GAME_ERROR_MESSAGE, "errors:game.notFound")
                                    .ok();
                            }
                        }
                    });
                }
            });

            // Handle disconnect
            socket.on_disconnect(move |_: SocketRef| {
                info!("Client disconnected");
            });
        }
    });

    // Axum router with socketioxide middleware
    let app = Router::new()
        .route("/health", get(|| async { StatusCode::OK }))
        .layer(layer);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".into());
    let addr = format!("127.0.0.1:{port}").parse::<SocketAddr>().unwrap();
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    info!("Server listening on http://{}", addr);

    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}
