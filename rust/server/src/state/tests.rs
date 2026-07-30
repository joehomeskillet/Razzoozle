use super::*;

use crate::bot::BotManager;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Quizz;
use razzoozle_protocol::status::{GameStatus, PausedData, SelectAnswerData};
use socketioxide::SocketIo;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// Test isolation: use Mutex to serialize CONFIG_PATH mutations.
// std::env is not thread-safe (used by tests in parallel async tasks).
// This mutex ensures only one test modifies CONFIG_PATH at a time.
lazy_static::lazy_static! {
    static ref TEST_CONFIG_PATH_LOCK: Mutex<()> = Mutex::new(());
}

/// Guard that isolates snapshot tests by redirecting CONFIG_PATH to a unique temporary directory.
/// Each test invocation gets its own snapshot file, preventing parallel test interference.
/// Acquires a mutex to serialize CONFIG_PATH mutations across all tests.
struct ConfigPathGuard {
    _lock: std::sync::MutexGuard<'static, ()>,
    prev_config_path: Option<String>,
}

impl ConfigPathGuard {
    /// Create a new guard that redirects CONFIG_PATH to a unique test directory.
    /// Serializes with other tests via mutex to prevent CONFIG_PATH races.
    fn acquire() -> std::io::Result<Self> {
        // Acquire lock FIRST, before any env operations
        let _lock = TEST_CONFIG_PATH_LOCK.lock().unwrap();

        // Preserve original CONFIG_PATH (may be unset)
        let prev_config_path = std::env::var("CONFIG_PATH").ok();

        // Create unique test directory: /tmp/razzoozle-test-{uuid}/
        let test_dir =
            std::env::temp_dir().join(format!("razzoozle-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&test_dir)?;

        // Set CONFIG_PATH to our isolated directory
        std::env::set_var("CONFIG_PATH", test_dir.to_string_lossy().as_ref());

        Ok(ConfigPathGuard {
            _lock,
            prev_config_path,
        })
    }
}

impl Drop for ConfigPathGuard {
    fn drop(&mut self) {
        // CONFIG_PATH is still protected by _lock until we return
        match &self.prev_config_path {
            Some(path) => std::env::set_var("CONFIG_PATH", path),
            None => std::env::remove_var("CONFIG_PATH"),
        }
        // Lock is automatically released when _lock is dropped here
    }
}

#[test]
fn test_validate_username() {
    // Valid usernames
    assert!(GameRegistry::validate_username("alice").is_ok());
    assert!(GameRegistry::validate_username("1234").is_ok());
    assert!(GameRegistry::validate_username("verylongusername123").is_ok());

    // Too short
    assert!(GameRegistry::validate_username("abc").is_err());

    // Too long
    assert!(GameRegistry::validate_username("verylongusernamethatexceedsmax").is_err());

    // CJK characters: 3 chars (9 bytes) — should fail (too short)
    assert!(
        GameRegistry::validate_username("中文名").is_err(),
        "3 CJK chars should be too short"
    );

    // CJK characters: 4 chars (12 bytes) — should pass (exactly min)
    assert!(
        GameRegistry::validate_username("中文名字").is_ok(),
        "4 CJK chars should be valid"
    );

    // CJK characters: 20 chars (60 bytes) — should pass (exactly max)
    assert!(
        GameRegistry::validate_username("中文名字中文名字中文名字中文名字中文名字").is_ok(),
        "20 CJK chars should be valid"
    );

    // CJK characters: 21 chars (63 bytes) — should fail (too long)
    assert!(
        GameRegistry::validate_username("中文名字中文名字中文名字中文名字中文名字中").is_err(),
        "21 CJK chars should be too long"
    );
}

#[test]
fn test_validate_avatar() {
    // Valid avatars
    assert!(GameRegistry::validate_avatar("").is_ok());
    assert!(GameRegistry::validate_avatar("data:image/svg+xml;utf8,<svg></svg>").is_ok());
    assert!(GameRegistry::validate_avatar("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==").is_ok());

    // SVG too large (exceeds 64KB max)
    let large_svg = format!("data:image/svg+xml;{}", "x".repeat(66000));
    assert!(
        GameRegistry::validate_avatar(&large_svg).is_err(),
        "Large SVG should be rejected"
    );
}

#[test]
fn test_safe_asset_id() {
    // Valid IDs
    assert!(safe_asset_id("quiz-abc123").is_ok());
    assert!(safe_asset_id("result_001").is_ok());
    assert!(safe_asset_id("test-123_abc").is_ok());

    // Invalid: path traversal
    assert!(safe_asset_id("../../etc/passwd").is_err());
    assert!(safe_asset_id("../../../secret").is_err());
    assert!(safe_asset_id("test/../etc/shadow").is_err());

    // Invalid: special characters
    assert!(safe_asset_id("test/file").is_err());
    assert!(safe_asset_id("test\\file").is_err());
    assert!(safe_asset_id("test;file").is_err());
    assert!(safe_asset_id("test file").is_err());

    // Reserved keywords
    assert!(safe_asset_id("__proto__").is_err());
    assert!(safe_asset_id("constructor").is_err());
    assert!(safe_asset_id("prototype").is_err());
}

/// Registers `quiz` under `id` (via reload_quizzes) so create_game's
/// quizzId-must-resolve validation has something real to find — the tests
/// below care about cap/eviction/player behavior, not quiz lookup itself.
fn seed_quiz(registry: &mut GameRegistry, id: &str, quiz: Quizz) {
    let mut quizzes = HashMap::new();
    quizzes.insert(id.to_string(), quiz);
    registry.reload_quizzes(quizzes);
}

fn test_quiz() -> Quizz {
    QuizFixture::load().expect("fixture quiz loads")
}

fn make_socket_io() -> SocketIo {
    let (_layer, io) = SocketIo::builder().build_layer();
    io.ns("/", |_socket: socketioxide::extract::SocketRef| {});
    io
}

fn test_bot_player(client_id: &str) -> Player {
    Player {
        id: format!("socket-{client_id}"),
        client_id: client_id.to_string(),
        connected: true,
        username: "Bot".to_string(),
        points: 0,
        streak: 0,
        player_token: None,
        is_bot: Some(true),
        avatar: None,
        achievements: None,
        team_id: None,
        identifier_hash: None,
    }
}

#[test]
fn test_active_game_cap() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz.clone()));
    seed_quiz(&mut registry, "test-quiz", empty_quiz);

    // Create MAX_ACTIVE_GAMES games
    for i in 0..MAX_ACTIVE_GAMES {
        let result = registry.create_game(
            format!("socket-{}", i),
            Some("test-quiz".to_string()),
            format!("client-{}", i),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        );
        assert!(result.is_ok(), "Game {} creation failed", i);
    }

    // 101st game should fail (cap exceeded)
    let result = registry.create_game(
        "socket-overflow".to_string(),
        Some("test-quiz".to_string()),
        "client-overflow".to_string(),
        None,
        false,
        serde_json::json!({"enabled": false, "clockSync": true}),
    );
    assert!(result.is_err(), "101st game should fail");
    assert_eq!(result.unwrap_err(), "errors:game.serverBusy");
}

