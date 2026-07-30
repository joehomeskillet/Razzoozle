//! FlowerBattle power-up voting (WP #931).
//!
//! Pure, deterministic vote collection + majority resolution.
//! - Majority via [`crate::team_vote::resolve_majority`] (reuse from #880).
//! - Tie-break: seed-ordered permutation of candidates (`offer.seed`).
//! - Zero power-up votes → positive default only (never `acid_rain` / negative).
//! - Target (acid_rain) zero votes → no apply (never invent a target).
//! - Late votes after `deadline_ms` ignored; second vote = upsert.
//! - Evaluation is tick-driven (`evaluate_at`); no timer threads here (#933).

use std::collections::HashMap;
use std::hash::Hash;

use crate::team_vote::resolve_majority;

use super::powerups::{is_positive_option, OPTION_ACID_RAIN, OPTION_FERTILIZER};

// ---------------------------------------------------------------------------
// Timeouts (ms) — evaluated by lifecycle tick, not local timers
// ---------------------------------------------------------------------------

/// Power-up option vote window.
pub const POWERUP_VOTE_TIMEOUT_MS: i64 = 8_000;
/// Target-team vote window after `acid_rain` wins the option vote.
pub const TARGET_VOTE_TIMEOUT_MS: i64 = 5_000;

pub type PlayerId = String;
pub type TeamId = String;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// What a player is voting for in the active session.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum VoteChoice {
    /// Index into the active offer's option list.
    PowerupOption(usize),
    /// Target team id (acid_rain target vote).
    TargetTeam(TeamId),
}

/// Active vote session (in-memory only — never snapshotted).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VoteState {
    pub kind: VoteKind,
    pub votes: HashMap<PlayerId, VoteChoice>,
    pub deadline_ms: i64,
    /// Offer seed — sole source of tie-break / zero-vote default order.
    pub seed: u64,
    /// Power-up option ids (Powerup) or candidate team ids (Target).
    pub candidates: Vec<String>,
    /// Attacking team (cast votes for this team's offer / target pick).
    pub attacker_team_id: TeamId,
    /// For target validation: map of team_id → last team that attacked them.
    pub previous_attacker_by_team: HashMap<TeamId, Option<TeamId>>,
    evaluated: bool,
    cached_result: Option<VotingResult>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoteKind {
    Powerup,
    Target,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VotingResult {
    /// Deadline not reached yet.
    Pending,
    /// Majority (or default) power-up option resolved.
    PowerupSelected {
        option_index: usize,
        option_id: String,
    },
    /// Target team resolved for acid_rain.
    TargetSelected { team_id: TeamId },
    /// acid_rain won option vote / was pending apply, but no valid target.
    /// Callers emit the selection event; must NOT apply acid_rain.
    AcidRainSkippedNoTarget,
    /// Session already evaluated earlier (idempotent re-tick).
    AlreadyResolved(Box<VotingResult>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VoteError {
    Late,
    AlreadyEvaluated,
    InvalidChoice,
    SelfTarget,
    RepeatTarget,
    WrongKind,
}

impl std::fmt::Display for VoteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Late => write!(f, "vote after deadline"),
            Self::AlreadyEvaluated => write!(f, "vote session already evaluated"),
            Self::InvalidChoice => write!(f, "choice not in candidate set"),
            Self::SelfTarget => write!(f, "cannot target own team"),
            Self::RepeatTarget => write!(f, "cannot target same team twice in a row"),
            Self::WrongKind => write!(f, "choice kind does not match vote session"),
        }
    }
}

impl std::error::Error for VoteError {}

// ---------------------------------------------------------------------------
// Eligible voter (E-05)
// ---------------------------------------------------------------------------

/// Eligible voter filter: `!is_bot && connected`.
#[inline]
pub fn is_eligible_voter(is_bot: bool, connected: bool) -> bool {
    !is_bot && connected
}

// ---------------------------------------------------------------------------
// Target rules
// ---------------------------------------------------------------------------

