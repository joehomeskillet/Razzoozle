mod socket;
mod state;
mod media_ai;
mod http;
mod db;


use razzoozle_protocol::quizz::QuestionType;
use razzoozle_protocol::status::MatchMode;
use socketioxide::extract::{Data, SocketRef};
use socketioxide::SocketIo;
use state::{GameRegistry, QuizFixture};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::info;

pub(crate) fn question_type_wire(question_type: &QuestionType) -> &'static str {
    match question_type {
        QuestionType::Choice => "choice",
        QuestionType::Boolean => "boolean",
        QuestionType::Slider => "slider",
        QuestionType::Poll => "poll",
        QuestionType::MultipleSelect => "multiple-select",
        QuestionType::TypeAnswer => "type-answer",
        QuestionType::SentenceBuilder => "sentence-builder",
    }
}

pub(crate) fn match_mode_from_str(match_mode: &str) -> Option<MatchMode> {
    match match_mode {
        "exact" => Some(MatchMode::Exact),
        "normalized" => Some(MatchMode::Normalized),
        "fuzzy" => Some(MatchMode::Fuzzy),
        _ => None,
    }
}

/// Helper: Check if the payload's hostToken matches the game's host_token.
pub(crate) fn is_game_host(game: &state::Game, payload: &serde_json::Value) -> bool {
    match payload.get("hostToken") {
        // Absent (or explicit null) → legacy path, still gated by is_logged. Backward-compat
        // for old clients that don't send a token yet.
        None | Some(serde_json::Value::Null) => true,
        // Present → it MUST be a string that matches the game's token. A non-string value
        // (hostToken: 123 / {} / []) DENIES — fail-CLOSED, so the check can't be bypassed by
        // sending a malformed token instead of the right one.
        Some(v) => v.as_str() == Some(game.host_token.as_str()),
    }
}



#[cfg(test)]
mod host_token_tests {
    use super::*;

    fn test_game() -> state::Game {
        state::Game::new(
            "game-1".to_string(),
            "INVITE1".to_string(),
            "manager-1".to_string(),
            razzoozle_protocol::quizz::Quizz {
                subject: "Test".to_string(),
                questions: vec![],
                archived: None,
                theme_id: None,
            },
        )
    }

    #[test]
    fn is_game_host_accepts_correct_token() {
        let game = test_game();
        let payload = serde_json::json!({ "hostToken": game.host_token.clone() });

        assert!(is_game_host(&game, &payload));
    }

    #[test]
    fn is_game_host_rejects_wrong_token() {
        let game = test_game();
        let payload = serde_json::json!({ "hostToken": "wrong-token" });

        assert!(!is_game_host(&game, &payload));
    }

    #[test]
    fn is_game_host_accepts_legacy_payload_without_token() {
        let game = test_game();
        let payload = serde_json::json!({ "gameId": game.game_id });

        assert!(is_game_host(&game, &payload));
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Create database pool first (if DATABASE_URL is set)
    let db_pool = crate::db::create_pool().await;

    // Load fixture quiz
    let quiz_fixture = QuizFixture::load().expect("Failed to load fixture quiz");

    // Initialize registry with pool (prefers DB quizzes when available, falls back to files)
    let registry = Arc::new(RwLock::new(GameRegistry::new(&db_pool, quiz_fixture).await));

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

            // Modular handlers (one file each under src/socket/). Migrating incrementally;
            // handlers not yet moved stay inline below.
            let ctx = socket::HandlerCtx {
                registry: Arc::clone(&registry),
                io: io_handle.clone(),
                client_id: client_id.clone(),
                db_pool: db_pool.clone(),
            };
            socket::register_all(&socket, &ctx);

            // clock:ping + metrics handlers now live in src/socket/{clock_ping,metrics}.rs
            // (registered above via socket::register_all).

            // Register AI/media handlers
            media_ai::register(&socket, Arc::clone(&registry), client_id.clone());

        }
    });

    // C4 — Game eviction reaper: spawn background task to periodically evict stale games
    // (closes the memory leak from finished/inactive games)
    {
        let registry_clone = Arc::clone(&registry);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                {
                    let mut reg = registry_clone.write().await;
                    reg.evict_stale_games();
                }
            }
        });
    }

    // Axum router with socketioxide middleware and HTTP routes
    let app = http::router(Arc::clone(&registry))
        .layer(layer);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3020".into());
    // 0.0.0.0 so the server is reachable through Docker port forwarding
    // (the host only maps it to 127.0.0.1:<hostport>, so it stays loopback-exposed).
    let addr = format!("0.0.0.0:{port}").parse::<SocketAddr>().unwrap();
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    info!("Server listening on http://{}", addr);

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .expect("Failed to start server");
}
