//! FlowerBattle engine helpers (pure transforms, no game-state mutation).

pub mod scoring;

pub use scoring::{
    apply_growth_pipeline, is_eligible_for_team, ratio_to_base_growth, team_round_ratio,
    time_factor, PlayerRoundContribution, DEFAULT_MAX_GROWTH_STAGE, GROWTH_RATIO_TIERS,
    GROWTH_RATIO_TIER_1, GROWTH_RATIO_TIER_2, GROWTH_RATIO_TIER_3,
};
