mod state;

use axum::{
    http::StatusCode,
    routing::get,
    Router,
};
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use socketioxide::SocketIo;
use state::{GameRegistry, QuizFixture};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Load fixture quiz
    let quiz_fixture = QuizFixture::load().expect("Failed to load fixture quiz");

    let registry = Arc::new(RwLock::new(GameRegistry::new(quiz_fixture)));

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
            socket.on(constants::game::CREATE, {
                let registry = Arc::clone(&registry);
                let socket_id = socket.id.to_string();

                move |socket: SocketRef, Data::<String>(_quizz_id)| {
                    let registry = Arc::clone(&registry);
                    let socket_id = socket_id.clone();

                    tokio::spawn(async move {
                        let mut registry = registry.write().await;
                        let (game_id, invite_code) = registry.create_game(socket_id.clone());

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
                        };

                        socket
                            .emit(constants::manager::GAME_CREATED, &payload)
                            .ok();
                    });
                }
            });

            // Handle PLAYER.JOIN event
            socket.on(constants::player::JOIN, {
                let registry = Arc::clone(&registry);

                move |socket: SocketRef, Data::<String>(invite_code)| {
                    let registry = Arc::clone(&registry);

                    tokio::spawn(async move {
                        let registry = registry.read().await;
                        let game_opt = registry.get_game_by_code(&invite_code);

                        match game_opt {
                            Some(game) => {
                                let game_data = game.lock().unwrap();
                                let payload = razzoozle_protocol::game::GameSuccessRoom {
                                    game_id: game_data.game_id.clone(),
                                    require_identifier: None,
                                };
                                drop(game_data);

                                info!("Player checking game: invite_code={}", invite_code);

                                socket.emit(constants::game::SUCCESS_ROOM, &payload).ok();
                            }
                            None => {
                                info!("Game not found: invite_code={}", invite_code);
                                socket
                                    .emit(constants::game::ERROR_MESSAGE, "errors:game.notFound")
                                    .ok();
                            }
                        }
                    });
                }
            });

            // Handle PLAYER.LOGIN event
            // Payload format: { gameId: string, data: { username: string, avatar?: string } }
            socket.on(constants::player::LOGIN, {
                let registry = Arc::clone(&registry);
                let socket_id = socket.id.to_string();
                let client_id = client_id.clone();
                let io_handle = io_handle.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let socket_id = socket_id.clone();
                    let client_id = client_id.clone();
                    let io_handle = io_handle.clone();

                    tokio::spawn(async move {
                        // Extract gameId and player data from the payload wrapper
                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                        let username_opt = payload
                            .get("data")
                            .and_then(|v| v.get("username"))
                            .and_then(|v| v.as_str());
                        let avatar = payload
                            .get("data")
                            .and_then(|v| v.get("avatar"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        match (game_id_opt, username_opt) {
                            (Some(game_id), Some(username)) => {
                                let game_opt = {
                                    let registry = registry.read().await;
                                    registry.get_game_by_id(game_id)
                                };

                                match game_opt {
                                    Some(game_ref) => {
                                        let (game_id_ret, manager_socket_id, player, total_players) = {
                                            let mut game = game_ref.lock().unwrap();
                                            let player = game.add_player(
                                                socket_id.clone(),
                                                client_id.clone(),
                                                username.to_string(),
                                                avatar,
                                            );

                                            let game_id = game.game_id.clone();
                                            let manager_socket_id = game.manager_socket_id.clone();
                                            let total_players = game.players.len();

                                            (game_id, manager_socket_id, player, total_players)
                                        };

                                        info!(
                                            "Player joined game: gameId={}, username={}",
                                            game_id_ret, username
                                        );

                                        // Join the socket to the game room
                                        socket.join(game_id_ret.clone()).ok();

                                        // Emit game:successJoin to the player
                                        socket
                                            .emit(constants::game::SUCCESS_JOIN, &game_id_ret)
                                            .ok();

                                        // Emit manager:newPlayer to the manager socket directly
                                        // Critical finding: socketioxide does NOT auto-join sockets into
                                        // their own sid-room, so use io.get_socket(sid) instead of socket.to(sid)
                                        if let Ok(sid) = manager_socket_id.parse() {
                                            if let Some(mgr) = io_handle.get_socket(sid) {
                                                mgr.emit(constants::manager::NEW_PLAYER, &player).ok();
                                            }
                                        }

                                        // Broadcast game:totalPlayers to all in the room
                                        socket
                                            .to(game_id_ret)
                                            .emit(constants::game::TOTAL_PLAYERS, &(total_players as i32))
                                            .ok();
                                    }
                                    None => {
                                        info!("Game not found for login: gameId={}", game_id);
                                        socket
                                            .emit(constants::game::ERROR_MESSAGE, "errors:game.notFound")
                                            .ok();
                                    }
                                }
                            }
                            _ => {
                                info!("Invalid player:login payload");
                                socket
                                    .emit(constants::game::ERROR_MESSAGE, "errors:game.invalidPayload")
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

    let port = std::env::var("PORT").unwrap_or_else(|_| "3020".into());
    let addr = format!("127.0.0.1:{port}").parse::<SocketAddr>().unwrap();
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    info!("Server listening on http://{}", addr);

    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}
