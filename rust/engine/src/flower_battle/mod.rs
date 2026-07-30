//! FlowerBattle engine helpers (pure transforms, no game-state mutation).

pub mod powerups;
pub mod scoring;
pub mod votes;

pub use powerups::{
    consume_and_excess, encode_offer_options, existing_offer_or_create, generate_powerup_offer,
    is_positive_option, offer_seed, parse_offer_options, select_offer_options,
    should_trigger_offer, OfferCacheKey, OfferGenerationError, OFFER_THRESHOLD, OPTION_ACID_RAIN,
    OPTION_FERTILIZER, OPTION_SUNBEAM, OPTION_UMBRELLA_SHIELD,
};
pub use scoring::{
    apply_growth_pipeline, base_growth_to_sunpoints, is_eligible_for_team, ratio_to_base_growth,
    team_round_ratio, time_factor, PlayerRoundContribution, DEFAULT_MAX_GROWTH_STAGE,
    GROWTH_RATIO_TIERS, GROWTH_RATIO_TIER_1, GROWTH_RATIO_TIER_2, GROWTH_RATIO_TIER_3,
};
pub use votes::{
    can_apply_acid_rain, determine_winner, is_eligible_voter, positive_defaults_from_options,
    powerup_requires_target, record_attack, validate_target_choice, VoteChoice, VoteError,
    VoteKind, VoteState, VotingResult, POWERUP_VOTE_TIMEOUT_MS, TARGET_VOTE_TIMEOUT_MS,
};