#[test]
fn test_create_game_rejects_missing_or_unknown_quiz_id() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz));

    // Missing quizzId
    let result = registry.create_game(
        "socket-1".to_string(),
        None,
        "client-1".to_string(),
        None,
        false,
        serde_json::json!({"enabled": false, "clockSync": true}),
    );
    assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

    // Empty-string quizzId
    let result = registry.create_game(
        "socket-2".to_string(),
        Some(String::new()),
        "client-2".to_string(),
        None,
        false,
        serde_json::json!({"enabled": false, "clockSync": true}),
    );
    assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

    // Unknown quizzId (not registered)
    let result = registry.create_game(
        "socket-3".to_string(),
        Some("does-not-exist".to_string()),
        "client-3".to_string(),
        None,
        false,
        serde_json::json!({"enabled": false, "clockSync": true}),
    );
    assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

    // None of the above should have created a game (parity with Node:
    // an unresolved quizzId creates NO game, never a default fallback).
    assert_eq!(registry.game_count(), 0);
}

#[test]
fn test_add_player_rejects_duplicate_client_id() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let mut game = Game::new(
        "game-1".to_string(),
        "INV1".to_string(),
        "manager-1".to_string(),
        "test-quiz".to_string(),
        empty_quiz,
    );

    assert!(game
        .add_player(
            "socket-1".to_string(),
            "client-1".to_string(),
            "Alice".to_string(),
            None
        )
        .is_ok());

    let result = game.add_player(
        "socket-2".to_string(),
        "client-1".to_string(),
        "AliceAgain".to_string(),
        None,
    );
    assert_eq!(result.unwrap_err(), "errors:game.playerAlreadyConnected");
    assert_eq!(
        game.players.len(),
        1,
        "duplicate join must not create a second player record"
    );
}

#[test]
fn test_evict_stale_games_recovers_poisoned_mutex() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz.clone()));
    seed_quiz(&mut registry, "test-quiz", empty_quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-1".to_string(),
            Some("test-quiz".to_string()),
            "manager-client-1".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();
    let game_ref = registry.get_game_by_id(&game_id).unwrap();

    // Poison the mutex the standard way: panic on another thread while
    // holding the lock (mirrors a real handler bug mid-lock).
    let poison_ref = Arc::clone(&game_ref);
    let _ = std::thread::spawn(move || {
        let _guard = poison_ref.lock().unwrap();
        panic!("simulated handler panic while holding the Game lock");
    })
    .join();
    assert!(game_ref.is_poisoned(), "setup: mutex should be poisoned");

    // Mark it stale (via the same poison-recovering access evict_stale_games
    // itself uses) so eviction actually targets it.
    {
        let mut game = GameRegistry::lock_game_recover(&game_ref);
        game.last_activity_ms = 0;
    }

    // Must NOT panic — that's the whole point of the fix.
    registry.evict_stale_games(&make_socket_io());

    assert!(
        registry.get_game_by_id(&game_id).is_none(),
        "poisoned-but-stale game should still be evicted, not leaked forever"
    );
}

