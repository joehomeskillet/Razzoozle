//! FlowerBattle S2C emitters (WP #933 L-01).
//! Real call-sites for every `game:flowerBattle:*` constant.

use crate::state::Game;
use razzoozle_engine::flower_battle::AppliedEffect;
use razzoozle_protocol::constants;
use razzoozle_protocol::experience::PowerupOffer;
use razzoozle_protocol::game::ExperienceMode;
use socketioxide::SocketIo;

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
