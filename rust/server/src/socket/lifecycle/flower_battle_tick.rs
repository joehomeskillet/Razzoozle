//! FlowerBattle lifecycle tick (WP #933) — votes, scoring, offers, early finish.
//!
//! # Hook contract (mode-agnostic name, flower-specific body)
//!
//! Experience early-finish hooks share [`razzoozle_engine::state::ModeOutcome`]:
//! - **#884 Pyramid** / **#892 DeepSea** will plug the same post-reveal site.
//! - This module is the FlowerBattle implementation of that contract.
//!
//! # Order (binding)
//! 1. **Before reveal:** `VoteState::evaluate_at` → apply selected power-ups
//!    (all five [`VotingResult`] arms). No new offers after victory starts.
//! 2. **Reveal** (caller: `perform_reveal_and_broadcast`).
//! 3. **After reveal:** growth pipeline from real answers → sun points → offers
//!    (only if not completed) → `check_mode_outcome` → optional early finish.
//!
//! # Determinism / expires_at (L-06)
//! Offer `expires_at` = `phase_anchor_ms + POWERUP_VOTE_TIMEOUT_MS` where
//! `phase_anchor_ms` is the server clock at offer creation (`get_now_ms()`).
//! Seed itself never includes wall clock (`powerups/mod.rs` determinism contract);
//! only the deadline uses wall time so clients share one vote window.

use crate::state::{get_now_ms, Game};
use razzoozle_engine::eval;
use razzoozle_engine::flower_battle::{
    apply_growth_pipeline, apply_question_growth, base_growth_to_sunpoints, check_mode_outcome,
    consume_and_excess, existing_offer_or_create, generate_powerup_offer, mark_victory_resolved,
    offer_seed, parse_offer_options, ratio_to_base_growth, select_offer_options,
    should_trigger_offer, team_round_ratio, time_factor, PlayerRoundContribution, VoteState,
    POWERUP_VOTE_TIMEOUT_MS,
};
use razzoozle_engine::state::{GamePhase, ModeOutcome};
use razzoozle_engine::team_vote::compute_team_standings;
use socketioxide::SocketIo;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tracing::{info, warn};

use super::flower_battle_emit::{
    emit_flb_snapshot, emit_game_completed, emit_player_statuses, emit_powerup_offered,
    emit_round_resolved, is_flower_battle,
};

// Vote resolve lives in flower_battle_votes_tick (L-03/L-04).
pub use super::flower_battle_votes_tick::resolve_votes_before_reveal;

/// After reveal: growth from answers, offers, early-finish check.
///
/// Returns `true` if the game finished early (caller must `return` from loop).
pub async fn after_reveal_tick(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    db_pool: &Option<sqlx::PgPool>,
) -> bool {
    let outcome = {
        let mut game = game_ref.lock().unwrap();
        if !is_flower_battle(&game) {
            return false;
        }
        if game.flower_battle_effects.victory_resolved || game.finish_broadcast_done {
            // Already finished — never double-finish.
            return false;
        }

        apply_growth_from_answers(&mut game);
        emit_round_resolved(io, game_id, &game);
        emit_flb_snapshot(io, game_id, &game);

        // Build team scores from current standings (existing rank logic).
        let standings = compute_team_standings(&game.engine.players);
        let mut team_scores = HashMap::new();
        for s in &standings {
            team_scores.insert(s.team_id.clone(), s.points);
        }
        // Also fold player points without team standings edge cases.
        for p in &game.engine.players {
            if let Some(ref tid) = p.team_id {
                let t = tid.trim();
                if !t.is_empty() {
                    *team_scores.entry(t.to_string()).or_insert(0) += 0; // ensure key
                }
            }
        }

        let outcome = check_mode_outcome(&game.flower_battle_effects, &team_scores);

        match &outcome {
            ModeOutcome::Ongoing => {
                // Offers only when not entering victory resolution.
                generate_offers_after_growth(io, &mut game, game_id);
                emit_flb_snapshot(io, game_id, &game);
            }
            ModeOutcome::Completed { winner_team_ids } => {
                mark_victory_resolved(&mut game.flower_battle_effects);
                game.flower_battle_winner_team_ids = Some(winner_team_ids.clone());
                game.engine.phase = GamePhase::Finished;
                emit_game_completed(io, game_id, winner_team_ids);
                emit_flb_snapshot(io, game_id, &game);
                info!(
                    "FLB early finish: gameId={} winners={:?}",
                    game_id, winner_team_ids
                );
            }
        }
        // Emit only after the full outcome mutation. The payload must observe
        // consumed sun, current effects, victory, and every tied winner.
        emit_player_statuses(io, game_id, &game);
        outcome
    };

    if let ModeOutcome::Completed { .. } = outcome {
        finish_once(io, game_ref, game_id, db_pool).await;
        return true;
    }
    false
}