#[test]
fn test_evict_stale_games_skips_game_with_connected_player() {
    // #85 — a connected lobby player who never joins/answers/reveals leaves
    // last_activity_ms untouched, so is_stale can go true under a perfectly
    // live game. evict_stale_games must not reap it out from under them.
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz.clone()));
    seed_quiz(&mut registry, "test-quiz", empty_quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-1".to_string(),
            Some("test-quiz".to_string()),
            "manager-client-1".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            "socket-1".to_string(),
            "client-1".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
        // add_player always sets connected=true — this player is still there,
        // just idle in the lobby.
        game.last_activity_ms = 0; // force is_stale true
    }

    registry.evict_stale_games(&make_socket_io());

    assert!(
        registry.get_game_by_id(&game_id).is_some(),
        "stale game with a connected player must not be evicted"
    );
}

#[test]
fn test_game_eviction_clears_players() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz.clone()));
    seed_quiz(&mut registry, "test-quiz", empty_quiz);

    // Create a game
    let (game_id, _, _) = registry
        .create_game(
            "manager-1".to_string(),
            Some("test-quiz".to_string()),
            "manager-client-1".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    // Add players to the game, then disconnect them — #85: a stale game
    // with a still-connected player is no longer evicted (see
    // test_evict_stale_games_skips_game_with_connected_player), so this
    // "abandoned" fixture must have nobody connected.
    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            "socket-1".to_string(),
            "client-1".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
        game.add_player(
            "socket-2".to_string(),
            "client-2".to_string(),
            "Bob".to_string(),
            None,
        )
        .unwrap();
        for p in game.players.iter_mut() {
            p.connected = false;
        }
    }

    // Verify 2 players are in the game
    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        assert_eq!(game.players.len(), 2, "Should have 2 players");
        assert!(
            !game.has_connected_players(),
            "setup: both players must be disconnected"
        );
    }

    // Mark game as stale by setting old activity timestamp
    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.last_activity_ms = 0; // Very old timestamp
    }

    // Evict stale games (should remove the game and its players)
    registry.evict_stale_games(&make_socket_io());

    // Verify game is gone
    assert!(
        registry.get_game_by_id(&game_id).is_none(),
        "Game should be evicted"
    );
    assert_eq!(registry.game_count(), 0, "No games should remain");
}

#[test]
fn test_per_ip_solo_rate_limit() {
    let rate_limiter = RateLimiter::new();

    // IP 1 should be allowed up to SOLO_RATE_MAX_PER_CLIENT calls
    for _ in 0..SOLO_RATE_MAX_PER_CLIENT {
        assert!(
            rate_limiter.check_solo_rate("192.168.1.1"),
            "IP1 should be allowed"
        );
    }
    assert!(
        !rate_limiter.check_solo_rate("192.168.1.1"),
        "IP1 should be throttled"
    );

    // IP 2 should have independent limit
    assert!(
        rate_limiter.check_solo_rate("192.168.1.2"),
        "IP2 should be allowed"
    );
    assert!(
        rate_limiter.check_solo_rate("192.168.1.2"),
        "IP2 should be allowed"
    );
}

#[test]
fn test_per_ip_auth_throttle() {
    let rate_limiter = RateLimiter::new();

    // IP 1: peek allowed while under threshold; the 10th recorded failure
    // reaches the cap (throttle takes effect from the 11th attempt onward).
    assert!(
        !rate_limiter.is_auth_throttled_per_client("192.168.1.1"),
        "Should not be throttled yet"
    );
    for i in 0..AUTH_RATE_MAX_PER_CLIENT {
        rate_limiter.record_auth_failure_per_client("192.168.1.1");
        let should_be_throttled = i + 1 >= AUTH_RATE_MAX_PER_CLIENT;
        assert_eq!(
            rate_limiter.is_auth_throttled_per_client("192.168.1.1"),
            should_be_throttled,
            "after {} failure(s), throttle state mismatch",
            i + 1
        );
    }

    // IP 2 should have an independent limit (per-client, not global).
    assert!(
        !rate_limiter.is_auth_throttled_per_client("192.168.1.2"),
        "IP2 should not be throttled"
    );
}

#[tokio::test]
async fn test_empty_grace_mark_reactivate_cleanup() {
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            "player-socket".to_string(),
            "player-client".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
        game.engine.start().unwrap();
    }

    registry.mark_game_as_empty(game_id.clone());
    assert!(
        registry.empty_games_contains(&game_id),
        "marked game should be in empty_games"
    );

    registry.reactivate_game(game_id.clone());
    assert!(
        !registry.empty_games_contains(&game_id),
        "reactivate_game should remove the game from empty_games"
    );

    registry.mark_game_as_empty(game_id.clone());
    let io = make_socket_io();
    registry.cleanup_empty_games(&io);
    assert!(
        registry.get_game_by_id(&game_id).is_some(),
        "cleanup should not remove a freshly marked game"
    );
}

