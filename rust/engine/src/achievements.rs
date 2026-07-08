// achievements.rs — Registry, config merge, and helpers.
// Verbatim port of packages/common/src/achievements.ts + http/achievements.rs
// BONUS_MAX=5000, default bonus=0 ensures byte-identical scoring without overrides.

use serde_json::{json, Map, Value};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct MergedAchievement {
    pub id: String,
    pub tier: String,
    pub enabled: bool,
    pub threshold: Option<f64>,
    pub bonus: i32,
}

pub const BONUS_MAX: i32 = 5000;

// Registry: 14 achievements with their tier and threshold config (default, min, max).
// This is the shipped default state; overrides from DB will clamp to these bounds.
struct ThresholdDef {
    default: f64,
    min: f64,
    max: f64,
}

const fn t(default: f64, min: f64, max: f64) -> Option<ThresholdDef> {
    Some(ThresholdDef { default, min, max })
}

struct RegistryEntry {
    id: &'static str,
    tier: &'static str,
    threshold: Option<ThresholdDef>,
}

static ACHIEVEMENTS_REGISTRY: &[RegistryEntry] = &[
    // Bronze
    RegistryEntry { id: "first_correct", tier: "bronze", threshold: None },
    RegistryEntry { id: "participation", tier: "bronze", threshold: None },
    RegistryEntry { id: "lucky_guess", tier: "bronze", threshold: t(5.0, 1.0, 50.0) },
    // Silver
    RegistryEntry { id: "speed_demon", tier: "silver", threshold: t(1000.0, 200.0, 5000.0) },
    RegistryEntry { id: "streak_3", tier: "silver", threshold: t(3.0, 2.0, 20.0) },
    RegistryEntry { id: "sharpshooter", tier: "silver", threshold: t(95.0, 50.0, 100.0) },
    RegistryEntry { id: "climber", tier: "silver", threshold: t(3.0, 1.0, 20.0) },
    // Gold
    RegistryEntry { id: "first_responder", tier: "gold", threshold: None },
    RegistryEntry { id: "streak_5", tier: "gold", threshold: t(5.0, 2.0, 30.0) },
    RegistryEntry { id: "underdog", tier: "gold", threshold: t(2000.0, 100.0, 100000.0) },
    RegistryEntry { id: "perfect_round", tier: "gold", threshold: t(5.0, 2.0, 30.0) },
    // Diamant
    RegistryEntry { id: "streak_10", tier: "diamant", threshold: t(10.0, 2.0, 50.0) },
    RegistryEntry { id: "speedy_gonzales", tier: "diamant", threshold: t(400.0, 100.0, 2000.0) },
    RegistryEntry { id: "perfect_game", tier: "diamant", threshold: None },
];

