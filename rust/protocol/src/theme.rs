//! theme.rs — OWNS: Theme, ThemeTemplate, ThemeRevision, and all
//! MANAGER theme payloads (manager:getTheme/theme/setTheme/setThemeSuccess,
//! manager:uploadBackground/backgroundUploaded, manager:uploadSound/
//! soundUploaded, manager:setSkeletonAsset*, manager:resetSkeleton*,
//! manager:themeError) + THEME_TEMPLATE (themeTemplate:*) +
//! THEME_REVISION (themeRevision:*) payloads.
//!
// filled by WP-theme

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Animated background type for a theme slot (auth, managerGame, playerGame).
/// "none" disables animation; "creamBackdrop" enables the cream-colored floating-icon effect.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum AnimatedBackgroundType {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "creamBackdrop")]
    CreamBackdrop,
}

/// Per-slot animated background configuration (applied to auth, managerGame, playerGame).
/// Defaults reproduce the current look (CreamBackdrop, full speed/intensity, 12 icons).
/// This is a visual no-op until the manager UI changes it.
///
/// Sent/received in: Theme.backgrounds.animated.*
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AnimatedBackgroundConfig {
    /// Animation style: "none" or "creamBackdrop"
    pub r#type: AnimatedBackgroundType,
    /// Animation speed multiplier; valid range 0.25–3.0 (default 1.0)
    pub speed: f64,
    /// Visual opacity multiplier; valid range 0.0–1.0 (default 1.0)
    pub intensity: f64,
    /// Number of floating icons; valid range 0–12 (default 12)
    pub icon_count: u32,
    /// Hex color tint for backdrop; empty string "" means use theme-derived color
    pub color: String,
}

/// Background image and animation config for all three display slots.
/// - auth: Start/join/manager-login/result screens
/// - managerGame: Host's big presentation screen during a game
/// - playerGame: Player's in-game screen (phone)
/// - animatedCss: Generated CSS for the animated backdrop (readonly, server-computed)
///
/// Sent/received in: Theme.backgrounds
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ThemeBackgrounds {
    /// Background image path for auth screens (null = none)
    
    pub auth: Option<String>,
    /// Background image path for manager game screen (null = none)
    
    pub manager_game: Option<String>,
    /// Background image path for player game screen (null = none)
    
    pub player_game: Option<String>,
    /// Animated background configs per slot
    pub animated: AnimatedBackgroundsConfig,
    /// Generated CSS for the animated backdrop (readonly)
    pub animated_css: String,
}

/// Animated background configs for the three display slots.
///
/// Sent/received in: Theme.backgrounds.animated
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AnimatedBackgroundsConfig {
    /// Animated config for auth screens
    pub auth: AnimatedBackgroundConfig,
    /// Animated config for manager game screen
    pub manager_game: AnimatedBackgroundConfig,
    /// Animated config for player game screen
    pub player_game: AnimatedBackgroundConfig,
}

/// Color palette for team backgrounds (Red, Blue, Green, Yellow).
/// Used when a player selects a team during gameplay.
///
/// Sent/received in: Theme.teamColors
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct TeamColors {
    /// Hex color for the Red team
    pub red: String,
    /// Hex color for the Blue team
    pub blue: String,
    /// Hex color for the Green team
    pub green: String,
    /// Hex color for the Yellow team
    pub yellow: String,
}

/// Color palette for achievement tier badges (Bronze, Silver, Gold, Diamant).
/// Used to visually distinguish achievement rarity.
///
/// Sent/received in: Theme.tierColors
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct TierColors {
    /// Hex color for Bronze-tier achievements
    pub bronze: String,
    /// Hex color for Silver-tier achievements
    pub silver: String,
    /// Hex color for Gold-tier achievements
    pub gold: String,
    /// Hex color for Diamant-tier achievements
    pub diamant: String,
}

/// Color palette for answer state feedback (correct/wrong).
/// Used to color answer buttons and feedback messages.
///
/// Sent/received in: Theme.stateColors
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct StateColors {
    /// Hex color for correct answers
    pub correct: String,
    /// Hex color for wrong answers
    pub wrong: String,
}