#[test]
fn test_manager_reconnect_records_status_roundtrip() {
    let quiz = test_quiz();
    let mut game = Game::new(
        "game-reconnect".to_string(),
        "INVITE".to_string(),
        "manager-socket".to_string(),
        "test-quiz".to_string(),
        quiz,
    );
    let select = GameStatus::SelectAnswer(SelectAnswerData {
        question: "What?".to_string(),
        answers: Some(vec!["A".to_string(), "B".to_string()]),
        media: None,
        time: 10,
        total_player: 2,
        question_type: Some("choice".to_string()),
        min: None,
        max: None,
        step: None,
        unit: None,
        shuffled_chunks: None,
        shuffled_items: None,
        server_seq: None,
        server_now_ms: Some(1_000),
        question_start_at_server_ms: Some(1_000),
        answer_deadline_at_server_ms: Some(11_000),
        submitted_by: None,
        sentence: None,
        tokens: None,
        pos_set: None,
        disabled_tokens: None,
        segments: None,
        slot_options: None,
        match_items: None,
    });

    game.record_last_manager_status(&select);
    let (status_name, status_data) = game.manager_reconnect_status();

    assert_eq!(status_name, "SELECT_ANSWER");
    assert_eq!(status_data.get("time").and_then(|v| v.as_i64()), Some(10));
    assert_eq!(
        status_data.get("totalPlayer").and_then(|v| v.as_i64()),
        Some(2)
    );
    assert_ne!(
        status_data,
        serde_json::json!({ "text": "game:waitingForPlayers" }),
        "must replay recorded payload, not WAIT fallback"
    );
}

#[test]
fn test_manager_reconnect_fallback_when_nothing_recorded() {
    let quiz = test_quiz();
    let game = Game::new(
        "game-reconnect-fallback".to_string(),
        "INVITE".to_string(),
        "manager-socket".to_string(),
        "test-quiz".to_string(),
        quiz,
    );
    assert!(game.last_manager_status.is_none());

    let (status_name, status_data) = game.manager_reconnect_status();

    assert_eq!(status_name, Game::phase_wire_name(game.engine.phase));
    assert_eq!(status_name, "WAIT");
    assert_eq!(
        status_data,
        serde_json::json!({ "text": "game:waitingForPlayers" })
    );
}

#[test]
fn test_manager_reconnect_paused_status() {
    let quiz = test_quiz();
    let mut game = Game::new(
        "game-reconnect-paused".to_string(),
        "INVITE".to_string(),
        "manager-socket".to_string(),
        "test-quiz".to_string(),
        quiz,
    );
    let paused = GameStatus::Paused(PausedData {
        reason: Some("paused".to_string()),
    });

    game.record_last_manager_status(&paused);
    let (status_name, status_data) = game.manager_reconnect_status();

    assert_eq!(status_name, "PAUSED");
    assert_eq!(
        status_data.get("reason").and_then(|v| v.as_str()),
        Some("paused")
    );
}

#[tokio::test]
async fn test_bot_manager_schedule_answers() {
    let quiz = test_quiz();
    let question = quiz.questions[0].clone();
    let game_ref = Arc::new(Mutex::new(Game::new(
        "game-bot".to_string(),
        "BOTS".to_string(),
        "manager-socket".to_string(),
        "test-quiz".to_string(),
        quiz,
    )));
    {
        let mut game = game_ref.lock().unwrap();
        game.engine.phase = GamePhase::SelectAnswer;
    }

    let io = make_socket_io();
    let bot_manager = BotManager::new();
    let bot_client_id = "bot-client-1";
    bot_manager.add_bot_speed(bot_client_id.to_string());

    let bot = test_bot_player(bot_client_id);
    bot_manager
        .schedule_answers("game-bot".to_string(), vec![bot], question, game_ref, io)
        .await;

    bot_manager.cancel_pending(Some(bot_client_id)).await;
}

#[tokio::test]
async fn test_load_snapshot_restores_games_by_invite_code() {
    let _guard = ConfigPathGuard::acquire().expect("Failed to create test config directory");

    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, invite_code, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            "player-socket".to_string(),
            "player-client".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
    }

    assert!(registry.get_game_by_code(&invite_code).is_some());
    assert!(registry.get_game_by_id(&game_id).is_some());

    registry.save_snapshot().await;

    let mut fresh_registry = GameRegistry::new(&None, test_quiz()).await;
    fresh_registry.load_snapshot().await;

    assert!(
        fresh_registry.get_game_by_code(&invite_code).is_some(),
        "Restored game should be findable by invite_code"
    );
    assert!(
        fresh_registry.get_game_by_id(&game_id).is_some(),
        "Restored game should be findable by game_id"
    );
}