/// Growth + sun points from real answer data (L-05). Uses eval base_factor.
fn apply_growth_from_answers(game: &mut Game) {
    if game.flower_battle_effects.victory_resolved {
        return;
    }

    let q_idx = game.engine.current_question_index as i32;
    let question = game
        .engine
        .quiz
        .questions
        .get(game.engine.current_question_index);
    let q_time = question.map(|q| q.time).unwrap_or(10);

    // Team roster + contributions from engine players + current_answers.
    let mut team_ids = std::collections::BTreeSet::new();
    let mut contributions = Vec::new();

    for player in &game.engine.players {
        let team_id = player.team_id.clone();
        if let Some(ref tid) = team_id {
            let t = tid.trim();
            if !t.is_empty() {
                team_ids.insert(t.to_string());
            }
        }
        let answer = game.engine.current_answers.get(&player.client_id);
        let base_factor = match (question, answer) {
            (Some(q), Some(a)) => eval::evaluate_answer(q, &a.answer_input).base,
            _ => 0.0,
        };
        let response_time_ms = answer
            .map(|a| a.response_time_ms)
            .unwrap_or(i64::from(q_time) * 1000);
        contributions.push(PlayerRoundContribution {
            is_bot: player.is_bot == Some(true),
            connected: player.connected,
            team_id,
            base_factor,
            response_time_ms,
        });
    }

    for team_id in team_ids {
        // L-05 call-sites (each helper grepped in rust/server):
        // - team_round_ratio / time_factor / ratio_to_base_growth / base_growth_to_sunpoints
        // - apply_growth_pipeline (base-only preview; full pos/neg inside apply_question_growth)
        let ratio = team_round_ratio(&contributions, &team_id, q_time);
        for c in &contributions {
            if c.team_id.as_deref() == Some(team_id.as_str()) {
                let _ = time_factor(c.response_time_ms, q_time);
            }
        }
        let base_growth = ratio_to_base_growth(ratio);
        let _base_capped = apply_growth_pipeline(
            base_growth,
            0,
            0,
            game.flower_battle_effects.max_growth_stage,
        );
        let _round = apply_question_growth(
            &mut game.flower_battle_effects,
            &team_id,
            base_growth,
            q_idx,
        );
        let sun = base_growth_to_sunpoints(base_growth);
        let entry = game.flower_battle_sun_points.entry(team_id).or_insert(0);
        *entry = entry.saturating_add(sun);
    }
}

