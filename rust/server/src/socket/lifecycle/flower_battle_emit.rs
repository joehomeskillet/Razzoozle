//! FlowerBattle S2C emitters (WP #933 L-01).
//! Real call-sites for every `game:flowerBattle:*` constant.

use crate::state::Game;
use razzoozle_engine::flower_battle::AppliedEffect;
use razzoozle_protocol::constants;
use razzoozle_protocol::experience::{FlowerBattlePlayerStatus, PowerupOffer};
use razzoozle_protocol::game::ExperienceMode;
use razzoozle_protocol::player::Player;
use socketioxide::SocketIo;
use tracing::error;

/// Reserve the next per-game revision while the caller holds the game mutex.
///
/// Exhaustion is reported and leaves the counter unchanged. A wrapped or
/// duplicate revision would violate the LWW contract, so callers emit nothing.
fn reserve_player_status_revision(game: &mut Game) -> Option<u64> {
    let Some(revision) = game.flower_battle_player_status_revision.checked_add(1) else {
        error!(
            game_id = %game.game_id,
            revision = game.flower_battle_player_status_revision,
            "FlowerBattle player-status revision exhausted; suppressing stale emit"
        );
        return None;
    };
    game.flower_battle_player_status_revision = revision;
    Some(revision)
}

/// True when this game is FlowerBattle experience mode.
#[inline]
pub fn is_flower_battle(game: &Game) -> bool {
    game.selected_modes.experience_mode == Some(ExperienceMode::FlowerBattle)
}

pub fn emit_flb_snapshot(io: &SocketIo, game_id: &str, game: &Game) {
    let payload = serde_json::json!({
        "gameId": game_id,
        "growthStage": game.flower_battle_effects.growth_stage,
        "sunPoints": game.flower_battle_sun_points,
        "winnerTeamIds": game.flower_battle_winner_team_ids,
        "victoryResolved": game.flower_battle_effects.victory_resolved,
        "offers": game.flower_battle_offers.values().cloned().collect::<Vec<_>>(),
    });
    io.to(game_id.to_string())
        .emit(constants::flower_battle::SNAPSHOT, &payload)
        .ok();
}

pub fn build_player_status(
    game_id: &str,
    game: &Game,
    player: &Player,
    revision: u64,
) -> FlowerBattlePlayerStatus {
    let team_id = player
        .team_id
        .as_deref()
        .map(str::trim)
        .filter(|team| !team.is_empty())
        .map(str::to_owned);
    let growth_stage = team_id
        .as_deref()
        .map(|team| game.flower_battle_effects.stage_of(team))
        .unwrap_or(0);
    let sun_points = team_id
        .as_deref()
        .and_then(|team| game.flower_battle_sun_points.get(team).copied())
        .unwrap_or(0);
    let active_effects = team_id
        .as_deref()
        .map(|team| game.flower_battle_effects.effects_for(team).to_vec())
        .unwrap_or_default();
    let winner_team_ids = game
        .flower_battle_winner_team_ids
        .clone()
        .unwrap_or_default();
    let is_winner = team_id
        .as_ref()
        .is_some_and(|team| winner_team_ids.contains(team));

    FlowerBattlePlayerStatus {
        game_id: game_id.to_string(),
        revision: revision.to_string(),
        question_index: game.engine.current_question_index as i32,
        team_id,
        growth_stage,
        max_growth_stage: game.flower_battle_effects.max_growth_stage,
        sun_points,
        active_effects,
        victory_resolved: game.flower_battle_effects.victory_resolved,
        winner_team_ids,
        is_winner,
    }
}

