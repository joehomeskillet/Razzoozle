mod bot;
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

/// Helper: Check if the caller owns this game. Payloads carrying a hostToken
/// are checked against it (unchanged). Payloads WITHOUT one (e.g. the shipped
/// client's manager:reconnect, which only sends {gameId}) now fall back to
/// REAL ownership via the authenticated clientId compared against
/// `game.manager_client_id` — closing the gap where any client who merely
/// knew the gameId could pass this check (see auth.rs's former TODO(parity)).
/// A Game with no recorded manager_client_id (only possible via `Game::new()`
/// directly, e.g. in a test — `create_game()` always populates it) keeps the
/// old legacy allow.
pub(crate) fn is_game_host(game: &state::Game, payload: &serde_json::Value, client_id: &str) -> bool {
    match payload.get("hostToken") {
        None | Some(serde_json::Value::Null) => match &game.manager_client_id {
            Some(owner_client_id) => owner_client_id == client_id,
            None => true,
        },
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
            "test-quiz".to_string(),
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

        assert!(is_game_host(&game, &payload, "any-client-id"));
    }

    #[test]
    fn is_game_host_rejects_wrong_token() {
        let game = test_game();
        let payload = serde_json::json!({ "hostToken": "wrong-token" });

        assert!(!is_game_host(&game, &payload, "any-client-id"));
    }

    #[test]
    fn is_game_host_accepts_legacy_payload_without_token_or_recorded_owner() {
        // No manager_client_id recorded (test_game() uses Game::new() directly —
        // create_game() always populates it for real games) keeps the old
        // legacy allow for a tokenless payload.
        let game = test_game();
        let payload = serde_json::json!({ "gameId": game.game_id });

        assert!(is_game_host(&game, &payload, "any-client-id"));
    }

    #[test]
    fn is_game_host_matches_real_owner_via_client_id_when_no_token_sent() {
        let mut game = test_game();
        game.manager_client_id = Some("owner-client".to_string());
        let payload = serde_json::json!({ "gameId": game.game_id });

        assert!(is_game_host(&game, &payload, "owner-client"));
        assert!(!is_game_host(&game, &payload, "impostor-client"));
    }
}