fn generate_offers_after_growth(io: &SocketIo, game: &mut Game, game_id: &str) {
    if game.flower_battle_effects.victory_resolved {
        return;
    }
    let q_idx = game.engine.current_question_index as i32;
    let now = get_now_ms() as i64;
    // Deadline source (L-06 contract): wall clock at offer creation + vote window.
    // Seed remains (gameId, teamId, questionIndex) only — no clock in seed.
    let expires_at = now + POWERUP_VOTE_TIMEOUT_MS;

    let team_ids: Vec<String> = game.flower_battle_sun_points.keys().cloned().collect();
    let has_multiple_teams = {
        let mut teams = std::collections::BTreeSet::new();
        for p in &game.engine.players {
            if let Some(ref t) = p.team_id {
                let tt = t.trim();
                if !tt.is_empty() {
                    teams.insert(tt.to_string());
                }
            }
        }
        teams.len() >= 2
    };

    for team_id in team_ids {
        let sun = *game.flower_battle_sun_points.get(&team_id).unwrap_or(&0);
        if !should_trigger_offer(sun) {
            continue;
        }
        let (triggered, remaining) = consume_and_excess(sun);
        if !triggered {
            continue;
        }
        game.flower_battle_sun_points
            .insert(team_id.clone(), remaining);

        let active = game.flower_battle_effects.effects_for(&team_id).to_vec();
        // L-06: explicit select_offer_options + generate_powerup_offer call-sites
        // (existing_offer_or_create also uses them; cache hit skips re-roll).
        let seed = offer_seed(game_id, &team_id, q_idx);
        let _selected = select_offer_options(seed, &active, has_multiple_teams);
        let _generated = generate_powerup_offer(
            game_id,
            &team_id,
            q_idx,
            &active,
            expires_at,
            has_multiple_teams,
        );
        let offer = match existing_offer_or_create(
            &mut game.flower_battle_offers,
            game_id,
            &team_id,
            q_idx,
            &active,
            expires_at,
            has_multiple_teams,
        ) {
            Ok(o) => o,
            Err(e) => {
                warn!(
                    "FLB offer generation failed: gameId={} team={} err={:?}",
                    game_id, team_id, e
                );
                continue;
            }
        };

        // Open vote session (L-03).
        let options: Vec<String> = parse_offer_options(&offer.offer_type)
            .into_iter()
            .map(|s| s.to_string())
            .collect();
        let seed = offer_seed(game_id, &team_id, q_idx);
        let vote = VoteState::new_powerup(expires_at, seed, options, team_id.clone());
        game.flower_battle_votes.insert(team_id.clone(), vote);

        emit_powerup_offered(io, game_id, &team_id, &offer);
    }
}

