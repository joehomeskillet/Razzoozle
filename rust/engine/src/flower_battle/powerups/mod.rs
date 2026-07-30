//! FlowerBattle sun-point meter + deterministic power-up offer registry (WP #930).
//!
//! Pure transforms only — no game-state mutation, no clocks, no I/O.
//! Caching/wiring into lifecycle lands in WP #932+.
//!
//! # Determinism contract (reconnect)
//!
//! Seed = deterministischer Hash aus `(gameId, teamId, questionIndex)`.
//! Same seed → same offer `id` / option set / `expires_at` when served from the
//! registry cache (`existing_offer_or_create`). No system time in the seed.

use std::collections::HashMap;

use razzoozle_protocol::experience::{FlowerBattleEffect, PowerupOffer};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Sun points required to trigger one power-up offer.
pub const OFFER_THRESHOLD: u8 = 3;

/// Positive option ids (self-buffs / protection).
pub const OPTION_FERTILIZER: &str = "fertilizer";
pub const OPTION_SUNBEAM: &str = "sunbeam";
pub const OPTION_UMBRELLA_SHIELD: &str = "umbrella_shield";
/// Negative option id (attacks another team).
pub const OPTION_ACID_RAIN: &str = "acid_rain";

/// Canonical option catalogue (stable order for combinatorics).
const ALL_OPTIONS: &[&str] = &[
    OPTION_FERTILIZER,
    OPTION_SUNBEAM,
    OPTION_UMBRELLA_SHIELD,
    OPTION_ACID_RAIN,
];

/// Documented safe fallback when no valid 3-option set can be built.
/// Never panics — always returns fertilizer triple.
const FALLBACK_OPTIONS: [&str; 3] = [OPTION_FERTILIZER, OPTION_FERTILIZER, OPTION_FERTILIZER];

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors from offer generation. Prefer fallback over panic; strict selectors
/// may surface [`OfferGenerationError::AllOptionsExcluded`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OfferGenerationError {
    /// No option remained after exclusion filters (strict path only).
    AllOptionsExcluded,
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

/// Registry cache key: `(game_id, team_id, question_index)`.
pub type OfferCacheKey = (String, String, i32);

// ---------------------------------------------------------------------------
// Sun-point meter
// ---------------------------------------------------------------------------

//< Map accumulated sun points → whether an offer should fire (≥ threshold).
#[inline]
pub fn should_trigger_offer(accumulated_sunpoints: u8) -> bool {
    accumulated_sunpoints >= OFFER_THRESHOLD
}

//< Consume one offer's worth of sun points; return (triggered, remaining).
///
/// Excess is kept: e.g. `5` → `(true, 2)`, `2` → `(false, 2)`, `3` → `(true, 0)`.
/// Caller enforces max-one-active-offer per team at game-state layer (WP #932+).
pub fn consume_and_excess(accumulated_sunpoints: u8) -> (bool, u8) {
    if accumulated_sunpoints >= OFFER_THRESHOLD {
        (true, accumulated_sunpoints - OFFER_THRESHOLD)
    } else {
        (false, accumulated_sunpoints)
    }
}

// ---------------------------------------------------------------------------
// Seed + PRNG (no ahash dep — simple FNV-1a + LCG; pure / deterministic)
// ---------------------------------------------------------------------------

//< Seed = deterministischer Hash aus (gameId, teamId, questionIndex).
///
/// FNV-1a over the three fields with a separator. **No** `SystemTime` / clocks.
pub fn offer_seed(game_id: &str, team_id: &str, question_index: i32) -> u64 {
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;

    let mut h = FNV_OFFSET;
    for b in game_id.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(FNV_PRIME);
    }
    // Field separator (not a printable char used in ids).
    h ^= 0xff;
    h = h.wrapping_mul(FNV_PRIME);
    for b in team_id.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(FNV_PRIME);
    }
    h ^= 0xff;
    h = h.wrapping_mul(FNV_PRIME);
    // Mix question index (signed → bits).
    let q = question_index as u64;
    h ^= q;
    h = h.wrapping_mul(FNV_PRIME);
    h ^= q.rotate_left(17);
    h
}

/// Tiny LCG for deterministic index picks (no `rand` dependency required).
struct SeedRng {
    state: u64,
}

impl SeedRng {
    fn new(seed: u64) -> Self {
        // Avoid zero state (LCG degeneracy).
        Self { state: seed | 1 }
    }

    fn next_u64(&mut self) -> u64 {
        // Numerical Recipes LCG
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1);
        self.state
    }

    fn gen_index(&mut self, len: usize) -> usize {
        if len == 0 {
            return 0;
        }
        (self.next_u64() as usize) % len
    }
}

// ---------------------------------------------------------------------------
// Option filters + selection
// ---------------------------------------------------------------------------

/// Positive option (self-buff / protection) — never a default-excluded negative.
#[inline]
pub fn is_positive_option(id: &str) -> bool {
    matches!(
        id,
        OPTION_FERTILIZER | OPTION_SUNBEAM | OPTION_UMBRELLA_SHIELD
    )
}

#[inline]
fn is_positive(id: &str) -> bool {
    is_positive_option(id)
}

fn is_negative(id: &str) -> bool {
    id == OPTION_ACID_RAIN
}