/// Color palette for rank change feedback (up/down).
/// Used when a player's rank moves up or down on the leaderboard.
///
/// Sent/received in: Theme.rankColors
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct RankColors {
    /// Hex color for rank improvement (moved up)
    pub up: String,
    /// Hex color for rank decline (moved down)
    pub down: String,
}

/// Color palette for footer area (background and text).
/// Used for result screen and other footer elements.
///
/// Sent/received in: Theme.footerColors
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FooterColors {
    /// Hex color for footer background
    pub bg: String,
    /// Hex color for footer text
    pub text: String,
}

/// Spring-physics animation config for motion transitions.
/// Defaults mirror presets.ts SPRING (stiffness=300, damping=24) and scale 1.0
/// so an absent/old theme.json stays a visual no-op.
///
/// Sent/received in: Theme.animation
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AnimationConfig {
    /// Spring stiffness (determines snappiness); valid range 50–1000 (default 300)
    pub spring_stiffness: f64,
    /// Spring damping (reduces oscillation); valid range 5–60 (default 24)
    pub spring_damping: f64,
    /// Global duration scale for animations; valid range 0.25–3.0 (default 1.0)
    pub duration_scale: f64,
    /// Stagger delay scale for sequential animations; valid range 0.0–3.0 (default 1.0)
    pub stagger_scale: f64,
}

/// Sound slot overrides. Each slot maps to a bundled default mp3 under /sounds/;
/// a theme may override a slot with a served asset ref. A null override means
/// playback falls back to the bundled default, so an absent/old theme.json stays
/// an audio no-op.
///
/// Sent/received in: Theme.sounds
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SoundsConfig {
    /// Background music for answer selection phase

    pub answers_music: Option<String>,
    /// Sound effect when an answer is selected

    pub answers_sound: Option<String>,
    /// Sound for 3rd place podium finish

    pub podium_three: Option<String>,
    /// Sound for 2nd place podium finish

    pub podium_second: Option<String>,
    /// Sound for 1st place podium finish

    pub podium_first: Option<String>,
    /// Sound for podium snare roll (roll-up effect)

    pub podium_snear_roll: Option<String>,
    /// Sound effect at results screen entry

    pub results: Option<String>,
    /// Sound effect for question reveal

    pub show: Option<String>,
    /// Notification "boump" sound (e.g., player join)

    pub boump: Option<String>,
    /// Sound for unlocking a Bronze-tier achievement

    pub tier_bronze: Option<String>,
    /// Sound for unlocking a Silver-tier achievement

    pub tier_silver: Option<String>,
    /// Sound for unlocking a Gold-tier achievement

    pub tier_gold: Option<String>,
    /// Sound for unlocking a Diamant-tier achievement

    pub tier_diamant: Option<String>,
}

/// The complete theme configuration for the application.
/// Persisted as config/theme.json and sent on manager:theme and game:status updates.
/// A single source of truth is the zod validator; a parsed/persisted theme IS a Theme.
///
/// Sent/received in: manager:theme, manager:setTheme, manager:setThemeSuccess,
/// themeTemplate:data (via ThemeTemplate), themeRevision:data (via ThemeRevision),
/// themeRevision:restoreSuccess
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    /// Visual style: "flat" or "glass"
    pub style: String,
    /// Primary brand color (hex)
    pub color_primary: String,
    /// Secondary brand color (hex)
    pub color_secondary: String,
    /// Text color (hex, default "#ffffff")
    pub color_text: String,
    /// Array of 4 hex colors for the four answer slots (A, B, C, D)
    pub answer_colors: [String; 4],
    /// Text color for answer buttons (hex, default "#0B0B12")
    pub answer_text_color: String,
    /// Accent color for highlights/borders (hex, default "#ff9900")
    pub accent_color: String,
    /// Border radius for cards/buttons (pixels, 0–40, default 16)
    pub radius: u32,
    /// Scrim opacity on images (0–100, default 0)
    pub scrim: u32,
    /// App title text (max 40 chars, can be null)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_title: Option<String>,
    /// Logo asset reference (path under /theme/ or /media/, can be null)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
    /// Whether to show branding in the UI (default true)
    pub show_branding: bool,
    /// Background images and animation configs for all display slots
    pub backgrounds: ThemeBackgrounds,
    /// Team colors (Red, Blue, Green, Yellow)
    pub team_colors: TeamColors,
    /// Achievement tier colors (Bronze, Silver, Gold, Diamant)
    pub tier_colors: TierColors,
    /// Answer state colors (correct, wrong)
    pub state_colors: StateColors,
    /// Rank change colors (up, down)
    pub rank_colors: RankColors,
    /// Hex color for timer urgency (when time is running out)
    pub timer_urgent: String,
    /// Hex color for streak counter badges
    pub streak_color: String,
    /// Hex color for muted surface elements
    pub surface_muted: String,
    /// Footer colors (background, text)
    pub footer_colors: FooterColors,
    /// Spring-physics animation config
    pub animation: AnimationConfig,
    /// Sound asset overrides per slot (null = use bundled default)
    pub sounds: SoundsConfig,
    /// Whether custom CSS skeleton is enabled (default false)
    pub custom_css_enabled: bool,
    /// Whether custom JS skeleton is enabled (default false)
    pub custom_js_enabled: bool,
    /// Cache-bust version for skeleton CSS/JS (incremented on edit, default 0)
    pub skeleton_version: u32,
}