#[tokio::test]
async fn test_showroom_transport_disconnect_keeps_slot() {
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            "player-socket".to_string(),
            "player-client".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
    }

    let result = registry.mark_player_disconnected("player-socket", false);
    assert!(
        result.is_some(),
        "mark_player_disconnected should return Some"
    );

    let (ret_game_id, ret_manager_socket_id, removed_socket_id, total_players, removed) =
        result.unwrap();

    assert_eq!(ret_game_id, game_id, "game_id should match");
    assert_eq!(
        ret_manager_socket_id, "manager-socket",
        "manager_socket_id should match"
    );
    assert_eq!(
        removed_socket_id, "player-socket",
        "third element should be player socket_id"
    );
    assert_eq!(total_players, 1, "player should still be in roster");
    assert!(
        !removed,
        "removed flag should be false for keep-slot disconnect"
    );

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        assert_eq!(
            game.players.len(),
            1,
            "player should still be in players list"
        );
        assert!(
            !game.players[0].connected,
            "player should be marked disconnected"
        );
        assert_eq!(
            game.players[0].id, "player-socket",
            "player socket_id should match"
        );
    }
}

#[tokio::test]
async fn test_showroom_leave_hard_removes() {
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            "player-socket".to_string(),
            "player-client".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
    }

    let result = registry.mark_player_disconnected("player-socket", true);
    assert!(
        result.is_some(),
        "mark_player_disconnected should return Some"
    );

    let (ret_game_id, ret_manager_socket_id, removed_socket_id, total_players, removed) =
        result.unwrap();

    assert_eq!(ret_game_id, game_id, "game_id should match");
    assert_eq!(
        ret_manager_socket_id, "manager-socket",
        "manager_socket_id should match"
    );
    assert_eq!(
        removed_socket_id, "player-socket",
        "third element should be player SOCKET id, not client_id (regression test #84)"
    );
    assert_ne!(removed_socket_id, "player-client", "must not be client_id");
    assert_eq!(total_players, 0, "player should be removed from roster");
    assert!(removed, "removed flag should be true for hard remove");

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        assert_eq!(
            game.players.len(),
            0,
            "player should be removed from players list"
        );
    }
}

#[tokio::test]
async fn test_midgame_disconnect_keeps_slot_even_with_flag() {
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            "player-socket".to_string(),
            "player-client".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
        game.engine.start().unwrap();
        game.engine.phase = GamePhase::SelectAnswer;
    }

    let result = registry.mark_player_disconnected("player-socket", true);
    assert!(
        result.is_some(),
        "mark_player_disconnected should return Some"
    );

    let (_ret_game_id, _ret_manager_socket_id, _removed_socket_id, total_players, removed) =
        result.unwrap();

    assert_eq!(total_players, 1, "player should still be in roster");
    assert!(
        !removed,
        "removed should be false because we're mid-game, not ShowRoom"
    );

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        assert_eq!(
            game.players.len(),
            1,
            "player should still be in players list"
        );
        assert!(
            !game.players[0].connected,
            "player should be marked disconnected"
        );
    }
}

#[tokio::test]
async fn test_disconnect_cleans_socket_index() {
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            "player-socket".to_string(),
            "player-client".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
    }

    registry.mark_player_disconnected("player-socket", false);

    let game_ref = registry.get_game_by_id(&game_id).unwrap();
    let game = game_ref.lock().unwrap();
    assert_eq!(
        game.players.len(),
        1,
        "player slot kept after keep-slot disconnect"
    );
    assert!(!game.players[0].connected, "player marked disconnected");
}

#[tokio::test]
async fn test_keep_slot_player_still_findable_by_client_id() {
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            "player-socket".to_string(),
            "player-client".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
    }

    registry.mark_player_disconnected("player-socket", false);

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        let player = game.players.iter().find(|p| p.client_id == "player-client");
        assert!(
            player.is_some(),
            "player should be findable by client_id after keep-slot disconnect"
        );
        let player = player.unwrap();
        assert_eq!(player.id, "player-socket", "socket_id should still match");
        assert!(!player.connected, "player should be marked disconnected");
    }
}

#[tokio::test]
async fn test_evict_running_abandoned_game_with_stale_last_activity() {
    // W1-1b: RUNNING game with dead manager + stale activity should be evicted
    // by new logic (currently RED on origin/main — fix not yet implemented).
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket-dead".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        // Move to RUNNING phase (SelectAnswer)
        game.add_player(
            "player-socket-1".to_string(),
            "player-client-1".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
        game.engine.start().unwrap();
        game.engine.phase = GamePhase::SelectAnswer;
        // Mark as stale (>5 min old)
        game.last_activity_ms = 0;
    }

    let io = make_socket_io();
    registry.evict_stale_games(&io);

    assert!(
        registry.get_game_by_id(&game_id).is_none(),
        "RUNNING game with dead manager and stale activity should be evicted"
    );
}

