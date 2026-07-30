//! Normalized team performance → base growth tiers (WP #929 / WP-FLB-04).
//!
//! # Chosen formula (E-04rev)
//!
//! ```text
//! perPlayerSignal = base_factor × timeFactor
//! timeFactor      = 0.5 + 0.5 × (remaining_answer_time / total_answer_time)
//!                   clamped to [0.5, 1.0]
//! teamRoundRatio  = Σ perPlayerSignal (eligible) / eligiblePlayerCount
//! ```
//!
//! - `base_factor` comes from `eval::evaluate_answer(...).base` (0..1),
//!   **not** from `RoundResult.points` (those already include streak / first-correct /
//!   achievement bonuses after the reveal fold in `state/mod.rs`).
//! - Time fields mirror `calculate_points()` (`state/mod.rs` reveal path):
//!   `response_time_ms` and `question.time` (seconds as `total_answer_time_s`).
//! - Explicitly **without** streak, first-correct, or bonus-question ×2 multipliers.
//!
//! # Rejected alternative: `(points - bonus_points)`
//!
//! Using post-reveal points (even after subtracting achievement `bonus_points`) is
//! a structural footgun:
//! 1. `RoundResult.points` is always post-achievement after the reveal fold
//!    (`state/mod.rs` mutates `points += bonus`).
//! 2. Streak is per-player and `FIRST_CORRECT_BONUS` goes to exactly one player, so
//!    any static max (e.g. 1000×1.5×2+100) overestimates and drives team ratios
//!    systematically low.
//! 3. Bonus-question ×2 and streak multipliers would leak quiz cosmetics into
//!    plant growth — E-04rev keeps growth driven only by accuracy × speed.
//!
//! # Wiring
//!
//! Pure transformation only. No `reveal()` / lifecycle / snapshot side effects
//! (WP #930+ consume these helpers).

/// Inclusive lower bound for +1 base growth (SDD §8).
pub const GROWTH_RATIO_TIER_1: f64 = 0.45;
/// Inclusive lower bound for +2 base growth (SDD §8).
pub const GROWTH_RATIO_TIER_2: f64 = 0.70;
/// Inclusive lower bound for +3 base growth (SDD §8).
pub const GROWTH_RATIO_TIER_3: f64 = 0.90;

/// Named const-array defaults for ratio→growth (checked high→low).
/// Each entry is `(min_ratio_inclusive, growth_stages)`.
pub const GROWTH_RATIO_TIERS: &[(f64, u8)] = &[
    (GROWTH_RATIO_TIER_3, 3),
    (GROWTH_RATIO_TIER_2, 2),
    (GROWTH_RATIO_TIER_1, 1),
];

/// Default clamp ceiling for base growth alone (SDD §8 max tier is +3).
/// Later WPs may pass a higher plant `max_growth_stage` into [`apply_growth_pipeline`].
pub const DEFAULT_MAX_GROWTH_STAGE: u8 = 3;

/// One player's inputs for team-round ratio (caller builds from eval + answer times).
///
/// Intentionally **not** `RoundResult`: that type has neither `base_factor` nor
/// eligibility fields (`is_bot` / `connected` / `team_id`).
#[derive(Debug, Clone, PartialEq)]
pub struct PlayerRoundContribution {
    pub is_bot: bool,
    pub connected: bool,
    pub team_id: Option<String>,
    /// From `eval::evaluate_answer(question, answer).base` — never `RoundResult.points`.
    pub base_factor: f64,
    /// Same field as `Answer.response_time_ms` / `RoundResult.response_time_ms`.
    pub response_time_ms: i64,
}

/// E-05 eligible filter for a target team: `!is_bot && connected && team_id == target`.
#[inline]
pub fn is_eligible_for_team(c: &PlayerRoundContribution, team_id: &str) -> bool {
    !c.is_bot && c.connected && c.team_id.as_deref() == Some(team_id)
}

