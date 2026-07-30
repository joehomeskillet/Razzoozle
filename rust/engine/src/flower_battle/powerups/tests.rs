use super::*;
use crate::flower_battle::scoring::base_growth_to_sunpoints;

// --- 1. base_growth_to_sunpoints (via scoring; all 4 inputs) ---

#[test]
fn base_growth_to_sunpoints_all_four() {
    assert_eq!(base_growth_to_sunpoints(0), 0);
    assert_eq!(base_growth_to_sunpoints(1), 1);
    assert_eq!(base_growth_to_sunpoints(2), 1);
    assert_eq!(base_growth_to_sunpoints(3), 2);
}

// --- 2. consume_and_excess / should_trigger_offer ---

#[test]
fn consume_and_excess_literals() {
    assert_eq!(consume_and_excess(5), (true, 2));
    assert_eq!(consume_and_excess(2), (false, 2));
    assert_eq!(consume_and_excess(3), (true, 0));
    assert_eq!(consume_and_excess(6), (true, 3));
}

#[test]
fn should_trigger_offer_threshold() {
    assert!(!should_trigger_offer(0));
    assert!(!should_trigger_offer(2));
    assert!(should_trigger_offer(3));
    assert!(should_trigger_offer(5));
}

// --- 3. Seed determinism ---

#[test]
fn offer_seed_stable_for_same_inputs() {
    let a = offer_seed("g1", "t-red", 2);
    let b = offer_seed("g1", "t-red", 2);
    assert_eq!(a, b);
    let c = offer_seed("g1", "t-blue", 2);
    assert_ne!(a, c);
    let d = offer_seed("g1", "t-red", 3);
    assert_ne!(a, d);
}

#[test]
fn generate_offer_deterministic_id_and_type() {
    let e: &[FlowerBattleEffect] = &[];
    let o1 = generate_powerup_offer("game-a", "team-1", 0, e, 1_700_000_000_000, true).expect("ok");
    let o2 = generate_powerup_offer("game-a", "team-1", 0, e, 1_700_000_000_000, true).expect("ok");
    assert_eq!(o1.id, o2.id);
    assert_eq!(o1.offer_type, o2.offer_type);
    assert_eq!(o1.expires_at, o2.expires_at);
    assert!(o1.id.starts_with("offer_"));
    // Same seed → same id even if caller passes a different expires_at
    // (id is seed-only; registry preserves first expires_at on reconnect).
    let o3 = generate_powerup_offer("game-a", "team-1", 0, e, 99, true).expect("ok");
    assert_eq!(o1.id, o3.id);
    assert_eq!(o1.offer_type, o3.offer_type);
}

// --- 4. Exclusion: Sunbeam active → no umbrella_shield ---

#[test]
fn sunbeam_excludes_umbrella_shield() {
    let effects = [FlowerBattleEffect::sunbeam(0)];
    for q in 0..32 {
        let offer = generate_powerup_offer("g", "t", q, &effects, 1, true).expect("ok");
        let opts = parse_offer_options(&offer.offer_type);
        assert!(
            !opts.contains(&OPTION_UMBRELLA_SHIELD),
            "q={q}: unexpected umbrella in {:?}",
            opts
        );
    }
}

#[test]
fn umbrella_excludes_sunbeam() {
    let effects = [FlowerBattleEffect::umbrella_shield(2)];
    for q in 0..32 {
        let offer = generate_powerup_offer("g", "t", q, &effects, 1, true).expect("ok");
        let opts = parse_offer_options(&offer.offer_type);
        assert!(
            !opts.contains(&OPTION_SUNBEAM),
            "q={q}: unexpected sunbeam in {:?}",
            opts
        );
    }
}

// --- 5. 3-option rule: ≥1 positive, ≤1 negative, length 3 ---