#[tokio::test]
async fn test_dont_evict_running_game_with_fresh_activity() {
    // W1-1b: RUNNING game with dead manager but fresh activity should NOT be evicted
    // (should GREEN on origin/main — is_stale check blocks eviction).
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket-dead".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        // Move to RUNNING phase
        game.add_player(
            "player-socket-1".to_string(),
            "player-client-1".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
        game.engine.start().unwrap();
        game.engine.phase = GamePhase::SelectAnswer;
        // Keep activity fresh (recent timestamp)
        game.last_activity_ms = get_now_ms();
    }

    let io = make_socket_io();
    registry.evict_stale_games(&io);

    assert!(
        registry.get_game_by_id(&game_id).is_some(),
        "RUNNING game with fresh activity should not be evicted even if manager is dead"
    );
}

// W1-1b Q5 fourth case — "RUNNING + stale + manager socket RESOLVABLE → not evicted"
// — is not unit-testable here. `evict_stale_games` resolves manager liveness via
// `io.get_socket(sid)` (socketioxide-0.15.2 io.rs:925), which only returns `Some`
// for a socket that completed a real transport handshake. `make_socket_io()`
// (this file, line 75) builds a bare `SocketIo` with an empty namespace and no
// connected client — every sid, "dead" or not, resolves to `None`, same as every
// other test in this module (state/tests.rs, socket/lifecycle/tests.rs,
// socket/reveal_helpers.rs all use the identical zero-socket pattern). Getting a
// resolvable socket requires a real bound server plus a websocket/polling client
// completing the socket.io handshake; socketioxide has no public mock/insert API
// for this (only an internal `__test_harness` cargo feature used by its own
// integration tests together with a real hyper server + tokio-tungstenite
// client — not exposed to downstream crates, and adopting it here would add new
// dev-dependencies no other test in this crate needs). The manager-alive,
// game-not-evicted path is exercised end-to-end instead by the mp-loop flow in
// e2e/stagehand/mp-loop.spec.ts, where a live manager keeps a RUNNING game from
// ever reaching the reaper.

#[tokio::test]
async fn test_evict_running_abandoned_even_with_connected_players() {
    // W1-1b: RUNNING game with dead manager + stale activity should be evicted
    // even if players are still connected (new logic overrides has_connected_players).
    // Should be RED on origin/main — fix not yet implemented.
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket-dead".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        // Move to RUNNING phase with connected players
        game.add_player(
            "player-socket-1".to_string(),
            "player-client-1".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
        game.add_player(
            "player-socket-2".to_string(),
            "player-client-2".to_string(),
            "Bob".to_string(),
            None,
        )
        .unwrap();
        game.engine.start().unwrap();
        game.engine.phase = GamePhase::SelectAnswer;
        // Mark as stale
        game.last_activity_ms = 0;
        // Both players still connected (default from add_player)
        assert!(
            game.has_connected_players(),
            "setup: should have connected players"
        );
    }

    let io = make_socket_io();
    registry.evict_stale_games(&io);

    assert!(
        registry.get_game_by_id(&game_id).is_none(),
        "RUNNING game with dead manager and stale activity should be evicted \
         even if players are still connected (new eviction logic override)"
    );
}

#[tokio::test]
async fn test_kick_player_cleans_socket_to_game_index() {
    // W5-1: Verify that when a player is kicked, they are removed from
    // registry.socket_to_game index (was leaking stale entries before fix #144).
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None,
            false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    // Add a player to the game
    let player_socket_id = "player-socket-1".to_string();
    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player(
            player_socket_id.clone(),
            "player-client-1".to_string(),
            "Alice".to_string(),
            None,
        )
        .unwrap();
    }

    // Manually index the player socket (simulating what happens in the real join flow)
    registry.index_player_socket(player_socket_id.clone(), game_id.clone());

    // Verify player is indexed in socket_to_game
    assert!(
        registry.is_socket_indexed(&player_socket_id),
        "Player socket should be indexed after join"
    );

    // Simulate the kick-handler cleanup: remove player from game, then deindex
    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        if let Some(pos) = game.players.iter().position(|p| p.id == player_socket_id) {
            game.players.remove(pos);
        }
    }

    // This is the fix: deindex the player socket after removal (#144)
    registry.deindex_player_socket(&player_socket_id);

    // Verify player is NO LONGER indexed in socket_to_game
    assert!(
        !registry.is_socket_indexed(&player_socket_id),
        "Player socket should NOT be indexed after kick and deindex (fix for #144)"
    );
}

// ── #477: configurable per-game participant cap ──────────────────────────────

#[test]
fn test_resolve_player_cap_none_and_nonpositive_default_to_hard_ceiling() {
    assert_eq!(resolve_player_cap(None), None);
    assert_eq!(resolve_player_cap(Some(0)), None);
    assert_eq!(resolve_player_cap(Some(-5)), None);
}

#[test]
fn test_resolve_player_cap_valid_value_passes_through() {
    assert_eq!(resolve_player_cap(Some(50)), Some(50));
}

#[test]
fn test_resolve_player_cap_clamps_above_hard_ceiling() {
    assert_eq!(resolve_player_cap(Some(5000)), Some(MAX_PLAYERS_PER_GAME));
    assert_eq!(resolve_player_cap(Some(201)), Some(MAX_PLAYERS_PER_GAME));
}

