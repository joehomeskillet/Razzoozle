//! FlowerBattle early-finish win check (WP #933 / WP-FLB-08).
//!
//! Pure: reads growth stages + optional team scores; emits generic
//! [`crate::state::ModeOutcome`] (no flower-named lifecycle API).
//!
//! Victory when any team reaches [`VICTORY_GROWTH_STAGE`] (10). Ties among
//! teams that hit the stage use existing score ranking — higher team score
//! wins; equal scores keep all tied teams in `winner_team_ids` (no new
//! coin-flip tie-break).

use std::collections::HashMap;

use super::effects::EffectsState;
use crate::state::ModeOutcome;

/// Cumulative plant growth stage that ends the battle immediately.
pub const VICTORY_GROWTH_STAGE: u8 = 10;

/// Plant ceiling (`EffectsState.max_growth_stage`) — same as victory threshold.
pub const PLANT_MAX_GROWTH_STAGE: u8 = VICTORY_GROWTH_STAGE;

/// Inspect growth stages after power-up apply + growth pipeline.
///
/// - No team at [`VICTORY_GROWTH_STAGE`] → [`ModeOutcome::Ongoing`].
/// - One or more at the stage → [`ModeOutcome::Completed`].
/// - Multiple at the stage: keep only those with the highest
///   `team_scores` entry (missing score treated as 0). Equal top scores
///   → multiple `winner_team_ids` (shared win).
pub fn check_mode_outcome(
    effects: &EffectsState,
    team_scores: &HashMap<String, i32>,
) -> ModeOutcome {
    if effects.victory_resolved {
        // Idempotent: already finished — re-emit winners from current stages.
        return completed_from_stages(effects, team_scores);
    }

    let at_victory: Vec<String> = effects
        .growth_stage
        .iter()
        .filter(|(_, &stage)| stage >= VICTORY_GROWTH_STAGE)
        .map(|(tid, _)| tid.clone())
        .collect();

    if at_victory.is_empty() {
        return ModeOutcome::Ongoing;
    }

    ModeOutcome::Completed {
        winner_team_ids: rank_winners(&at_victory, team_scores),
    }
}

fn completed_from_stages(
    effects: &EffectsState,
    team_scores: &HashMap<String, i32>,
) -> ModeOutcome {
    let at_victory: Vec<String> = effects
        .growth_stage
        .iter()
        .filter(|(_, &stage)| stage >= VICTORY_GROWTH_STAGE)
        .map(|(tid, _)| tid.clone())
        .collect();
    ModeOutcome::Completed {
        winner_team_ids: rank_winners(&at_victory, team_scores),
    }
}

/// Among `candidates`, keep those with the max team score (0 if missing).
/// Sorted lexicographically for stable wire output.
fn rank_winners(candidates: &[String], team_scores: &HashMap<String, i32>) -> Vec<String> {
    if candidates.is_empty() {
        return Vec::new();
    }
    let max_score = candidates
        .iter()
        .map(|tid| team_scores.get(tid).copied().unwrap_or(0))
        .max()
        .unwrap_or(0);
    let mut winners: Vec<String> = candidates
        .iter()
        .filter(|tid| team_scores.get(*tid).copied().unwrap_or(0) == max_score)
        .cloned()
        .collect();
    winners.sort();
    winners
}

#[cfg(test)]
#[path = "win_check_tests.rs"]
mod win_check_tests;
