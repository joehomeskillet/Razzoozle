//! WP #932 / WP-FLB-07 — eight hard-literal effect cases.

use super::*;
use crate::flower_battle::scoring::DEFAULT_MAX_GROWTH_STAGE;
use razzoozle_protocol::experience::FlowerBattleEffect;

fn state() -> EffectsState {
    EffectsState::with_max_growth_stage(DEFAULT_MAX_GROWTH_STAGE)
}

// --- 1. Stacking-Reject: second acid_rain on same target fails ---

#[test]
fn stacking_reject_second_acid_rain() {
    let mut s = state();
    apply_effects(
        &mut s,
        "attackers",
        OfferedEffect::AcidRain {
            target_team_id: "victims".into(),
        },
        "offer-acid-1",
    )
    .expect("first acid ok");
    assert!(s.has_negative("victims"));
    let err = apply_effects(
        &mut s,
        "other",
        OfferedEffect::AcidRain {
            target_team_id: "victims".into(),
        },
        "offer-acid-2",
    )
    .expect_err("second acid rejected");
    assert_eq!(err, EffectError::NegativeAlreadyActive);
    assert_eq!(
        s.effects_for("victims")
            .iter()
            .filter(|e| e.is_acid_rain())
            .count(),
        1
    );
}

// --- 2. Shield-Block+Consume: acid growth tick + shield → both gone, no penalty ---

#[test]
fn shield_block_and_consume_on_growth() {
    let mut s = state();
    apply_effects(&mut s, "t", OfferedEffect::UmbrellaShield, "o-shield").unwrap();
    // Force-place acid without mutual-cancel-on-apply path: temporarily strip
    // shield, apply acid, re-add shield so both coexist for the growth tick.
    s.remove_matching("t", |e| e.is_umbrella_shield());
    apply_effects(
        &mut s,
        "atk",
        OfferedEffect::AcidRain {
            target_team_id: "t".into(),
        },
        "o-acid",
    )
    .unwrap();
    s.push_effect("t", FlowerBattleEffect::umbrella_shield(2));

    let before = s.stage_of("t");
    let round = apply_question_growth(&mut s, "t", 2, 1);
    // base 2, pos 0, neg blocked → pipeline(2,0,0) = 2
    assert_eq!(round, 2);
    assert_eq!(s.stage_of("t"), before + 2);
    assert!(!s.has_negative("t"));
    assert!(!s.has_umbrella("t"));
}

// --- 3. Shield-Expire-After-2 answered-question ticks ---

#[test]
fn shield_expire_after_two_questions() {
    let mut s = state();
    apply_effects(&mut s, "t", OfferedEffect::UmbrellaShield, "o1").unwrap();
    assert_eq!(
        s.effects_for("t").iter().find_map(|e| match e {
            FlowerBattleEffect::UmbrellaShield {
                remaining_questions,
            } => Some(*remaining_questions),
            _ => None,
        }),
        Some(2)
    );
    // Two answered questions with base 0 (no acid interaction).
    apply_question_growth(&mut s, "t", 0, 1);
    assert_eq!(
        s.effects_for("t").iter().find_map(|e| match e {
            FlowerBattleEffect::UmbrellaShield {
                remaining_questions,
            } => Some(*remaining_questions),
            _ => None,
        }),
        Some(1)
    );
    apply_question_growth(&mut s, "t", 0, 2);
    assert!(
        !s.has_umbrella("t"),
        "umbrella must expire after 2 question ticks"
    );
}

// --- 4. Sunbeam-At-0: base 0 keeps status; base ≥1 consumes and +1 ---