/// A named, savable preset of a full Theme (stored one-per-file under
/// config/theme-templates/<id>.json). DATA on the wire carries the full template
/// so a picker can apply it without a second fetch.
///
/// Sent/received in: themeTemplate:data
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ThemeTemplate {
    /// Unique identifier for the template (server-assigned slug of name)
    pub id: String,
    /// Human-readable name of the template (max 60 chars)
    pub name: String,
    /// The full theme configuration
    pub theme: Theme,
}

/// Lightweight listing of a template ({id, name}) — used by the design-tab picker
/// and carried in ManagerConfig.themeTemplates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ThemeTemplateMeta {
    /// Unique identifier for the template
    pub id: String,
    /// Human-readable name of the template
    pub name: String,
}

/// A captured prior theme (WP-18 theme revision).
/// id is a timestamp-derived safe slug (e.g. `rev-${Date.now()}`);
/// createdAt is ISO timestamp. Used to enable undo/restore of theme changes.
///
/// Sent/received in: themeRevision:data, themeRevision:restoreSuccess
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ThemeRevision {
    /// Unique identifier (timestamp-derived safe slug, e.g. "rev-1719946800000")
    pub id: String,
    /// ISO 8601 timestamp when this revision was captured
    pub created_at: String,
    /// The full theme configuration at the time of capture
    pub theme: Theme,
}

