use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    // Hex color pattern: #xxx or #xxxxxx (3 or 6 hex digits)
    static ref HEX_COLOR_REGEX: Regex = Regex::new(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$").unwrap();
    // Theme asset path pattern: /theme/{name}
    static ref THEME_PATH_REGEX: Regex = Regex::new(r"^/theme/[\w.-]+$").unwrap();
    // Segment pattern for media paths: [A-Za-z0-9_.-]+
    static ref SEGMENT_REGEX: Regex = Regex::new(r"^[A-Za-z0-9_.-]+$").unwrap();
}

/// Validate hex color format (3 or 6 hex digits)
fn is_valid_hex_color(color: &str) -> bool {
    HEX_COLOR_REGEX.is_match(color)
}

/// Validate asset path: must match /theme/{name} or /media/{segments}
/// Each segment must be non-empty, not ".", not "..", and match [A-Za-z0-9_.-]+
fn is_safe_asset_path(value: &str) -> bool {
    // Check /theme/{name} pattern
    if THEME_PATH_REGEX.is_match(value) {
        return true;
    }

    // Check /media/{segments} pattern
    if !value.starts_with("/media/") {
        return false;
    }

    value["/media/".len()..].split('/').all(|segment| {
        !segment.is_empty() && segment != "." && segment != ".." && SEGMENT_REGEX.is_match(segment)
    })
}

/// Validate the theme payload structure and field types
pub fn validate_theme(payload: &serde_json::Value) -> Result<(), String> {
    if !payload.is_object() {
        return Err("Theme must be an object".to_string());
    }

    let obj = payload.as_object().unwrap();

    // Validate style: must be "flat" or "glass" (optional, defaults to "flat")
    if let Some(style) = obj.get("style") {
        if let Some(s) = style.as_str() {
            if s != "flat" && s != "glass" {
                return Err("errors:theme.invalidStyle".to_string());
            }
        } else {
            return Err("errors:theme.invalidStyle".to_string());
        }
    }

    // Validate colorPrimary: hex color
    if let Some(color) = obj.get("colorPrimary") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    } else {
        return Err("errors:theme.missingColorPrimary".to_string());
    }

    // Validate colorSecondary: hex color
    if let Some(color) = obj.get("colorSecondary") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    } else {
        return Err("errors:theme.missingColorSecondary".to_string());
    }

    // Validate colorText: hex color (optional, has default)
    if let Some(color) = obj.get("colorText") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    }

    // Validate answerColors: 4-element array of hex colors
    if let Some(colors) = obj.get("answerColors") {
        if let Some(arr) = colors.as_array() {
            if arr.len() != 4 {
                return Err("errors:theme.invalidAnswerColors".to_string());
            }
            for (_i, color) in arr.iter().enumerate() {
                if let Some(c) = color.as_str() {
                    if !is_valid_hex_color(c) {
                        return Err("errors:theme.invalidColor".to_string());
                    }
                } else {
                    return Err("errors:theme.invalidColor".to_string());
                }
            }
        } else {
            return Err("errors:theme.invalidAnswerColors".to_string());
        }
    } else {
        return Err("errors:theme.missingAnswerColors".to_string());
    }

    // Validate answerTextColor: hex color (optional, has default)
    if let Some(color) = obj.get("answerTextColor") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    }

    // Validate accentColor: hex color (optional, has default)
    if let Some(color) = obj.get("accentColor") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    }

    // Validate radius: number 0-40 (optional, has default)
    if let Some(r) = obj.get("radius") {
        if let Some(num) = r.as_u64() {
            if num > 40 {
                return Err("errors:theme.invalidRadius".to_string());
            }
        } else {
            return Err("errors:theme.invalidRadius".to_string());
        }
    }

    // Validate scrim: number 0-100 (optional, has default)
    if let Some(s) = obj.get("scrim") {
        if let Some(num) = s.as_u64() {
            if num > 100 {
                return Err("errors:theme.invalidScrim".to_string());
            }
        } else {
            return Err("errors:theme.invalidScrim".to_string());
        }
    }

    // Validate appTitle: string or null (optional)
    if let Some(title) = obj.get("appTitle") {
        if !title.is_null() && !title.is_string() {
            return Err("errors:theme.invalidAppTitle".to_string());
        }
        if let Some(s) = title.as_str() {
            if s.len() > 40 {
                return Err("errors:theme.invalidAppTitle".to_string());
            }
        }
    }

    // Validate logo: string or null (optional), must be safe asset path if string
    if let Some(logo) = obj.get("logo") {
        if let Some(logo_str) = logo.as_str() {
            if !is_safe_asset_path(logo_str) {
                return Err("errors:theme.invalidAsset".to_string());
            }
        } else if !logo.is_null() {
            return Err("errors:theme.invalidLogo".to_string());
        }
    }

    // Validate showBranding: boolean (optional, has default)
    if let Some(show) = obj.get("showBranding") {
        if !show.is_boolean() {
            return Err("errors:theme.invalidShowBranding".to_string());
        }
    }

    // Validate backgrounds: object with optional auth, managerGame, playerGame fields
    if let Some(backgrounds) = obj.get("backgrounds") {
        if let Some(bg_obj) = backgrounds.as_object() {
            for (key, value) in bg_obj.iter() {
                if key != "auth" && key != "managerGame" && key != "playerGame" &&
                   key != "animated" && key != "animatedCss" {
                    // Unknown background field, but don't fail hard — just ignore
                    continue;
                }
                if key == "auth" || key == "managerGame" || key == "playerGame" {
                    if let Some(asset_str) = value.as_str() {
                        if !is_safe_asset_path(asset_str) {
                            return Err("errors:theme.invalidAsset".to_string());
                        }
                    } else if !value.is_null() {
                        return Err("errors:theme.invalidAsset".to_string());
                    }
                }
            }
        } else {
            return Err("errors:theme.invalidBackgrounds".to_string());
        }
    }

    Ok(())
}