/// Speed weight for growth (E-04rev).
///
/// `timeFactor = 0.5 + 0.5 × (remaining / total)`, clamped to `[0.5, 1.0]`.
/// - Instant answer (`response_time_ms == 0`) → 1.0
/// - Answer at deadline → 0.5
/// - Late / over-time → 0.5 (remaining ratio floor 0)
///
/// Uses the same time units as `calculate_points(..., response_time_ms, question_time_s, ...)`:
/// ms for response, seconds for total question window.
pub fn time_factor(response_time_ms: i64, total_answer_time_s: i32) -> f64 {
    let total_ms = f64::from(total_answer_time_s.max(1)) * 1000.0;
    let elapsed_ms = response_time_ms.max(0) as f64;
    let remaining_ratio = ((total_ms - elapsed_ms) / total_ms).clamp(0.0, 1.0);
    (0.5 + 0.5 * remaining_ratio).clamp(0.5, 1.0)
}

/// Normalized team performance in `[0.0, 1.0]` for `team_id`.
///
/// Eligible players only (`!is_bot && connected && team_id matches`).
/// Zero eligible → `0.0` (no panic). Unanswered players should pass
/// `base_factor = 0.0` and still count in the denominator when eligible.
pub fn team_round_ratio(
    contributions: &[PlayerRoundContribution],
    team_id: &str,
    total_answer_time_s: i32,
) -> f64 {
    let mut sum = 0.0;
    let mut count = 0usize;

    for c in contributions {
        if !is_eligible_for_team(c, team_id) {
            continue;
        }
        let base = c.base_factor.clamp(0.0, 1.0);
        let signal = base * time_factor(c.response_time_ms, total_answer_time_s);
        sum += signal;
        count += 1;
    }

    if count == 0 {
        return 0.0;
    }

    (sum / count as f64).clamp(0.0, 1.0)
}

/// Map `teamRoundRatio` to base growth stages (SDD §8 table).
///
/// Thresholds from [`GROWTH_RATIO_TIERS`] (named const-array defaults):
/// - `< 0.45` → 0
/// - `0.45..0.69` → +1
/// - `0.70..0.89` → +2
/// - `≥ 0.90` → +3
pub fn ratio_to_base_growth(ratio: f64) -> u8 {
    let r = ratio.clamp(0.0, 1.0);
    for &(min_ratio, growth) in GROWTH_RATIO_TIERS {
        if r >= min_ratio {
            return growth;
        }
    }
    0
}

/// Map base growth stages to sun points earned this round (WP #930 / SDD sun-meter).
///
/// Accumulating table (hard literals, not a formula mirror):
/// - `0` → `0`
/// - `1` → `1`
/// - `2` → `1`
/// - `3` → `2`
///
/// Values above 3 clamp to the stage-3 yield (`2`). Pure; call after
/// [`ratio_to_base_growth`]. Points accumulate per team across questions.
pub fn base_growth_to_sunpoints(base_growth: u8) -> u8 {
    match base_growth {
        0 => 0,
        1 | 2 => 1,
        _ => 2, // 3 and any higher clamp
    }
}