/// Payload for manager:setSkeletonAsset and manager:setSkeletonAssetSuccess events.
/// kind: "css" or "js" — which skeleton file is being set/confirmed.
/// content: the full file text (on request); omitted in success response.
///
/// Sent/received in: manager:setSkeletonAsset, manager:setSkeletonAssetSuccess
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SetSkeletonAssetPayload {
    /// Type of asset: "css" or "js"
    pub kind: String,
    /// File content (only on set request, omitted in success response)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

/// Payload for manager:uploadBackground and manager:backgroundUploaded events.
/// slot: one of "auth", "managerGame", "playerGame", or "logo" (ThemeSlot).
/// dataUrl: base64-encoded image data (on upload request).
/// path: server-side path to the uploaded asset (in success response).
///
/// Sent/received in: manager:uploadBackground, manager:backgroundUploaded
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundUploadPayload {
    /// Background slot: "auth", "managerGame", "playerGame", or "logo"
    pub slot: String,
    /// Base64-encoded image data (on upload request only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
    /// Server asset path (in success response only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// Payload for manager:uploadSound and manager:soundUploaded events.
/// slot: one of the sound slot names (e.g., "answersMusic", "podiumFirst", etc.; SoundSlot).
/// dataUrl: base64-encoded audio data (on upload request).
/// assetRef: server-side asset reference (in success response).
///
/// Sent/received in: manager:uploadSound, manager:soundUploaded
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SoundUploadPayload {
    /// Sound slot (e.g., "answersMusic", "podiumFirst", "tierGold")
    pub slot: String,
    /// Base64-encoded audio data (on upload request only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
    /// Server asset reference path (in success response only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_ref: Option<String>,
}

/// Payload for themeRevision:restore request.
/// id: the revision ID to restore.
///
/// Sent/received in: themeRevision:restore
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct RestoreRevisionPayload {
    /// Revision ID to restore
    pub id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_animated_background_type_serialization() {
        let bg_type = AnimatedBackgroundType::CreamBackdrop;
        let json = serde_json::to_string(&bg_type).unwrap();
        assert_eq!(json, "\"creamBackdrop\"");

        let deserialized: AnimatedBackgroundType = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, AnimatedBackgroundType::CreamBackdrop);
    }

    #[test]
    fn test_animated_background_config_roundtrip() {
        let config = AnimatedBackgroundConfig {
            r#type: AnimatedBackgroundType::CreamBackdrop,
            speed: 1.5,
            intensity: 0.8,
            icon_count: 10,
            color: "#ffffff".to_string(),
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: AnimatedBackgroundConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config, deserialized);
    }

    #[test]
    fn test_theme_roundtrip() {
        let theme = Theme {
            style: "flat".to_string(),
            color_primary: "#7c3aed".to_string(),
            color_secondary: "#2e1065".to_string(),
            color_text: "#ffffff".to_string(),
            answer_colors: [
                "#E69F00".to_string(),
                "#56B4E9".to_string(),
                "#3DBFA0".to_string(),
                "#CC79A7".to_string(),
            ],
            answer_text_color: "#0B0B12".to_string(),
            accent_color: "#ff9900".to_string(),
            radius: 16,
            scrim: 0,
            app_title: None,
            logo: None,
            show_branding: true,
            backgrounds: ThemeBackgrounds {
                auth: None,
                manager_game: None,
                player_game: None,
                animated: AnimatedBackgroundsConfig {
                    auth: AnimatedBackgroundConfig {
                        r#type: AnimatedBackgroundType::CreamBackdrop,
                        speed: 1.0,
                        intensity: 1.0,
                        icon_count: 12,
                        color: String::new(),
                    },
                    manager_game: AnimatedBackgroundConfig {
                        r#type: AnimatedBackgroundType::CreamBackdrop,
                        speed: 1.0,
                        intensity: 1.0,
                        icon_count: 12,
                        color: String::new(),
                    },
                    player_game: AnimatedBackgroundConfig {
                        r#type: AnimatedBackgroundType::CreamBackdrop,
                        speed: 1.0,
                        intensity: 1.0,
                        icon_count: 12,
                        color: String::new(),
                    },
                },
                animated_css: String::new(),
            },
            team_colors: TeamColors {
                red: "#ef4444".to_string(),
                blue: "#3b82f6".to_string(),
                green: "#22c55e".to_string(),
                yellow: "#facc15".to_string(),
            },
            tier_colors: TierColors {
                bronze: "#b45309".to_string(),
                silver: "#9ca3af".to_string(),
                gold: "#eab308".to_string(),
                diamant: "#38bdf8".to_string(),
            },
            state_colors: StateColors {
                correct: "#22c55e".to_string(),
                wrong: "#ef4444".to_string(),
            },
            rank_colors: RankColors {
                up: "#10b981".to_string(),
                down: "#f43f5e".to_string(),
            },
            timer_urgent: "#ff3b30".to_string(),
            streak_color: "#b45309".to_string(),
            surface_muted: "#374151".to_string(),
            footer_colors: FooterColors {
                bg: "#ffffff".to_string(),
                text: "#1f2937".to_string(),
            },
            animation: AnimationConfig {
                spring_stiffness: 300.0,
                spring_damping: 24.0,
                duration_scale: 1.0,
                stagger_scale: 1.0,
            },
            sounds: SoundsConfig {
                answers_music: None,
                answers_sound: None,
                podium_three: None,
                podium_second: None,
                podium_first: None,
                podium_snear_roll: None,
                results: None,
                show: None,
                boump: None,
                tier_bronze: None,
                tier_silver: None,
                tier_gold: None,
                tier_diamant: None,
            },
            custom_css_enabled: false,
            custom_js_enabled: false,
            skeleton_version: 0,
        };

        let json = serde_json::to_string(&theme).unwrap();
        let deserialized: Theme = serde_json::from_str(&json).unwrap();
        assert_eq!(theme, deserialized);
        assert_eq!(theme.style, "flat");
        assert_eq!(theme.color_primary, "#7c3aed");
        assert_eq!(theme.radius, 16);
    }

    #[test]
    fn test_theme_template_roundtrip() {
        let template = ThemeTemplate {
            id: "classic-blue".to_string(),
            name: "Classic Blue".to_string(),
            theme: Theme {
                style: "flat".to_string(),
                color_primary: "#7c3aed".to_string(),
                color_secondary: "#2e1065".to_string(),
                color_text: "#ffffff".to_string(),
                answer_colors: [
                    "#E69F00".to_string(),
                    "#56B4E9".to_string(),
                    "#3DBFA0".to_string(),
                    "#CC79A7".to_string(),
                ],
                answer_text_color: "#0B0B12".to_string(),
                accent_color: "#ff9900".to_string(),
                radius: 16,
                scrim: 0,
                app_title: None,
                logo: None,
                show_branding: true,
                backgrounds: ThemeBackgrounds {
                    auth: None,
                    manager_game: None,
                    player_game: None,
                    animated: AnimatedBackgroundsConfig {
                        auth: AnimatedBackgroundConfig {
                            r#type: AnimatedBackgroundType::CreamBackdrop,
                            speed: 1.0,
                            intensity: 1.0,
                            icon_count: 12,
                            color: String::new(),
                        },
                        manager_game: AnimatedBackgroundConfig {
                            r#type: AnimatedBackgroundType::CreamBackdrop,
                            speed: 1.0,
                            intensity: 1.0,
                            icon_count: 12,
                            color: String::new(),
                        },
                        player_game: AnimatedBackgroundConfig {
                            r#type: AnimatedBackgroundType::CreamBackdrop,
                            speed: 1.0,
                            intensity: 1.0,
                            icon_count: 12,
                            color: String::new(),
                        },
                    },
                    animated_css: String::new(),
                },
                team_colors: TeamColors {
                    red: "#ef4444".to_string(),
                    blue: "#3b82f6".to_string(),
                    green: "#22c55e".to_string(),
                    yellow: "#facc15".to_string(),
                },
                tier_colors: TierColors {
                    bronze: "#b45309".to_string(),
                    silver: "#9ca3af".to_string(),
                    gold: "#eab308".to_string(),
                    diamant: "#38bdf8".to_string(),
                },
                state_colors: StateColors {
                    correct: "#22c55e".to_string(),
                    wrong: "#ef4444".to_string(),
                },
                rank_colors: RankColors {
                    up: "#10b981".to_string(),
                    down: "#f43f5e".to_string(),
                },
                timer_urgent: "#ff3b30".to_string(),
                streak_color: "#b45309".to_string(),
                surface_muted: "#374151".to_string(),
                footer_colors: FooterColors {
                    bg: "#ffffff".to_string(),
                    text: "#1f2937".to_string(),
                },
                animation: AnimationConfig {
                    spring_stiffness: 300.0,
                    spring_damping: 24.0,
                    duration_scale: 1.0,
                    stagger_scale: 1.0,
                },
                sounds: SoundsConfig {
                    answers_music: None,
                    answers_sound: None,
                    podium_three: None,
                    podium_second: None,
                    podium_first: None,
                    podium_snear_roll: None,
                    results: None,
                    show: None,
                    boump: None,
                    tier_bronze: None,
                    tier_silver: None,
                    tier_gold: None,
                    tier_diamant: None,
                },
                custom_css_enabled: false,
                custom_js_enabled: false,
                skeleton_version: 0,
            },
        };

        let json = serde_json::to_string(&template).unwrap();
        let deserialized: ThemeTemplate = serde_json::from_str(&json).unwrap();
        assert_eq!(template, deserialized);
        assert_eq!(template.id, "classic-blue");
        assert_eq!(template.name, "Classic Blue");
    }

    #[test]
    fn test_theme_revision_roundtrip() {
        let revision = ThemeRevision {
            id: "rev-1719946800000".to_string(),
            created_at: "2024-07-05T10:00:00Z".to_string(),
            theme: Theme {
                style: "flat".to_string(),
                color_primary: "#7c3aed".to_string(),
                color_secondary: "#2e1065".to_string(),
                color_text: "#ffffff".to_string(),
                answer_colors: [
                    "#E69F00".to_string(),
                    "#56B4E9".to_string(),
                    "#3DBFA0".to_string(),
                    "#CC79A7".to_string(),
                ],
                answer_text_color: "#0B0B12".to_string(),
                accent_color: "#ff9900".to_string(),
                radius: 16,
                scrim: 0,
                app_title: None,
                logo: None,
                show_branding: true,
                backgrounds: ThemeBackgrounds {
                    auth: None,
                    manager_game: None,
                    player_game: None,
                    animated: AnimatedBackgroundsConfig {
                        auth: AnimatedBackgroundConfig {
                            r#type: AnimatedBackgroundType::CreamBackdrop,
                            speed: 1.0,
                            intensity: 1.0,
                            icon_count: 12,
                            color: String::new(),
                        },
                        manager_game: AnimatedBackgroundConfig {
                            r#type: AnimatedBackgroundType::CreamBackdrop,
                            speed: 1.0,
                            intensity: 1.0,
                            icon_count: 12,
                            color: String::new(),
                        },
                        player_game: AnimatedBackgroundConfig {
                            r#type: AnimatedBackgroundType::CreamBackdrop,
                            speed: 1.0,
                            intensity: 1.0,
                            icon_count: 12,
                            color: String::new(),
                        },
                    },
                    animated_css: String::new(),
                },
                team_colors: TeamColors {
                    red: "#ef4444".to_string(),
                    blue: "#3b82f6".to_string(),
                    green: "#22c55e".to_string(),
                    yellow: "#facc15".to_string(),
                },
                tier_colors: TierColors {
                    bronze: "#b45309".to_string(),
                    silver: "#9ca3af".to_string(),
                    gold: "#eab308".to_string(),
                    diamant: "#38bdf8".to_string(),
                },
                state_colors: StateColors {
                    correct: "#22c55e".to_string(),
                    wrong: "#ef4444".to_string(),
                },
                rank_colors: RankColors {
                    up: "#10b981".to_string(),
                    down: "#f43f5e".to_string(),
                },
                timer_urgent: "#ff3b30".to_string(),
                streak_color: "#b45309".to_string(),
                surface_muted: "#374151".to_string(),
                footer_colors: FooterColors {
                    bg: "#ffffff".to_string(),
                    text: "#1f2937".to_string(),
                },
                animation: AnimationConfig {
                    spring_stiffness: 300.0,
                    spring_damping: 24.0,
                    duration_scale: 1.0,
                    stagger_scale: 1.0,
                },
                sounds: SoundsConfig {
                    answers_music: None,
                    answers_sound: None,
                    podium_three: None,
                    podium_second: None,
                    podium_first: None,
                    podium_snear_roll: None,
                    results: None,
                    show: None,
                    boump: None,
                    tier_bronze: None,
                    tier_silver: None,
                    tier_gold: None,
                    tier_diamant: None,
                },
                custom_css_enabled: false,
                custom_js_enabled: false,
                skeleton_version: 0,
            },
        };

        let json = serde_json::to_string(&revision).unwrap();
        let deserialized: ThemeRevision = serde_json::from_str(&json).unwrap();
        assert_eq!(revision, deserialized);
        assert_eq!(revision.id, "rev-1719946800000");
        assert_eq!(revision.created_at, "2024-07-05T10:00:00Z");
    }

    #[test]
    fn test_background_upload_payload_roundtrip() {
        let payload = BackgroundUploadPayload {
            slot: "auth".to_string(),
            data_url: Some("data:image/png;base64,iVBORw0KGgo...".to_string()),
            path: None,
        };

        let json = serde_json::to_string(&payload).unwrap();
        let deserialized: BackgroundUploadPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(payload, deserialized);
    }

    #[test]
    fn test_sound_upload_payload_roundtrip() {
        let payload = SoundUploadPayload {
            slot: "podiumFirst".to_string(),
            data_url: Some("data:audio/mp3;base64,//NExAA...".to_string()),
            asset_ref: None,
        };

        let json = serde_json::to_string(&payload).unwrap();
        let deserialized: SoundUploadPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(payload, deserialized);
    }
}