/// Optional FlowerBattle status for `player:successReconnect`.
///
/// - Non-FlowerBattle experience modes → `None` (field omitted on the wire).
/// - FlowerBattle → `Some` built from live game state and the reconnecting
///   player's own `team_id` only. Missing/blank team yields `team_id: None`
///   and zeroed team values — never the first map key, never a guessed team.
pub fn player_status_for_reconnect(
    game_id: &str,
    game: &mut Game,
    player: &Player,
) -> Option<FlowerBattlePlayerStatus> {
    if !is_flower_battle(game) {
        return None;
    }
    let revision = reserve_player_status_revision(game)?;
    Some(build_player_status(game_id, game, player, revision))
}

/// Re-key a game-local socket-keyed cache when a player reconnects with a new
/// socket id. No-op when ids match or the old key is absent. Only touches the
/// provided map (caller must pass a game-scoped cache, never a global index).
pub fn migrate_socket_keyed_cache<V>(
    cache: &mut std::collections::HashMap<String, V>,
    old_socket_id: &str,
    new_socket_id: &str,
) {
    if old_socket_id.is_empty() || old_socket_id == new_socket_id {
        return;
    }
    if let Some(value) = cache.remove(old_socket_id) {
        cache.insert(new_socket_id.to_string(), value);
    }
}

/// Emit personalized status to each connected player's current socket.
///
/// Deliberately not room-broadcast: each payload contains the authoritative
/// team assignment for exactly one player.
pub fn emit_player_statuses(io: &SocketIo, game_id: &str, game: &mut Game) {
    if !is_flower_battle(game) {
        return;
    }

    // One authoritative state snapshot, one revision shared by the batch.
    let Some(revision) = reserve_player_status_revision(game) else {
        return;
    };
    for player in game.players.iter().filter(|player| player.connected) {
        let Ok(socket_id) = player.id.parse() else {
            continue;
        };
        let Some(socket) = io.get_socket(socket_id) else {
            continue;
        };
        socket
            .emit(
                constants::flower_battle::PLAYER_STATUS,
                &build_player_status(game_id, game, player, revision),
            )
            .ok();
    }
}

pub fn emit_round_resolved(io: &SocketIo, game_id: &str, game: &Game) {
    let payload = serde_json::json!({
        "gameId": game_id,
        "questionIndex": game.engine.current_question_index,
        "growthStage": game.flower_battle_effects.growth_stage,
        "sunPoints": game.flower_battle_sun_points,
    });
    io.to(game_id.to_string())
        .emit(constants::flower_battle::ROUND_RESOLVED, &payload)
        .ok();
}

pub fn emit_powerup_offered(io: &SocketIo, game_id: &str, team_id: &str, offer: &PowerupOffer) {
    let payload = serde_json::json!({
        "gameId": game_id,
        "teamId": team_id,
        "offer": offer,
    });
    io.to(game_id.to_string())
        .emit(constants::flower_battle::POWERUP_OFFERED, &payload)
        .ok();
}

pub fn emit_powerup_selected(
    io: &SocketIo,
    game_id: &str,
    team_id: &str,
    option_index: usize,
    option_id: &str,
) {
    let payload = serde_json::json!({
        "gameId": game_id,
        "teamId": team_id,
        "optionIndex": option_index,
        "optionId": option_id,
    });
    io.to(game_id.to_string())
        .emit(constants::flower_battle::POWERUP_SELECTED, &payload)
        .ok();
}

pub fn emit_powerup_applied(
    io: &SocketIo,
    game_id: &str,
    team_id: &str,
    option_id: &str,
    applied: &AppliedEffect,
) {
    let payload = serde_json::json!({
        "gameId": game_id,
        "teamId": team_id,
        "optionId": option_id,
        "applied": format!("{:?}", applied),
    });
    io.to(game_id.to_string())
        .emit(constants::flower_battle::POWERUP_APPLIED, &payload)
        .ok();
}

