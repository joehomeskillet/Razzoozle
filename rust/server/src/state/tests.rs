use super::*;

use crate::bot::BotManager;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Quizz;
use razzoozle_protocol::status::{GameStatus, PausedData, SelectAnswerData};
use socketioxide::SocketIo;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

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
    assert!(GameRegistry::validate_username("中文名").is_err(), "3 CJK chars should be too short");

    // CJK characters: 4 chars (12 bytes) — should pass (exactly min)
    assert!(GameRegistry::validate_username("中文名字").is_ok(), "4 CJK chars should be valid");

    // CJK characters: 20 chars (60 bytes) — should pass (exactly max)
    assert!(GameRegistry::validate_username("中文名字中文名字中文名字中文名字中文名字").is_ok(), "20 CJK chars should be valid");

    // CJK characters: 21 chars (63 bytes) — should fail (too long)
    assert!(GameRegistry::validate_username("中文名字中文名字中文名字中文名字中文名字中").is_err(), "21 CJK chars should be too long");
}

#[test]
fn test_validate_avatar() {
    // Valid avatars
    assert!(GameRegistry::validate_avatar("").is_ok());
    assert!(GameRegistry::validate_avatar("data:image/svg+xml;utf8,<svg></svg>").is_ok());
    assert!(GameRegistry::validate_avatar("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==").is_ok());

    // SVG too large (exceeds 64KB max)
    let large_svg = format!("data:image/svg+xml;{}", "x".repeat(66000));
    assert!(GameRegistry::validate_avatar(&large_svg).is_err(), "Large SVG should be rejected");
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
            None, false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        );
        assert!(result.is_ok(), "Game {} creation failed", i);
    }

    // 101st game should fail (cap exceeded)
    let result = registry.create_game(
        "socket-overflow".to_string(),
        Some("test-quiz".to_string()),
        "client-overflow".to_string(),
        None, false,
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
    let result = registry.create_game("socket-1".to_string(), None, "client-1".to_string(), None, false, serde_json::json!({"enabled": false, "clockSync": true}));
    assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

    // Empty-string quizzId
    let result = registry.create_game(
        "socket-2".to_string(),
        Some(String::new()),
        "client-2".to_string(),
        None, false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        );
    assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

    // Unknown quizzId (not registered)
    let result = registry.create_game(
        "socket-3".to_string(),
        Some("does-not-exist".to_string()),
        "client-3".to_string(),
        None, false,
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
        .add_player("socket-1".to_string(), "client-1".to_string(), "Alice".to_string(), None)
        .is_ok());

    let result = game.add_player(
        "socket-2".to_string(),
        "client-1".to_string(),
        "AliceAgain".to_string(),
        None,
    );
    assert_eq!(result.unwrap_err(), "errors:game.playerAlreadyConnected");
    assert_eq!(game.players.len(), 1, "duplicate join must not create a second player record");
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
            None, false,
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
            None, false,
            serde_json::json!({"enabled": false, "clockSync": true}),
        )
        .unwrap();

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player("socket-1".to_string(), "client-1".to_string(), "Alice".to_string(), None).unwrap();
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
            None, false,
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
        game.add_player("socket-1".to_string(), "client-1".to_string(), "Alice".to_string(), None).unwrap();
        game.add_player("socket-2".to_string(), "client-2".to_string(), "Bob".to_string(), None).unwrap();
        for p in game.players.iter_mut() {
            p.connected = false;
        }
    }

    // Verify 2 players are in the game
    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        assert_eq!(game.players.len(), 2, "Should have 2 players");
        assert!(!game.has_connected_players(), "setup: both players must be disconnected");
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
    assert!(registry.get_game_by_id(&game_id).is_none(), "Game should be evicted");
    assert_eq!(registry.game_count(), 0, "No games should remain");
}

#[test]
fn test_per_ip_solo_rate_limit() {
    let rate_limiter = RateLimiter::new();

    // IP 1 should be allowed up to SOLO_RATE_MAX_PER_CLIENT calls
    for _ in 0..SOLO_RATE_MAX_PER_CLIENT {
        assert!(rate_limiter.check_solo_rate("192.168.1.1"), "IP1 should be allowed");
    }
    assert!(!rate_limiter.check_solo_rate("192.168.1.1"), "IP1 should be throttled");

    // IP 2 should have independent limit
    assert!(rate_limiter.check_solo_rate("192.168.1.2"), "IP2 should be allowed");
    assert!(rate_limiter.check_solo_rate("192.168.1.2"), "IP2 should be allowed");
}