/// SDD §9 growth order (WP #929 / WP #932):
/// base → positive modifiers → negative modifiers → floor 0 → clamp `max_growth_stage`.
///
/// Status resolution (sunbeam / umbrella / acid_rain) is handled by
/// [`super::effects::apply_question_growth`], which derives the modifier pair
/// then calls this pure pipeline.
pub fn apply_growth_pipeline(
    base_growth: u8,
    positive_modifiers: i32,
    negative_modifiers: i32,
    max_growth_stage: u8,
) -> u8 {
    let mut stages = i32::from(base_growth);
    stages += positive_modifiers;
    stages -= negative_modifiers;
    if stages < 0 {
        stages = 0;
    }
    let capped = stages.min(i32::from(max_growth_stage)).max(0);
    // max_growth_stage is u8; capped is in [0, max_growth_stage]
    capped as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contrib(
        team: Option<&str>,
        base: f64,
        response_ms: i64,
        is_bot: bool,
        connected: bool,
    ) -> PlayerRoundContribution {
        PlayerRoundContribution {
            is_bot,
            connected,
            team_id: team.map(str::to_string),
            base_factor: base,
            response_time_ms: response_ms,
        }
    }

    // --- ratio_to_base_growth boundaries (hard literals, no formula mirror) ---

    #[test]
    fn ratio_to_base_growth_boundaries() {
        assert_eq!(ratio_to_base_growth(0.0), 0);
        assert_eq!(ratio_to_base_growth(0.44999), 0);
        assert_eq!(ratio_to_base_growth(0.45), 1);
        assert_eq!(ratio_to_base_growth(0.69999), 1);
        assert_eq!(ratio_to_base_growth(0.70), 2);
        assert_eq!(ratio_to_base_growth(0.89999), 2);
        assert_eq!(ratio_to_base_growth(0.90), 3);
        assert_eq!(ratio_to_base_growth(1.0), 3);
    }

    // --- base_growth_to_sunpoints (WP #930; hard literals) ---

    #[test]
    fn base_growth_to_sunpoints_table() {
        assert_eq!(base_growth_to_sunpoints(0), 0);
        assert_eq!(base_growth_to_sunpoints(1), 1);
        assert_eq!(base_growth_to_sunpoints(2), 1);
        assert_eq!(base_growth_to_sunpoints(3), 2);
    }

    #[test]
    fn ratio_to_base_growth_clamps_out_of_range() {
        assert_eq!(ratio_to_base_growth(-1.0), 0);
        assert_eq!(ratio_to_base_growth(1.5), 3);
    }

    // --- time_factor ---

    #[test]
    fn time_factor_instant_is_one() {
        assert!((time_factor(0, 10) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn time_factor_at_deadline_is_half() {
        assert!((time_factor(10_000, 10) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn time_factor_late_stays_half() {
        assert!((time_factor(50_000, 10) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn time_factor_mid_window() {
        // half remaining → 0.5 + 0.5*0.5 = 0.75
        assert!((time_factor(5_000, 10) - 0.75).abs() < 1e-12);
    }

    // --- team_round_ratio ---

    #[test]
    fn zero_eligible_returns_zero_without_panic() {
        assert_eq!(team_round_ratio(&[], "rot", 10), 0.0);
        let only_other_team = [contrib(Some("blau"), 1.0, 0, false, true)];
        assert_eq!(team_round_ratio(&only_other_team, "rot", 10), 0.0);
    }

    #[test]
    fn ratio_clamped_to_unit_interval() {
        // base_factor overshoot still clamps
        let players = [contrib(Some("rot"), 2.0, 0, false, true)];
        let r = team_round_ratio(&players, "rot", 10);
        assert!((0.0..=1.0).contains(&r));
        assert!((r - 1.0).abs() < 1e-12);
    }

    #[test]
    fn perfect_fast_team_ratio_is_one() {
        let players = [
            contrib(Some("rot"), 1.0, 0, false, true),
            contrib(Some("rot"), 1.0, 0, false, true),
        ];
        assert!((team_round_ratio(&players, "rot", 10) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn mixed_accuracy_averages_signals() {
        // p1: 1.0 * 1.0 = 1.0; p2: 0.0 * 1.0 = 0.0 → mean 0.5
        let players = [
            contrib(Some("rot"), 1.0, 0, false, true),
            contrib(Some("rot"), 0.0, 0, false, true),
        ];
        assert!((team_round_ratio(&players, "rot", 10) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn size_independence_same_per_head_performance() {
        let one = [contrib(Some("rot"), 1.0, 0, false, true)];
        let many: Vec<_> = (0..20)
            .map(|_| contrib(Some("rot"), 1.0, 0, false, true))
            .collect();
        let r1 = team_round_ratio(&one, "rot", 10);
        let r20 = team_round_ratio(&many, "rot", 10);
        assert!((r1 - r20).abs() < 1e-12);
        assert!((r1 - 1.0).abs() < 1e-12);
    }

    #[test]
    fn time_affects_signal_without_streak_or_points() {
        // Identical base_factor; only response time differs.
        let fast = [contrib(Some("rot"), 1.0, 0, false, true)];
        let slow = [contrib(Some("rot"), 1.0, 10_000, false, true)];
        let r_fast = team_round_ratio(&fast, "rot", 10);
        let r_slow = team_round_ratio(&slow, "rot", 10);
        assert!((r_fast - 1.0).abs() < 1e-12);
        assert!((r_slow - 0.5).abs() < 1e-12);
        // Hard expected growth tiers from those ratios
        assert_eq!(ratio_to_base_growth(r_fast), 3);
        assert_eq!(ratio_to_base_growth(r_slow), 1);
    }

    #[test]
    fn not_sensitive_to_quiz_points_fields() {
        // No RoundResult.points / streak / first_correct in the API — only base_factor.
        // Two scenarios that would differ under points-scoring stay equal here.
        let a = [contrib(Some("rot"), 1.0, 0, false, true)];
        let b = [contrib(Some("rot"), 1.0, 0, false, true)];
        assert_eq!(
            team_round_ratio(&a, "rot", 10),
            team_round_ratio(&b, "rot", 10)
        );
    }

    // --- eligible exclusions (one dedicated case each) ---

    #[test]
    fn excludes_bot() {
        let players = [
            contrib(Some("rot"), 1.0, 0, true, true), // bot
            contrib(Some("rot"), 0.0, 0, false, true),
        ];
        // Only human with base 0 → ratio 0 (bot not in denominator)
        assert!((team_round_ratio(&players, "rot", 10) - 0.0).abs() < 1e-12);
    }

    #[test]
    fn excludes_disconnected() {
        let players = [
            contrib(Some("rot"), 1.0, 0, false, false), // disconnected
            contrib(Some("rot"), 0.0, 0, false, true),
        ];
        assert!((team_round_ratio(&players, "rot", 10) - 0.0).abs() < 1e-12);
    }

    #[test]
    fn excludes_teamless() {
        let players = [
            contrib(None, 1.0, 0, false, true), // no team
            contrib(Some("rot"), 0.0, 0, false, true),
        ];
        assert!((team_round_ratio(&players, "rot", 10) - 0.0).abs() < 1e-12);
    }

    #[test]
    fn mixed_exclusions_only_eligible_count() {
        let players = [
            contrib(Some("rot"), 1.0, 0, true, true),   // bot
            contrib(Some("rot"), 1.0, 0, false, false), // disconnected
            contrib(None, 1.0, 0, false, true),         // teamless
            contrib(Some("blau"), 1.0, 0, false, true), // other team
            contrib(Some("rot"), 1.0, 0, false, true),  // only eligible
        ];
        assert!((team_round_ratio(&players, "rot", 10) - 1.0).abs() < 1e-12);
    }

    // --- growth pipeline (SDD §9 order + clamp) ---

    #[test]
    fn growth_pipeline_order_and_floor() {
        // base 1 + 2 - 4 → -1 → floor 0
        assert_eq!(apply_growth_pipeline(1, 2, 4, DEFAULT_MAX_GROWTH_STAGE), 0);
        // base 2 + 1 - 0 → 3
        assert_eq!(apply_growth_pipeline(2, 1, 0, DEFAULT_MAX_GROWTH_STAGE), 3);
    }

    #[test]
    fn growth_pipeline_overflow_clamps_to_max() {
        assert_eq!(
            apply_growth_pipeline(3, 100, 0, DEFAULT_MAX_GROWTH_STAGE),
            3
        );
        assert_eq!(apply_growth_pipeline(3, 100, 0, 5), 5);
        assert_eq!(apply_growth_pipeline(0, 0, 99, 5), 0);
    }

    #[test]
    fn end_to_end_ratio_to_clamped_growth() {
        let players = [contrib(Some("rot"), 1.0, 0, false, true)];
        let ratio = team_round_ratio(&players, "rot", 10);
        let base = ratio_to_base_growth(ratio);
        assert_eq!(base, 3);
        let final_g = apply_growth_pipeline(base, 0, 0, DEFAULT_MAX_GROWTH_STAGE);
        assert_eq!(final_g, 3);
        assert!(final_g <= DEFAULT_MAX_GROWTH_STAGE);
    }
}
