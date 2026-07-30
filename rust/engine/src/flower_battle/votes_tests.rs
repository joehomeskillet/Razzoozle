//! Hard (non-mirrored) tests for FlowerBattle power-up voting (WP #931).

use super::*;
use crate::flower_battle::powerups::{OPTION_ACID_RAIN, OPTION_FERTILIZER, OPTION_SUNBEAM};
use std::collections::HashMap;

fn opts_abc() -> Vec<String> {
    vec![
        OPTION_FERTILIZER.to_string(),
        OPTION_SUNBEAM.to_string(),
        OPTION_ACID_RAIN.to_string(),
    ]
}

// --- 1. Majority order-independence: 3 workers vote A,B,C in different orders → always B ---

#[test]
fn majority_order_independent_always_b() {
    // Options: 0=A fertilizer, 1=B sunbeam, 2=C acid_rain. Majority for B (index 1).
    let seed = 0xDEAD_BEEF_u64;
    let sequences: [&[&str]; 3] = [
        &["w1", "w2", "w3"],
        &["w3", "w1", "w2"],
        &["w2", "w3", "w1"],
    ];
    // Votes: w1→A(0), w2→B(1), w3→B(1) → B majority.
    let choice_for = |id: &str| match id {
        "w1" => VoteChoice::PowerupOption(0),
        "w2" | "w3" => VoteChoice::PowerupOption(1),
        _ => unreachable!(),
    };

    let mut winners = Vec::new();
    for order in sequences {
        let mut state = VoteState::new_powerup(10_000, seed, opts_abc(), "rot");
        for pid in order {
            state.vote(*pid, choice_for(pid), 0).expect("vote ok");
        }
        match state.evaluate_at(10_000) {
            VotingResult::PowerupSelected {
                option_index,
                option_id,
            } => {
                assert_eq!(option_index, 1, "majority B");
                assert_eq!(option_id, OPTION_SUNBEAM);
                winners.push(option_index);
            }
            other => panic!("expected PowerupSelected, got {other:?}"),
        }
    }
    assert_eq!(winners, vec![1, 1, 1]);
}

// --- 2. Tie-break determinism: two identical runs → byte-identical winner ---

#[test]
fn tie_break_determinism_byte_identical() {
    let seed = 42_u64;
    let run = || {
        let mut state = VoteState::new_powerup(5_000, seed, opts_abc(), "blau");
        // 1 vote each for index 0 and 1 → tie; seed decides.
        state
            .vote("p1", VoteChoice::PowerupOption(0), 0)
            .expect("ok");
        state
            .vote("p2", VoteChoice::PowerupOption(1), 0)
            .expect("ok");
        match state.evaluate_at(5_000) {
            VotingResult::PowerupSelected {
                option_index,
                option_id,
            } => (option_index, option_id),
            other => panic!("unexpected {other:?}"),
        }
    };
    let a = run();
    let b = run();
    assert_eq!(a, b, "two identical runs must be byte-identical");
    // Also via determine_winner directly
    let mut votes_a = HashMap::new();
    votes_a.insert("p1".into(), 0usize);
    votes_a.insert("p2".into(), 1usize);
    let votes_b = votes_a.clone();
    let opts = [0usize, 1, 2];
    let w1 = determine_winner(&opts, &votes_a, seed, &[0, 1]).unwrap();
    let w2 = determine_winner(&opts, &votes_b, seed, &[0, 1]).unwrap();
    assert_eq!(w1, w2);
    assert_eq!(w1, a.0);
}

// --- 3. Zero-votes default: no votes → positive default (never Skip/None/acid_rain) ---

#[test]
fn zero_votes_picks_positive_default_never_acid_rain() {
    for seed in [0_u64, 1, 7, 99, 0xABCD] {
        let mut state = VoteState::new_powerup(1_000, seed, opts_abc(), "gruen");
        match state.evaluate_at(1_000) {
            VotingResult::PowerupSelected {
                option_index,
                option_id,
            } => {
                assert!(
                    is_positive_option(&option_id),
                    "seed={seed}: got non-positive {option_id}"
                );
                assert_ne!(option_id, OPTION_ACID_RAIN);
                assert!(option_index == 0 || option_index == 1);
            }
            other => panic!("seed={seed}: expected positive default, got {other:?}"),
        }
    }
}

// --- 4. Self-target block ---

#[test]
fn self_target_block_rejects() {
    let mut prev = HashMap::new();
    prev.insert("rot".into(), None);
    prev.insert("blau".into(), None);
    let mut state = VoteState::new_target(9_000, 1, vec!["rot".into(), "blau".into()], "rot", prev);
    let err = state
        .vote("p1", VoteChoice::TargetTeam("rot".into()), 0)
        .expect_err("self target");
    assert_eq!(err, VoteError::SelfTarget);
    assert!(state.votes.is_empty());

    // Standalone validator (handler path)
    assert_eq!(
        validate_target_choice("rot", "rot", None),
        Err(VoteError::SelfTarget)
    );
}

// --- 5. Not twice in a row (previous_attacker_team_id) ---