#[test]
fn test_per_ip_auth_throttle() {
    let rate_limiter = RateLimiter::new();

    // IP 1: 10 failures should trigger throttle on 11th attempt
    for _ in 0..AUTH_RATE_MAX_PER_CLIENT {
        assert!(!rate_limiter.record_auth_failure_and_check_throttle("192.168.1.1"), "Should not be throttled yet");
    }
    assert!(rate_limiter.record_auth_failure_and_check_throttle("192.168.1.1"), "Should be throttled now");

    // IP 2 should have independent limit
    assert!(!rate_limiter.record_auth_failure_and_check_throttle("192.168.1.2"), "IP2 should not be throttled");
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
            None, false,
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
        server_seq: None,
        server_now_ms: Some(1_000),
        question_start_at_server_ms: Some(1_000),
        answer_deadline_at_server_ms: Some(11_000),
        submitted_by: None,
        sentence: None,
        tokens: None,
        pos_set: None,
        disabled_tokens: None,
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
        .schedule_answers(
            "game-bot".to_string(),
            vec![bot],
            question,
            game_ref,
            io,
        )
        .await;

    bot_manager.cancel_pending(Some(bot_client_id)).await;
}


#[tokio::test]
async fn test_load_snapshot_restores_games_by_invite_code() {
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, invite_code, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            None, false,
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
            None, false,
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
    assert!(result.is_some(), "mark_player_disconnected should return Some");

    let (ret_game_id, ret_manager_socket_id, removed_socket_id, total_players, removed) =
        result.unwrap();

    assert_eq!(ret_game_id, game_id, "game_id should match");
    assert_eq!(ret_manager_socket_id, "manager-socket", "manager_socket_id should match");
    assert_eq!(removed_socket_id, "player-socket", "third element should be player socket_id");
    assert_eq!(total_players, 1, "player should still be in roster");
    assert_eq!(removed, false, "removed flag should be false for keep-slot disconnect");

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        assert_eq!(game.players.len(), 1, "player should still be in players list");
        assert_eq!(game.players[0].connected, false, "player should be marked disconnected");
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
            None, false,
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
    assert!(result.is_some(), "mark_player_disconnected should return Some");

    let (ret_game_id, ret_manager_socket_id, removed_socket_id, total_players, removed) =
        result.unwrap();

    assert_eq!(ret_game_id, game_id, "game_id should match");
    assert_eq!(ret_manager_socket_id, "manager-socket", "manager_socket_id should match");
    assert_eq!(
        removed_socket_id, "player-socket",
        "third element should be player SOCKET id, not client_id (regression test #84)"
    );
    assert_ne!(removed_socket_id, "player-client", "must not be client_id");
    assert_eq!(total_players, 0, "player should be removed from roster");
    assert_eq!(removed, true, "removed flag should be true for hard remove");

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        assert_eq!(game.players.len(), 0, "player should be removed from players list");
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
            None, false,
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
    assert!(result.is_some(), "mark_player_disconnected should return Some");

    let (_ret_game_id, _ret_manager_socket_id, _removed_socket_id, total_players, removed) =
        result.unwrap();

    assert_eq!(total_players, 1, "player should still be in roster");
    assert_eq!(
        removed, false,
        "removed should be false because we're mid-game, not ShowRoom"
    );

    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        assert_eq!(game.players.len(), 1, "player should still be in players list");
        assert_eq!(game.players[0].connected, false, "player should be marked disconnected");
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
            None, false,
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
    assert_eq!(game.players.len(), 1, "player slot kept after keep-slot disconnect");
    assert_eq!(game.players[0].connected, false, "player marked disconnected");
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
            None, false,
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
        let player = game
            .players
            .iter()
            .find(|p| p.client_id == "player-client");
        assert!(
            player.is_some(),
            "player should be findable by client_id after keep-slot disconnect"
        );
        let player = player.unwrap();
        assert_eq!(player.id, "player-socket", "socket_id should still match");
        assert_eq!(player.connected, false, "player should be marked disconnected");
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
            None, false,
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
            None, false,
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
            None, false,
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
        assert!(game.has_connected_players(), "setup: should have connected players");
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
            None, false,
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
