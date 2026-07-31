//! FlowerBattle pre-reveal vote evaluation (WP #933 L-03/L-04).

use crate::state::{get_now_ms, Game};
use razzoozle_engine::flower_battle::{
    apply_effects, offer_seed, powerup_requires_target, record_attack, OfferedEffect, VoteState,
    VotingResult, OPTION_ACID_RAIN, OPTION_FERTILIZER, OPTION_SUNBEAM, OPTION_UMBRELLA_SHIELD,
    TARGET_VOTE_TIMEOUT_MS,
};
use socketioxide::SocketIo;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tracing::{info, warn};

use super::flower_battle_emit::{emit_powerup_applied, emit_powerup_selected, is_flower_battle};

/// Resolve power-up / target votes **before** reveal (L-04).
///
/// Forces evaluation at each session's deadline so mid-question votes still
/// resolve when the answer window ends. Handles all five `VotingResult` arms.
pub async fn resolve_votes_before_reveal(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
) {
    let need_target_wait = {
        let mut game = game_ref.lock().unwrap();
        if !is_flower_battle(&game) || game.flower_battle_effects.victory_resolved {
            return;
        }
        evaluate_all_votes(io, &mut game, game_id, /*allow_open_target=*/ true)
    };

    if need_target_wait {
        tokio::time::sleep(Duration::from_millis(TARGET_VOTE_TIMEOUT_MS as u64)).await;
        let mut game = game_ref.lock().unwrap();
        if game.flower_battle_effects.victory_resolved {
            return;
        }
        let _ = evaluate_all_votes(io, &mut game, game_id, /*allow_open_target=*/ false);
    }
}

/// Returns true if any new target vote was opened (caller should wait).
fn evaluate_all_votes(
    io: &SocketIo,
    game: &mut Game,
    game_id: &str,
    allow_open_target: bool,
) -> bool {
    let team_ids: Vec<String> = game.flower_battle_votes.keys().cloned().collect();
    let mut opened_target = false;

    for team_id in team_ids {
        let Some(vote) = game.flower_battle_votes.get_mut(&team_id) else {
            continue;
        };
        let force_ms = vote.deadline_ms;
        let result = vote.evaluate_at(force_ms);
        match result {
            VotingResult::Pending => {}
            VotingResult::AlreadyResolved(_) => {}
            VotingResult::PowerupSelected {
                option_index,
                option_id,
            } => {
                let offer_id = active_offer_id(game_id, game, &team_id);
                emit_powerup_selected(
                    io,
                    game_id,
                    &team_id,
                    &offer_id,
                    option_index,
                    &option_id,
                    force_ms,
                );
                if powerup_requires_target(&option_id) {
                    if allow_open_target {
                        let candidates = other_team_ids(game, &team_id);
                        let now = get_now_ms() as i64;
                        let seed = offer_seed(
                            game_id,
                            &team_id,
                            game.engine.current_question_index as i32,
                        );
                        let prev = game.flower_battle_previous_attacker.clone();
                        let target_vote = VoteState::new_target(
                            now + TARGET_VOTE_TIMEOUT_MS,
                            seed,
                            candidates,
                            team_id.clone(),
                            prev,
                        );
                        game.flower_battle_votes
                            .insert(team_id.clone(), target_vote);
                        opened_target = true;
                    } else {
                        emit_powerup_selected(
                            io,
                            game_id,
                            &team_id,
                            &offer_id,
                            option_index,
                            &option_id,
                            force_ms,
                        );
                    }
                } else if let Some(offered) = option_to_offered(&option_id, None) {
                    apply_and_emit(io, game, game_id, &team_id, offered, &option_id);
                }
            }
            VotingResult::TargetSelected { team_id: target } => {
                let attacker = team_id.clone();
                if let Some(offered) = option_to_offered(OPTION_ACID_RAIN, Some(target.as_str())) {
                    apply_and_emit(io, game, game_id, &attacker, offered, OPTION_ACID_RAIN);
                    record_attack(
                        &mut game.flower_battle_previous_attacker,
                        &target,
                        &attacker,
                    );
                }
            }
            VotingResult::AcidRainSkippedNoTarget => {
                let offer_id = active_offer_id(game_id, game, &team_id);
                emit_powerup_selected(
                    io,
                    game_id,
                    &team_id,
                    &offer_id,
                    0,
                    OPTION_ACID_RAIN,
                    force_ms,
                );
                info!(
                    "FLB acid_rain skipped (no target): gameId={} team={}",
                    game_id, team_id
                );
            }
        }
    }
    opened_target
}

fn other_team_ids(game: &Game, attacker: &str) -> Vec<String> {
    let mut teams = std::collections::BTreeSet::new();
    for p in &game.players {
        if let Some(ref tid) = p.team_id {
            let t = tid.trim();
            if !t.is_empty() && t != attacker {
                teams.insert(t.to_string());
            }
        }
    }
    teams.into_iter().collect()
}

fn option_to_offered(option_id: &str, target: Option<&str>) -> Option<OfferedEffect> {
    match option_id {
        OPTION_FERTILIZER => Some(OfferedEffect::Fertilizer),
        OPTION_SUNBEAM => Some(OfferedEffect::Sunbeam),
        OPTION_UMBRELLA_SHIELD => Some(OfferedEffect::UmbrellaShield),
        OPTION_ACID_RAIN => target.map(|t| OfferedEffect::AcidRain {
            target_team_id: t.to_string(),
        }),
        _ => None,
    }
}

fn active_offer_id(game_id: &str, game: &Game, team_id: &str) -> String {
    game.flower_battle_offers
        .iter()
        .filter(|((gid, tid, _), _)| gid == game_id && tid == team_id)
        .max_by_key(|((_, _, q), _)| *q)
        .map(|(_, o)| o.id.clone())
        .unwrap_or_else(|| {
            format!(
                "vote_result_{game_id}_{team_id}_{}",
                game.engine.current_question_index
            )
        })
}

fn apply_and_emit(
    io: &SocketIo,
    game: &mut Game,
    game_id: &str,
    acting_team: &str,
    offered: OfferedEffect,
    option_id: &str,
) {
    let offer_id = game
        .flower_battle_offers
        .iter()
        .filter(|((gid, tid, _), _)| gid == game_id && tid == acting_team)
        .max_by_key(|((_, _, q), _)| *q)
        .map(|(_, o)| o.id.clone())
        .unwrap_or_else(|| {
            format!(
                "apply_{acting_team}_{option_id}_{}",
                game.engine.current_question_index
            )
        });

    match apply_effects(
        &mut game.flower_battle_effects,
        acting_team,
        offered,
        &offer_id,
    ) {
        Ok(applied) => {
            emit_powerup_applied(io, game_id, acting_team, option_id, &applied);
        }
        Err(e) => {
            warn!(
                "FLB apply_effects failed: gameId={} team={} err={:?}",
                game_id, acting_team, e
            );
        }
    }
}
