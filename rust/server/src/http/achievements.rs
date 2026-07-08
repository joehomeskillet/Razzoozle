// http/achievements.rs — GET /api/achievements (public, no auth).
//
// Parity source (Node): services/http-routes.ts "/api/achievements" →
// { achievements: getMergedAchievements() } where getMergedAchievements()
// (services/config/achievements.ts) loads the per-id override record and
// merges it over the hardcoded registry via mergeAchievementsConfig()
// (packages/common/src/achievements.ts).
//
// Override substrate (orchestrator ruling): DB via AppState.db_pool →
// crate::db::get_achievements when a pool is configured; file fallback
// (config/achievements.json, Node validator semantics) when pool is None.
// Either way the response is the MERGED registry list — reads never throw,
// a missing/corrupt/invalid source yields the shipped registry defaults.

use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};

use super::{get_config_path, AppState};

// ── Registry (verbatim port of common/achievements.ts ACHIEVEMENTS_REGISTRY) ─

struct ThresholdDef {
    default: f64,
    min: f64,
    max: f64,
}

struct RegistryEntry {
    id: &'static str,
    tier: &'static str,
    threshold: Option<ThresholdDef>,
}

const fn t(default: f64, min: f64, max: f64) -> Option<ThresholdDef> {
    Some(ThresholdDef { default, min, max })
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

/// Upper clamp for the per-badge bonus points (common/achievements.ts BONUS_MAX).
const BONUS_MAX: f64 = 5000.0;

/// Emit a JSON number without a spurious ".0" so integral values serialize
/// exactly like Node (5, not 5.0); genuine floats stay floats.
fn json_num(v: f64) -> Value {
    if v.fract() == 0.0 && v.abs() <= i64::MAX as f64 {
        json!(v as i64)
    } else {
        json!(v)
    }
}

// ── Merge (verbatim port of common/achievements.ts mergeAchievementsConfig) ─

fn merge_achievements_config(overrides: &serde_json::Map<String, Value>) -> Vec<Value> {
    ACHIEVEMENTS_REGISTRY
        .iter()
        .map(|entry| {
            let o = overrides.get(entry.id).and_then(|v| v.as_object());

            let enabled = o
                .and_then(|m| m.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let name = o.and_then(|m| m.get("name")).and_then(|v| v.as_str());
            let description = o
                .and_then(|m| m.get("description"))
                .and_then(|v| v.as_str());

            let threshold: Value = match &entry.threshold {
                Some(def) => {
                    let raw = o
                        .and_then(|m| m.get("threshold"))
                        .and_then(|v| v.as_f64())
                        .unwrap_or(def.default);
                    json_num(raw.clamp(def.min, def.max))
                }
                None => Value::Null,
            };

            // Registry carries no per-id bonus → resolves to 0 when unset.
            // Clamped to [0, BONUS_MAX] (Node keeps this a UI-set value only).
            let bonus = o
                .and_then(|m| m.get("bonus"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0)
                .clamp(0.0, BONUS_MAX);

            json!({
                "id": entry.id,
                "tier": entry.tier,
                "enabled": enabled,
                "name": name,
                "description": description,
                "threshold": threshold,
                "bonus": json_num(bonus),
            })
        })
        .collect()
}

// ── File fallback (Node getAchievementsConfig semantics) ────────────────────

/// zod achievementsConfigValidator port: record of id → object with optional
/// typed fields (enabled: bool, name: string ≤60, description: string ≤200,
/// threshold: number, bonus: integer 0..=5000). Unknown inner keys are ignored
/// (zod strips them); ANY type/bound violation rejects the WHOLE config →
/// registry defaults, exactly like Node's safeParse-else-{} behaviour.
fn validate_config(map: &serde_json::Map<String, Value>) -> bool {
    map.values().all(|entry| {
        let Some(obj) = entry.as_object() else {
            return false;
        };
        obj.iter().all(|(k, v)| match k.as_str() {
            "enabled" => v.is_boolean(),
            "name" => v.as_str().map(|s| s.chars().count() <= 60).unwrap_or(false),
            "description" => v.as_str().map(|s| s.chars().count() <= 200).unwrap_or(false),
            "threshold" => v.is_number(),
            "bonus" => v
                .as_f64()
                .map(|f| f.fract() == 0.0 && (0.0..=BONUS_MAX).contains(&f))
                .unwrap_or(false),
            _ => true, // unknown keys are stripped by zod, not an error
        })
    })
}

fn load_file_overrides() -> serde_json::Map<String, Value> {
    let path = format!("{}/achievements.json", get_config_path());

    let raw = match std::fs::read_to_string(&path) {
        Ok(r) => r,
        Err(_) => return serde_json::Map::new(), // missing file → defaults
    };

    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Failed to read achievements config: {}", e);
            return serde_json::Map::new();
        }
    };

    match parsed {
        Value::Object(map) if validate_config(&map) => map,
        _ => {
            eprintln!("Invalid achievements.json, using defaults");
            serde_json::Map::new()
        }
    }
}

// ── Handler ──────────────────────────────────────────────────────────────────

/// DB rows from crate::db::get_achievements carry the id INSIDE each object
/// ({id, enabled?, name?, description?, threshold?}); re-key them by id so
/// they slot into the same merge as the file record. The redundant inner "id"
/// key is harmless — the merge only reads the known override fields.
fn rows_to_overrides(rows: Vec<Value>) -> serde_json::Map<String, Value> {
    let mut overrides = serde_json::Map::new();
    for row in rows {
        if let Some(id) = row.get("id").and_then(|v| v.as_str()) {
            overrides.insert(id.to_string(), row.clone());
        }
    }
    overrides
}

pub async fn handle_achievements(State(state): State<AppState>) -> Json<Value> {
    let overrides = if state.db_pool.is_some() {
        rows_to_overrides(crate::db::get_achievements(&state.db_pool).await)
    } else {
        load_file_overrides()
    };

    Json(json!({ "achievements": merge_achievements_config(&overrides) }))
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_with_no_overrides_yields_registry_defaults() {
        let merged = merge_achievements_config(&serde_json::Map::new());
        assert_eq!(merged.len(), 14);

        let first = &merged[0];
        assert_eq!(first["id"], "first_correct");
        assert_eq!(first["tier"], "bronze");
        assert_eq!(first["enabled"], true);
        assert_eq!(first["name"], Value::Null);
        assert_eq!(first["description"], Value::Null);
        assert_eq!(first["threshold"], Value::Null);
        assert_eq!(first["bonus"], 0);

        let lucky = merged.iter().find(|a| a["id"] == "lucky_guess").unwrap();
        assert_eq!(lucky["threshold"], 5); // integer, not 5.0
    }

    #[test]
    fn merge_applies_overrides_and_clamps() {
        let mut overrides = serde_json::Map::new();
        overrides.insert(
            "lucky_guess".to_string(),
            json!({ "enabled": false, "name": "Glückspilz", "threshold": 999, "bonus": 99999 }),
        );
        let merged = merge_achievements_config(&overrides);
        let lucky = merged.iter().find(|a| a["id"] == "lucky_guess").unwrap();
        assert_eq!(lucky["enabled"], false);
        assert_eq!(lucky["name"], "Glückspilz");
        assert_eq!(lucky["threshold"], 50); // clamped to registry max
        assert_eq!(lucky["bonus"], 5000); // clamped to BONUS_MAX
    }

    #[test]
    fn merge_ignores_unknown_override_ids() {
        let mut overrides = serde_json::Map::new();
        overrides.insert("not_a_real_badge".to_string(), json!({ "enabled": false }));
        let merged = merge_achievements_config(&overrides);
        assert_eq!(merged.len(), 14);
        assert!(merged.iter().all(|a| a["id"] != "not_a_real_badge"));
    }

    #[test]
    fn validate_rejects_bad_types_and_accepts_unknown_keys() {
        let good: serde_json::Map<String, Value> =
            serde_json::from_value(json!({ "lucky_guess": { "enabled": true, "extra": 1 } }))
                .unwrap();
        assert!(validate_config(&good));

        let bad_type: serde_json::Map<String, Value> =
            serde_json::from_value(json!({ "lucky_guess": { "enabled": "yes" } })).unwrap();
        assert!(!validate_config(&bad_type));

        let bad_bonus: serde_json::Map<String, Value> =
            serde_json::from_value(json!({ "lucky_guess": { "bonus": -1 } })).unwrap();
        assert!(!validate_config(&bad_bonus));

        let non_object: serde_json::Map<String, Value> =
            serde_json::from_value(json!({ "lucky_guess": 5 })).unwrap();
        assert!(!validate_config(&non_object));
    }

    #[test]
    fn rows_to_overrides_rekeys_by_id() {
        let rows = vec![json!({ "id": "streak_3", "enabled": false })];
        let overrides = rows_to_overrides(rows);
        let merged = merge_achievements_config(&overrides);
        let streak = merged.iter().find(|a| a["id"] == "streak_3").unwrap();
        assert_eq!(streak["enabled"], false);
    }
}