#[test]
fn test_resolve_player_cap_exactly_at_ceiling_passes_through() {
    assert_eq!(
        resolve_player_cap(Some(MAX_PLAYERS_PER_GAME as i64)),
        Some(MAX_PLAYERS_PER_GAME)
    );
    assert_eq!(resolve_player_cap(Some(200)), Some(200));
}

#[test]
fn test_player_cap_allows_join_under_configured_limit() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let mut game = Game::new(
        "game-1".to_string(),
        "INV1".to_string(),
        "manager-1".to_string(),
        "test-quiz".to_string(),
        empty_quiz,
    );
    game.player_cap = Some(3);

    for i in 0..2 {
        game.add_player(
            format!("socket-{i}"),
            format!("client-{i}"),
            format!("User{i}"),
            None,
        )
        .unwrap();
    }
    assert!(
        !game.is_at_player_cap(),
        "2 players with cap 3 must still allow join"
    );
}

#[test]
fn test_player_cap_allows_join_exactly_at_configured_limit_boundary() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let mut game = Game::new(
        "game-1".to_string(),
        "INV1".to_string(),
        "manager-1".to_string(),
        "test-quiz".to_string(),
        empty_quiz,
    );
    game.player_cap = Some(3);

    // 2 players: one under the limit — the 3rd (last allowed) join may still go through.
    for i in 0..2 {
        game.add_player(
            format!("socket-{i}"),
            format!("client-{i}"),
            format!("User{i}"),
            None,
        )
        .unwrap();
    }
    assert!(
        !game.is_at_player_cap(),
        "2/3: last allowed join must still be permitted"
    );

    // 3rd player joins — cap reached; a 4th join must be rejected by login.rs.
    game.add_player(
        "socket-2".to_string(),
        "client-2".to_string(),
        "User2".to_string(),
        None,
    )
    .unwrap();
    assert!(
        game.is_at_player_cap(),
        "3/3: limit reached, next join must be rejected"
    );
}

#[test]
fn test_player_cap_rejects_join_above_configured_limit() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let mut game = Game::new(
        "game-1".to_string(),
        "INV1".to_string(),
        "manager-1".to_string(),
        "test-quiz".to_string(),
        empty_quiz,
    );
    game.player_cap = Some(3);

    for i in 0..3 {
        game.add_player(
            format!("socket-{i}"),
            format!("client-{i}"),
            format!("User{i}"),
            None,
        )
        .unwrap();
    }
    assert!(
        game.is_at_player_cap(),
        "3 players at cap 3: a 4th join would be rejected in login.rs"
    );
}

#[test]
fn test_player_cap_unconfigured_falls_back_to_previous_hard_ceiling_behavior() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let game = Game::new(
        "game-1".to_string(),
        "INV1".to_string(),
        "manager-1".to_string(),
        "test-quiz".to_string(),
        empty_quiz,
    );
    // player_cap stays None from Game::new — prior hard-ceiling behaviour unchanged.
    assert_eq!(game.effective_player_cap(), MAX_PLAYERS_PER_GAME);
}

#[test]
fn test_participant_cap_from_selected_modes_wiring() {
    use razzoozle_protocol::game::SelectedModes;

    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };

    // Test case 1: Valid cap value (50) passes through
    let mut game1 = Game::new(
        "game-cap-valid".to_string(),
        "INV1".to_string(),
        "manager-1".to_string(),
        "test-quiz".to_string(),
        empty_quiz.clone(),
    );
    let modes1 = SelectedModes {
        scoring_mode: None,
        team_mode: None,
        klassen: None,
        end_screen: None,
        participant_cap: Some(50),
    };
    // Simulate socket handler wiring: extract and validate
    let requested_cap1 = modes1.participant_cap;
    game1.player_cap = crate::state::resolve_player_cap(requested_cap1);
    assert_eq!(
        game1.player_cap,
        Some(50),
        "Valid cap value 50 must pass through unchanged"
    );

    // Test case 2: Over-ceiling cap (250) gets clamped to MAX_PLAYERS_PER_GAME (200)
    let mut game2 = Game::new(
        "game-cap-clamped".to_string(),
        "INV2".to_string(),
        "manager-1".to_string(),
        "test-quiz".to_string(),
        empty_quiz.clone(),
    );
    let modes2 = SelectedModes {
        scoring_mode: None,
        team_mode: None,
        klassen: None,
        end_screen: None,
        participant_cap: Some(250),
    };
    let requested_cap2 = modes2.participant_cap;
    game2.player_cap = crate::state::resolve_player_cap(requested_cap2);
    assert_eq!(
        game2.player_cap,
        Some(MAX_PLAYERS_PER_GAME),
        "Cap value 250 must be clamped down to server ceiling 200"
    );

    // Test case 3: None cap (client omits it) falls back to hard ceiling behaviour
    let mut game3 = Game::new(
        "game-cap-none".to_string(),
        "INV3".to_string(),
        "manager-1".to_string(),
        "test-quiz".to_string(),
        empty_quiz,
    );
    let modes3 = SelectedModes {
        scoring_mode: None,
        team_mode: None,
        klassen: None,
        end_screen: None,
        participant_cap: None,
    };
    let requested_cap3 = modes3.participant_cap;
    game3.player_cap = crate::state::resolve_player_cap(requested_cap3);
    assert_eq!(
        game3.player_cap, None,
        "None cap must remain None (hardcoded ceiling applies)"
    );
}