#[test]
fn sunbeam_stays_active_at_base_zero() {
    let mut s = state();
    apply_effects(&mut s, "t", OfferedEffect::Sunbeam, "o-sun").unwrap();
    let r0 = apply_question_growth(&mut s, "t", 0, 1);
    assert_eq!(r0, 0);
    assert!(
        s.effects_for("t").iter().any(|e| e.is_sunbeam()),
        "sunbeam must remain when base growth is 0"
    );
    let r1 = apply_question_growth(&mut s, "t", 1, 2);
    // base 1 + sunbeam +1 = 2
    assert_eq!(r1, 2);
    assert!(
        !s.effects_for("t").iter().any(|e| e.is_sunbeam()),
        "sunbeam consumed after first ≥1 base growth"
    );
}

// --- 5. Fertilizer +2 (instant, no status) ---

#[test]
fn fertilizer_plus_two_no_status() {
    let mut s = state();
    let applied = apply_effects(&mut s, "t", OfferedEffect::Fertilizer, "o-fert").unwrap();
    assert_eq!(applied, AppliedEffect::Fertilizer { growth_stage: 2 });
    assert_eq!(s.stage_of("t"), 2);
    assert!(s.effects_for("t").is_empty(), "fertilizer is not a status");
    // Clamp at max
    s.set_stage("t", s.max_growth_stage);
    apply_effects(&mut s, "t", OfferedEffect::Fertilizer, "o-fert-2").unwrap();
    assert_eq!(s.stage_of("t"), s.max_growth_stage);
}

// --- 6. Acid-On-Shield: both statuses coexist; growth consumes both, no penalty ---

#[test]
fn acid_on_shield_mutual_cancel_on_growth() {
    let mut s = state();
    apply_effects(&mut s, "t", OfferedEffect::UmbrellaShield, "o-sh").unwrap();
    apply_effects(
        &mut s,
        "atk",
        OfferedEffect::AcidRain {
            target_team_id: "t".into(),
        },
        "o-ar",
    )
    .unwrap();
    assert!(s.has_umbrella("t"));
    assert!(s.has_negative("t"));
    let round = apply_question_growth(&mut s, "t", 2, 1);
    // base 2, acid blocked by shield → pipeline(2,0,0)=2; both statuses gone
    assert_eq!(round, 2);
    assert!(s.effects_for("t").is_empty());
}

// --- 7. Idempotency via offer_id ---

#[test]
fn idempotency_same_offer_id() {
    let mut s = state();
    let a1 = apply_effects(&mut s, "t", OfferedEffect::Fertilizer, "same-id").unwrap();
    let stage_after = s.stage_of("t");
    let a2 = apply_effects(&mut s, "t", OfferedEffect::Fertilizer, "same-id").unwrap();
    assert_eq!(a1, a2);
    assert_eq!(
        s.stage_of("t"),
        stage_after,
        "second apply with same offer_id must not re-apply"
    );
}

// --- 8. No points: EffectsState has no score field; growth never invents points ---

#[test]
fn no_points_mutation_surface() {
    let mut s = state();
    // Apply every MVP power-up path; assert only growth/status bookkeeping moves.
    apply_effects(&mut s, "a", OfferedEffect::Fertilizer, "p1").unwrap();
    apply_effects(&mut s, "a", OfferedEffect::Sunbeam, "p2").unwrap();
    apply_effects(&mut s, "b", OfferedEffect::UmbrellaShield, "p3").unwrap();
    apply_effects(
        &mut s,
        "a",
        OfferedEffect::AcidRain {
            target_team_id: "b".into(),
        },
        "p4",
    )
    .unwrap();
    apply_question_growth(&mut s, "a", 2, 1);

    // EffectsState only tracks growth_stage / active / applied_offers — no points map.
    assert_eq!(s.applied_offers.len(), 4);
    assert!(s.stage_of("a") <= s.max_growth_stage);
    // Explicit: victory guard does not invent points either.
    mark_victory_resolved(&mut s);
    assert_eq!(
        apply_effects(&mut s, "a", OfferedEffect::Fertilizer, "p6"),
        Err(EffectError::VictoryResolved)
    );
    assert_eq!(apply_question_growth(&mut s, "a", 3, 9), 0);
}
