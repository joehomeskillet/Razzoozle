use super::*;
use crate::flower_battle::EffectsState;
use crate::state::ModeOutcome;
use std::collections::HashMap;

fn effects_with(stages: &[(&str, u8)]) -> EffectsState {
    let mut s = EffectsState::with_max_growth_stage(VICTORY_GROWTH_STAGE);
    for (tid, stage) in stages {
        s.set_stage(tid, *stage);
    }
    s
}

#[test]
fn ongoing_when_no_team_at_victory() {
    let fx = effects_with(&[("red", 9), ("blue", 5)]);
    let scores = HashMap::new();
    assert_eq!(check_mode_outcome(&fx, &scores), ModeOutcome::Ongoing);
}

#[test]
fn completed_single_winner_at_stage_10() {
    let fx = effects_with(&[("red", 10), ("blue", 7)]);
    let scores = HashMap::from([("red".into(), 100), ("blue".into(), 200)]);
    match check_mode_outcome(&fx, &scores) {
        ModeOutcome::Completed { winner_team_ids } => {
            assert_eq!(winner_team_ids, vec!["red".to_string()]);
        }
        other => panic!("expected Completed, got {other:?}"),
    }
}

#[test]
fn tie_at_stage_10_broken_by_score() {
    let fx = effects_with(&[("red", 10), ("blue", 10)]);
    let scores = HashMap::from([("red".into(), 50), ("blue".into(), 80)]);
    match check_mode_outcome(&fx, &scores) {
        ModeOutcome::Completed { winner_team_ids } => {
            assert_eq!(winner_team_ids, vec!["blue".to_string()]);
        }
        other => panic!("expected Completed, got {other:?}"),
    }
}

#[test]
fn equal_score_tie_keeps_both_winners_sorted() {
    let fx = effects_with(&[("red", 10), ("blue", 10), ("green", 3)]);
    let scores = HashMap::from([
        ("red".into(), 40),
        ("blue".into(), 40),
        ("green".into(), 999),
    ]);
    match check_mode_outcome(&fx, &scores) {
        ModeOutcome::Completed { winner_team_ids } => {
            assert_eq!(winner_team_ids, vec!["blue".to_string(), "red".to_string()]);
        }
        other => panic!("expected Completed, got {other:?}"),
    }
}

#[test]
fn missing_score_treated_as_zero() {
    let fx = effects_with(&[("red", 10), ("blue", 10)]);
    let scores = HashMap::from([("red".into(), 1)]);
    match check_mode_outcome(&fx, &scores) {
        ModeOutcome::Completed { winner_team_ids } => {
            assert_eq!(winner_team_ids, vec!["red".to_string()]);
        }
        other => panic!("expected Completed, got {other:?}"),
    }
}

#[test]
fn stage_above_10_also_wins_when_uncapped_input() {
    // set_stage clamps to max; with max=10 stage stays 10. Simulate raw map.
    let mut fx = EffectsState::with_max_growth_stage(15);
    fx.growth_stage.insert("red".into(), 12);
    match check_mode_outcome(&fx, &HashMap::new()) {
        ModeOutcome::Completed { winner_team_ids } => {
            assert_eq!(winner_team_ids, vec!["red".to_string()]);
        }
        other => panic!("expected Completed, got {other:?}"),
    }
}
