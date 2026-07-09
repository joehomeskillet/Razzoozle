use super::*;

use crate::bot::BotManager;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants::Bot;
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Quizz;
use razzoozle_protocol::status::Status;
use socketioxide::SocketIo;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

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
            false,
        );
        assert!(result.is_ok(), "Game {} creation failed", i);
    }

    // 101st game should fail (cap exceeded)
    let result = registry.create_game(
        "socket-overflow".to_string(),
        Some("test-quiz".to_string()),
        "client-overflow".to_string(),
        false,
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
    let result = registry.create_game("socket-1".to_string(), None, "client-1".to_string(), false);
    assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

    // Empty-string quizzId
    let result = registry.create_game(
        "socket-2".to_string(),
        Some(String::new()),
        "client-2".to_string(),
        false,
    );
    assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

    // Unknown quizzId (not registered)
    let result = registry.create_game(
        "socket-3".to_string(),
        Some("does-not-exist".to_string()),
        "client-3".to_string(),
        false,
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
fn test_logged_clients_prunes_stale_entries_past_cap() {
    let empty_quiz = Quizz {
        subject: "Test".to_string(),
        questions: vec![],
        archived: None,
        theme_id: None,
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz));

    // Seed one entry as if logged in long before the staleness TTL.
    registry.logged_clients.insert("ancient-client".to_string(), 0);
    assert!(registry.is_logged("ancient-client"));

    // Push the map past the cap with fresh logins — triggers a prune pass.
    for i in 0..=LOGGED_CLIENTS_MAX_ENTRIES {
        registry.login_client(format!("client-{}", i));
    }

    assert!(!registry.is_logged("ancient-client"), "stale entry should have been pruned");
    assert!(
        registry.is_logged(&format!("client-{}", LOGGED_CLIENTS_MAX_ENTRIES)),
        "fresh entries must survive pruning"
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
            false,
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
    registry.evict_stale_games();

    assert!(
        registry.get_game_by_id(&game_id).is_none(),
        "poisoned-but-stale game should still be evicted, not leaked forever"
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
            false,
        )
        .unwrap();

    // Add players to the game
    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.add_player("socket-1".to_string(), "client-1".to_string(), "Alice".to_string(), None).unwrap();
        game.add_player("socket-2".to_string(), "client-2".to_string(), "Bob".to_string(), None).unwrap();
    }

    // Verify 2 players are in the game
    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let game = game_ref.lock().unwrap();
        assert_eq!(game.players.len(), 2, "Should have 2 players");
    }

    // Mark game as stale by setting old activity timestamp
    {
        let game_ref = registry.get_game_by_id(&game_id).unwrap();
        let mut game = game_ref.lock().unwrap();
        game.last_activity_ms = 0; // Very old timestamp
    }

    // Evict stale games (should remove the game and its players)
    registry.evict_stale_games();

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

#[tokio::test(start_paused = true)]
async fn test_empty_grace_mark_reactivate_cleanup() {
    let quiz = test_quiz();
    let mut registry = GameRegistry::new(&None, quiz.clone()).await;
    seed_quiz(&mut registry, "test-quiz", quiz);

    let (game_id, _, _) = registry
        .create_game(
            "manager-socket".to_string(),
            Some("test-quiz".to_string()),
            "manager-client".to_string(),
            false,
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

    registry.backdate_empty_game_mark(&game_id, 59_000);
    registry.cleanup_empty_games(&io);
    assert!(
        registry.get_game_by_id(&game_id).is_some(),
        "59s past mark is still inside the 5-min started-game grace window"
    );

    registry.backdate_empty_game_mark(&game_id, 301_000);
    registry.cleanup_empty_games(&io);
    assert!(
        registry.get_game_by_id(&game_id).is_none(),
        "301s past mark should trigger remove_game after grace expires"
    );
    assert_eq!(registry.game_count(), 0);
}

#[test]
fn test_manager_reconnect_no_stale_status() {
    let quiz = test_quiz();
    let mut game = Game::new(
        "game-reconnect".to_string(),
        "INVITE".to_string(),
        "manager-socket".to_string(),
        quiz,
    );
    game.manager_client_id = Some("manager-client".to_string());
    game.add_player(
        "player-socket".to_string(),
        "player-client".to_string(),
        "Alice".to_string(),
        None,
    )
    .unwrap();
    game.engine.start().unwrap();

    assert_eq!(game.engine.phase, GamePhase::ShowStart);

    // Stale snapshot GAP 1 would have left behind — must not leak into reconnect.
    game.last_manager_status = Some((
        Status::SelectAnswer,
        serde_json::json!({ "time": 10, "totalPlayers": 1 }),
    ));

    let (status_name, status_data) = game.manager_reconnect_status();

    assert_eq!(status_name, Game::phase_wire_name(game.engine.phase));
    assert_ne!(status_name, "SELECT_ANSWER", "must not replay stale SELECT_ANSWER");
    assert_eq!(
        status_data,
        serde_json::json!({ "text": "game:waitingForPlayers" })
    );
}

#[tokio::test(start_paused = true)]
async fn test_bot_manager_schedule_and_cancel() {
    let quiz = test_quiz();
    let question = quiz.questions[0].clone();
    let game_ref = Arc::new(Mutex::new(Game::new(
        "game-bot".to_string(),
        "BOTS".to_string(),
        "manager-socket".to_string(),
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
    bot_manager.set_bot_speed(bot_client_id, 0.0);

    let bot = test_bot_player(bot_client_id);
    bot_manager
        .schedule_answers(
            "game-bot".to_string(),
            vec![bot],
            question,
            game_ref.clone(),
            io.clone(),
        )
        .await;

    assert_eq!(bot_manager.pending_count(), 1, "schedule_answers should register a pending task");

    for _ in 0..20 {
        tokio::time::advance(Duration::from_millis(Bot::MIN_DELAY_MS / 4 + 1)).await;
        if bot_manager.pending_count() == 0 {
            break;
        }
        tokio::task::yield_now().await;
    }

    assert_eq!(
        bot_manager.pending_count(),
        0,
        "pending entry should clear after the scheduled delay fires"
    );

    bot_manager.add_bot_speed(bot_client_id.to_string());
    bot_manager.set_bot_speed(bot_client_id, 0.0);
    bot_manager
        .schedule_answers(
            "game-bot".to_string(),
            vec![test_bot_player(bot_client_id)],
            game_ref.lock().unwrap().engine.quiz.questions[0].clone(),
            game_ref.clone(),
            io.clone(),
        )
        .await;
    assert_eq!(bot_manager.pending_count(), 1);

    bot_manager.cancel_pending(Some(bot_client_id)).await;
    assert_eq!(
        bot_manager.pending_count(),
        0,
        "cancel_pending(Some(id)) should clear that bot's pending task immediately"
    );

    let bot_a = test_bot_player("bot-a");
    let bot_b = test_bot_player("bot-b");
    let question_multi = game_ref.lock().unwrap().engine.quiz.questions[0].clone();
    bot_manager.add_bot_speed("bot-a".to_string());
    bot_manager.add_bot_speed("bot-b".to_string());
    bot_manager.set_bot_speed("bot-a", 0.5);
    bot_manager.set_bot_speed("bot-b", 0.5);
    bot_manager
        .schedule_answers(
            "game-bot".to_string(),
            vec![bot_a, bot_b],
            question_multi,
            game_ref,
            io,
        )
        .await;
    assert_eq!(bot_manager.pending_count(), 2);

    bot_manager.cancel_pending(None).await;
    assert_eq!(
        bot_manager.pending_count(),
        0,
        "cancel_pending(None) should clear all pending bot tasks"
    );
}