/// Merge configuration: threshold clamped to [min, max], bonus clamped to [0, BONUS_MAX].
/// Default bonus is 0 so unset configs leave scoring byte-identical.
pub fn merge_config(overrides: &Map<String, Value>) -> HashMap<String, MergedAchievement> {
    let mut result = HashMap::new();

    for entry in ACHIEVEMENTS_REGISTRY {
        let o = overrides
            .get(entry.id)
            .and_then(|v| v.as_object());

        let enabled = o
            .and_then(|m| m.get("enabled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let threshold = match &entry.threshold {
            Some(def) => {
                let raw = o
                    .and_then(|m| m.get("threshold"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(def.default);
                Some(raw.clamp(def.min, def.max))
            }
            None => None,
        };

        let bonus = o
            .and_then(|m| m.get("bonus"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
            .clamp(0.0, BONUS_MAX as f64) as i32;

        result.insert(
            entry.id.to_string(),
            MergedAchievement {
                id: entry.id.to_string(),
                tier: entry.tier.to_string(),
                enabled,
                threshold,
                bonus,
            },
        );
    }

    result
}

/// Default config: all 14 achievements with factory settings (no overrides).
pub fn default_config() -> HashMap<String, MergedAchievement> {
    merge_config(&Map::new())
}

/// Check if an achievement is enabled in the config.
pub fn enabled(cfg: &HashMap<String, MergedAchievement>, id: &str) -> bool {
    cfg.get(id).map(|a| a.enabled).unwrap_or(true)
}

/// Get the threshold for an achievement, with a fallback default.
pub fn threshold(cfg: &HashMap<String, MergedAchievement>, id: &str, default: f64) -> f64 {
    cfg.get(id)
        .and_then(|a| a.threshold)
        .unwrap_or(default)
}

/// Get the bonus points for an achievement.
pub fn bonus(cfg: &HashMap<String, MergedAchievement>, id: &str) -> i32 {
    cfg.get(id).map(|a| a.bonus).unwrap_or(0)
}

/// Convert DB rows (with inner "id" field) to an override map keyed by id.
/// Mirrors http/achievements.rs rows_to_overrides.
pub fn rows_to_overrides(rows: &[Value]) -> Map<String, Value> {
    let mut overrides = Map::new();
    for row in rows {
        if let Some(id) = row.get("id").and_then(|v| v.as_str()) {
            overrides.insert(id.to_string(), row.clone());
        }
    }
    overrides
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config_all_14_achievements() {
        let cfg = default_config();
        assert_eq!(cfg.len(), 14);

        // Check all IDs exist with expected tiers
        assert_eq!(cfg["first_correct"].tier, "bronze");
        assert_eq!(cfg["participation"].tier, "bronze");
        assert_eq!(cfg["lucky_guess"].tier, "bronze");
        assert_eq!(cfg["speed_demon"].tier, "silver");
        assert_eq!(cfg["streak_3"].tier, "silver");
        assert_eq!(cfg["sharpshooter"].tier, "silver");
        assert_eq!(cfg["climber"].tier, "silver");
        assert_eq!(cfg["first_responder"].tier, "gold");
        assert_eq!(cfg["streak_5"].tier, "gold");
        assert_eq!(cfg["underdog"].tier, "gold");
        assert_eq!(cfg["perfect_round"].tier, "gold");
        assert_eq!(cfg["streak_10"].tier, "diamant");
        assert_eq!(cfg["speedy_gonzales"].tier, "diamant");
        assert_eq!(cfg["perfect_game"].tier, "diamant");

        // Default config should have all enabled, bonus 0
        for ach in cfg.values() {
            assert!(ach.enabled);
            assert_eq!(ach.bonus, 0);
        }

        // Check threshold defaults
        assert_eq!(threshold(&cfg, "lucky_guess", 5.0), 5.0);
        assert_eq!(threshold(&cfg, "speed_demon", 1000.0), 1000.0);
        assert_eq!(threshold(&cfg, "streak_3", 3.0), 3.0);
        assert_eq!(threshold(&cfg, "underdog", 2000.0), 2000.0);
        assert_eq!(threshold(&cfg, "first_correct", 999.0), 999.0); // no threshold
    }

    #[test]
    fn test_threshold_clamping() {
        let mut overrides = Map::new();
        let mut lucky = Map::new();
        lucky.insert("threshold".to_string(), json!(100.0)); // exceeds max 50
        overrides.insert("lucky_guess".to_string(), json!(lucky));

        let cfg = merge_config(&overrides);
        assert_eq!(threshold(&cfg, "lucky_guess", 5.0), 50.0); // clamped to max
    }

    #[test]
    fn test_bonus_clamping_and_default_zero() {
        let mut overrides = Map::new();
        let mut first = Map::new();
        first.insert("bonus".to_string(), json!(10000.0)); // exceeds max 5000
        overrides.insert("first_correct".to_string(), json!(first));

        let cfg = merge_config(&overrides);
        assert_eq!(bonus(&cfg, "first_correct"), 5000); // clamped to BONUS_MAX

        // Without override, bonus should be 0 (byte-identical scoring)
        let cfg_default = default_config();
        assert_eq!(bonus(&cfg_default, "first_correct"), 0);
    }

    #[test]
    fn test_enabled_override() {
        let mut overrides = Map::new();
        let mut first = Map::new();
        first.insert("enabled".to_string(), json!(false));
        overrides.insert("first_correct".to_string(), json!(first));

        let cfg = merge_config(&overrides);
        assert!(!cfg["first_correct"].enabled);
        assert!(cfg["participation"].enabled); // unmodified
    }
}