pub fn emit_game_completed(io: &SocketIo, game_id: &str, winner_team_ids: &[String]) {
    let payload = serde_json::json!({
        "gameId": game_id,
        "winnerTeamIds": winner_team_ids,
    });
    io.to(game_id.to_string())
        .emit(constants::flower_battle::GAME_COMPLETED, &payload)
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;
    use razzoozle_protocol::experience::FlowerBattleEffect;
    use razzoozle_protocol::quizz::Quizz;

    fn game() -> Game {
        let mut game = Game::new(
            "game-1".into(),
            "ABCD".into(),
            "manager".into(),
            "quiz".into(),
            Quizz {
                subject: "FlowerBattle".into(),
                questions: vec![],
                archived: None,
                theme_id: None,
            },
        );
        game.selected_modes.experience_mode = Some(ExperienceMode::FlowerBattle);
        game
    }

    fn player(team_id: Option<&str>) -> Player {
        Player {
            id: "socket-1".into(),
            client_id: "client-1".into(),
            connected: true,
            username: "Alice".into(),
            points: 0,
            streak: 0,
            player_token: None,
            is_bot: None,
            avatar: None,
            achievements: None,
            team_id: team_id.map(str::to_owned),
            identifier_hash: None,
        }
    }

    #[test]
    fn player_status_maps_authoritative_team_effects_and_tied_winner() {
        let mut game = game();
        game.engine.current_question_index = 2;
        game.flower_battle_effects.set_stage("blue", 8);
        game.flower_battle_effects
            .push_effect("blue", FlowerBattleEffect::umbrella_shield(1));
        game.flower_battle_sun_points.insert("blue".into(), 3);
        game.flower_battle_effects.victory_resolved = true;
        game.flower_battle_winner_team_ids = Some(vec!["blue".into(), "green".into()]);

        let status = build_player_status("game-1", &game, &player(Some("blue")), 7);

        assert_eq!(status.revision, "7");
        assert_eq!(status.team_id.as_deref(), Some("blue"));
        assert_eq!(status.question_index, 2);
        assert_eq!(status.growth_stage, 8);
        assert_eq!(status.max_growth_stage, 10);
        assert_eq!(status.sun_points, 3);
        assert_eq!(
            status.active_effects,
            vec![FlowerBattleEffect::umbrella_shield(1)]
        );
        assert_eq!(status.winner_team_ids, vec!["blue", "green"]);
        assert!(status.victory_resolved);
        assert!(status.is_winner);
    }

    #[test]
    fn player_status_never_guesses_missing_team() {
        let mut game = game();
        game.flower_battle_effects.set_stage("blue", 8);
        game.flower_battle_sun_points.insert("blue".into(), 3);
        game.flower_battle_winner_team_ids = Some(vec!["blue".into()]);

        let status = build_player_status("game-1", &game, &player(None), 8);

        assert_eq!(status.team_id, None);
        assert_eq!(status.growth_stage, 0);
        assert_eq!(status.sun_points, 0);
        assert!(status.active_effects.is_empty());
        assert!(!status.is_winner);
    }

    #[test]
    fn reconnect_flower_battle_uses_player_team_not_first_map_key() {
        let mut game = game();
        // Plant a "first" map key that must never be selected by accident.
        game.flower_battle_effects.set_stage("aaa-first", 9);
        game.flower_battle_sun_points.insert("aaa-first".into(), 7);
        game.flower_battle_effects.set_stage("green", 4);
        game.flower_battle_sun_points.insert("green".into(), 2);
        game.engine.current_question_index = 1;

        let status =
            player_status_for_reconnect("game-1", &mut game, &player(Some("green"))).expect("Some");

        assert_eq!(status.team_id.as_deref(), Some("green"));
        assert_eq!(status.growth_stage, 4);
        assert_eq!(status.sun_points, 2);
        assert_eq!(status.question_index, 1);
        assert_ne!(status.team_id.as_deref(), Some("aaa-first"));
    }

    #[test]
    fn reconnect_non_flower_mode_returns_none() {
        let mut game = game();
        game.selected_modes.experience_mode = None;
        game.flower_battle_effects.set_stage("blue", 8);
        game.flower_battle_sun_points.insert("blue".into(), 3);

        assert!(player_status_for_reconnect("game-1", &mut game, &player(Some("blue"))).is_none());

        game.selected_modes.experience_mode = Some(ExperienceMode::Classic);
        assert!(player_status_for_reconnect("game-1", &mut game, &player(Some("blue"))).is_none());
    }

    #[test]
    fn reconnect_missing_team_does_not_guess() {
        let mut game = game();
        game.flower_battle_effects.set_stage("blue", 8);
        game.flower_battle_sun_points.insert("blue".into(), 3);
        game.flower_battle_winner_team_ids = Some(vec!["blue".into()]);

        let status = player_status_for_reconnect("game-1", &mut game, &player(None)).expect("Some");

        assert_eq!(status.team_id, None);
        assert_eq!(status.growth_stage, 0);
        assert_eq!(status.sun_points, 0);
        assert!(status.active_effects.is_empty());
        assert!(!status.is_winner);
    }

    #[test]
    fn reconnect_snapshot_revision_precedes_later_same_question_live_status() {
        let mut game = game();
        game.engine.current_question_index = 2;
        game.flower_battle_sun_points.insert("blue".into(), 1);

        let reconnect = player_status_for_reconnect("game-1", &mut game, &player(Some("blue")))
            .expect("FlowerBattle reconnect status");

        game.flower_battle_sun_points.insert("blue".into(), 5);
        game.flower_battle_effects
            .push_effect("blue", FlowerBattleEffect::sunbeam(4));
        game.flower_battle_effects.victory_resolved = true;
        game.flower_battle_winner_team_ids = Some(vec!["blue".into()]);
        let live_revision = reserve_player_status_revision(&mut game).expect("later live revision");
        let live = build_player_status("game-1", &game, &player(Some("blue")), live_revision);

        assert_eq!(reconnect.question_index, live.question_index);
        assert!(
            live.revision.parse::<u64>().expect("live decimal")
                > reconnect
                    .revision
                    .parse::<u64>()
                    .expect("reconnect decimal")
        );
        assert_eq!(live.sun_points, 5);
        assert!(live.victory_resolved);
        assert!(live.is_winner);
    }

    #[test]
    fn revision_exhaustion_is_non_panicking_and_does_not_wrap() {
        let mut game = game();
        game.flower_battle_player_status_revision = u64::MAX;

        let status = player_status_for_reconnect("game-1", &mut game, &player(Some("blue")));

        assert!(status.is_none());
        assert_eq!(game.flower_battle_player_status_revision, u64::MAX);
    }

    #[test]
    fn restored_game_reserves_after_persisted_revision() {
        let mut game = game();
        game.flower_battle_player_status_revision = 41;
        let snapshot = crate::state::snapshot::game_to_snapshot(&game);
        let mut restored =
            crate::state::snapshot::game_from_snapshot(&snapshot).expect("restore game");

        let status = player_status_for_reconnect("game-1", &mut restored, &player(Some("blue")))
            .expect("FlowerBattle reconnect status");

        assert_eq!(status.revision, "42");
        assert_eq!(restored.flower_battle_player_status_revision, 42);
    }

    #[test]
    fn migrate_socket_keyed_cache_moves_only_old_key() {
        let mut cache = std::collections::HashMap::new();
        cache.insert("old-sock".into(), 42u8);
        cache.insert("other-sock".into(), 7u8);

        migrate_socket_keyed_cache(&mut cache, "old-sock", "new-sock");

        assert_eq!(cache.get("new-sock"), Some(&42));
        assert!(!cache.contains_key("old-sock"));
        assert_eq!(cache.get("other-sock"), Some(&7));

        // Absent old key / same id are no-ops.
        migrate_socket_keyed_cache(&mut cache, "missing", "x");
        migrate_socket_keyed_cache(&mut cache, "new-sock", "new-sock");
        assert_eq!(cache.get("new-sock"), Some(&42));
        assert_eq!(cache.len(), 2);
    }
}
