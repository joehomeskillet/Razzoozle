//! FlowerBattle power-up status model (WP #932 / WP-FLB-07).
//! Pure transforms — no clocks/I/O/points. Growth: base→pos→neg→min0→clamp via
//! [`apply_question_growth`] → [`crate::flower_battle::scoring::apply_growth_pipeline`].

use std::collections::HashMap;

use razzoozle_protocol::experience::FlowerBattleEffect;

use super::scoring::{apply_growth_pipeline, DEFAULT_MAX_GROWTH_STAGE};

// Constants

/// Instant growth delta when fertilizer is applied (before clamp).
pub const FERTILIZER_GROWTH_BONUS: u8 = 2;
/// Extra stages when sunbeam consumes on base growth ≥ 1.
pub const SUNBEAM_GROWTH_BONUS: i32 = 1;
/// Stages removed from next positive growth by acid rain (min 0).
pub const ACID_RAIN_GROWTH_PENALTY: i32 = 1;
/// Umbrella starts with this many answered-question ticks remaining.
pub const UMBRELLA_INITIAL_QUESTIONS: u8 = 2;
/// Sentinel for consume-on-use effects with no fixed question expiry.
pub const NO_FIXED_EXPIRY: i32 = 0;

// Offered effect + errors

/// Power-up chosen by a team (offer resolution input). Fertilizer is instant.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OfferedEffect {
    Fertilizer,
    Sunbeam,
    UmbrellaShield,
    /// `target_team_id` is the victim of the acid rain status.
    AcidRain {
        target_team_id: String,
    },
}

/// Result of a successful [`apply_effects`] call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppliedEffect {
    /// Instant stage bump (no lasting status).
    Fertilizer { growth_stage: u8 },
    /// Status stored on the (possibly different) target team.
    Status {
        team_id: String,
        effect: FlowerBattleEffect,
    },
    /// Placeholder after snapshot restore (offer id known; payload not rehydrated).
    RestoredIdempotent,
}

/// Errors from [`apply_effects`] (non-idempotent failures).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EffectError {
    /// Victory already resolved — no further effect mutation.
    VictoryResolved,
    /// Target already has a negative status (max one per team).
    NegativeAlreadyActive,
    /// Acid rain without a non-empty target team id.
    MissingTarget,
}

// State

/// Per-session flower-battle effect bookkeeping (engine-side; snapshotted as
/// `activeEffects` + `appliedOfferIds` at SNAPSHOT_VERSION 5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EffectsState {
    /// Cumulative plant growth stage per team (0..=max_growth_stage).
    pub growth_stage: HashMap<String, u8>,
    /// Active statuses per team (max one negative).
    pub active: HashMap<String, Vec<FlowerBattleEffect>>,
    /// Idempotency map: offer_id → prior application result.
    pub applied_offers: HashMap<String, AppliedEffect>,
    pub max_growth_stage: u8,
    /// After victory resolution, all apply / growth ticks are no-ops / errors.
    pub victory_resolved: bool,
}

impl Default for EffectsState {
    fn default() -> Self {
        Self {
            growth_stage: HashMap::new(),
            active: HashMap::new(),
            applied_offers: HashMap::new(),
            max_growth_stage: DEFAULT_MAX_GROWTH_STAGE,
            victory_resolved: false,
        }
    }
}

