use super::*;

use razzoozle_protocol::quizz::Quizz;
use std::collections::HashMap;
use std::sync::Arc;

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