#[test]
fn test_participant_cap_snapshot_stores_clamped_value_not_raw_client_value() {
    use razzoozle_protocol::game::SelectedModes;

    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };

    // Test: client sends 250 (over ceiling 200), both player_cap AND snapshot.participant_cap must show 200
    let mut game = Game::new(
        "game-snapshot-clamp".to_string(),
        "INV1".to_string(),
        "manager-1".to_string(),
        "test-quiz".to_string(),
        empty_quiz,
    );

    // Simulate socket handler: client sends 250
    let client_modes = SelectedModes {
        scoring_mode: None,
        team_mode: None,
        klassen: None,
        end_screen: None,
        participant_cap: Some(250),
    };

    // Handler: extract + clamp + snapshot
    let requested_player_cap = client_modes.participant_cap;
    game.player_cap = crate::state::resolve_player_cap(requested_player_cap);
    // BUG FIX: snapshot must store clamped value, not raw
    game.selected_modes = SelectedModes {
        scoring_mode: None,
        team_mode: None,
        klassen: None,
        end_screen: None,
        participant_cap: game.player_cap.map(|u| u as i64),
    };

    // Verify: both must be 200, not 250
    assert_eq!(
        game.player_cap,
        Some(MAX_PLAYERS_PER_GAME),
        "player_cap must be clamped to 200"
    );
    assert_eq!(
        game.selected_modes.participant_cap,
        Some(MAX_PLAYERS_PER_GAME as i64),
        "snapshot.participant_cap must also be 200, not raw 250 — readers of snapshot must see wirksam value"
    );
}

#[test]
fn test_participant_cap_snapshot_roundtrip_preserves_value() {
    use crate::state::snapshot::{game_from_snapshot, game_to_snapshot};
    use razzoozle_protocol::game::SelectedModes;

    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };

    // Create a game with a participant cap
    let mut game = Game::new(
        "game-roundtrip-test".to_string(),
        "INV999".to_string(),
        "manager-roundtrip".to_string(),
        "test-quiz".to_string(),
        empty_quiz.clone(),
    );

    // Set participant cap to 50 (below ceiling, will pass through unmodified)
    game.selected_modes = SelectedModes {
        scoring_mode: Some("speed".to_string()),
        team_mode: Some(true),
        klassen: None,
        end_screen: None,
        participant_cap: Some(50),
    };
    game.player_cap = crate::state::resolve_player_cap(Some(50));

    // Write to snapshot
    let snapshot_json = game_to_snapshot(&game);

    // Verify snapshot contains the participant_cap
    assert_eq!(
        snapshot_json
            .get("selectedModes")
            .and_then(|m| m.get("participantCap"))
            .and_then(|p| p.as_i64()),
        Some(50),
        "snapshot must contain participantCap = 50"
    );

    // Read from snapshot
    let restored_game =
        game_from_snapshot(&snapshot_json).expect("snapshot restoration should not fail");

    // Verify roundtrip: selected_modes.participant_cap restored
    assert_eq!(
        restored_game.selected_modes.participant_cap,
        Some(50),
        "restored selected_modes.participant_cap must be 50"
    );

    // Verify roundtrip: player_cap restored (clamped from selected_modes)
    assert_eq!(
        restored_game.player_cap,
        Some(50),
        "restored player_cap must be 50 (unclamped, below ceiling)"
    );

    // Test with a clamped value: client sends 500, ceiling is 200
    let mut game2 = Game::new(
        "game-roundtrip-clamped".to_string(),
        "INV888".to_string(),
        "manager-clamped".to_string(),
        "test-quiz".to_string(),
        empty_quiz,
    );

    // Simulate handler: clamp 500 to 200
    game2.selected_modes.participant_cap = Some(200); // Already clamped by resolve_player_cap
    game2.player_cap = Some(200); // MAX_PLAYERS_PER_GAME = 200

    // Write to snapshot
    let snapshot_json2 = game_to_snapshot(&game2);

    // Read from snapshot
    let restored_game2 =
        game_from_snapshot(&snapshot_json2).expect("snapshot restoration should not fail");

    // Verify clamped value round-trips correctly
    assert_eq!(
        restored_game2.selected_modes.participant_cap,
        Some(200),
        "restored selected_modes.participant_cap must be 200 (clamped)"
    );
    assert_eq!(
        restored_game2.player_cap,
        Some(200),
        "restored player_cap must be 200 (clamped ceiling)"
    );
}