/// Server-side target authorization (payload manipulation must not bypass).
pub fn validate_target_choice(
    attacker_team_id: &str,
    target_team_id: &str,
    target_previous_attacker: Option<&str>,
) -> Result<(), VoteError> {
    if target_team_id == attacker_team_id {
        return Err(VoteError::SelfTarget);
    }
    if target_previous_attacker == Some(attacker_team_id) {
        return Err(VoteError::RepeatTarget);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Seed order + majority helper
// ---------------------------------------------------------------------------

/// Tiny LCG (same family as powerups) for deterministic permutations.
struct SeedRng {
    state: u64,
}

impl SeedRng {
    fn new(seed: u64) -> Self {
        Self { state: seed | 1 }
    }

    fn next_u64(&mut self) -> u64 {
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

/// Deterministic permutation of `items` driven by `seed` (Fisher–Yates).
fn seed_order<T: Clone>(items: &[T], seed: u64) -> Vec<T> {
    let mut out = items.to_vec();
    if out.len() <= 1 {
        return out;
    }
    let mut rng = SeedRng::new(seed);
    for i in (1..out.len()).rev() {
        let j = rng.gen_index(i + 1);
        out.swap(i, j);
    }
    out
}

fn pick_by_seed<T: Clone>(items: &[T], seed: u64) -> Option<T> {
    if items.is_empty() {
        return None;
    }
    let mut rng = SeedRng::new(seed);
    let idx = rng.gen_index(items.len());
    Some(items[idx].clone())
}

/// Majority winner with seed tie-break. Empty votes → `zero_vote_default` (required non-empty
/// for power-up path). Uses [`resolve_majority`] from #880 — no parallel majority code.
pub fn determine_winner<T: Eq + Hash + Clone>(
    options: &[T],
    votes: &HashMap<PlayerId, T>,
    seed: u64,
    zero_vote_default: &[T],
) -> Option<T> {
    if votes.is_empty() {
        return pick_by_seed(zero_vote_default, seed);
    }
    let vote_list: Vec<T> = votes.values().cloned().collect();
    let tie_break = seed_order(options, seed);
    if let Some(winner) = resolve_majority(vote_list, tie_break) {
        return Some(winner);
    }
    // Uncovered tie (should not happen when options cover all choices) — seed pick.
    pick_by_seed(options, seed)
}

/// Positive options only (never negative / acid_rain) for zero-vote default.
pub fn positive_defaults_from_options(options: &[String]) -> Vec<String> {
    let positives: Vec<String> = options
        .iter()
        .filter(|id| is_positive_option(id))
        .cloned()
        .collect();
    if !positives.is_empty() {
        return positives;
    }
    // Offer had only negatives (pathological) — still never pick acid_rain.
    vec![OPTION_FERTILIZER.to_string()]
}

// ---------------------------------------------------------------------------
// VoteState
// ---------------------------------------------------------------------------

impl VoteState {
    /// Open a power-up option vote (deadline = now + [`POWERUP_VOTE_TIMEOUT_MS`] when
    /// callers pass `now_ms + POWERUP_VOTE_TIMEOUT_MS`).
    pub fn new_powerup(
        deadline_ms: i64,
        seed: u64,
        option_ids: Vec<String>,
        attacker_team_id: impl Into<TeamId>,
    ) -> Self {
        Self {
            kind: VoteKind::Powerup,
            votes: HashMap::new(),
            deadline_ms,
            seed,
            candidates: option_ids,
            attacker_team_id: attacker_team_id.into(),
            previous_attacker_by_team: HashMap::new(),
            evaluated: false,
            cached_result: None,
        }
    }

    /// Open a target-team vote after acid_rain wins the option vote.
    pub fn new_target(
        deadline_ms: i64,
        seed: u64,
        candidate_teams: Vec<TeamId>,
        attacker_team_id: impl Into<TeamId>,
        previous_attacker_by_team: HashMap<TeamId, Option<TeamId>>,
    ) -> Self {
        Self {
            kind: VoteKind::Target,
            votes: HashMap::new(),
            deadline_ms,
            seed,
            candidates: candidate_teams,
            attacker_team_id: attacker_team_id.into(),
            previous_attacker_by_team,
            evaluated: false,
            cached_result: None,
        }
    }

    /// Record or replace a player's vote (upsert). Late / post-eval → error.
    pub fn vote(
        &mut self,
        player_id: impl Into<PlayerId>,
        choice: VoteChoice,
        now_ms: i64,
    ) -> Result<(), VoteError> {
        if self.evaluated {
            return Err(VoteError::AlreadyEvaluated);
        }
        if now_ms > self.deadline_ms {
            return Err(VoteError::Late);
        }

        match (&self.kind, &choice) {
            (VoteKind::Powerup, VoteChoice::PowerupOption(idx)) => {
                if *idx >= self.candidates.len() {
                    return Err(VoteError::InvalidChoice);
                }
            }
            (VoteKind::Target, VoteChoice::TargetTeam(tid)) => {
                if !self.candidates.iter().any(|c| c == tid) {
                    return Err(VoteError::InvalidChoice);
                }
                let prev = self
                    .previous_attacker_by_team
                    .get(tid)
                    .and_then(|p| p.as_deref());
                validate_target_choice(&self.attacker_team_id, tid, prev)?;
            }
            _ => return Err(VoteError::WrongKind),
        }

        self.votes.insert(player_id.into(), choice);
        Ok(())
    }

    /// Pure evaluation at `now_ms`. Before deadline → [`VotingResult::Pending`].
    /// After deadline → majority / defaults; subsequent calls return cached result.
    pub fn evaluate_at(&mut self, now_ms: i64) -> VotingResult {
        if let Some(ref cached) = self.cached_result {
            return VotingResult::AlreadyResolved(Box::new(cached.clone()));
        }
        if now_ms < self.deadline_ms {
            return VotingResult::Pending;
        }

        let result = match self.kind {
            VoteKind::Powerup => self.resolve_powerup(),
            VoteKind::Target => self.resolve_target(),
        };
        self.evaluated = true;
        self.cached_result = Some(result.clone());
        result
    }

    fn resolve_powerup(&self) -> VotingResult {
        let indices: HashMap<PlayerId, usize> = self
            .votes
            .iter()
            .filter_map(|(pid, c)| match c {
                VoteChoice::PowerupOption(i) => Some((pid.clone(), *i)),
                _ => None,
            })
            .collect();

        let option_indices: Vec<usize> = (0..self.candidates.len()).collect();
        let positive_idx: Vec<usize> = self
            .candidates
            .iter()
            .enumerate()
            .filter(|(_, id)| is_positive_option(id))
            .map(|(i, _)| i)
            .collect();
        let zero_defaults = if positive_idx.is_empty() {
            // Pathological: no positive in offer — still avoid acid_rain index if possible.
            option_indices
                .iter()
                .copied()
                .filter(|i| self.candidates.get(*i).map(|s| s.as_str()) != Some(OPTION_ACID_RAIN))
                .collect::<Vec<_>>()
        } else {
            positive_idx
        };

        let winner_idx =
            determine_winner(&option_indices, &indices, self.seed, &zero_defaults).unwrap_or(0);
        let option_id = self
            .candidates
            .get(winner_idx)
            .cloned()
            .unwrap_or_else(|| OPTION_FERTILIZER.to_string());

        VotingResult::PowerupSelected {
            option_index: winner_idx,
            option_id,
        }
    }

    fn resolve_target(&self) -> VotingResult {
        // Zero target votes → never invent a target (acid_rain not applied).
        if self.votes.is_empty() {
            return VotingResult::AcidRainSkippedNoTarget;
        }

        let team_votes: HashMap<PlayerId, String> = self
            .votes
            .iter()
            .filter_map(|(pid, c)| match c {
                VoteChoice::TargetTeam(t) => Some((pid.clone(), t.clone())),
                _ => None,
            })
            .collect();

        if team_votes.is_empty() {
            return VotingResult::AcidRainSkippedNoTarget;
        }

        // Filter to still-valid targets (self / repeat already rejected at vote time;
        // re-check defensively for evaluation-time state).
        let valid_candidates: Vec<String> = self
            .candidates
            .iter()
            .filter(|tid| {
                let prev = self
                    .previous_attacker_by_team
                    .get(*tid)
                    .and_then(|p| p.as_deref());
                validate_target_choice(&self.attacker_team_id, tid, prev).is_ok()
            })
            .cloned()
            .collect();

        if valid_candidates.is_empty() {
            return VotingResult::AcidRainSkippedNoTarget;
        }

        // Drop votes for now-invalid targets.
        let filtered: HashMap<PlayerId, String> = team_votes
            .into_iter()
            .filter(|(_, tid)| valid_candidates.iter().any(|c| c == tid))
            .collect();

        if filtered.is_empty() {
            return VotingResult::AcidRainSkippedNoTarget;
        }

        match determine_winner(&valid_candidates, &filtered, self.seed, &valid_candidates) {
            Some(team_id) => VotingResult::TargetSelected { team_id },
            None => VotingResult::AcidRainSkippedNoTarget,
        }
    }
}

// ---------------------------------------------------------------------------
// Apply helpers (defensive second check for acid_rain)
// ---------------------------------------------------------------------------

/// Whether a resolved power-up option may be applied without a target vote.
pub fn powerup_requires_target(option_id: &str) -> bool {
    option_id == OPTION_ACID_RAIN
}

/// Defensive gate: never apply acid_rain without an explicit target team id.
pub fn can_apply_acid_rain(target_team_id: Option<&str>) -> bool {
    target_team_id.map(|t| !t.is_empty()).unwrap_or(false)
}

/// After a successful acid_rain apply, record attacker on the victim team state field.
pub fn record_attack(
    previous_attacker_by_team: &mut HashMap<TeamId, Option<TeamId>>,
    victim_team_id: &str,
    attacker_team_id: &str,
) {
    previous_attacker_by_team.insert(
        victim_team_id.to_string(),
        Some(attacker_team_id.to_string()),
    );
}

#[cfg(test)]
#[path = "votes_tests.rs"]
mod tests;