impl EffectsState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_max_growth_stage(max_growth_stage: u8) -> Self {
        Self {
            max_growth_stage,
            ..Self::default()
        }
    }

    /// Snapshot helper: flat list of teams that currently hold any status.
    pub fn active_effects_for_snapshot(&self) -> Vec<(String, u8, Vec<FlowerBattleEffect>)> {
        let mut team_ids: Vec<String> = self
            .active
            .keys()
            .chain(self.growth_stage.keys())
            .cloned()
            .collect();
        team_ids.sort();
        team_ids.dedup();
        team_ids
            .into_iter()
            .map(|tid| {
                let stage = self.growth_stage.get(&tid).copied().unwrap_or(0);
                let effects = self.active.get(&tid).cloned().unwrap_or_default();
                (tid, stage, effects)
            })
            .filter(|(_, stage, effects)| *stage > 0 || !effects.is_empty())
            .collect()
    }

    pub fn applied_offer_ids(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.applied_offers.keys().cloned().collect();
        ids.sort();
        ids
    }

    /// Effects slice for a team (offer exclusion filters).
    pub fn effects_for(&self, team_id: &str) -> &[FlowerBattleEffect] {
        self.active
            .get(team_id)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    pub fn stage_of(&self, team_id: &str) -> u8 {
        self.growth_stage.get(team_id).copied().unwrap_or(0)
    }

    /// Alias used by snapshot tests / display projections.
    #[inline]
    pub fn growth_of(&self, team_id: &str) -> u8 {
        self.stage_of(team_id)
    }

    pub fn set_stage(&mut self, team_id: &str, stage: u8) {
        let capped = stage.min(self.max_growth_stage);
        self.growth_stage.insert(team_id.to_string(), capped);
    }

    pub fn has_negative(&self, team_id: &str) -> bool {
        self.effects_for(team_id).iter().any(|e| e.is_negative())
    }

    pub fn has_umbrella(&self, team_id: &str) -> bool {
        self.effects_for(team_id)
            .iter()
            .any(|e| e.is_umbrella_shield())
    }

    pub fn remove_matching<F>(&mut self, team_id: &str, mut pred: F)
    where
        F: FnMut(&FlowerBattleEffect) -> bool,
    {
        if let Some(list) = self.active.get_mut(team_id) {
            list.retain(|e| !pred(e));
            if list.is_empty() {
                self.active.remove(team_id);
            }
        }
    }

    pub fn push_effect(&mut self, team_id: &str, effect: FlowerBattleEffect) {
        self.active
            .entry(team_id.to_string())
            .or_default()
            .push(effect);
    }
}

// apply_effects

/// Apply a resolved power-up offer to `state`.
///
/// - Idempotent on `offer_id` (returns the prior [`AppliedEffect`]).
/// - Never mutates player points / scores.
/// - Guard: [`EffectError::VictoryResolved`] after victory.
/// - Max one negative status per target team.
pub fn apply_effects(
    state: &mut EffectsState,
    acting_team_id: &str,
    offered: OfferedEffect,
    offer_id: &str,
) -> Result<AppliedEffect, EffectError> {
    if let Some(prev) = state.applied_offers.get(offer_id) {
        return Ok(prev.clone());
    }
    if state.victory_resolved {
        return Err(EffectError::VictoryResolved);
    }

    let applied = match offered {
        OfferedEffect::Fertilizer => {
            let next = state
                .stage_of(acting_team_id)
                .saturating_add(FERTILIZER_GROWTH_BONUS);
            state.set_stage(acting_team_id, next);
            AppliedEffect::Fertilizer {
                growth_stage: state.stage_of(acting_team_id),
            }
        }
        OfferedEffect::Sunbeam => {
            let effect = FlowerBattleEffect::sunbeam(NO_FIXED_EXPIRY);
            state.push_effect(acting_team_id, effect.clone());
            AppliedEffect::Status {
                team_id: acting_team_id.to_string(),
                effect,
            }
        }
        OfferedEffect::UmbrellaShield => {
            // Coexists with acid_rain until the next positive-growth tick
            // (mutual consume happens in [`apply_question_growth`]).
            let effect = FlowerBattleEffect::umbrella_shield(UMBRELLA_INITIAL_QUESTIONS);
            state.push_effect(acting_team_id, effect.clone());
            AppliedEffect::Status {
                team_id: acting_team_id.to_string(),
                effect,
            }
        }
        OfferedEffect::AcidRain { target_team_id } => {
            if target_team_id.is_empty() {
                return Err(EffectError::MissingTarget);
            }
            // Max one negative status per target; shield does not block apply.
            if state.has_negative(&target_team_id) {
                return Err(EffectError::NegativeAlreadyActive);
            }
            let effect = FlowerBattleEffect::acid_rain(acting_team_id, NO_FIXED_EXPIRY);
            state.push_effect(&target_team_id, effect.clone());
            AppliedEffect::Status {
                team_id: target_team_id,
                effect,
            }
        }
    };

    state
        .applied_offers
        .insert(offer_id.to_string(), applied.clone());
    Ok(applied)
}