#[tokio::main]
async fn main() {
    // fmt layer (stdout, unchanged behaviour) + ADDITIVE ring layer: every
    // event is also mirrored (redacted) into the bounded DEV log ring that
    // backs GET /api/v1/observability/logs/server (see http/logs.rs).
    {
        use tracing_subscriber::layer::SubscriberExt;
        use tracing_subscriber::util::SubscriberInitExt;
        tracing_subscriber::registry()
            .with(tracing_subscriber::filter::LevelFilter::INFO)
            .with(tracing_subscriber::fmt::layer())
            .with(http::logs::RingLayer)
            .init();
    }

    // Create database pool first (if DATABASE_URL is set)
    let db_pool = crate::db::create_pool().await;

    // E4 media boot-hydrate: if pool is available, restore media from Postgres to disk (idempotent + empty-guard)
    if db_pool.is_some() {
        let config_base = http::get_config_path();
        crate::db::hydrate_media_from_pg(&db_pool, &config_base).await;
        // P2 plugin boot-hydrate: restore plugin files from Postgres to disk (idempotent + empty-guard)
        crate::db::hydrate_plugins_from_pg(&db_pool, &config_base).await;
    }

    // Load fixture quiz
    let quiz_fixture = QuizFixture::load().expect("Failed to load fixture quiz");

    // Initialize registry with pool (prefers DB quizzes when available, falls back to files)
    let registry = Arc::new(RwLock::new(GameRegistry::new(&db_pool, quiz_fixture).await));


    // W2h — Crash-recovery snapshot: restore any games from the last shutdown, then start the periodic save task.
    // Mirrors Node's boot order: loadSnapshot (if present) → cleanupStaleAvatars → startSnapshotTask.
    // All steps are fully crash-guarded: a missing/corrupt snapshot is a no-op and never blocks boot.
    // Load synchronously so the resume plans are available here; the actual
    // lifecycle resume is spawned once the socket "/" namespace exists (further
    // below), so restored games can emit to reconnecting clients (BLOCKER #12).
    let resume_plans = {
        let mut reg = registry.write().await;
        let plans = reg.load_snapshot().await;
        // Clean up stale avatar directories for games that no longer exist.
        reg.cleanup_stale_avatars();
        plans
    };
    {
        // Start the periodic snapshot task (5s interval, matching Node)
        let snapshot_registry = Arc::clone(&registry);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(5));
            loop {
                interval.tick().await;
                let reg = snapshot_registry.read().await;
                reg.save_snapshot().await;
            }
        });
    }
    info!("Snapshot task started");

    // Node parity: WS_MAX_HTTP_BUFFER_BYTES = ceil(8_000_000 * 4 / 3) + 256_000
    // (packages/socket/src/index.ts:48-52) — covers base64-inflated avatar/media
    // uploads (up to 8MB raw) sent over the socket transport.
    const WS_MAX_HTTP_BUFFER_BYTES: u64 = 10_922_667;

    // Create Socket.IO instance
    let (layer, io) = SocketIo::builder()
        .max_payload(WS_MAX_HTTP_BUFFER_BYTES)
        .ping_interval(Duration::from_millis(10000))
        .ping_timeout(Duration::from_millis(8000))
        .build_layer();

    // Configure socket handlers
    let io_handle = io.clone();
    io.ns("/", {
        let registry = Arc::clone(&registry);
        // Clone so the ns-closure captures a copy and the original db_pool
        // stays available for the HTTP AppState below.
        let db_pool = db_pool.clone();
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
            media_ai::register(&socket, Arc::clone(&registry), client_id.clone(), db_pool.clone());

        }
    });

    // BLOCKER #12 — resume the per-game lifecycle task for every game restored
    // mid-flight, so a restart during a live question (every CD deploy) doesn't
    // brick it: the countdown/reveal timers, dwell aborts and Skip all come back.
    // The socket "/" namespace is registered above, so these tasks can emit to
    // clients as they reconnect.
    for plan in resume_plans {
        let io_resume = io.clone();
        let registry_resume = Arc::clone(&registry);
        let db_pool_resume = db_pool.clone();
        tokio::spawn(async move {
            socket::lifecycle::resume_game_lifecycle(
                io_resume,
                registry_resume,
                plan,
                db_pool_resume,
            )
            .await;
        });
    }

    // C4 — Game eviction reaper: spawn background task to periodically evict stale games
    // (closes the memory leak from finished/inactive games)
    {
        let registry_clone = Arc::clone(&registry);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                let mut reg = registry_clone.write().await;
                // This reaper is a single unsupervised background task —
                // nothing awaits/restarts it — so any panic inside
                // evict_stale_games would otherwise end this loop
                // PERMANENTLY, leaking every future finished/stale game
                // forever. evict_stale_games() itself already recovers from a
                // poisoned Game mutex; this is the second line of defence for
                // any other panic.
                if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    reg.evict_stale_games();
                })) {
                    tracing::error!("game eviction reaper tick panicked (continuing): {:?}", e);
                }
            }
        });
    }

    // Empty-grace reaper: RESET+remove manager-less games after grace window
    {
        let registry_clone = Arc::clone(&registry);
        let io_clone = io.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                let mut reg = registry_clone.write().await;
                if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    reg.cleanup_empty_games(&io_clone);
                })) {
                    tracing::error!("empty-grace reaper tick panicked (continuing): {:?}", e);
                }
            }
        });
    }

    // W2i + W2j — Display/Pairing hygiene sweep: periodically prune stale pairing codes
    // and remove display records that haven't pinged within the staleness window (30s).
    // Matches Node's registry.startCleanupTask() (packages/socket/src/services/registry/registry.ts:331–339).
    {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                socket::display::sweep_pairing_and_displays();
            }
        });
    }

    // Axum router with socketioxide middleware and HTTP routes
    let app = http::router(http::AppState {
        registry: Arc::clone(&registry),
        db_pool: db_pool.clone(),
        io: io.clone(),
    })
    .layer(layer);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3020".into());
    // 0.0.0.0 so the server is reachable through Docker port forwarding
    // (the host only maps it to 127.0.0.1:<hostport>, so it stays loopback-exposed).
    let addr = format!("0.0.0.0:{port}").parse::<SocketAddr>().unwrap();
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    info!("Server listening on http://{}", addr);


    // Graceful shutdown: save snapshot on SIGINT/SIGTERM before exiting.
    // Mirrors Node's signal handlers (packages/socket/src/index.ts:204-214).
    let registry_sig = Arc::clone(&registry);
    tokio::spawn(async move {
        let mut sigint = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())
            .expect("Failed to install SIGINT handler");
        let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler");

        tokio::select! {
            _ = sigint.recv() => {
                info!("SIGINT received, saving snapshot and shutting down");
                registry_sig.read().await.save_snapshot().await;
                std::process::exit(0);
            }
            _ = sigterm.recv() => {
                info!("SIGTERM received, saving snapshot and shutting down");
                registry_sig.read().await.save_snapshot().await;
                std::process::exit(0);
            }
        }
    });

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .expect("Failed to start server");
}