#[test]
fn three_option_rule_positive_and_negative_bounds() {
    let e: &[FlowerBattleEffect] = &[];
    for q in 0..48 {
        let offer = generate_powerup_offer("game-x", "team-y", q, e, 1, true).expect("ok");
        let opts = parse_offer_options(&offer.offer_type);
        assert_eq!(opts.len(), 3, "q={q}");
        // Distinct under normal pool (fallback is the only triple-dup path).
        if opts != FALLBACK_OPTIONS {
            let mut uniq = opts.clone();
            uniq.sort_unstable();
            uniq.dedup();
            assert_eq!(uniq.len(), 3, "q={q} dups in {:?}", opts);
        }
        let pos = opts.iter().filter(|id| is_positive(id)).count();
        let neg = opts.iter().filter(|id| is_negative(id)).count();
        assert!(pos >= 1, "q={q} need ≥1 positive: {:?}", opts);
        assert!(neg <= 1, "q={q} need ≤1 negative: {:?}", opts);
    }
}

// --- 6. acid_rain without target team ---

#[test]
fn acid_rain_excluded_without_target_team() {
    let e: &[FlowerBattleEffect] = &[];
    for q in 0..32 {
        let offer = generate_powerup_offer("g", "t", q, e, 1, false).expect("ok");
        let opts = parse_offer_options(&offer.offer_type);
        assert!(
            !opts.contains(&OPTION_ACID_RAIN),
            "q={q}: acid_rain without target: {:?}",
            opts
        );
    }
}

// --- 7. All options excluded → fertilizer fallback (no panic) ---

#[test]
fn all_options_excluded_uses_fertilizer_fallback() {
    // Sunbeam + Umbrella exclude each other; no target excludes acid_rain.
    // fertilizer remains available → still a valid set of size 1 only.
    // Force empty available by filtering: we cannot exclude fertilizer via
    // effects. Strict "all excluded" path is exercised via select with an
    // empty available simulation: call select when effects + no target leave
    // only fertilizer → valid_option_sets empty → FALLBACK triple.
    let effects = [
        FlowerBattleEffect::sunbeam(0),
        FlowerBattleEffect::umbrella_shield(2),
    ];
    let seed = offer_seed("solo", "only", 0);
    let opts = select_offer_options(seed, &effects, false);
    // Available: fertilizer only → cannot form 3 distinct → fallback.
    assert_eq!(opts, FALLBACK_OPTIONS);

    let offer = generate_powerup_offer("solo", "only", 0, &effects, 42, false).expect("ok");
    assert_eq!(
        parse_offer_options(&offer.offer_type),
        vec![OPTION_FERTILIZER, OPTION_FERTILIZER, OPTION_FERTILIZER]
    );
    assert_eq!(offer.expires_at, 42);
}

// --- Registry: reconnect does not re-roll ---

#[test]
fn registry_reconnect_returns_same_offer() {
    let mut cache = HashMap::new();
    let e: &[FlowerBattleEffect] = &[];
    let first = existing_offer_or_create(&mut cache, "g", "t", 7, e, 1_111, true).expect("ok");
    // Different expires_at argument must NOT rewrite the cached offer.
    let second = existing_offer_or_create(&mut cache, "g", "t", 7, e, 9_999, true).expect("ok");
    assert_eq!(first, second);
    assert_eq!(second.expires_at, 1_111);
    assert_eq!(cache.len(), 1);
}

#[test]
fn registry_different_question_is_new_offer() {
    let mut cache = HashMap::new();
    let e: &[FlowerBattleEffect] = &[];
    let a = existing_offer_or_create(&mut cache, "g", "t", 0, e, 1, true).expect("ok");
    let b = existing_offer_or_create(&mut cache, "g", "t", 1, e, 1, true).expect("ok");
    assert_ne!(a.id, b.id);
    assert_eq!(cache.len(), 2);
}

#[test]
fn offer_type_encodes_three_csv_options() {
    let e: &[FlowerBattleEffect] = &[];
    let o = generate_powerup_offer("g", "t", 1, e, 0, true).expect("ok");
    let parts: Vec<_> = o.offer_type.split(',').collect();
    assert_eq!(parts.len(), 3);
}