// Growth pipeline integration

/// Resolve active statuses for one team's round growth, then run
/// [`apply_growth_pipeline`] (base → pos → neg → min0 → clamp).
///
/// Also ticks umbrella `remaining_questions` and consumes sunbeam / acid rain
/// according to MVP rules. Returns the **round** growth contribution (not
/// cumulative stage). Cumulative stage is updated in place.
///
/// After victory resolution this is a no-op returning `0`.
pub fn apply_question_growth(
    state: &mut EffectsState,
    team_id: &str,
    base_growth: u8,
    _question_id: i32,
) -> u8 {
    if state.victory_resolved {
        return 0;
    }

    let mut positive_modifiers: i32 = 0;
    let mut negative_modifiers: i32 = 0;
    let mut consume_sunbeam = false;
    let mut consume_acid = false;
    let mut consume_umbrella = false;

    let has_sunbeam = state.effects_for(team_id).iter().any(|e| e.is_sunbeam());
    let has_acid = state.effects_for(team_id).iter().any(|e| e.is_acid_rain());
    let has_umbrella = state
        .effects_for(team_id)
        .iter()
        .any(|e| e.is_umbrella_shield());

    // Sunbeam: next base ≥1 → +1, then consume. Base 0 keeps status.
    if has_sunbeam && base_growth >= 1 {
        positive_modifiers += SUNBEAM_GROWTH_BONUS;
        consume_sunbeam = true;
    }

    // Positive growth this round (after sunbeam) decides acid-rain consumption.
    let positive_growth = i32::from(base_growth) + positive_modifiers;
    if has_acid && positive_growth > 0 {
        if has_umbrella {
            // Shield blocks the negative; both statuses consumed.
            consume_acid = true;
            consume_umbrella = true;
        } else {
            negative_modifiers += ACID_RAIN_GROWTH_PENALTY;
            consume_acid = true;
        }
    }

    let round = apply_growth_pipeline(
        base_growth,
        positive_modifiers,
        negative_modifiers,
        state.max_growth_stage,
    );

    // Cumulative stage: add round contribution, re-clamp.
    let next = state.stage_of(team_id).saturating_add(round);
    state.set_stage(team_id, next);

    if consume_sunbeam {
        state.remove_matching(team_id, |e| e.is_sunbeam());
    }
    if consume_acid {
        state.remove_matching(team_id, |e| e.is_acid_rain());
    }
    if consume_umbrella {
        state.remove_matching(team_id, |e| e.is_umbrella_shield());
    } else {
        // Tick umbrella only when it was not consumed by a block this round.
        tick_umbrella(state, team_id);
    }

    round
}

fn tick_umbrella(state: &mut EffectsState, team_id: &str) {
    let Some(list) = state.active.get_mut(team_id) else {
        return;
    };
    let mut expired = false;
    for e in list.iter_mut() {
        if let FlowerBattleEffect::UmbrellaShield {
            remaining_questions,
        } = e
        {
            if *remaining_questions > 0 {
                *remaining_questions -= 1;
            }
            if *remaining_questions == 0 {
                expired = true;
            }
        }
    }
    if expired {
        list.retain(|e| {
            !matches!(
                e,
                FlowerBattleEffect::UmbrellaShield {
                    remaining_questions: 0
                }
            )
        });
        if list.is_empty() {
            state.active.remove(team_id);
        }
    }
}

/// Mark victory resolved — further [`apply_effects`] / growth ticks are guarded.
pub fn mark_victory_resolved(state: &mut EffectsState) {
    state.victory_resolved = true;
}

#[cfg(test)]
#[path = "effects_tests.rs"]
mod effects_tests;