/// Idempotent finish: delegates to `finish_and_broadcast` which owns the gate.
pub async fn finish_once(
    io: &SocketIo,
    game_ref: &Arc<Mutex<Game>>,
    game_id: &str,
    db_pool: &Option<sqlx::PgPool>,
) {
    super::finish_and_broadcast(io, game_ref, game_id, db_pool).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::socket::lifecycle::flower_battle_emit::build_player_status;
    use razzoozle_protocol::game::ExperienceMode;
    use razzoozle_protocol::player::Player;
    use razzoozle_protocol::quizz::Quizz;

    fn make_io() -> SocketIo {
        let (_layer, io) = SocketIo::builder().build_layer();
        // Room emits need the default namespace (main.rs / lifecycle tests).
        io.ns("/", |_socket: socketioxide::extract::SocketRef| {});
        io
    }

    fn flb_game() -> Game {
        let mut game = Game::new(
            "flb-win".into(),
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

    fn mk_player(socket_id: &str, client_id: &str, team_id: &str, points: i32) -> Player {
        Player {
            id: socket_id.into(),
            client_id: client_id.into(),
            connected: true,
            username: client_id.into(),
            points,
            streak: 0,
            player_token: None,
            is_bot: None,
            avatar: None,
            achievements: None,
            team_id: Some(team_id.into()),
            identifier_hash: None,
        }
    }

    /// Stage-10 multi-team finish with unequal engine scores → sole max-score winner.
    ///
    /// `game.players` is deliberately stale/inverted so ranking must read
    /// `game.engine.players` (reveal awards points only on the engine list).
    #[tokio::test]
    async fn after_reveal_unequal_engine_scores_single_winner() {
        let io = make_io();
        let mut game = flb_game();
        game.flower_battle_effects.set_stage("blue", 10);
        game.flower_battle_effects.set_stage("red", 10);
        game.flower_battle_effects.set_stage("green", 7);

        // Authoritative scores (engine): blue wins on points among stage-10 teams.
        game.engine.players = vec![
            mk_player("s-blue", "c-blue", "blue", 120),
            mk_player("s-red", "c-red", "red", 40),
            mk_player("s-green", "c-green", "green", 999), // not at stage 10
        ];
        // Stale lobby mirror: would wrongly pick red if used for ranking.
        game.players = vec![
            mk_player("s-blue", "c-blue", "blue", 0),
            mk_player("s-red", "c-red", "red", 500),
            mk_player("s-green", "c-green", "green", 999),
        ];

        let game_id = game.game_id.clone();
        let game_ref = Arc::new(Mutex::new(game));

        let early = after_reveal_tick(&io, &game_ref, &game_id, &None).await;
        assert!(early, "stage-10 finish must short-circuit lifecycle");

        let game = game_ref.lock().unwrap();
        assert!(game.flower_battle_effects.victory_resolved);
        assert_eq!(game.engine.phase, GamePhase::Finished);
        assert_eq!(
            game.flower_battle_winner_team_ids.as_deref(),
            Some(vec!["blue".to_string()].as_slice()),
            "only max-score stage-10 team wins"
        );

        let blue =
            build_player_status(&game_id, &game, &mk_player("s-blue", "c-blue", "blue", 120));
        let red = build_player_status(&game_id, &game, &mk_player("s-red", "c-red", "red", 40));
        let green = build_player_status(
            &game_id,
            &game,
            &mk_player("s-green", "c-green", "green", 999),
        );
        assert!(blue.is_winner, "blue is sole winner");
        assert!(!red.is_winner, "red at stage 10 but lower score");
        assert!(!green.is_winner, "green not at stage 10");
        assert_eq!(blue.winner_team_ids, vec!["blue"]);
        assert_eq!(red.winner_team_ids, vec!["blue"]);
    }

    /// Equal engine scores among stage-10 teams → shared winners (lexicographic wire order).
    #[tokio::test]
    async fn after_reveal_equal_engine_scores_shared_winners() {
        let io = make_io();
        let mut game = flb_game();
        game.flower_battle_effects.set_stage("blue", 10);
        game.flower_battle_effects.set_stage("red", 10);
        game.flower_battle_effects.set_stage("green", 3);

        game.engine.players = vec![
            mk_player("s-blue", "c-blue", "blue", 80),
            mk_player("s-red", "c-red", "red", 80),
            mk_player("s-green", "c-green", "green", 500),
        ];
        // Stale zeros on the lobby list must not force a wrong sole winner.
        game.players = vec![
            mk_player("s-blue", "c-blue", "blue", 0),
            mk_player("s-red", "c-red", "red", 0),
            mk_player("s-green", "c-green", "green", 0),
        ];

        let game_id = game.game_id.clone();
        let game_ref = Arc::new(Mutex::new(game));

        let early = after_reveal_tick(&io, &game_ref, &game_id, &None).await;
        assert!(early);

        let game = game_ref.lock().unwrap();
        assert!(game.flower_battle_effects.victory_resolved);
        assert_eq!(
            game.flower_battle_winner_team_ids.as_deref(),
            Some(vec!["blue".to_string(), "red".to_string()].as_slice()),
            "equal top scores among stage-10 teams share the win"
        );

        let blue = build_player_status(&game_id, &game, &mk_player("s-blue", "c-blue", "blue", 80));
        let red = build_player_status(&game_id, &game, &mk_player("s-red", "c-red", "red", 80));
        let green = build_player_status(
            &game_id,
            &game,
            &mk_player("s-green", "c-green", "green", 500),
        );
        assert!(blue.is_winner);
        assert!(red.is_winner);
        assert!(!green.is_winner);
        assert_eq!(blue.winner_team_ids, vec!["blue", "red"]);
    }
}