//< Whether `option_id` is allowed given active effects + target availability.
fn is_option_available(
    option_id: &str,
    active_effects: &[FlowerBattleEffect],
    has_target_team: bool,
) -> bool {
    match option_id {
        OPTION_UMBRELLA_SHIELD
            if active_effects
                .iter()
                .any(|e| *e == FlowerBattleEffect::Sunbeam) =>
        {
            false
        }
        OPTION_SUNBEAM
            if active_effects
                .iter()
                .any(|e| *e == FlowerBattleEffect::UmbrellaShield) =>
        {
            false
        }
        OPTION_ACID_RAIN if !has_target_team => false,
        _ => true,
    }
}

//< Build all valid distinct 3-option sets: ≥1 positive, ≤1 negative, no dups.
fn valid_option_sets<'a>(available: &[&'a str]) -> Vec<[&'a str; 3]> {
    let n = available.len();
    let mut out = Vec::new();
    if n < 3 {
        return out;
    }
    for i in 0..n {
        for j in (i + 1)..n {
            for k in (j + 1)..n {
                let set = [available[i], available[j], available[k]];
                let pos = set.iter().filter(|id| is_positive(id)).count();
                let neg = set.iter().filter(|id| is_negative(id)).count();
                if pos >= 1 && neg <= 1 {
                    out.push(set);
                }
            }
        }
    }
    out
}

//< Select 3 option ids for an offer (deterministic under `seed`).
///
/// Rules: distinct when possible; ≥1 positive; ≤1 negative; exclusion filters.
/// Fallback when no valid set: `[fertilizer, fertilizer, fertilizer]`.
pub fn select_offer_options(
    seed: u64,
    active_effects: &[FlowerBattleEffect],
    has_target_team: bool,
) -> [&'static str; 3] {
    let available: Vec<&str> = ALL_OPTIONS
        .iter()
        .copied()
        .filter(|id| is_option_available(id, active_effects, has_target_team))
        .collect();

    if available.is_empty() {
        return FALLBACK_OPTIONS;
    }

    let sets = valid_option_sets(&available);
    if sets.is_empty() {
        // Cannot form 3 distinct valid options (e.g. only fertilizer left).
        return FALLBACK_OPTIONS;
    }

    let mut rng = SeedRng::new(seed);
    let idx = rng.gen_index(sets.len());
    sets[idx]
}

// ---------------------------------------------------------------------------
// Offer generation
// ---------------------------------------------------------------------------

//< Encode three option ids into `PowerupOffer.offer_type` (comma-joined).
///
/// Wire shape stays a free string until a typed options array lands later.
pub fn encode_offer_options(options: &[&str; 3]) -> String {
    format!("{},{},{}", options[0], options[1], options[2])
}

//< Parse `offer_type` back into option ids (for tests / consumers).
pub fn parse_offer_options(offer_type: &str) -> Vec<&str> {
    offer_type.split(',').filter(|s| !s.is_empty()).collect()
}

//< Deterministic offer id from seed (reconnect-stable; no wall clock).
fn offer_id_from_seed(seed: u64) -> String {
    format!("offer_{:016x}", seed)
}

/// Generate a deterministic [`PowerupOffer`].
///
/// `has_target_team`: when `false`, `acid_rain` is excluded (no valid target).
/// For this WP, callers that always have another team pass `true`.
///
/// On empty/unusable option pools, returns fertilizer fallback (`Ok`), never panics.
/// [`OfferGenerationError`] is reserved for future strict modes.
pub fn generate_powerup_offer(
    game_id: &str,
    team_id: &str,
    question_index: i32,
    active_effects: &[FlowerBattleEffect],
    expires_at: i64,
    has_target_team: bool,
) -> Result<PowerupOffer, OfferGenerationError> {
    let seed = offer_seed(game_id, team_id, question_index);
    let options = select_offer_options(seed, active_effects, has_target_team);
    Ok(PowerupOffer {
        id: offer_id_from_seed(seed),
        offer_type: encode_offer_options(&options),
        expires_at,
    })
}

// ---------------------------------------------------------------------------
// Registry pattern (pure; wiring into game state is WP #932+)
// ---------------------------------------------------------------------------

/// Return a cached offer for `(game_id, team_id, question_index)` or create one.
///
/// Reconnect guarantee: cache hit returns the **same** instance (id / options /
/// `expires_at` unchanged) — no re-roll.
pub fn existing_offer_or_create(
    cache: &mut HashMap<OfferCacheKey, PowerupOffer>,
    game_id: &str,
    team_id: &str,
    question_index: i32,
    active_effects: &[FlowerBattleEffect],
    expires_at: i64,
    has_target_team: bool,
) -> Result<PowerupOffer, OfferGenerationError> {
    let key: OfferCacheKey = (game_id.to_string(), team_id.to_string(), question_index);
    if let Some(existing) = cache.get(&key) {
        return Ok(existing.clone());
    }
    let offer = generate_powerup_offer(
        game_id,
        team_id,
        question_index,
        active_effects,
        expires_at,
        has_target_team,
    )?;
    cache.insert(key, offer.clone());
    Ok(offer)
}

// ---------------------------------------------------------------------------
// Tests (hard literals — not mirrored formulas)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests;