#[test]
fn repeat_target_blocked_via_previous_attacker() {
    // Team A (rot) already attacked B (blau) → blau.previous_attacker = rot.
    let mut prev = HashMap::new();
    prev.insert("blau".into(), Some("rot".into()));
    prev.insert("gelb".into(), None);
    let mut state =
        VoteState::new_target(9_000, 1, vec!["blau".into(), "gelb".into()], "rot", prev);
    let err = state
        .vote("p1", VoteChoice::TargetTeam("blau".into()), 0)
        .expect_err("repeat target");
    assert_eq!(err, VoteError::RepeatTarget);

    // Alternative target still allowed.
    state
        .vote("p1", VoteChoice::TargetTeam("gelb".into()), 0)
        .expect("other target ok");
}

// --- 6. acid_rain without target: 0 target votes → event/skip, not applied ---

#[test]
fn acid_rain_without_target_not_applied() {
    // Power-up phase: force acid_rain majority.
    let options = vec![
        OPTION_FERTILIZER.to_string(),
        OPTION_ACID_RAIN.to_string(),
        OPTION_SUNBEAM.to_string(),
    ];
    let mut pu = VoteState::new_powerup(1_000, 3, options, "rot");
    pu.vote("a", VoteChoice::PowerupOption(1), 0).unwrap();
    pu.vote("b", VoteChoice::PowerupOption(1), 0).unwrap();
    let selected = pu.evaluate_at(1_000);
    match &selected {
        VotingResult::PowerupSelected { option_id, .. } => {
            assert_eq!(option_id, OPTION_ACID_RAIN);
            assert!(powerup_requires_target(option_id));
        }
        other => panic!("{other:?}"),
    }

    // Target phase: zero votes → AcidRainSkippedNoTarget; can_apply is false.
    let mut prev = HashMap::new();
    prev.insert("blau".into(), None);
    let mut tgt = VoteState::new_target(2_000, 3, vec!["blau".into()], "rot", prev);
    match tgt.evaluate_at(2_000) {
        VotingResult::AcidRainSkippedNoTarget => {
            assert!(!can_apply_acid_rain(None));
        }
        other => panic!("expected skip, got {other:?}"),
    }
}

// --- 7. Late vote ignored ---

#[test]
fn late_vote_ignored() {
    let mut state = VoteState::new_powerup(1_000, 5, opts_abc(), "rot");
    state
        .vote("early", VoteChoice::PowerupOption(0), 500)
        .expect("before deadline");
    let err = state
        .vote("late", VoteChoice::PowerupOption(1), 1_001)
        .expect_err("after deadline");
    assert_eq!(err, VoteError::Late);
    assert_eq!(state.votes.len(), 1);
    assert!(state.votes.contains_key("early"));
    assert!(!state.votes.contains_key("late"));
}

// --- 8. Upsert idempotency: A votes X then Y → Y active, no duplicate ---

#[test]
fn upsert_idempotency() {
    let mut state = VoteState::new_powerup(10_000, 8, opts_abc(), "rot");
    state
        .vote("A", VoteChoice::PowerupOption(0), 0)
        .expect("first");
    state
        .vote("A", VoteChoice::PowerupOption(1), 1)
        .expect("upsert");
    assert_eq!(state.votes.len(), 1);
    assert_eq!(state.votes.get("A"), Some(&VoteChoice::PowerupOption(1)));
}

// --- Extras: timeouts constants + eligible voter + record_attack ---

#[test]
fn timeout_constants() {
    assert_eq!(POWERUP_VOTE_TIMEOUT_MS, 8_000);
    assert_eq!(TARGET_VOTE_TIMEOUT_MS, 5_000);
}

#[test]
fn eligible_voter_e05() {
    assert!(is_eligible_voter(false, true));
    assert!(!is_eligible_voter(true, true));
    assert!(!is_eligible_voter(false, false));
    assert!(!is_eligible_voter(true, false));
}

#[test]
fn evaluate_pending_before_deadline() {
    let mut state = VoteState::new_powerup(5_000, 1, opts_abc(), "rot");
    assert_eq!(state.evaluate_at(4_999), VotingResult::Pending);
}

#[test]
fn record_attack_sets_previous_attacker() {
    let mut map = HashMap::new();
    record_attack(&mut map, "blau", "rot");
    assert_eq!(map.get("blau").and_then(|v| v.as_deref()), Some("rot"));
    // Next attack from rot → blau rejected.
    assert_eq!(
        validate_target_choice("rot", "blau", map.get("blau").and_then(|v| v.as_deref())),
        Err(VoteError::RepeatTarget)
    );
}

#[test]
fn determine_winner_reuses_resolve_majority_clear() {
    let mut votes = HashMap::new();
    votes.insert("a".into(), "x".to_string());
    votes.insert("b".into(), "x".to_string());
    votes.insert("c".into(), "y".to_string());
    let options = vec!["x".to_string(), "y".to_string(), "z".to_string()];
    let w = determine_winner(&options, &votes, 99, &options).unwrap();
    assert_eq!(w, "x");
}
